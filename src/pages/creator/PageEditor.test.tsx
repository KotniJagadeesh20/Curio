import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import type { CreatorPage, PublicLegacyContent, StoredBlock } from "@/lib/types";
import { err, errCode, installFakeApi, ok, type Reply } from "@/test/fakeApi";
import PageEditor from "./PageEditor";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div>not-found-screen</div> }));
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre data-testid="code-view">{value}</pre> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));

const STORED: StoredBlock[] = [
  { id: "h1", type: "heading", level: 2, text: "Intro" },
  { id: "t1", type: "text", text: "Hello world" },
  { id: "c1", type: "code", language: "java", code: "int x = 1;", caption: "" },
];

function makeServer(over: Partial<CreatorPage> = {}) {
  const page: CreatorPage = {
    id: 9, moduleId: 7, collectionId: 5, slug: "intro", title: "Intro page", summary: "A summary", blocks: JSON.parse(JSON.stringify(STORED)),
    status: "DRAFT", position: 0, legacy: false, legacyContent: null, blocksUnreadable: false, version: 3, ...over,
  };
  return page;
}

function routes(page: CreatorPage, extra: Record<string, (r: { body: unknown }) => Reply> = {}) {
  return {
    "GET /pages/9": () => ok(JSON.parse(JSON.stringify(page))),
    "PUT /pages/9": ({ body }: { body: unknown }) => {
      const b = body as { title: string; summary?: string; blocks?: StoredBlock[]; discardUnreadableContent?: boolean; expectedVersion?: number; autosave?: boolean };
      // the server's rules: autosave never touches a live page; a stale version is refused (and nothing changes)
      if (b.autosave && page.status === "PUBLISHED") return errCode(409, "This page is published, so changes are saved only when you press Save.", "PAGE_PUBLISHED");
      if (b.expectedVersion !== undefined && b.expectedVersion !== page.version) return errCode(409, "This page was changed somewhere else.", "VERSION_CONFLICT");
      // the server's rule: an unreadable body is only replaced on explicit request
      if (page.blocksUnreadable && b.blocks !== undefined && !b.discardUnreadableContent) return err(409, "This page's saved content can't be read, so it was not replaced.");
      if (b.discardUnreadableContent && (!page.blocksUnreadable || b.blocks === undefined)) return err(400, "Nothing to discard");
      page.title = b.title;
      page.version += 1;
      if (b.summary !== undefined) page.summary = b.summary;
      if (b.blocks !== undefined) { page.blocks = b.blocks; page.legacy = false; page.legacyContent = null; page.blocksUnreadable = false; }
      return ok(JSON.parse(JSON.stringify(page)));
    },
    "POST /pages/9/publish": () => { page.status = "PUBLISHED"; return ok(page); },
    "POST /pages/9/unpublish": () => { page.status = "DRAFT"; return ok(page); },
    ...extra,
  };
}

function mount(id = 9) {
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 }, mutations: { retry: false } } });
  // a data router (like the app's): the editor's unsaved-changes guard uses useBlocker
  const router = createMemoryRouter([
    { path: "/create/pages/:id", element: <PageEditor id={id} /> },
    { path: "/create/collections/:id", element: <div data-testid="collection-route" /> },
    { path: "/elsewhere", element: <div data-testid="elsewhere-route" /> },
  ], { initialEntries: ["/create/pages/" + id] });
  const view = render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
  return { ...view, router, qc };
}

const btn = (name: string | RegExp) => screen.getByRole("button", { name });
const loaded = () => screen.findByRole("heading", { level: 1 });
const state = () => screen.getByTestId("save-state").textContent;
const blockIds = () => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id"));
const blockTypes = () => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-type"));
const lastPut = (api: ReturnType<typeof installFakeApi>) => api.sent("PUT", "/pages/9").at(-1)!.body as { title: string; summary?: string; blocks?: StoredBlock[]; discardUnreadableContent?: boolean };

