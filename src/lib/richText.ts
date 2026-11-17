// Rich text for `text` blocks (Step 13c). The structured `doc` is authoritative; `text` is its plain-text projection.
// Mirrors backend InlineDoc.java (schema, validation, projection); shared/richtext-projection-vectors.json pins both.
//
//   doc   := [ node* ]
//   node  := {"type":"paragraph","children":[run+]} | {"type":"list","ordered":bool,"items":[[run+]+]}   (flat lists)
//   run   := {"text":non-empty one-line string, "bold"?:bool, "italic"?:bool, "href"?:https-or-relative URL}
//
// Authoring syntax (what the creator types in the textarea; the approved design is toolbar + textarea, no WYSIWYG):
//   blank line = new paragraph · "- item" / "1. item" lines = lists · **bold** · _italic_ or *italic* · [label](https://...)
//   · a backslash makes the next * _ [ ] \ - . ) or space literal
// The syntax is only an input method: nothing stored is markdown, and nothing here is HTML.
import { urlProblem } from "@/lib/urlRules";

export interface Run { text: string; bold?: boolean; italic?: boolean; href?: string }
export type InlineNode =
  | { type: "paragraph"; children: Run[] }
  | { type: "list"; ordered: boolean; items: Run[][] };
export type InlineDoc = InlineNode[];

/** Same caps as InlineDoc.MAX_NODES / MAX_RUNS and BlockRules.MAX_TEXT. */
export const MAX_DOC_NODES = 200;
export const MAX_DOC_RUNS = 2_000;
export const MAX_DOC_CHARS = 20_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const hasControl = (s: string) => [...s].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f);
const onlyKeys = (o: Record<string, unknown>, allowed: string[]) => Object.keys(o).every((k) => allowed.includes(k));

/** Problems with a doc, same rules and messages as InlineDoc.problems (empty = valid). Caps apply only when `enforceCaps`. */
export function docProblems(doc: unknown, enforceCaps = true): string[] {
  const out: string[] = [];
  const add = (m: string) => { if (out.length < 5 && !out.includes(m)) out.push(m); };
  if (!Array.isArray(doc)) return ["The formatted text must be a list of paragraphs and lists."];
  if (enforceCaps && doc.length > MAX_DOC_NODES) add(`This text has too many paragraphs and lists (limit ${MAX_DOC_NODES}).`);
  let runs = 0, chars = 0;
  const runList = (value: unknown) => {
    if (!Array.isArray(value) || value.length === 0) { add("Every paragraph and list item needs some text."); return; }
    for (const r of value) {
      runs++;
      if (!isObject(r)) { add("Every piece of formatted text must be an object."); continue; }
      if (!onlyKeys(r, ["text", "bold", "italic", "href"])) add("Unexpected field in the formatted text.");
      if (typeof r.text !== "string" || r.text === "") add("Every piece of formatted text needs some text.");
      else { chars += r.text.length; if (hasControl(r.text)) add("Formatted text can't contain line breaks or control characters."); }
      for (const flag of ["bold", "italic"]) if (flag in r && typeof r[flag] !== "boolean") add(`'${flag}' must be true or false.`);
      if ("href" in r) {
        if (typeof r.href !== "string" || r.href.trim() === "") add("A link needs an address.");
        else { const why = urlProblem(r.href); if (why) add(why); }
      }
    }
  };
  for (const n of doc) {
    if (!isObject(n)) { add("Every part of the formatted text must be an object."); continue; }
    if (n.type === "paragraph") {
      if (!onlyKeys(n, ["type", "children"])) add("Unexpected field in the formatted text.");
      runList(n.children);
    } else if (n.type === "list") {
      if (!onlyKeys(n, ["type", "ordered", "items"])) add("Unexpected field in the formatted text.");
      if (typeof n.ordered !== "boolean") add("A list must say whether it is ordered (true or false).");
      if (!Array.isArray(n.items) || n.items.length === 0) add("A list needs at least one item.");
      else for (const item of n.items) runList(item);
    } else add("Unknown kind of formatted text.");
  }
  if (enforceCaps && runs > MAX_DOC_RUNS) add(`This text has too many formatted pieces (limit ${MAX_DOC_RUNS}).`);
  if (enforceCaps && chars > MAX_DOC_CHARS) add(`This is too long (limit ${MAX_DOC_CHARS} characters).`);
  return out;
}

