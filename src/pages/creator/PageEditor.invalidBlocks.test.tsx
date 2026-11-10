import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import { errBlocks, installFakeApi } from "@/test/fakeApi";
import { btn, makePage, mountEditor, puts, routes, tick, typeText, typeTitle } from "@/test/pageEditorHarness";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div>not-found-screen</div> }));
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));

beforeEach(() => { vi.useFakeTimers(); tokenStore.set("tok"); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); tokenStore.clear(); });

const PROBLEM = { id: "t1", field: "text", message: "This is too long (limit 20000 characters)." };

async function open(refuse = true) {
  const page = makePage();
  const api = installFakeApi(routes(page, refuse ? { "PUT /pages/9": () => errBlocks([PROBLEM, { id: "gone", field: "url", message: "Not on this page." }]) } : {}));
  mountEditor();
  for (let i = 0; i < 6; i++) await tick(0);
  return { api, page };
}
const save = async () => { fireEvent.click(btn("Save")); await tick(0); await tick(0); };

describe("server-side block problems (400 INVALID_BLOCKS)", () => {
  it("are shown on the block they belong to, with the server's message; problems for blocks that aren't on the page are ignored", async () => {
    const { api } = await open();
    typeText("something");
    await save();
    expect(puts(api)).toHaveLength(1);
    expect(screen.getByText(PROBLEM.message)).toBeInTheDocument();
    expect(screen.queryByText("Not on this page.")).not.toBeInTheDocument();
    expect(screen.getByTestId("save-state").textContent).toMatch(/Unsaved|paused|Couldn/);
  });

  it("autosave does not ask again while the refused block is unchanged, even after other edits; Save always asks", async () => {
    const { api } = await open();
    typeText("something");
    await save();
    expect(puts(api)).toHaveLength(1);
    typeTitle("A different title");                        // edits elsewhere on the page
    await tick(1500); await tick(0);
    await tick(15_000);
    expect(puts(api)).toHaveLength(1);                     // no request: it would be refused again
    await save();
    expect(puts(api)).toHaveLength(2);                     // an explicit Save is always sent
  });

  it("the message disappears as soon as that block is edited, and autosave resumes", async () => {
    const { api, page } = await open();
    typeText("something");
    await save();
    expect(screen.getByText(PROBLEM.message)).toBeInTheDocument();
    api.set("PUT /pages/9", ({ body }) => { page.blocks = (body as { blocks: typeof page.blocks }).blocks; page.version += 1; return { status: 200, body: { ...page } }; });
    typeText("shorter");
    expect(screen.queryByText(PROBLEM.message)).not.toBeInTheDocument();
    await tick(1500); await tick(0);
    expect(puts(api)).toHaveLength(2);
    expect(puts(api)[1].autosave).toBe(true);
    expect(puts(api)[1].blocks![1]).toMatchObject({ text: "shorter" });
  });

  it("a successful save clears them", async () => {
    const { api, page } = await open();
    typeText("something");
    await save();
    api.set("PUT /pages/9", ({ body }) => { page.version += 1; page.blocks = (body as { blocks: typeof page.blocks }).blocks; return { status: 200, body: { ...page } }; });
    await save();
    expect(screen.queryByText(PROBLEM.message)).not.toBeInTheDocument();
  });
});
