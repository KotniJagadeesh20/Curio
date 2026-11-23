import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { useLocation, useNavigationType } from "react-router-dom";
import { findAnchor, getScrollY, pickAnchor, residual, scrollByY, setScrollY } from "@/lib/scrollAnchor";
import { nextSeq, readEntry, writeEntry, type ScrollSample } from "@/lib/scrollStore";

/**
 * Arrival, scroll restoration and focus for the PUBLIC views only (Discover, collection, page). Step 14d-3, approved plan
 * rev. 4.3 + implementation brief rev. 2. Nothing outside these views changes (no app-wide scroll behavior).
 *
 * - **Arrival** = the view mounts, or its `arrivalKey` (built from route path params only) changes. Query-only URL
 *   changes and new history entries for the same URL are not arrivals (R1, O2, O3).
 * - Each arrival waits for the view's CURRENT-visit `state` to become terminal (`content | not-found | error`), then acts
 *   once (S3): PUSH/REPLACE → top + focus (heading, or the error region); POP → restore (content) or top (404/error),
 *   never moving focus. A user Retry after an error transfers focus once the retried request settles, without scrolling.
 * - **Positions** are kept per history entry (`<location.key>|<pathname><search>`, O1) in `scrollStore`, sampled only
 *   while tracking is armed (T3), always under the entry id captured with the sample (S1/T1).
 * - **Restoration** puts the saved content anchor back at its saved viewport offset and keeps correcting layout shifts
 *   until things settle (S2/T2). Two separate ResizeObservers: the restoration observer only corrects, the armed tracking
 *   observer only samples (T4).
 */

export type ArrivalState = "pending" | "content" | "not-found" | "error";
type Phase = "ARRIVING" | "ERROR" | "RECOVERING" | "DONE";
type Nav = "PUSH" | "REPLACE" | "POP";
interface Arrival { gen: number; nav: Nav; target: ScrollSample | undefined; phase: Phase }

export const SETTLE_STABLE_MS = 500;
export const SETTLE_MAX_MS = 5000;
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"]);
const INTENT_KEYS = new Set(["Enter", " ", "Spacebar"]);

interface Refs {
  contentRef: RefObject<HTMLElement>;
  headingRef: RefObject<HTMLElement>;
  errorRef: RefObject<HTMLElement>;
}

