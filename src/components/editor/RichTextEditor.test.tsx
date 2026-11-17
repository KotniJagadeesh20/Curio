import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { EditorBlock } from "@/lib/blocks";
import { projectDoc, type InlineDoc } from "@/lib/richText";
import { BlockEditor } from "./BlockEditor";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));

type T = Extract<EditorBlock, { type: "text" }>;
const plain = (id: string, text: string): EditorBlock => ({ id, type: "text", text });
const rich = (id: string): EditorBlock => ({ id, type: "text", text: "a b", doc: [{ type: "paragraph", children: [{ text: "a " }, { text: "b", bold: true }] }] });

let setOutside: (b: EditorBlock[]) => void = () => {};
function Host({ initial, onState }: { initial: EditorBlock[]; onState: (b: EditorBlock[]) => void }) {
  const [blocks, setBlocks] = useState(initial);
  setOutside = setBlocks;
  return <BlockEditor blocks={blocks} onChange={(b) => { setBlocks(b); onState(b); }} />;
}
function mount(initial: EditorBlock[]) {
  let latest = initial;
  render(<Host initial={initial} onState={(b) => { latest = b; }} />);
  return { latest: () => latest, text: (i = 0) => latest.filter((b) => b.type === "text")[i] as T };
}
const area = () => screen.getByLabelText("Text") as HTMLTextAreaElement;
const select = (from: number, to: number) => area().setSelectionRange(from, to);

describe("backward compatibility with plain text blocks", () => {
  it("an unformatted block stays exactly as before: text as typed, no doc key", () => {
    const m = mount([plain("a", "")]);
    fireEvent.change(area(), { target: { value: "Line one\n\n- item" } });
    expect(m.text()).toEqual({ id: "a", type: "text", text: "Line one\n\n- item" });
    expect("doc" in m.text()).toBe(false);
  });

  it('typing "/" in an empty block still opens the insert menu', async () => {
    mount([plain("a", "")]);
    fireEvent.change(area(), { target: { value: "/" } });
    expect(await screen.findByRole("dialog")).toHaveTextContent("Insert block");
  });

  it("a plain block gains a doc only when formatting is used; text becomes the projection", () => {
    const m = mount([plain("a", "")]);
    fireEvent.change(area(), { target: { value: "see [docs](https://e.com/d) **now**" } });
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "see " }, { text: "docs", href: "https://e.com/d" }, { text: " " }, { text: "now", bold: true }] }]);
    expect(m.text().text).toBe("see docs (https://e.com/d) now");
  });
});

describe("blocks with a doc", () => {
  it("show their doc as editable syntax and keep a doc after every edit, with text = projection", () => {
    const m = mount([rich("r")]);
    expect(area().value).toBe("a **b**");
    fireEvent.change(area(), { target: { value: "no formatting left" } });
    expect(m.text()).toEqual({ id: "r", type: "text", text: "no formatting left", doc: [{ type: "paragraph", children: [{ text: "no formatting left" }] }] });
  });

  it("a block replaced from outside (reload, conflict recovery) shows its new content", () => {
    mount([rich("r")]);
    act(() => setOutside([{ id: "r", type: "text", text: "z", doc: [{ type: "paragraph", children: [{ text: "z", italic: true }] }] }]));
    expect(area().value).toBe("_z_");
  });

  it("a link the server would refuse is shown as a problem on the block", () => {
    mount([plain("a", "")]);
    fireEvent.change(area(), { target: { value: "[x](http://e.com)" } });
    expect(screen.getByTestId("block-problem")).toHaveTextContent("Use an https:// link");
  });
});

describe("toolbar", () => {
  it("is a labelled toolbar of buttons", () => {
    mount([plain("a", "")]);
    const bar = screen.getByRole("toolbar", { name: "Text formatting" });
    for (const name of ["Bold", "Italic", "Link", "Bulleted list", "Numbered list"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(bar.querySelectorAll("button")).toHaveLength(5);
  });

  it("Bold and Italic wrap the selection", () => {
    const m = mount([plain("a", "make this strong")]);
    select(10, 16);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(area().value).toBe("make this **strong**");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "make this " }, { text: "strong", bold: true }] }]);
    select(0, 4);
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(area().value).toBe("_make_ this **strong**");
  });

  it("with no selection, Bold inserts a placeholder", () => {
    mount([plain("a", "")]);
    select(0, 0);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(area().value).toBe("**bold text**");
  });

  it("Link wraps the selection as [label](https://) and selects the address", async () => {
    mount([plain("a", "read docs")]);
    select(5, 9);
    fireEvent.click(screen.getByRole("button", { name: "Link" }));
    expect(area().value).toBe("read [docs](https://)");
    await waitFor(() => expect(area().value.slice(area().selectionStart, area().selectionEnd)).toBe("https://"));
  });

  it("list buttons turn the selected lines into list items and back", () => {
    const m = mount([plain("a", "Intro\n\napples\npears")]);
    select(8, 19);
    fireEvent.click(screen.getByRole("button", { name: "Bulleted list" }));
    expect(area().value).toBe("Intro\n\n- apples\n- pears");
    expect("doc" in m.text()).toBe(false);                                   // lists are plain syntax: no doc needed
    select(8, 22);
    fireEvent.click(screen.getByRole("button", { name: "Numbered list" }));
    expect(area().value).toBe("Intro\n\n1. apples\n2. pears");
    select(8, 24);
    fireEvent.click(screen.getByRole("button", { name: "Numbered list" }));
    expect(area().value).toBe("Intro\n\napples\npears");
  });

  it("Ctrl/Cmd+B, +I and +K are shortcuts", () => {
    mount([plain("a", "x y z")]);
    select(0, 1);
    fireEvent.keyDown(area(), { key: "b", ctrlKey: true });
    expect(area().value).toBe("**x** y z");
    select(6, 7);
    fireEvent.keyDown(area(), { key: "i", metaKey: true });
    expect(area().value).toBe("**x** _y_ z");
    select(10, 11);
    fireEvent.keyDown(area(), { key: "k", ctrlKey: true });
    expect(area().value).toBe("**x** _y_ [z](https://)");
  });
});

