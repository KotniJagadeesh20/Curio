import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import { bodyProblems, isUnsupported, readBlocksForEditing } from "@/lib/blocks";
import { isValidDoc, projectDoc, type InlineDoc } from "@/lib/richText";
import { err, installFakeApi, ok } from "@/test/fakeApi";
import {
  TEMPLATES, TemplateCreationError, createFromTemplate, initialCreationState, pageBlocks, parseTemplate, resolveCategoryId, stepsDone,
  totalSteps, type CollectionTemplate, type CreationState,
} from "./templates";

const root = process.cwd();
const javaFields = (() => {
  const src = readFileSync(resolve(root, "backend/src/main/java/com/codemastery/blocks/BlockRules.java"), "utf8");
  const out: Record<string, string[]> = {};
  for (const m of src.matchAll(/"(\w+)", Set\.of\(([^)]*)\)/g)) out[m[1]] = [...m[2].matchAll(/"(\w+)"/g)].map((x) => x[1]);
  return out;
})();
const seededCategorySlugs = [...readFileSync(resolve(root, "backend/src/main/resources/db/migration/V10__categories.sql"), "utf8")
  .matchAll(/VALUES \('([a-z-]+)'/g)].map((m) => m[1]);

describe("template loading", () => {
  it("loads every file in shared/templates, in order: the five approved templates with their categories", () => {
    expect(readdirSync(resolve(root, "shared/templates")).filter((f) => f.endsWith(".json"))).toHaveLength(TEMPLATES.length);
    expect(TEMPLATES.map((t) => [t.name, t.category])).toEqual([
      ["Blank", null],
      ["Programming Tutorial", "programming"],
      ["Travel Guide", "travel"],
      ["Recipe", "food"],
      ["Personal Experience", "personal-experience"],
    ]);
    expect(TEMPLATES[0].modules).toEqual([]);
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
  });

  it("every template category is a category the backend seeds (V10)", () => {
    for (const t of TEMPLATES) if (t.category) expect(seededCategorySlugs).toContain(t.category);
  });

  it("the Programming Tutorial and Travel Guide have the planned pages, in order", () => {
    const pages = (id: string) => TEMPLATES.find((t) => t.id === id)!.modules.flatMap((m) => m.pages.map((p) => p.title));
    expect(pages("programming-tutorial")).toEqual(["Introduction", "Prerequisites", "Concepts", "Examples", "Practical Implementation", "Summary"]);
    expect(pages("travel-guide")).toEqual(["Overview", "How to Reach", "Places to Visit", "Accommodation", "Food", "Travel Tips"]);
  });

  it("every template block is one the server accepts: known type, only its fields, no editor problems, exact rich-text projection", () => {
    for (const t of TEMPLATES) for (const m of t.modules) {
      expect(m.title.length).toBeLessThanOrEqual(160);
      for (const p of m.pages) {
        expect(p.title.length).toBeLessThanOrEqual(200);
        for (const b of p.blocks) {
          const type = String(b.type);
          expect(Object.keys(javaFields), `${t.id}/${p.title}`).toContain(type);
          for (const k of Object.keys(b)) if (k !== "type") expect(javaFields[type], `${t.id}/${p.title}: ${k}`).toContain(k);
          if (type === "text" && "doc" in b) {
            expect(isValidDoc(b.doc, true)).toBe(true);
            expect(b.text).toBe(projectDoc(b.doc as InlineDoc));
          }
        }
        const read = readBlocksForEditing(pageBlocks(p));
        expect(read.unreadable).toBe(0);
        expect(read.blocks.some(isUnsupported)).toBe(false);
        expect(bodyProblems(read.blocks)).toEqual({ fields: {}, body: null });
      }
    }
  });

  it("pageBlocks gives every block a fresh, unique id and otherwise keeps it exactly", () => {
    const p = TEMPLATES.find((t) => t.id === "recipe")!.modules[0].pages[0];
    const a = pageBlocks(p), b = pageBlocks(p);
    expect(a.map(({ id: _id, ...rest }) => rest)).toEqual(p.blocks);
    expect(new Set(a.map((x) => x.id)).size).toBe(a.length);
    expect(a.every((x) => typeof x.id === "string" && x.id !== "")).toBe(true);
    expect(a.map((x) => x.id)).not.toEqual(b.map((x) => x.id));
  });

  it("parseTemplate refuses malformed files", () => {
    const good = { id: "x", position: 1, name: "X", description: "", category: null, modules: [{ title: "M", pages: [{ title: "P", blocks: [] }] }] };
    expect(parseTemplate(good)).not.toBeNull();
    for (const bad of [null, [], { ...good, id: "" }, { ...good, name: 3 }, { ...good, category: "" }, { ...good, modules: {} },
      { ...good, modules: [{ title: "", pages: [] }] }, { ...good, modules: [{ title: "M", pages: [{ title: "P" }] }] },
      { ...good, modules: [{ title: "M", pages: [{ title: "P", blocks: ["text"] }] }] }]) {
      expect(parseTemplate(bad)).toBeNull();
    }
  });
});

describe("category resolution (through GET /api/public/categories)", () => {
  const recipe = TEMPLATES.find((t) => t.id === "recipe")!;
  it("finds the id by slug; none for Blank, an unknown slug, or categories not loaded", () => {
    const cats = [{ id: 7, slug: "food", name: "Food & Recipes", icon: "", position: 3 }, { id: 2, slug: "travel", name: "Travel", icon: "", position: 2 }];
    expect(resolveCategoryId(recipe, cats)).toBe(7);
    expect(resolveCategoryId(TEMPLATES[0], cats)).toBeNull();
    expect(resolveCategoryId(recipe, cats.slice(1))).toBeNull();
    expect(resolveCategoryId(recipe, undefined)).toBeNull();
  });
});

describe("createFromTemplate", () => {
  const t: CollectionTemplate = {
    id: "t", position: 9, name: "T", description: "", category: null,
    modules: [
      { title: "M1", pages: [{ title: "P1", blocks: [{ type: "text", text: "a" }] }, { title: "P2", blocks: [] }] },
      { title: "M2", pages: [{ title: "P3", blocks: [{ type: "divider" }] }] },
    ],
  };
  const summary = { id: 42, title: "Mine", slug: "mine" };
  let nextModule = 100, nextPage = 200;
  const routes = () => ({
    "POST /collections": () => ({ status: 201, body: summary }),
    "POST /collections/42/modules": () => ({ status: 201, body: { id: nextModule++ } }),
    "POST /modules/100/pages": () => ({ status: 201, body: { id: nextPage++ } }),
    "POST /modules/101/pages": () => ({ status: 201, body: { id: nextPage++ } }),
  });
  beforeEach(() => { tokenStore.set("tok"); nextModule = 100; nextPage = 200; });
  afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

  it("creates the collection, then each module and its pages, one request at a time and in order", async () => {
    const api = installFakeApi(routes());
    const progress: number[] = [];
    const s = await createFromTemplate(t, { title: "Mine" }, initialCreationState(t), (_s, p) => progress.push(p.done));
    expect(api.calls.map((c) => `${c.method} ${c.path} ${(c.body as { title: string }).title}`)).toEqual([
      "POST /collections Mine", "POST /collections/42/modules M1", "POST /modules/100/pages P1", "POST /modules/100/pages P2",
      "POST /collections/42/modules M2", "POST /modules/101/pages P3",
    ]);
    expect((api.calls[2].body as { blocks: { type: string; text: string; id: string }[] }).blocks).toEqual([{ type: "text", text: "a", id: expect.any(String) }]);
    expect(stepsDone(s)).toBe(totalSteps(t));
    expect(progress.at(-1)).toBe(6);
    expect(progress).toEqual([...progress].sort((a, b) => a - b));
  });

  it("a request is only sent after the previous one finished", async () => {
    let open = 0, maxOpen = 0;
    const slow = (body: unknown) => async () => { open++; maxOpen = Math.max(maxOpen, open); await new Promise((r) => setTimeout(r, 2)); open--; return { status: 201, body }; };
    installFakeApi({
      "POST /collections": slow(summary), "POST /collections/42/modules": slow({ id: 100 }),
      "POST /modules/100/pages": slow({ id: 1 }),
    });
    await createFromTemplate(t, { title: "Mine" }, initialCreationState(t), () => {});
    expect(maxOpen).toBe(1);
  });

  it("stops at the first failure, deletes nothing, and a retry creates only what is missing (never the collection again)", async () => {
    const api = installFakeApi({ ...routes(), "POST /modules/100/pages": (req) => ((req.body as { title: string }).title === "P2" ? err(500, "Server error") : { status: 201, body: { id: 1 } }) });
    let failure: TemplateCreationError | null = null;
    try { await createFromTemplate(t, { title: "Mine" }, initialCreationState(t), () => {}); } catch (e) { failure = e as TemplateCreationError; }
    expect(failure).toBeInstanceOf(TemplateCreationError);
    expect(failure!.step).toBe('Page "P2"');
    expect(failure!.message).toBe("Server error");
    const reached: CreationState = failure!.state;
    expect(reached).toEqual({ collection: summary, moduleIds: [100, null], pagesDone: [[true, false], [false]] });
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);

    api.set("POST /modules/100/pages", () => ({ status: 201, body: { id: 2 } }));
    const before = api.calls.length;
    const done = await createFromTemplate(t, { title: "Mine" }, reached, () => {});
    expect(api.calls.slice(before).map((c) => `${c.method} ${c.path} ${(c.body as { title: string }).title}`)).toEqual([
      "POST /modules/100/pages P2", "POST /collections/42/modules M2", "POST /modules/101/pages P3",
    ]);
    expect(api.sent("POST", "/collections")).toHaveLength(1);
    expect(stepsDone(done)).toBe(totalSteps(t));
  });

  it("a refused collection leaves nothing created (state stays empty)", async () => {
    installFakeApi({ "POST /collections": () => err(409, "Slug already in use") });
    const failure = await createFromTemplate(t, { title: "Mine" }, initialCreationState(t), () => {}).then(() => { throw new Error("expected a failure"); }, (e: TemplateCreationError) => e);
    expect(failure.state.collection).toBeNull();
    expect(stepsDone(failure.state)).toBe(0);
  });
});
