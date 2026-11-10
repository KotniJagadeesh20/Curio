import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import { err, installFakeApi, ok } from "@/test/fakeApi";
import AdminDashboard from "./AdminDashboard";
import AdminProblems from "./AdminProblems";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const problem = { id: 1, slug: "two-sum", title: "Two Sum", difficulty: "easy", trackSlug: "dsa", category: "Arrays", concept: "Hash", excerpt: "", published: true };
const collection = (o: object) => ({
  id: 1, slug: "dsa", title: "Data Structures", description: "", coverUrl: null, categoryId: null, status: "PUBLISHED", publiclyVisible: true,
  hiddenByModeration: false, moduleCount: 2, pageCount: 5, publishedPageCount: 4, draftPageCount: 1, deletedAt: null, restorableUntil: null, ...o,
});
const users = [{ id: 1, name: "Ada", email: "ada@x.com", role: "ADMIN", createdAt: "2026-01-01T00:00:00Z" }];

function mount(ui: JSX.Element) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}><MemoryRouter>{ui}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => tokenStore.set("tok"));
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("admin dashboard after the legacy track endpoints were removed", () => {
  it("shows problems, users and the admin's OWN collections, and never calls /admin/tracks", async () => {
    const api = installFakeApi({
      "GET /admin/problems": () => ok([problem]),
      "GET /admin/users": () => ok(users),
      "GET /collections/mine": () => ok([collection({}), collection({ id: 2, slug: "x", title: "Scratch", status: "DRAFT", pageCount: 1, publishedPageCount: 0 })]),
    });
    mount(<AdminDashboard />);
    await screen.findByText("Your collections", { selector: "p" });
    expect(screen.getByText("1 published, 1 other")).toBeInTheDocument();
    expect(screen.getByText("Data Structures")).toBeInTheDocument();
    expect(screen.getByText("Scratch")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Manage" })).toHaveAttribute("href", "/create");
    expect(api.calls.map((c) => `${c.method} ${c.path}`).sort()).toEqual(["GET /admin/problems", "GET /admin/users", "GET /collections/mine"]);
  });

  it("a failing request shows a retryable error instead of a blank screen", async () => {
    installFakeApi({ "GET /admin/problems": () => err(500, "boom"), "GET /admin/users": () => ok(users), "GET /collections/mine": () => ok([]) });
    mount(<AdminDashboard />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });
});

describe("admin problem management still works", () => {
  it("lists problems, resolving each track's name from the admin's own collections", async () => {
    installFakeApi({ "GET /admin/problems": () => ok([problem]), "GET /collections/mine": () => ok([collection({})]) });
    mount(<AdminProblems />);
    const row = (await screen.findByText("Two Sum")).closest("tr")!;
    expect(within(row).getByText("Data Structures")).toBeInTheDocument();
  });

  it("the New Problem form offers those collections as tracks and creates the problem", async () => {
    const api = installFakeApi({
      "GET /admin/problems": () => ok([]), "GET /collections/mine": () => ok([collection({})]),
      "POST /admin/problems": () => ({ status: 201, body: { ...problem, id: 2 } }),
    });
    mount(<AdminProblems />);
    fireEvent.click(await screen.findByRole("button", { name: /new problem/i }));
    const dialog = await screen.findByRole("dialog");
    const track = within(dialog).getAllByRole("combobox")[0];
    expect(within(track).getByRole("option", { name: "Data Structures" })).toHaveValue("dsa");
    fireEvent.change(track, { target: { value: "dsa" } });
    fireEvent.change(within(dialog).getAllByRole("textbox")[0], { target: { value: "Valid Anagram" } });
    fireEvent.click(within(dialog).getByRole("button", { name: /create|save/i }));
    await waitFor(() => expect(api.sent("POST", "/admin/problems")).toHaveLength(1));
    expect(api.sent("POST", "/admin/problems")[0].body).toMatchObject({ trackSlug: "dsa", title: "Valid Anagram", slug: "valid-anagram" });
  });
});
