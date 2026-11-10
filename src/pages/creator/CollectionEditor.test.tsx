import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import type { CollectionDetail, CollectionStatus, CreatorModule, CreatorPage } from "@/lib/types";
import { err, installFakeApi, ok, type Reply } from "@/test/fakeApi";
import { FakeXhr, asset, imageFile, trackObjectUrls } from "@/test/fakeXhr";
import CollectionEditor from "./CollectionEditor";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => ({ user: { username: "alice", name: "Alice", role: "USER" } }) }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div>not-found-screen</div> }));

/** A small in-memory model of the server's answer for collection 5, mutated by the handlers below. */
function makeServer(status: CollectionStatus = "DRAFT") {
  const modules: CreatorModule[] = [
    { id: 7, collectionId: 5, slug: "basics", title: "Basics", position: 0, pages: [
      { id: 9, slug: "intro", title: "Intro", status: "DRAFT", position: 0, hasContent: false },
      { id: 10, slug: "loops", title: "Loops", status: "PUBLISHED", position: 1, hasContent: true },
    ] },
    { id: 8, collectionId: 5, slug: "advanced", title: "Advanced", position: 1, pages: [] },
  ];
  const s = { status, title: "Java", slug: "java", description: "About Java", coverUrl: null as string | null, coverAssetId: null as string | null, categoryId: 2 as number | null, modules };
  const detail = (): CollectionDetail => {
    const pages = s.modules.flatMap((m) => m.pages);
    const published = pages.filter((p) => p.status === "PUBLISHED").length;
    return {
      collection: {
        id: 5, slug: s.slug, title: s.title, description: s.description, coverUrl: s.coverUrl, coverAssetId: s.coverAssetId, categoryId: s.categoryId, status: s.status,
        publiclyVisible: s.status !== "DRAFT" && published > 0, hiddenByModeration: false, moduleCount: s.modules.length,
        pageCount: pages.length, publishedPageCount: published, draftPageCount: pages.length - published, deletedAt: null, restorableUntil: null,
      },
      modules: JSON.parse(JSON.stringify(s.modules)),
    };
  };
  const findPage = (id: number) => s.modules.flatMap((m) => m.pages).find((p) => p.id === id)!;
  return { s, detail, findPage };
}

type Server = ReturnType<typeof makeServer>;

function routes(sv: Server, extra: Record<string, (r: { body: unknown }) => Reply> = {}) {
  const move = <T extends { position: number }>(list: T[], idx: number, pos: number) => {
    const [x] = list.splice(idx, 1); list.splice(pos, 0, x); list.forEach((e, i) => (e.position = i));
  };
  return {
    "GET /collections/5": () => ok(sv.detail()),
    "GET /public/categories": () => ok([{ id: 2, slug: "programming", name: "Programming", icon: "c", position: 0 }]),
    "GET /pages/9": () => ok({ id: 9, moduleId: 7, collectionId: 5, slug: "intro", title: "Intro", summary: "Existing summary", blocks: [], status: "DRAFT", position: 0, legacy: false, legacyContent: null } as CreatorPage),
    "POST /collections/5/publish": ({ body }: { body: unknown }) => {
      if (sv.detail().collection.publishedPageCount === 0) return err(400, "Add at least one published page before publishing this collection");
      sv.s.status = (body as { status?: CollectionStatus })?.status ?? "PUBLISHED";
      return ok({});
    },
    "POST /collections/5/unpublish": () => { sv.s.status = "DRAFT"; return ok({}); },
    "PUT /collections/5": ({ body }: { body: unknown }) => {
      const b = body as { title: string; coverAssetId?: string | null };
      sv.s.title = b.title;
      if (b.coverAssetId !== undefined) sv.s.coverAssetId = b.coverAssetId;
      return ok({});
    },
    "DELETE /collections/5": () => ({ status: 204 }),
    "POST /collections/5/modules": ({ body }: { body: unknown }) => {
      const b = body as { title: string };
      sv.s.modules.push({ id: 11, collectionId: 5, slug: "new", title: b.title, position: sv.s.modules.length, pages: [] });
      return { status: 201, body: {} };
    },
    "POST /modules/7/pages": ({ body }: { body: unknown }) => {
      sv.s.modules[0].pages.push({ id: 12, slug: "new-page", title: (body as { title: string }).title, status: "DRAFT", position: 2, hasContent: false });
      return { status: 201, body: {} };
    },
    "PUT /pages/9": ({ body }: { body: unknown }) => { sv.findPage(9).title = (body as { title: string }).title; return ok({}); },
    "POST /pages/9/publish": () => { sv.findPage(9).status = "PUBLISHED"; return ok({}); },
    "POST /pages/10/unpublish": () => { sv.findPage(10).status = "DRAFT"; return ok({}); },
    "DELETE /pages/9": () => { sv.s.modules[0].pages.splice(0, 1); return { status: 204 }; },
    "DELETE /modules/7": () => { sv.s.modules.splice(0, 1); return { status: 204 }; },
    "PATCH /modules/7/reorder": ({ body }: { body: unknown }) => { move(sv.s.modules, 0, (body as { position: number }).position); return ok({}); },
    "PATCH /pages/9/reorder": ({ body }: { body: unknown }) => { move(sv.s.modules[0].pages, 0, (body as { position: number }).position); return ok({}); },
    ...extra,
  };
}