/** The italic marker to put before position `at` of `s`: "_" unless a letter is just before it (then "_" would be part of a word). */
export const italicMarkerAt = (s: string, at: number): "_" | "*" => (isWordChar(s[at - 1]) ? "*" : "_");

export const isValidDoc = (doc: unknown, enforceCaps = false): doc is InlineDoc => docProblems(doc, enforceCaps).length === 0;

/** The plain-text projection of a VALID doc, exactly InlineDoc.project. */
export function projectDoc(doc: InlineDoc): string {
  const runs = (rs: Run[]) => rs.map((r) => r.text + (typeof r.href === "string" ? ` (${r.href})` : "")).join("");
  return doc.map((n) => (n.type === "paragraph"
    ? runs(n.children)
    : n.items.map((it, i) => `${n.ordered ? `${i + 1}. ` : "- "}${runs(it)}`).join("\n"))).join("\n\n");
}

// ---------------------------------------------------------------------------------------------- authoring syntax -> doc
type Marks = Omit<Run, "text">;
const ESCAPABLE = new Set(["\\", "*", "_", "[", "]", "-", "•", ".", ")", " "]);
const BULLET = /^[-•]\s+(.*)$/;
const NUMBERED = /^\d+[.)]\s+(.*)$/;

/** The end of `[label](href)` starting at `i` as [labelEnd, hrefEnd], or null. */
function findLink(s: string, i: number): [number, number] | null {
  for (let k = i + 1; k < s.length; k++) {
    if (s[k] === "\\" && ESCAPABLE.has(s[k + 1])) { k++; continue; }
    if (s[k] === "[") return null;
    if (s[k] === "]") {
      if (k === i + 1 || s[k + 1] !== "(") return null;
      // the address has no whitespace and ends at the ")" that balances its own parentheses (https://e.com/Foo_(bar) works);
      // "\\(", "\\)" and "\\\\" inside it are literal (how an address with an unbalanced parenthesis is written)
      let depth = 0;
      for (let j = k + 2; j < s.length; j++) {
        if (s[j] === "\\" && "()\\".includes(s[j + 1] ?? "x")) { j++; continue; }
        if (/\s/.test(s[j])) return null;
        if (s[j] === "(") depth++;
        else if (s[j] === ")") { if (depth === 0) return [k, j]; depth--; }
      }
      return null;
    }
  }
  return null;
}

type Marker = "**" | "*" | "_";
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);
/** An opening single "*" (not followed by another; "***x***" = bold around italic), or an opening "_" not inside a word (snake_case stays text). */
const isSingle = (s: string, k: number, m: Marker) =>
  (m === "_" ? s[k] === "_" && !isWordChar(s[k - 1]) : s[k] === "*" && s[k + 1] !== "*");
/** Whether the marker at k can close: "**"; a "*" that starts a run of stars ("a*b***c**" = italic b, then bold c); any "_". */
const closesAt = (s: string, k: number, m: Marker, prevEscaped: boolean) =>
  m === "**" ? s.startsWith("**", k) : m === "*" ? s[k] === "*" && (s[k - 1] !== "*" || prevEscaped) : s[k] === "_";

/**
 * Index of the marker that closes one opened just before `from`, or -1. No unescaped space just inside either marker (so
 * "5 * 3 * 2" is not italic); an escaped space ("\ ") may be, which is how a formatted run that starts or ends with a space is
 * written. Links and the other kinds of span are skipped whole, so a "_" inside a link's address never closes an italic.
 */
