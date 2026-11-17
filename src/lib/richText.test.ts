import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  MAX_DOC_CHARS, MAX_DOC_NODES, MAX_DOC_RUNS, docProblems, docToSource, isValidDoc, parseRuns, parseSource, projectDoc, sourceNeedsDoc,
  sourceOfTextBlock, textFieldsFromSource, type InlineDoc,
} from "@/lib/richText";
import { readBlocksForEditing, serializeBlocks, UNSUPPORTED, bodyProblems } from "@/lib/blocks";

const V = JSON.parse(readFileSync(resolve(process.cwd(), "shared/richtext-projection-vectors.json"), "utf8")) as {
  projection: { name: string; doc: InlineDoc; text: string }[]; invalid: { name: string; doc: unknown }[];
};

describe("shared vectors (the same file the backend's InlineDoc tests read)", () => {
  it.each(V.projection.map((v) => [v.name, v] as const))("projection: %s", (_n, v) => {
    expect(docProblems(v.doc)).toEqual([]);
    expect(projectDoc(v.doc)).toBe(v.text);
  });
  it.each(V.invalid.map((v) => [v.name, v] as const))("invalid: %s", (_n, v) => {
    expect(docProblems(v.doc).length).toBeGreaterThan(0);
  });
  it("every valid vector survives doc -> authoring syntax -> doc EXACTLY (same doc, same projection)", () => {
    for (const v of V.projection) {
      const back = parseSource(docToSource(v.doc));
      expect(back).toEqual(v.doc);
      expect(projectDoc(back)).toBe(v.text);
    }
  });
});

describe("exact round trip: fuzzed docs", () => {
  // deterministic PRNG so a failure is reproducible
  let seed = 13;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const CHARS = ["a", "b", "Z", "1", "é", " ", " ", "*", "_", "[", "]", "(", ")", "\\", "-", ".", "•", "#", "x_y"];
  const HREFS = ["https://e.com/a", "/discover", "https://en.wikipedia.org/wiki/Foo_(bar)", "https://e.com/a_b*c"];
  const text = () => Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => pick(CHARS)).join("");
  const runs = () => {
    const out: InlineDoc[number] extends never ? never : { text: string; bold?: boolean; italic?: boolean; href?: string }[] = [];
    for (let n = 1 + Math.floor(rnd() * 5); n > 0; n--) {
      const r = { text: text(), ...(rnd() < 0.4 ? { bold: true } : {}), ...(rnd() < 0.4 ? { italic: true } : {}), ...(rnd() < 0.25 ? { href: pick(HREFS) } : {}) };
      const last = out[out.length - 1];
      if (last && !!last.bold === !!r.bold && !!last.italic === !!r.italic && last.href === r.href) last.text += r.text;   // canonical
      else out.push(r);
    }
    return out;
  };
  const docOf = (): InlineDoc => Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => (rnd() < 0.5
    ? { type: "paragraph" as const, children: runs() }
    : { type: "list" as const, ordered: rnd() < 0.5, items: Array.from({ length: 1 + Math.floor(rnd() * 3) }, runs) }));

  it("5,000 random valid docs: parseSource(docToSource(doc)) equals the doc, and the projection is identical", () => {
    const failures: string[] = [];
    for (let i = 0; i < 5000; i++) {
      const doc = docOf();
      expect(docProblems(doc)).toEqual([]);
      const back = parseSource(docToSource(doc));
      if (JSON.stringify(back) !== JSON.stringify(doc) || projectDoc(back) !== projectDoc(doc)) failures.push(JSON.stringify({ doc, source: docToSource(doc), back }));
    }
    expect(failures.slice(0, 3)).toEqual([]);
  });

  it("the text sent with a doc is always exactly projectDoc(doc), for any typed source", () => {
    for (let i = 0; i < 2000; i++) {
      const src = Array.from({ length: Math.floor(rnd() * 40) }, () => pick([...CHARS, "\n", "\n\n", "- ", "1. ", "**", "[l](https://e.com)"])).join("");
      const f = textFieldsFromSource(src, true);
      expect(docProblems(f.doc!, false)).toEqual([]);
      expect(f.text).toBe(projectDoc(f.doc!));
    }
  });
});

