import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import type { CollectionSummary } from "@/lib/types";
import { err, installFakeApi, ok } from "@/test/fakeApi";
import Workspace from "./Workspace";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const base: CollectionSummary = {
  id: 1, slug: "java", title: "Java", description: "", coverUrl: null, categoryId: null, status: "DRAFT",
  publiclyVisible: false, hiddenByModeration: false, moduleCount: 0, pageCount: 0, publishedPageCount: 0, draftPageCount: 0,
  deletedAt: null, restorableUntil: null,
};
const col = (o: Partial<CollectionSummary>): CollectionSummary => ({ ...base, ...o });

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/create"]}>
        <Routes>
          <Route path="/create" element={<Workspace />} />
          <Route path="/create/collections/:id" element={<div data-testid="editor-route" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { tokenStore.set("tok"); toast.success.mockClear(); toast.error.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("My Collections list", () => {
  it("shows a loading state, then each collection with its status, counts and visibility notes", async () => {
    installFakeApi({
      "GET /categories": () => ok([]), "GET /public/categories": () => ok([]),
      "GET /collections/mine": () => ok([
        col({ id: 1, title: "Draft one", status: "DRAFT", moduleCount: 1, pageCount: 2, publishedPageCount: 0, draftPageCount: 2 }),
        col({ id: 2, title: "Live one", status: "PUBLISHED", publiclyVisible: true, moduleCount: 2, pageCount: 3, publishedPageCount: 3 }),
        col({ id: 3, title: "Quiet one", status: "UNLISTED", publiclyVisible: true, pageCount: 1, publishedPageCount: 1 }),
        col({ id: 4, title: "Empty live", status: "PUBLISHED", publiclyVisible: false }),
        col({ id: 5, title: "Hidden one", status: "PUBLISHED", hiddenByModeration: true }),
      ]),
    });
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading your collections");
    await screen.findByText("Draft one");

    const row = (title: string) => screen.getByText(title).closest("li")!;
    expect(within(row("Draft one")).getByTestId("status-badge")).toHaveTextContent("Draft");
    expect(row("Draft one")).toHaveTextContent("1 module · 2 pages");
    expect(row("Draft one")).toHaveTextContent("2 draft pages are not visible to readers.");
    expect(within(row("Live one")).getByTestId("status-badge")).toHaveTextContent("Published");
    expect(row("Live one")).toHaveTextContent("3 published");
    expect(within(row("Quiet one")).getByTestId("status-badge")).toHaveTextContent("Unlisted");
    expect(row("Empty live")).toHaveTextContent("Not visible to readers yet: it has no published page.");
    expect(row("Hidden one")).toHaveTextContent("Hidden by moderation");
    expect(row("Live one")).not.toHaveTextContent("not visible");
  });

  it("an empty workspace invites the first collection", async () => {
    installFakeApi({ "GET /collections/mine": () => ok([]), "GET /public/categories": () => ok([]) });
    mount();
    expect(await screen.findByText(/no collections yet/i)).toBeInTheDocument();
  });

  it("a server error shows a retryable message", async () => {
    let fail = true;
    installFakeApi({ "GET /collections/mine": () => (fail ? err(500, "Database down") : ok([col({ title: "Back" })])), "GET /public/categories": () => ok([]) });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Database down");
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Back")).toBeInTheDocument();
  });

  it("lists recently deleted collections and restores one (it comes back as a draft)", async () => {
    let deleted = [col({ id: 9, title: "Old", deletedAt: "2026-10-01T00:00:00Z", restorableUntil: "2026-12-01T00:00:00Z" })];
    const api = installFakeApi({
      "GET /public/categories": () => ok([]),
      "GET /collections/mine": () => ok([]),
      "GET /collections/mine?deleted=true": () => ok(deleted),
      "POST /collections/9/restore": () => { deleted = []; return ok(col({ id: 9 })); },
    });
    mount();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Recently deleted" }), { button: 0 });
    fireEvent.click(screen.getByRole("tab", { name: "Recently deleted" }));
    await screen.findByText("Old");
    expect(screen.getByText(/restored until/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /restore/i }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Collection restored as a draft"));
    expect(api.sent("POST", "/collections/9/restore")).toHaveLength(1);
    await screen.findByText(/nothing was deleted/i);
  });

  it("a failed restore shows the server's reason", async () => {
    installFakeApi({
      "GET /public/categories": () => ok([]), "GET /collections/mine": () => ok([]),
      "GET /collections/mine?deleted=true": () => ok([col({ id: 9, title: "Old", deletedAt: "x", restorableUntil: null })]),
      "POST /collections/9/restore": () => err(409, "Slug already in use"),
    });
    mount();
    fireEvent.mouseDown(await screen.findByRole("tab", { name: "Recently deleted" }), { button: 0 });
    fireEvent.click(screen.getByRole("tab", { name: "Recently deleted" }));
    fireEvent.click(await screen.findByRole("button", { name: /restore/i }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Slug already in use"));
  });
});

describe("create collection", () => {
  const open = async (routes: Parameters<typeof installFakeApi>[0] = {}) => {
    const api = installFakeApi({ "GET /collections/mine": () => ok([]), "GET /public/categories": () => ok([{ id: 3, slug: "travel", name: "Travel", icon: "x", position: 0 }]), ...routes });
    mount();
    fireEvent.click(await screen.findByRole("button", { name: /new collection/i }));
    await screen.findByRole("dialog");
    return api;
  };
  const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
  const submit = () => fireEvent.click(screen.getByRole("button", { name: "Create collection" }));

  it("a blank title is refused on the page with no request", async () => {
    const api = await open();
    submit();
    expect(await screen.findByText("A title is required")).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("an invalid URL name and a non-https cover are refused before any request", async () => {
    const api = await open();
    type("Title", "Java");
    type("URL name", "Bad Slug");
    type("Cover image link", "http://x.com/a.png");
    submit();
    expect(await screen.findByText(/lowercase letters, numbers and single hyphens/i)).toBeInTheDocument();
    expect(screen.getByText(/must be an https/i)).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("creates the collection (title only is enough) and opens its editor", async () => {
    const api = await open({ "POST /collections": () => ({ status: 201, body: col({ id: 42, title: "Java" }) }) });
    type("Title", "  Java  ");
    submit();
    expect(await screen.findByTestId("editor-route")).toBeInTheDocument();
    const [post] = api.sent("POST", "/collections");
    expect(post.body).toEqual({ title: "Java", description: "", coverUrl: "" });     // no slug: the server derives it; no owner/status
    expect(post.headers.Authorization).toBe("Bearer tok");
    expect(toast.success).toHaveBeenCalledWith("Collection created");
  });

  it("sends the URL name when one is typed", async () => {
    const api = await open({ "POST /collections": () => ({ status: 201, body: col({ id: 42 }) }) });
    type("Title", "Java");
    type("URL name", "java-basics");
    type("Cover image link", "https://cdn.example.com/a.png");
    submit();
    await screen.findByTestId("editor-route");
    expect(api.sent("POST", "/collections")[0].body).toMatchObject({ slug: "java-basics", coverUrl: "https://cdn.example.com/a.png" });
  });

  it("a taken URL name (409) is explained in the dialog, which stays open", async () => {
    await open({ "POST /collections": () => err(409, "Slug already in use") });
    type("Title", "Java");
    type("URL name", "java");
    submit();
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Slug already in use");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("shows a pending state and ignores a second click while saving", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const api = await open({ "POST /collections": async () => { await gate; return { status: 201, body: col({ id: 42 }) }; } });
    type("Title", "Java");
    submit();
    const button = await screen.findByRole("button", { name: "Create collection" });
    await waitFor(() => expect(button).toBeDisabled());
    fireEvent.click(button);
    release();
    await screen.findByTestId("editor-route");
    expect(api.sent("POST", "/collections")).toHaveLength(1);
  });

  it("an expired session (401) is reported, not swallowed", async () => {
    await open({ "POST /collections": () => err(401, "Unauthorized") });
    type("Title", "Java");
    submit();
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Unauthorized");
  });

  it("offers the categories from the server", async () => {
    const api = await open();
    expect(api.sent("GET", "/public/categories").length).toBeGreaterThan(0);
    const trigger = screen.getByRole("combobox", { name: "Category" });
    await waitFor(() => expect(trigger).not.toBeDisabled());
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    fireEvent.click(await screen.findByRole("option", { name: "Travel" }));
    type("Title", "Trip");
    submit();
    await waitFor(() => expect(api.sent("POST", "/collections")[0]?.body).toMatchObject({ categoryId: 3 }));
  });
});
