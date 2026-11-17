// Collection templates (Step 13d). A template is plain data in shared/templates/*.json: a name, an optional category slug and
// modules -> pages -> blocks. "Using" one only calls the normal create APIs (collection, then each module, then each page), so a
// collection made from a template is an ordinary draft that opens in the one editor and renders with the one renderer.
import { api } from "@/lib/api";
import { apiPaths } from "@/lib/paths";
import { readBlocksForEditing, serializeBlocks } from "@/lib/blocks";
import type { Category, CollectionInput, CollectionSummary, CreatorModule, CreatorPage, StoredBlock } from "@/lib/types";

export interface TemplatePage { title: string; blocks: StoredBlock[] }
export interface TemplateModule { title: string; pages: TemplatePage[] }
export interface CollectionTemplate {
  id: string;
  position: number;
  name: string;
  description: string;
  /** A category slug resolved through GET /api/public/categories, or null. */
  category: string | null;
  modules: TemplateModule[];
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** A template file -> a template, or null when its shape is wrong (it is then left out of the picker). */
export function parseTemplate(raw: unknown): CollectionTemplate | null {
  if (!isObject(raw) || !isText(raw.id) || !isText(raw.name) || typeof raw.description !== "string" || typeof raw.position !== "number") return null;
  if (raw.category !== null && !isText(raw.category)) return null;
  if (!Array.isArray(raw.modules)) return null;
  const modules: TemplateModule[] = [];
  for (const m of raw.modules) {
    if (!isObject(m) || !isText(m.title) || !Array.isArray(m.pages)) return null;
    const pages: TemplatePage[] = [];
    for (const p of m.pages) {
      if (!isObject(p) || !isText(p.title) || !Array.isArray(p.blocks) || !p.blocks.every(isObject)) return null;
      pages.push({ title: p.title, blocks: p.blocks as StoredBlock[] });
    }
    modules.push({ title: m.title, pages });
  }
  return { id: raw.id, position: raw.position, name: raw.name, description: raw.description, category: raw.category as string | null, modules };
}

const files = import.meta.glob("../../shared/templates/*.json", { eager: true, import: "default" });

/** Every valid template, in `position` order. Blank (no modules) is first. */
export const TEMPLATES: CollectionTemplate[] = Object.values(files)
  .map(parseTemplate)
  .filter((t): t is CollectionTemplate => t !== null)
  .sort((a, b) => a.position - b.position);

export const BLANK_TEMPLATE_ID = "blank";
export const isBlank = (t: CollectionTemplate) => t.modules.length === 0;

/** The category id for a template's slug from the public categories list; null when it has none or the server doesn't know it. */
export function resolveCategoryId(t: CollectionTemplate, categories: Category[] | undefined): number | null {
  if (!t.category) return null;
  return categories?.find((c) => c.slug === t.category)?.id ?? null;
}

/** A template page's blocks as the editor would save them: every block gets a fresh unique id. */
export function pageBlocks(p: TemplatePage): StoredBlock[] {
  return serializeBlocks(readBlocksForEditing(p.blocks.map(({ id: _id, ...rest }) => rest)).blocks);
}

export const pageCount = (t: CollectionTemplate) => t.modules.reduce((n, m) => n + m.pages.length, 0);

// ---------------------------------------------------------------------------------------------- sequential creation
/**
 * What has been created so far. Kept by the caller between attempts: a retry skips everything already done, so the collection
 * (and any module or page already created) is never created twice, and nothing partially created is ever deleted.
 */
export interface CreationState {
  collection: CollectionSummary | null;
  moduleIds: (number | null)[];
  /** pagesDone[m][p] */
  pagesDone: boolean[][];
}

export const initialCreationState = (t: CollectionTemplate): CreationState => ({
  collection: null,
  moduleIds: t.modules.map(() => null),
  pagesDone: t.modules.map((m) => m.pages.map(() => false)),
});

export interface CreationProgress { done: number; total: number; current: string }

/** Requests in total: the collection, every module, every page. */
export const totalSteps = (t: CollectionTemplate) => 1 + t.modules.length + pageCount(t);

export const stepsDone = (s: CreationState) =>
  (s.collection ? 1 : 0) + s.moduleIds.filter((id) => id !== null).length + s.pagesDone.flat().filter(Boolean).length;

export class TemplateCreationError extends Error {
  constructor(readonly state: CreationState, readonly step: string, readonly cause: unknown) {
    super(cause instanceof Error ? cause.message : "Request failed");
  }
}

/**
 * Creates (or finishes creating) a collection from a template, one request at a time and in order. `state` is not mutated; each
 * success produces a new state passed to `onState`. On the first failure it stops and throws a TemplateCreationError carrying the
 * state reached, which is what a retry is started from.
 */
export async function createFromTemplate(
  t: CollectionTemplate, input: CollectionInput, start: CreationState,
  onState: (s: CreationState, p: CreationProgress) => void,
): Promise<CreationState> {
  let s = start;
  const total = totalSteps(t);
  const step = async <T>(label: string, run: () => Promise<T>, apply: (r: T) => CreationState) => {
    onState(s, { done: stepsDone(s), total, current: label });
    try { s = apply(await run()); }
    catch (e) { throw new TemplateCreationError(s, label, e); }
    onState(s, { done: stepsDone(s), total, current: label });
  };

  if (!s.collection) {
    await step(`Collection "${input.title}"`, () => api.post<CollectionSummary>(apiPaths.collections(), input), (c) => ({ ...s, collection: c }));
  }
  const collectionId = s.collection!.id;
  for (let mi = 0; mi < t.modules.length; mi++) {
    const m = t.modules[mi];
    if (s.moduleIds[mi] === null) {
      await step(`Module "${m.title}"`, () => api.post<CreatorModule>(apiPaths.collectionModules(collectionId), { title: m.title }),
        (r) => ({ ...s, moduleIds: s.moduleIds.map((id, i) => (i === mi ? r.id : id)) }));
    }
    const moduleId = s.moduleIds[mi]!;
    for (let pi = 0; pi < m.pages.length; pi++) {
      if (s.pagesDone[mi][pi]) continue;
      const p = m.pages[pi];
      await step(`Page "${p.title}"`, () => api.post<CreatorPage>(apiPaths.modulePages(moduleId), { title: p.title, blocks: pageBlocks(p) }),
        () => ({ ...s, pagesDone: s.pagesDone.map((row, i) => (i === mi ? row.map((d, j) => d || j === pi) : row)) }));
    }
  }
  return s;
}
