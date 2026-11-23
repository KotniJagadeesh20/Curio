// Step 14d-3: usePublicArrival (approved plan rev. 4.3, brief rev. 2). Harness: a fake ResizeObserver recording each
// instance, a manual animation-frame queue, a recorded scroll position, and a layout model for anchors.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useReducer, useRef } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate, type NavigateFunction } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePublicArrival, type ArrivalState } from "./usePublicArrival";

// ---- animation frames ------------------------------------------------------------------------------------------------
let frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
const flushFrame = () => act(() => { const due = [...frames.values()]; frames = new Map(); due.forEach((f) => f(performance.now())); });

// ---- ResizeObserver --------------------------------------------------------------------------------------------------
class FakeRO {
  static all: FakeRO[] = [];
  targets = new Set<Element>();
  off = false;
  constructor(private cb: ResizeObserverCallback) { FakeRO.all.push(this); }
  observe(t: Element) { this.targets.add(t); const id = ++frameId; frames.set(id, () => { if (!this.off) this.cb([], this as unknown as ResizeObserver); }); }
  unobserve(t: Element) { this.targets.delete(t); }
  disconnect() { this.off = true; this.targets.clear(); }
  fire() { act(() => { if (!this.off) this.cb([], this as unknown as ResizeObserver); }); }
}
const live = () => FakeRO.all.filter((r) => !r.off);

// ---- scroll position and layout --------------------------------------------------------------------------------------
let y = 0;
let sets: number[] = [];
let reads = 0;
let layout: Record<string, number> = {};                     // anchor id → document top (height 500)
const H = 500;
const userScroll = (to: number) => act(() => { y = to; window.dispatchEvent(new Event("scroll")); });

// ---- the test view ----------------------------------------------------------------------------------------------------
const states = new Map<string, ArrivalState>();
const anchorsFor = new Map<string, string[]>();
const mediaBefore = new Map<string, "img" | "iframe">();     // 14d-3 correction: a media element BEFORE the anchors
const videoAt = new Map<string, "before" | "before-sources" | "before-nosrc" | "inside" | "after">();   // native-video correction
const forcers = new Set<() => void>();
const rerenderAll = () => act(() => { forcers.forEach((f) => f()); });
const setState = (path: string, s: ArrivalState) => act(() => { states.set(path, s); forcers.forEach((f) => f()); });

function View({ prefix }: { prefix: string }) {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => { forcers.add(force); return () => { forcers.delete(force); }; }, []);
  const loc = useLocation();
  const state = states.get(loc.pathname) ?? "pending";
  const contentRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const { retry } = usePublicArrival({ arrivalKey: `${prefix}:${loc.pathname}`, state, contentRef, headingRef, errorRef });
  if (state === "content") {
    return (
      <article ref={contentRef} data-testid="content">
        <h1 ref={headingRef} tabIndex={-1}>{loc.pathname}</h1>
        <section data-testid="section">
          {mediaBefore.get(loc.pathname) === "img" && <img alt="" data-testid="img-before" />}
          {mediaBefore.get(loc.pathname) === "iframe" && <iframe title="before" data-testid="iframe-before" />}
          {videoAt.get(loc.pathname) === "before" && <video src="https://v.example.org/a.webm" data-testid="video" />}
          {videoAt.get(loc.pathname) === "before-nosrc" && <video data-testid="video" />}
          {videoAt.get(loc.pathname) === "before-sources" && <video data-testid="video"><source src="https://v.example.org/a.webm" /><source src="https://v.example.org/a.mp4" /></video>}
          {(anchorsFor.get(loc.pathname) ?? []).map((id) => (
            <div key={id} data-scroll-anchor={id} data-testid={`a-${id}`}>
              {id === "b1" && videoAt.get(loc.pathname) === "inside" && <video src="https://v.example.org/a.webm" data-testid="video" />}
            </div>
          ))}
          {videoAt.get(loc.pathname) === "after" && <video src="https://v.example.org/a.webm" data-testid="video" />}
          <img alt="" data-testid="img" />
        </section>
      </article>
    );
  }
  if (state === "not-found") return <h1 ref={headingRef} tabIndex={-1} data-testid="na">Not available</h1>;
  if (state === "error") return <div ref={errorRef} tabIndex={-1} data-testid="error"><button onClick={retry}>Retry</button></div>;
  return <p>loading</p>;
}
const PageLike = () => <View prefix="page" />;
const OtherView = () => <View prefix="disc" />;

