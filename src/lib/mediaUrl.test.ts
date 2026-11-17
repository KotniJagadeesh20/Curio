import { describe, expect, it } from "vitest";
import { publicMediaSrc } from "./mediaUrl";

const MEDIA = "/api/public/media/00bf49af-3982-4620-9eba-df606ef8db33";

describe("publicMediaSrc", () => {
  it("same-origin deployment (empty or missing VITE_API_URL): public media stays site-relative", () => {
    expect(publicMediaSrc(MEDIA, "")).toBe(MEDIA);
    expect(publicMediaSrc(MEDIA, undefined)).toBe(MEDIA);
    expect(publicMediaSrc(`${MEDIA}/thumb`, "")).toBe(`${MEDIA}/thumb`);
  });

  it("separate API origin: public media is prefixed with the base", () => {
    expect(publicMediaSrc(MEDIA, "https://api.example.com")).toBe(`https://api.example.com${MEDIA}`);
    expect(publicMediaSrc(`${MEDIA}/thumb`, "https://api.example.com")).toBe(`https://api.example.com${MEDIA}/thumb`);
  });

  it("a trailing slash on the base is ignored", () => {
    expect(publicMediaSrc(MEDIA, "https://api.example.com/")).toBe(`https://api.example.com${MEDIA}`);
    expect(publicMediaSrc(MEDIA, "https://api.example.com//")).toBe(`https://api.example.com${MEDIA}`);
  });

  it("never doubles /api when the base already ends with it", () => {
    expect(publicMediaSrc(MEDIA, "https://api.example.com/api")).toBe(`https://api.example.com${MEDIA}`);
    expect(publicMediaSrc(MEDIA, "https://api.example.com/api/")).toBe(`https://api.example.com${MEDIA}`);
  });

  it("does not rewrite absolute external links or other site paths", () => {
    expect(publicMediaSrc("https://images.example.org/cover.jpg", "https://api.example.com")).toBe("https://images.example.org/cover.jpg");
    expect(publicMediaSrc("/img/cover.png", "https://api.example.com")).toBe("/img/cover.png");
    // only the exact public prefix counts, not lookalikes
    expect(publicMediaSrc("/api/public/mediax/1", "https://api.example.com")).toBe("/api/public/mediax/1");
  });

  it("never produces the owner-only media endpoint, and leaves it unrewritten if the API ever sent one", () => {
    expect(publicMediaSrc("/api/media/abc/content", "https://api.example.com")).toBe("/api/media/abc/content");
    expect(publicMediaSrc(MEDIA, "https://api.example.com")).not.toContain("/content");
  });

  it("refuses blank and unsafe URLs", () => {
    for (const bad of [null, undefined, "", "   ", "javascript:alert(1)", "http://example.com/a.png", "//evil.example/x.png", "/\\\\evil", "https://user:pw@example.com/a.png", "data:image/png;base64,AAAA"]) {
      expect(publicMediaSrc(bad as string | null | undefined, "https://api.example.com")).toBeNull();
    }
  });
});
