import { screen, fireEvent, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import type { StoredBlock } from "@/lib/types";
import { err, errCode, installFakeApi, ok } from "@/test/fakeApi";
import { btn, makePage, mountEditor, puts, routes, saveState, tick, typeText, typeTitle } from "@/test/pageEditorHarness";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div>not-found-screen</div> }));
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));

beforeEach(() => { vi.useFakeTimers(); tokenStore.set("tok"); toast.success.mockClear(); toast.error.mockClear(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); tokenStore.clear(); });

async function open(api = installFakeApi(routes(makePage()))) {
  const view = mountEditor();
  for (let i = 0; i < 6; i++) await tick(0);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  return { api, ...view };
}

describe("autosave of a draft", () => {
  it("saves 1.5 s after typing: one request with the full ordered blocks, expectedVersion and the autosave flag; then it is Saved", async () => {
    const page = makePage();
    const { api } = await open(installFakeApi(routes(page)));
    expect(saveState()).toBe("Saved");
    typeText("Hello, autosave");
    expect(saveState()).toBe("Unsaved changes");
    await tick(1499);
    expect(puts(api)).toHaveLength(0);
    await tick(1);
    await tick(0);
    expect(puts(api)).toHaveLength(1);
    const sent = puts(api)[0];
    expect(sent).toMatchObject({ title: "Intro page", summary: "A summary", expectedVersion: 3, autosave: true });
    expect(sent.blocks!.map((b) => b.id)).toEqual(["h1", "t1", "c1"]);
    expect(sent.blocks![1]).toMatchObject({ text: "Hello, autosave" });
    expect(saveState()).toBe("Saved");
    expect(page.version).toBe(4);
    expect(toast.success).not.toHaveBeenCalled();          // autosave is quiet; the status line says it
  });

  it("uses the version from each response: three saves in a row carry 3, 4, 5", async () => {
    const { api } = await open();
    for (const v of ["one", "two", "three"]) { typeText(v); await tick(1500); await tick(0); }
    expect(puts(api).map((p) => p.expectedVersion)).toEqual([3, 4, 5]);
    expect(saveState()).toBe("Saved");
  });

  it("many rapid edits become one request with the final text", async () => {
    const { api } = await open();
    let text = "";
    for (let i = 0; i < 10; i++) { text += "w "; typeText(text); await tick(300); }
    expect(puts(api)).toHaveLength(0);
    await tick(1500);
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0].blocks![1]).toMatchObject({ text });
  });

  it("long continuous typing is saved by the 15 s max-wait", async () => {
    const { api } = await open();
    let text = "";
    for (let i = 0; i < 16; i++) { text += "x"; typeText(text); await tick(1000); }
    expect(puts(api).length).toBeGreaterThanOrEqual(1);
    expect(puts(api)[0].blocks![1].text as string).toMatch(/^x{14,16}$/);
  });

  it("typing while a save is in flight is kept, never overlaps, and the latest text is saved next", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const page = makePage();
    const base = routes(page);
    let running = 0, maxRunning = 0, first = true;
    const api = installFakeApi({
      ...base,
      "PUT /pages/9": async (r) => { running++; maxRunning = Math.max(maxRunning, running); if (first) { first = false; await gate; } running--; return base["PUT /pages/9"](r); },
    });
    await open(api);
    typeText("first");
    await tick(1500);
    expect(saveState()).toBe("Saving...");
    expect(screen.getByLabelText("Text")).toBeEnabled();
    typeText("first, then more while saving");
    await tick(5000);
    expect(puts(api)).toHaveLength(1);
    release();
    await tick(0);
    await tick(1500);
    expect(puts(api)).toHaveLength(2);
    expect(maxRunning).toBe(1);
    expect(puts(api)[1].blocks![1]).toMatchObject({ text: "first, then more while saving" });
    expect(screen.getByLabelText("Text")).toHaveValue("first, then more while saving");
    expect(saveState()).toBe("Saved");
  });

  it("a late refetch with older data neither resets what was typed nor lowers the version", async () => {
    const page = makePage();
    const base = routes(page);
    let stale = false;
    const api = installFakeApi({
      ...base,
      "GET /pages/9": () => (stale ? ok({ ...JSON.parse(JSON.stringify(page)), title: "OLD TITLE", version: 3, blocks: [] }) : base["GET /pages/9"]()),
    });
    const { qc } = await open(api);
    typeText("saved text");
    await tick(1500);
    await tick(0);
    stale = true;
    await act2(() => qc.invalidateQueries({ queryKey: ["mine", "page", 9] }));
    typeText("saved text and newer");
    expect(screen.getByLabelText("Title")).toHaveValue("Intro page");
    await tick(1500);
    await tick(0);
    expect(puts(api).map((p) => p.expectedVersion)).toEqual([3, 4]);            // not 3, 3
    expect(puts(api)[1].blocks!.length).toBe(3);                                // the editor's blocks, not the stale []
    expect(saveState()).toBe("Saved");
  });

  it("a title typed with a trailing space is saved trimmed, once, and does not make the page dirty again", async () => {
    const { api } = await open();
    typeTitle("Intro page v2 ");
    await tick(1500); await tick(0);
    await tick(120_000);
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0].title).toBe("Intro page v2");
    expect(saveState()).toBe("Saved");
  });

  it("a change that is only trailing whitespace in the title is not an unsaved change", async () => {
    const { api } = await open();
    typeTitle("Intro page   ");
    expect(saveState()).toBe("Saved");
    await tick(60_000);
    expect(puts(api)).toHaveLength(0);
  });

  it("autosave never publishes or unpublishes", async () => {
    const api = await open().then((o) => o.api);
    for (const v of ["a", "b", "c"]) { typeText(v); await tick(2000); }
    await tick(60_000);
    expect(api.calls.filter((c) => c.path.endsWith("/publish") || c.path.endsWith("/unpublish"))).toHaveLength(0);
  });

  it("while a publish is running autosave holds still, and afterwards the page keeps explicit Save", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const page = makePage();
    const base = routes(page);
    const api = installFakeApi({ ...base, "POST /pages/9/publish": async () => { await gate; return base["POST /pages/9/publish"](); } });
    await open(api);
    fireEvent.click(btn("Publish"));
    await tick(0);
    typeText("typed while publishing");
    await tick(10_000);
    expect(puts(api)).toHaveLength(0);
    release();
    await tick(0);
    await tick(0);
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Published");
    await tick(60_000);
    expect(puts(api)).toHaveLength(0);                                          // still nothing: a live page is saved by Save only
    expect(saveState()).toBe("Unsaved changes");
  });
});