let nav: NavigateFunction;
function Grab() { nav = useNavigate(); return null; }
function mount(initial = "/out") {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Grab />
      <Routes>
        <Route path="/p/:id" element={<PageLike />} />
        <Route path="/d/:id" element={<OtherView />} />
        <Route path="/out" element={<div data-testid="out" />} />
      </Routes>
    </MemoryRouter>,
  );
}
const go = (to: string, opts?: { replace?: boolean }) => act(() => { nav(to, opts); });
const back = () => act(() => { nav(-1); });
const forward = () => act(() => { nav(1); });
const active = () => document.activeElement;

/** The stored entry for a URL (pathname + search), from sessionStorage (newest by seq). */
function stored(url: string): { y: number; anchor: { id: string; offset: number } | null; seq: number } | undefined {
  const hits = Object.keys(sessionStorage).filter((k) => k.startsWith("curio:scroll:") && k.endsWith(`|${url}`))
    .map((k) => JSON.parse(sessionStorage.getItem(k)!)).sort((a, b) => b.seq - a.seq);
  return hits[0];
}
let n = 0;
const uniq = () => `t${++n}`;                                // unique paths per test (the store is module-wide)

beforeEach(() => {
  frames = new Map(); FakeRO.all = []; y = 0; sets = []; reads = 0; layout = {};
  states.clear(); anchorsFor.clear(); mediaBefore.clear(); videoAt.clear();
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { const id = ++frameId; frames.set(id, cb); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  vi.stubGlobal("ResizeObserver", FakeRO);
  Object.defineProperty(document.documentElement, "scrollTop", { configurable: true, get() { reads++; return y; }, set(v: number) { y = v; sets.push(v); } });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const id = this.getAttribute("data-scroll-anchor");
    const top = id !== null && id in layout ? layout[id] - y : 0;
    return { top, bottom: top + H, left: 0, right: 0, width: 0, height: H, x: 0, y: top, toJSON() {} } as DOMRect;
  });
  window.history.scrollRestoration = "auto";
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); delete (document.documentElement as { scrollTop?: unknown }).scrollTop; });

/** Mount, PUSH to a content page and arm tracking. */
function arriveAt(path: string, anchors: string[] = []) {
  anchorsFor.set(path, anchors);
  mount();
  go(path);
  setState(path, "content");
  flushFrame();                                              // arm (+ the tracking observer's initial notification)
}

// =====================================================================================================================
describe("R1/R3/S3: arrival and focus", () => {
  it("PUSH: nothing while pending; on content: one scroll to 0 and the heading focused; then armed with a tracking observer", () => {
    const p = `/p/${uniq()}`;
    mount();
    go(p);
    expect(sets).toEqual([]);
    expect(active()).toBe(document.body);
    setState(p, "content");
    expect(sets).toEqual([0]);
    expect(active()).toBe(screen.getByRole("heading", { name: p }));
    expect(live()).toHaveLength(0);
    flushFrame();
    expect(live()).toHaveLength(1);
  });

  it("acts once per arrival: later state changes (refetch) never scroll or focus again", () => {
    const p = `/p/${uniq()}`;
    arriveAt(p);
    (active() as HTMLElement).blur();
    setState(p, "pending");
    setState(p, "content");
    expect(sets).toEqual([0]);
    expect(active()).toBe(document.body);
  });

  it("REPLACE is treated like PUSH", () => {
    const p = `/p/${uniq()}`;
    mount();
    go(p, { replace: true });
    setState(p, "content");
    expect(sets).toEqual([0]);
    expect(active()).toBe(screen.getByRole("heading", { name: p }));
  });

  it("R1/O2: a query-only change (same arrivalKey) is no arrival: no scroll, no focus, stays armed under the new entry", () => {
    const p = `/p/${uniq()}`;
    arriveAt(p);
    (active() as HTMLElement).blur();
    go(`${p}?page=2`);
    expect(sets).toEqual([0]);
    expect(active()).toBe(document.body);
    userScroll(300);
    flushFrame();
    expect(stored(`${p}?page=2`)!.y).toBe(300);
  });

  it("O3: the same URL through a new history entry is no arrival", () => {
    const p = `/p/${uniq()}`;
    arriveAt(p);
    (active() as HTMLElement).blur();
    go(p);
    expect(sets).toEqual([0]);
    expect(active()).toBe(document.body);
  });

  it("R3: A confirmed → B pending (A still confirmed elsewhere): no scroll, no focus, no position reads until B is confirmed", () => {
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    arriveAt(a);
    const before = reads;
    go(b);
    expect(reads).toBe(before);                              // nothing reads the scroll position during navigation
    expect(sets).toEqual([0]);
    setState(b, "content");
    expect(sets).toEqual([0, 0]);
    expect(active()).toBe(screen.getByRole("heading", { name: b }));
  });

  it("PUSH → 404: scroll to 0, the not-available heading focused", () => {
    const p = `/p/${uniq()}`;
    mount(); go(p); setState(p, "not-found");
    expect(sets).toEqual([0]);
    expect(active()).toBe(screen.getByTestId("na"));
  });

  it("POP → 404 / error: scroll to 0, focus not moved", () => {
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    arriveAt(a); go(b); setState(b, "content"); flushFrame();
    states.set(a, "not-found");
    (active() as HTMLElement).blur();
    back();
    expect(sets.at(-1)).toBe(0);
    expect(active()).toBe(document.body);
    forward();
    states.set(b, "error");
    back(); forward();                                       // fresh POP arrival at b, now in error
    expect(active()).toBe(document.body);
  });
});

