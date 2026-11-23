import { afterEach, describe, expect, it, vi } from "vitest";
import { isPublicImageUrl, ownOrigins, publicImageSrc, sanitizeLegacy, sanitizePublicBlocks } from "@/lib/publicBlocks";
import { legacyToBlocks, normalizeBlocks } from "@/lib/blocks";

const APP = "https://app.example.com";
const API = "https://api.example.com";
const OWN = [APP, API];
const sanitize = (raw: unknown) => sanitizePublicBlocks(raw, OWN);
const one = (b: unknown) => sanitize([b]);

afterEach(() => { vi.unstubAllEnvs(); });

// ---------------------------------------------------------------------------------------------------------------------
// C1: public image URLs
// ---------------------------------------------------------------------------------------------------------------------
describe("isPublicImageUrl", () => {
  it.each([
    "/api/public/media/3f2a9c1e-1b2c-4d5e-8f90-123456789abc",
    "/api/public/media/3f2a9c1e-1b2c-4d5e-8f90-123456789abc/thumb",
    "/api/public/media/abc",
    "https://images.example.org/photo.jpg",
    "https://cdn.example.net/a/b.png?w=800#x",
    `${APP}/api/public/media/abc`,
    `${API}/api/public/media/abc/thumb`,
  ])("allows %s", (u) => expect(isPublicImageUrl(u, OWN)).toBe(true));

  it.each([
    // the owner-only endpoint and other owner media paths, relative
    "/api/media/123/content",
    "/api/media/123",
    "/api/media/123/thumb",
    "/api/media",
    // any other site path, and every non-exact spelling of the public one
    "/images/a.png",
    "/api/public/media/",
    "/api/public/media/abc/content",
    "/api/public/media/abc?x=1",
    "/api/public/media/abc#x",
    "/api/public/media/abc/",
    "/api/public/media/../../media/1/content",
    "/api/public/media/%2e%2e/%2e%2e/media/1/content",
    "/api/public/media/abc%2Fthumb",
    "/API/PUBLIC/MEDIA/abc",
    "/API/media/1/content",
    "/api/public/../media/1/content",
    "/%61pi/media/1/content",
    "/api%2Fmedia/1/content",
    "//evil.example.org/api/media/1/content",
    "/\\evil.example.org/x",
    // owner media (or anything but the exact public path) on this app's own origins, however it is spelled
    `${APP}/api/media/123/content`,
    `${API}/api/media/123/content`,
    `${APP}/%61pi/media/123/content`,
    `${APP}/foo/../api/media/123/content`,
    `${APP}/api%2Fmedia/123/content`,
    `${APP}/api/public/media/abc/../../../media/1/content`,
    `${APP}/api/public/media/abc?redirect=/api/media/1/content`,
    `${APP}/API/MEDIA/1/content`,
    "https://APP.example.com/api/media/1/content",
    "https://app.example.com:443/api/media/1/content",
    `${APP}/images/a.png`,
    `${APP}`,
    // things the shared URL rule already refuses
    "http://images.example.org/a.png",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "https://localhost/a.png",
    "https://127.0.0.1/a.png",
    "",
    "   ",
  ])("rejects %s", (u) => expect(isPublicImageUrl(u, OWN)).toBe(false));

  it("rejects non-strings", () => {
    for (const u of [undefined, null, 5, {}, ["/api/public/media/a"], true]) expect(isPublicImageUrl(u, OWN)).toBe(false);
  });

  it("by default treats the page's own origin and VITE_API_URL's origin as this app", () => {
    expect(ownOrigins("https://api.example.com/api")).toEqual(expect.arrayContaining([window.location.origin.toLowerCase(), API]));
    expect(ownOrigins(undefined)).toEqual([window.location.origin.toLowerCase()]);
    expect(ownOrigins("not a url")).toEqual([window.location.origin.toLowerCase()]);
  });
});