async function addBlock(label: string) {
  const trigger = btn(/add block/i);
  fireEvent.keyDown(trigger, { key: "Enter" });
  fireEvent.click(await screen.findByRole("menuitem", { name: label }));
}

beforeEach(() => { tokenStore.set("tok"); toast.success.mockClear(); toast.error.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("loading and access", () => {
  it("shows loading, then the page: title, summary, blocks in stored order, status, and the unsaved-work warning", async () => {
    installFakeApi(routes(makeServer()));
    mount();
    expect(screen.getByRole("status")).toHaveTextContent("Loading page");
    await loaded();
    expect(screen.getByLabelText("Title")).toHaveValue("Intro page");
    expect(screen.getByLabelText("Summary")).toHaveValue("A summary");
    expect(blockIds()).toEqual(["h1", "t1", "c1"]);
    expect(blockTypes()).toEqual(["heading", "text", "code"]);
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Draft");
    expect(state()).toBe("Saved");
    expect(btn("Save")).toBeDisabled();
    expect(screen.getByTestId("unsaved-warning")).toHaveTextContent(/saved automatically/i);
    expect(screen.getByRole("link", { name: /back to collection/i })).toHaveAttribute("href", "/create/collections/5");
  });

  it.each([[404, "Page not found"], [403, "You do not own this page"]])("%s shows not-found, once", async (status, msg) => {
    const api = installFakeApi({ "GET /pages/9": () => err(status, msg) });
    mount();
    expect(await screen.findByText("not-found-screen")).toBeInTheDocument();
    expect(api.sent("GET", "/pages/9")).toHaveLength(1);
  });

  it("a server error is retryable", async () => {
    const page = makeServer();
    let fail = true;
    installFakeApi({ ...routes(page), "GET /pages/9": () => (fail ? err(500, "Database down") : ok(page)) });
    mount();
    expect(await screen.findByRole("alert")).toHaveTextContent("Database down");
    fail = false;
    fireEvent.click(btn("Try again"));
    await loaded();
  });

  it("opening a page never writes anything", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await loaded();
    expect(api.calls.every((c) => c.method === "GET")).toBe(true);
  });
});

describe("saving", () => {
  it("editing marks the page unsaved and blocks publishing until Save; Save sends the full ordered array and never a slug or status", async () => {
    const page = makeServer();
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "Changed text" } });
    expect(state()).toBe("Unsaved changes");
    expect(btn("Save")).toBeEnabled();
    expect(btn("Publish")).toBeDisabled();
    expect(screen.getByTestId("publish-hint")).toBeInTheDocument();

    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    const body = lastPut(api);
    expect(Object.keys(body).sort()).toEqual(["blocks", "expectedVersion", "summary", "title"]);
    expect(body.blocks).toEqual([STORED[0], { ...STORED[1], text: "Changed text" }, STORED[2]]);
    expect(toast.success).toHaveBeenCalledWith("Page saved");
    expect(btn("Publish")).toBeEnabled();
    expect(btn("Save")).toBeDisabled();
    expect(page.blocks).toEqual(body.blocks);
  });

  it("keeps every existing id, gives new blocks new ids, and saves the order shown", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await loaded();
    await addBlock("Divider");
    const newId = blockIds()[3]!;
    expect(["h1", "t1", "c1"]).not.toContain(newId);
    fireEvent.click(btn("Move block 4 (Divider) up"));
    fireEvent.click(btn("Move block 1 (Heading) down"));
    expect(blockIds()).toEqual(["t1", "h1", newId, "c1"]);
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    const sent = lastPut(api).blocks!;
    expect(sent.map((b) => b.id)).toEqual(["t1", "h1", newId, "c1"]);
    expect(sent[0]).toEqual(STORED[1]);                       // untouched blocks are byte-identical
    expect(sent[1]).toEqual(STORED[0]);
    expect(sent[2]).toEqual({ id: newId, type: "divider" });
  });

  it("every block type can be added from the menu, in order, and is saved with its flat shape", async () => {
    const page = makeServer({ blocks: [] });
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    expect(screen.getByText(/no blocks yet/i)).toBeInTheDocument();
    for (const label of ["Heading", "Text", "Code snippet", "Image", "Video", "HTML", "SVG diagram", "Callout", "Divider"]) await addBlock(label);
    expect(blockTypes()).toEqual(["heading", "text", "code", "image", "video", "html", "svg", "callout", "divider"]);
    fireEvent.change(screen.getByLabelText("Heading text"), { target: { value: "Title" } });
    fireEvent.change(screen.getByLabelText("Code"), { target: { value: "x()" } });
    fireEvent.change(screen.getByLabelText("Image link"), { target: { value: "https://e.com/a.png" } });
    fireEvent.change(screen.getByLabelText("Video link"), { target: { value: "https://youtu.be/abc" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    const sent = lastPut(api).blocks!;
    expect(sent.map((b) => b.type)).toEqual(["heading", "text", "code", "image", "video", "html", "svg", "callout", "divider"]);
    expect(sent[0]).toMatchObject({ type: "heading", level: 2, text: "Title" });
    expect(sent[2]).toMatchObject({ type: "code", language: "java", code: "x()", caption: "" });
    expect(sent[3]).toMatchObject({ type: "image", url: "https://e.com/a.png" });
    expect(sent[5]).toMatchObject({ type: "html", html: "", height: 360 });
    expect(sent[7]).toMatchObject({ type: "callout", variant: "info", text: "" });
    expect(new Set(sent.map((b) => b.id)).size).toBe(9);
  });

  it("deleting a block saves the page without it", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await loaded();
    fireEvent.click(btn("Delete block 2 (Text)"));
    expect(blockIds()).toEqual(["h1", "c1"]);
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api).blocks!.map((b) => b.id)).toEqual(["h1", "c1"]);
  });

  it("title and summary edits save too; an undone edit is clean again", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  New title  " } });
    expect(state()).toBe("Unsaved changes");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Intro page" } });
    expect(state()).toBe("Saved");
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  New title  " } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "New summary" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api)).toMatchObject({ title: "New title", summary: "New summary" });
    await waitFor(() => expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("New title"));
  });

  it("reloading after a save shows exactly what was saved", async () => {
    const page = makeServer();
    installFakeApi(routes(page));
    const first = mount();
    await loaded();
    await addBlock("Callout");
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    first.unmount();
    mount();
    await loaded();
    expect(blockTypes()).toEqual(["heading", "text", "code", "callout"]);
    expect(blockIds()).toEqual(["h1", "t1", "c1", page.blocks![3].id]);
  });
});

