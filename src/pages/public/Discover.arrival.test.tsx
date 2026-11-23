// Step 14d-3: Discover arrival (R1): only entering Discover is an arrival; search, filters and paging never move focus.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Paged, PublicCollectionSummary } from "@/lib/types";
import { installFakeApi, ok } from "@/test/fakeApi";
import Discover, { DISCOVER_PAGE_SIZE, SEARCH_DEBOUNCE_MS } from "./Discover";

const card = (slug: string): PublicCollectionSummary => ({
  slug, title: `Title ${slug}`, description: "", coverUrl: null, coverThumbUrl: null, category: { slug: "travel", name: "Travel" },
  creator: { username: "alice", displayName: "Alice" }, moduleCount: 1, pageCount: 1,
});
const paged = (items: PublicCollectionSummary[]): Paged<PublicCollectionSummary> => ({ items, page: 0, size: DISCOVER_PAGE_SIZE, totalItems: 40, totalPages: 2 });
const CATS = [{ id: 1, slug: "travel", name: "Travel", icon: "", position: 1 }];

let nav: NavigateFunction;
let loc = "";
function Grab() { nav = useNavigate(); const l = useLocation(); loc = l.pathname + l.search; return null; }
function pushToDiscover() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={["/start"]}>
        <Grab />
        <Routes>
          <Route path="/start" element={<div />} />
          <Route path="/discover" element={<Discover />} />
          <Route path="/:handle/:collectionSlug" element={<div data-testid="collection" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  act(() => { nav("/discover"); });
}
const heading = () => screen.getByRole("heading", { level: 1, name: "Discover" });

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Discover arrival (R1, Q-d4, O7)", () => {
  it("entering Discover focuses its heading once; typing, a category, paging and Back never move focus to it again", async () => {
    installFakeApi({ "GET /public/categories": () => ok(CATS), "GET /public/collections": () => ok(paged([card("a"), card("b")])) });
    pushToDiscover();
    await screen.findByText("Title a");
    await waitFor(() => expect(document.activeElement).toBe(heading()));
    const focusSpy = vi.spyOn(heading(), "focus");

    const search = screen.getByRole("searchbox", { name: "Search collections" });
    search.focus();
    fireEvent.change(search, { target: { value: "tram" } });
    await waitFor(() => expect(loc).toBe("/discover?q=tram"), { timeout: SEARCH_DEBOUNCE_MS + 1000 });
    expect(document.activeElement).toBe(search);

    const travel = screen.getByRole("button", { name: "Travel" });
    travel.focus();
    fireEvent.click(travel);
    await waitFor(() => expect(loc).toContain("category=travel"));
    const next = screen.getByRole("button", { name: /Next/ });
    next.focus();
    fireEvent.click(next);
    await waitFor(() => expect(loc).toContain("page=2"));
    act(() => { nav(-1); });
    act(() => { nav(-1); });
    await waitFor(() => expect(loc).toBe("/discover?q=tram"));
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it("anchors: one per card and the pager, inside the results region", async () => {
    installFakeApi({ "GET /public/categories": () => ok(CATS), "GET /public/collections": () => ok(paged([card("a"), card("b")])) });
    pushToDiscover();
    await screen.findByText("Title a");
    const ids = Array.from(document.querySelectorAll("[aria-busy] [data-scroll-anchor]")).map((e) => e.getAttribute("data-scroll-anchor"));
    expect(ids).toEqual(["card-alice/a", "card-alice/b", "pager"]);
  });

  it("leaving for a collection and coming Back is a new arrival (POP): no focus move", async () => {
    installFakeApi({ "GET /public/categories": () => ok(CATS), "GET /public/collections": () => ok(paged([card("a")])) });
    pushToDiscover();
    await screen.findByText("Title a");
    fireEvent.click(screen.getByText("Title a"));
    await screen.findByTestId("collection");
    act(() => { nav(-1); });
    await screen.findByText("Title a");
    expect(document.activeElement).not.toBe(heading());
  });
});
