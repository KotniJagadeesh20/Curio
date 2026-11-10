// Page content blocks (stored as a JSON array in lessons.blocks; array order = block order). Plain text only; no markdown.
// PageBlock is a TypeScript concept only: there is no block table (PLAN decision 2).
import type { PublicLegacyContent, StoredBlock } from "@/lib/types";
import { urlProblem as sharedUrlProblem } from "@/lib/urlRules";

export type CalloutVariant = "info" | "tip" | "warning";

export type BlockData =
  | { type: "heading"; level: 2 | 3; text: string }
  | { type: "text"; text: string }
  | { type: "code"; language: string; code: string; caption: string }
  | { type: "image"; url: string; caption: string; /** An uploaded image (Step 12). Exactly one of this and a non-empty `url`. */ assetId?: string }
  | { type: "video"; url: string; caption: string }
  | { type: "html"; html: string; height: number }
  | { type: "svg"; svg: string; caption: string }
  | { type: "callout"; variant: CalloutVariant; text: string }
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
    case "divider": return { id, type };
  }
}

/** Blocks coming from the API may lack ids (or be malformed); make them safe to edit. */
export function normalizeBlocks(raw: unknown): Block[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((b) => {
    if (!b || typeof b !== "object" || !(b.type in BLOCK_LABELS)) return [];
    return [{ ...newBlock(b.type), ...b, id: b.id || uid() } as Block];
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
//  - A block of a type this version doesn't know (a later step's `table`, say) is wrapped, shown read-only and written
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
    if (item.type in BLOCK_LABELS) {
      blocks.push({ ...newBlock(item.type as BlockType), ...item, id: unique(item.id) } as Block);
    } else {
      blocks.push({ id: unique(item.id), type: UNSUPPORTED, original: item });
    }
  }
  return { blocks, unreadable };
}

/** Editable blocks -> the array to send. Unsupported blocks go back exactly as read. */
export function serializeBlocks(blocks: EditorBlock[]): StoredBlock[] {
  return blocks.map((b) => (isUnsupported(b) ? (b.original as StoredBlock) : (b as unknown as StoredBlock)));
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
    const p = urlProblem(b);
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