describe("validation and errors", () => {
  it("a blank title is refused with no request", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "   " } });
    fireEvent.click(btn("Save"));
    expect(await screen.findByText("A title is required")).toBeInTheDocument();
    expect(api.sent("PUT", "/pages/9")).toHaveLength(0);
  });

  it("an image link that is not https is flagged on the block and blocks the save", async () => {
    const api = installFakeApi(routes(makeServer({ blocks: [{ id: "i1", type: "image", url: "https://e.com/a.png", caption: "" }] })));
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Image link"), { target: { value: "http://e.com/a.png" } });
    expect(screen.getByText(/use an https:\/\/ link/i)).toBeInTheDocument();
    fireEvent.click(btn("Save"));
    expect(await screen.findByTestId("body-error")).toHaveTextContent(/fix the highlighted links/i);
    expect(api.sent("PUT", "/pages/9")).toHaveLength(0);
    fireEvent.change(screen.getByLabelText("Image link"), { target: { value: "javascript:alert(1)" } });
    expect(screen.getByText(/use an https:\/\/ link/i)).toBeInTheDocument();
  });

  it("stops adding at 500 blocks and explains why", async () => {
    installFakeApi(routes(makeServer({ blocks: Array.from({ length: 500 }, (_, i) => ({ id: `d${i}`, type: "divider" })) })));
    mount();
    await loaded();
    expect(btn(/add block/i)).toBeDisabled();
    expect(screen.getByText(/at most 500 blocks/i)).toBeInTheDocument();
  });

  it.each([
    [400, "A page can have at most 500 blocks"],
    [403, "You do not own this page"],
    [404, "Page not found"],
    [500, "Database down"],
  ])("a %s from the server is shown, the edits stay, and nothing is marked saved", async (status, msg) => {
    const api = installFakeApi({ ...routes(makeServer()), "PUT /pages/9": () => err(status, msg) });
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "My careful edit" } });
    fireEvent.click(btn("Save"));
    expect(await screen.findByTestId("save-error")).toHaveTextContent(msg);
    expect(state()).not.toBe("Saved");
    expect(screen.getByLabelText("Text")).toHaveValue("My careful edit");
    expect(btn("Save")).toBeEnabled();                         // can try again
    expect(api.sent("PUT", "/pages/9")).toHaveLength(1);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("an expired session (401) is reported and the edits are kept", async () => {
    installFakeApi({ ...routes(makeServer()), "PUT /pages/9": () => err(401, "Unauthorized") });
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "kept" } });
    fireEvent.click(btn("Save"));
    expect(await screen.findByTestId("save-error")).toHaveTextContent("Unauthorized");
    expect(screen.getByLabelText("Text")).toHaveValue("kept");
  });

  it("while a save runs you can keep typing and a second click sends no second request; a Save flushes the newer text afterwards, never overlapping", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const page = makeServer();
    const inner = routes(page)["PUT /pages/9"];
    let first = true, running = 0, maxRunning = 0;
    const api = installFakeApi({
      ...routes(page),
      "PUT /pages/9": async (r) => {
        running++; maxRunning = Math.max(maxRunning, running);
        if (first) { first = false; await gate; }
        running--;
        return inner(r);
      },
    });
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "x" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saving..."));
    expect(btn("Save")).toBeDisabled();
    expect(screen.getByLabelText("Title")).toBeEnabled();
    expect(screen.getByLabelText("Text")).toBeEnabled();
    expect(btn("Publish")).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "x and more typed during the save" } });
    expect(api.sent("PUT", "/pages/9")).toHaveLength(1);        // typing started no second request
    release();
    await waitFor(() => expect(state()).toBe("Saved"));
    const puts = api.sent("PUT", "/pages/9");
    expect(puts).toHaveLength(2);                                 // the first save, then ONE follow-up with the latest text
    expect(maxRunning).toBe(1);
    expect((puts[0].body as { blocks: StoredBlock[] }).blocks[1]).toMatchObject({ text: "x" });
    expect(lastPut(api).blocks![1]).toMatchObject({ text: "x and more typed during the save" });
    expect(screen.getByLabelText("Text")).toHaveValue("x and more typed during the save");
  });
});

