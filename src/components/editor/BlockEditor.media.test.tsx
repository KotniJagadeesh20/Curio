import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorBlock } from "@/lib/blocks";
import { FakeXhr, asset, imageFile, stubOwnerMedia, trackObjectUrls } from "@/test/fakeXhr";
import { BlockEditor } from "./BlockEditor";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const image = (id: string, extra: Record<string, unknown> = {}): EditorBlock => ({ id, type: "image", url: "", caption: "", ...extra }) as EditorBlock;

let urls: ReturnType<typeof trackObjectUrls>;
beforeEach(() => { FakeXhr.install(); urls = trackObjectUrls(); stubOwnerMedia(); });
afterEach(() => vi.unstubAllGlobals());

function mount(initial: EditorBlock[]) {
  const changes: EditorBlock[][] = [];
  let latest = initial;
  function Host() {
    const [blocks, setBlocks] = useState(initial);
    return <BlockEditor blocks={blocks} onChange={(b) => { setBlocks(b); latest = b; changes.push(b); }} />;
  }
  const view = render(<Host />);
  return { ...view, changes, latest: () => latest };
}
const choose = (file: File, within_: HTMLElement = document.body) =>
  fireEvent.change(within(within_).getByLabelText("Image file"), { target: { files: [file] } });
const asJson = (b: EditorBlock[]) => JSON.parse(JSON.stringify(b));

