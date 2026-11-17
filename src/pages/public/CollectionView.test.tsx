import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import { NOINDEX_ATTR } from "@/hooks/useNoIndex";
import { SITE_NAME } from "@/hooks/useDocumentTitle";
import type { PublicCollectionDetail } from "@/lib/types";
import { err, installFakeApi, ok } from "@/test/fakeApi";
import CollectionView from "./CollectionView";

const API = "GET /public/collections/alice/lisbon";
const detail = (o: Partial<PublicCollectionDetail> = {}, c: Partial<PublicCollectionDetail["collection"]> = {}): PublicCollectionDetail => ({
  collection: {
    slug: "lisbon", title: "Lisbon in 3 days", description: "Trams, tiles\\nand pastéis.", coverUrl: "/api/public/media/abc", coverThumbUrl: "/api/public/media/abc/thumb",
    category: { slug: "travel", name: "Travel" }, creator: { username: "alice", displayName: "Alice" }, moduleCount: 2, pageCount: 3, ...c,
  },
  unlisted: false,
  modules: [
    { slug: "day-2", title: "Day two", position: 1, pages: [{ slug: "museums", title: "Museums", summary: "", position: 0 }] },
    { slug: "day-1", title: "Day one", position: 0, pages: [
      { slug: "tram", title: "Tram 28", summary: "", position: 1 },
      { slug: "arrival", title: "Arrival", summary: "Airport to Alfama", position: 0 },
    ] },
  ],
  ...o,
});