describe("caps mirror InlineDoc / BlockRules (reads the Java source)", () => {
  it("node, run and character limits", () => {
    const java = readFileSync(resolve(process.cwd(), "backend/src/main/java/com/codemastery/blocks/InlineDoc.java"), "utf8");
    const rules = readFileSync(resolve(process.cwd(), "backend/src/main/java/com/codemastery/blocks/BlockRules.java"), "utf8");
    const num = (src: string, name: string) => Number(new RegExp(`${name}\\s*=\\s*([0-9_]+)`).exec(src)![1].replace(/_/g, ""));
    expect(MAX_DOC_NODES).toBe(num(java, "MAX_NODES"));
    expect(MAX_DOC_RUNS).toBe(num(java, "MAX_RUNS"));
    expect(MAX_DOC_CHARS).toBe(num(rules, "MAX_TEXT"));
  });
  it("are enforced only when asked (an unchanged stored doc is exempt, as on the server)", () => {
    const big: InlineDoc = Array.from({ length: MAX_DOC_NODES + 1 }, () => ({ type: "paragraph", children: [{ text: "x" }] }));
    expect(docProblems(big, true)).toContain(`This text has too many paragraphs and lists (limit ${MAX_DOC_NODES}).`);
    expect(docProblems(big, false)).toEqual([]);
  });
});

describe("authoring syntax", () => {
  it.each([
    ["plain", "Hello world", [{ text: "Hello world" }]],
    ["bold", "a **b** c", [{ text: "a " }, { text: "b", bold: true }, { text: " c" }]],
    ["italic", "a *b* c", [{ text: "a " }, { text: "b", italic: true }, { text: " c" }]],
    ["bold and italic", "**_b_**", [{ text: "b", bold: true, italic: true }]],
    ["underscore italic", "a _b_ c", [{ text: "a " }, { text: "b", italic: true }, { text: " c" }]],
    ["snake_case is text, not italic", "my_var_name and x_y_z", [{ text: "my_var_name and x_y_z" }]],
    ["an underscore in a link address never closes italic", "_see [x](https://e.com/a_b)_", [{ text: "see ", italic: true }, { text: "x", italic: true, href: "https://e.com/a_b" }]],
    ["a link address with balanced parentheses", "[w](https://en.wikipedia.org/wiki/Foo_(bar))", [{ text: "w", href: "https://en.wikipedia.org/wiki/Foo_(bar)" }]],
    ["italic inside bold", "**a *b* c**", [{ text: "a ", bold: true }, { text: "b", bold: true, italic: true }, { text: " c", bold: true }]],
    ["a link", "See [the docs](https://docs.oracle.com/).", [{ text: "See " }, { text: "the docs", href: "https://docs.oracle.com/" }, { text: "." }]],
    ["a bold link", "**[x](/discover)**", [{ text: "x", bold: true, href: "/discover" }]],
    ["an unclosed marker is literal", "**not bold", [{ text: "**not bold" }]],
    ["spaced stars are arithmetic, not italic", "5 * 3 * 2", [{ text: "5 * 3 * 2" }]],
    ["escapes", "\\*\\*x\\*\\* and \\[y\\]", [{ text: "**x** and [y]" }]],
    ["a broken link stays text", "[x] (https://e.com)", [{ text: "[x] (https://e.com)" }]],
    ["tabs become spaces, other control characters go", "a\tb\u0007c", [{ text: "a bc" }]],
  ])("%s", (_n, src, runs) => expect(parseRuns(src)).toEqual(runs));

  it("paragraphs, lists, and joined lines", () => {
    expect(parseSource("Steps:\n\n1. One\n2. Two\n\nDone\nhere.")).toEqual([
      { type: "paragraph", children: [{ text: "Steps:" }] },
      { type: "list", ordered: true, items: [[{ text: "One" }], [{ text: "Two" }]] },
      { type: "paragraph", children: [{ text: "Done here." }] },
    ]);
    expect(parseSource("- a\n- **b**\n1. c")).toEqual([
      { type: "list", ordered: false, items: [[{ text: "a" }], [{ text: "b", bold: true }]] },
      { type: "list", ordered: true, items: [[{ text: "c" }]] },
    ]);
  });

  it("never produces an invalid doc: blank paragraphs and items are left out", () => {
    for (const src of ["", "\n\n\n", "- \n-  \n1. ", "** **", "a\n\n\n\nb", "[](https://e.com)", "*", "\\"]) {
      expect(docProblems(parseSource(src), false)).toEqual([]);
    }
  });

  it("a paragraph that starts like a list item round-trips as a paragraph", () => {
    const doc: InlineDoc = [{ type: "paragraph", children: [{ text: "- not a list" }] }, { type: "paragraph", children: [{ text: "2. nor this" }] }];
    expect(parseSource(docToSource(doc))).toEqual(doc);
  });

  it("formatted runs with edge spaces and special characters round-trip", () => {
    const doc: InlineDoc = [{ type: "paragraph", children: [{ text: "a" }, { text: " b* ", bold: true }, { text: "[c]", italic: true }, { text: "\\" }] }];
    const back = parseSource(docToSource(doc));
    expect(projectDoc(back)).toBe(projectDoc(doc));
    expect(back.flatMap((n) => (n.type === "paragraph" ? n.children : [])).filter((r) => r.bold).map((r) => r.text.trim())).toEqual(["b*"]);
  });

  it("a link with an unsafe address parses, and is reported with the shared URL message", () => {
    expect(docProblems(parseSource("[x](javascript:alert(1))"))).toEqual(["Use an https:// link (or a /path on this site)."]);
    expect(docProblems(parseSource("[x](http://e.com)"))).toEqual(["Use an https:// link (or a /path on this site)."]);
  });
});