describe("image block uploads", () => {
  it("a successful upload sets assetId and empties the link; nothing changes before that", async () => {
    const m = mount([image("i1", { url: "", caption: "kept" })]);
    choose(imageFile());
    act(() => FakeXhr.last.progress(500, 1000));
    expect(m.changes).toHaveLength(0);                                   // uploading changes no block data
    await act(async () => FakeXhr.last.reply(201, asset(A)));
    expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "", caption: "kept", assetId: A }]);
    expect(m.changes).toHaveLength(1);
    expect(await screen.findByAltText("Image preview")).toBeInTheDocument();
  });

  it("cancelling and failing leave the block exactly as it was", async () => {
    const m = mount([image("i1")]);
    choose(imageFile());
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    choose(imageFile());
    await act(async () => FakeXhr.last.reply(409, { error: "x", code: "MEDIA_QUOTA" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/storage limit/i);
    expect(m.changes).toHaveLength(0);
    expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "", caption: "" }]);
  });

  it("Replace swaps the assetId only when the new upload succeeds", async () => {
    const m = mount([image("i1", { assetId: A })]);
    await screen.findByAltText("Image preview");
    choose(imageFile());
    await act(async () => FakeXhr.last.reply(503, { error: "x", code: "MEDIA_BUSY" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/busy/i);
    expect(m.changes).toHaveLength(0);                                   // failed replacement: the old image is still the block's
    expect((m.latest()[0] as { assetId?: string }).assetId).toBe(A);       // still the original asset
    expect(await screen.findByAltText("Image preview")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await act(async () => FakeXhr.last.reply(201, asset(B)));
    expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "", caption: "", assetId: B }]);
  });

  it("Remove drops the reference: no assetId key remains and the caption is kept", async () => {
    const m = mount([image("i1", { assetId: A, caption: "c" })]);
    await screen.findByAltText("Image preview");
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "", caption: "c" }]);
    expect("assetId" in (m.latest()[0] as object)).toBe(false);
    expect(screen.queryByAltText("Image preview")).toBeNull();
    expect(urls.live.size).toBe(0);                                      // the preview's object URL was revoked
  });

  it("keeps the https link fallback: typing a link on an empty block works and clears nothing else", () => {
    const m = mount([image("i1", { caption: "c" })]);
    fireEvent.change(screen.getByLabelText("Image link"), { target: { value: "https://example.com/a.png" } });
    expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "https://example.com/a.png", caption: "c" }]);
  });

  it("entering a link on an uploaded image removes the assetId (a block never carries both)", async () => {
    const m = mount([image("i1", { assetId: A })]);
    await screen.findByAltText("Image preview");
    fireEvent.change(screen.getByLabelText("Image link"), { target: { value: "https://example.com/a.png" } });
    expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "https://example.com/a.png", caption: "" }]);
    expect(screen.queryByAltText("Image preview")).toBeNull();
  });

  it("editing the caption of an uploaded image keeps the asset", async () => {
    const m = mount([image("i1", { assetId: A })]);
    await screen.findByAltText("Image preview");
    fireEvent.change(screen.getByLabelText("Image caption"), { target: { value: "hi" } });
    expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "", caption: "hi", assetId: A }]);
  });

  it("two image blocks upload independently", async () => {
    const m = mount([image("i1"), image("i2")]);
    const [first, second] = screen.getAllByTestId("media-uploader");
    choose(imageFile("1.jpg"), first);
    choose(imageFile("2.jpg"), second);
    await act(async () => FakeXhr.instances[1].reply(201, asset(B)));
    await act(async () => FakeXhr.instances[0].reply(201, asset(A)));
    expect(asJson(m.latest()).map((b: { assetId: string }) => b.assetId)).toEqual([A, B]);
  });

  it("deleting a block mid-upload aborts it, frees the preview and cannot bring the block back", async () => {
    const m = mount([image("i1"), { id: "t1", type: "text", text: "x" } as EditorBlock]);
    choose(imageFile());
    fireEvent.click(screen.getByRole("button", { name: /Delete block 1/ }));
    expect(FakeXhr.last.aborted).toBe(true);
    await act(async () => { FakeXhr.last.reply(201, asset(A)); });
    expect(m.latest().map((b) => b.id)).toEqual(["t1"]);
    expect(urls.live.size).toBe(0);
  });

  it("shows the server's problem for the image on the block", async () => {
    render(<BlockEditor blocks={[image("i1", { assetId: A })]} onChange={() => {}} problems={{ i1: "This image isn't available. Upload it again." }} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/Upload it again/));
  });

  describe("a link edit cannot be overwritten by a late upload", () => {
    const link = () => screen.getByLabelText("Image link") as HTMLInputElement;

    it("the link field is locked while an upload runs, a forced edit is ignored, and success installs the asset with no link", async () => {
      const m = mount([image("i1")]);
      choose(imageFile());
      expect(link()).toBeDisabled();
      fireEvent.change(link(), { target: { value: "https://example.com/late.png" } });   // even if an event gets through
      expect(m.changes).toHaveLength(0);
      await act(async () => FakeXhr.last.reply(201, asset(A)));
      expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "", caption: "", assetId: A }]);
      expect(link()).not.toBeDisabled();
    });

    it("cancelling unlocks the field and the link then typed is the final state, with no assetId", async () => {
      const m = mount([image("i1")]);
      choose(imageFile());
      expect(link()).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
      expect(link()).not.toBeDisabled();
      fireEvent.change(link(), { target: { value: "https://example.com/a.png" } });
      await act(async () => { FakeXhr.last.reply(201, asset(A)); });                  // the cancelled request's late answer is ignored
      expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "https://example.com/a.png", caption: "" }]);
    });

    it("a failed upload unlocks the field too", async () => {
      mount([image("i1")]);
      choose(imageFile());
      await act(async () => FakeXhr.last.reply(422, { error: "x", code: "MEDIA_CORRUPT" }));
      expect(link()).not.toBeDisabled();
    });

    it("with no upload pending nothing changed: typing a link on an uploaded image still replaces it", async () => {
      const m = mount([image("i1", { assetId: A })]);
      await screen.findByAltText("Image preview");
      fireEvent.change(link(), { target: { value: "https://example.com/a.png" } });
      expect(asJson(m.latest())).toEqual([{ id: "i1", type: "image", url: "https://example.com/a.png", caption: "" }]);
    });

    it("a link typed BEFORE the upload started is replaced by a successful upload (the later choice), never both", async () => {
      const m = mount([image("i1", { url: "https://example.com/old.png" })]);
      choose(imageFile());
      await act(async () => FakeXhr.last.reply(201, asset(A)));
      const b = asJson(m.latest())[0];
      expect(b).toEqual({ id: "i1", type: "image", url: "", caption: "", assetId: A });
    });
  });
});
