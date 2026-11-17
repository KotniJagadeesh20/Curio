// Page content blocks (stored as a JSON array in lessons.blocks; array order = block order). Plain text only; no markdown.
// PageBlock is a TypeScript concept only: there is no block table (PLAN decision 2).
import type { PublicLegacyContent, StoredBlock } from "@/lib/types";
import { urlProblem as sharedUrlProblem } from "@/lib/urlRules";
import { docProblems, isValidDoc, type InlineDoc } from "@/lib/richText";

export type CalloutVariant = "info" | "tip" | "warning";

export type BlockData =
  | { type: "heading"; level: 2 | 3; text: string }
  /** Step 13: `doc` (when present) is the authoritative rich text and `text` its plain-text projection (src/lib/richText.ts). */
  | { type: "text"; text: string; doc?: InlineDoc }
  | { type: "code"; language: string; code: string; caption: string }
  | { type: "image"; url: string; caption: string; /** An uploaded image (Step 12). Exactly one of this and a non-empty `url`. */ assetId?: string }
  | { type: "video"; url: string; caption: string }
  | { type: "html"; html: string; height: number }
  | { type: "svg"; svg: string; caption: string }
  | { type: "callout"; variant: CalloutVariant; text: string }
  /** Step 13: plain-text cells; every row has the same number of cells. With `hasHeader`, row 0 is the column headings. */
  | { type: "table"; hasHeader: boolean; caption: string; rows: string[][] }
  | { type: "divider" };

export type Block = BlockData & { id: string };
export type BlockType = Block["type"];

export const BLOCK_LABELS: Record<BlockType, string> = {
  heading: "Heading",
  text: "Text",
  code: "Code snippet",
  image: "Image",
  video: "Video",
  html: "HTML",
  svg: "SVG diagram",
  callout: "Callout",
  table: "Table",
  divider: "Divider",
};

const uid = () => Math.random().toString(36).slice(2, 10);

export function newBlock(type: BlockType): Block {
  const id = uid();
  switch (type) {
    case "heading": return { id, type, level: 2, text: "" };
    case "text": return { id, type, text: "" };
    case "code": return { id, type, language: "java", code: "", caption: "" };
    case "image": return { id, type, url: "", caption: "" };
    case "video": return { id, type, url: "", caption: "" };
    case "html": return { id, type, html: "", height: 360 };
    case "svg": return { id, type, svg: "", caption: "" };
    case "callout": return { id, type, variant: "info", text: "" };
    case "table": return { id, type, hasHeader: true, caption: "", rows: [["", ""], ["", ""]] };
    case "divider": return { id, type };
  }
}

/** Blocks coming from the API may lack ids (or be malformed); make them safe to edit. */
export function normalizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) => {
    if (!b || typeof b !== "object" || !(b.type in BLOCK_LABELS)) return [];
    if (b.type === "table" && !isWellFormedTable(b)) return [];   // nothing safe to show
    return [{ ...newBlock(b.type), ...tableDefaults(b), ...b, id: b.id || uid() } as Block];
  });
}

/** Turns the legacy concept/code/etc. fields into blocks, so existing lessons can be edited in the block editor. */
export function legacyToBlocks(l: {
  concept: string; realWorld: string; codeExample: string | null; codeLanguage: string | null;
  commonMistakes: string[]; bestPractices: string[]; interviewRelevance: string;
}): Block[] {
  const out: Block[] = [];
  const text = (t: string) => t.trim() && out.push({ ...newBlock("text"), text: t } as Block);
  const heading = (t: string) => out.push({ ...newBlock("heading"), text: t } as Block);
  if (l.concept.trim()) { heading("Concept"); text(l.concept); }
  if (l.codeExample?.trim()) {
    heading("Example");
    out.push({ ...newBlock("code"), language: l.codeLanguage || "java", code: l.codeExample } as Block);
  }
  if (l.realWorld.trim()) out.push({ ...newBlock("callout"), variant: "info", text: l.realWorld } as Block);
  if (l.commonMistakes.length) { heading("Common mistakes"); text(l.commonMistakes.map((m) => `- ${m}`).join("\n")); }
  if (l.bestPractices.length) { heading("Best practices"); text(l.bestPractices.map((m) => `- ${m}`).join("\n")); }
  if (l.interviewRelevance.trim()) out.push({ ...newBlock("callout"), variant: "tip", text: l.interviewRelevance } as Block);
  return out;
}

