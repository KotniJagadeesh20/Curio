import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalUrl, copyToClipboard, sharePublicLink } from "./share";

/** Installs (or removes, with undefined) navigator.share / canShare / clipboard for one test. */
function stubNavigator(o: { share?: unknown; canShare?: unknown; clipboard?: unknown }) {
  for (const k of ["share", "canShare", "clipboard"] as const) {
    Object.defineProperty(navigator, k, { value: o[k], configurable: true, writable: true });
  }
}
const abort = () => Object.assign(new Error("closed"), { name: "AbortError" });
const DATA = { title: "Arrival · Lisbon", url: "https://curio.example/@alice/lisbon/day-1/arrival" };

afterEach(() => stubNavigator({}));

describe("canonicalUrl", () => {
  it("is the page origin plus the given (paths.*) path, nothing else", () => {
    expect(canonicalUrl("/@alice/lisbon")).toBe(`${window.location.origin}/@alice/lisbon`);
  });
});

describe("sharePublicLink", () => {
  it("native share succeeds → 'shared', clipboard untouched", async () => {
    const share = vi.fn(async () => {}), writeText = vi.fn(async () => {});
    stubNavigator({ share, clipboard: { writeText } });
    expect(await sharePublicLink(DATA)).toBe("shared");
    expect(share).toHaveBeenCalledWith({ title: DATA.title, url: DATA.url });
    expect(writeText).not.toHaveBeenCalled();
  });

  it("the reader closes the share sheet (AbortError) → 'cancelled', no clipboard fallback", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ share: vi.fn(async () => { throw abort(); }), clipboard: { writeText } });
    expect(await sharePublicLink(DATA)).toBe("cancelled");
    expect(writeText).not.toHaveBeenCalled();
  });

  it("native share fails otherwise (e.g. NotAllowedError) → falls back to the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ share: vi.fn(async () => { throw Object.assign(new Error("no"), { name: "NotAllowedError" }); }), clipboard: { writeText } });
    expect(await sharePublicLink(DATA)).toBe("copied");
    expect(writeText).toHaveBeenCalledWith(DATA.url);
  });

  it("canShare() says no → clipboard, share never called", async () => {
    const share = vi.fn(), writeText = vi.fn(async () => {});
    stubNavigator({ share, canShare: () => false, clipboard: { writeText } });
    expect(await sharePublicLink(DATA)).toBe("copied");
    expect(share).not.toHaveBeenCalled();
  });

  it("no share API → clipboard → 'copied'", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ clipboard: { writeText } });
    expect(await sharePublicLink(DATA)).toBe("copied");
  });

  it("clipboard refuses → 'unavailable'; neither API → 'unavailable'", async () => {
    stubNavigator({ clipboard: { writeText: async () => { throw new Error("denied"); } } });
    expect(await sharePublicLink(DATA)).toBe("unavailable");
    stubNavigator({});
    expect(await sharePublicLink(DATA)).toBe("unavailable");
  });

  it("never throws, even when the APIs throw synchronously", async () => {
    stubNavigator({ share: () => { throw new TypeError("bad"); }, clipboard: { writeText: () => { throw new Error("sync"); } } });
    await expect(sharePublicLink(DATA)).resolves.toBe("unavailable");
  });
});

describe("copyToClipboard", () => {
  it("true when written, false when missing or refused", async () => {
    stubNavigator({ clipboard: { writeText: async () => {} } });
    expect(await copyToClipboard("x")).toBe(true);
    stubNavigator({ clipboard: { writeText: async () => { throw new Error("no"); } } });
    expect(await copyToClipboard("x")).toBe(false);
    stubNavigator({});
    expect(await copyToClipboard("x")).toBe(false);
  });
});
