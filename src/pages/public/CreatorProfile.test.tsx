import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_NAME } from "@/hooks/useDocumentTitle";
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

beforeEach(() => { where.loc = ""; document.title = "Before"; });
afterEach(() => { vi.unstubAllGlobals(); });

describe("CreatorProfile", () => {
  it("renders the header: banner, avatar, name, @username, bio, social links and join date", async () => {
    installFakeApi({ [CREATOR]: () => ok(creator()), [COLLECTIONS()]: () => ok(paged([])) });
    const { container } = mountProfile();
    expect(await screen.findByRole("heading", { level: 1, name: "Alice Liddell" })).toBeInTheDocument();
    expect(screen.getByText("@alice")).toBeInTheDocument();
    expect(screen.getByText(/Travel writer\./)).toBeInTheDocument();
    expect(screen.getByText(/Joined January 2026/)).toBeInTheDocument();
    const banner = screen.getByTestId("creator-banner");
    const avatar = screen.getByTestId("creator-avatar");
    expect(banner).toHaveAttribute("src", "https://img.example.org/banner.png");
    expect(avatar).toHaveAttribute("src", "https://img.example.org/alice.png");
    for (const img of [banner, avatar]) expect(img).toHaveAttribute("referrerpolicy", "no-referrer");
    // never a CSS url() built from a string
    expect(container.innerHTML).not.toMatch(/url\(/);
  });

  it("renders social links as text labels with safe attributes", async () => {
    installFakeApi({
      [CREATOR]: () => ok(creator({ socialLinks: { "<b>GitHub</b>": "https://github.com/alice" } })),
      [COLLECTIONS()]: () => ok(paged([])),
    });
    mountProfile();
    const nav = await screen.findByRole("list", { name: "Links" });
    const link = within(nav).getByRole("link", { name: "<b>GitHub</b>" });   // the label is text, never HTML
    expect(link).toHaveAttribute("href", "https://github.com/alice");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(nav.querySelector("b")).toBeNull();
  });

  it("omits the banner, avatar, bio and links when the creator has none, and never renders a non-https image", async () => {
    installFakeApi({
      [CREATOR]: () => ok(creator({ bio: "", bannerUrl: null, avatarUrl: "http://insecure.example.org/a.png", socialLinks: {} })),
      [COLLECTIONS()]: () => ok(paged([])),
    });
    mountProfile();
    await screen.findByRole("heading", { level: 1, name: "Alice Liddell" });
    expect(screen.queryByTestId("creator-banner")).toBeNull();
    expect(screen.queryByTestId("creator-avatar")).toBeNull();
    expect(screen.queryByRole("list", { name: "Links" })).toBeNull();
  });

  it("falls back to the username when there is no display name", async () => {
    installFakeApi({ [CREATOR]: () => ok(creator({ displayName: "" })), [COLLECTIONS()]: () => ok(paged([])) });
    mountProfile();
    expect(await screen.findByRole("heading", { level: 1, name: "alice" })).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe(`alice (@alice) · ${SITE_NAME}`));
  });

  it("sets the title to '<displayName> (@username) · AlgoQuest'", async () => {
    installFakeApi({ [CREATOR]: () => ok(creator()), [COLLECTIONS()]: () => ok(paged([])) });
    mountProfile();
    await screen.findByRole("heading", { level: 1, name: "Alice Liddell" });
    await waitFor(() => expect(document.title).toBe(`Alice Liddell (@alice) · ${SITE_NAME}`));
  });

  it("groups published collections by category in API order, with uncategorized ones under 'Other' last", async () => {
    installFakeApi({
      [CREATOR]: () => ok(creator()),
      [COLLECTIONS()]: () => ok(paged([
        summary("porto"), summary("notes", null), summary("java", { slug: "programming", name: "Programming" }), summary("lisbon"),
      ])),
    });
    mountProfile();
    const section = await screen.findByRole("region", { name: "Collections" });
    await waitFor(() => expect(within(section).getAllByTestId("collection-card")).toHaveLength(4));
    const groups = within(section).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(groups).toEqual(["Travel", "Programming", "Other"]);
    const travel = within(section).getByRole("list", { name: "Travel" });
    expect(within(travel).getAllByTestId("collection-card").map((a) => a.getAttribute("href"))).toEqual(["/@alice/porto", "/@alice/lisbon"]);
    expect(within(within(section).getByRole("list", { name: "Other" })).getByTestId("collection-card")).toHaveAttribute("href", "/@alice/notes");
    // on the creator's own profile the cards don't repeat a link back to this page
    expect(within(section).queryAllByRole("link", { name: "Alice Liddell" })).toHaveLength(0);
  });

  it("shows an empty state when the creator has no published collections", async () => {
    installFakeApi({ [CREATOR]: () => ok(creator()), [COLLECTIONS()]: () => ok(paged([])) });
    mountProfile();
    expect(await screen.findByText("No published collections yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Load more/ })).toBeNull();
  });

  it.each([["PRIVATE"], ["unknown"], ["suspended"]])("a %s creator (profile 404) gets the neutral not-available screen and no collections request", async () => {
    const fake = installFakeApi({ [CREATOR]: () => err(404, "Creator not found"), [COLLECTIONS()]: () => ok(paged([summary("porto")])) });
    mountProfile();
    expect(await screen.findByRole("heading", { level: 1, name: "This profile isn't available" })).toBeInTheDocument();
    expect(screen.getByTestId("not-available")).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe(`Not available · ${SITE_NAME}`));
    await new Promise((r) => setTimeout(r, 30));
    expect(fake.calls.filter((c) => c.path.startsWith("/public/collections"))).toEqual([]);
    expect(screen.queryByTestId("collection-card")).toBeNull();
  });

  it("an error loading the profile offers a retry and never shows collections", async () => {
    let fail = true;
    const fake = installFakeApi({ [CREATOR]: () => (fail ? err(503, "Service unavailable") : ok(creator())), [COLLECTIONS()]: () => ok(paged([summary("porto")])) });
    mountProfile();
    expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Service unavailable");
    expect(fake.calls.filter((c) => c.path.startsWith("/public/collections"))).toEqual([]);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Alice Liddell" })).toBeInTheDocument();
    expect(await screen.findByTestId("collection-card")).toBeInTheDocument();
  });

  it("an error loading the first collections page keeps the header and offers a retry", async () => {
    let fail = true;
    installFakeApi({ [CREATOR]: () => ok(creator()), [COLLECTIONS()]: () => (fail ? err(503, "Service unavailable") : ok(paged([summary("porto")]))) });
    mountProfile();
    await screen.findByRole("heading", { level: 1, name: "Alice Liddell" });
    const section = await screen.findByRole("region", { name: "Collections" });
    expect(await within(section).findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Service unavailable");
    fail = false;
    fireEvent.click(within(section).getByRole("button", { name: "Try again" }));
    expect(await within(section).findByTestId("collection-card")).toHaveAttribute("href", "/@alice/porto");
  });

  it("has a Share button for the profile", async () => {
    installFakeApi({ [CREATOR]: () => ok(creator()), [COLLECTIONS()]: () => ok(paged([])) });
    mountProfile();
    expect(await screen.findByRole("button", { name: "Share this profile" })).toBeInTheDocument();
  });

  it("opening a card goes to the collection", async () => {
    installFakeApi({ [CREATOR]: () => ok(creator()), [COLLECTIONS()]: () => ok(paged([summary("porto")])) });
    mountProfile();
    fireEvent.click(await screen.findByTestId("collection-card"));
    await waitFor(() => expect(where.loc).toBe("/@alice/porto"));
  });
});
