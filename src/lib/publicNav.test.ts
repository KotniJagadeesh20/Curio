import { describe, expect, it } from "vitest";
import type { PublicModule } from "./types";
import { firstPage, flattenOutline, orderedModules, prevNext } from "./publicNav";

const page = (slug: string, position: number) => ({ slug, title: slug.toUpperCase(), summary: "", position });
const mod = (slug: string, position: number, pages: ReturnType<typeof page>[]): PublicModule => ({ slug, title: `Module ${slug}`, position, pages });

const OUTLINE = [
  mod("basics", 0, [page("intro", 0), page("setup", 1)]),
  mod("advanced", 1, [page("intro", 0), page("tuning", 1)]),   // "intro" again: slugs are per module
];

describe("publicNav", () => {
  it("flattens modules into reading order, keeping each page's module", () => {
    expect(flattenOutline(OUTLINE).map((p) => `${p.moduleSlug}/${p.pageSlug}`)).toEqual(["basics/intro", "basics/setup", "advanced/intro", "advanced/tuning"]);
    expect(flattenOutline(OUTLINE)[2]).toEqual({ moduleSlug: "advanced", moduleTitle: "Module advanced", pageSlug: "intro", title: "INTRO" });
  });

  it("sorts defensively by position when the input is not in order, and keeps ties in their original order", () => {
    const shuffled = [mod("b", 5, [page("y", 2), page("x", 1)]), mod("a", 1, [page("t2", 0), page("t1", 0)])];
    expect(flattenOutline(shuffled).map((p) => p.pageSlug)).toEqual(["t2", "t1", "x", "y"]);
    expect(orderedModules(shuffled).map((m) => m.slug)).toEqual(["a", "b"]);
    expect(shuffled[0].pages[0].slug).toBe("y");   // the input is not mutated
  });

  it("firstPage is the first page in reading order, or null for an empty outline", () => {
    expect(firstPage(OUTLINE)).toMatchObject({ moduleSlug: "basics", pageSlug: "intro" });
    expect(firstPage([])).toBeNull();
    expect(firstPage([mod("empty", 0, [])])).toBeNull();
  });

  it("prevNext in the middle of a module", () => {
    const { prev, next } = prevNext(OUTLINE, "basics", "setup");
    expect(prev).toMatchObject({ moduleSlug: "basics", pageSlug: "intro" });
    expect(next).toMatchObject({ moduleSlug: "advanced", pageSlug: "intro" });   // crosses into the next module
  });

  it("prevNext crosses module boundaries backwards too, and tells same-slug pages apart", () => {
    const { prev, next } = prevNext(OUTLINE, "advanced", "intro");
    expect(prev).toMatchObject({ moduleSlug: "basics", pageSlug: "setup" });
    expect(next).toMatchObject({ moduleSlug: "advanced", pageSlug: "tuning" });
  });

  it("prevNext is null at the ends and for a single-page collection", () => {
    expect(prevNext(OUTLINE, "basics", "intro").prev).toBeNull();
    expect(prevNext(OUTLINE, "advanced", "tuning").next).toBeNull();
    expect(prevNext([mod("only", 0, [page("one", 0)])], "only", "one")).toEqual({ prev: null, next: null });
  });

  it("prevNext is null both ways for a page that isn't in the published outline (never points at a draft)", () => {
    expect(prevNext(OUTLINE, "basics", "draft-page")).toEqual({ prev: null, next: null });
    expect(prevNext(OUTLINE, "nope", "intro")).toEqual({ prev: null, next: null });
  });
});
