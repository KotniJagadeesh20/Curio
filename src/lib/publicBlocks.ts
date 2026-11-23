// Public-only block validation (Step 14c). Runs on what the PUBLIC page API returned, right before rendering it.
//
// The server already sanitizes blocks, but the reader never trusts the API: every field the renderer reads is checked
// for its runtime type (and fixed-value fields for their allowed values). A block that fails is dropped on its own; the
// valid blocks around it are kept. The input is never mutated, and nothing here is used by the editor:
// `normalizeBlocks`, the editing model and stored content are untouched.
import { isValidDoc } from "@/lib/richText";
import { isWellFormedTable, type Block, type CalloutVariant } from "@/lib/blocks";
import { publicMediaSrc } from "@/lib/mediaUrl";
import { isSafeUrl } from "@/lib/urlRules";
import type { PublicLegacyContent } from "@/lib/types";

// ---------------------------------------------------------------------------------------------------------------------
// Image URLs
// ---------------------------------------------------------------------------------------------------------------------

/** The exact shape of a published-media path the backend produces (`MediaUrlResolver.publicUrl` / `publicThumbUrl`). */
const PUBLIC_MEDIA_PATH = /^\/api\/public\/media\/[A-Za-z0-9_-]+(\/thumb)?$/;

/** `https://host[:port]` of an absolute URL, lowercased; null when it isn't one. */
function originOf(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.origin.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** This app's own origins: where the page is served and where the API lives (`VITE_API_URL`, when it is absolute). */
export function ownOrigins(apiBase: string | undefined = import.meta.env.VITE_API_URL): string[] {
  const out = new Set<string>();
  const app = typeof window !== "undefined" ? originOf(window.location.origin) : null;
  const api = originOf(apiBase);
  if (app) out.add(app);
  if (api) out.add(api);
  return [...out];
}

/**
 * May the public reader put this URL in an `<img src>`? Allow-list only:
 *
 * - a site-relative published-media path that matches `/api/public/media/{id}` or `/{id}/thumb` EXACTLY (no query,
 *   fragment, `..`, percent-encoding, backslash, double slash or different case: anything else is not that path);
 * - an absolute https URL that passes the shared URL rule (`isSafeUrl`) and points at another site. On this app's own
 *   origins (the page's or the API's) it must be the same exact published-media path, compared on the raw text after the
 *   host, before any URL normalization, so `%61pi`, `foo/../api` or `api%2Fmedia` spellings can't reach `/api/media`.
 *
 * Everything else is refused, notably the owner-only `/api/media/{id}/content` and any other site path.
 */
export function isPublicImageUrl(url: unknown, origins: readonly string[] = ownOrigins()): url is string {
  if (typeof url !== "string" || !isSafeUrl(url)) return false;
  if (url[0] === "/") return PUBLIC_MEDIA_PATH.test(url);
  const origin = originOf(url);                                // isSafeUrl has already required "https://" (any case)
  if (!origin) return false;
  if (!origins.includes(origin)) return true;
  const afterHost = url.slice("https://".length).replace(/^[^/?#]*/, "");
  return PUBLIC_MEDIA_PATH.test(afterHost);
}

/** The `src` for a public image block, or null when it must not be rendered. Public media keeps the API-base prefix. */
export function publicImageSrc(url: unknown, apiBase: string | undefined = import.meta.env.VITE_API_URL): string | null {
  return isPublicImageUrl(url, ownOrigins(apiBase)) ? publicMediaSrc(url, apiBase) : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------------------------------------------------

/** An image block as the public API sends it: `width`/`height` are added by the server's media resolver. */
export type PublicImageBlock = Extract<Block, { type: "image" }> & { width?: number; height?: number };

const HEADING_LEVELS = [2, 3] as const;
const CALLOUT_VARIANTS: readonly CalloutVariant[] = ["info", "tip", "warning"];

type Raw = Record<string, unknown>;
const isObject = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const isString = (v: unknown): v is string => typeof v === "string";
const isPositiveFinite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;

/** An optional string: missing → `fallback`; present but not a string → undefined (the block is dropped). */
function optString(b: Raw, key: string, fallback = ""): string | undefined {
  if (!(key in b) || b[key] === undefined) return fallback;
  return isString(b[key]) ? b[key] : undefined;
}

/** One raw block → a safe block, or null to drop it. `id` is assigned by position (render key only). */
function sanitizeOne(b: unknown, id: string, origins: readonly string[]): Block | null {
  if (!isObject(b)) return null;
  switch (b.type) {
    case "heading": {
      if (!isString(b.text)) return null;
      const level = HEADING_LEVELS.includes(b.level as 2 | 3) ? (b.level as 2 | 3) : 2;   // only the numbers 2 and 3
      return { id, type: "heading", level, text: b.text };
    }
    case "text": {
      if (!isString(b.text)) return null;
      // an invalid doc is ignored, so the renderer shows the plain-text projection (its existing rule)
      return b.doc !== undefined && isValidDoc(b.doc) ? { id, type: "text", text: b.text, doc: b.doc } : { id, type: "text", text: b.text };
    }
    case "code": {
      const language = optString(b, "language"), caption = optString(b, "caption");
      if (!isString(b.code) || language === undefined || caption === undefined) return null;
      return { id, type: "code", code: b.code, language, caption };
    }
    case "image": {
      const caption = optString(b, "caption");
      // url is required and must be a public image URL; an assetId-only block (owner media) is dropped
      if (!isPublicImageUrl(b.url, origins) || caption === undefined) return null;
      const out: PublicImageBlock = { id, type: "image", url: b.url, caption };
      if (isPositiveFinite(b.width) && isPositiveFinite(b.height)) { out.width = b.width; out.height = b.height; }
      return out;
    }
    case "video": {
      const caption = optString(b, "caption");
      if (!isString(b.url) || caption === undefined) return null;
      return { id, type: "video", url: b.url, caption };
    }
    case "html": {
      if (!isString(b.html)) return null;
      if (b.height !== undefined && !(typeof b.height === "number" && Number.isFinite(b.height))) return null;
      return { id, type: "html", html: b.html, height: b.height as number };   // undefined → the renderer's default height
    }
    case "svg": {
      const caption = optString(b, "caption");
      if (!isString(b.svg) || caption === undefined) return null;
      return { id, type: "svg", svg: b.svg, caption };
    }
    case "callout": {
      if (!isString(b.text)) return null;
      const variant = CALLOUT_VARIANTS.includes(b.variant as CalloutVariant) ? (b.variant as CalloutVariant) : "info";
      return { id, type: "callout", variant, text: b.text };
    }
    case "table": {
      if (!isWellFormedTable(b)) return null;   // also checks hasHeader/caption types when present
      return { id, type: "table", hasHeader: b.hasHeader === true, caption: (b.caption as string | undefined) ?? "", rows: (b.rows as string[][]).map((r) => [...r]) };
    }
    case "divider":
      return { id, type: "divider" };
    default:
      return null;   // unknown type
  }
}

/** Public page blocks → only the blocks that are safe to render, each a fresh object. Never throws. */
export function sanitizePublicBlocks(raw: unknown, origins: readonly string[] = ownOrigins()): Block[] {
  if (!Array.isArray(raw)) return [];
  const out: Block[] = [];
  raw.forEach((b, i) => {
    const safe = sanitizeOne(b, `b${i}`, origins);
    if (safe) out.push(safe);
  });
  return out;
}

/** Legacy page fields with the types `legacyToBlocks` relies on; a wrong-typed field is treated as empty. */
export function sanitizeLegacy(raw: unknown): PublicLegacyContent {
  const l = isObject(raw) ? raw : {};
  const str = (v: unknown) => (isString(v) ? v : "");
  const strOrNull = (v: unknown) => (isString(v) ? v : null);
  const list = (v: unknown) => (Array.isArray(v) ? v.filter(isString) : []);
  return {
    concept: str(l.concept), realWorld: str(l.realWorld), interviewRelevance: str(l.interviewRelevance),
    commonMistakes: list(l.commonMistakes), bestPractices: list(l.bestPractices),
    codeLanguage: strOrNull(l.codeLanguage), codeExample: strOrNull(l.codeExample),
  };
}
