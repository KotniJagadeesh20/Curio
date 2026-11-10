import type { CollectionInput, ModuleInput, PageInput } from "@/lib/types";

/**
 * Form-level checks that mirror the creator API's bean validation (CollectionDtos.java) so an obviously wrong value
 * is reported next to its field instead of after a round trip. The server stays authoritative: it re-validates, and
 * rules that need state (slug taken, publish needs a published page, slug locked once published) only exist there.
 */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const LIMITS = { slug: 60, collectionTitle: 160, moduleTitle: 160, pageTitle: 200, description: 5000, summary: 2000, coverUrl: 500 } as const;

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

export const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, LIMITS.slug).replace(/-+$/, "");

const title = (value: string, max: number, errors: FieldErrors<{ title: string }>) => {
  if (!value.trim()) errors.title = "A title is required";
  else if (value.trim().length > max) errors.title = `Keep the title under ${max} characters`;
};

const slug = (value: string | undefined, errors: FieldErrors<{ slug: string }>) => {
  if (!value) return;
  if (value.length > LIMITS.slug) errors.slug = `At most ${LIMITS.slug} characters`;
  else if (!SLUG_PATTERN.test(value)) errors.slug = "Lowercase letters, numbers and single hyphens only (e.g. java-basics)";
};

/** Same rule as the server's UrlPolicy: absolute https URL with a host and no embedded credentials. */
function isHttpsUrl(v: string) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && u.hostname !== "" && u.username === "" && u.password === "";
  } catch {
    return false;
  }
}

export function validateCollection(v: CollectionInput): FieldErrors<CollectionInput> {
  const e: FieldErrors<CollectionInput> = {};
  title(v.title, LIMITS.collectionTitle, e);
  slug(v.slug, e);
  if ((v.description ?? "").length > LIMITS.description) e.description = `At most ${LIMITS.description} characters`;
  const cover = (v.coverUrl ?? "").trim();
  if (cover) {
    if (cover.length > LIMITS.coverUrl) e.coverUrl = `At most ${LIMITS.coverUrl} characters`;
    else if (!isHttpsUrl(cover)) e.coverUrl = "The cover must be an https:// link (or upload an image)";
  }
  return e;
}

export function validateModule(v: ModuleInput): FieldErrors<ModuleInput> {
  const e: FieldErrors<ModuleInput> = {};
  title(v.title, LIMITS.moduleTitle, e);
  slug(v.slug, e);
  return e;
}

export function validatePage(v: PageInput): FieldErrors<PageInput> {
  const e: FieldErrors<PageInput> = {};
  title(v.title, LIMITS.pageTitle, e);
  slug(v.slug, e);
  if ((v.summary ?? "").length > LIMITS.summary) e.summary = `At most ${LIMITS.summary} characters`;
  return e;
}

export const hasErrors = (e: object) => Object.keys(e).length > 0;

/**
 * Which cover fields to send. The server refuses a request that names BOTH `coverAssetId` and `coverUrl` (even `null`/`""`),
 * and supplying one clears the other, so exactly the changed one is sent:
 *  - an uploaded image different from the stored one -> `coverAssetId` only;
 *  - the stored uploaded image kept -> neither (omitted = unchanged);
 *  - no image and a link -> `coverUrl` only (this also replaces a stored image);
 *  - the stored image removed and no link -> `coverAssetId: null`;
 *  - nothing uploaded -> `coverUrl` as typed (`""` clears the old link).
 */
export function coverFields(
  initial: { coverAssetId: string | null },
  now: { coverUrl: string; coverAssetId: string | null },
): Pick<CollectionInput, "coverUrl" | "coverAssetId"> {
  const url = now.coverUrl.trim();
  if (now.coverAssetId) return now.coverAssetId === initial.coverAssetId ? {} : { coverAssetId: now.coverAssetId };
  if (url) return { coverUrl: url };
  if (initial.coverAssetId) return { coverAssetId: null };
  return { coverUrl: "" };
}
