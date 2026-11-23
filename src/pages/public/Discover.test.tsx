import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import type { Paged, PublicCollectionSummary } from "@/lib/types";
import { err, installFakeApi, ok, type Handler } from "@/test/fakeApi";
import Discover, { DISCOVER_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "./Discover";

const card = (o: Partial<PublicCollectionSummary> = {}): PublicCollectionSummary => ({
  slug: "lisbon", title: "Lisbon in 3 days", description: "Tram 28 and pastéis.", coverUrl: null, coverThumbUrl: null,
  category: { slug: "travel", name: "Travel" }, creator: { username: "alice", displayName: "Alice" }, moduleCount: 2, pageCount: 6, ...o,
});
const paged = (items: PublicCollectionSummary[], o: Partial<Paged<PublicCollectionSummary>> = {}) =>
  ({ items, page: 0, size: DISCOVER_PAGE_SIZE, totalItems: items.length, totalPages: items.length ? 1 : 0, ...o });
const CATS = [{ id: 1, slug: "travel", name: "Travel", icon: "", position: 1 }, { id: 2, slug: "food", name: "Food & Recipes", icon: "", position: 2 }];

/** The list endpoint for any query string (fakeApi falls back to the path without its query), answered by `list`. */
const api = (list: Handler) => installFakeApi({ "GET /public/categories": () => ok(CATS), "GET /public/collections": list });
const listCalls = (fake: ReturnType<typeof installFakeApi>) => fake.calls.filter((c) => c.path.startsWith("/public/collections")).map((c) => c.path);

let loc = "";
function Spy() { const l = useLocation(); loc = l.pathname + l.search; return null; }
function mount(url = "/discover") {
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route path="/discover" element={<><Discover /><Spy /></>} />
          <Route path="/:handle/:collectionSlug" element={<div data-testid="collection-route" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { loc = ""; });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); tokenStore.clear(); document.title = ""; });