describe("publicImageSrc", () => {
  it("keeps the API-base prefix for public media and leaves external images alone", () => {
    expect(publicImageSrc("/api/public/media/abc", "https://api.example.com/api/")).toBe("https://api.example.com/api/public/media/abc");
    expect(publicImageSrc("/api/public/media/abc", undefined)).toBe("/api/public/media/abc");
    expect(publicImageSrc("https://images.example.org/a.png", undefined)).toBe("https://images.example.org/a.png");
  });

  it("never produces an owner-media URL", () => {
    expect(publicImageSrc("/api/media/123/content", "https://api.example.com")).toBeNull();
    expect(publicImageSrc("https://api.example.com/api/media/123/content", "https://api.example.com")).toBeNull();
    expect(publicImageSrc("https://api.example.com/%61pi/media/123/content", "https://api.example.com")).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------------------------------------------------
describe("sanitizePublicBlocks: image", () => {
  it("drops an image with an owner-media URL, even with a caption", () => {
    expect(one({ type: "image", url: "/api/media/123/content", caption: "Example image" })).toEqual([]);
    expect(one({ type: "image", url: `${APP}/api/media/123/content`, caption: "x" })).toEqual([]);
    expect(one({ type: "image", url: `${APP}/foo/../api/media/123/content`, caption: "x" })).toEqual([]);
  });

  it("drops an assetId-only image and an image whose assetId comes with an owner URL (no owner-media fallback)", () => {
    expect(one({ type: "image", assetId: "123", caption: "x" })).toEqual([]);
    expect(one({ type: "image", assetId: "123", url: "", caption: "x" })).toEqual([]);
    expect(one({ type: "image", assetId: "123", url: "/api/media/123/content", caption: "x" })).toEqual([]);
  });

  it("keeps a public-media image and an external image, and strips assetId", () => {
    expect(one({ type: "image", url: "/api/public/media/abc", caption: "Tram", assetId: "abc", width: 800, height: 600 }))
      .toEqual([{ id: "b0", type: "image", url: "/api/public/media/abc", caption: "Tram", width: 800, height: 600 }]);
    expect(one({ type: "image", url: "https://images.example.org/a.png" }))
      .toEqual([{ id: "b0", type: "image", url: "https://images.example.org/a.png", caption: "" }]);
  });

  it.each([
    [0, 600], [-1, 600], [800, 0], [Number.NaN, 600], [Number.POSITIVE_INFINITY, 600], ["800", 600], [800, null], [800, undefined],
  ])("omits dimensions unless both are positive finite numbers (%s × %s)", (width, height) => {
    const [b] = one({ type: "image", url: "/api/public/media/abc", caption: "", width, height });
    expect(b).toEqual({ id: "b0", type: "image", url: "/api/public/media/abc", caption: "" });
  });

  it("drops an image with a wrong-typed url or caption", () => {
    expect(one({ type: "image", url: 5, caption: "" })).toEqual([]);
    expect(one({ type: "image", url: "/api/public/media/a", caption: 5 })).toEqual([]);
  });
});

describe("sanitizePublicBlocks: fixed-value fields (C2)", () => {
  it("heading level: only the numbers 2 or 3; anything else becomes 2", () => {
    expect(one({ type: "heading", level: 3, text: "H" })[0]).toMatchObject({ level: 3 });
    expect(one({ type: "heading", level: 2, text: "H" })[0]).toMatchObject({ level: 2 });
    for (const level of [1, 4, 6, 0, -2, 2.5, "3", "2", null, undefined, Number.NaN, {}]) {
      expect(one({ type: "heading", level, text: "H" }), String(level)).toEqual([{ id: "b0", type: "heading", level: 2, text: "H" }]);
    }
  });

  it("heading with invalid text is dropped", () => {
    expect(one({ type: "heading", level: 2, text: 5 })).toEqual([]);
    expect(one({ type: "heading", level: 2 })).toEqual([]);
  });

  it("callout variant: only info, tip or warning; anything else becomes info", () => {
    for (const v of ["info", "tip", "warning"]) expect(one({ type: "callout", variant: v, text: "t" })[0]).toMatchObject({ variant: v });
    for (const variant of ["danger", "INFO", "Tip", "", 1, null, undefined, "__proto__", "constructor", ["tip"]]) {
      expect(one({ type: "callout", variant, text: "t" }), String(variant)).toEqual([{ id: "b0", type: "callout", variant: "info", text: "t" }]);
    }
  });

  it("callout with invalid text is dropped", () => {
    expect(one({ type: "callout", variant: "tip", text: ["x"] })).toEqual([]);
  });

  it("table: must pass isWellFormedTable", () => {
    expect(one({ type: "table", rows: [["a", "b"], ["c", "d"]], hasHeader: true, caption: "Cap" }))
      .toEqual([{ id: "b0", type: "table", rows: [["a", "b"], ["c", "d"]], hasHeader: true, caption: "Cap" }]);
    expect(one({ type: "table", rows: [["a"]] })).toEqual([{ id: "b0", type: "table", rows: [["a"]], hasHeader: false, caption: "" }]);
    for (const bad of [
      { rows: [] }, { rows: [["a", "b"], ["c"]] }, { rows: [[1]] }, { rows: "x" }, { rows: [["a"]], hasHeader: "yes" }, { rows: [["a"]], caption: 3 }, {},
    ]) expect(one({ type: "table", ...bad }), JSON.stringify(bad)).toEqual([]);
  });
});

describe("sanitizePublicBlocks: other fields", () => {
  it.each([
    ["code", { type: "code", code: 5 }],
    ["code language", { type: "code", code: "x", language: 3 }],
    ["code caption", { type: "code", code: "x", caption: {} }],
    ["text", { type: "text", text: null }],
    ["text missing", { type: "text" }],
    ["video", { type: "video", url: ["https://x.example.com"] }],
    ["video caption", { type: "video", url: "https://x.example.com/v.mp4", caption: 1 }],
    ["html", { type: "html", html: 1 }],
    ["html height", { type: "html", html: "<p>", height: "200" }],
    ["svg", { type: "svg", svg: false }],
    ["unknown type", { type: "quiz", text: "x" }],
    ["no type", { text: "x" }],
  ])("drops a malformed %s block", (_n, b) => expect(one(b)).toEqual([]));

  it("drops non-objects and returns [] for a non-array", () => {
    expect(sanitize([null, 5, "x", [], undefined])).toEqual([]);
    for (const raw of [null, undefined, {}, "[]", 5]) expect(sanitize(raw)).toEqual([]);
  });

  it("fills documented defaults for missing optional fields", () => {
    expect(one({ type: "code", code: "x" })).toEqual([{ id: "b0", type: "code", code: "x", language: "", caption: "" }]);
    expect(one({ type: "video", url: "https://x.example.com/v.mp4" })).toEqual([{ id: "b0", type: "video", url: "https://x.example.com/v.mp4", caption: "" }]);
    expect(one({ type: "svg", svg: "<svg/>" })).toEqual([{ id: "b0", type: "svg", svg: "<svg/>", caption: "" }]);
    expect(one({ type: "html", html: "<p>" })).toEqual([{ id: "b0", type: "html", html: "<p>", height: undefined }]);
    expect(one({ type: "divider", junk: 1 })).toEqual([{ id: "b0", type: "divider" }]);
  });

  it("text: a valid doc is kept, an invalid doc is ignored (plain text shown)", () => {
    const doc = [{ type: "paragraph", children: [{ text: "hi", bold: true }] }];
    expect(one({ type: "text", text: "hi", doc })).toEqual([{ id: "b0", type: "text", text: "hi", doc }]);
    const invalid = one({ type: "text", text: "hi", doc: { type: "nope" } });
    expect(invalid).toEqual([{ id: "b0", type: "text", text: "hi" }]);
  });

  it("one malformed block doesn't drop its valid neighbors; order is kept", () => {
    const out = sanitize([
      { type: "heading", level: 2, text: "A" },
      { type: "code", code: 42 },
      { type: "image", url: "/api/media/1/content", caption: "" },
      { type: "callout", variant: "tip", text: "B" },
    ]);
    expect(out.map((b) => b.type)).toEqual(["heading", "callout"]);
  });

  it("keeps only known fields (extra fields never reach the renderer)", () => {
    const [b] = one({ type: "heading", level: 2, text: "H", onClick: "x", dangerouslySetInnerHTML: { __html: "<b>" } });
    expect(Object.keys(b).sort()).toEqual(["id", "level", "text", "type"]);
  });

  it("does not mutate its input", () => {
    const raw = [{ type: "image", url: "/api/public/media/a", caption: "c", assetId: "a", width: 1, height: 2 }, { type: "heading", level: 9, text: "H" }];
    const copy = structuredClone(raw);
    sanitize(raw);
    expect(raw).toEqual(copy);
  });

  it("leaves the editor's normalizeBlocks behavior unchanged (it still keeps what public validation drops)", () => {
    expect(normalizeBlocks([{ type: "heading", level: 9, text: "H" }])[0]).toMatchObject({ level: 9 });
    expect(normalizeBlocks([{ type: "image", url: "/api/media/1/content", caption: "" }])).toHaveLength(1);
  });
});

describe("sanitizeLegacy", () => {
  it("turns wrong-typed legacy fields into empty ones so legacyToBlocks can't throw", () => {
    const l = sanitizeLegacy({ concept: 5, realWorld: null, commonMistakes: "x", bestPractices: ["ok", 3], interviewRelevance: {}, codeLanguage: 1, codeExample: ["x"] });
    expect(l).toEqual({ concept: "", realWorld: "", commonMistakes: [], bestPractices: ["ok"], interviewRelevance: "", codeLanguage: null, codeExample: null });
    expect(() => legacyToBlocks(l)).not.toThrow();
    expect(() => legacyToBlocks(sanitizeLegacy(null))).not.toThrow();
  });
});
