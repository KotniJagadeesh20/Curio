import { fireEvent, screen, within } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import type { StoredBlock } from "@/lib/types";
import { installFakeApi, ok } from "@/test/fakeApi";
import { FakeXhr, asset, imageFile, trackObjectUrls } from "@/test/fakeXhr";
import { STORED, makePage, mountEditor, puts, routes, saveState, tick, typeText } from "@/test/pageEditorHarness";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div>not-found-screen</div> }));
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let urls: ReturnType<typeof trackObjectUrls>;

beforeEach(() => { vi.useFakeTimers(); tokenStore.set("tok"); FakeXhr.install(); urls = trackObjectUrls(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); tokenStore.clear(); });

const withImage = (extra: Record<string, unknown> = {}): StoredBlock[] =>
  [...JSON.parse(JSON.stringify(STORED)), { id: "img1", type: "image", url: "", caption: "", ...extra }];

async function open(blocks: StoredBlock[]) {
  const page = makePage({ blocks });
  const api = installFakeApi(routes(page, {
    [`GET /media/${A}/content?variant=original`]: () => ok({}),
    [`GET /media/${B}/content?variant=original`]: () => ok({}),
  }));
  const view = mountEditor();
  for (let i = 0; i < 6; i++) await tick(0);
  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  return { page, api, ...view };
}
const card = () => document.querySelector('[data-block-id="img1"]') as HTMLElement;
const choose = () => fireEvent.change(within(card()).getByLabelText("Image file"), { target: { files: [imageFile()] } });
const imageBlockOf = (body: { blocks?: StoredBlock[] }) => body.blocks!.find((b) => b.id === "img1") as Record<string, unknown>;

describe("uploads and autosave", () => {
  it("an upload in progress is never saved: autosave sends the image block as it was, then the finished upload is saved", async () => {
    const { api } = await open(withImage());
    choose();
    act(() => FakeXhr.last.progress(300, 1000));
    typeText("edit while uploading");
    await tick(1500); await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect(imageBlockOf(puts(api)[0])).toEqual({ id: "img1", type: "image", url: "", caption: "" });   // no assetId, no half-state
    expect(JSON.stringify(puts(api)[0])).not.toContain(A);

    await act(async () => FakeXhr.last.reply(201, asset(A)));
    expect(saveState()).toBe("Unsaved changes");                       // the finished upload is a normal edit
    await tick(1500); await tick(0);
    expect(puts(api)).toHaveLength(2);
    expect(imageBlockOf(puts(api)[1])).toEqual({ id: "img1", type: "image", url: "", caption: "", assetId: A });
    expect(saveState()).toBe("Saved");
  });

  it("a failed upload leaves nothing to save: no request is made and the page stays Saved", async () => {
    const { api } = await open(withImage());
    choose();
    await act(async () => FakeXhr.last.reply(503, { error: "busy", code: "MEDIA_BUSY" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/busy/i);
    await tick(20000);
    expect(puts(api)).toHaveLength(0);
    expect(saveState()).toBe("Saved");
  });

  it("a cancelled upload changes nothing either", async () => {
    const { api } = await open(withImage());
    choose();
    fireEvent.click(within(card()).getByRole("button", { name: "Cancel upload" }));
    await tick(20000);
    expect(puts(api)).toHaveLength(0);
    expect(saveState()).toBe("Saved");
    expect(urls.live.size).toBe(0);
  });

  it("a failed replacement keeps saving the existing asset", async () => {
    const { api } = await open(withImage({ assetId: A }));
    await tick(0);
    choose();
    await act(async () => FakeXhr.last.reply(422, { error: "x", code: "MEDIA_CORRUPT" }));
    typeText("another edit");
    await tick(1500); await tick(0);
    expect(imageBlockOf(puts(api)[0])).toEqual({ id: "img1", type: "image", url: "", caption: "", assetId: A });
  });

  it("a replacement is saved only once it has finished, and swaps the asset", async () => {
    const { api } = await open(withImage({ assetId: A }));
    choose();
    typeText("while the new one uploads");
    await tick(1500); await tick(0);
    expect(imageBlockOf(puts(api)[0]).assetId).toBe(A);
    await act(async () => FakeXhr.last.reply(201, asset(B)));
    await tick(1500); await tick(0);
    expect(imageBlockOf(puts(api)[1]).assetId).toBe(B);
  });

  it("Save pressed mid-upload sends the block without the pending upload", async () => {
    const { api } = await open(withImage());
    choose();
    typeText("manual");
    fireEvent.click(screen.getByRole("button", { name: /^Save/ }));
    await tick(0); await tick(0);
    expect(puts(api)).toHaveLength(1);
    expect(imageBlockOf(puts(api)[0])).toEqual({ id: "img1", type: "image", url: "", caption: "" });
    expect(puts(api)[0].autosave).toBeUndefined();
  });

  it("removing the uploaded image is saved as a block with no assetId", async () => {
    const { api } = await open(withImage({ assetId: A }));
    await tick(0);
    fireEvent.click(within(card()).getByRole("button", { name: "Remove image" }));
    await tick(1500); await tick(0);
    const sent = imageBlockOf(puts(api)[0]);
    expect(sent).toEqual({ id: "img1", type: "image", url: "", caption: "" });
    expect("assetId" in sent).toBe(false);
    expect(urls.live.size).toBe(0);
  });

  it("leaving the page mid-upload aborts it and frees every object URL", async () => {
    const { unmount } = await open(withImage());
    choose();
    unmount();
    expect(FakeXhr.last.aborted).toBe(true);
    expect(urls.live.size).toBe(0);
  });

  it("the editor's preview shows an uploaded image through the owner route, not a public URL", async () => {
    const { api } = await open(withImage({ assetId: A }));
    fireEvent.click(screen.getByRole("button", { name: /Preview/ }));
    await tick(0); await tick(0);
    expect(api.calls.some((c) => c.method === "GET" && c.path.startsWith(`/media/${A}/content`) && c.headers.Authorization === "Bearer tok")).toBe(true);
    expect(document.querySelectorAll('img[src^="blob:"]').length).toBeGreaterThan(0);
  });
});