// a tiny alias so the stale-refetch test reads clearly
async function act2(fn: () => Promise<unknown>) { const { act } = await import("@testing-library/react"); await act(async () => { await fn(); }); }

describe("published pages keep explicit Save", () => {
  it("if an explicit Save learns the page is live (published in another tab), the editor switches to explicit-Save mode", async () => {
    const page = makePage();
    const { api } = await open(installFakeApi(routes(page)));
    page.status = "PUBLISHED";                                                  // published elsewhere, unknown to this tab
    fireEvent.change(screen.getByLabelText("Summary"), { target: { value: "manual edit" } });
    fireEvent.click(btn("Save"));                                               // before any autosave fires
    await tick(0); await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0].autosave).toBeUndefined();
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Published");
    typeText("later edit");
    await tick(120_000);
    expect(puts(api)).toHaveLength(1);                                          // no autosave of a live page any more
  });

  it("edits are never autosaved; Save sends one request without the autosave flag", async () => {
    const page = makePage({ status: "PUBLISHED" });
    const { api } = await open(installFakeApi(routes(page)));
    expect(screen.getByTestId("unsaved-warning")).toHaveTextContent(/published.*only when you press Save/i);
    typeText("live edit");
    await tick(120_000);
    expect(puts(api)).toHaveLength(0);
    expect(saveState()).toBe("Unsaved changes");
    fireEvent.click(btn("Save"));
    await tick(0);
    await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0].autosave).toBeUndefined();
    expect(puts(api)[0].expectedVersion).toBe(3);
    expect(saveState()).toBe("Saved");
    expect(toast.success).toHaveBeenCalledWith("Page saved");
  });

  it("if the server says the page is live (published in another tab), autosave stops and nothing was written", async () => {
    const page = makePage();
    const { api } = await open(installFakeApi(routes(page)));
    page.status = "PUBLISHED";                                                  // another tab published it
    typeText("half-finished");
    await tick(1500);
    await tick(0);
    expect(puts(api)).toHaveLength(1);                                          // the one refused attempt
    expect(page.blocks![1]).toMatchObject({ text: "Hello world" });             // the server kept the live content
    expect(screen.getByTestId("status-badge")).toHaveTextContent("Published");
    expect(screen.getByTestId("save-error")).toHaveTextContent(/published/i);
    await tick(120_000);
    expect(puts(api)).toHaveLength(1);                                          // and it does not try again
    expect(screen.getByLabelText("Text")).toHaveValue("half-finished");
  });
});

