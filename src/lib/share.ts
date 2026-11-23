// Sharing public links (Step 14d-2). Pure helpers, no React.
//
// Order: the native share sheet (navigator.share) → the clipboard → "unavailable" (the caller then shows a manual-copy
// fallback). Never throws: every browser API failure turns into one of the outcomes below.

/** The absolute URL of a public path. The path must come from `paths.*` (canonical: lower-case handle, API slugs, no query or hash), never from `location.href`. */
export const canonicalUrl = (path: string): string => `${window.location.origin}${path}`;

export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable";

const isAbort = (e: unknown) => e instanceof Error ? e.name === "AbortError" : (e as { name?: string } | null)?.name === "AbortError";

/** Copies `url` with the async clipboard API. true = copied; false = no clipboard or the browser refused. */
export async function copyToClipboard(url: string): Promise<boolean> {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * Shares a public link.
 * - Native share sheet when `navigator.share` exists (and `canShare` doesn't say no): "shared"; the reader closing the
 *   sheet (AbortError) is "cancelled", with no fallback; any other failure falls through to the clipboard.
 * - Clipboard: "copied", or "unavailable" when there is none or it is refused.
 */
export async function sharePublicLink({ title, url }: { title: string; url: string }): Promise<ShareOutcome> {
  const data: ShareData = { title, url };
  try {
    if (typeof navigator.share === "function" && navigator.canShare?.(data) !== false) {
      await navigator.share(data);
      return "shared";
    }
  } catch (e) {
    if (isAbort(e)) return "cancelled";
    // NotAllowedError, TypeError, …: fall back to the clipboard
  }
  return (await copyToClipboard(url)) ? "copied" : "unavailable";
}
