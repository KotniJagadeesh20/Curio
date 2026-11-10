import { describe, expect, it } from "vitest";
import { hasErrors, LIMITS, slugify, validateCollection, validateModule, validatePage } from "./creator-validation";

describe("slugify", () => {
  it("makes URL names the backend accepts", () => {
    expect(slugify("  Hello, World!  ")).toBe("hello-world");
    expect(slugify("Java 17 — Streams")).toBe("java-17-streams");
    expect(slugify("---")).toBe("");
  });
  it("respects the 60 character limit without leaving a trailing hyphen", () => {
    const s = slugify("a".repeat(59) + " b");
    expect(s.length).toBeLessThanOrEqual(LIMITS.slug);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("validateCollection", () => {
  it("accepts a minimal collection", () => expect(hasErrors(validateCollection({ title: "Java" }))).toBe(false));
  it("requires a title (whitespace is blank) and caps its length", () => {
    expect(validateCollection({ title: "   " }).title).toBeTruthy();
    expect(validateCollection({ title: "x".repeat(161) }).title).toBeTruthy();
    expect(validateCollection({ title: "x".repeat(160) }).title).toBeUndefined();
  });
  it.each(["Bad Slug", "UPPER", "-lead", "trail-", "dou--ble", "under_score", "a".repeat(61)])("rejects slug %s", (slug) => {
    expect(validateCollection({ title: "T", slug }).slug).toBeTruthy();
  });
  it.each(["a", "java-basics", "a1-b2", "a".repeat(60)])("accepts slug %s", (slug) => {
    expect(validateCollection({ title: "T", slug }).slug).toBeUndefined();
  });
  it("only accepts https cover links (matching the server's UrlPolicy)", () => {
    for (const bad of ["http://x.com/a.png", "javascript:alert(1)", "ftp://x.com", "x.com/a.png", "https://", "https://u@x.com"]) {
      expect(validateCollection({ title: "T", coverUrl: bad }).coverUrl, bad).toBeTruthy();
    }
    expect(validateCollection({ title: "T", coverUrl: "https://cdn.example.com/a.png" }).coverUrl).toBeUndefined();
    expect(validateCollection({ title: "T", coverUrl: "" }).coverUrl).toBeUndefined();
  });
  it("caps description and cover length", () => {
    expect(validateCollection({ title: "T", description: "x".repeat(5001) }).description).toBeTruthy();
    expect(validateCollection({ title: "T", coverUrl: "https://x.com/" + "a".repeat(500) }).coverUrl).toBeTruthy();
  });
});

describe("validateModule / validatePage", () => {
  it("module: title and slug rules", () => {
    expect(validateModule({ title: "" }).title).toBeTruthy();
    expect(validateModule({ title: "M", slug: "Bad" }).slug).toBeTruthy();
    expect(hasErrors(validateModule({ title: "M", slug: "ok-slug" }))).toBe(false);
  });
  it("page: title up to 200, summary up to 2000", () => {
    expect(validatePage({ title: "x".repeat(201) }).title).toBeTruthy();
    expect(validatePage({ title: "x".repeat(200) }).title).toBeUndefined();
    expect(validatePage({ title: "P", summary: "x".repeat(2001) }).summary).toBeTruthy();
  });
});

import { coverFields } from "./creator-validation";

describe("coverFields (the cover contract: never both fields)", () => {
  const A = "a-id", B = "b-id";
  const cases: [string, { coverAssetId: string | null }, { coverUrl: string; coverAssetId: string | null }, Record<string, unknown>][] = [
    ["new upload", { coverAssetId: null }, { coverUrl: "", coverAssetId: A }, { coverAssetId: A }],
    ["upload replaces a typed link", { coverAssetId: null }, { coverUrl: "https://x/old.png", coverAssetId: A }, { coverAssetId: A }],
    ["stored upload kept", { coverAssetId: A }, { coverUrl: "", coverAssetId: A }, {}],
    ["stored upload replaced", { coverAssetId: A }, { coverUrl: "", coverAssetId: B }, { coverAssetId: B }],
    ["stored upload removed", { coverAssetId: A }, { coverUrl: "", coverAssetId: null }, { coverAssetId: null }],
    ["link typed over a stored upload", { coverAssetId: A }, { coverUrl: " https://x/n.png ", coverAssetId: null }, { coverUrl: "https://x/n.png" }],
    ["link only", { coverAssetId: null }, { coverUrl: "https://x/n.png", coverAssetId: null }, { coverUrl: "https://x/n.png" }],
    ["nothing at all clears the link", { coverAssetId: null }, { coverUrl: "", coverAssetId: null }, { coverUrl: "" }],
  ];
  it.each(cases)("%s", (_n, initial, now, expected) => {
    const out = coverFields(initial, now);
    expect(out).toEqual(expected);
    expect("coverAssetId" in out && "coverUrl" in out).toBe(false);
  });
});
