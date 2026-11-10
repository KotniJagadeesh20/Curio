// The one URL rule for image/video links. Mirrors backend UrlRules.java; both are tested against shared/url-vectors.json.
// Accepted: an absolute https URL with a real DNS host (no credentials, IP literal or localhost), or a site-relative path
// that browsers cannot turn into another host. Everything else is refused. The server is authoritative; this is the same
// rule applied in the editor (feedback) and in the renderer (never trust what the API returned).

export const MAX_URL_LENGTH = 2048;
export const URL_MESSAGE = "Use an https:// link (or a /path on this site).";

const HOST = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i;
const AUTHORITY = /^([^:/]+)(?::(\d{1,5}))?$/;
/** "/x" but never "//x" or "/\x" (browsers read "\" as "/"), and no encoded separator right after the first slash. */
const RELATIVE = /^\/(?![/\\])(?!%2f|%5c)[^\\]*$/i;

export const isBlankUrl = (url: string | null | undefined) => !url || !url.trim();

/** null when acceptable (a blank link is fine in a draft), otherwise the message to show. */
export function urlProblem(url: string | null | undefined): string | null {
  if (isBlankUrl(url)) return null;
  const u = url as string;
  if (u.length > MAX_URL_LENGTH) return "This link is too long.";
  for (let i = 0; i < u.length; i++) {
    const c = u.charCodeAt(i);
    if (c <= 0x20 || c >= 0x7f) return URL_MESSAGE;            // spaces, control characters, non-ASCII (percent-encode those)
  }
  if (u[0] === "/") return RELATIVE.test(u) ? null : URL_MESSAGE;
  if (!/^https:\/\//i.test(u) || u.includes("\\")) return URL_MESSAGE;
  const rest = u.slice(8);
  const authority = rest.split(/[/?#]/, 1)[0];
  if (authority.includes("@")) return URL_MESSAGE;
  const m = AUTHORITY.exec(authority);
  if (!m || !HOST.test(m[1])) return URL_MESSAGE;
  if (m[2] !== undefined && Number(m[2]) > 65535) return URL_MESSAGE;
  try { new URL(u); } catch { return URL_MESSAGE; }
  return null;
}

/** Safe to put in an img/video src: non-blank and passes the rule. */
export const isSafeUrl = (url: string | null | undefined): boolean => !isBlankUrl(url) && urlProblem(url) === null;

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;

/**
 * YouTube / Vimeo page URL -> the embeddable URL, built from the validated id (the input is never echoed).
 * Exact hosts only; null for anything else (then it is a direct https video file).
 */
export function embedUrl(url: string): string | null {
  if (!isSafeUrl(url) || url[0] === "/") return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  const yt = (id: string | null | undefined) => (id && YT_ID.test(id) ? `https://www.youtube.com/embed/${id}` : null);
  if (host === "youtu.be") return yt(/^\/([^/]+)$/.exec(u.pathname)?.[1]);
  if (host === "youtube.com" || host === "www.youtube.com") {
    const e = /^\/embed\/([^/]+)$/.exec(u.pathname);
    if (e) return yt(e[1]);
    return u.pathname === "/watch" ? yt(u.searchParams.get("v")) : null;
  }
  if (host === "vimeo.com") { const m = /^\/(\d{3,12})$/.exec(u.pathname); return m ? `https://player.vimeo.com/video/${m[1]}` : null; }
  if (host === "player.vimeo.com") { const m = /^\/video\/(\d{3,12})$/.exec(u.pathname); return m ? `https://player.vimeo.com/video/${m[1]}` : null; }
  return null;
}