export { embedUrl, isSafeUrl } from "@/lib/urlRules";

// ---------------------------------------------------------------------------
// Editing model (Step 9). Principle: never lose what is stored.
//  - Known block types are edited as typed blocks and keep their ids.
//  - A block of a type this version doesn't know (a later step's `quiz`, say) is wrapped, shown read-only and written
//    back EXACTLY as it was read.
//  - Anything that is not a block at all is counted as `unreadable`; the editor then refuses to save the body rather
//    than overwrite data it could not understand.
// ---------------------------------------------------------------------------
export const UNSUPPORTED = "__unsupported__" as const;

export interface UnsupportedBlock {
  id: string;
  type: typeof UNSUPPORTED;
  /** The stored object, untouched. */
  original: Record<string, unknown>;
}
export type EditorBlock = Block | UnsupportedBlock;

export const isUnsupported = (b: EditorBlock): b is UnsupportedBlock => b.type === UNSUPPORTED;
export const blockLabel = (b: EditorBlock) => (isUnsupported(b) ? `Unsupported block (${String(b.original.type)})` : BLOCK_LABELS[b.type]);

/** Server sanity limits (CollectionService.MAX_BLOCKS / MAX_BLOCKS_JSON); the real schema is Step 11. */
export const MAX_BLOCKS = 500;
export const MAX_JSON_CHARS = 500_000;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export interface ReadResult {
  blocks: EditorBlock[];
  /** Items that are not blocks (not an object, or no string `type`). Saving the body is unsafe while this is > 0. */
  unreadable: number;
}

/**
 * Stored JSON -> editable blocks. Keeps every stored id; generates one only for a block that has none (or repeats an
 * earlier one, which would break list keys). Unknown types are wrapped, never dropped.
 */
export function readBlocksForEditing(raw: unknown): ReadResult {
  if (raw === null || raw === undefined) return { blocks: [], unreadable: 0 };
  if (!Array.isArray(raw)) return { blocks: [], unreadable: 1 };
  const seen = new Set<string>();
  const unique = (id: unknown) => {
    let out = typeof id === "string" && id ? id : uid();
    while (seen.has(out)) out = uid();
    seen.add(out);
    return out;
  };
  const blocks: EditorBlock[] = [];
  let unreadable = 0;
  for (const item of raw) {
    if (!isObject(item) || typeof item.type !== "string") { unreadable++; continue; }
    if (item.type in BLOCK_LABELS && (item.type !== "table" || isWellFormedTable(item)) && (item.type !== "text" || !("doc" in item) || isValidDoc(item.doc))) {
      blocks.push({ ...newBlock(item.type as BlockType), ...tableDefaults(item), ...item, id: unique(item.id) } as Block);
    } else {   // also a stored table or rich text this editor could not edit safely: kept exactly as it was
      blocks.push({ id: unique(item.id), type: UNSUPPORTED, original: item });
    }
  }
  return { blocks, unreadable };
}

/** Editable blocks -> the array to send. Unsupported blocks go back exactly as read. */
export function serializeBlocks(blocks: EditorBlock[]): StoredBlock[] {
  return blocks.map((b) => (isUnsupported(b) ? (b.original as StoredBlock) : (b as unknown as StoredBlock)));
}

// ---- tables (Step 13). Limits mirror BlockRules.MAX_TABLE_* / MAX_CELL / MAX_CAPTION; the server is authoritative. ----
export const MAX_TABLE_ROWS = 50;
export const MAX_TABLE_COLS = 10;
export const MAX_TABLE_CELL = 500;
export const MAX_TABLE_CHARS = 20_000;
export const MAX_TABLE_CAPTION = 500;

export type TableBlock = Extract<Block, { type: "table" }>;

/**
 * The shape the server always requires (BlockRules.table, independent of size caps): `rows` is a non-empty list of equally
 * long, non-empty lists of strings; `hasHeader`, when present, is a boolean; `caption`, when present, is a string. A
 * stored table that is not this shape is never opened in the table editor (the editor keeps it read-only, as stored).
 */
