// Content anchors for visual scroll restoration (Step 14d-3). Pure DOM helpers: no state, no scrolling.
//
// Views mark stable content units with `data-scroll-anchor="<id>"` (blocks, outline entries, cards, …). The anchor of
// a position is the FIRST marked element (document order) whose bottom edge is below the viewport top, with its
// viewport offset `rect.top`. Restoring = scrolling so that element is at the same offset again.

export const ANCHOR_ATTR = "data-scroll-anchor";

const anchors = (container: ParentNode): HTMLElement[] => Array.from(container.querySelectorAll<HTMLElement>(`[${ANCHOR_ATTR}]`));

/** The anchor for the current viewport inside `container`, or null when it has none. */
export function pickAnchor(container: ParentNode | null | undefined): { id: string; offset: number; el: HTMLElement } | null {
  if (!container) return null;
  for (const el of anchors(container)) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0) return { id: el.getAttribute(ANCHOR_ATTR) ?? "", offset: r.top, el };
  }
  return null;
}

/** The element with this anchor id inside `container` (compared as a string: no selector escaping needed). */
export function findAnchor(container: ParentNode | null | undefined, id: string): HTMLElement | null {
  if (!container) return null;
  return anchors(container).find((el) => el.getAttribute(ANCHOR_ATTR) === id) ?? null;
}

/** How far the anchor is from its saved viewport offset: the scroll correction that puts it back. */
export const residual = (el: Element, savedOffset: number): number => el.getBoundingClientRect().top - savedOffset;

// ---- the window's scroll position ----------------------------------------------------------------------------------
// `html { scroll-behavior: smooth }` (index.css) would animate plain scrollTop assignments or window.scrollTo(x, y);
// restoration must be instant, so the scrolling element's scrollTo({ behavior: "instant" }) is used. Where that isn't
// available (jsdom has no scrollingElement), scrollTop is set directly.

const scroller = (): Element => document.scrollingElement ?? document.documentElement;

export const getScrollY = (): number => scroller().scrollTop;

export function setScrollY(y: number): void {
  const el = scroller() as Element & { scrollTo?: (o: ScrollToOptions) => void };
  const top = Math.max(0, y);
  if (document.scrollingElement && typeof el.scrollTo === "function") el.scrollTo({ top, behavior: "instant" as ScrollBehavior });
  else el.scrollTop = top;
}

export const scrollByY = (dy: number): void => setScrollY(getScrollY() + dy);
