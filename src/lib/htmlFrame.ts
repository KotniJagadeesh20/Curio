// The ONLY way an HTML block is shown: inside a sandboxed iframe whose document we build ourselves.
// The `html` field in the API is author markup (marked "isolatedOnly"): it must never be inserted into a normal DOM.
//
//  - iframe: sandbox="" (every restriction on: no scripts, no same-origin, no forms, no popups, no top navigation),
//    referrerpolicy="no-referrer".
//  - document: a FIXED head (our CSP first), the creator's markup only inside <body>. A creator can't put anything before our
//    CSP meta, and a second policy they add can only tighten, never loosen (policies intersect).
//  - CSP: no scripts, no network of any kind, no frames/objects/forms/base; inline CSS and data: images only.

export const HTML_FRAME_SANDBOX = "";   // deliberately empty: no allow-scripts, no allow-same-origin, nothing

export const HTML_FRAME_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "media-src 'none'",
  "font-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
].join("; ");

export const HTML_FRAME_MIN_HEIGHT = 100;
export const HTML_FRAME_MAX_HEIGHT = 2000;
export const HTML_FRAME_DEFAULT_HEIGHT = 360;

export function htmlFrameHeight(h: unknown): number {
  const n = typeof h === "number" && Number.isFinite(h) ? Math.round(h) : HTML_FRAME_DEFAULT_HEIGHT;
  return Math.min(HTML_FRAME_MAX_HEIGHT, Math.max(HTML_FRAME_MIN_HEIGHT, n || HTML_FRAME_DEFAULT_HEIGHT));
}

/** The complete srcdoc for an HTML block. */
export function htmlFrameDocument(html: string): string {
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${HTML_FRAME_CSP}">`
    + `<meta charset="utf-8"><meta name="referrer" content="no-referrer"><base target="_blank">`
    + `<style>body{margin:8px;font-family:system-ui,sans-serif}</style></head><body>${html}</body></html>`;
}
