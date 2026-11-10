import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_BLOCKS, type EditorBlock } from "@/lib/blocks";
import { BlockEditor } from "./BlockEditor";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));

const text = (id: string, t = ""): EditorBlock => ({ id, type: "text", text: t });
const heading = (id: string, t: string): EditorBlock => ({ id, type: "heading", level: 2, text: t });
const unknown = (id: string): EditorBlock => ({ id, unsupported: true, original: { type: "table", rows: [[1, 2]], widths: [3] } } as unknown as EditorBlock);

/** Controlled host that records every change like PageEditor would. */
function Host({ initial, disabled, onState }: { initial: EditorBlock[]; disabled?: boolean; onState: (b: EditorBlock[]) => void }) {
  const [blocks, setBlocks] = useState(initial);
  return <BlockEditor blocks={blocks} disabled={disabled} onChange={(b) => { setBlocks(b); onState(b); }} />;
}
function mount(initial: EditorBlock[], disabled = false) {
  let latest = initial;
  render(<Host initial={initial} disabled={disabled} onState={(b) => { latest = b; }} />);
  return { latest: () => latest };
}
const ids = () => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id"));
const types = () => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-type"));

describe("slash menu", () => {
  it('typing "/" in an empty text block opens the menu and does not write the slash', async () => {
    mount([text("a")]);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "/" } });
    expect(await screen.findByRole("dialog")).toHaveTextContent("Insert block");
    expect(screen.getByLabelText("Text")).toHaveValue("");
  });

  it("filters as you type, and Enter turns the empty block into the chosen type (same place, count unchanged, other ids kept)", async () => {
    const m = mount([heading("h", "Top"), text("a"), heading("z", "Bottom")]);
    fireEvent.change(screen.getAllByLabelText("Text")[0], { target: { value: "/" } });
    const input = await screen.findByLabelText("Filter blocks");
    fireEvent.change(input, { target: { value: "cod" } });
    expect(screen.getByRole("option", { name: "Code snippet" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Image" })).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(types()).toEqual(["heading", "code", "heading"]);
    expect(ids()[0]).toBe("h");
    expect(ids()[2]).toBe("z");
    expect(ids()[1]).not.toBe("a");                                  // a fresh block replaced the empty text block
    expect(m.latest()).toHaveLength(3);
  });

  it("arrow keys move the highlight and Enter picks it", async () => {
    mount([text("a")]);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "/" } });
    const input = await screen.findByLabelText("Filter blocks");
    fireEvent.keyDown(input, { key: "ArrowDown" });                  // Text -> Heading? (list order: Heading first)
    const selected = screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true")!;
    const wanted = selected.textContent!;
    fireEvent.keyDown(input, { key: "Enter" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const made = types()[0];
    expect(made).not.toBe("unsupported");
    expect(wanted.length).toBeGreaterThan(0);
    expect(types()).toHaveLength(1);
  });

  it("a click on an item works too (mouse)", async () => {
    mount([text("a")]);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "/" } });
    fireEvent.click(await screen.findByRole("option", { name: "Callout" }));
    await waitFor(() => expect(types()).toEqual(["callout"]));
  });

  it("Escape closes it and changes nothing", async () => {
    const m = mount([text("a")]);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "/" } });
    const input = await screen.findByLabelText("Filter blocks");
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(ids()).toEqual(["a"]);
    expect(types()).toEqual(["text"]);
    expect(m.latest()).toHaveLength(1);
  });

  it("choosing Text keeps the existing block", async () => {
    mount([text("a")]);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "/" } });
    fireEvent.click(await screen.findByRole("option", { name: "Text" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(ids()).toEqual(["a"]);
  });

  it("does not open when the block already has text, or in other block types", () => {
    mount([text("a", "hello"), heading("h", "")]);
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "hello /" } });
    fireEvent.change(screen.getByLabelText("Heading text"), { target: { value: "/" } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Text")).toHaveValue("hello /");
    expect(screen.getByLabelText("Heading text")).toHaveValue("/");
  });

  it("respects the 500-block limit: replacing never adds a block, and Add block stays disabled", async () => {
    const many = Array.from({ length: MAX_BLOCKS }, (_, i) => (i === 0 ? text("first") : heading("h" + i, "x")));
    const m = mount(many);
    expect(screen.getByRole("button", { name: /add block/i })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Text"), { target: { value: "/" } });
    fireEvent.click(await screen.findByRole("option", { name: "Divider" }));
    await waitFor(() => expect(m.latest()).toHaveLength(MAX_BLOCKS));
    expect(m.latest()[0].id).not.toBe("first");
    expect(screen.getByRole("button", { name: /add block/i })).toBeDisabled();
  });
});