describe("S3: error and Retry", () => {
  const toError = () => { const p = `/p/${uniq()}`; mount(); go(p); setState(p, "error"); return p; };

  it("PUSH → error: one scroll to 0, the error region focused", () => {
    toError();
    expect(sets).toEqual([0]);
    expect(active()).toBe(screen.getByTestId("error"));
  });

  it("PUSH → pending → error → Retry → pending → content: content heading focused, NO further scroll", () => {
    const p = toError();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    setState(p, "pending");
    expect(sets).toEqual([0]);
    setState(p, "content");
    expect(active()).toBe(screen.getByRole("heading", { name: p }));
    expect(sets).toEqual([0]);
  });

  it("… → error → Retry → error again (region refocused, no scroll) → Retry → content (heading)", () => {
    const p = toError();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    setState(p, "pending");
    (active() as HTMLElement).blur();
    setState(p, "error");
    expect(active()).toBe(screen.getByTestId("error"));
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    setState(p, "pending");
    setState(p, "content");
    expect(active()).toBe(screen.getByRole("heading", { name: p }));
    expect(sets).toEqual([0]);
  });

  it("error → Retry → 404: the not-available heading focused", () => {
    const p = toError();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    setState(p, "pending");
    setState(p, "not-found");
    expect(active()).toBe(screen.getByTestId("na"));
  });

  it("error without Retry → a background refetch succeeds: no focus change, no scroll", () => {
    const p = toError();
    (active() as HTMLElement).blur();
    setState(p, "pending");
    setState(p, "content");
    expect(active()).toBe(document.body);
    expect(sets).toEqual([0]);
  });

  it("POP → error (no focus) → Retry → content: heading focused (user-initiated)", () => {
    const p = `/p/${uniq()}`;
    states.set(p, "error");
    mount(p);                                                 // the initial entry is a POP
    expect(active()).toBe(document.body);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    setState(p, "pending");
    setState(p, "content");
    expect(active()).toBe(screen.getByRole("heading", { name: p }));
  });

  it("content (done) → a later background error: no focus, no scroll", () => {
    const p = `/p/${uniq()}`;
    arriveAt(p);
    (active() as HTMLElement).blur();
    setState(p, "error");
    expect(active()).toBe(document.body);
    expect(sets).toEqual([0]);
  });
});