/** All mutable state of one mounted view, created once. Methods only read refs, so effects can depend on nothing. */
function createEngine({ contentRef, headingRef, errorRef }: Refs) {
  let entry: string | null = null;                       // the history entry being tracked
  let arrivalKey: string | null = null;
  let arrival: Arrival | null = null;
  let gen = 0;
  let armed = false;
  let sample: (ScrollSample & { entry: string }) | null = null;
  let sampleEl: HTMLElement | null = null;
  let frame: number | null = null;
  let ignoreY: number | null = null;                     // the position our own scroll will report once, after arming
  let tracking: ResizeObserver | null = null;            // T4: the armed tracking observer (samples, never scrolls)
  let trackedParent: Element | null = null;
  let stopSettling: (() => void) | null = null;          // cancels the restoration observer & listeners without arming

  // ---------------------------------------------------------------- sampling (S1/T1), only while armed
  const write = () => { if (sample) writeEntry(sample.entry, sample); };   // always under the CAPTURED entry id

  const retarget = (parent: Element | null) => {
    if (!tracking || parent === trackedParent) return;
    if (trackedParent && trackedParent !== contentRef.current) tracking.unobserve(trackedParent);
    if (parent && parent !== contentRef.current) tracking.observe(parent);
    trackedParent = parent;
  };

  const takeSample = () => {
    if (!armed || entry === null) return;
    const a = pickAnchor(contentRef.current);
    sample = { entry, y: getScrollY(), anchor: a ? { id: a.id, offset: a.offset } : null, seq: nextSeq() };
    sampleEl = a?.el ?? null;
    retarget(a?.el.parentElement ?? null);
    if (frame === null) frame = requestAnimationFrame(() => { frame = null; write(); });
  };

  /** Writes the latest sample now. `refreshAnchor` re-measures the anchor while the outgoing DOM is still attached. */
  const flush = (refreshAnchor: boolean) => {
    if (frame !== null) { cancelAnimationFrame(frame); frame = null; }
    if (!sample) return;
    if (refreshAnchor && sample.anchor && sampleEl?.isConnected) {
      sample = { ...sample, anchor: { id: sample.anchor.id, offset: sampleEl.getBoundingClientRect().top }, seq: nextSeq() };
    }
    write();
    sample = null;
    sampleEl = null;
  };

  // ---------------------------------------------------------------- arming (T3) and the tracking observer (T4)
  const arm = () => {
    if (armed) return;
    armed = true;
    let initial = true;                                   // a ResizeObserver reports once on observe(): not a layout change
    tracking = new ResizeObserver(() => { if (initial) { initial = false; return; } takeSample(); });
    if (contentRef.current) tracking.observe(contentRef.current);
    trackedParent = null;
  };
  const disarm = () => {
    armed = false;
    tracking?.disconnect();
    tracking = null;
    trackedParent = null;
  };
  /** Arms one animation frame later (if this arrival is still current). `programmaticY`: our own scroll's position, ignored once. */
  const armAfterFrame = (g: number, programmaticY: number | null) => {
    ignoreY = programmaticY;
    requestAnimationFrame(() => { if (arrival?.gen === g) arm(); });
  };

  // ---------------------------------------------------------------- restoration (S2/T2) with the restoration observer (T4)
  /** A source is declared: a `src` attribute (even empty: that ends in an error), `<source>` children, or a `srcObject`. */
  const declaresSource = (v: HTMLVideoElement) =>
    v.hasAttribute("src") || v.querySelector("source") !== null || v.srcObject != null;
  /** Its final size is known: metadata loaded, or it failed / has no usable source (then it keeps its default size).
   *  Neither network state alone proves "no source": NETWORK_EMPTY is also the state before resource selection starts,
   *  and resource selection reports NETWORK_NO_SOURCE before it has tried anything (Chrome, per the HTML spec). So:
   *  NETWORK_EMPTY counts only without any declared source; NETWORK_NO_SOURCE only once a candidate has been tried
   *  (`currentSrc` is set; the load algorithm resets it to "") — i.e. every candidate failed. A `src` failure also sets
   *  `error`. Anything else waits for its metadata or the 5 s cap. */
  const videoReady = (v: HTMLVideoElement) =>
    v.readyState >= HTMLMediaElement.HAVE_METADATA || v.error !== null
    || (v.networkState === HTMLMediaElement.NETWORK_NO_SOURCE && v.currentSrc !== "")
    || (v.networkState === HTMLMediaElement.NETWORK_EMPTY && !declaresSource(v));
  /** Media strictly BEFORE the anchor (document order) are the only ones that can still move it: images until complete,
   *  native videos until their metadata (dimensions) is known. Iframes reserve their box (see the correction report). */
  const mediaBeforeReady = (content: HTMLElement | null, anchor: HTMLElement) => {
    if (!content) return true;
    const before = (el: Element) => (anchor.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_PRECEDING) !== 0;
    return Array.from(content.querySelectorAll("img")).every((img) => img.complete || !before(img))
      && Array.from(content.querySelectorAll("video")).every((v) => videoReady(v) || !before(v));
  };

  const settle = (g: number, anchorEl: HTMLElement, id: string, offset: number) => {
    const content = contentRef.current;
    const root = document.documentElement;
    const prevAnchoring = root.style.overflowAnchor;
    root.style.overflowAnchor = "none";                  // our correction is the only one while settling (no double-correct)
    let el = anchorEl;
    let expected = getScrollY();
    const started = performance.now();
    let lastMove = started;
    let done = false;

    const correct = () => {
      if (done) return;
      if (!el.isConnected) { const again = findAnchor(contentRef.current, id); if (!again) return; el = again; }
      const d = residual(el, offset);
      if (Math.abs(d) >= 1) { scrollByY(d); expected = getScrollY(); lastMove = performance.now(); }
    };
    const restoration = new ResizeObserver(correct);
    if (content) restoration.observe(content);
    if (el.parentElement && el.parentElement !== content) restoration.observe(el.parentElement);
    const onLoad = (e: Event) => { if (content?.contains(e.target as Node)) correct(); };
    const onInput = () => finish(true);
    const onKey = (e: KeyboardEvent) => { if (SCROLL_KEYS.has(e.key)) finish(true); };
    const onScroll = () => { if (Math.abs(getScrollY() - expected) > 1) finish(true); };   // a scroll we didn't cause
    document.addEventListener("load", onLoad, true);
    document.addEventListener("loadedmetadata", onLoad, true);   // doesn't bubble: capture (native video dimensions)
    window.addEventListener("wheel", onInput, { capture: true, passive: true });
    window.addEventListener("touchstart", onInput, { capture: true, passive: true });
    window.addEventListener("pointerdown", onInput, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, { passive: true });
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (now - started >= SETTLE_MAX_MS) finish(true);
      else if (now - lastMove >= SETTLE_STABLE_MS && mediaBeforeReady(contentRef.current, el)) finish(true);
    }, 100);

    function finish(armNow: boolean) {
      if (done) return;
      done = true;
      restoration.disconnect();
      document.removeEventListener("load", onLoad, true);
      document.removeEventListener("loadedmetadata", onLoad, true);
      window.removeEventListener("wheel", onInput, true);
      window.removeEventListener("touchstart", onInput, true);
      window.removeEventListener("pointerdown", onInput, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", onScroll);
      window.clearInterval(timer);
      root.style.overflowAnchor = prevAnchoring;
      stopSettling = null;
      if (armNow && arrival?.gen === g) arm();           // hand-off in the same step (T4)
    }
    stopSettling = () => finish(false);
    correct();
  };

  const restore = (a: Arrival) => {
    const t = a.target;
    if (!t) { armAfterFrame(a.gen, null); return; }        // POP, no saved entry: stay put, arm after the layout frame
    setScrollY(t.y);                                        // coarse numeric placement
    requestAnimationFrame(() => {
      if (arrival?.gen !== a.gen) return;
      const el = t.anchor ? findAnchor(contentRef.current, t.anchor.id) : null;
      if (!t.anchor || !el) { arm(); return; }              // numeric only: no restoration observer, arm after this frame
      settle(a.gen, el, t.anchor.id, t.anchor.offset);
    });
  };

  // ---------------------------------------------------------------- the arrival state machine (S3)
  const focus = (ref: RefObject<HTMLElement>) => ref.current?.focus({ preventScroll: true });

  const step = (state: ArrivalState) => {
    const a = arrival;
    if (!a || state === "pending") return;
    if (a.phase === "ARRIVING") {
      a.phase = state === "error" ? "ERROR" : "DONE";
      if (a.nav === "POP") {
        if (state === "content") restore(a);
        else { setScrollY(0); armAfterFrame(a.gen, 0); }
      } else {
        setScrollY(0);
        focus(state === "error" ? errorRef : headingRef);
        armAfterFrame(a.gen, 0);
      }
    } else if (a.phase === "RECOVERING") {                 // the user's Retry has settled: focus transfer only, no scroll
      if (state === "error") { a.phase = "ERROR"; focus(errorRef); }
      else { a.phase = "DONE"; focus(headingRef); }
    } else if (a.phase === "ERROR" && state !== "error") {
      a.phase = "DONE";                                     // recovered without a Retry: don't move focus
    }
  };

  return {
    /** A location and/or arrivalKey change (also the first mount). Runs before paint. */
    navigate(nextEntry: string, nextKey: string, nav: Nav, state: ArrivalState) {
      if (entry !== null && entry !== nextEntry) flush(false);   // outgoing entry, under its captured id
      entry = nextEntry;
      if (arrivalKey === nextKey) return;                   // same route visit: stay armed, no restore, no focus (O2/O3)
      arrivalKey = nextKey;
      stopSettling?.();
      disarm();
      sample = null;
      sampleEl = null;
      ignoreY = null;
      gen += 1;
      arrival = { gen, nav, target: readEntry(nextEntry), phase: "ARRIVING" };
      step(state);
    },
    step,
    retry() { if (arrival?.phase === "ERROR") arrival.phase = "RECOVERING"; },
    onScroll() {
      if (!armed) return;
      if (ignoreY !== null) {
        const ig = ignoreY;
        ignoreY = null;
        if (Math.abs(getScrollY() - ig) < 1) return;
      }
      takeSample();
    },
    onIntent(e: Event) {
      if (e instanceof KeyboardEvent && !INTENT_KEYS.has(e.key)) return;
      takeSample();
    },
    onLoad(e: Event) { if (contentRef.current?.contains(e.target as Node)) takeSample(); },
    onPageHide() { flush(true); },
    unmount() {
      flush(true);                                          // the outgoing DOM is still attached here
      stopSettling?.();
      disarm();
      arrival = null;
    },
  };
}