export function isWellFormedTable(b: Record<string, unknown>): boolean {
  if ("hasHeader" in b && typeof b.hasHeader !== "boolean") return false;
  if ("caption" in b && typeof b.caption !== "string") return false;
  const rows = b.rows;
  if (!Array.isArray(rows) || rows.length === 0) return false;
  const cols = Array.isArray(rows[0]) ? rows[0].length : 0;
  return cols > 0 && rows.every((r) => Array.isArray(r) && r.length === cols && r.every((c) => typeof c === "string"));
}

/** A stored table without `hasHeader` has none (server: absent = false), so reading must not default it to true. */
const tableDefaults = (b: Record<string, unknown>) => (b.type === "table" ? { hasHeader: false } : {});

const columnCount = (t: TableBlock) => t.rows[0]?.length ?? 0;

/** The problem the server would report for this table's size, or null. Shape is guaranteed by the editing operations. */
export function tableProblem(b: EditorBlock): string | null {
  if (isUnsupported(b) || b.type !== "table") return null;
  if (!isWellFormedTable(b as unknown as Record<string, unknown>)) {
    if (!Array.isArray(b.rows) || b.rows.length === 0) return "A table needs at least one row.";
    if (b.rows.some((r) => !Array.isArray(r) || r.length === 0)) return "Every row needs at least one cell.";
    if (typeof b.hasHeader !== "boolean") return "The header setting must be true or false.";
    if (typeof b.caption !== "string") return "The caption must be text.";
    if (b.rows.some((r) => r.some((c) => typeof c !== "string"))) return "Every cell must be text.";
    return "Every row needs the same number of cells.";
  }
  if (b.caption.length > MAX_TABLE_CAPTION) return `The caption is too long (limit ${MAX_TABLE_CAPTION} characters).`;
  if (b.rows.length > MAX_TABLE_ROWS) return `A table can have at most ${MAX_TABLE_ROWS} rows.`;
  if (columnCount(b) > MAX_TABLE_COLS) return `A table can have at most ${MAX_TABLE_COLS} columns.`;
  if (b.rows.some((r) => r.some((c) => c.length > MAX_TABLE_CELL))) return `A cell is too long (limit ${MAX_TABLE_CELL} characters).`;
  if (b.rows.reduce((n, r) => n + r.reduce((m, c) => m + c.length, 0), 0) > MAX_TABLE_CHARS) {
    return `This table has too much text (limit ${MAX_TABLE_CHARS} characters in all).`;
  }
  return null;
}

/** Same rule as the server's tableHasData: a data cell (not the header row) has non-whitespace text. */
export function tableHasData(t: { hasHeader?: unknown; rows?: unknown }): boolean {
  if (!Array.isArray(t.rows)) return true;   // can't inspect it: never call it empty
  const data = t.hasHeader === true ? t.rows.slice(1) : t.rows;
  return data.some((r) => !Array.isArray(r) || r.some((c) => typeof c !== "string" || c.trim() !== ""));
}

/** A rich-text problem the server would report (a bad link, too long, too many parts), or null. */
export function richTextProblem(b: EditorBlock): string | null {
  if (isUnsupported(b) || b.type !== "text" || b.doc === undefined) return null;
  return docProblems(b.doc, true)[0] ?? null;
}

// Pure, immutable table edits. Every one keeps the table rectangular and at least 1x1; an impossible edit returns the same block.
export function setTableCell(t: TableBlock, row: number, col: number, value: string): TableBlock {
  if (!t.rows[row] || col < 0 || col >= t.rows[row].length) return t;
  return { ...t, rows: t.rows.map((r, i) => (i === row ? r.map((c, j) => (j === col ? value : c)) : r)) };
}
export function addTableRow(t: TableBlock, at = t.rows.length): TableBlock {
  if (t.rows.length >= MAX_TABLE_ROWS) return t;
  const i = Math.max(0, Math.min(at, t.rows.length));
  return { ...t, rows: [...t.rows.slice(0, i), Array<string>(columnCount(t)).fill(""), ...t.rows.slice(i)] };
}
export function removeTableRow(t: TableBlock, row: number): TableBlock {
  if (t.rows.length <= 1 || row < 0 || row >= t.rows.length) return t;
  return { ...t, rows: t.rows.filter((_, i) => i !== row) };
}
export function addTableColumn(t: TableBlock, at = columnCount(t)): TableBlock {
  if (columnCount(t) >= MAX_TABLE_COLS) return t;
  const j = Math.max(0, Math.min(at, columnCount(t)));
  return { ...t, rows: t.rows.map((r) => [...r.slice(0, j), "", ...r.slice(j)]) };
}
export function removeTableColumn(t: TableBlock, col: number): TableBlock {
  if (columnCount(t) <= 1 || col < 0 || col >= columnCount(t)) return t;
  return { ...t, rows: t.rows.map((r) => r.filter((_, j) => j !== col)) };
}

