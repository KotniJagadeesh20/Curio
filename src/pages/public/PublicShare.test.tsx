// Step 14d-2: the Share button in the public viewers (only for confirmed, available content; canonical URLs).
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PublicCollectionDetail, PublicPageView } from "@/lib/types";
import { err, installFakeApi, ok } from "@/test/fakeApi";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: () => <pre /> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
import CollectionView from "./CollectionView";
import PageView from "./PageView";

const outline = (o: Partial<PublicCollectionDetail> = {}): PublicCollectionDetail => ({
  collection: { slug: "lisbon", title: "Lisbon in 3 days", description: "", coverUrl: null, coverThumbUrl: null, category: null,
    creator: { username: "alice", displayName: "Alice" }, moduleCount: 1, pageCount: 1 },
  unlisted: false,
  modules: [{ slug: "day-1", title: "Day one", position: 0, pages: [{ slug: "arrival", title: "Arrival", summary: "", position: 0 }] }],
  ...o,
});
const pageView = (unlisted = false): PublicPageView => ({
  collection: { slug: "lisbon", title: "Lisbon in 3 days", creator: { username: "alice", displayName: "Alice" }, unlisted },
  module: { slug: "day-1", title: "Day one" },
  page: { slug: "arrival", title: "Arrival", summary: "", blocks: [{ type: "text", text: "Hi" }], legacy: null },
});
const ORIGIN = window.location.origin;
const client = () => new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
const mountPage = (slugs: [string, string, string] = ["lisbon", "day-1", "arrival"]) => render(
  <QueryClientProvider client={client()}><MemoryRouter><PageView username="alice" collectionSlug={slugs[0]} moduleSlug={slugs[1]} pageSlug={slugs[2]} /></MemoryRouter></QueryClientProvider>);
const mountCollection = (slug = "lisbon") => render(
  <QueryClientProvider client={client()}><MemoryRouter><CollectionView username="alice" slug={slug} /></MemoryRouter></QueryClientProvider>);
const stubShare = () => {
  const share = vi.fn(async (_d: ShareData) => {});
  Object.defineProperty(navigator, "share", { value: share, configurable: true, writable: true });
  return share;
};

afterEach(() => { vi.unstubAllGlobals(); Object.defineProperty(navigator, "share", { value: undefined, configurable: true, writable: true }); });

describe("Share on the page viewer", () => {
  it("shares '<page> · <collection>' and the canonical page URL", async () => {
    installFakeApi({ "GET /public/pages/alice/lisbon/day-1/arrival": () => ok(pageView()), "GET /public/collections/alice/lisbon": () => ok(outline()) });
    const share = stubShare();
    mountPage();
    await screen.findByRole("heading", { level: 1, name: "Arrival" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share this page" })); });
    expect(share).toHaveBeenCalledWith({ title: "Arrival · Lisbon in 3 days", url: `${ORIGIN}/@alice/lisbon/day-1/arrival` });
  });

  it("the URL uses the API's slugs, not the URL as typed", async () => {
    installFakeApi({ "GET /public/pages/alice/Lisbon/DAY-1/Arrival": () => ok(pageView()), "GET /public/collections/alice/Lisbon": () => ok(outline()) });
    const share = stubShare();
    mountPage(["Lisbon", "DAY-1", "Arrival"]);
    await screen.findByRole("heading", { level: 1, name: "Arrival" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share this page" })); });
    expect(share.mock.calls[0][0].url).toBe(`${ORIGIN}/@alice/lisbon/day-1/arrival`);
  });

  it("unlisted pages can be shared too", async () => {
    installFakeApi({ "GET /public/pages/alice/lisbon/day-1/arrival": () => ok(pageView(true)), "GET /public/collections/alice/lisbon": () => ok(outline({ unlisted: true })) });
    mountPage();
    await screen.findByRole("heading", { level: 1, name: "Arrival" });
    expect(screen.getByRole("button", { name: "Share this page" })).toBeInTheDocument();
  });

  it("no Share while loading, on 404, or on an error", async () => {
    installFakeApi({ "GET /public/pages/alice/lisbon/day-1/arrival": () => new Promise(() => {}), "GET /public/collections/alice/lisbon": () => ok(outline()) });
    const a = mountPage();
    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: /^Share/ })).toBeNull();
    a.unmount();
    installFakeApi({ "GET /public/pages/alice/lisbon/day-1/arrival": () => err(404, "Not found"), "GET /public/collections/alice/lisbon": () => ok(outline()) });
    const b = mountPage();
    await screen.findByTestId("not-available");
    expect(screen.queryByRole("button", { name: /^Share/ })).toBeNull();
    b.unmount();
    installFakeApi({ "GET /public/pages/alice/lisbon/day-1/arrival": () => err(500, "Server error"), "GET /public/collections/alice/lisbon": () => ok(outline()) });
    mountPage();
    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(screen.queryByRole("button", { name: /^Share/ })).toBeNull();
  });
});

describe("Share on the collection viewer", () => {
  it("shares the collection title and canonical URL (listed and unlisted)", async () => {
    for (const unlisted of [false, true]) {
      installFakeApi({ "GET /public/collections/alice/lisbon": () => ok(outline({ unlisted })) });
      const share = stubShare();
      const { unmount } = mountCollection();
      await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" });
      await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share this collection" })); });
      expect(share).toHaveBeenCalledWith({ title: "Lisbon in 3 days", url: `${ORIGIN}/@alice/lisbon` });
      unmount();
    }
  });

  it("the URL uses the API's slug", async () => {
    installFakeApi({ "GET /public/collections/alice/LISBON": () => ok(outline()) });
    const share = stubShare();
    mountCollection("LISBON");
    await screen.findByRole("heading", { level: 1, name: "Lisbon in 3 days" });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Share this collection" })); });
    expect(share.mock.calls[0][0].url).toBe(`${ORIGIN}/@alice/lisbon`);
  });

  it("shown even when there is no published page to start with (empty outline)", async () => {
    installFakeApi({ "GET /public/collections/alice/lisbon": () => ok(outline({ modules: [] })) });
    mountCollection();
    await screen.findByTestId("no-content");
    expect(screen.getByRole("button", { name: "Share this collection" })).toBeInTheDocument();
  });

  it("no Share while loading, on 404, or on an error", async () => {
    installFakeApi({ "GET /public/collections/alice/lisbon": () => new Promise(() => {}) });
    const a = mountCollection();
    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: /^Share/ })).toBeNull();
    a.unmount();
    installFakeApi({ "GET /public/collections/alice/lisbon": () => err(404, "Not found") });
    const b = mountCollection();
    await screen.findByTestId("not-available");
    expect(screen.queryByRole("button", { name: /^Share/ })).toBeNull();
    b.unmount();
    installFakeApi({ "GET /public/collections/alice/lisbon": () => err(500, "Server error") });
    mountCollection();
    await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(screen.queryByRole("button", { name: /^Share/ })).toBeNull();
  });
});