let loc = "";
function Spy() { loc = useLocation().pathname + useLocation().search; return null; }
function mount(qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } })) {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/@alice/lisbon"]}>
        <Routes>
          <Route path="/:handle/:collectionSlug" element={<><CollectionView username="alice" slug="lisbon" /><Spy /></>} />
          <Route path="/:handle/:collectionSlug/:moduleSlug/:pageSlug" element={<Spy />} />
          <Route path="/discover" element={<Spy />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const noindexTags = () => document.head.querySelectorAll(`meta[${NOINDEX_ATTR}]`);

beforeEach(() => { loc = ""; document.title = "Before"; });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("CollectionView", () => {
  it("renders the header: full cover, category link, title, description, plain-text byline and counts", async () => {
    installFakeApi({ [API]: () => ok(detail()) });
    mount();
    expect(await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" })).toBeInTheDocument();
    expect(screen.getByTestId("collection-cover")).toHaveAttribute("src", "/api/public/media/abc");   // the full cover, not the thumb
    expect(screen.getByRole("link", { name: "Travel" })).toHaveAttribute("href", "/discover?category=travel");
    expect(screen.getByText(/Trams, tiles/)).toBeInTheDocument();
    expect(screen.getByText("Alice").closest("a")).toBeNull();   // byline is plain text (Step 15 makes profiles real)
    expect(screen.getByText("2 modules · 3 pages")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover");
  });

  it("shows the published outline in reading order with module-qualified links", async () => {
    installFakeApi({ [API]: () => ok(detail()) });
    mount();
    const outline = await screen.findByRole("navigation", { name: "Collection contents" });
    expect(within(outline).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Day one", "Day two"]);
    expect(within(outline).getAllByRole("link").map((a) => a.getAttribute("href")))
      .toEqual(["/@alice/lisbon/day-1/arrival", "/@alice/lisbon/day-1/tram", "/@alice/lisbon/day-2/museums"]);
  });

  it("'Start reading' opens the first page in reading order", async () => {
    installFakeApi({ [API]: () => ok(detail()) });
    mount();
    const start = await screen.findByRole("link", { name: "Start reading" });
    expect(start).toHaveAttribute("href", "/@alice/lisbon/day-1/arrival");
    fireEvent.click(start);
    await waitFor(() => expect(loc).toBe("/@alice/lisbon/day-1/arrival"));
  });

  it("hides the category badge when there is no category, the cover when there is none or it is unsafe; username when no display name", async () => {
    installFakeApi({ [API]: () => ok(detail({}, { category: null, coverUrl: null, creator: { username: "alice", displayName: "" } })) });
    const { unmount } = mount();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("link", { name: "Travel" })).toBeNull();
    expect(screen.queryByTestId("collection-cover")).toBeNull();
    expect(screen.getByText("alice")).toBeInTheDocument();
    unmount();
    installFakeApi({ [API]: () => ok(detail({}, { coverUrl: "javascript:alert(1)" })) });
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByTestId("collection-cover")).toBeNull();
  });

  it("document title: loading → site name; success → 'title · site'", async () => {
    let release: () => void = () => {};
    installFakeApi({ [API]: () => new Promise((r) => { release = () => r({ status: 200, body: detail() }); }) });
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading collection...");
    expect(document.title).toBe(SITE_NAME);
    release();
    await screen.findByRole("heading", { level: 1 });
    expect(document.title).toBe(`Lisbon in 3 days · ${SITE_NAME}`);
  });

  it("404 → the neutral not-available screen, title 'Not available · site', requested once (no retry)", async () => {
    const fake = installFakeApi({ [API]: () => err(404, "Not found") });
    mount();
    expect(await screen.findByRole("heading", { name: "This collection isn't available" })).toBeInTheDocument();
    expect(document.title).toBe(`Not available · ${SITE_NAME}`);
    expect(document.title).not.toContain("Lisbon");
    expect(fake.sent("GET", "/public/collections/alice/lisbon")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: "Start reading" })).toBeNull();
  });

  it("other errors → error state with a working retry, title is just the site name", async () => {
    let fail = true;
    installFakeApi({ [API]: () => (fail ? err(503, "Service unavailable") : ok(detail())) });
    mount();
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent("Service unavailable");
    expect(document.title).toBe(SITE_NAME);
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" })).toBeInTheDocument();
  });

  it("unlisted adds noindex (removed on leaving); listed does not; no Unlisted label is shown", async () => {
    installFakeApi({ [API]: () => ok(detail({ unlisted: true })) });
    const { unmount } = mount();
    await screen.findByRole("heading", { level: 1 });
    expect(noindexTags()).toHaveLength(1);
    expect(screen.queryByText(/unlisted/i)).toBeNull();
    unmount();
    expect(noindexTags()).toHaveLength(0);
    installFakeApi({ [API]: () => ok(detail({ unlisted: false })) });
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(noindexTags()).toHaveLength(0);
  });

  it("a defensive empty outline shows the neutral no-content message and no 'Start reading'", async () => {
    installFakeApi({ [API]: () => ok(detail({ modules: [] })) });
    mount();
    expect(await screen.findByText("No content is available to display.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start reading" })).toBeNull();
  });

  it("sends no Authorization header even with a stored token", async () => {
    tokenStore.set("expired-token");
    const fake = installFakeApi({ [API]: (req) => (req.headers.Authorization ? err(401, "expired") : ok(detail())) });
    mount();
    await screen.findByRole("heading", { level: 1 });
    expect(fake.calls.every((c) => !("Authorization" in c.headers))).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Stale cache (review of 14b): React Query hands over data cached on an earlier visit at once and revalidates it in the
// background (staleTime 0). The collection may have been unpublished or deleted since, so that cached content must not be
// shown until the server confirms it.
// ---------------------------------------------------------------------------------------------------------------------
describe("CollectionView with previously cached data", () => {
  const KEY = ["public", "collection", "alice", "lisbon"];
  /** A client whose cache holds `cached` from a visit a minute ago, exactly as the earlier successful response left it. */
  const cachedClient = (cached: PublicCollectionDetail) => {
    const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
    qc.setQueryData(KEY, cached, { updatedAt: Date.now() - 60_000 });
    return qc;
  };
  /** The revalidation request, held open until the test answers it. */
  const held = () => {
    let answer: (r: { status: number; body?: unknown }) => void = () => {};
    const fake = installFakeApi({ [API]: () => new Promise((r) => { answer = r; }) });
    return { fake, answer: (r: { status: number; body?: unknown }) => answer(r) };
  };
  const STALE = detail({}, { title: "Old cached title", description: "Old cached description", coverUrl: "/api/public/media/old-cover" });
  const expectNothingStale = () => {
    expect(screen.queryByText("Old cached title")).toBeNull();
    expect(screen.queryByText("Old cached description")).toBeNull();
    expect(screen.queryByTestId("collection-cover")).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Collection contents" })).toBeNull();
    expect(screen.queryByText("Arrival")).toBeNull();
    expect(screen.queryByRole("link", { name: "Start reading" })).toBeNull();
  };

  it("does not show the cached title, description, cover or outline while revalidating; a 404 then shows the neutral screen", async () => {
    const { fake, answer } = held();
    mount(cachedClient(STALE));
    await waitFor(() => expect(fake.sent("GET", "/public/collections/alice/lisbon")).toHaveLength(1));   // revalidation in flight
    expect(screen.getByRole("status")).toHaveTextContent("Loading collection...");
    expectNothingStale();
    expect(document.title).toBe(SITE_NAME);                       // not the cached title either
    answer({ status: 404, body: { error: "Not found" } });
    expect(await screen.findByRole("heading", { name: "This collection isn't available" })).toBeInTheDocument();
    expectNothingStale();
    expect(document.title).toBe(`Not available · ${SITE_NAME}`);
  });

  it("a cached UNLISTED collection: no noindex from stale data while revalidating, none after the 404, nothing stale shown", async () => {
    const { answer } = held();
    mount(cachedClient({ ...STALE, unlisted: true }));
    await screen.findByRole("status");
    expect(noindexTags()).toHaveLength(0);
    answer({ status: 404, body: { error: "Not found" } });
    await screen.findByTestId("not-available");
    expect(noindexTags()).toHaveLength(0);
    expectNothingStale();
  });

  it("an unlisted collection that becomes unavailable while open loses its noindex tag (refetch → 404)", async () => {
    let gone = false;
    installFakeApi({ [API]: () => (gone ? err(404, "Not found") : ok(detail({ unlisted: true }))) });
    const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
    mount(qc);
    await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" });
    expect(noindexTags()).toHaveLength(1);
    gone = true;
    await qc.refetchQueries({ queryKey: KEY });   // e.g. a window-focus refetch
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(noindexTags()).toHaveLength(0);
    expect(screen.queryByText("Lisbon in 3 days")).toBeNull();
    expect(document.title).toBe(`Not available · ${SITE_NAME}`);
  });

  it("a successful revalidation shows the current collection, not the cached one", async () => {
    const { answer } = held();
    mount(cachedClient(STALE));
    await screen.findByRole("status");
    expectNothingStale();
    answer({ status: 200, body: detail() });
    expect(await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" })).toBeInTheDocument();
    expect(screen.getByTestId("collection-cover")).toHaveAttribute("src", "/api/public/media/abc");
    expect(screen.getByRole("link", { name: "Start reading" })).toBeInTheDocument();
    expect(screen.queryByText("Old cached title")).toBeNull();
    expect(document.title).toBe(`Lisbon in 3 days · ${SITE_NAME}`);
  });

  it("a revalidation that fails with another error shows the error state, never the cached content", async () => {
    installFakeApi({ [API]: () => err(503, "Service unavailable") });
    mount(cachedClient(STALE));
    // the hook retries a 5xx twice; the cached content stays hidden throughout and after
    await waitFor(() => expectNothingStale());
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Service unavailable");
    expectNothingStale();
    expect(document.title).toBe(SITE_NAME);
  });

  it("switching between collections in the same component instance doesn't trust data cached earlier in the visit", async () => {
    // the real route adapter reuses CollectionView across /@alice/lisbon → /@alice/porto → /@alice/lisbon
    function Adapter() { const { collectionSlug } = useParams(); return <CollectionView username="alice" slug={collectionSlug!} />; }
    function Nav() { const go = useNavigate(); return <><button onClick={() => go("/@alice/porto")}>to porto</button><button onClick={() => go("/@alice/lisbon")}>to lisbon</button></>; }
    let lisbonGone = false;
    let answerSecondLisbon: (r: { status: number; body?: unknown }) => void = () => {};
    installFakeApi({
      [API]: () => (lisbonGone ? new Promise((r) => { answerSecondLisbon = r; }) : ok(detail())),
      "GET /public/collections/alice/porto": () => ok(detail({}, { slug: "porto", title: "Porto by tram" })),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/@alice/lisbon"]}>
          <Nav />
          <Routes><Route path="/:handle/:collectionSlug" element={<Adapter />} /></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" });
    fireEvent.click(screen.getByRole("button", { name: "to porto" }));
    await screen.findByRole("heading", { level: 1, name: "Porto by tram" });
    await new Promise((r) => setTimeout(r, 5));   // lisbon's cache entry is now older than the porto visit
    lisbonGone = true;
    fireEvent.click(screen.getByRole("button", { name: "to lisbon" }));
    await screen.findByRole("status");
    expect(screen.queryByText("Lisbon in 3 days")).toBeNull();
    act(() => answerSecondLisbon({ status: 404, body: { error: "Not found" } }));
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(screen.queryByText("Lisbon in 3 days")).toBeNull();
  });
});