describe("publishing", () => {
  it("publishes a page that has content straight away, and offers Unpublish afterwards", async () => {
    const api = installFakeApi(routes(makeServer()));
    mount();
    await loaded();
    fireEvent.click(btn("Publish"));
    await waitFor(() => expect(screen.getByTestId("status-badge")).toHaveTextContent("Published"));
    expect(api.sent("POST", "/pages/9/publish")).toHaveLength(1);
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    fireEvent.click(btn("Unpublish"));
    await waitFor(() => expect(screen.getByTestId("status-badge")).toHaveTextContent("Draft"));
    expect(api.sent("POST", "/pages/9/unpublish")).toHaveLength(1);
  });

  it("publishing an empty page warns that readers get no meaningful body, and publishes only on confirm", async () => {
    for (const blocks of [[], [{ id: "a", type: "heading", level: 2, text: "" }], [{ id: "d", type: "divider" }]] as StoredBlock[][]) {
      const api = installFakeApi(routes(makeServer({ blocks })));
      const view = mount();
      await loaded();
      fireEvent.click(btn("Publish"));
      expect(await screen.findByRole("alertdialog")).toHaveTextContent(/no content yet.*won't see any meaningful body/i);
      fireEvent.click(btn("Cancel"));
      expect(api.sent("POST", "/pages/9/publish")).toHaveLength(0);
      fireEvent.click(btn("Publish"));
      fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Publish anyway" }));
      await waitFor(() => expect(api.sent("POST", "/pages/9/publish")).toHaveLength(1));
      view.unmount();
    }
  });

  it("is blocked while there are unsaved edits and available again once saved", async () => {
    installFakeApi(routes(makeServer()));
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "edited" } });
    expect(btn("Publish")).toBeDisabled();
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(btn("Publish")).toBeEnabled());
  });

  it("a server refusal on publish is shown", async () => {
    installFakeApi({ ...routes(makeServer()), "POST /pages/9/publish": () => err(403, "You do not own this page") });
    mount();
    await loaded();
    fireEvent.click(btn("Publish"));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You do not own this page"));
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Draft");
  });

  it("saving a published page leaves it published (the request carries no status)", async () => {
    const api = installFakeApi(routes(makeServer({ status: "PUBLISHED" })));
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "x" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api)).not.toHaveProperty("status");
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Published");
  });
});

