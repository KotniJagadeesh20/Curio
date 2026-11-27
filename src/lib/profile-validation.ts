import { isHttpsUrl } from "@/lib/creator-validation";
import type { UpdateProfileRequest } from "@/lib/types";

/**
 * Step 15c: form-level checks for /settings/profile that mirror the server (ProfileService.update, UrlPolicy), so an
 * obviously wrong value is reported next to its field. They are UX only: the server re-validates and stays authoritative,
 * and its 400 message is mapped back to a field by `serverErrorField`.
 *
 * Known gaps, left to the server: the WHATWG URL parser accepts a few URLs that Java's URI rejects (e.g. "https:///x",
 * spaces in the path). And `socialLinks` is a JS object, so integer-like labels ("2024") enumerate first: their order
 * is not guaranteed.
 */
export const PROFILE_LIMITS = { displayName: 120, bio: 500, url: 500, links: 10, label: 30 } as const;
/** The server's link-name rule (ProfileService.LINK_LABEL). */
export const LINK_LABEL = /^[a-z0-9_]{1,30}$/;

export interface ProfileLinkRow {
  /** Local, stable id for React keys and focus; never sent. */
  id: string;
  label: string;
  url: string;
}

export interface ProfileForm {
  displayName: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  links: ProfileLinkRow[];
  visibility: "PUBLIC" | "PRIVATE";
}

export type ProfileField = keyof UpdateProfileRequest;

export interface ProfileErrors {
  fields: Partial<Record<ProfileField, string>>;
  /** Per link row, by row id. */
  links: Record<string, { label?: string; url?: string }>;
}

export const hasProfileErrors = (e: ProfileErrors) =>
  Object.keys(e.fields).length > 0 || Object.keys(e.links).length > 0;

const isEmptyRow = (r: ProfileLinkRow) => !r.label.trim() && !r.url.trim();

function urlError(raw: string, what: string): string | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (v.length > PROFILE_LIMITS.url) return `At most ${PROFILE_LIMITS.url} characters`;
  if (!isHttpsUrl(v)) return `The ${what} must be an https:// link`;
  return undefined;
}

export function validateProfile(f: ProfileForm): ProfileErrors {
  const e: ProfileErrors = { fields: {}, links: {} };

  const name = f.displayName.trim();
  if (!name) e.fields.displayName = "A display name is required";
  else if (name.length > PROFILE_LIMITS.displayName) e.fields.displayName = `At most ${PROFILE_LIMITS.displayName} characters`;

  if (f.bio.trim().length > PROFILE_LIMITS.bio) e.fields.bio = `At most ${PROFILE_LIMITS.bio} characters`;

  const avatar = urlError(f.avatarUrl, "avatar");
  if (avatar) e.fields.avatarUrl = avatar;
  const banner = urlError(f.bannerUrl, "banner");
  if (banner) e.fields.bannerUrl = banner;

  const rows = f.links.filter((r) => !isEmptyRow(r));
  if (rows.length > PROFILE_LIMITS.links) e.fields.socialLinks = `At most ${PROFILE_LIMITS.links} links`;

  const seen = new Map<string, number>();
  for (const r of rows) {
    const label = r.label.trim();
    if (label) seen.set(label, (seen.get(label) ?? 0) + 1);
  }
  for (const r of rows) {
    const row: { label?: string; url?: string } = {};
    const label = r.label.trim();
    if (!label) row.label = "Give the link a name";
    else if (!LINK_LABEL.test(label)) row.label = "1-30 lowercase letters, digits or underscores";
    else if ((seen.get(label) ?? 0) > 1) row.label = "Each link needs a different name";
    if (!r.url.trim()) row.url = "Add the link's https:// address";
    else {
      const u = urlError(r.url, "link");
      if (u) row.url = u;
    }
    if (row.label || row.url) e.links[r.id] = row;
  }
  return e;
}

/** The complete PUT body: exactly the six editable keys (nothing else can be sent), trimmed, blank URLs as null. */
export function toUpdateRequest(f: ProfileForm): UpdateProfileRequest {
  const socialLinks: Record<string, string> = {};
  for (const r of f.links) {
    if (isEmptyRow(r)) continue;
    socialLinks[r.label.trim()] = r.url.trim();
  }
  return {
    displayName: f.displayName.trim(),
    bio: f.bio.trim(),
    avatarUrl: f.avatarUrl.trim() || null,
    bannerUrl: f.bannerUrl.trim() || null,
    socialLinks,
    visibility: f.visibility,
  };
}

/**
 * The server answers a 400 with `{ error: "<message>" }` and no field key. Known messages start with the field name
 * (ProfileService / UrlPolicy), so map them back; anything else returns null and is shown as a form-level alert.
 */
export function serverErrorField(message: string): { field: ProfileField; linkLabel?: string } | null {
  const link = /^socialLinks\.([a-z0-9_]{1,30}) /.exec(message);
  if (link) return { field: "socialLinks", linkLabel: link[1] };
  if (message.startsWith("At most 10 social links") || message.startsWith("Social link names ")) return { field: "socialLinks" };
  for (const field of ["displayName", "bio", "avatarUrl", "bannerUrl", "visibility"] as const) {
    if (message.startsWith(`${field} `)) return { field };
  }
  return null;
}