describe("up/down buttons remain as the accessible fallback", () => {
  it("move blocks, keep ids and the unsupported block's data", () => {
    const m = mount([heading("a", "A"), unknown("u"), heading("c", "C")]);
    fireEvent.click(screen.getByRole("button", { name: /move block 2 \(.*\) up/i }));
    expect(ids()).toEqual(["u", "a", "c"]);
    fireEvent.click(screen.getByRole("button", { name: /move block 1 \(.*\) down/i }));
    expect(ids()).toEqual(["a", "u", "c"]);
    expect((m.latest()[1] as unknown as { original: unknown }).original).toEqual({ type: "table", rows: [[1, 2]], widths: [3] });
  });
});

describe("drag and drop", () => {
  // jsdom has no layout: give every block a 100px-tall slot by index so dnd-kit can tell where things are.
  const realRect = Element.prototype.getBoundingClientRect;
  beforeEach(() => {
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const el = this.closest("[data-block-id]");
      const i = el ? ids().indexOf(el.getAttribute("data-block-id")) : 0;
      return { x: 0, y: i * 100, top: i * 100, left: 0, right: 400, bottom: i * 100 + 80, width: 400, height: 80, toJSON: () => ({}) } as DOMRect;
    };
  });
  afterEach(() => { Element.prototype.getBoundingClientRect = realRect; });

  const handle = (n: number) => screen.getByRole("button", { name: new RegExp(`drag block ${n} `, "i") });
  const drag = async (n: number, keys: string[]) => {
    fireEvent.keyDown(handle(n), { code: "Space", key: " " });
    for (const code of keys) { await new Promise((r) => setTimeout(r, 0)); fireEvent.keyDown(document, { code, key: code }); }
    await new Promise((r) => setTimeout(r, 0));
    fireEvent.keyDown(document, { code: "Space", key: " " });
    await new Promise((r) => setTimeout(r, 10));
  };

  it("every block has a labelled drag handle", () => {
    mount([heading("a", "A"), text("b")]);
    expect(handle(1)).toHaveAccessibleName(/drag block 1 \(heading\) to reorder/i);
    expect(handle(2)).toHaveAccessibleName(/drag block 2 \(text\) to reorder/i);
  });

  it("with the keyboard: Space lifts, ArrowDown moves, Space drops; ids and content are untouched", async () => {
    const m = mount([heading("a", "A"), text("b", "bee"), heading("c", "C")]);
    await drag(1, ["ArrowDown"]);
    await waitFor(() => expect(ids()).toEqual(["b", "a", "c"]));
    expect(m.latest()).toHaveLength(3);
    expect((m.latest()[1] as { text: string }).text).toBe("A");
    expect((m.latest()[0] as { text: string }).text).toBe("bee");
  });

  it("moves a block up and to the end, and a dragged unsupported block keeps its stored data exactly", async () => {
    const m = mount([heading("a", "A"), unknown("u"), heading("c", "C")]);
    await drag(2, ["ArrowDown"]);
    await waitFor(() => expect(ids()).toEqual(["a", "c", "u"]));
    expect((m.latest()[2] as unknown as { original: unknown }).original).toEqual({ type: "table", rows: [[1, 2]], widths: [3] });
    await drag(3, ["ArrowUp", "ArrowUp"]);
    await waitFor(() => expect(ids()).toEqual(["u", "a", "c"]));
  });

  it("dropping where it started changes nothing", async () => {
    const m = mount([heading("a", "A"), heading("b", "B")]);
    const before = m.latest();
    await drag(1, []);
    expect(ids()).toEqual(["a", "b"]);
    expect(m.latest()).toBe(before);
  });

  it("is switched off while the editor is locked (unreadable or unconverted content)", () => {
    mount([heading("a", "A"), heading("b", "B")], true);
    expect(handle(1)).toBeDisabled();
    screen.getAllByRole("button", { name: /move block 1/i }).forEach((b) => expect(b).toBeDisabled());
  });

  it("does not change the block count", async () => {
    const start = [heading("a", "A"), heading("b", "B"), heading("c", "C"), heading("d", "D")];
    const m = mount(start);
    await drag(4, ["ArrowUp", "ArrowUp", "ArrowUp"]);
    await waitFor(() => expect(ids()).toEqual(["d", "a", "b", "c"]));
    expect(m.latest().map((b) => b.id).sort()).toEqual(["a", "b", "c", "d"]);
  });
});