// ---- pure, immutable operations (ids, not positions, identify blocks) ----
export const insertBlock = (blocks: EditorBlock[], block: EditorBlock, index = blocks.length): EditorBlock[] => {
  const at = Math.max(0, Math.min(index, blocks.length));
  return [...blocks.slice(0, at), block, ...blocks.slice(at)];
};

export const updateBlock = (blocks: EditorBlock[], id: string, next: EditorBlock): EditorBlock[] =>
  blocks.map((b) => (b.id === id ? next : b));

export const removeBlock = (blocks: EditorBlock[], id: string): EditorBlock[] => blocks.filter((b) => b.id !== id);

/** Moves one place up (-1) or down (+1); at either end (or for an unknown id) the same array is returned. */
export function moveBlock(blocks: EditorBlock[], id: string, delta: -1 | 1): EditorBlock[] {
  const from = blocks.findIndex((b) => b.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= blocks.length) return blocks;
  const next = [...blocks];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** Moves a block to `toIndex` (clamped); an unknown id or an unchanged position returns the same array. Ids are untouched. */
export function moveBlockTo(blocks: EditorBlock[], id: string, toIndex: number): EditorBlock[] {
  const from = blocks.findIndex((b) => b.id === id);
  const to = Math.max(0, Math.min(blocks.length - 1, toIndex));
  if (from < 0 || from === to) return blocks;
  const next = [...blocks];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

/** Replaces one block by another in place (the slash menu turns an empty text block into the chosen type). Count unchanged. */
export function replaceBlock(blocks: EditorBlock[], id: string, replacement: EditorBlock): EditorBlock[] {
  const i = blocks.findIndex((b) => b.id === id);
  if (i < 0) return blocks;
  const next = [...blocks];
  next[i] = replacement;
  return next;
}

// ---- checks that mirror the server (UX; the server is authoritative) ----
/** image/video links: the shared URL rule (src/lib/urlRules.ts). Blank is fine in a draft. */
export function urlProblem(b: EditorBlock): string | null {
  if (isUnsupported(b) || (b.type !== "image" && b.type !== "video")) return null;
  return sharedUrlProblem(b.url);
}

// ---- image block sources: an uploaded asset XOR a link (the server refuses both together) ----
/** Uses an uploaded image: sets `assetId` and empties the link. */
export const withImageAsset = (b: Extract<Block, { type: "image" }>, assetId: string): Block => ({ ...b, assetId, url: "" });
/** Drops the uploaded image (the reference is removed on the next save); the block keeps its caption and has no source. */
export function withoutImageAsset(b: Extract<Block, { type: "image" }>): Block {
  const { assetId: _removed, ...rest } = b;
  return { ...rest, url: "" };
}
/** Typing a link: a non-empty link replaces any uploaded image, so a block never carries both. */
export function withImageUrl(b: Extract<Block, { type: "image" }>, url: string): Block {
  if (url.trim() === "") return { ...b, url };
  const { assetId: _removed, ...rest } = b;
  return { ...rest, url };
}

/** A server-side problem remembered together with the block as it was when the server refused it. */
export interface RecordedProblem { id: string; message: string; snapshot: string }

const blockJson = (b: EditorBlock) => JSON.stringify(serializeBlocks([b])[0]);

/** Turns the server's INVALID_BLOCKS problems into per-block records (only for blocks still on the page). */
export function recordServerProblems(blocks: EditorBlock[], problems: { id: string; message: string }[]): RecordedProblem[] {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return problems.flatMap((p) => { const b = byId.get(p.id); return b ? [{ id: p.id, message: p.message, snapshot: blockJson(b) }] : []; });
}

/** The recorded problems that still apply: a message disappears as soon as ITS block is edited (or removed). */
export function activeServerProblems(blocks: EditorBlock[], recorded: RecordedProblem[]): Record<string, string> {
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const out: Record<string, string> = {};
  for (const r of recorded) {
    const b = byId.get(r.id);
    if (!b || blockJson(b) !== r.snapshot) continue;
    out[r.id] = out[r.id] ? `${out[r.id]} ${r.message}` : r.message;
  }
  return out;
}

export interface BodyProblems {
  /** per block id */
  fields: Record<string, string>;
  /** whole-body problems (too many blocks / too large) */
  body: string | null;
}

export function bodyProblems(blocks: EditorBlock[]): BodyProblems {
  const fields: Record<string, string> = {};
  for (const b of blocks) {
    const p = urlProblem(b) ?? tableProblem(b) ?? richTextProblem(b);
    if (p) fields[b.id] = p;
  }
  let body: string | null = null;
  if (blocks.length > MAX_BLOCKS) body = `A page can have at most ${MAX_BLOCKS} blocks.`;
  else if (JSON.stringify(serializeBlocks(blocks)).length > MAX_JSON_CHARS) body = "This page's content is too large to save. Remove some content.";
  return { fields, body };
}

/** The block fields that carry content. Same list as CollectionService.CONTENT_FIELDS (pinned by blocks.test.ts). */
export const CONTENT_FIELDS = ["text", "code", "url", "assetId", "html", "svg"] as const;

/**
 * "Does this body have anything to read?" Same rule as the server's `hasContent` (CollectionService): no blocks,
 * `[]`, or blocks that are all blank (empty heading/text, a lone divider, a caption without media) is NOT content.
 * A block of a type we don't know counts as content (never call data we can't inspect empty).
 */
export function hasMeaningfulContent(blocks: EditorBlock[]): boolean {
  return blocks.some((b) => {
    if (isUnsupported(b)) return true;
    if (b.type === "table") return tableHasData(b);
    const v = b as unknown as Record<string, unknown>;
    return CONTENT_FIELDS.some((f) => typeof v[f] === "string" && (v[f] as string).trim() !== "");
  });
}

export function legacyHasContent(l: PublicLegacyContent): boolean {
  return [l.concept, l.realWorld, l.interviewRelevance, l.codeExample ?? ""].some((x) => x.trim() !== "")
    || l.commonMistakes.length > 0 || l.bestPractices.length > 0;
}

/**
 * Legacy structured fields -> blocks, for the explicit "Convert to blocks" action. Every filled field is kept, verbatim
 * (concept, real-world, interview text and the code example are not trimmed or reworded) and each gets a heading so its
 * meaning survives. Nothing here runs until the creator asks, and nothing is saved until they press Save.
 */
export function legacyContentToBlocks(l: PublicLegacyContent): Block[] {
  const out: Block[] = [];
  const heading = (text: string) => out.push({ ...newBlock("heading"), text } as Block);
  const text = (t: string) => out.push({ ...newBlock("text"), text: t } as Block);
  const callout = (variant: CalloutVariant, t: string) => out.push({ ...newBlock("callout"), variant, text: t } as Block);
  const bullets = (items: string[]) => items.filter((i) => i.trim() !== "").map((i) => `- ${i}`).join("\n");

  if (l.concept.trim()) { heading("Concept"); text(l.concept); }
  if ((l.codeExample ?? "").trim()) {
    heading("Example");
    out.push({ ...newBlock("code"), language: l.codeLanguage || "plaintext", code: l.codeExample! } as Block);
  }
  if (l.realWorld.trim()) { heading("Real-world use"); callout("info", l.realWorld); }
  if (bullets(l.commonMistakes)) { heading("Common mistakes"); text(bullets(l.commonMistakes)); }
  if (bullets(l.bestPractices)) { heading("Best practices"); text(bullets(l.bestPractices)); }
  if (l.interviewRelevance.trim()) { heading("Interview relevance"); callout("tip", l.interviewRelevance); }
  return out;
}
