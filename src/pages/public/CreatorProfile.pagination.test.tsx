import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { err, installFakeApi, ok } from "@/test/fakeApi";
import { COLLECTIONS, CREATOR, creator, paged, summary } from "@/test/creatorProfileFixtures";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import CreatorProfile from "./CreatorProfile";

const where = { loc: "" };
function Spy() { where.loc = useLocation().pathname; return null; }
function mountProfile() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } })}>
      <MemoryRouter initialEntries={["/@alice"]}>
        <Routes>
          <Route path="/:handle" element={<><CreatorProfile username="alice" /><Spy /></>} />
          <Route path="/:handle/:collectionSlug" element={<Spy />} />
          <Route path="/discover" element={<Spy />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// Step 15b, plan rev. 2.1 §3.3 / §5: "Load more" pagination of the creator's collections.
afterEach(() => { vi.unstubAllGlobals(); });

const loadMore = () => screen.getByRole("button", { name: "Load more collections" });
const hrefs = () => screen.getAllByTestId("collection-card").map((a) => a.getAttribute("href"));

describe("CreatorProfile pagination", () => {
  it("shows Load more only while there are more pages, with 'Showing N of M', and removes it after the last page", async () => {
    const fake = installFakeApi({
      [CREATOR]: () => ok(creator()),
      [COLLECTIONS(0)]: () => ok(paged([summary("c1"), summary("c2")], 0, 2, 3)),
      [COLLECTIONS(1)]: () => ok(paged([summary("c3")], 1, 2, 3)),
    });
    mountProfile();
    await waitFor(() => expect(hrefs()).toHaveLength(2));
    expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
    fireEvent.click(loadMore());
    await waitFor(() => expect(hrefs()).toHaveLength(3));
    expect(screen.queryByRole("button", { name: "Load more collections" })).toBeNull();
    expect(screen.queryByText(/Showing \d+ of \d+/)).toBeNull();
    expect(fake.calls.map((c) => c.path).filter((p) => p.startsWith("/public/collections")))
      .toEqual(["/public/collections?creator=alice&page=0&size=50", "/public/collections?creator=alice&page=1&size=50"]);
  });

  it("a single page shows no Load more", async () => {
    installFakeApi({ [CREATOR]: () => ok(creator()), [COLLECTIONS(0)]: () => ok(paged([summary("c1")], 0, 1, 1)) });
    mountProfile();
    await waitFor(() => expect(hrefs()).toHaveLength(1));
    expect(screen.queryByRole("button", { name: "Load more collections" })).toBeNull();
  });

  it("a next-page error leaves the loaded collections visible and offers a retry", async () => {
    let fail = true;
    installFakeApi({
      [CREATOR]: () => ok(creator()),
      [COLLECTIONS(0)]: () => ok(paged([summary("c1"), summary("c2")], 0, 2, 3)),
      [COLLECTIONS(1)]: () => (fail ? err(503, "Service unavailable") : ok(paged([summary("c3")], 1, 2, 3))),
    });
    mountProfile();
    await waitFor(() => expect(hrefs()).toHaveLength(2));
    fireEvent.click(loadMore());
    const alert = await screen.findByRole("alert", {}, { timeout: 3000 });
    expect(alert).toHaveTextContent("Couldn't load more collections");
    expect(hrefs()).toEqual(["/@alice/c1", "/@alice/c2"]);           // nothing already shown disappears
    fail = false;
    fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(hrefs()).toEqual(["/@alice/c1", "/@alice/c2", "/@alice/c3"]));
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a collection returned on two pages renders exactly once", async () => {
    installFakeApi({
      [CREATOR]: () => ok(creator()),
      [COLLECTIONS(0)]: () => ok(paged([summary("c1"), summary("c2")], 0, 2, 3)),
      // c2 shifted onto page 1 (a collection was published meanwhile): de-duplicated by username/slug
      [COLLECTIONS(1)]: () => ok(paged([summary("c2"), summary("c3")], 1, 2, 3)),
    });
    mountProfile();
    await waitFor(() => expect(hrefs()).toHaveLength(2));
    fireEvent.click(loadMore());
    await waitFor(() => expect(hrefs()).toHaveLength(3));
    expect(hrefs()).toEqual(["/@alice/c1", "/@alice/c2", "/@alice/c3"]);
  });

  it("category groups update after another page loads: an existing group grows and a new group appears", async () => {
    const prog = { slug: "programming", name: "Programming" };
    installFakeApi({
      [CREATOR]: () => ok(creator()),
      [COLLECTIONS(0)]: () => ok(paged([summary("t1"), summary("t2")], 0, 2, 4)),
      [COLLECTIONS(1)]: () => ok(paged([summary("t3"), summary("p1", prog)], 1, 2, 4)),
    });
    mountProfile();
    await waitFor(() => expect(hrefs()).toHaveLength(2));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Travel"]);
    fireEvent.click(loadMore());
    await waitFor(() => expect(hrefs()).toHaveLength(4));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Travel", "Programming"]);
    expect(within(screen.getByRole("list", { name: "Travel" })).getAllByTestId("collection-card")).toHaveLength(3);
    expect(within(screen.getByRole("list", { name: "Programming" })).getAllByTestId("collection-card")).toHaveLength(1);
  });

  it("focus stays on Load more after a page loads while more pages remain", async () => {
    installFakeApi({
      [CREATOR]: () => ok(creator()),
      [COLLECTIONS(0)]: () => ok(paged([summary("c1")], 0, 3, 3)),
      [COLLECTIONS(1)]: () => ok(paged([summary("c2")], 1, 3, 3)),
    });
    mountProfile();
    await waitFor(() => expect(hrefs()).toHaveLength(1));
    const button = loadMore();
    act(() => button.focus());
    fireEvent.click(button);
    await waitFor(() => expect(hrefs()).toHaveLength(2));
    expect(loadMore()).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(screen.getByText("Showing 2 of 3")).toBeInTheDocument();
  });

  it("focus moves to the first new card when the button disappears", async () => {
    installFakeApi({
      [CREATOR]: () => ok(creator()),
      [COLLECTIONS(0)]: () => ok(paged([summary("c1")], 0, 2, 3)),
      [COLLECTIONS(1)]: () => ok(paged([summary("c2"), summary("c3")], 1, 2, 3)),
    });
    mountProfile();
    await waitFor(() => expect(hrefs()).toHaveLength(1));
    const button = loadMore();
    act(() => button.focus());
    fireEvent.click(button);
    await waitFor(() => expect(hrefs()).toHaveLength(3));
    await waitFor(() => expect(document.activeElement).toHaveAttribute("href", "/@alice/c2"));
  });

  it("no collections request is made after a profile 404", async () => {
    const fake = installFakeApi({ [CREATOR]: () => err(404, "Creator not found"), [COLLECTIONS(0)]: () => ok(paged([summary("c1")])) });
    mountProfile();
    await screen.findByTestId("not-available");
    await new Promise((r) => setTimeout(r, 30));
    expect(fake.calls.filter((c) => c.path.startsWith("/public/collections"))).toEqual([]);
  });
});
