// Step 14d-3: arrival focus and anchors in the collection viewer.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicCollectionDetail } from "@/lib/types";
import { err, installFakeApi, ok } from "@/test/fakeApi";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
import CollectionView from "./CollectionView";

const detail = (): PublicCollectionDetail => ({
  collection: { slug: "lisbon", title: "Lisbon in 3 days", description: "", coverUrl: null, coverThumbUrl: null, category: null,
    creator: { username: "alice", displayName: "Alice" }, moduleCount: 1, pageCount: 2 },
  unlisted: false,
  modules: [{ slug: "day-1", title: "Day one", position: 0, pages: [{ slug: "arrival", title: "Arrival", summary: "", position: 0 }, { slug: "tram", title: "Tram", summary: "", position: 1 }] }],
});
let nav: NavigateFunction;
function Grab() { nav = useNavigate(); return null; }
function pushToCollection() {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } })}>
      <MemoryRouter initialEntries={["/start"]}>
        <Grab />
        <Routes>
          <Route path="/start" element={<div />} />
          <Route path="/@alice/lisbon" element={<CollectionView username="alice" slug="lisbon" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  act(() => { nav("/@alice/lisbon"); });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe("CollectionView arrival", () => {
  it("a PUSH focuses the collection heading once confirmed", async () => {
    installFakeApi({ "GET /public/collections/alice/lisbon": () => ok(detail()) });
    pushToCollection();
    const heading = await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" });
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });

  it("404 → the not-available heading is focused", async () => {
    installFakeApi({ "GET /public/collections/alice/lisbon": () => err(404, "Not found") });
    pushToCollection();
    const na = await screen.findByRole("heading", { name: "This collection isn't available" });
    await waitFor(() => expect(document.activeElement).toBe(na));
  });

  it("5xx → the labelled error region is focused (ErrorState inside unchanged)", async () => {
    installFakeApi({ "GET /public/collections/alice/lisbon": () => err(503, "Service unavailable") });
    pushToCollection();
    const region = await screen.findByRole("region", { name: "Couldn't load this collection" }, { timeout: 3000 });
    await waitFor(() => expect(document.activeElement).toBe(region));
    expect(region.querySelector("[role=alert]")).toHaveTextContent("Service unavailable");
  });

  it("anchors: the header and one per outline page, all inside the article", async () => {
    installFakeApi({ "GET /public/collections/alice/lisbon": () => ok(detail()) });
    pushToCollection();
    await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" });
    const ids = Array.from(document.querySelectorAll("article [data-scroll-anchor]")).map((e) => e.getAttribute("data-scroll-anchor"));
    expect(ids).toEqual(["header", "page-day-1/arrival", "page-day-1/tram"]);
  });
});