describe("review checklist (Step 13c)", () => {
  const V = JSON.parse(readFileSync(resolve(process.cwd(), "shared/richtext-projection-vectors.json"), "utf8")) as { projection: { name: string; doc: InlineDoc; text: string }[] };

  it("loading any stored doc changes nothing until the creator edits", () => {
    for (const v of V.projection.filter((x) => x.doc.length)) {
      const onState = vi.fn();
      const { unmount } = render(<Host initial={[{ id: "r", type: "text", text: v.text, doc: v.doc }]} onState={onState} />);
      expect(onState).not.toHaveBeenCalled();
      unmount();
    }
  });

  it("editing a stored doc keeps every other run's formatting exactly; text is exactly projectDoc(doc)", () => {
    for (const v of V.projection.filter((x) => x.doc.length)) {
      const m = mount([{ id: "r", type: "text", text: v.text, doc: v.doc }]);
      fireEvent.change(area(), { target: { value: `${area().value}\n\nAdded.` } });
      expect(m.text().doc).toEqual([...v.doc, { type: "paragraph", children: [{ text: "Added." }] }]);
      expect(m.text().text).toBe(projectDoc(m.text().doc!));
      expect(m.text().text).toBe(`${v.text}\n\nAdded.`);
      document.body.innerHTML = "";
    }
  });

  it("bold and italic combine through the toolbar", () => {
    const m = mount([plain("a", "both")]);
    select(0, 4);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));          // **both**, "both" stays selected
    select(2, 6);
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(area().value).toBe("**_both_**");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "both", bold: true, italic: true }] }]);
  });

  it("links keep their label and address, including parentheses and underscores", () => {
    const m = mount([plain("a", "")]);
    fireEvent.change(area(), { target: { value: "[Foo bar](https://en.wikipedia.org/wiki/Foo_(bar))" } });
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "Foo bar", href: "https://en.wikipedia.org/wiki/Foo_(bar)" }] }]);
    expect(m.text().text).toBe("Foo bar (https://en.wikipedia.org/wiki/Foo_(bar))");
  });

  it("ordered and bulleted lists keep their order", () => {
    const m = mount([plain("a", "")]);
    fireEvent.change(area(), { target: { value: "**Steps**\n\n1. Mix\n2. Bake\n3. Cool\n\n- salt\n- flour" } });
    expect(m.text().doc!.slice(1)).toEqual([
      { type: "list", ordered: true, items: [[{ text: "Mix" }], [{ text: "Bake" }], [{ text: "Cool" }]] },
      { type: "list", ordered: false, items: [[{ text: "salt" }], [{ text: "flour" }]] },
    ]);
    expect(m.text().text).toBe("Steps\n\n1. Mix\n2. Bake\n3. Cool\n\n- salt\n- flour");
  });

  it("editing one text block leaves its neighbours untouched (same objects)", () => {
    const before = [rich("r1"), plain("p", "plain"), rich("r2")];
    const m = mount(before);
    fireEvent.change(screen.getAllByLabelText("Text")[1], { target: { value: "plain **edited**" } });
    expect(m.latest()[0]).toBe(before[0]);
    expect(m.latest()[2]).toBe(before[2]);
    expect(m.latest().map((b) => b.id)).toEqual(["r1", "p", "r2"]);
  });

  it("formatting acts at the caret when nothing is selected, mid-text", () => {
    mount([plain("a", "before after")]);
    select(7, 7);
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(area().value).toBe("before _italic text_after");
  });

  it("Bold over an italic selection (and the typed ***x***) is bold + italic", () => {
    const m = mount([plain("a", "*x*")]);
    select(1, 2);
    fireEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(area().value).toBe("***x***");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "x", bold: true, italic: true }] }]);
  });

  it("formatting a selection inside a word works", () => {
    const m = mount([plain("a", "remake")]);
    select(2, 6);
    fireEvent.click(screen.getByRole("button", { name: "Italic" }));
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "re" }, { text: "make", italic: true }] }]);
  });
});

