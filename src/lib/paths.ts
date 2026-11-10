/**
 * The one place that knows the shape of the creator-platform URLs, so no component builds them by hand.
 *
 * Browser URLs use "/@username/..." (React Router can't match "@:username" inside a segment, so the router matches
 * ":handle" and `parseHandle` checks the "@"; see AppRoutes).
 *
 * API paths for pages are ALWAYS module-qualified. Page slugs are only unique within a module, so the backend's
 * unqualified `/public/pages/{user}/{collection}/{page}` route (first match in reading order) is a compatibility
 * route and deliberately has no builder here.
 */

const enc = encodeURIComponent;

/**
 * Mirror of the FORMAT pattern in backend `UsernamePolicy` (3-30 chars, lowercase letters/digits/underscore, starts with
 * a letter). Routing/UX only: it decides "can this be a handle at all", so junk never turns into an API request.
 *
 * Reserved names are deliberately NOT checked here. They are blocked at signup, but the seeded admin is allowed one, so
 * a reserved-looking handle can be real. The backend decides (404 if there is no such creator). `UsernamePolicy`
 * drift is caught by src/lib/paths.test.ts, which reads the Java source.
 */
export const USERNAME_PATTERN = /^[a-z][a-z0-9_]{2,29}$/;

/** "@alice" -> "alice"; anything else (no "@", bad characters) -> null. Lowercases: usernames are case-insensitive. */
export function parseHandle(handle: string | undefined): string | null {
  if (!handle || !handle.startsWith("@")) return null;
  const name = handle.slice(1).toLowerCase();
  return USERNAME_PATTERN.test(name) ? name : null;
}

/** A route id must be a positive integer; anything else is a 404 rather than a request for "NaN". */
export function parseId(raw: string | undefined): number | null {
  return raw !== undefined && /^[1-9]\d{0,14}$/.test(raw) ? Number(raw) : null;
}

// ---- browser URLs ----
export const paths = {
  discover: () => "/discover",
  creatorProfile: (username: string) => `/@${enc(username)}`,
  collection: (username: string, collectionSlug: string) => `/@${enc(username)}/${enc(collectionSlug)}`,
  page: (username: string, collectionSlug: string, moduleSlug: string, pageSlug: string) =>
    `/@${enc(username)}/${enc(collectionSlug)}/${enc(moduleSlug)}/${enc(pageSlug)}`,
  workspace: () => "/create",
  editCollection: (id: number) => `/create/collections/${id}`,
  editPage: (id: number) => `/create/pages/${id}`,
  profileSettings: () => "/settings/profile",
};

// ---- API paths (relative to /api, as `api.get` expects) ----
export const apiPaths = {
  publicCollections: (params: { category?: string; q?: string; page?: number; size?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.q?.trim()) qs.set("q", params.q.trim());
    if (params.page !== undefined) qs.set("page", String(params.page));
    if (params.size !== undefined) qs.set("size", String(params.size));
    const s = qs.toString();
    return `/public/collections${s ? `?${s}` : ""}`;
  },
  publicCollection: (username: string, slug: string) => `/public/collections/${enc(username)}/${enc(slug)}`,
  publicPage: (username: string, collectionSlug: string, moduleSlug: string, pageSlug: string) =>
    `/public/pages/${enc(username)}/${enc(collectionSlug)}/${enc(moduleSlug)}/${enc(pageSlug)}`,
  categories: () => "/public/categories",
  myCollections: (deleted = false) => `/collections/mine${deleted ? "?deleted=true" : ""}`,
  collections: () => "/collections",
  collection: (id: number) => `/collections/${id}`,
  collectionAction: (id: number, action: "publish" | "unpublish" | "restore") => `/collections/${id}/${action}`,
  collectionModules: (id: number) => `/collections/${id}/modules`,
  module: (id: number) => `/modules/${id}`,
  moduleReorder: (id: number) => `/modules/${id}/reorder`,
  modulePages: (id: number) => `/modules/${id}/pages`,
  page: (id: number) => `/pages/${id}`,
  pageAction: (id: number, action: "publish" | "unpublish") => `/pages/${id}/${action}`,
  pageReorder: (id: number) => `/pages/${id}/reorder`,
};
