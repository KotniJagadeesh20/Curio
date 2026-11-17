import { isSafeUrl } from "@/lib/urlRules";

/** The site-relative prefix the public API uses for published media (`/api/public/media/{id}` and `/{id}/thumb`). */
const PUBLIC_MEDIA_PREFIX = "/api/public/media/";

/** `VITE_API_URL` as an origin: no trailing slash and no trailing `/api` (the media path already starts with `/api`). */
function normalizeBase(base: string | undefined): string {
  return (base ?? "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");
}

/**
 * The `src` for an image the public API returned (a cover or an image block), or null when it must not be shown.
 *
 * - Anything that fails the shared URL rule (`isSafeUrl`) is refused: the API is treated as untrusted input.
 * - Only public media paths are rewritten, and only when the API lives on another origin (`VITE_API_URL`): then
 *   `/api/public/media/x` becomes `https://api.example.com/api/public/media/x`. With no base it stays site-relative.
 * - Absolute https links (a legacy cover link) and other site paths are returned unchanged.
 *
 * Public rendering never uses the owner-only `/api/media/{id}/content` endpoint; this helper has no way to produce it.
 */
export function publicMediaSrc(url: string | null | undefined, base: string | undefined = import.meta.env.VITE_API_URL): string | null {
  if (!url || !isSafeUrl(url)) return null;
  if (!url.startsWith(PUBLIC_MEDIA_PREFIX)) return url;
  return `${normalizeBase(base)}${url}`;
}