describe("autosave pauses instead of sending invalid pages", () => {
  it("a blank title sends nothing and says why; fixing it resumes", async () => {
    const { api } = await open();
    typeTitle("");
    await tick(1500);
    await tick(0);
    expect(puts(api)).toHaveLength(0);
    expect(screen.getByTestId("save-error")).toHaveTextContent(/autosave paused/i);
    expect(saveState()).toMatch(/autosave paused/i);
    await tick(60_000);
    expect(puts(api)).toHaveLength(0);
    typeTitle("A real title");
    await tick(1500);
    await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0].title).toBe("A real title");
    expect(saveState()).toBe("Saved");
  });

  it("an invalid image link is not autosaved", async () => {
    const page = makePage({ blocks: [{ id: "i1", type: "image", url: "", caption: "" }] });
    const { api } = await open(installFakeApi(routes(page)));
    fireEvent.change(screen.getByLabelText("Image link"), { target: { value: "javascript:alert(1)" } });
    await tick(5000);
    expect(puts(api)).toHaveLength(0);
  });
});

describe("failures", () => {
  it("a network failure keeps the edits, shows Retrying, and the retry (after 2 s) saves the latest text", async () => {
    const page = makePage();
    const base = routes(page);
    let down = true;
    const api = installFakeApi({ ...base, "PUT /pages/9": (r) => { if (down) throw new TypeError("Failed to fetch"); return base["PUT /pages/9"](r); } });
    await open(api);
    typeText("my careful edit");
    await tick(1500);
    await tick(0);
    expect(saveState()).toBe("Couldn't save. Retrying...");
    expect(screen.getByTestId("save-error")).toHaveTextContent(/your changes are kept/i);
    expect(screen.getByLabelText("Text")).toHaveValue("my careful edit");
    typeText("my careful edit, plus more");
    down = false;
    await tick(2000);
    await tick(0);
    expect(puts(api)).toHaveLength(2);
    expect(puts(api)[1].blocks![1]).toMatchObject({ text: "my careful edit, plus more" });
    expect(puts(api)[1].expectedVersion).toBe(3);                                // still the version we know: nothing was saved
    expect(saveState()).toBe("Saved");
  });

  it("a 500 is retried 3 times (2 s, 5 s, 15 s), then the page says it could not save, and Save tries again", async () => {
    const page = makePage();
    const base = routes(page);
    let broken = true;
    const api = installFakeApi({ ...base, "PUT /pages/9": (r) => (broken ? err(500, "Database down") : base["PUT /pages/9"](r)) });
    await open(api);
    typeText("edit");
    await tick(1500); await tick(0);
    await tick(2000); await tick(0);
    await tick(5000); await tick(0);
    await tick(15_000); await tick(0);
    expect(puts(api)).toHaveLength(4);
    expect(saveState()).toBe("Couldn't save your changes");
    await tick(300_000);
    expect(puts(api)).toHaveLength(4);
    broken = false;
    fireEvent.click(btn("Save"));
    await tick(0); await tick(0);
    expect(puts(api)).toHaveLength(5);
    expect(saveState()).toBe("Saved");
    expect(screen.getByLabelText("Text")).toHaveValue("edit");
  });

  it.each([[401, "Unauthorized"], [403, "You do not own this page"], [404, "Page not found"]])("%s is shown and never retried automatically; the edits stay", async (status, msg) => {
    const api = installFakeApi({ ...routes(makePage()), "PUT /pages/9": () => err(status, msg) });
    await open(api);
    typeText("kept");
    await tick(1500); await tick(0);
    expect(screen.getByTestId("save-error")).toHaveTextContent(msg);
    await tick(300_000);
    expect(puts(api)).toHaveLength(1);
    expect(screen.getByLabelText("Text")).toHaveValue("kept");
    expect(saveState()).toBe("Couldn't save your changes");
  });

  it("a server 400 pauses autosave until the next edit", async () => {
    const api = installFakeApi({ ...routes(makePage()), "PUT /pages/9": () => err(400, "Title is too long") });
    await open(api);
    typeText("a");
    await tick(1500); await tick(0);
    await tick(60_000);
    expect(puts(api)).toHaveLength(1);
    expect(screen.getByTestId("save-error")).toHaveTextContent("Title is too long");
  });
});