// =====================================================================================================================
describe("S1/T1: sampling and flushing", () => {
  it("the outgoing sample is written under the OLD entry before switching; a pending frame never writes under the new one", () => {
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    arriveAt(a);
    userScroll(800);                                          // sample taken, its frame write still pending
    go(b);
    expect(stored(a)!.y).toBe(800);
    flushFrame();
    expect(stored(b)).toBeUndefined();
    expect(stored(a)!.y).toBe(800);
  });

  it("unmount (a different public view) flushes under the outgoing entry: scroll and click in the same task, then Back", () => {
    const a = `/p/${uniq()}`, d = `/d/${uniq()}`;
    arriveAt(a);
    act(() => { y = 640; window.dispatchEvent(new Event("scroll")); nav(d); });   // same task, no frame in between
    expect(stored(a)!.y).toBe(640);
    states.set(a, "content");
    back();
    expect(sets.at(-1)).toBe(640);
  });

  it("navigation and cleanup never read the scroll position", () => {
    const a = `/p/${uniq()}`;
    arriveAt(a);
    userScroll(100);
    let before = reads;
    go(`/p/${uniq()}`);
    expect(reads).toBe(before);
    before = reads;
    go("/out");
    expect(reads).toBe(before);
  });

  it("unmount refreshes the anchor offset while the outgoing DOM is attached (key and y unchanged)", () => {
    const a = `/p/${uniq()}`;
    layout = { b0: 0, b1: 1000 };
    arriveAt(a, ["b0", "b1"]);
    userScroll(900);                                          // anchor b0? top −900, bottom −400 → b1 at 100
    flushFrame();
    expect(stored(a)).toMatchObject({ y: 900, anchor: { id: "b1", offset: 100 } });
    layout.b1 = 1120;                                         // an image above loaded: b1 moved, no scroll event
    go("/out");
    expect(stored(a)).toMatchObject({ y: 900, anchor: { id: "b1", offset: 220 } });
  });

  it("…but not when the anchor element is already detached", () => {
    const a = `/p/${uniq()}`;
    layout = { b0: 0, b1: 1000 };
    arriveAt(a, ["b0", "b1"]);
    userScroll(900);
    anchorsFor.set(a, ["b0"]);                                // b1 removed by a re-render
    rerenderAll();
    layout.b1 = 1500;
    go("/out");
    expect(stored(a)!.anchor).toEqual({ id: "b1", offset: 100 });
  });

  it("pagehide flushes immediately", () => {
    const a = `/p/${uniq()}`;
    arriveAt(a);
    userScroll(450);
    act(() => { window.dispatchEvent(new Event("pagehide")); });
    expect(stored(a)!.y).toBe(450);
  });

  it("T1: a layout change with no scroll event re-samples through the TRACKING observer (which never scrolls)", () => {
    const a = `/p/${uniq()}`;
    layout = { b0: 0, b1: 1000 };
    arriveAt(a, ["b0", "b1"]);
    userScroll(900); flushFrame();
    layout.b1 = 1120;
    const setsBefore = sets.length;
    live()[0].fire();
    flushFrame();
    expect(stored(a)!.anchor).toEqual({ id: "b1", offset: 220 });
    expect(sets.length).toBe(setsBefore);
  });

  it("T1: an image load in the content and a pointerdown re-sample", () => {
    const a = `/p/${uniq()}`;
    arriveAt(a);
    act(() => { y = 333; });
    fireEvent.load(screen.getByTestId("img"));
    flushFrame();
    expect(stored(a)!.y).toBe(333);
    act(() => { y = 444; });
    fireEvent.pointerDown(document.body);
    flushFrame();
    expect(stored(a)!.y).toBe(444);
  });

  it("history.scrollRestoration is manual while mounted and restored when leaving to a non-public screen", () => {
    mount(); go(`/p/${uniq()}`);
    expect(window.history.scrollRestoration).toBe("manual");
    go("/out");
    expect(window.history.scrollRestoration).toBe("auto");
  });

});

