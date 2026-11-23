// Step 14d-1: the workspace's links to the public viewers (collection-level "View public page" and per-page "View").
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import type { CollectionDetail, CollectionStatus, CreatorPageSummary } from "@/lib/types";
import { installFakeApi, ok } from "@/test/fakeApi";
import CollectionEditor from "./CollectionEditor";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const auth = vi.hoisted(() => ({ user: { username: "alice", name: "Alice", role: "USER" } as { username?: string; name: string; role: string } | null }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: auth.user }) }));

const pageRow = (id: number, slug: string, title: string, status: "DRAFT" | "PUBLISHED"): CreatorPageSummary =>
  ({ id, slug, title, status, position: id, hasContent: true });

function detail(o: { status?: CollectionStatus; publiclyVisible?: boolean } = {}): CollectionDetail {
  const status = o.status ?? "PUBLISHED";
  return {
    collection: {
      id: 5, slug: "java-notes", title: "Java notes", description: "", coverUrl: null, coverAssetId: null, categoryId: 2, status,
      publiclyVisible: o.publiclyVisible ?? status !== "DRAFT", hiddenByModeration: false, moduleCount: 2, pageCount: 3,
      publishedPageCount: 2, draftPageCount: 1, deletedAt: null, restorableUntil: null,
    },
    modules: [
      { id: 7, collectionId: 5, slug: "basics", title: "Basics", position: 0, pages: [pageRow(9, "intro", "Intro", "PUBLISHED"), pageRow(10, "draft-notes", "Draft notes", "DRAFT")] },
      { id: 8, collectionId: 5, slug: "loops-and-more", title: "Loops", position: 1, pages: [pageRow(11, "for-loops", "For loops", "PUBLISHED")] },
    ],
  } as CollectionDetail;
}

function PublicStub() { const p = useParams(); return <div data-testid="public-route">{JSON.stringify(p)}</div>; }
function mount(d: CollectionDetail) {
  installFakeApi({
    "GET /collections/5": () => ok(d),
    "GET /public/categories": () => ok([{ id: 2, slug: "programming", name: "Programming", icon: "c", position: 0 }]),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/create/collections/5"]}>
        <Routes>
          <Route path="/create/collections/:id" element={<CollectionEditor id={5} />} />
          <Route path="/:handle/:collectionSlug" element={<PublicStub />} />
          <Route path="/:handle/:collectionSlug/:moduleSlug/:pageSlug" element={<PublicStub />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const collectionLink = () => screen.queryByRole("link", { name: "View public page" });
const pageLinks = () => screen.queryAllByRole("link", { name: /on the public site$/ });

beforeEach(() => { tokenStore.set("tok"); auth.user = { username: "alice", name: "Alice", role: "USER" }; });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("collection-level 'View public page' link", () => {
  it.each<[string, CollectionStatus]>([["published", "PUBLISHED"], ["unlisted", "UNLISTED"]])(
    "%s and publicly visible → links to the real collection viewer URL", async (_n, status) => {
      mount(detail({ status }));
      await screen.findByRole("heading", { name: "Basics" });
      expect(collectionLink()).toHaveAttribute("href", "/@alice/java-notes");
    });

  it("is hidden for a draft, for a collection readers can't open, and without a username", async () => {
    const cases: [string, () => void, CollectionDetail][] = [
      ["draft", () => {}, detail({ status: "DRAFT" })],
      ["not publicly visible", () => {}, detail({ status: "PUBLISHED", publiclyVisible: false })],
      ["no username", () => { auth.user = { name: "Alice", role: "USER" }; }, detail()],
    ];
    for (const [name, setup, d] of cases) {
      setup();
      const { unmount } = mount(d);
      await screen.findByRole("heading", { name: "Basics" });
      expect(collectionLink(), name).toBeNull();
      unmount();
      auth.user = { username: "alice", name: "Alice", role: "USER" };
    }
  });
});

describe("per-page 'View' links (Q-d3)", () => {
  it("one per PUBLISHED page, module-qualified, pointing at the real page viewer URL; none for draft pages", async () => {
    mount(detail());
    await screen.findByRole("heading", { name: "Basics" });
    expect(pageLinks().map((a) => [a.textContent, a.getAttribute("href")])).toEqual([
      ["View", "/@alice/java-notes/basics/intro"],
      ["View", "/@alice/java-notes/loops-and-more/for-loops"],
    ]);
    expect(within(screen.getByTestId("page-10")).queryByRole("link", { name: /on the public site$/ })).toBeNull();
    expect(within(screen.getByTestId("page-9")).getByRole("link", { name: "View Intro on the public site" })).toBeInTheDocument();
  });

  it("unlisted collections get them too (readable by link)", async () => {
    mount(detail({ status: "UNLISTED" }));
    await screen.findByRole("heading", { name: "Basics" });
    expect(pageLinks()).toHaveLength(2);
  });

  it("none when the collection is a draft, not publicly visible, or the creator has no username", async () => {
    for (const [name, d, user] of [
      ["draft", detail({ status: "DRAFT" }), { username: "alice", name: "Alice", role: "USER" }],
      ["not publicly visible", detail({ publiclyVisible: false }), { username: "alice", name: "Alice", role: "USER" }],
      ["no username", detail(), { name: "Alice", role: "USER" }],
    ] as const) {
      auth.user = { ...user };
      const { unmount } = mount(d);
      await screen.findByRole("heading", { name: "Basics" });
      expect(pageLinks(), name).toHaveLength(0);
      unmount();
    }
  });

  it("following a per-page link opens the public page route with the right params", async () => {
    mount(detail());
    await screen.findByRole("heading", { name: "Basics" });
    fireEvent.click(pageLinks()[1]);
    expect(await screen.findByTestId("public-route")).toHaveTextContent(JSON.stringify({ handle: "@alice", collectionSlug: "java-notes", moduleSlug: "loops-and-more", pageSlug: "for-loops" }));
  });

  it("doesn't collide with the collection link's accessible name", async () => {
    mount(detail());
    await screen.findByRole("heading", { name: "Basics" });
    expect(screen.getAllByRole("link", { name: /view public page/i })).toHaveLength(1);
  });
});