describe("legacy pages keep their content until explicitly converted", () => {
  const legacyContent: PublicLegacyContent = {
    concept: "Two pointers use two indices.", realWorld: "Used in diffing.", commonMistakes: ["Off-by-one"], bestPractices: ["Sort first"],
    interviewRelevance: "Common question.", codeLanguage: "python", codeExample: "def f():\n\treturn 1",
  };
  const legacyPage = () => makeServer({ blocks: null, legacy: true, legacyContent });

  it("shows the old content and explains it; opening writes nothing; no block editor yet", async () => {
    const api = installFakeApi(routes(legacyPage()));
    mount();
    await loaded();
    expect(screen.getByTestId("legacy-panel")).toHaveTextContent(/readers currently see its original content/i);
    expect(within(screen.getByTestId("legacy-preview")).getByText("Two pointers use two indices.")).toBeInTheDocument();
    expect(screen.getByTestId("code-view")).toHaveTextContent("def f():");
    expect(screen.queryByTestId("block-editor")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
    expect(api.calls.every((c) => c.method === "GET")).toBe(true);
  });

  it("editing the title or summary saves WITHOUT blocks, so the legacy page stays legacy", async () => {
    const page = legacyPage();
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api)).toEqual({ ...{ title: "Renamed", summary: "A summary" }, expectedVersion: 3 });
    expect(lastPut(api)).not.toHaveProperty("blocks");
    expect(page.blocks).toBeNull();
    expect(page.legacy).toBe(true);
    expect(screen.getByTestId("legacy-panel")).toBeInTheDocument();
  });

  it("Convert shows the blocks (unsaved), Save sends them once, and the legacy panel goes away", async () => {
    const page = legacyPage();
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    fireEvent.click(btn("Convert to blocks"));
    expect(state()).toBe("Unsaved changes");
    expect(screen.getByTestId("converted-note")).toBeInTheDocument();
    expect(api.sent("PUT", "/pages/9")).toHaveLength(0);                     // converting alone changes nothing on the server
    expect(blockTypes()).toEqual(["heading", "text", "heading", "code", "heading", "callout", "heading", "text", "heading", "text", "heading", "callout"]);
    expect(screen.queryByTestId("legacy-panel")).not.toBeInTheDocument();
    expect(btn("Publish")).toBeDisabled();

    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    const sent = lastPut(api).blocks!;
    expect(api.sent("PUT", "/pages/9")).toHaveLength(1);
    const texts = sent.flatMap((b) => [b.text, b.code]).filter(Boolean);
    expect(texts).toEqual(expect.arrayContaining([legacyContent.concept, legacyContent.realWorld, legacyContent.interviewRelevance, legacyContent.codeExample]));
    expect(texts.join("\n")).toContain("- Off-by-one");
    expect(texts.join("\n")).toContain("- Sort first");
    expect(sent.find((b) => b.type === "code")).toMatchObject({ language: "python", code: legacyContent.codeExample });
    expect(page.legacy).toBe(false);
    expect(screen.queryByTestId("converted-note")).not.toBeInTheDocument();
    // after saving, a later title edit sends the blocks like any normal page
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "After" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(api.sent("PUT", "/pages/9")).toHaveLength(2));
    expect(lastPut(api).blocks).toEqual(sent);
  });

  it("converted content survives a reload exactly", async () => {
    const page = legacyPage();
    installFakeApi(routes(page));
    const first = mount();
    await loaded();
    fireEvent.click(btn("Convert to blocks"));
    const idsBefore = blockIds();
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    first.unmount();
    mount();
    await loaded();
    expect(blockIds()).toEqual(idsBefore);
    expect(screen.queryByTestId("legacy-panel")).not.toBeInTheDocument();
  });

  it("a legacy page with content can be published without the empty-page warning", async () => {
    const api = installFakeApi(routes(legacyPage()));
    mount();
    await loaded();
    fireEvent.click(btn("Publish"));
    await waitFor(() => expect(api.sent("POST", "/pages/9/publish")).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("a legacy page with nothing in it offers to start fresh, warns on publish, and saves [] only when asked", async () => {
    const empty: PublicLegacyContent = { concept: "", realWorld: "", commonMistakes: [], bestPractices: [], interviewRelevance: "", codeLanguage: null, codeExample: null };
    const page = makeServer({ blocks: null, legacy: true, legacyContent: empty });
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    fireEvent.click(btn("Publish"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(btn("Cancel"));
    expect(api.sent("PUT", "/pages/9")).toHaveLength(0);
    fireEvent.click(btn("Start writing with blocks"));
    await addBlock("Text");
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api).blocks).toHaveLength(1);
  });
});

describe("stored data the editor can't fully understand is never overwritten", () => {
  it("a block of an unknown type is shown read-only, kept in place, and saved exactly as it was", async () => {
    const table = { type: "table", rows: [["a", "b"]], widths: [1, 2] };
    const page = makeServer({ blocks: [STORED[0], table, STORED[1]] });
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    expect(blockTypes()).toEqual(["heading", "unsupported", "text"]);
    expect(screen.getByTestId("unsupported-block")).toHaveTextContent(/"table"/);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "edited next to it" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api).blocks).toEqual([STORED[0], table, { ...STORED[1], text: "edited next to it" }]);
    expect(Object.keys(lastPut(api).blocks![1])).toEqual(["type", "rows", "widths"]);
  });

  it("an unsupported block can be moved and deleted like any other, and counts as content for publishing", async () => {
    const table = { type: "table", rows: [] };
    const api = installFakeApi(routes(makeServer({ blocks: [table] })));
    mount();
    await loaded();
    fireEvent.click(btn("Publish"));
    await waitFor(() => expect(api.sent("POST", "/pages/9/publish")).toHaveLength(1));      // no empty-page warning
    fireEvent.click(btn("Unpublish"));
    await addBlock("Divider");
    fireEvent.click(btn("Move block 2 (Divider) up"));
    expect(blockTypes()).toEqual(["divider", "unsupported"]);
    fireEvent.click(btn("Delete block 2 (Unsupported block (table))"));
    expect(blockTypes()).toEqual(["divider"]);
  });

  it("items that are not blocks disable saving the body (title and summary still save, without blocks)", async () => {
    const stored = [STORED[1], "not a block", { text: "no type" }] as unknown as StoredBlock[];
    const page = makeServer({ blocks: stored });
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    expect(screen.getByTestId("unreadable-alert")).toHaveTextContent(/2 saved items.*couldn't be read/i);
    expect(screen.getByLabelText("Text")).toBeDisabled();
    expect(btn(/add block/i)).toBeDisabled();
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
    fireEvent.click(btn("Publish"));                                          // never claims "empty" for data it couldn't read
    await waitFor(() => expect(api.sent("POST", "/pages/9/publish")).toHaveLength(1));
    fireEvent.click(btn("Unpublish"));
    await waitFor(() => expect(screen.getByTestId("status-badge")).toHaveTextContent("Draft"));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api)).toEqual({ ...{ title: "Renamed", summary: "A summary" }, expectedVersion: 3 });
    expect(page.blocks).toEqual(stored);
  });

  it("a body that is not an array at all is treated the same way", async () => {
    const page = makeServer({ blocks: { oops: true } as unknown as StoredBlock[] });
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    expect(screen.getByTestId("unreadable-alert")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "s2" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api)).not.toHaveProperty("blocks");
  });

  it("blocks without ids get ids when the page is saved, and nothing else about them changes", async () => {
    const page = makeServer({ blocks: [{ type: "text", text: "no id" }, { type: "divider" }] });
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "no id (edited)" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    const sent = lastPut(api).blocks!;
    expect(sent[0]).toMatchObject({ type: "text", text: "no id (edited)" });
    expect(typeof sent[0].id).toBe("string");
    expect(sent[1]).toMatchObject({ type: "divider" });
  });
});