describe("toolbar formatting escapes the selected text (Step 13c review fix)", () => {
  const consistent = (m: ReturnType<typeof mount>) => expect(m.text().text).toBe(projectDoc(m.text().doc!));
  const click = (name: string) => fireEvent.click(screen.getByRole("button", { name }));

  it("Link over a selection with square brackets keeps the label exactly", async () => {
    const m = mount([plain("a", "Read [this] document")]);
    select(0, 20);
    click("Link");
    expect(area().value).toBe("[Read \\[this\\] document](https://)");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "Read [this] document", href: "https://" }] }]);
    consistent(m);
    await waitFor(() => expect(area().value.slice(area().selectionStart, area().selectionEnd)).toBe("https://"));
  });

  it("Link over backslashes, parentheses and other markers keeps the label exactly", () => {
    const m = mount([plain("a", "")]);
    for (const label of ["C:\\temp\\x", "f(x) = (a)", "a ] b [ c", "x)(y", "5 * 3 _ 2", "a\\", "\\[x\\]"]) {
      fireEvent.change(area(), { target: { value: "" } });
      // the selection is read as syntax: write the label as the creator would see it (escaped where the editor shows escapes)
      const typed = label.replace(/[\\*_[\]]/g, (c) => `\\${c}`);
      fireEvent.change(area(), { target: { value: typed } });
      select(0, typed.length);
      click("Link");
      expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: label, href: "https://" }] }]);
      consistent(m);
    }
  });

  it("Link over a selection keeps formatting already in it", () => {
    const m = mount([plain("a", "see **bold** _it_")]);
    select(0, 17);
    click("Link");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [
      { text: "see ", href: "https://" }, { text: "bold", bold: true, href: "https://" }, { text: " ", href: "https://" },
      { text: "it", italic: true, href: "https://" }] }]);
    consistent(m);
  });

  it("Link over a multiline selection links each line, keeps line breaks, list markers and blank lines", () => {
    const m = mount([plain("a", "- one [1]\n- two\n\nthree")]);
    select(0, 22);
    click("Link");
    expect(area().value).toBe("- [one \\[1\\]](https://)\n- [two](https://)\n\n[three](https://)");
    expect(m.text().doc).toEqual([
      { type: "list", ordered: false, items: [[{ text: "one [1]", href: "https://" }], [{ text: "two", href: "https://" }]] },
      { type: "paragraph", children: [{ text: "three", href: "https://" }] },
    ]);
    consistent(m);
  });

  it("Bold and Italic over selections with literal markers keep them literal", () => {
    const m = mount([plain("a", "")]);
    fireEvent.change(area(), { target: { value: "5 * 3 * 2" } });
    select(0, 9);
    click("Bold");
    expect(area().value).toBe("**5 \\* 3 \\* 2**");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "5 * 3 * 2", bold: true }] }]);
    consistent(m);

    fireEvent.change(area(), { target: { value: "use my_var [x] a\\\\b" } });
    select(0, area().value.length);
    click("Italic");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "use my_var [x] a\\b", italic: true }] }]);
    consistent(m);

    fireEvent.change(area(), { target: { value: "f(x) = (a)" } });
    select(0, 10);
    click("Bold");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "f(x) = (a)", bold: true }] }]);
    consistent(m);
  });

  it("Bold over a multiline selection formats each line; italic after a letter mid-word still parses", () => {
    const m = mount([plain("a", "1. a*b\n2. c")]);
    select(0, 11);
    click("Bold");
    expect(area().value).toBe("1. **a\\*b**\n2. **c**");
    expect(m.text().doc).toEqual([{ type: "list", ordered: true, items: [[{ text: "a*b", bold: true }], [{ text: "c", bold: true }]] }]);
    consistent(m);

    fireEvent.change(area(), { target: { value: "remake_it" } });
    select(2, 9);
    click("Italic");
    expect(m.text().doc).toEqual([{ type: "paragraph", children: [{ text: "re" }, { text: "make_it", italic: true }] }]);
    consistent(m);
  });

  it("random selections formatted through the toolbar always give a doc whose text is its exact projection", () => {
    let seed = 7;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const alphabet = ["a", "b", " ", "*", "_", "[", "]", "(", ")", "\\", "\n", "-", "1", ".", "**"];
    const m = mount([plain("a", "")]);
    for (let n = 0; n < 300; n++) {
      const src = Array.from({ length: 1 + rnd(14) }, () => alphabet[rnd(alphabet.length)]).join("");
      fireEvent.change(area(), { target: { value: src } });
      const v = area().value, a = rnd(v.length + 1), b = a + rnd(v.length - a + 1);
      select(a, b);
      click(["Bold", "Italic", "Link"][rnd(3)]);
      const t = m.text();
      if (t.doc) expect(t.text).toBe(projectDoc(t.doc));
    }
  });
});