describe("text block fields: doc authoritative, text its projection, old blocks unchanged", () => {
  it("a block without a doc stays plain until formatting is used", () => {
    expect(textFieldsFromSource("- a\n- b", false)).toEqual({ text: "- a\n- b" });
    expect(sourceNeedsDoc("plain 5 * 3")).toBe(false);
    expect(textFieldsFromSource("a **b**", false)).toEqual({ text: "a b", doc: [{ type: "paragraph", children: [{ text: "a " }, { text: "b", bold: true }] }] });
  });
  it("a block with a doc always keeps one, and text is exactly its projection", () => {
    const f = textFieldsFromSource("plain now", true);
    expect(f.doc).toEqual([{ type: "paragraph", children: [{ text: "plain now" }] }]);
    expect(f.text).toBe(projectDoc(f.doc!));
    expect(textFieldsFromSource("", true)).toEqual({ text: "", doc: [] });
  });
  it("the textarea shows the doc as syntax, or the stored text when there is no (valid) doc", () => {
    expect(sourceOfTextBlock({ text: "a b", doc: [{ type: "paragraph", children: [{ text: "a " }, { text: "b", bold: true }] }] })).toBe("a **b**");
    expect(sourceOfTextBlock({ text: "old *text*" })).toBe("old *text*");
  });
  it("reading: a valid doc is editable; an invalid stored doc is kept read-only, byte-for-byte", () => {
    const good = { id: "a", type: "text", text: "x", doc: [{ type: "paragraph", children: [{ text: "x" }] }] };
    const bad = { id: "b", type: "text", text: "y", doc: [{ type: "heading", children: [{ text: "y" }] }] };
    const { blocks } = readBlocksForEditing([good, bad]);
    expect(blocks.map((b) => b.type)).toEqual(["text", UNSUPPORTED]);
    expect(serializeBlocks(blocks)).toEqual([good, bad]);
  });
  it("bodyProblems reports a bad link in a doc on its block", () => {
    const { fields } = bodyProblems([{ id: "a", type: "text", text: "x (http://e.com)", doc: [{ type: "paragraph", children: [{ text: "x", href: "http://e.com" }] }] }]);
    expect(fields).toEqual({ a: "Use an https:// link (or a /path on this site)." });
    expect(isValidDoc([{ type: "paragraph", children: [{ text: "x", href: "http://e.com" }] }])).toBe(false);
  });
});

describe("formatSelection (toolbar): the selected text is kept exactly and the format applies to all of it", () => {
  it("fuzz: every format keeps each line's characters and marks every run", async () => {
    const { formatSelection, parseRuns } = await import("./richText");
    let seed = 11;
    const rnd = (n: number) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
    const alphabet = ["a", "b", "é", " ", "*", "**", "_", "[", "]", "(", ")", "\\", "-", "1", ".", "[x](https://e.com/(a))"];
    const plainText = (s: string) => parseRuns(s).map((r) => r.text).join("");
    for (let n = 0; n < 3000; n++) {
      const line = Array.from({ length: 1 + rnd(12) }, () => alphabet[rnd(alphabet.length)]).join("");
      const before = ["a", " ", undefined][rnd(3)];
      for (const f of [{ kind: "bold" }, { kind: "italic" }, { kind: "link", href: "https://x.org/a_(b)" }] as const) {
        const { text } = formatSelection(line, f, false, before);
        const out = parseRuns((before ?? "") + text).slice(before && before !== " " ? 1 : 0);
        const expectedText = plainText(line).trim();
        if (!expectedText) continue;
        expect(out.map((r) => r.text).join("").trim()).toBe(expectedText);
        const body = out.filter((r) => r.text.trim());
        for (const r of body) {
          if (f.kind === "bold") expect(r.bold).toBe(true);
          else if (f.kind === "italic") expect(r.italic).toBe(true);
          else expect(r.href).toBe(f.href);
        }
      }
    }
  });
});
