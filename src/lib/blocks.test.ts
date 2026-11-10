import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BLOCK_LABELS, CONTENT_FIELDS, MAX_BLOCKS, UNSUPPORTED, bodyProblems, hasMeaningfulContent, insertBlock, isUnsupported,
  legacyContentToBlocks, legacyHasContent, moveBlock, moveBlockTo, newBlock, readBlocksForEditing, removeBlock, replaceBlock, serializeBlocks, updateBlock, urlProblem,
  type Block, type EditorBlock,
} from "./blocks";
import type { PublicLegacyContent } from "./types";

const all = [
  { id: "b1", type: "heading", level: 2, text: "Intro — ünïcode ✓" },
  { id: "b2", type: "text", text: "Line one\n\nLine \"two\"\n- bullet" },
  { id: "b3", type: "code", language: "java", code: "class A {\n\tint x = 1;\n}", caption: "c" },
  { id: "b4", type: "image", url: "https://example.com/a.png", caption: "alt" },
  { id: "b5", type: "video", url: "https://www.youtube.com/watch?v=abc", caption: "" },
  { id: "b6", type: "html", html: "<div>hi</div>", height: 360 },
  { id: "b7", type: "svg", svg: "<svg/>", caption: "" },
  { id: "b8", type: "callout", variant: "tip", text: "careful" },
  { id: "b9", type: "divider" },
];
const ids = (b: EditorBlock[]) => b.map((x) => x.id);

describe("reading stored blocks for editing", () => {
  it("every known type survives read -> serialize exactly, in order, with its id", () => {
    const { blocks, unreadable } = readBlocksForEditing(all);
    expect(unreadable).toBe(0);
    expect(serializeBlocks(blocks)).toEqual(all);
    expect(ids(blocks)).toEqual(["b1", "b2", "b3", "b4", "b5", "b6", "b7", "b8", "b9"]);
  });

  it("the editor knows exactly the nine types the plan lists", () => {
    expect(Object.keys(BLOCK_LABELS).sort()).toEqual(["callout", "code", "divider", "heading", "html", "image", "svg", "text", "video"]);
  });

  it("keeps unknown fields on known blocks", () => {
    const { blocks } = readBlocksForEditing([{ id: "a", type: "text", text: "x", future: { k: [1, 2] } }]);
    expect(serializeBlocks(blocks)[0]).toMatchObject({ future: { k: [1, 2] } });
  });

  it("wraps a block of an unknown type and writes it back byte-for-byte (no id injected, nothing dropped)", () => {
    const table = { type: "table", rows: [["a", "b"]], widths: [1, 2] };
    const withId = { id: "t1", type: "embed", src: "https://e.com", options: { a: 1 } };
    const { blocks, unreadable } = readBlocksForEditing([all[0], table, withId, all[1]]);
    expect(unreadable).toBe(0);
    expect(blocks.map((b) => b.type)).toEqual(["heading", UNSUPPORTED, UNSUPPORTED, "text"]);
    expect(isUnsupported(blocks[1])).toBe(true);
    expect(blocks[2].id).toBe("t1");
    expect(serializeBlocks(blocks)).toEqual([all[0], table, withId, all[1]]);
    expect(Object.keys(serializeBlocks(blocks)[1])).toEqual(["type", "rows", "widths"]);          // no id added
  });

  it("a stored block whose type is literally the wrapper name is wrapped like any unknown type", () => {
    const odd = { type: UNSUPPORTED, original: "x" };
    expect(serializeBlocks(readBlocksForEditing([odd]).blocks)).toEqual([odd]);
  });

  it("counts items that are not blocks instead of silently dropping them", () => {
    const r = readBlocksForEditing([all[0], "a string", null, 5, [], { text: "no type" }, { type: 7 }, all[1]]);
    expect(r.unreadable).toBe(6);
    expect(ids(r.blocks)).toEqual(["b1", "b2"]);
  });

  it("a non-array body is unreadable, null is simply empty", () => {
    expect(readBlocksForEditing({ not: "an array" }).unreadable).toBe(1);
    expect(readBlocksForEditing("text").unreadable).toBe(1);
    expect(readBlocksForEditing(null)).toEqual({ blocks: [], unreadable: 0 });
    expect(readBlocksForEditing([])).toEqual({ blocks: [], unreadable: 0 });
  });

  it("generates an id only for a block that has none, or repeats one", () => {
    const { blocks } = readBlocksForEditing([{ type: "divider" }, { id: "same", type: "divider" }, { id: "same", type: "divider" }, { id: "", type: "divider" }]);
    expect(blocks[1].id).toBe("same");
    expect(new Set(ids(blocks)).size).toBe(4);
    expect(ids(blocks).every((i) => typeof i === "string" && i.length > 0)).toBe(true);
  });

  it("reading twice keeps every stored id (ids are never regenerated)", () => {
    const first = readBlocksForEditing(all).blocks;
    const second = readBlocksForEditing(serializeBlocks(first)).blocks;
    expect(ids(second)).toEqual(ids(first));
  });
});