function findCloser(s: string, from: number, m: Marker): number {
  if (from >= s.length || s[from] === " ") return -1;
  let escaped = -1;                                       // index of the last character taken literally by an escape
  const plainSpaceBefore = (k: number) => s[k - 1] === " " && escaped !== k - 1;
  for (let k = from; k < s.length; k++) {
    if (s[k] === "\\" && ESCAPABLE.has(s[k + 1])) { escaped = k + 1; k++; continue; }
    if (k > from && !plainSpaceBefore(k) && closesAt(s, k, m, escaped === k - 1)) return k;
    // skip a complete inner span so its markers can't close ours
    if (s[k] === "[") { const l = findLink(s, k); if (l) { k = l[1]; continue; } }
    for (const inner of ["**", "*", "_"] as Marker[]) {
      if (inner === m || !(inner === "**" ? s.startsWith("**", k) : isSingle(s, k, inner))) continue;
      const j = findCloser(s, k + inner.length, inner);
      if (j > 0) { k = j + inner.length - 1; break; }
    }
  }
  return -1;
}

function parseInline(s: string, marks: Marks, out: Run[]) {
  let buf = "";
  const flush = () => { if (buf) out.push({ text: buf, ...marks }); buf = ""; };
  for (let i = 0; i < s.length;) {
    const c = s[i];
    if (c === "\\" && ESCAPABLE.has(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (c === "[" && marks.href === undefined) {
      const link = findLink(s, i);
      if (link) {
        flush();
        const href = s.slice(link[0] + 2, link[1]).replace(/\\([()\\])/g, "$1");
        parseInline(s.slice(i + 1, link[0]), { ...marks, href }, out);
        i = link[1] + 1;
        continue;
      }
    }
    const m: Marker | null = s.startsWith("**", i) ? "**" : isSingle(s, i, "*") ? "*" : isSingle(s, i, "_") ? "_" : null;
    if (m) {
      const j = findCloser(s, i + m.length, m);
      if (j > 0) { flush(); parseInline(s.slice(i + m.length, j), { ...marks, ...(m === "**" ? { bold: true } : { italic: true }) }, out); i = j + m.length; continue; }
    }
    buf += c;
    i++;
  }
  flush();
}

const sameMarks = (a: Run, b: Run) => !!a.bold === !!b.bold && !!a.italic === !!b.italic && a.href === b.href;

/** One line of authoring syntax -> runs: adjacent runs with the same marks merged, `false` flags left out. */
export function parseRuns(line: string): Run[] {
  const raw: Run[] = [];
  const oneLine = [...line].map((c) => (c === "\t" ? " " : c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f ? "" : c)).join("");
  parseInline(oneLine, {}, raw);
  const out: Run[] = [];
  for (const r of raw) {
    if (!r.text) continue;
    const last = out[out.length - 1];
    if (last && sameMarks(last, r)) last.text += r.text;
    else out.push({ text: r.text, ...(r.bold ? { bold: true } : {}), ...(r.italic ? { italic: true } : {}), ...(r.href !== undefined ? { href: r.href } : {}) });
  }
  return out;
}

/** Trims a line, but keeps a trailing space that is escaped ("x\\ "): it belongs to the text. */
function trimLine(raw: string): string {
  const t = raw.trim();
  const backslashes = /\\*$/.exec(t)![0].length;
  return backslashes % 2 === 1 && raw.slice(raw.indexOf(t) + t.length).startsWith(" ") ? `${t} ` : t;
}

/** Authoring syntax -> doc. Lines of one paragraph are joined by a space (a run is one line); blank items are left out. */
export function parseSource(source: string): InlineDoc {
  const doc: InlineDoc = [];
  for (const chunk of source.replace(/\r\n?/g, "\n").split(/\n[ \t]*\n/)) {
    let para: string[] = [];
    const flush = () => {
      const runs = parseRuns(para.join(" "));
      if (runs.length) doc.push({ type: "paragraph", children: runs });
      para = [];
    };
    let list: { type: "list"; ordered: boolean; items: Run[][] } | null = null;
    for (const raw of chunk.split("\n")) {
      const line = trimLine(raw);
      if (!line) continue;
      const m = BULLET.exec(line) ?? NUMBERED.exec(line);
      if (!m) { list = null; para.push(line); continue; }
      flush();
      const ordered = !BULLET.test(line);
      const runs = parseRuns(m[1]);
      if (!runs.length) continue;
      if (!list || list.ordered !== ordered) { list = { type: "list", ordered, items: [] }; doc.push(list); }
      list.items.push(runs);
    }
    flush();
  }
  return doc;
}

// ---------------------------------------------------------------------------------------------- doc -> authoring syntax
const escapeText = (t: string) => t.replace(/[\\*_[\]]/g, (c) => `\\${c}`);
/** Escapes the spaces at either end ("\ "): the parser would otherwise trim them, or refuse them next to a marker. */
const escapeEdgeSpaces = (t: string) => t.replace(/^ +| +$/g, (sp) => "\\ ".repeat(sp.length));

/**
 * Runs -> one line of syntax, nested link > bold > italic: neighbouring runs that share a link (or boldness) are written inside one
 * pair of markers, so two markers of the same kind never touch ("**a**_b_", "**a _b_**", never "**a***b*"). Italic is written "_".
 */
function runsSource(rs: Run[], prev?: string): string {
  const groups = <K>(items: Run[], key: (r: Run) => K) => items.reduce<{ key: K; runs: Run[] }[]>((acc, r) => {
    const last = acc[acc.length - 1];
    if (last && last.key === key(r)) last.runs.push(r); else acc.push({ key: key(r), runs: [r] });
    return acc;
  }, []);
  const edge = (t: string) => escapeEdgeSpaces(t);
  // "_", unless a letter comes just before it (an opening "_" inside a word is text): then "*". A letter before means no "*" there,
  // and a "*" closer may be followed by "**", so neither choice can touch another marker ambiguously.
  const italics = (items: Run[], before?: string) => items.map((r, i) => {
    if (!r.italic) return escapeText(r.text);
    const m = isWordChar(i > 0 ? items[i - 1].text.slice(-1) : before) ? "*" : "_";
    return `${m}${edge(escapeText(r.text))}${m}`;
  }).join("");
  const bolds = (items: Run[], before?: string) =>
    groups(items, (r) => !!r.bold).map((g, i) => (g.key ? `**${edge(italics(g.runs))}**` : italics(g.runs, i === 0 ? before : undefined))).join("");
  const address = (h: string) => h.replace(/[()\\]/g, (c) => `\\${c}`);
  return groups(rs, (r) => r.href)
    .map((g, i) => (g.key !== undefined ? `[${edge(bolds(g.runs))}](${address(g.key)})` : bolds(g.runs, i === 0 ? prev : undefined))).join("");
}

export type InlineFormat = { kind: "bold" } | { kind: "italic" } | { kind: "link"; href: string };
const LINE_PREFIX = /^[ \t]*(?:(?:[-•]|\d+[.)])[ \t]+)?/;

/**
 * Applies a toolbar format to selected authoring syntax and returns the replacement syntax. The selection is read as syntax (so
 * formatting already in it is kept, and literal characters it shows stay literal) and written back with every special character
 * escaped, so "[x]", "5 * 3", "a\\b" or "f(x)" in a label or a bold/italic selection can never break the markers around them.
 * Line by line: blank lines and line breaks are kept, each line's list marker (when the selection starts at a line start) and its
 * outer whitespace stay outside the markers, and a link spanning lines becomes one link per line. A link replaces any link already
 * inside the selection (links can't nest). `before` is the character just before the selection (it decides the italic marker).
 * `firstAddress` is the [start, end) of the first link's address in the result, for selecting it.
 */
export function formatSelection(selected: string, format: InlineFormat, atLineStart: boolean, before?: string): { text: string; firstAddress?: [number, number] } {
  let firstAddress: [number, number] | undefined;
  let out = "";
  selected.replace(/\r\n?/g, "\n").split("\n").forEach((line, i) => {
    if (i > 0) out += "\n";
    const prefix = i > 0 || atLineStart ? LINE_PREFIX.exec(line)![0] : "";
    const rest = line.slice(prefix.length);
    const lead = /^[ \t]*/.exec(rest)![0];
    const body = rest.slice(lead.length).replace(/[ \t]+$/, "");
    const trail = rest.slice(lead.length + body.length);
    const runs = parseRuns(body).map((r): Run => {
      if (format.kind === "bold") return { ...r, bold: true };
      if (format.kind === "italic") return { ...r, italic: true };
      return { ...r, href: format.href };
    });
    const merged: Run[] = [];
    for (const r of runs) { const last = merged[merged.length - 1]; if (last && sameMarks(last, r)) last.text += r.text; else merged.push({ ...r }); }
    const prevChar = (prefix + lead) ? (prefix + lead).slice(-1) : i === 0 ? before : undefined;
    const src = merged.length ? runsSource(merged, prevChar) : body;
    out += prefix + lead;
    if (format.kind === "link" && merged.length && !firstAddress) {
      const end = out.length + src.length - 1;
      firstAddress = [end - format.href.length, end];
    }
    out += src + trail;
  });
  return { text: out, firstAddress };
}

/**
 * Doc -> authoring syntax, so a stored doc can be edited. Exact: for every doc whose neighbouring runs differ in their marks (all
 * docs this editor writes), `parseSource(docToSource(doc))` equals the doc, so the `text` projection saved later is the same string.
 */
export function docToSource(doc: InlineDoc): string {
  const line = (rs: Run[]) => escapeEdgeSpaces(runsSource(rs));
  // a paragraph that merely starts like a list item ("- x", "2. x") must not come back as a list
  const para = (t: string) => t.replace(/^([-•])(\s)/, "\\$1$2").replace(/^(\d+)([.)])(\s)/, "$1\\$2$3");
  return doc.map((n) => (n.type === "paragraph"
    ? para(line(n.children))
    : n.items.map((it, i) => `${n.ordered ? `${i + 1}. ` : "- "}${line(it)}`).join("\n"))).join("\n\n");
}

