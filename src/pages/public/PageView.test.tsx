import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import { NOINDEX_ATTR, useNoIndex } from "@/hooks/useNoIndex";
import { SITE_NAME } from "@/hooks/useDocumentTitle";
import type { PublicCollectionDetail, PublicPageView } from "@/lib/types";
import { err, installFakeApi, ok } from "@/test/fakeApi";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre data-testid="code">{value}</pre> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
const fetchOwnerMedia = vi.hoisted(() => vi.fn(() => new Promise<Blob>(() => {})));
vi.mock("@/lib/media", async (orig) => ({ ...(await orig<typeof import("@/lib/media")>()), fetchOwnerMedia }));
import PageView from "./PageView";

// ---- fixtures: collection "lisbon" by alice; day-1: arrival, tram; day-2: museums (a draft "secret" exists, never listed)
const PAGE_API = (m: string, p: string, c = "lisbon") => `GET /public/pages/alice/${c}/${m}/${p}`;
const COLL_API = (c = "lisbon") => `GET /public/collections/alice/${c}`;

const outline = (o: Partial<PublicCollectionDetail> = {}, title = "Lisbon in 3 days", slug = "lisbon"): PublicCollectionDetail => ({
  collection: {
    slug, title, description: "", coverUrl: null, coverThumbUrl: null, category: null,
    creator: { username: "alice", displayName: "Alice" }, moduleCount: 2, pageCount: 3,
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

const pageView = (m: string, p: string, title: string, o: { unlisted?: boolean; blocks?: unknown; legacy?: PublicPageView["page"]["legacy"]; summary?: string; collectionTitle?: string; c?: string } = {}): PublicPageView => ({
  collection: { slug: o.c ?? "lisbon", title: o.collectionTitle ?? "Lisbon in 3 days", creator: { username: "alice", displayName: "Alice" }, unlisted: o.unlisted ?? false },
  module: { slug: m, title: m === "day-1" ? "Day one" : "Day two" },
  page: {
    slug: p, title, summary: o.summary ?? "",
    blocks: (o.blocks === undefined ? [{ type: "heading", level: 2, text: `${title} body` }] : o.blocks) as PublicPageView["page"]["blocks"],
    legacy: o.legacy ?? null,
  },
});

const ROUTES = (o: { unlisted?: boolean } = {}) => ({
  [PAGE_API("day-1", "arrival")]: () => ok(pageView("day-1", "arrival", "Arrival", { summary: "Airport to Alfama", unlisted: o.unlisted })),
  [PAGE_API("day-1", "tram")]: () => ok(pageView("day-1", "tram", "Tram 28", { unlisted: o.unlisted })),
  [PAGE_API("day-2", "museums")]: () => ok(pageView("day-2", "museums", "Museums", { unlisted: o.unlisted })),
  [PAGE_API("day-2", "secret")]: () => err(404, "Not found"),
  [COLL_API()]: () => ok(outline({ unlisted: o.unlisted ?? false })),
});

let loc = "";
function Spy() { const l = useLocation(); loc = l.pathname; return null; }
/** The real route adapter reuses PageView across page URLs. */
function Adapter() {
  const { collectionSlug, moduleSlug, pageSlug } = useParams();
  return <PageView username="alice" collectionSlug={collectionSlug!} moduleSlug={moduleSlug!} pageSlug={pageSlug!} />;
}
function Nav({ to }: { to: string[] }) {
  const go = useNavigate();
  return <>{to.map((t) => <button key={t} onClick={() => go(t)}>{`go ${t}`}</button>)}</>;
}
const client = () => new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
function mount(path = "/@alice/lisbon/day-1/tram", qc = client(), navTo: string[] = []) {
  const r = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Nav to={navTo} />
        <Routes>
          <Route path="/:handle/:collectionSlug/:moduleSlug/:pageSlug" element={<><Adapter /><Spy /></>} />
          <Route path="/:handle/:collectionSlug" element={<Spy />} />
          <Route path="/discover" element={<Spy />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...r, qc };
}
const h1 = (name: string) => screen.findByRole("heading", { level: 1, name });
const noindexTags = () => document.head.querySelectorAll(`meta[${NOINDEX_ATTR}]`);
const sidebar = () => within(screen.getByTestId("page-sidebar"));

beforeEach(() => { loc = ""; document.title = "Before"; fetchOwnerMedia.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("PageView: the reading view", () => {
  it("renders breadcrumbs, title, summary and content", async () => {
    installFakeApi(ROUTES());
    mount("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    const crumbs = within(screen.getByRole("navigation", { name: "Breadcrumb" }));
    expect(crumbs.getByRole("link", { name: "Discover" })).toHaveAttribute("href", "/discover");
    expect(crumbs.getByRole("link", { name: "Lisbon in 3 days" })).toHaveAttribute("href", "/@alice/lisbon");
    expect(crumbs.getByText("Day one")).toBeInTheDocument();
    expect(screen.getByText("Airport to Alfama", { selector: "header p" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Arrival body" })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("sidebar: the published outline with the current page marked aria-current", async () => {
    installFakeApi(ROUTES());
    mount("/@alice/lisbon/day-1/tram");
    await h1("Tram 28");
    const nav = sidebar().getByRole("navigation", { name: "Collection contents" });
    expect(within(nav).getByRole("link", { name: "Tram 28" })).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByRole("link", { name: /Arrival/ })).not.toHaveAttribute("aria-current");
    expect(within(nav).getByRole("link", { name: "Museums" })).toHaveAttribute("href", "/@alice/lisbon/day-2/museums");
  });

  it("mobile: a 'Contents' drawer shows the same outline (current page marked) and closes when a page is followed", async () => {
    installFakeApi(ROUTES());
    mount("/@alice/lisbon/day-1/tram");
    await h1("Tram 28");
    const hrefs = (el: HTMLElement) => within(el).getAllByRole("link").map((a) => a.getAttribute("href"));
    const sidebarHrefs = hrefs(sidebar().getByRole("navigation", { name: "Collection contents" }));
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    const drawer = within(await screen.findByRole("dialog"));
    expect(drawer.getByRole("heading", { name: "Contents" })).toBeInTheDocument();
    const nav = drawer.getByRole("navigation", { name: "Collection contents" });
    expect(within(nav).getByRole("link", { name: "Tram 28" })).toHaveAttribute("aria-current", "page");
    // the drawer and the sidebar list exactly the same links (the sidebar is aria-hidden while the modal drawer is open)
    expect(hrefs(nav)).toEqual(sidebarHrefs);
    // no duplicate ids while both copies of the outline are in the document
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    fireEvent.click(within(nav).getByRole("link", { name: "Museums" }));
    await h1("Museums");
    expect(loc).toBe("/@alice/lisbon/day-2/museums");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("previous/next cross module boundaries and navigate in the same component", async () => {
    installFakeApi(ROUTES());
    mount("/@alice/lisbon/day-1/tram");
    await h1("Tram 28");
    const pn = within(screen.getByRole("navigation", { name: "Page navigation" }));
    expect(pn.getByRole("link", { name: "Previous: Arrival" })).toHaveAttribute("href", "/@alice/lisbon/day-1/arrival");
    fireEvent.click(pn.getByRole("link", { name: "Next: Museums" }));
    await h1("Museums");
    expect(loc).toBe("/@alice/lisbon/day-2/museums");
    expect(screen.queryByRole("link", { name: /^Next:/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Previous: Tram 28" })).toBeInTheDocument();
  });

  it("the first page has no Previous", async () => {
    installFakeApi(ROUTES());
    mount("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    expect(screen.queryByRole("link", { name: /^Previous:/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Next: Tram 28" })).toBeInTheDocument();
  });

  it("a draft page never appears in the sidebar, the drawer or previous/next", async () => {
    installFakeApi(ROUTES());
    mount("/@alice/lisbon/day-2/museums");
    await h1("Museums");
    fireEvent.click(screen.getByRole("button", { name: "Contents" }));
    await screen.findByRole("dialog");
    for (const a of screen.getAllByRole("link", { hidden: true })) expect(a.getAttribute("href")).not.toMatch(/secret/);
  });

  it("a page missing from the confirmed outline (race with unpublishing) renders without previous/next or a highlight", async () => {
    const routes = ROUTES();
    routes[COLL_API()] = () => ok(outline({ modules: [{ slug: "day-1", title: "Day one", position: 0, pages: [{ slug: "arrival", title: "Arrival", summary: "", position: 0 }] }] }));
    installFakeApi(routes);
    mount("/@alice/lisbon/day-1/tram");
    await h1("Tram 28");
    expect(screen.queryByRole("navigation", { name: "Page navigation" })).toBeNull();
    expect(sidebar().queryByRole("link", { current: "page" })).toBeNull();
  });

  it("uploaded images use their public URL and reserve their space; owner media is never requested", async () => {
    const routes = ROUTES();
    routes[PAGE_API("day-1", "tram")] = () => ok(pageView("day-1", "tram", "Tram 28", { blocks: [
      { type: "image", url: "/api/public/media/abc", caption: "Tram", width: 1200, height: 800 },
      { type: "image", url: "/api/media/9/content", caption: "Owner" },
      { type: "image", assetId: "9", caption: "Owner2" },
      { type: "image", url: "https://images.example.org/x.jpg", caption: "External" },
    ] }));
    const fake = installFakeApi(routes);
    mount();
    await h1("Tram 28");
    const img = screen.getByRole("img", { name: "Tram" });
    expect(img).toHaveAttribute("src", "/api/public/media/abc");
    expect(img).toHaveAttribute("width", "1200");
    expect(img).toHaveAttribute("height", "800");
    expect(screen.getByRole("img", { name: "External" })).not.toHaveAttribute("width");
    expect(screen.queryByRole("img", { name: /Owner/ })).toBeNull();
    expect(document.querySelector('img[src*="/api/media/"]')).toBeNull();
    expect(fetchOwnerMedia).not.toHaveBeenCalled();
    expect(fake.calls.filter((c) => c.path.startsWith("/media/"))).toEqual([]);
  });

  it("one malformed block doesn't hide its valid neighbors", async () => {
    const routes = ROUTES();
    routes[PAGE_API("day-1", "tram")] = () => ok(pageView("day-1", "tram", "Tram 28", { blocks: [
      { type: "heading", level: 2, text: "Good one" }, { type: "code", code: 42 }, { type: "callout", variant: "nope", text: "Good two" },
    ] }));
    installFakeApi(routes);
    mount();
    await h1("Tram 28");
    expect(screen.getByRole("heading", { name: "Good one" })).toBeInTheDocument();
    expect(screen.getByText("Good two")).toBeInTheDocument();
  });

  it("empty or unreadable content → the neutral message", async () => {
    const routes = ROUTES();
    routes[PAGE_API("day-1", "tram")] = () => ok(pageView("day-1", "tram", "Tram 28", { blocks: [{ type: "quiz" }, { type: "text", text: 5 }] }));
    routes[PAGE_API("day-1", "arrival")] = () => ok(pageView("day-1", "arrival", "Arrival", { blocks: [] }));
    installFakeApi(routes);
    const a = mount();
    await h1("Tram 28");
    expect(screen.getByTestId("no-content")).toHaveTextContent("No content is available to display.");
    a.unmount();
    mount("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    expect(screen.getByTestId("no-content")).toBeInTheDocument();
  });

  it("a legacy page renders through the legacy conversion", async () => {
    const routes = ROUTES();
    routes[PAGE_API("day-1", "tram")] = () => ok(pageView("day-1", "tram", "Pods", { blocks: null, legacy: {
      concept: "The smallest deployable unit.", realWorld: "", commonMistakes: [], bestPractices: [], interviewRelevance: "", codeLanguage: "yaml", codeExample: "kind: Pod",
    } }));
    installFakeApi(routes);
    mount();
    await h1("Pods");
    expect(screen.getByRole("heading", { level: 2, name: "Concept" })).toBeInTheDocument();
    expect(screen.getByText("The smallest deployable unit.")).toBeInTheDocument();
    expect(screen.getByTestId("code")).toHaveTextContent("kind: Pod");
  });

  it("sends no Authorization header even with a stored token", async () => {
    tokenStore.set("expired-token");
    const fake = installFakeApi(ROUTES());
    mount();
    await h1("Tram 28");
    expect(fake.calls.length).toBeGreaterThanOrEqual(2);
    expect(fake.calls.every((c) => !("Authorization" in c.headers))).toBe(true);
  });
});

describe("PageView: states and document title", () => {
  it("loading → site name; success → 'page title · site'", async () => {
    installFakeApi(ROUTES());
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading page...");
    expect(document.title).toBe(SITE_NAME);
    await h1("Tram 28");
    expect(document.title).toBe(`Tram 28 · ${SITE_NAME}`);
  });

  it("the page returns 404 → the neutral screen and 'Not available · site', requested once", async () => {
    const fake = installFakeApi(ROUTES());
    mount("/@alice/lisbon/day-2/secret");
    expect(await screen.findByRole("heading", { name: "This page isn't available" })).toBeInTheDocument();
    expect(document.title).toBe(`Not available · ${SITE_NAME}`);
    expect(fake.sent("GET", "/public/pages/alice/lisbon/day-2/secret")).toHaveLength(1);
  });

  it("the page succeeds but the outline returns 404 → the neutral screen, no page content", async () => {
    const routes = ROUTES();
    routes[COLL_API()] = () => err(404, "Not found");
    installFakeApi(routes);
    mount();
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(screen.queryByText("Tram 28")).toBeNull();
    expect(document.title).toBe(`Not available · ${SITE_NAME}`);
  });

  it("the outline succeeds but the page returns 404 → the neutral screen", async () => {
    const routes = ROUTES();
    routes[PAGE_API("day-1", "tram")] = () => err(404, "Not found");
    installFakeApi(routes);
    mount();
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Collection contents" })).toBeNull();
  });

  it("a 5xx on the page → error state with a retry that recovers; title is the site name", async () => {
    let down = true;
    const routes = ROUTES();
    routes[PAGE_API("day-1", "tram")] = () => (down ? err(503, "Service unavailable") : ok(pageView("day-1", "tram", "Tram 28")));
    installFakeApi(routes);
    mount();
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Service unavailable");
    expect(document.title).toBe(SITE_NAME);
    down = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await h1("Tram 28");
  });

  it("a 5xx on the outline → error state (no page content without its navigation)", async () => {
    const routes = ROUTES();
    routes[COLL_API()] = () => err(500, "Server error");
    installFakeApi(routes);
    mount();
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Server error");
    expect(screen.queryByText("Tram 28")).toBeNull();
    expect(document.title).toBe(SITE_NAME);
  });

  it("one 404 and one 5xx → the neutral screen (404 wins)", async () => {
    const routes = ROUTES();
    routes[PAGE_API("day-1", "tram")] = () => err(404, "Not found");
    routes[COLL_API()] = () => err(500, "Server error");
    installFakeApi(routes);
    mount();
    expect(await screen.findByTestId("not-available", {}, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe("PageView: unlisted collections (noindex)", () => {
  it("a published page: no noindex; an unlisted page: noindex, with no Unlisted label", async () => {
    installFakeApi(ROUTES());
    const a = mount();
    await h1("Tram 28");
    expect(noindexTags()).toHaveLength(0);
    a.unmount();
    installFakeApi(ROUTES({ unlisted: true }));
    mount();
    await h1("Tram 28");
    expect(noindexTags()).toHaveLength(1);
    expect(screen.queryByText(/unlisted/i)).toBeNull();
  });

  it("an unlisted page that becomes unavailable (refetch → 404) loses noindex", async () => {
    let gone = false;
    const routes = ROUTES({ unlisted: true });
    routes[PAGE_API("day-1", "tram")] = () => (gone ? err(404, "Not found") : ok(pageView("day-1", "tram", "Tram 28", { unlisted: true })));
    installFakeApi(routes);
    const { qc } = mount();
    await h1("Tram 28");
    expect(noindexTags()).toHaveLength(1);
    gone = true;
    await qc.refetchQueries({ queryKey: ["public", "page"] });
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(noindexTags()).toHaveLength(0);
    expect(screen.queryByText("Tram 28")).toBeNull();
  });

  it("navigating from an unlisted page to a published one removes noindex (same component)", async () => {
    const routes: Record<string, () => ReturnType<typeof ok>> = {
      ...ROUTES({ unlisted: true }),
      [PAGE_API("intro", "hello", "porto")]: () => ok(pageView("intro", "hello", "Hello Porto", { c: "porto", collectionTitle: "Porto" })),
      [COLL_API("porto")]: () => ok(outline({ modules: [{ slug: "intro", title: "Intro", position: 0, pages: [{ slug: "hello", title: "Hello Porto", summary: "", position: 0 }] }] }, "Porto", "porto")),
    };
    installFakeApi(routes);
    mount("/@alice/lisbon/day-1/tram", client(), ["/@alice/porto/intro/hello"]);
    await h1("Tram 28");
    expect(noindexTags()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "go /@alice/porto/intro/hello" }));
    await h1("Hello Porto");
    expect(noindexTags()).toHaveLength(0);
  });

  it("navigating between two unlisted pages keeps noindex (and it's gone after unmount)", async () => {
    installFakeApi(ROUTES({ unlisted: true }));
    const { unmount } = mount();
    await h1("Tram 28");
    fireEvent.click(screen.getByRole("link", { name: "Next: Museums" }));
    await h1("Museums");
    expect(noindexTags()).toHaveLength(1);
    unmount();
    expect(noindexTags()).toHaveLength(0);
  });

  it("unmount keeps the tag while another consumer still needs it", async () => {
    installFakeApi(ROUTES({ unlisted: true }));
    const { unmount } = mount();
    await h1("Tram 28");
    function Other() { useNoIndex(true); return null; }
    const other = render(<Other />);
    unmount();
    expect(noindexTags()).toHaveLength(1);
    other.unmount();
    expect(noindexTags()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Stale cache (the 14b rule, through useConfirmedPublicData): content cached on an earlier visit is never shown until
// the server confirms it during this visit.
// ---------------------------------------------------------------------------------------------------------------------
describe("PageView with previously cached data", () => {
  const PAGE_KEY = ["public", "page", "alice", "lisbon", "day-1", "tram"];
  const COLL_KEY = ["public", "collection", "alice", "lisbon"];
  const STALE_PAGE = pageView("day-1", "tram", "Old cached title", { summary: "Old cached summary", blocks: [{ type: "heading", level: 2, text: "Old cached body" }] });
  const STALE_OUTLINE = outline({ modules: [{ slug: "day-1", title: "Day one", position: 0, pages: [
    { slug: "tram", title: "Tram 28", summary: "", position: 0 }, { slug: "old-page", title: "Old cached outline entry", summary: "", position: 1 },
  ] }] });
  const cachedClient = (page: PublicPageView = STALE_PAGE, coll: PublicCollectionDetail | null = STALE_OUTLINE) => {
    const qc = client();
    qc.setQueryData(PAGE_KEY, page, { updatedAt: Date.now() - 60_000 });
    if (coll) qc.setQueryData(COLL_KEY, coll, { updatedAt: Date.now() - 60_000 });
    return qc;
  };
  type Answer = (r: { status: number; body?: unknown }) => void;
  /** Both revalidation requests held open until the test answers them. */
  const held = () => {
    let page: Answer = () => {}, coll: Answer = () => {};
    const fake = installFakeApi({
      [PAGE_API("day-1", "tram")]: () => new Promise((r) => { page = r; }),
      [COLL_API()]: () => new Promise((r) => { coll = r; }),
    });
    return { fake, page: (r: Parameters<Answer>[0]) => act(() => page(r)), coll: (r: Parameters<Answer>[0]) => act(() => coll(r)) };
  };
  const expectNothingStale = () => {
    expect(screen.queryByText("Old cached title")).toBeNull();
    expect(screen.queryByText("Old cached summary")).toBeNull();
    expect(screen.queryByText("Old cached body")).toBeNull();
    expect(screen.queryByText("Old cached outline entry")).toBeNull();
  };
  /** Before anything is confirmed: no reading view at all. */
  const expectNoReadingView = () => {
    expectNothingStale();
    expect(screen.queryByRole("navigation", { name: "Collection contents" })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  };

  it("a cached page that has since been unpublished: nothing stale while revalidating, then the neutral screen", async () => {
    const { fake, page, coll } = held();
    mount(undefined, cachedClient());
    await waitFor(() => expect(fake.sent("GET", "/public/pages/alice/lisbon/day-1/tram")).toHaveLength(1));
    expect(screen.getByRole("status")).toHaveTextContent("Loading page...");
    expectNoReadingView();
    expect(document.title).toBe(SITE_NAME);
    coll({ status: 200, body: outline() });
    page({ status: 404, body: { error: "Not found" } });
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expectNothingStale();
    expect(document.title).toBe(`Not available · ${SITE_NAME}`);
  });

  it("a cached page whose collection has since been deleted (both 404): the neutral screen, nothing stale", async () => {
    const { page, coll } = held();
    mount(undefined, cachedClient());
    await screen.findByRole("status");
    coll({ status: 404, body: { error: "Not found" } });
    page({ status: 404, body: { error: "Not found" } });
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expectNothingStale();
  });

  it("the page becomes unavailable while its revalidation is pending, even after the outline confirmed", async () => {
    const { page, coll } = held();
    mount(undefined, cachedClient(pageView("day-1", "tram", "Old cached title", { unlisted: true })));
    await screen.findByRole("status");
    coll({ status: 200, body: outline() });
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(screen.getByRole("status")).toBeInTheDocument();   // the outline alone never shows the stale page
    expectNoReadingView();
    expect(noindexTags()).toHaveLength(0);
    page({ status: 404, body: { error: "Not found" } });
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(noindexTags()).toHaveLength(0);
  });

  it("a stale cached outline is never used while the page is already confirmed", async () => {
    const { page, coll } = held();
    mount(undefined, cachedClient());
    await screen.findByRole("status");
    page({ status: 200, body: pageView("day-1", "tram", "Tram 28") });
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expectNoReadingView();
    coll({ status: 200, body: outline() });
    await h1("Tram 28");
    expectNothingStale();
  });

  it("a successful revalidation shows the current content, not the cached copy", async () => {
    const { page, coll } = held();
    mount(undefined, cachedClient());
    await screen.findByRole("status");
    page({ status: 200, body: pageView("day-1", "tram", "Tram 28") });
    coll({ status: 200, body: outline() });
    await h1("Tram 28");
    expect(screen.getByRole("heading", { level: 2, name: "Tram 28 body" })).toBeInTheDocument();
    expectNothingStale();
    expect(document.title).toBe(`Tram 28 · ${SITE_NAME}`);
  });

  it("a revalidation that fails with another error shows the error state, never the cached content", async () => {
    installFakeApi({ [PAGE_API("day-1", "tram")]: () => err(503, "Service unavailable"), [COLL_API()]: () => ok(outline()) });
    mount(undefined, cachedClient());
    await waitFor(() => expectNothingStale());
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Service unavailable");
    expectNothingStale();
    expect(document.title).toBe(SITE_NAME);
  });

  it("switching between pages of the SAME collection doesn't trust data cached earlier in the visit", async () => {
    let tramGone = false;
    let answerTram: Answer = () => {};
    const routes = ROUTES();
    routes[PAGE_API("day-1", "tram")] = () => (tramGone ? new Promise((r) => { answerTram = r; }) : ok(pageView("day-1", "tram", "Tram 28")));
    installFakeApi(routes as never);
    mount("/@alice/lisbon/day-1/tram", client(), ["/@alice/lisbon/day-1/tram"]);
    await h1("Tram 28");
    fireEvent.click(screen.getByRole("link", { name: "Next: Museums" }));
    await h1("Museums");
    await new Promise((r) => setTimeout(r, 5));   // tram's cache entry is now older than the museums visit
    tramGone = true;
    fireEvent.click(screen.getByRole("button", { name: "go /@alice/lisbon/day-1/tram" }));
    await screen.findByRole("status");
    expect(screen.queryByText("Tram 28 body")).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    act(() => answerTram({ status: 404, body: { error: "Not found" } }));
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(screen.queryByText("Tram 28 body")).toBeNull();
  });

  it("switching between collections in the same component instance doesn't trust earlier cached data", async () => {
    let lisbonGone = false;
    let answerLisbon: Answer = () => {};
    const routes: Record<string, () => unknown> = {
      ...ROUTES(),
      [PAGE_API("intro", "hello", "porto")]: () => ok(pageView("intro", "hello", "Hello Porto", { c: "porto" })),
      [COLL_API("porto")]: () => ok(outline({ modules: [{ slug: "intro", title: "Intro", position: 0, pages: [{ slug: "hello", title: "Hello Porto", summary: "", position: 0 }] }] }, "Porto", "porto")),
    };
    routes[COLL_API()] = () => (lisbonGone ? new Promise((r) => { answerLisbon = r; }) : ok(outline()));
    installFakeApi(routes as never);
    mount("/@alice/lisbon/day-1/tram", client(), ["/@alice/porto/intro/hello", "/@alice/lisbon/day-1/tram"]);
    await h1("Tram 28");
    fireEvent.click(screen.getByRole("button", { name: "go /@alice/porto/intro/hello" }));
    await h1("Hello Porto");
    await new Promise((r) => setTimeout(r, 5));
    lisbonGone = true;
    fireEvent.click(screen.getByRole("button", { name: "go /@alice/lisbon/day-1/tram" }));
    await screen.findByRole("status");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    act(() => answerLisbon({ status: 404, body: { error: "Not found" } }));
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(screen.queryByText("Tram 28")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// 14c review fixes
// ---------------------------------------------------------------------------------------------------------------------
describe("PageView: the outline is revalidated on every page visit (same collection)", () => {
  type Answer = (r: { status: number; body?: unknown }) => void;
  const WITHOUT_TRAM = () => outline({ modules: [
    { slug: "day-2", title: "Day two", position: 1, pages: [{ slug: "museums", title: "Museums", summary: "", position: 0 }] },
    { slug: "day-1", title: "Day one", position: 0, pages: [{ slug: "arrival", title: "Arrival", summary: "Airport to Alfama", position: 0 }] },
  ] });

  it("a page unpublished between two visits never appears in the sidebar or previous/next, even while the outline is pending", async () => {
    let tramUnpublished = false;
    let answerOutline: Answer = () => {};
    const routes: Record<string, () => unknown> = { ...ROUTES() };
    routes[COLL_API()] = () => (tramUnpublished ? new Promise((r) => { answerOutline = r; }) : ok(outline()));
    routes[PAGE_API("day-1", "tram")] = () => (tramUnpublished ? err(404, "Not found") : ok(pageView("day-1", "tram", "Tram 28")));
    const fake = installFakeApi(routes as never);
    mount("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    expect(sidebar().getByRole("link", { name: "Tram 28" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next: Tram 28" })).toBeInTheDocument();
    const outlineCalls = fake.sent("GET", "/public/collections/alice/lisbon").length;

    tramUnpublished = true;                                    // the creator unpublishes "Tram 28"
    const seen: string[] = [];
    const obs = new MutationObserver(() => {
      if (document.querySelector('a[href="/@alice/lisbon/day-1/tram"]')) seen.push("tram link");
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true });
    fireEvent.click(sidebar().getByRole("link", { name: "Museums" }));   // same collection: the outline's key doesn't change

    await waitFor(() => expect(fake.sent("GET", "/public/collections/alice/lisbon").length).toBe(outlineCalls + 1));   // revalidated
    expect(screen.getByRole("status")).toHaveTextContent("Loading page...");          // the old outline is not used meanwhile
    expect(screen.queryByRole("navigation", { name: "Collection contents" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Page navigation" })).toBeNull();

    act(() => answerOutline({ status: 200, body: WITHOUT_TRAM() }));
    await h1("Museums");
    obs.disconnect();
    expect(seen).toEqual([]);
    expect(document.querySelector('a[href="/@alice/lisbon/day-1/tram"]')).toBeNull();
    expect(sidebar().queryByRole("link", { name: "Tram 28" })).toBeNull();
    expect(screen.getByRole("link", { name: "Previous: Arrival" })).toHaveAttribute("href", "/@alice/lisbon/day-1/arrival");
  });

  it("also with an immediate response: previous/next skips the unpublished page", async () => {
    let tramUnpublished = false;
    const routes: Record<string, () => unknown> = { ...ROUTES() };
    routes[COLL_API()] = () => ok(tramUnpublished ? WITHOUT_TRAM() : outline());
    installFakeApi(routes as never);
    mount("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    tramUnpublished = true;
    fireEvent.click(sidebar().getByRole("link", { name: "Museums" }));
    await h1("Museums");
    expect(screen.getByRole("link", { name: "Previous: Arrival" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Tram 28/ })).toBeNull();
  });

  it("an outline that fails to revalidate on the next visit shows the error state, never the old outline", async () => {
    let down = false;
    const routes: Record<string, () => unknown> = { ...ROUTES() };
    routes[COLL_API()] = () => (down ? err(503, "Service unavailable") : ok(outline()));
    installFakeApi(routes as never);
    mount("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    down = true;
    fireEvent.click(sidebar().getByRole("link", { name: "Museums" }));
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Service unavailable");
    expect(screen.queryByRole("navigation", { name: "Collection contents" })).toBeNull();
  });

  it("the first visit sends one outline request (the revalidation joins the initial fetch)", async () => {
    const fake = installFakeApi(ROUTES());
    mount();
    await h1("Tram 28");
    expect(fake.sent("GET", "/public/collections/alice/lisbon")).toHaveLength(1);
  });
});

describe("PageView: noindex is kept across unlisted navigation", () => {
  type Answer = (r: { status: number; body?: unknown }) => void;
  /** Records every time the managed tag leaves <head>. */
  const watchRemovals = () => {
    const removed: string[] = [];
    const obs = new MutationObserver((ms) => {
      for (const m of ms) for (const n of m.removedNodes) if (n instanceof HTMLMetaElement && n.hasAttribute(NOINDEX_ATTR)) removed.push(n.outerHTML);
    });
    obs.observe(document.head, { childList: true });
    return { removed, stop: () => obs.disconnect() };
  };

  it("unlisted → unlisted: the tag is never removed, also while the next page is pending (MutationObserver)", async () => {
    let answerMuseums: Answer = () => {};
    let answerOutline: Answer = () => {};
    let held = false;
    const routes: Record<string, () => unknown> = { ...ROUTES({ unlisted: true }) };
    routes[PAGE_API("day-2", "museums")] = () => new Promise((r) => { answerMuseums = r; });
    routes[COLL_API()] = () => (held ? new Promise((r) => { answerOutline = r; }) : ok(outline({ unlisted: true })));
    installFakeApi(routes as never);
    mount();
    await h1("Tram 28");
    expect(noindexTags()).toHaveLength(1);
    const w = watchRemovals();
    held = true;
    fireEvent.click(screen.getByRole("link", { name: "Next: Museums" }));
    await screen.findByRole("status");
    expect(noindexTags()).toHaveLength(1);                     // still there while nothing is confirmed
    act(() => answerOutline({ status: 200, body: outline({ unlisted: true }) }));
    await act(() => new Promise((r) => setTimeout(r, 10)));
    expect(noindexTags()).toHaveLength(1);
    act(() => answerMuseums({ status: 200, body: pageView("day-2", "museums", "Museums", { unlisted: true }) }));
    await h1("Museums");
    w.stop();
    expect(w.removed).toEqual([]);
    expect(noindexTags()).toHaveLength(1);
  });

  it("a page confirmed unlisted while the outline returns 503: error state, noindex kept", async () => {
    const routes: Record<string, () => unknown> = { ...ROUTES({ unlisted: true }) };
    routes[COLL_API()] = () => err(503, "Service unavailable");
    installFakeApi(routes as never);
    mount();
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Service unavailable");
    expect(noindexTags()).toHaveLength(1);
  });

  it("unlisted page, then the outline starts failing on the next visit: the tag is not removed", async () => {
    let down = false;
    const routes: Record<string, () => unknown> = { ...ROUTES({ unlisted: true }) };
    routes[COLL_API()] = () => (down ? err(503, "Service unavailable") : ok(outline({ unlisted: true })));
    installFakeApi(routes as never);
    mount();
    await h1("Tram 28");
    const w = watchRemovals();
    down = true;
    fireEvent.click(screen.getByRole("link", { name: "Next: Museums" }));
    await screen.findByRole("alert", {}, { timeout: 3000 });
    w.stop();
    expect(w.removed).toEqual([]);
    expect(noindexTags()).toHaveLength(1);
  });

  it("unlisted → a page that 404s (navigation): the tag is removed on the definitive 404", async () => {
    installFakeApi(ROUTES({ unlisted: true }));
    mount("/@alice/lisbon/day-1/tram", client(), ["/@alice/lisbon/day-2/secret"]);
    await h1("Tram 28");
    expect(noindexTags()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "go /@alice/lisbon/day-2/secret" }));
    expect(await screen.findByTestId("not-available")).toBeInTheDocument();
    expect(noindexTags()).toHaveLength(0);
  });

  it("a cached unlisted page that was never confirmed in this visit never adds the tag, even if the outline fails", async () => {
    const qc = client();
    qc.setQueryData(["public", "page", "alice", "lisbon", "day-1", "tram"], pageView("day-1", "tram", "Tram 28", { unlisted: true }), { updatedAt: Date.now() - 60_000 });
    installFakeApi({ [PAGE_API("day-1", "tram")]: () => err(503, "down"), [COLL_API()]: () => err(503, "down") });
    mount(undefined, qc);
    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(noindexTags()).toHaveLength(0);
  });
});

describe("PageView: outline confirmation is visit-scoped, not timestamp-based (review round 2)", () => {
  type Answer = (r: { status: number; body?: unknown }) => void;
  const COLL_KEY = ["public", "collection", "alice", "lisbon"];
  const WITH_TRAM = () => outline();
  const WITHOUT_TRAM = () => outline({ modules: [
    { slug: "day-2", title: "Day two", position: 1, pages: [{ slug: "museums", title: "Museums", summary: "", position: 0 }] },
    { slug: "day-1", title: "Day one", position: 0, pages: [{ slug: "arrival", title: "Arrival", summary: "Airport to Alfama", position: 0 }] },
  ] });
  /** Every outline request is held in a queue until the test answers it. */
  const queuedOutline = (routes: Record<string, () => unknown>) => {
    const pending: Answer[] = [];
    routes[COLL_API()] = () => new Promise((r) => { pending.push(r); });
    return { pending, answer: (i: number, body: unknown) => act(() => pending[i]({ status: 200, body })) };
  };
  const tramLinkWatcher = () => {
    const seen: string[] = [];
    const obs = new MutationObserver(() => {
      const h = document.querySelector("h1")?.textContent ?? "(no h1)";
      if (h !== "Arrival" && document.querySelector('a[href="/@alice/lisbon/day-1/tram"]')) seen.push(h);
    });
    obs.observe(document.body, { subtree: true, childList: true, attributes: true });
    return { seen, stop: () => obs.disconnect() };
  };

  it("cached outline with dataUpdatedAt EQUAL to the visit start time stays hidden until the visit's own request returns", async () => {
    const T = 1_800_000_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(T);
    try {
      const qc = client();
      qc.setQueryData(COLL_KEY, WITH_TRAM(), { updatedAt: T });   // same millisecond as the visit start
      const routes: Record<string, () => unknown> = { ...ROUTES() };
      const o = queuedOutline(routes);
      installFakeApi(routes as never);
      mount("/@alice/lisbon/day-2/museums", qc);
      await waitFor(() => expect(o.pending.length).toBeGreaterThan(0));
      await act(() => new Promise((r) => setTimeout(r, 20)));      // the page itself has been answered meanwhile
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.queryByRole("navigation", { name: "Collection contents" })).toBeNull();
      expect(document.querySelector('a[href="/@alice/lisbon/day-1/tram"]')).toBeNull();
      o.answer(o.pending.length - 1, WITHOUT_TRAM());
      await h1("Museums");
      expect(screen.queryByRole("link", { name: /Tram 28/ })).toBeNull();
    } finally {
      now.mockRestore();
    }
  });

  it("an outline request from the previous visit still in flight when the URL changes can't confirm the new visit, even if it completes later", async () => {
    const routes: Record<string, () => unknown> = { ...ROUTES() };
    const o = queuedOutline(routes);
    installFakeApi(routes as never);
    const { qc } = mount("/@alice/lisbon/day-1/arrival");
    await waitFor(() => expect(o.pending.length).toBeGreaterThan(0));
    o.answer(o.pending.length - 1, WITH_TRAM());
    await h1("Arrival");
    const before = o.pending.length;
    void qc.refetchQueries({ queryKey: COLL_KEY });              // e.g. a window-focus refetch during visit 1: left pending
    await waitFor(() => expect(o.pending.length).toBe(before + 1));
    const w = tramLinkWatcher();
    fireEvent.click(sidebar().getByRole("link", { name: "Museums" }));
    await waitFor(() => expect(o.pending.length).toBe(before + 2));   // the new visit's own request
    o.answer(before, WITH_TRAM());                                // the OLD request completes after the new visit began
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.getByRole("status")).toBeInTheDocument();       // still not confirmed
    expect(screen.queryByRole("navigation", { name: "Collection contents" })).toBeNull();
    o.answer(before + 1, WITHOUT_TRAM());                          // only the current visit's response makes it visible
    await h1("Museums");
    w.stop();
    expect(w.seen).toEqual([]);
    expect(screen.queryByRole("link", { name: /Tram 28/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Previous: Arrival" })).toBeInTheDocument();
  });

  it("the previous visit's request completing AFTER the new visit was confirmed doesn't bring the old outline back", async () => {
    const routes: Record<string, () => unknown> = { ...ROUTES() };
    const o = queuedOutline(routes);
    installFakeApi(routes as never);
    const { qc } = mount("/@alice/lisbon/day-1/arrival");
    await waitFor(() => expect(o.pending.length).toBeGreaterThan(0));
    o.answer(o.pending.length - 1, WITH_TRAM());
    await h1("Arrival");
    const before = o.pending.length;
    void qc.refetchQueries({ queryKey: COLL_KEY });
    await waitFor(() => expect(o.pending.length).toBe(before + 1));
    fireEvent.click(sidebar().getByRole("link", { name: "Museums" }));
    await waitFor(() => expect(o.pending.length).toBe(before + 2));
    o.answer(before + 1, WITHOUT_TRAM());
    await h1("Museums");
    const w = tramLinkWatcher();
    o.answer(before, WITH_TRAM());                                // the superseded old request finally returns
    await act(() => new Promise((r) => setTimeout(r, 20)));
    w.stop();
    expect(w.seen).toEqual([]);
    expect(screen.queryByRole("link", { name: /Tram 28/ })).toBeNull();
    expect(qc.getQueryData<PublicCollectionDetail>(COLL_KEY)!.modules.flatMap((m) => m.pages.map((x) => x.slug))).not.toContain("tram");
  });

  it("an outline request started BEFORE the visit (no cached data, so it can't be superseded) is followed by the visit's own request", async () => {
    const routes: Record<string, () => unknown> = { ...ROUTES() };
    const o = queuedOutline(routes);
    installFakeApi(routes as never);
    const qc = client();
    let answerEarly: (v: PublicCollectionDetail) => void = () => {};
    // e.g. the collection page's request, still running when the reader clicked "Start reading"
    void qc.prefetchQuery({ queryKey: COLL_KEY, queryFn: () => new Promise<PublicCollectionDetail>((r) => { answerEarly = r; }) });
    mount("/@alice/lisbon/day-2/museums", qc);
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(o.pending).toHaveLength(0);                             // joined the running request (React Query can't cancel it)
    act(() => answerEarly(WITH_TRAM()));                           // it answers with the outline as it was before the visit
    await waitFor(() => expect(o.pending).toHaveLength(1));         // then the visit's own request
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(document.querySelector('a[href="/@alice/lisbon/day-1/tram"]')).toBeNull();
    o.answer(0, WITHOUT_TRAM());
    await h1("Museums");
    expect(screen.queryByRole("link", { name: /Tram 28/ })).toBeNull();
  });
});

describe("PageView: A → B → A gets a fresh outline confirmation (review round 3)", () => {
  type Answer = (r: { status: number; body?: unknown }) => void;
  const WITHOUT_TRAM = () => outline({ modules: [
    { slug: "day-2", title: "Day two", position: 1, pages: [{ slug: "museums", title: "Museums", summary: "", position: 0 }] },
    { slug: "day-1", title: "Day one", position: 0, pages: [{ slug: "arrival", title: "Arrival", summary: "Airport to Alfama", position: 0 }] },
  ] });

  it("returning to A while B's outline is pending: loading until the third visit's own request settles; older responses don't confirm it; the latest decides", async () => {
    const pending: Answer[] = [];
    const routes: Record<string, () => unknown> = { ...ROUTES() };
    routes[COLL_API()] = () => new Promise((r) => { pending.push(r); });
    installFakeApi(routes as never);
    mount("/@alice/lisbon/day-1/arrival", client(), ["/@alice/lisbon/day-1/arrival"]);
    await waitFor(() => expect(pending.length).toBeGreaterThan(0));
    act(() => pending[pending.length - 1]({ status: 200, body: outline() }));   // visit 1 (A) confirmed, with Tram 28
    await h1("Arrival");
    expect(sidebar().getByRole("link", { name: "Tram 28" })).toBeInTheDocument();

    const n = pending.length;
    fireEvent.click(sidebar().getByRole("link", { name: "Museums" }));          // visit 2 (B)
    await waitFor(() => expect(pending.length).toBe(n + 1));
    fireEvent.click(screen.getByRole("button", { name: "go /@alice/lisbon/day-1/arrival" }));   // visit 3 (A again)
    await waitFor(() => expect(pending.length).toBe(n + 2));

    const stale: string[] = [];
    const obs = new MutationObserver(() => { if (document.querySelector("h1")) stale.push(document.querySelector("h1")!.textContent ?? ""); });
    obs.observe(document.body, { subtree: true, childList: true, characterData: true });
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.getByRole("status")).toHaveTextContent("Loading page...");   // visit 1's confirmation is not reused
    act(() => pending[n]({ status: 200, body: outline() }));                   // B's (older) request completes: ignored
    await act(() => new Promise((r) => setTimeout(r, 20)));
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(stale).toEqual([]);                                                 // nothing rendered from an older visit
    act(() => pending[n + 1]({ status: 200, body: WITHOUT_TRAM() }));          // the third visit's own response
    await h1("Arrival");
    obs.disconnect();
    expect(sidebar().queryByRole("link", { name: "Tram 28" })).toBeNull();     // the latest response decides
    expect(screen.getByRole("link", { name: "Next: Museums" })).toBeInTheDocument();
  });
});