describe("block operations are pure and id-based", () => {
  const base = readBlocksForEditing(all).blocks;

  it("insert puts a new block (new id) where asked and leaves the input alone", () => {
    const nb = newBlock("text");
    const out = insertBlock(base, nb, 2);
    expect(ids(out)).toEqual(["b1", "b2", nb.id, "b3", "b4", "b5", "b6", "b7", "b8", "b9"]);
    expect(base).toHaveLength(9);
    expect(ids(insertBlock(base, nb)).at(-1)).toBe(nb.id);
    expect(ids(insertBlock(base, nb, -5))[0]).toBe(nb.id);
    expect(ids(insertBlock(base, nb, 99)).at(-1)).toBe(nb.id);
    expect(ids(base)).not.toContain(nb.id);
  });

  it("new blocks get distinct ids and the documented defaults", () => {
    const made = (Object.keys(BLOCK_LABELS) as Array<keyof typeof BLOCK_LABELS>).map((t) => newBlock(t));
    expect(new Set(ids(made)).size).toBe(9);
    expect(newBlock("heading")).toMatchObject({ level: 2, text: "" });
    expect(newBlock("html")).toMatchObject({ height: 360 });
  });

  it("update replaces only the block with that id", () => {
    const edited = { ...(base[1] as Block), text: "changed" } as Block;
    const out = updateBlock(base, "b2", edited);
    expect(out[1]).toEqual(edited);
    expect(ids(out)).toEqual(ids(base));
    expect(out.filter((b, i) => b !== base[i])).toHaveLength(1);
  });

  it("remove drops exactly that block, keeping the others' ids and order", () => {
    expect(ids(removeBlock(base, "b3"))).toEqual(["b1", "b2", "b4", "b5", "b6", "b7", "b8", "b9"]);
    expect(removeBlock(base, "nope")).toHaveLength(9);
  });

  it("move swaps one place; the ends and unknown ids are no-ops that return the same array", () => {
    expect(ids(moveBlock(base, "b1", 1)).slice(0, 3)).toEqual(["b2", "b1", "b3"]);
    expect(ids(moveBlock(base, "b9", -1)).slice(-3)).toEqual(["b7", "b9", "b8"]);
    expect(moveBlock(base, "b1", -1)).toBe(base);
    expect(moveBlock(base, "b9", 1)).toBe(base);
    expect(moveBlock(base, "nope", 1)).toBe(base);
    expect(ids(base)[0]).toBe("b1");
  });

  it("moving every block to the end one by one reverses the page and keeps ids and contents", () => {
    let cur = base;
    for (let i = 0; i < cur.length; i++) for (let j = 0; j < cur.length - 1 - i; j++) cur = moveBlock(cur, base[i].id, 1);
    expect(ids(cur)).toEqual(ids(base).slice().reverse());
    expect(serializeBlocks(cur)).toEqual(all.slice().reverse());
  });
});

describe("checks mirrored from the server", () => {
  it("flags image/video links that are not https or site-relative, allows blank drafts", () => {
    const img = (url: string) => ({ ...newBlock("image"), url }) as Block;
    expect(urlProblem(img(""))).toBeNull();
    expect(urlProblem(img("https://e.com/a.png"))).toBeNull();
    expect(urlProblem(img("/media/a.png"))).toBeNull();
    for (const bad of ["http://e.com/a.png", "javascript:alert(1)", "data:text/html,x", "//evil.com/a.png", "ftp://e.com", "e.com/a.png", "https://", "https://a b"]) {
      expect(urlProblem(img(bad)), bad).toBeTruthy();
    }
    expect(urlProblem({ ...newBlock("video"), url: "http://x" } as Block)).toBeTruthy();
    expect(urlProblem(newBlock("text"))).toBeNull();
  });

  it("bodyProblems reports per-block links, the 500-block cap and the size cap", () => {
    const bad = { ...newBlock("image"), url: "http://x" } as Block;
    expect(bodyProblems([bad]).fields[bad.id]).toBeTruthy();
    expect(bodyProblems(all.map((b) => readBlocksForEditing([b]).blocks[0])).body).toBeNull();
    const many = Array.from({ length: MAX_BLOCKS + 1 }, () => newBlock("divider"));
    expect(bodyProblems(many).body).toMatch(/at most 500/);
    expect(bodyProblems(Array.from({ length: MAX_BLOCKS }, () => newBlock("divider"))).body).toBeNull();
    expect(bodyProblems([{ ...newBlock("text"), text: "t".repeat(600_000) } as Block]).body).toMatch(/too large/);
  });
});