function mount(id = 5) {
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/create/collections/" + id]}>
        <Routes>
          <Route path="/create/collections/:id" element={<CollectionEditor id={id} />} />
          <Route path="/create" element={<div data-testid="workspace-route" />} />
          <Route path="/create/pages/:id" element={<div data-testid="page-editor-route" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const btn = (name: string | RegExp) => screen.getByRole("button", { name });
const page = (id: number) => screen.getByTestId(`page-${id}`);
const mod = (id: number) => screen.getByTestId(`module-${id}`);
const titles = () => screen.getAllByTestId(/^module-/).map((m) => within(m).getByRole("heading").textContent);
const pub = () => within(screen.getByTestId("publishing"));
const dialog = () => within(screen.getByRole("dialog"));

beforeEach(() => { tokenStore.set("tok"); toast.success.mockClear(); toast.error.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("loading and access", () => {
  it("shows loading, then the collection with its modules and pages", async () => {
    installFakeApi(routes(makeServer()));
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading collection");
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(titles()).toEqual(["Basics", "Advanced"]);
    expect(within(page(9)).getByTestId("status-badge")).toHaveTextContent("Draft");
    expect(within(page(10)).getByTestId("status-badge")).toHaveTextContent("Published");
    expect(screen.getByText(/1 draft page is not visible/i)).toBeInTheDocument();
  });

  it.each([[404, "Collection not found"], [403, "You do not own this collection"]])("%s shows the not-found screen (never someone else's content)", async (status, msg) => {
    const api = installFakeApi({ ...routes(makeServer()), "GET /collections/5": () => err(status, msg) });
    mount();
    expect(await screen.findByText("not-found-screen")).toBeInTheDocument();
    expect(api.sent("GET", "/collections/5")).toHaveLength(1);                 // an answer, not retried
  });

  it("a server error is retryable", async () => {
    const sv = makeServer();
    let fail = true;
    installFakeApi({ ...routes(sv), "GET /collections/5": () => (fail ? err(500, "Database down") : ok(sv.detail())) });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Database down");
    fail = false;
    fireEvent.click(btn("Try again"));
    await screen.findByRole("heading", { name: "Java", level: 1 });
  });

  it("tells creators that content is written in the page editor", async () => {
    installFakeApi(routes(makeServer()));
    mount();
    expect(await screen.findByTestId("body-editor-notice")).toHaveTextContent(/open a page to write its content/i);
  });
});

describe("publishing a collection", () => {
  it("is disabled, with the reason, while no page is published", async () => {
    const sv = makeServer();
    sv.findPage(10).status = "DRAFT";
    installFakeApi(routes(sv));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(pub().getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(pub().getByRole("button", { name: "Publish as unlisted" })).toBeDisabled();
    expect(screen.getByTestId("publish-hint")).toBeInTheDocument();
  });

  it("publishes, and the screen reflects the new status from the refreshed data", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(pub().getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(screen.getAllByTestId("status-badge")[0]).toHaveTextContent("Published"));
    expect(api.sent("POST", "/collections/5/publish")[0].body).toEqual({});
    expect(toast.success).toHaveBeenCalledWith("Collection published");
    expect(pub().getByRole("button", { name: "Unpublish" })).toBeInTheDocument();
    expect(pub().getByRole("button", { name: "Make unlisted" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view public page/i })).toHaveAttribute("href", "/@alice/java");
  });

  it("publishes as unlisted with exactly the status the API accepts, and offers no public link for a draft", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(screen.queryByRole("link", { name: /view public page/i })).not.toBeInTheDocument();
    fireEvent.click(pub().getByRole("button", { name: "Publish as unlisted" }));
    await waitFor(() => expect(screen.getAllByTestId("status-badge")[0]).toHaveTextContent("Unlisted"));
    expect(api.sent("POST", "/collections/5/publish")[0].body).toEqual({ status: "UNLISTED" });
    expect(screen.getByText(/not listed in Discover or search/i)).toBeInTheDocument();
    expect(pub().getByRole("button", { name: "Publish" })).toBeInTheDocument();                               // unlisted -> listed
  });

  it("unpublishes back to a draft", async () => {
    const api = installFakeApi(routes(makeServer("PUBLISHED")));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(pub().getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(screen.getAllByTestId("status-badge")[0]).toHaveTextContent("Draft"));
    expect(api.sent("POST", "/collections/5/unpublish")).toHaveLength(1);
  });

  it("shows the server's reason when it refuses (stale screen: the last published page was removed elsewhere)", async () => {
    const sv = makeServer();
    installFakeApi(routes(sv));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    sv.findPage(10).status = "DRAFT";                                          // the screen still believes there is one
    fireEvent.click(pub().getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add at least one published page before publishing this collection"));
    expect(screen.getAllByTestId("status-badge")[0]).toHaveTextContent("Draft");
  });
});

describe("details", () => {
  it("the URL name is editable while a draft and locked once live", async () => {
    installFakeApi(routes(makeServer()));
    const { unmount } = mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(screen.getByLabelText("URL name")).toBeEnabled();
    unmount();
    installFakeApi(routes(makeServer("PUBLISHED")));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(screen.getByLabelText("URL name")).toBeDisabled();
    expect(screen.getByText(/can't change while the collection is live/i)).toBeInTheDocument();
  });

  it("saves edits (full title, unchanged fields kept) and shows the new title", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Advanced Java" } });
    fireEvent.click(btn("Save details"));
    await screen.findByRole("heading", { name: "Advanced Java", level: 1 });
    expect(api.sent("PUT", "/collections/5")[0].body).toEqual({
      title: "Advanced Java", slug: "java", description: "About Java", coverUrl: "", categoryId: 2,
    });
    expect(toast.success).toHaveBeenCalledWith("Details saved");
  });

  it("uploads a cover through the same uploader: only the asset id is sent, and removing it later sends null", async () => {
    FakeXhr.install();
    const urls = trackObjectUrls();
    const sv = makeServer();
    const api = installFakeApi({ ...routes(sv), "GET /media/cccccccc-cccc-4ccc-8ccc-cccccccccccc/content?variant=thumb": () => ok({}) });
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.change(screen.getByLabelText("Cover image file"), { target: { files: [imageFile()] } });
    expect(FakeXhr.last.url).toBe("/api/media");
    await act(async () => FakeXhr.last.reply(201, asset("cccccccc-cccc-4ccc-8ccc-cccccccccccc")));
    fireEvent.click(btn("Save details"));
    await waitFor(() => expect(api.sent("PUT", "/collections/5")).toHaveLength(1));
    expect(api.sent("PUT", "/collections/5")[0].body).toEqual({
      title: "Java", slug: "java", description: "About Java", categoryId: 2, coverAssetId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    });
    await waitFor(() => expect(sv.s.coverAssetId).toBe("cccccccc-cccc-4ccc-8ccc-cccccccccccc"));
    expect(urls.live.size).toBeLessThanOrEqual(1);   // at most the owner preview of the stored cover
  });

  it("an existing uploaded cover is previewed and removing it sends coverAssetId: null", async () => {
    FakeXhr.install();
    trackObjectUrls();
    const sv = makeServer();
    sv.s.coverAssetId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const api = installFakeApi({ ...routes(sv), "GET /media/cccccccc-cccc-4ccc-8ccc-cccccccccccc/content?variant=thumb": () => ok({}) });
    mount();
    await screen.findByAltText("Cover image preview");
    fireEvent.click(screen.getByRole("button", { name: "Remove cover image" }));
    fireEvent.click(btn("Save details"));
    await waitFor(() => expect(api.sent("PUT", "/collections/5")).toHaveLength(1));
    expect(api.sent("PUT", "/collections/5")[0].body).toEqual({ title: "Java", slug: "java", description: "About Java", categoryId: 2, coverAssetId: null });
  });

  it("validates before sending, and shows a server conflict inline", async () => {
    const api = installFakeApi({ ...routes(makeServer()), "PUT /collections/5": () => err(409, "Slug already in use") });
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "" } });
    fireEvent.click(btn("Save details"));
    expect(await screen.findByText("A title is required")).toBeInTheDocument();
    expect(api.sent("PUT", "/collections/5")).toHaveLength(0);

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Java 2" } });
    fireEvent.change(screen.getByLabelText("URL name"), { target: { value: "taken" } });
    fireEvent.click(btn("Save details"));
    expect(await screen.findByTestId("form-error")).toHaveTextContent("Slug already in use");
  });
});

describe("modules", () => {
  it("adds a module (title required) and shows it after the refresh", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(btn(/add module/i));
    fireEvent.click(await screen.findByRole("button", { name: "Create" }));
    expect(await screen.findByText("A title is required")).toBeInTheDocument();
    expect(api.sent("POST", "/collections/5/modules")).toHaveLength(0);
    fireEvent.change(dialog().getByLabelText("Title"), { target: { value: "Testing" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(titles()).toEqual(["Basics", "Advanced", "Testing"]));
    expect(api.sent("POST", "/collections/5/modules")[0].body).toEqual({ title: "Testing" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("deleting a module asks first, names the pages that go with it, and cancel sends nothing", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(btn("Delete module Basics"));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent('"Basics" and its 2 pages will be permanently deleted');
    fireEvent.click(btn("Cancel"));
    expect(api.sent("DELETE", "/modules/7")).toHaveLength(0);

    fireEvent.click(btn("Delete module Basics"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(titles()).toEqual(["Advanced"]));
    expect(api.sent("DELETE", "/modules/7")).toHaveLength(1);
  });

  it("reorders with the move buttons (ends are disabled)", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(btn("Move module Basics up")).toBeDisabled();
    expect(btn("Move module Advanced down")).toBeDisabled();
    fireEvent.click(btn("Move module Basics down"));
    await waitFor(() => expect(titles()).toEqual(["Advanced", "Basics"]));
    expect(api.sent("PATCH", "/modules/7/reorder")[0].body).toEqual({ position: 1 });
  });
});

describe("pages", () => {
  it("adds a page with a summary to its module; it starts as a draft", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(within(mod(7)).getByRole("button", { name: /add page/i }));
    fireEvent.change(await within(await screen.findByRole("dialog")).findByLabelText("Title"), { target: { value: "Functions" } });
    fireEvent.change(dialog().getByLabelText("Summary"), { target: { value: "About functions" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(within(mod(7)).getByText("Functions")).toBeInTheDocument());
    expect(api.sent("POST", "/modules/7/pages")[0].body).toEqual({ title: "Functions", summary: "About functions" });
    expect(within(page(12)).getByTestId("status-badge")).toHaveTextContent("Draft");
  });

  it("editing loads the current summary first, so saving never blanks it", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(btn("Edit page Intro"));
    expect(await within(await screen.findByRole("dialog")).findByLabelText("Summary")).toHaveValue("Existing summary");
    fireEvent.change(dialog().getByLabelText("Title"), { target: { value: "Introduction" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(within(mod(7)).getByText("Introduction")).toBeInTheDocument());
    expect(api.sent("PUT", "/pages/9")[0].body).toEqual({ title: "Introduction", summary: "Existing summary" });   // slug unchanged: not sent
  });

  it("publishing an EMPTY page warns that readers get no meaningful body, and only publishes on confirm", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(within(page(9)).getByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/no content yet.*won't see any meaningful body/i);
    fireEvent.click(btn("Cancel"));
    expect(api.sent("POST", "/pages/9/publish")).toHaveLength(0);

    fireEvent.click(within(page(9)).getByRole("button", { name: "Publish" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publish anyway" }));
    await waitFor(() => expect(within(page(9)).getByTestId("status-badge")).toHaveTextContent("Published"));
    expect(api.sent("POST", "/pages/9/publish")).toHaveLength(1);
  });

  it("a page with content publishes straight away, with no warning; an empty page is marked", async () => {
    const sv = makeServer();
    sv.findPage(10).status = "DRAFT";
    const api = installFakeApi({ ...routes(sv), "POST /pages/10/publish": () => { sv.findPage(10).status = "PUBLISHED"; return ok({}); } });
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(screen.getByTestId("empty-9")).toHaveTextContent("No content yet");
    expect(screen.queryByTestId("empty-10")).not.toBeInTheDocument();
    fireEvent.click(within(page(10)).getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(within(page(10)).getByTestId("status-badge")).toHaveTextContent("Published"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(api.sent("POST", "/pages/10/publish")).toHaveLength(1);
  });

  it("unpublishing is immediate and the collection's counts follow", async () => {
    installFakeApi(routes(makeServer("PUBLISHED")));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(screen.getByRole("link", { name: /view public page/i })).toBeInTheDocument();
    fireEvent.click(within(page(10)).getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(within(page(10)).getByTestId("status-badge")).toHaveTextContent("Draft"));
    expect(screen.getByText(/not visible to readers yet: it has no published page/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /view public page/i })).not.toBeInTheDocument();
  });

  it("deleting a page asks first", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(btn("Delete page Intro"));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent('"Intro" will be permanently deleted');
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByTestId("page-9")).not.toBeInTheDocument());
    expect(api.sent("DELETE", "/pages/9")).toHaveLength(1);
  });

  it("reorders pages within their module", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    expect(btn("Move page Intro up")).toBeDisabled();
    fireEvent.click(btn("Move page Intro down"));
    await waitFor(() => expect(api.sent("PATCH", "/pages/9/reorder")).toHaveLength(1));
    expect(api.sent("PATCH", "/pages/9/reorder")[0].body).toEqual({ position: 1 });
    await waitFor(() => expect(btn("Move page Intro up")).toBeEnabled());
  });

  it("a page links to its (Step 9) editor route", async () => {
    installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(within(page(9)).getByRole("link", { name: "Intro" }));
    expect(await screen.findByTestId("page-editor-route")).toBeInTheDocument();
  });

  it("a forbidden or missing page on save is explained, not lost", async () => {
    installFakeApi({ ...routes(makeServer()), "POST /pages/9/publish": () => err(404, "Page not found") });
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(within(page(9)).getByRole("button", { name: "Publish" }));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publish anyway" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Page not found"));
  });
});

describe("deleting the collection", () => {
  it("asks first, then soft-deletes and returns to the workspace", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(btn(/delete collection/i));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/restore it as a draft from Recently deleted within 30 days/i);
    expect(api.sent("DELETE", "/collections/5")).toHaveLength(0);
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Delete collection" }));
    expect(await screen.findByTestId("workspace-route")).toBeInTheDocument();
    expect(api.sent("DELETE", "/collections/5")).toHaveLength(1);
  });

  it("a 403 on delete (someone else's collection) is reported and the user stays", async () => {
    installFakeApi({ ...routes(makeServer()), "DELETE /collections/5": () => err(403, "You do not own this collection") });
    mount();
    await screen.findByRole("heading", { name: "Java", level: 1 });
    fireEvent.click(btn(/delete collection/i));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Delete collection" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You do not own this collection"));
    expect(screen.queryByTestId("workspace-route")).not.toBeInTheDocument();
  });
});
