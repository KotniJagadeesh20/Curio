// Step 14d-3: arrival focus, held next page, 404/5xx arrivals, Retry, and the Contents drawer hand-off in the page viewer.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate, useParams, type NavigateFunction } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicCollectionDetail, PublicPageView } from "@/lib/types";
import { err, installFakeApi, ok, type Handler, type Reply } from "@/test/fakeApi";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: () => <pre /> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
import PageView from "./PageView";

const outline = (): PublicCollectionDetail => ({
  collection: { slug: "lisbon", title: "Lisbon", description: "", coverUrl: null, coverThumbUrl: null, category: null,
    creator: { username: "alice", displayName: "Alice" }, moduleCount: 2, pageCount: 3 },
  unlisted: false,
  modules: [
    { slug: "day-1", title: "Day one", position: 0, pages: [{ slug: "arrival", title: "Arrival", summary: "", position: 0 }, { slug: "tram", title: "Tram 28", summary: "", position: 1 }] },
    { slug: "day-2", title: "Day two", position: 1, pages: [{ slug: "museums", title: "Museums", summary: "", position: 0 }] },
  ],
});
const pageView = (m: string, p: string, title: string): PublicPageView => ({
  collection: { slug: "lisbon", title: "Lisbon", creator: { username: "alice", displayName: "Alice" }, unlisted: false },
  module: { slug: m, title: m }, page: { slug: p, title, summary: "", blocks: [{ type: "text", text: `${title} body` }], legacy: null },
});
const PAGE = (m: string, p: string) => `GET /public/pages/alice/lisbon/${m}/${p}`;
const routes = (): Record<string, Handler> => ({
  [PAGE("day-1", "arrival")]: () => ok(pageView("day-1", "arrival", "Arrival")),
  [PAGE("day-1", "tram")]: () => ok(pageView("day-1", "tram", "Tram 28")),
  [PAGE("day-2", "museums")]: () => ok(pageView("day-2", "museums", "Museums")),
  "GET /public/collections/alice/lisbon": () => ok(outline()),
});

let nav: NavigateFunction;
function Grab() { nav = useNavigate(); return null; }
function Adapter() { const { m, p } = useParams(); return <PageView username="alice" collectionSlug="lisbon" moduleSlug={m!} pageSlug={p!} />; }
/** Starts on a neutral route, then PUSHes to the page (the initial entry would be a POP). */
async function pushTo(path: string) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } })}>
      <MemoryRouter initialEntries={["/start"]}>
        <Grab />
        <Routes>
          <Route path="/start" element={<div />} />
          <Route path="/@alice/lisbon/:m/:p" element={<Adapter />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  act(() => { nav(path); });
}
const h1 = (name: string) => screen.findByRole("heading", { level: 1, name });

afterEach(() => { vi.unstubAllGlobals(); });

describe("PageView arrival focus", () => {
  it("a PUSH focuses the page heading once the page and outline are confirmed; Next focuses the next page's heading", async () => {
    installFakeApi(routes());
    await pushTo("/@alice/lisbon/day-1/arrival");
    const first = await h1("Arrival");
    await waitFor(() => expect(document.activeElement).toBe(first));
    fireEvent.click(screen.getByRole("link", { name: "Next: Tram 28" }));
    const next = await h1("Tram 28");
    await waitFor(() => expect(document.activeElement).toBe(next));
  });

  it("R3: while the next page is held, nothing (and nothing from the previous page) is focused; then its heading is", async () => {
    const r = routes();
    let answer: (x: Reply) => void = () => {};
    r[PAGE("day-1", "tram")] = () => new Promise((res) => { answer = res; });
    installFakeApi(r);
    await pushTo("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    fireEvent.click(screen.getByRole("link", { name: "Next: Tram 28" }));
    await screen.findByRole("status");
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(document.activeElement === document.body || !document.activeElement?.closest("article")).toBe(true);
    act(() => answer(ok(pageView("day-1", "tram", "Tram 28"))));
    const next = await h1("Tram 28");
    await waitFor(() => expect(document.activeElement).toBe(next));
  });

  it("a PUSH to an unavailable page focuses the not-available heading", async () => {
    const r = routes();
    r[PAGE("day-1", "tram")] = () => err(404, "Not found");
    installFakeApi(r);
    await pushTo("/@alice/lisbon/day-1/tram");
    const na = await screen.findByRole("heading", { name: "This page isn't available" });
    await waitFor(() => expect(document.activeElement).toBe(na));
  });

  it("5xx: the error region is focused; Retry → content: the heading is focused (fail-then-succeed refocuses the region first)", async () => {
    const r = routes();
    let calls = 0;
    r[PAGE("day-1", "tram")] = () => (++calls <= 6 ? err(503, "Service unavailable") : ok(pageView("day-1", "tram", "Tram 28")));
    installFakeApi(r);
    await pushTo("/@alice/lisbon/day-1/tram");
    const region = await screen.findByRole("region", { name: "Couldn't load this page" }, { timeout: 3000 });
    await waitFor(() => expect(document.activeElement).toBe(region));
    (document.activeElement as HTMLElement).blur();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));          // fails again (calls 4–6)
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("region", { name: "Couldn't load this page" })), { timeout: 3000 });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));          // succeeds
    const heading = await h1("Tram 28");
    await waitFor(() => expect(document.activeElement).toBe(heading));
  });
});

describe("Contents drawer hand-off (rev. 1 §5.3, O3)", () => {
  it("following a link to another page: focus goes to the new page's heading, not back to 'Contents'", async () => {
    installFakeApi(routes());
    await pushTo("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    const trigger = screen.getByRole("button", { name: "Contents" });
    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog");
    const focusedContents = vi.fn();
    trigger.addEventListener("focus", focusedContents);
    fireEvent.click(within(drawer).getByRole("link", { name: "Museums" }));
    const heading = await h1("Museums");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(focusedContents).not.toHaveBeenCalled();             // not even briefly (no stray "Contents" announcement)
  });

  it("Escape closes it and focus returns to 'Contents'", async () => {
    installFakeApi(routes());
    await pushTo("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    const trigger = screen.getByRole("button", { name: "Contents" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("the current page's own link: no arrival, focus returns to 'Contents'", async () => {
    installFakeApi(routes());
    await pushTo("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    const trigger = screen.getByRole("button", { name: "Contents" });
    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog");
    fireEvent.click(within(drawer).getByRole("link", { name: /Arrival/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });
});

describe("anchors", () => {
  it("title, one per block and page-nav carry data-scroll-anchor inside the reading article", async () => {
    installFakeApi(routes());
    await pushTo("/@alice/lisbon/day-1/arrival");
    await h1("Arrival");
    const ids = Array.from(document.querySelectorAll("article [data-scroll-anchor]")).map((e) => e.getAttribute("data-scroll-anchor"));
    expect(ids).toEqual(["title", "block-b0", "page-nav"]);
    expect(document.querySelectorAll("[data-testid=page-sidebar] [data-scroll-anchor]")).toHaveLength(0);
  });
});