describe("hasMeaningfulContent (same rule as the server's hasContent)", () => {
  const mk = (raw: unknown[]) => readBlocksForEditing(raw).blocks;
  it.each([
    ["no blocks", [], false],
    ["empty heading", [{ type: "heading", level: 2, text: "" }], false],
    ["whitespace text", [{ type: "text", text: "  \n " }], false],
    ["a lone divider", [{ type: "divider" }], false],
    ["caption without media", [{ type: "image", url: "", caption: "only a caption" }], false],
    ["empty text and callout", [{ type: "text", text: "" }, { type: "callout", variant: "info", text: "" }], false],
    ["text", [{ type: "text", text: "hello" }], true],
    ["divider then code", [{ type: "divider" }, { type: "code", language: "java", code: "int x;" }], true],
    ["an image link", [{ type: "image", url: "https://e.com/a.png", caption: "" }], true],
    ["svg", [{ type: "svg", svg: "<svg/>" }], true],
    ["html", [{ type: "html", html: "<p>x</p>", height: 100 }], true],
    ["an unknown type is never called empty", [{ type: "table", rows: [] }], true],
  ])("%s -> %s", (_n, raw, expected) => expect(hasMeaningfulContent(mk(raw as unknown[]))).toBe(expected));

  it("uses the same content fields and known types as CollectionService.hasContent (reads the Java source)", () => {
    const java = readFileSync(resolve(process.cwd(), "backend/src/main/java/com/codemastery/collection/CollectionService.java"), "utf8");
    const fields = /CONTENT_FIELDS\s*=\s*List\.of\(([^)]+)\)/.exec(java)?.[1];
    expect(fields).toBeDefined();
    expect([...fields!.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([...CONTENT_FIELDS]);
    const known = /!List\.of\(([^)]+)\)\.contains\(type\)/.exec(java)?.[1];
    expect(known).toBeDefined();
    expect([...known!.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort()).toEqual(Object.keys(BLOCK_LABELS).sort());
  });
});

describe("legacy conversion keeps everything", () => {
  const legacy: PublicLegacyContent = {
    concept: "  Two pointers use two indices.\n\nThree patterns:\n- opposite ends  ",
    realWorld: "Used in text diffing.",
    commonMistakes: ["Off-by-one", "Forgetting duplicates"],
    bestPractices: ["Sort first", "Use while (l < r)"],
    interviewRelevance: "Asked at most companies.",
    codeLanguage: "python",
    codeExample: "def f(a):\n\treturn a  # keep tabs\n",
  };
  const textOf = (b: Block[]) => b.flatMap((x) => ("text" in x ? [x.text] : "code" in x ? [x.code] : []));

  it("every field is present, verbatim, and labelled", () => {
    const out = legacyContentToBlocks(legacy);
    const t = textOf(out);
    expect(t).toContain(legacy.concept);                         // not trimmed or reworded
    expect(t).toContain(legacy.realWorld);
    expect(t).toContain(legacy.interviewRelevance);
    expect(t).toContain(legacy.codeExample!);
    const code = out.find((b) => b.type === "code") as Extract<Block, { type: "code" }>;
    expect(code.language).toBe("python");
    const lists = t.filter((x) => x.startsWith("- "));
    expect(lists.join("\n")).toContain("- Off-by-one");
    expect(lists.join("\n")).toContain("- Forgetting duplicates");
    expect(lists.join("\n")).toContain("- Sort first");
    expect(lists.join("\n")).toContain("- Use while (l < r)");
    const headings = out.filter((b) => b.type === "heading").map((b) => (b as { text: string }).text);
    expect(headings).toEqual(["Concept", "Example", "Real-world use", "Common mistakes", "Best practices", "Interview relevance"]);
    expect(out.find((b) => b.type === "callout" && b.variant === "tip")).toBeDefined();
  });

  it("the converted blocks survive a save/read cycle unchanged (ids included)", () => {
    const out = legacyContentToBlocks(legacy);
    const stored = JSON.parse(JSON.stringify(serializeBlocks(out)));
    const back = readBlocksForEditing(stored);
    expect(back.unreadable).toBe(0);
    expect(serializeBlocks(back.blocks)).toEqual(stored);
    expect(ids(back.blocks)).toEqual(ids(out));
  });

  it("only filled fields produce blocks; a page with nothing converts to nothing", () => {
    const empty: PublicLegacyContent = { concept: "", realWorld: "", commonMistakes: [], bestPractices: [], interviewRelevance: "", codeLanguage: null, codeExample: null };
    expect(legacyContentToBlocks(empty)).toEqual([]);
    expect(legacyHasContent(empty)).toBe(false);
    expect(legacyHasContent({ ...empty, commonMistakes: ["x"] })).toBe(true);
    expect(legacyHasContent({ ...empty, codeExample: "  " })).toBe(false);
    const onlyCode = legacyContentToBlocks({ ...empty, codeExample: "x = 1", codeLanguage: null });
    expect(onlyCode.map((b) => b.type)).toEqual(["heading", "code"]);
    expect((onlyCode[1] as { language: string }).language).toBe("plaintext");   // never mislabelled as another language
  });

  it("agrees with hasMeaningfulContent: filled legacy content converts to meaningful blocks", () => {
    expect(hasMeaningfulContent(legacyContentToBlocks(legacy))).toBe(true);
  });
});

describe("moveBlockTo / replaceBlock (Step 10)", () => {
  const mk = (id: string): Block => ({ id, type: "heading", level: 2, text: id });
  const abc = [mk("a"), mk("b"), mk("c"), mk("d")];
  const order = (bs: readonly { id: string }[]) => bs.map((b) => b.id).join("");

  it("moves to any index, keeps every block object (same ids and content), and never mutates the input", () => {
    const snapshot = JSON.stringify(abc);
    expect(order(moveBlockTo(abc, "a", 2))).toBe("bcad");
    expect(order(moveBlockTo(abc, "d", 0))).toBe("dabc");
    expect(order(moveBlockTo(abc, "b", 3))).toBe("acdb");
    expect(JSON.stringify(abc)).toBe(snapshot);
    const moved = moveBlockTo(abc, "a", 3);
    expect(moved.find((b) => b.id === "a")).toBe(abc[0]);
    expect(moved).toHaveLength(abc.length);
  });

  it("clamps the target, and returns the same array for an unknown id or an unchanged position", () => {
    expect(order(moveBlockTo(abc, "a", 99))).toBe("bcda");
    expect(order(moveBlockTo(abc, "d", -5))).toBe("dabc");
    expect(moveBlockTo(abc, "b", 1)).toBe(abc);
    expect(moveBlockTo(abc, "zzz", 0)).toBe(abc);
  });

  it("moves an unsupported block without touching its stored data", () => {
    const original = { type: "table", rows: [[1]] };
    const u = { id: "u", unsupported: true, original } as unknown as EditorBlock;
    const out = moveBlockTo([mk("a"), u, mk("c")], "u", 0);
    expect(out[0]).toBe(u);
    expect((out[0] as unknown as { original: unknown }).original).toBe(original);
  });

  it("replaces in place: same position and count, other blocks untouched; unknown id is a no-op", () => {
    const fresh = newBlock("code");
    const out = replaceBlock(abc, "b", fresh);
    expect(order(out.slice(0, 1))).toBe("a");
    expect(out[1]).toBe(fresh);
    expect(out[2]).toBe(abc[2]);
    expect(out).toHaveLength(4);
    expect(replaceBlock(abc, "nope", fresh)).toBe(abc);
  });
});

import { withImageAsset, withImageUrl, withoutImageAsset } from "./blocks";

describe("image sources (an uploaded asset XOR a link)", () => {
  const img = (extra: Record<string, unknown> = {}) => ({ id: "i", type: "image", url: "", caption: "c", ...extra }) as Extract<Block, { type: "image" }>;
  it("an uploaded asset empties the link; removing it deletes the key and keeps the caption", () => {
    expect(withImageAsset(img({ url: "https://x/a.png" }), "A")).toEqual({ id: "i", type: "image", url: "", caption: "c", assetId: "A" });
    const removed = withoutImageAsset(img({ assetId: "A" }));
    expect(removed).toEqual({ id: "i", type: "image", url: "", caption: "c" });
    expect("assetId" in removed).toBe(false);
  });
  it("a non-empty link replaces the asset; a blank one keeps it", () => {
    expect(withImageUrl(img({ assetId: "A" }), "https://x/a.png")).toEqual({ id: "i", type: "image", url: "https://x/a.png", caption: "c" });
    expect(withImageUrl(img({ assetId: "A" }), "  ")).toEqual({ id: "i", type: "image", url: "  ", caption: "c", assetId: "A" });
  });
  it("an image whose only content is an uploaded asset counts as content; a blank image does not", () => {
    expect(hasMeaningfulContent([img({ assetId: "A" })])).toBe(true);
    expect(hasMeaningfulContent([img()])).toBe(false);
  });
  it("assetId survives the editing round trip untouched", () => {
    const stored = [{ id: "i", type: "image", assetId: "A", caption: "" }];
    expect(serializeBlocks(readBlocksForEditing(stored).blocks)).toEqual([{ id: "i", type: "image", url: "", assetId: "A", caption: "" }]);
  });
});