describe("Discover", () => {
  it("lists collections as cards with cover thumb, title, description, category, creator and counts; sets the title", async () => {
    const fake = api(() => ok(paged([
      card({ coverUrl: "/api/public/media/aaa", coverThumbUrl: "/api/public/media/aaa/thumb" }),
      card({ slug: "pasta", title: "Fresh pasta", coverUrl: "https://images.example.org/p.jpg", coverThumbUrl: null, category: null, creator: { username: "bob", displayName: "" }, moduleCount: 1, pageCount: 1 }),
      card({ slug: "x", title: "No cover", coverUrl: "javascript:alert(1)" }),
    ])));
    mount();
    const cards = await screen.findAllByTestId("collection-card");
    expect(cards).toHaveLength(3);
    expect(document.title).toMatch(/^Discover · /);
    expect(listCalls(fake)[0]).toBe(`/public/collections?page=0&size=${DISCOVER_PAGE_SIZE}`);

    const first = within(cards[0]);
    expect(first.getByRole("heading", { name: "Lisbon in 3 days" })).toBeInTheDocument();
    expect(first.getByText("Tram 28 and pastéis.")).toBeInTheDocument();
    expect(first.getByText("Travel")).toBeInTheDocument();
    // Step 15b (disclosed change): the creator is now a link to /@username, a sibling of the card link (never nested)
    const alice = screen.getAllByRole("link", { name: "Alice" })[0];
    expect(alice).toHaveAttribute("href", "/@alice");
    expect(alice.closest("[data-testid=collection-card]")).toBeNull();
    expect(first.getByText("2 modules · 6 pages")).toBeInTheDocument();
    expect(cards[0].querySelector("img")!.getAttribute("src")).toBe("/api/public/media/aaa/thumb");   // the thumb, not the full cover
    expect(cards[0]).toHaveAttribute("href", "/@alice/lisbon");

    expect(cards[1].querySelector("img")!.getAttribute("src")).toBe("https://images.example.org/p.jpg");   // falls back to coverUrl
    expect(screen.getByRole("link", { name: "bob" })).toHaveAttribute("href", "/@bob");                    // username when no display name (Step 15b: a link)
    expect(within(cards[1]).getByText("1 module · 1 page")).toBeInTheDocument();
    expect(cards[2].querySelector("img")).toBeNull();                                                       // unsafe cover is never rendered
    expect(within(cards[2]).getByTestId("cover-placeholder")).toBeInTheDocument();
    // the card link contains no other link (Step 15b: the creator link sits next to it, not inside it)
    expect(cards[0].querySelectorAll("a")).toHaveLength(0);
  });

  it("opens a collection from its card", async () => {
    api(() => ok(paged([card()])));
    mount();
    fireEvent.click(await screen.findByTestId("collection-card"));
    expect(await screen.findByTestId("collection-route")).toBeInTheDocument();
  });

  it("debounces search, writes it to the URL, resets the page and sends q to the API", async () => {
    const fake = api(() => ok(paged([card()])));
    mount("/discover?page=2");
    await screen.findAllByTestId("collection-card");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search collections" }), { target: { value: "  lis" } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search collections" }), { target: { value: "  lisbon " } });
    expect(loc).toBe("/discover?page=2");                        // nothing yet: still typing
    await act(async () => { vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS + 10); });
    await waitFor(() => expect(loc).toBe("/discover?q=lisbon"));
    await waitFor(() => expect(listCalls(fake)).toContain(`/public/collections?q=lisbon&page=0&size=${DISCOVER_PAGE_SIZE}`));
    expect(listCalls(fake).some((p) => p.includes("q=lis&"))).toBe(false);   // the half-typed text was never requested
  });

  it("caps the search box at 100 characters (the server's limit)", async () => {
    api(() => ok(paged([])));
    mount();
    expect(await screen.findByRole("searchbox")).toHaveAttribute("maxLength", "100");
  });

  it("filters by category chip (pressed state, URL, request), toggles it off, and 'All' clears it", async () => {
    const fake = api(() => ok(paged([card()])));
    mount();
    const group = await screen.findByRole("group", { name: "Categories" });
    const all = within(group).getByRole("button", { name: "All" });
    expect(all).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(group).getByRole("button", { name: "Food & Recipes" }));
    await waitFor(() => expect(loc).toBe("/discover?category=food"));
    expect(within(group).getByRole("button", { name: "Food & Recipes" })).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(listCalls(fake)).toContain(`/public/collections?category=food&page=0&size=${DISCOVER_PAGE_SIZE}`));
    fireEvent.click(within(group).getByRole("button", { name: "Food & Recipes" }));
    await waitFor(() => expect(loc).toBe("/discover"));
    fireEvent.click(within(group).getByRole("button", { name: "Travel" }));
    await waitFor(() => expect(loc).toBe("/discover?category=travel"));
    fireEvent.click(all);
    await waitFor(() => expect(loc).toBe("/discover"));
  });

  it("restores search, category and page from the URL (deep link / refresh)", async () => {
    const fake = api(() => ok(paged([card()], { page: 2, totalItems: 30, totalPages: 3 })));
    mount("/discover?q=pasta&category=food&page=3");
    await screen.findAllByTestId("collection-card");
    expect(screen.getByRole("searchbox")).toHaveValue("pasta");
    expect(screen.getByRole("button", { name: "Food & Recipes" })).toHaveAttribute("aria-pressed", "true");
    expect(listCalls(fake)[0]).toBe(`/public/collections?category=food&q=pasta&page=2&size=${DISCOVER_PAGE_SIZE}`);
    expect(screen.getByText("Page 3 of 3")).toBeInTheDocument();
  });

  it("numbered Prev/Next paging: 1-based in the UI and URL, 0-based to the API, keeps the filters", async () => {
    const fake = api((req) => {
      const page = Number(new URLSearchParams(req.path.split("?")[1]).get("page"));
      return ok(paged([card({ slug: `c${page}`, title: `Collection ${page + 1}` })], { page, totalItems: 25, totalPages: 3 }));
    });
    mount("/discover?category=travel");
    expect(await screen.findByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(loc).toBe("/discover?category=travel&page=2"));
    expect(await screen.findByText("Page 2 of 3")).toBeInTheDocument();
    expect(listCalls(fake)).toContain(`/public/collections?category=travel&page=1&size=${DISCOVER_PAGE_SIZE}`);
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(await screen.findByText("Page 3 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
    await waitFor(() => expect(loc).toBe("/discover?category=travel&page=2"));
    fireEvent.click(screen.getByRole("button", { name: /Previous/ }));
    await waitFor(() => expect(loc).toBe("/discover?category=travel"));   // page 1 has no ?page
  });

  it("no pager for a single page; a garbage ?page is page 1", async () => {
    const fake = api(() => ok(paged([card()])));
    mount("/discover?page=abc");
    await screen.findAllByTestId("collection-card");
    expect(screen.queryByRole("navigation", { name: "Pagination" })).toBeNull();
    expect(listCalls(fake)[0]).toContain("page=0&");
  });

  it("a page past the end offers the first page", async () => {
    api(() => ok(paged([], { page: 8, totalItems: 5, totalPages: 1 })));
    mount("/discover?page=9");
    expect(await screen.findByText("There is no page 9.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to the first page" }));
    await waitFor(() => expect(loc).toBe("/discover"));
  });

  it("empty states: nothing published yet, and no matches with a 'Clear filters' button", async () => {
    api(() => ok(paged([])));
    const { unmount } = mount();
    expect(await screen.findByText("Nothing has been published yet. Check back soon.")).toBeInTheDocument();
    unmount();
    mount("/discover?q=zzz&category=food");
    expect(await screen.findByText("No collections match your search.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
    await waitFor(() => expect(loc).toBe("/discover"));
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("shows a loading state, then an error with a working retry", async () => {
    let fail = true;
    api(() => (fail ? err(503, "Service unavailable") : ok(paged([card()]))));
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading collections...");
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent("Service unavailable");
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));
    expect(await screen.findByTestId("collection-card")).toBeInTheDocument();
  });

  it("keeps the previous results visible while the next page loads (no spinner flash)", async () => {
    let release: () => void = () => {};
    api((req) => {
      const page = Number(new URLSearchParams(req.path.split("?")[1]).get("page"));
      const reply = ok(paged([card({ title: `Collection ${page + 1}` })], { page, totalItems: 20, totalPages: 2 }));
      return page === 0 ? reply : new Promise((r) => { release = () => r(reply as { status: number; body?: unknown }); });
    });
    mount();
    expect(await screen.findByText("Collection 1")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    await waitFor(() => expect(loc).toBe("/discover?page=2"));
    expect(screen.getByText("Collection 1")).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    act(() => release());
    expect(await screen.findByText("Collection 2")).toBeInTheDocument();
  });

  it("is the same for a signed-in visitor: the stored token is not sent to the public API", async () => {
    tokenStore.set("expired-token");
    const fake = api((req) => (req.headers.Authorization ? err(401, "expired") : ok(paged([card()]))));
    mount();
    expect(await screen.findByTestId("collection-card")).toBeInTheDocument();
    expect(fake.calls.every((c) => !("Authorization" in c.headers))).toBe(true);
  });
});
