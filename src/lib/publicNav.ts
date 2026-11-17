import type { PublicModule } from "@/lib/types";

/** One published page in reading order, with the module it belongs to (page slugs are only unique within a module). */
export interface OutlinePage {
  moduleSlug: string;
  moduleTitle: string;
  pageSlug: string;
  title: string;
}

/** Sorted copy by `position`; ties keep their original (server) order. */
const byPosition = <T extends { position: number }>(xs: readonly T[]): T[] =>
  xs.map((x, i) => [x, i] as const).sort((a, b) => a[0].position - b[0].position || a[1] - b[1]).map(([x]) => x);

/** The modules with their pages in reading order. The server already sends this order; sorting again is only a guard. */
export function orderedModules(modules: readonly PublicModule[]): PublicModule[] {
  return byPosition(modules).map((m) => ({ ...m, pages: byPosition(m.pages) }));
}

/** Every published page in reading order (module by module). */
export function flattenOutline(modules: readonly PublicModule[]): OutlinePage[] {
  return orderedModules(modules).flatMap((m) => m.pages.map((p) => ({ moduleSlug: m.slug, moduleTitle: m.title, pageSlug: p.slug, title: p.title })));
}

/** The first page a reader should open, or null for an empty outline. */
export const firstPage = (modules: readonly PublicModule[]): OutlinePage | null => flattenOutline(modules)[0] ?? null;

/**
 * The pages before and after `moduleSlug`/`pageSlug` in reading order, crossing module boundaries. Both are null at the
 * ends, and both are null when the page isn't in the (published) outline, so navigation never points at a draft.
 */
export function prevNext(modules: readonly PublicModule[], moduleSlug: string, pageSlug: string): { prev: OutlinePage | null; next: OutlinePage | null } {
  const pages = flattenOutline(modules);
  const i = pages.findIndex((p) => p.moduleSlug === moduleSlug && p.pageSlug === pageSlug);
  if (i < 0) return { prev: null, next: null };
  return { prev: pages[i - 1] ?? null, next: pages[i + 1] ?? null };
}
