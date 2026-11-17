import { useEffect } from "react";

/** Marks the one robots tag this hook manages; any other robots meta tag on the page is never touched. */
export const NOINDEX_ATTR = "data-curio-noindex";

// How many mounted consumers currently ask for noindex. The tag exists exactly while this is above zero.
let active = 0;

function acquire() {
  active += 1;
  if (active === 1 && !document.head.querySelector(`meta[${NOINDEX_ATTR}]`)) {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    meta.setAttribute(NOINDEX_ATTR, "");
    document.head.appendChild(meta);
  }
}

function release() {
  active = Math.max(0, active - 1);
  if (active === 0) document.head.querySelectorAll(`meta[${NOINDEX_ATTR}]`).forEach((m) => m.remove());
}

/**
 * While `enabled` is true, asks search engines not to index this page (`<meta name="robots" content="noindex">`), for
 * unlisted content. Several components may ask at once: one tag is kept while at least one of them is active, and it is
 * removed when the last one turns off or unmounts. Best effort only: crawlers that don't run JavaScript never see it.
 */
export function useNoIndex(enabled: boolean | null | undefined) {
  useEffect(() => {
    if (!enabled) return;
    acquire();
    return release;
  }, [enabled]);
}