export function usePublicArrival({ arrivalKey, state, contentRef, headingRef, errorRef }: Refs & { arrivalKey: string; state: ArrivalState }) {
  const location = useLocation();
  const navType = useNavigationType() as Nav;
  const entryId = `${location.key}|${location.pathname}${location.search}`;

  const engine = useRef<ReturnType<typeof createEngine> | null>(null);
  if (!engine.current) engine.current = createEngine({ contentRef, headingRef, errorRef });
  const stateRef = useRef(state);
  stateRef.current = state;
  const navRef = useRef(navType);
  navRef.current = navType;

  // Listeners and history.scrollRestoration for the lifetime of the view.
  useLayoutEffect(() => {
    const e = engine.current!;
    const h = window.history;
    let previous: ScrollRestoration | undefined;
    try { previous = h.scrollRestoration; h.scrollRestoration = "manual"; } catch { /* not supported */ }
    const onScroll = () => e.onScroll();
    const onIntent = (ev: Event) => e.onIntent(ev);
    const onLoad = (ev: Event) => e.onLoad(ev);
    const onPageHide = () => e.onPageHide();
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("pointerdown", onIntent, true);
    document.addEventListener("keydown", onIntent, true);
    document.addEventListener("load", onLoad, true);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      e.unmount();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("pointerdown", onIntent, true);
      document.removeEventListener("keydown", onIntent, true);
      document.removeEventListener("load", onLoad, true);
      window.removeEventListener("pagehide", onPageHide);
      try { if (previous !== undefined) h.scrollRestoration = previous; } catch { /* not supported */ }
    };
  }, []);

  // A new history entry and/or route visit (also the first mount): before paint.
  useLayoutEffect(() => {
    engine.current!.navigate(entryId, arrivalKey, navRef.current, stateRef.current);
  }, [entryId, arrivalKey]);

  // The current visit's state changing (pending → content/not-found/error, Retry outcomes).
  useEffect(() => {
    engine.current!.step(state);
  }, [state]);

  const retry = useCallback(() => engine.current!.retry(), []);
  return { retry };
}