describe("a body the server reports as unreadable is never overwritten", () => {
  const broken = () => makeServer({ blocks: null, blocksUnreadable: true });

  it("explains it, locks the body, and sends no blocks when only the title or summary changes", async () => {
    const page = broken();
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    expect(screen.getByTestId("unreadable-alert")).toHaveTextContent(/couldn't be read.*kept exactly as it is/i);
    expect(screen.queryByTestId("block-editor")).not.toBeInTheDocument();    // NOT shown as an ordinary empty page
    expect(screen.queryByText(/no blocks yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add block/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /preview/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("legacy-panel")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "New summary" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(api.sent("PUT", "/pages/9")).toHaveLength(1);
    expect(lastPut(api)).toEqual({ ...{ title: "Renamed", summary: "New summary" }, expectedVersion: 3 });
    expect(page.blocksUnreadable).toBe(true);
    expect(screen.getByTestId("unreadable-alert")).toBeInTheDocument();       // still protected after saving
  });

  it("never calls the page empty when publishing", async () => {
    const api = installFakeApi(routes(broken()));
    mount();
    await loaded();
    fireEvent.click(btn("Publish"));
    await waitFor(() => expect(api.sent("POST", "/pages/9/publish")).toHaveLength(1));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("discarding needs an explicit confirmation; cancelling sends nothing", async () => {
    const api = installFakeApi(routes(broken()));
    mount();
    await loaded();
    fireEvent.click(btn("Discard it and start over"));
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(/cannot be recovered/i);
    fireEvent.click(btn("Cancel"));
    expect(api.sent("PUT", "/pages/9")).toHaveLength(0);
    expect(screen.getByTestId("unreadable-alert")).toBeInTheDocument();
    expect(screen.queryByTestId("recovery-note")).not.toBeInTheDocument();
  });

  it("after confirming, nothing is sent until Save; then blocks and the explicit flag go together and the page becomes normal", async () => {
    const page = broken();
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    fireEvent.click(btn("Discard it and start over"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard and start over" }));
    expect(screen.getByTestId("recovery-note")).toHaveTextContent(/permanently discarded when you press Save/i);
    expect(state()).toBe("Unsaved changes");
    expect(btn("Publish")).toBeDisabled();
    expect(api.sent("PUT", "/pages/9")).toHaveLength(0);
    await addBlock("Text");
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "fresh start" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    const body = lastPut(api);
    expect(body.discardUnreadableContent).toBe(true);
    expect(body.blocks).toHaveLength(1);
    expect(body.blocks![0]).toMatchObject({ type: "text", text: "fresh start" });
    expect(screen.queryByTestId("unreadable-alert")).not.toBeInTheDocument();
    expect(screen.queryByTestId("recovery-note")).not.toBeInTheDocument();
    // from now on it is an ordinary page: no flag any more
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "second edit" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(api.sent("PUT", "/pages/9")).toHaveLength(2));
    expect(lastPut(api)).not.toHaveProperty("discardUnreadableContent");
  });

  it("'Keep the unreadable content' backs out of recovery and returns to title/summary-only saves", async () => {
    const page = broken();
    const api = installFakeApi(routes(page));
    mount();
    await loaded();
    fireEvent.click(btn("Discard it and start over"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard and start over" }));
    fireEvent.click(btn("Keep the unreadable content"));
    expect(screen.queryByTestId("recovery-note")).not.toBeInTheDocument();
    expect(state()).toBe("Saved");
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "s" } });
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api)).toEqual({ ...{ title: "Intro page", summary: "s" }, expectedVersion: 3 });
    expect(page.blocksUnreadable).toBe(true);
  });

  it("if the server refuses the replacement (409) the message is shown and nothing is marked saved", async () => {
    installFakeApi({ ...routes(broken()), "PUT /pages/9": () => err(409, "This page's saved content can't be read, so it was not replaced.") });
    mount();
    await loaded();
    fireEvent.click(btn("Discard it and start over"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard and start over" }));
    fireEvent.click(btn("Save"));
    expect(await screen.findByTestId("save-error")).toHaveTextContent(/was not replaced/i);
    expect(state()).not.toBe("Saved");
    expect(screen.getByTestId("recovery-note")).toBeInTheDocument();
  });

  it("a genuinely empty page (blocks: []) is NOT treated as unreadable", async () => {
    const api = installFakeApi(routes(makeServer({ blocks: [] })));
    mount();
    await loaded();
    expect(screen.queryByTestId("unreadable-alert")).not.toBeInTheDocument();
    expect(btn(/add block/i)).toBeEnabled();
    await addBlock("Divider");
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(state()).toBe("Saved"));
    expect(lastPut(api).blocks).toHaveLength(1);
    expect(lastPut(api)).not.toHaveProperty("discardUnreadableContent");
  });
});

describe("preview", () => {
  it("renders the page with the real renderer; unsupported blocks are noted, not shown", async () => {
    installFakeApi(routes(makeServer({ blocks: [STORED[0], STORED[1], { type: "table", rows: [] }, STORED[2]] })));
    mount();
    await loaded();
    fireEvent.click(btn("Preview"));
    const view = screen.getByTestId("preview");
    expect(within(view).getByRole("heading", { name: "Intro" })).toBeInTheDocument();
    expect(within(view).getByText("Hello world")).toBeInTheDocument();
    expect(within(view).getByTestId("code-view")).toHaveTextContent("int x = 1;");
    expect(view).toHaveTextContent(/1 unsupported block is not shown/i);
    expect(screen.queryByTestId("block-editor")).not.toBeInTheDocument();
    fireEvent.click(btn("Edit"));
    expect(screen.getByTestId("block-editor")).toBeInTheDocument();
  });

  it("keeps the sandbox: author HTML only in a fully sandboxed iframe (no scripts, no same-origin), SVG only through <img>, never inline", async () => {
    installFakeApi(routes(makeServer({ blocks: [
      { id: "h", type: "html", html: "<script>parent.document.cookie</script>", height: 200 },
      { id: "s", type: "svg", svg: "<svg onload=\"alert(1)\"><script>alert(2)</script></svg>", caption: "d" },
      { id: "v", type: "video", url: "javascript:alert(1)", caption: "" },
      { id: "i", type: "image", url: "data:text/html,<script>alert(1)</script>", caption: "" },
    ] })));
    const { container } = mount();
    await loaded();
    fireEvent.click(btn("Preview"));
    const iframe = container.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("");                                      // Step 11: every restriction on, scripts included
    expect(iframe.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(container.querySelector("svg[onload], script")).toBeNull();
    const img = container.querySelector("figure img")!;
    expect(img.getAttribute("src")!.startsWith("data:image/svg+xml")).toBe(true);
    expect(container.querySelectorAll("video, iframe[src]").length).toBe(0);              // unsafe video link not rendered
    expect(container.querySelectorAll("img").length).toBe(1);                            // unsafe image link not rendered
  });
});