describe("version conflicts (another tab or device changed the page)", () => {
  async function conflicted() {
    const page = makePage();
    const base = routes(page);
    const { api, ...rest } = await open(installFakeApi(base));
    page.version = 7;                                                           // someone else saved: our version 3 is stale
    page.title = "Changed elsewhere";
    page.blocks = [{ id: "z1", type: "text", text: "Their text" }];
    typeText("my edit");
    await tick(1500); await tick(0);
    return { page, api, ...rest };
  }

  it("is reported distinctly, never retried, and the edits stay on screen", async () => {
    const { api } = await conflicted();
    const panel = screen.getByTestId("conflict-panel");
    expect(panel).toHaveTextContent(/changed somewhere else/i);
    expect(screen.queryByTestId("save-error")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Text")).toHaveValue("my edit");
    expect(btn("Save")).toBeDisabled();
    await tick(300_000);
    expect(puts(api)).toHaveLength(1);
  });

  it("'Reload the latest version' replaces the editor with the server's copy", async () => {
    await conflicted();
    fireEvent.click(btn(/reload the latest version/i));
    await tick(0); await tick(0); await tick(0);
    expect(screen.queryByTestId("conflict-panel")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Changed elsewhere");
    expect(screen.getByLabelText("Text")).toHaveValue("Their text");
    expect(saveState()).toBe("Saved");
  });

  it("'Keep my version' learns the current version first, then saves explicitly with it", async () => {
    const { api, page } = await conflicted();
    fireEvent.click(btn(/keep my version/i));
    await tick(0); await tick(0); await tick(0);
    expect(puts(api)).toHaveLength(2);
    expect(puts(api)[1].expectedVersion).toBe(7);
    expect(puts(api)[1].autosave).toBeUndefined();
    expect(page.blocks).toMatchObject([{ id: "h1" }, { id: "t1", text: "my edit" }, { id: "c1" }]);
    expect(screen.queryByTestId("conflict-panel")).not.toBeInTheDocument();
    expect(saveState()).toBe("Saved");
  });
});

describe("data integrity", () => {
  it("a legacy page autosaves title/summary WITHOUT blocks and stays legacy", async () => {
    const legacy = { concept: "Legacy concept", realWorld: "", commonMistakes: [], bestPractices: [], interviewRelevance: "", codeLanguage: null, codeExample: null };
    const page = makePage({ blocks: null, legacy: true, legacyContent: legacy });
    const { api } = await open(installFakeApi(routes(page)));
    typeTitle("Renamed legacy page");
    await tick(1500); await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect("blocks" in puts(api)[0]).toBe(false);
    expect(puts(api)[0]).toMatchObject({ title: "Renamed legacy page", autosave: true, expectedVersion: 3 });
    expect(page.legacy).toBe(true);
    expect(page.blocks).toBeNull();
    expect(screen.getByTestId("legacy-panel")).toBeInTheDocument();
  });

  it("converting a legacy page is never autosaved; only Save writes the converted body", async () => {
    const legacy = { concept: "Legacy concept", realWorld: "", commonMistakes: [], bestPractices: [], interviewRelevance: "", codeLanguage: null, codeExample: null };
    const page = makePage({ blocks: null, legacy: true, legacyContent: legacy });
    const { api } = await open(installFakeApi(routes(page)));
    fireEvent.click(btn("Convert to blocks"));
    await tick(120_000);
    expect(puts(api)).toHaveLength(0);
    expect(page.blocks).toBeNull();
    fireEvent.click(btn("Save"));
    await tick(0); await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0].blocks!.length).toBeGreaterThan(0);
    expect(puts(api)[0].autosave).toBeUndefined();
    expect(page.legacy).toBe(false);
  });

  it("an unreadable body is never sent by autosave: title/summary only, and the stored body is untouched", async () => {
    const page = makePage({ blocks: null, legacy: false, blocksUnreadable: true });
    const { api } = await open(installFakeApi(routes(page)));
    expect(screen.queryByTestId("block-editor")).not.toBeInTheDocument();
    typeTitle("Renamed while unreadable");
    await tick(1500); await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect("blocks" in puts(api)[0]).toBe(false);
    expect("discardUnreadableContent" in puts(api)[0]).toBe(false);
    expect(page.blocksUnreadable).toBe(true);
    expect(saveState()).toBe("Saved");
  });

  it("recovery stays explicit: confirming the discard autosaves nothing; only Save sends blocks + the flag", async () => {
    const page = makePage({ blocks: null, legacy: false, blocksUnreadable: true });
    const { api } = await open(installFakeApi(routes(page)));
    fireEvent.click(btn("Discard it and start over"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard and start over" }));
    await tick(0);
    typeTitle("Fresh start");
    await tick(120_000);
    expect(puts(api)).toHaveLength(0);
    expect(page.blocksUnreadable).toBe(true);
    expect(screen.getByTestId("recovery-note")).toBeInTheDocument();
    fireEvent.click(btn("Save"));
    await tick(0); await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0]).toMatchObject({ discardUnreadableContent: true, blocks: [] });
    expect(puts(api)[0].autosave).toBeUndefined();
    expect(page.blocksUnreadable).toBe(false);
    // afterwards the page is an ordinary draft again: autosave resumes and never carries the flag
    await tick(0);
    typeTitle("Fresh start 2");
    await tick(1500); await tick(0);
    expect(puts(api)).toHaveLength(2);
    expect(puts(api)[1].discardUnreadableContent).toBeUndefined();
    expect(puts(api)[1].autosave).toBe(true);
  });

  it("a pending retry cannot smuggle in a recovery: after the discard is confirmed, nothing is sent until Save", async () => {
    const page = makePage({ blocks: null, legacy: false, blocksUnreadable: true });
    const base = routes(page);
    let down = true;
    const api = installFakeApi({ ...base, "PUT /pages/9": (r) => (down ? err(500, "Database down") : base["PUT /pages/9"](r)) });
    await open(api);
    typeTitle("Edited title");
    await tick(1500); await tick(0);
    expect(saveState()).toBe("Couldn't save. Retrying...");                     // a retry is now scheduled
    down = false;
    fireEvent.click(btn("Discard it and start over"));
    fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Discard and start over" }));
    await tick(0);
    await tick(60_000);                                                         // the scheduled retry fires meanwhile
    for (const p of puts(api)) { expect("blocks" in p).toBe(false); expect("discardUnreadableContent" in p).toBe(false); }
    expect(page.blocksUnreadable).toBe(true);                                   // the unreadable content is still there
    expect(screen.getByTestId("recovery-note")).toBeInTheDocument();
  });

  it("autosave keeps block ids, order and an unsupported block byte-for-byte", async () => {
    const table: StoredBlock = { type: "table", rows: [["a", "b"]], widths: [1, 2] } as StoredBlock;
    const page = makePage({ blocks: [{ id: "h1", type: "heading", level: 2, text: "Intro" }, table, { id: "t1", type: "text", text: "tail" }] });
    const { api } = await open(installFakeApi(routes(page)));
    fireEvent.click(btn("Move block 3 (Text) up"));
    await tick(1500); await tick(0);
    const sent = puts(api)[0].blocks!;
    expect(sent[0].id).toBe("h1");
    expect(sent[1].id).toBe("t1");
    expect(sent[2]).toEqual(table);                                              // no id injected, nothing dropped
    expect(Object.keys(sent[2])).toEqual(["type", "rows", "widths"]);
  });
});
