import { afterEach, describe, expect, it, vi } from "vitest";
import { ANCHOR_ATTR, findAnchor, getScrollY, pickAnchor, residual, scrollByY, setScrollY } from "./scrollAnchor";

/** A container whose anchors report the given rects (top/bottom relative to the viewport). */
function container(rects: { id: string; top: number; height: number }[]) {
  const root = document.createElement("div");
  for (const r of rects) {
    const el = document.createElement("div");
    el.setAttribute(ANCHOR_ATTR, r.id);
    el.getBoundingClientRect = () => ({ top: r.top, bottom: r.top + r.height, left: 0, right: 0, width: 0, height: r.height, x: 0, y: r.top, toJSON() {} });
    root.appendChild(el);
  }
  return root;
}

afterEach(() => { vi.restoreAllMocks(); document.documentElement.scrollTop = 0; });

describe("pickAnchor", () => {
  it("the first anchor (document order) whose bottom edge is below the viewport top", () => {
    const c = container([{ id: "a", top: -300, height: 100 }, { id: "b", top: -150, height: 200 }, { id: "c", top: 60, height: 100 }]);
    expect(pickAnchor(c)).toMatchObject({ id: "b", offset: -150 });
  });
  it("an anchor ending exactly at the viewport top is not chosen", () => {
    const c = container([{ id: "a", top: -100, height: 100 }, { id: "b", top: 0, height: 50 }]);
    expect(pickAnchor(c)!.id).toBe("b");
  });
  it("null without anchors or container", () => {
    expect(pickAnchor(document.createElement("div"))).toBeNull();
    expect(pickAnchor(null)).toBeNull();
  });
});

describe("findAnchor and residual", () => {
  it("finds by id compared as a string (ids with / and quotes need no escaping)", () => {
    const c = container([{ id: `card-alice/o"brien`, top: 10, height: 10 }, { id: "page-day-1/arrival", top: 20, height: 10 }]);
    expect(findAnchor(c, "page-day-1/arrival")!.getAttribute(ANCHOR_ATTR)).toBe("page-day-1/arrival");
    expect(findAnchor(c, `card-alice/o"brien`)).not.toBeNull();
    expect(findAnchor(c, "missing")).toBeNull();
    expect(findAnchor(null, "x")).toBeNull();
  });
  it("residual = current top − saved offset", () => {
    const [el] = Array.from(container([{ id: "a", top: 320, height: 10 }]).children);
    expect(residual(el, 200)).toBe(120);
    expect(residual(el, 400)).toBe(-80);
  });
});

describe("setScrollY / getScrollY", () => {
  it("jsdom fallback (no scrollingElement): sets the document element's scrollTop, never negative", () => {
    setScrollY(250);
    expect(getScrollY()).toBe(250);
    scrollByY(-50);
    expect(getScrollY()).toBe(200);
    setScrollY(-10);
    expect(getScrollY()).toBe(0);
  });
  it("browsers: the scrolling element's scrollTo with behavior 'instant' (overrides `scroll-behavior: smooth`)", () => {
    const scrollTo = vi.fn();
    const el = document.documentElement as HTMLElement & { scrollTo: unknown };
    Object.defineProperty(document, "scrollingElement", { configurable: true, get: () => el });   // jsdom has none
    el.scrollTo = scrollTo;
    try {
      setScrollY(400);
      expect(scrollTo).toHaveBeenCalledWith({ top: 400, behavior: "instant" });
    } finally {
      delete (el as { scrollTo?: unknown }).scrollTo;
      delete (document as { scrollingElement?: unknown }).scrollingElement;
    }
  });
});