/** Whether the source uses any formatting (or an escape), i.e. whether plain `text` alone could no longer hold it. */
export function sourceNeedsDoc(source: string): boolean {
  return /\\[\\*_[\]\-•.) ]/.test(source) || parseSource(source).some((n) =>
    (n.type === "paragraph" ? [n.children] : n.items).some((rs) => rs.some((r) => r.bold || r.italic || r.href !== undefined)));
}

// ---------------------------------------------------------------------------------------------- the text block
export interface TextFields { text: string; doc?: InlineDoc }

/**
 * The stored fields for what the creator typed. Backward compatible: a block without `doc` keeps storing exactly what was typed
 * in `text` (the old behaviour) until formatting is used; from then on, and for any block that already has a `doc`, `doc` is
 * the parsed source and `text` is its projection (the server refuses a mismatch and refuses dropping a stored doc).
 */
export function textFieldsFromSource(source: string, hadDoc: boolean): TextFields {
  if (!hadDoc && !sourceNeedsDoc(source)) return { text: source };
  const doc = parseSource(source);
  return { text: projectDoc(doc), doc };
}

/** What the textarea shows for a stored block: the doc as authoring syntax, or the plain text as it was stored. */
export function sourceOfTextBlock(b: { text: string; doc?: unknown }): string {
  return b.doc !== undefined && isValidDoc(b.doc) ? docToSource(b.doc) : b.text;
}