// =====================================================================================================================
describe("S2/T2/T3/T4: POP restoration", () => {
  /** a (anchors b0..b2 at 0/1000/2000) scrolled to 1100 → b (pushed) → Back. Fake timers for settling. */
  function returnToA() {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    layout = { b0: 0, b1: 1000, b2: 2000 };
    arriveAt(a, ["b0", "b1", "b2"]);
    userScroll(1100); flushFrame();                          // anchor b1 at −100
    go(b); setState(b, "content"); flushFrame();
    const savedSeq = stored(a)!.seq;
    const createdBefore = FakeRO.all.length;
    sets = [];
    back();
    return { a, savedSeq, createdBefore };
  }

  it("restores numerically, then by anchor; a delayed layout shift above is corrected by the residual only", () => {
    const { a } = returnToA();
    expect(sets).toEqual([1100]);                             // coarse numeric placement
    flushFrame();                                             // anchor found → settling
    expect(sets).toEqual([1100]);                             // residual 0
    layout.b1 = 1120;                                         // image above grew by 120
    const restoration = live();
    expect(restoration).toHaveLength(1);
    restoration[0].fire();
    expect(sets).toEqual([1100, 1220]);
    restoration[0].fire();                                    // converged: no further scroll
    expect(sets).toEqual([1100, 1220]);
    expect(stored(a)!.anchor).toEqual({ id: "b1", offset: -100 });
  });

  it("T2: the restoration observer watches the content container and the anchor's parent, not documentElement", () => {
    returnToA();
    flushFrame();
    const targets = [...live()[0].targets];
    expect(targets).toContain(screen.getByTestId("content"));
    expect(targets).toContain(screen.getByTestId("section"));
    expect(targets).not.toContain(document.documentElement);
  });

  it("T3/T4: while settling nothing is sampled; when settling ends the tracking observer takes over in the same step", () => {
    const { a, savedSeq } = returnToA();
    flushFrame();
    userScroll(1100);                                         // our own position: not a foreign scroll, not sampled
    flushFrame();
    expect(stored(a)!.seq).toBe(savedSeq);
    const restoration = live()[0];
    act(() => { vi.advanceTimersByTime(700); });              // stable ≥ 500 ms, images complete
    expect(restoration.off).toBe(true);
    expect(live()).toHaveLength(1);
    expect(live()[0]).not.toBe(restoration);
    userScroll(1300); flushFrame();
    expect(stored(a)!.y).toBe(1300);
  });

  it.each([
    ["wheel", () => fireEvent.wheel(window)],
    ["touchstart", () => fireEvent.touchStart(window)],
    ["pointerdown", () => fireEvent.pointerDown(window)],
    ["PageDown", () => fireEvent.keyDown(window, { key: "PageDown" })],
    ["a scroll we didn't cause", () => userScroll(1500)],
  ])("user input (%s) cancels settling immediately and arms tracking", (_n, input) => {
    const { a } = returnToA();
    flushFrame();
    const restoration = live()[0];
    act(() => { input(); });
    expect(restoration.off).toBe(true);
    layout.b1 = 1300;                                          // a late image: no correction any more
    const setsBefore = sets.length;
    restoration.fire();
    expect(sets.length).toBe(setsBefore);
    userScroll(1700); flushFrame();
    expect(stored(a)!.y).toBe(1700);
  });

  it("settling stops at the 5 s cap even if the layout keeps moving", () => {
    returnToA();
    flushFrame();
    const restoration = live()[0];
    for (let i = 0; i < 12 && !restoration.off; i++) {
      layout.b1 += i % 2 ? 50 : -50;
      restoration.fire();
      act(() => { vi.advanceTimersByTime(450); });
    }
    expect(restoration.off).toBe(true);
    expect(performance.now()).toBeLessThanOrEqual(5600);
  });

  it("rev. 4.1: POP with NO saved entry → no scroll, no restoration observer; tracking armed after the layout frame", () => {
    const p = `/p/${uniq()}`;
    states.set(p, "content");
    mount(p);                                                 // initial entry: POP, nothing stored
    expect(sets).toEqual([]);
    expect(live()).toHaveLength(0);
    userScroll(50);                                           // before the frame: not stored
    expect(stored(p)).toBeUndefined();
    flushFrame();
    expect(live()).toHaveLength(1);
    const tracking = live()[0];
    userScroll(60); flushFrame();
    expect(stored(p)!.y).toBe(60);
    const setsBefore = sets.length;
    tracking.fire();                                          // the tracking observer re-samples, never scrolls
    expect(sets.length).toBe(setsBefore);
  });

  it.each([["no anchor recorded", false], ["anchor id missing from the content", true]])(
    "rev. 4.1: POP with a numeric y but no matching anchor (%s) → one numeric scroll, no restoration observer, armed after one frame", (_n, hadAnchor) => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
      const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
      layout = { x1: 0 };
      arriveAt(a, hadAnchor ? ["x1"] : []);
      userScroll(700); flushFrame();
      if (hadAnchor) anchorsFor.set(a, ["y1"]);              // content changed: the saved anchor id is gone
      go(b); setState(b, "content"); flushFrame();
      sets = [];
      const created = FakeRO.all.length;
      back();
      expect(sets).toEqual([700]);
      flushFrame();
      const newOnes = FakeRO.all.slice(created);
      expect(newOnes).toHaveLength(1);                        // only the tracking observer
      expect(live()).toEqual(newOnes);
      userScroll(720); flushFrame();                          // well before 5 s (no timers advanced)
      expect(stored(a)!.y).toBe(720);
    });

  it("A → B → A(new entry) → Back → Back: each history entry restores its own position", () => {
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    arriveAt(a);
    userScroll(300);
    go(b); setState(b, "content"); flushFrame();
    userScroll(900);
    go(a);                                                    // PUSH: a new entry for a → top
    flushFrame();
    expect(sets.at(-1)).toBe(0);
    back();
    expect(sets.at(-1)).toBe(900);
    back();
    expect(sets.at(-1)).toBe(300);
  });

  it("a superseded arrival's pending frame does nothing (generation guard): Back to A, then C before the frame", () => {
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`, c = `/p/${uniq()}`;
    layout = { b1: 1000 };
    arriveAt(a, ["b1"]);
    userScroll(1100); flushFrame();
    go(b); setState(b, "content"); flushFrame();
    back();                                                   // POP to a: numeric placement + a frame scheduled for the anchor
    go(c);                                                    // superseded before that frame runs; c is still pending
    const created = FakeRO.all.length;
    flushFrame();
    expect(FakeRO.all.length).toBe(created);                  // no restoration observer for a stale arrival
    expect(live()).toHaveLength(0);                           // and tracking not armed while c is pending
  });

  it("PUSH arrivals never restore and only ever create the tracking observer; it's disconnected on a new arrival and on unmount", () => {
    const a = `/p/${uniq()}`;
    arriveAt(a);
    userScroll(500);
    go(`/p/${uniq()}`);
    expect(live()).toHaveLength(0);                           // disconnected when the new arrival starts
    go(a);                                                    // PUSH to a again: top, not 500
    setState(a, "content");
    expect(sets.at(-1)).toBe(0);
    flushFrame();
    expect(live()).toHaveLength(1);
    go("/out");
    expect(live()).toHaveLength(0);
  });

  it("PUSH: the scroll event of our own scrollTo(0) after arming is not sampled", () => {
    const a = `/p/${uniq()}`;
    arriveAt(a);
    act(() => { window.dispatchEvent(new Event("scroll")); });   // y is 0: our own scroll's event
    flushFrame();
    expect(stored(a)).toBeUndefined();
    userScroll(10); flushFrame();
    expect(stored(a)!.y).toBe(10);
  });
});

// =====================================================================================================================
// 14d-3 review correction, findings 1 and 4: settling readiness and the overflow-anchor exit paths.
describe("settling readiness (S2, as implemented and documented in the correction report)", () => {
  /** a with anchors b0..b2 scrolled to 1100 (anchor b1) → b → Back; optional media element before the anchors on a. */
  function returnWith(media?: "img" | "iframe") {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    layout = { b0: 0, b1: 1000, b2: 2000 };
    if (media) mediaBefore.set(a, media);
    arriveAt(a, ["b0", "b1", "b2"]);
    userScroll(1100); flushFrame();
    go(b); setState(b, "content"); flushFrame();
    back();
    return a;
  }
  const incomplete = (el: HTMLElement) => {
    let complete = false;
    Object.defineProperty(el, "complete", { configurable: true, get: () => complete });
    return () => { complete = true; };
  };

  it("an image BEFORE the anchor that hasn't loaded holds settling past the stable time; its load corrects and lets it end", () => {
    returnWith("img");
    const loaded = incomplete(screen.getByTestId("img-before"));
    flushFrame();
    const restoration = live()[0];
    act(() => { vi.advanceTimersByTime(1500); });             // stable for 1.5 s, but an earlier image is still loading
    expect(restoration.off).toBe(false);
    layout.b1 = 1400;                                         // it loads and pushes the anchor down by 400
    loaded();
    fireEvent.load(screen.getByTestId("img-before"));
    expect(sets.at(-1)).toBe(1500);                           // corrected by the residual
    act(() => { vi.advanceTimersByTime(700); });
    expect(restoration.off).toBe(true);
  });

  it("…and if it never loads, settling still ends at the 5 s cap", () => {
    returnWith("img");
    incomplete(screen.getByTestId("img-before"));
    flushFrame();
    const restoration = live()[0];
    act(() => { vi.advanceTimersByTime(4800); });
    expect(restoration.off).toBe(false);
    act(() => { vi.advanceTimersByTime(400); });
    expect(restoration.off).toBe(true);
  });

  it("an image AFTER the anchor that hasn't loaded does not hold settling (it can't move the anchor's top)", () => {
    returnWith();
    incomplete(screen.getByTestId("img"));                    // the harness image follows every anchor
    flushFrame();
    const restoration = live()[0];
    act(() => { vi.advanceTimersByTime(700); });
    expect(restoration.off).toBe(true);
  });

  it("an iframe before the anchor does not hold settling (its box never depends on its document); a resize is still corrected", () => {
    returnWith("iframe");
    flushFrame();
    const restoration = live()[0];
    layout.b1 = 1050;                                         // any size change while settling is still corrected
    restoration.fire();
    expect(sets.at(-1)).toBe(1150);
    act(() => { vi.advanceTimersByTime(700); });
    expect(restoration.off).toBe(true);
  });
});

describe("settling readiness: native videos (native-video correction, plan rev. 2)", () => {
  type V = { readyState: number; networkState: number; error: MediaError | null; currentSrc?: string };
  /** a with anchors b0..b2 and a video at `where`, scrolled to 1100 (anchor b1) → b → Back; the video's media state set. */
  function returnWithVideo(where: "before" | "before-sources" | "before-nosrc" | "inside" | "after", state: V) {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    layout = { b0: 0, b1: 1000, b2: 2000 };
    videoAt.set(a, where);
    arriveAt(a, ["b0", "b1", "b2"]);
    userScroll(1100); flushFrame();
    go(b); setState(b, "content"); flushFrame();
    back();
    const v = screen.getByTestId("video") as HTMLVideoElement;
    const cur = { ...state };
    for (const k of ["readyState", "networkState", "error"] as const) Object.defineProperty(v, k, { configurable: true, get: () => cur[k] });
    Object.defineProperty(v, "currentSrc", { configurable: true, get: () => cur.currentSrc ?? "" });
    flushFrame();                                             // anchor found → settling
    return { v, cur, restoration: live()[0] };
  }
  const LOADING: V = { readyState: 0, networkState: HTMLMediaElement.NETWORK_LOADING, error: null };

  it("a video BEFORE the anchor without metadata holds settling; loadedmetadata + its resize is corrected, then settling ends", () => {
    const { v, cur, restoration } = returnWithVideo("before", LOADING);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(restoration.off).toBe(false);
    layout.b1 = 880;                                          // 2:1 default box → the real, wider ratio: 120 px shorter
    cur.readyState = HTMLMediaElement.HAVE_METADATA;
    cur.networkState = HTMLMediaElement.NETWORK_IDLE;
    fireEvent(v, new Event("loadedmetadata"));                // doesn't bubble: the hook listens in the capture phase
    expect(sets.at(-1)).toBe(980);
    act(() => { vi.advanceTimersByTime(700); });
    expect(restoration.off).toBe(true);
  });

  it("loadeddata alone (no metadata state change) is not what the correction listens to", () => {
    const { v, restoration } = returnWithVideo("before", LOADING);
    layout.b1 = 880;
    const before = sets.length;
    fireEvent(v, new Event("loadeddata"));
    expect(sets.length).toBe(before);
    expect(restoration.off).toBe(false);
  });

  it("…and if its metadata never arrives, settling ends at the 5 s cap", () => {
    const { restoration } = returnWithVideo("before", LOADING);
    act(() => { vi.advanceTimersByTime(4800); });
    expect(restoration.off).toBe(false);
    act(() => { vi.advanceTimersByTime(400); });
    expect(restoration.off).toBe(true);
  });

  it.each([
    ["errored (src failed)", "before", { readyState: 0, networkState: HTMLMediaElement.NETWORK_IDLE, error: { code: 4 } as MediaError }],
    ["NETWORK_NO_SOURCE after every child <source> failed (video.error stays null; currentSrc = the last candidate tried)", "before-sources", { readyState: 0, networkState: HTMLMediaElement.NETWORK_NO_SOURCE, error: null, currentSrc: "https://v.example.org/a.mp4" }],
    ["NETWORK_EMPTY with genuinely no source (no src, no <source>)", "before-nosrc", { readyState: 0, networkState: HTMLMediaElement.NETWORK_EMPTY, error: null }],
  ] as const)("a video before the anchor that is %s does not hold settling", (_n, where, state) => {
    const { restoration } = returnWithVideo(where, state);
    act(() => { vi.advanceTimersByTime(700); });
    expect(restoration.off).toBe(true);
  });

  // NETWORK_EMPTY is also the state BEFORE resource selection starts: with a declared source it must not count as ready.
  const EMPTY: V = { readyState: 0, networkState: HTMLMediaElement.NETWORK_EMPTY, error: null };
  it.each([
    ["a src attribute", "before"],
    ["child <source> elements", "before-sources"],
  ] as const)("NETWORK_EMPTY with %s (resource selection not started) holds settling; the cap still ends it", (_n, where) => {
    const { restoration } = returnWithVideo(where, EMPTY);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(restoration.off).toBe(false);
    act(() => { vi.advanceTimersByTime(3700); });
    expect(restoration.off).toBe(true);
  });

  // …and resource selection reports NETWORK_NO_SOURCE before it has tried anything (currentSrc still ""): not ready either.
  const PENDING: V = { readyState: 0, networkState: HTMLMediaElement.NETWORK_NO_SOURCE, error: null, currentSrc: "" };
  it.each([
    ["a src attribute", "before"],
    ["child <source> elements", "before-sources"],
  ] as const)("NETWORK_NO_SOURCE with %s but nothing tried yet (currentSrc \"\") holds settling; the cap still ends it", (_n, where) => {
    const { restoration } = returnWithVideo(where, PENDING);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(restoration.off).toBe(false);
    act(() => { vi.advanceTimersByTime(3700); });
    expect(restoration.off).toBe(true);
  });

  it("<source> children: pending → trying a candidate → every candidate failed: settling ends only then", () => {
    const { cur, restoration } = returnWithVideo("before-sources", PENDING);
    act(() => { vi.advanceTimersByTime(600); });
    expect(restoration.off).toBe(false);
    cur.networkState = HTMLMediaElement.NETWORK_LOADING; cur.currentSrc = "https://v.example.org/a.webm";
    act(() => { vi.advanceTimersByTime(600); });
    expect(restoration.off).toBe(false);
    cur.networkState = HTMLMediaElement.NETWORK_NO_SOURCE; cur.currentSrc = "https://v.example.org/a.mp4";
    act(() => { vi.advanceTimersByTime(200); });
    expect(restoration.off).toBe(true);
  });

  it("NETWORK_EMPTY with a src → loading → metadata: the resize is corrected and settling then ends", () => {
    const { v, cur, restoration } = returnWithVideo("before", EMPTY);
    act(() => { vi.advanceTimersByTime(600); });
    expect(restoration.off).toBe(false);
    cur.networkState = HTMLMediaElement.NETWORK_LOADING;     // resource selection started
    act(() => { vi.advanceTimersByTime(600); });
    expect(restoration.off).toBe(false);
    layout.b1 = 1250;                                         // the real ratio is taller than the default box
    cur.readyState = HTMLMediaElement.HAVE_METADATA;
    cur.networkState = HTMLMediaElement.NETWORK_IDLE;
    fireEvent(v, new Event("loadedmetadata"));
    expect(sets.at(-1)).toBe(1350);
    act(() => { vi.advanceTimersByTime(700); });
    expect(restoration.off).toBe(true);
  });

  it.each(["inside", "after"] as const)("a video %s the anchor without metadata does not hold settling", (where) => {
    const { restoration } = returnWithVideo(where, LOADING);
    act(() => { vi.advanceTimersByTime(700); });
    expect(restoration.off).toBe(true);
  });
});

describe("overflow-anchor: the previous inline value comes back on every settling exit path", () => {
  const root = () => document.documentElement.style;
  function settlingAt(previous: string) {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "setTimeout", "clearTimeout", "performance"] });
    root().overflowAnchor = previous;
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    layout = { b0: 0, b1: 1000, b2: 2000 };
    arriveAt(a, ["b0", "b1", "b2"]);
    userScroll(1100); flushFrame();
    go(b); setState(b, "content"); flushFrame();
    back();
    flushFrame();                                             // settling starts
    expect(live()).toHaveLength(1);
    expect(root().overflowAnchor).toBe("none");
  }
  afterEach(() => { root().overflowAnchor = ""; });

  const exits: [string, () => void][] = [
    ["normal completion (stable, images ready)", () => { act(() => { vi.advanceTimersByTime(700); }); }],
    ["the 5 s cap", () => { act(() => { vi.advanceTimersByTime(5200); }); }],
    ["user cancellation (wheel)", () => { act(() => { fireEvent.wheel(window); }); }],
    ["user cancellation (a scroll we didn't cause)", () => userScroll(1600)],
    ["a new arrival", () => { go(`/p/${uniq()}`); }],
    ["unmount (leaving to a non-public screen)", () => { go("/out"); }],
  ];
  it.each(exits.flatMap(([name, exit]) => [["auto", name, exit], ["", name, exit]] as [string, string, () => void][]))(
    "previous inline value %j: restored after %s", (previous, _name, exit) => {
      settlingAt(previous);
      exit();
      expect(root().overflowAnchor).toBe(previous);
    });

  it("a query-only change while settling is no exit: still none, and restored when settling completes", () => {
    settlingAt("auto");
    act(() => { nav({ search: "?q=1" }); });
    expect(root().overflowAnchor).toBe("none");
    act(() => { vi.advanceTimersByTime(700); });
    expect(root().overflowAnchor).toBe("auto");
  });
});

// Last on purpose: a storage failure turns persistence off for the rest of the page lifetime (the store is module-wide),
// so later tests could no longer inspect sessionStorage.
describe("storage failure", () => {
  it("storage failing on every write: navigation and Back restoration still work (memory)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    const a = `/p/${uniq()}`, b = `/p/${uniq()}`;
    arriveAt(a);
    userScroll(510);
    go(b); setState(b, "content"); flushFrame();
    back();
    expect(sets.at(-1)).toBe(510);
  });
});
