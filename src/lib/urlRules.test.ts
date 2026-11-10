import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_URL_LENGTH, embedUrl, isBlankUrl, isSafeUrl, urlProblem } from "./urlRules";

// the same file drives backend UrlRulesTest
const V = JSON.parse(readFileSync(resolve(__dirname, "../../shared/url-vectors.json"), "utf8")) as {
  accept: string[]; reject: string[]; blank: string[]; embed: { input: string; expected: string | null }[];
};
const BASE = "https://app.example";

describe("url rule (shared vectors)", () => {
  it.each(V.accept)("accepts %j", (u) => { expect(urlProblem(u)).toBeNull(); expect(isSafeUrl(u)).toBe(true); });
  it.each(V.reject)("rejects %j", (u) => { expect(urlProblem(u)).not.toBeNull(); expect(isSafeUrl(u)).toBe(false); });
  it("a blank link is fine in a draft but never rendered", () => {
    for (const u of V.blank) { expect(isBlankUrl(u)).toBe(true); expect(urlProblem(u)).toBeNull(); expect(isSafeUrl(u)).toBe(false); }
    expect(urlProblem(null)).toBeNull();
  });
  it("is length-capped", () => {
    expect(urlProblem("https://example.com/" + "a".repeat(MAX_URL_LENGTH))).not.toBeNull();
    expect(urlProblem("https://example.com/" + "a".repeat(MAX_URL_LENGTH - 20))).toBeNull();
  });
});

describe("agreement with the browser's own URL parser", () => {
  it("every accepted relative path stays on the site's origin", () => {
    for (const u of V.accept.filter((x) => x.startsWith("/"))) expect(new URL(u, BASE).origin, u).toBe(BASE);
  });
  it("every accepted absolute link is https on the host we validated", () => {
    for (const u of V.accept.filter((x) => !x.startsWith("/"))) {
      const p = new URL(u, BASE);
      expect(p.protocol, u).toBe("https:");
      expect(p.username + p.password, u).toBe("");
    }
  });
  it("the dangerous forms the rule refuses really would leave the site or run code in a browser", () => {
    // documents WHY the vectors are refused: "//x", "/\x" and "\\x" resolve to another origin; javascript:/data: are not http(s)
    for (const u of ["//evil.com/x", "/\\evil.com", "\\\\evil.com"]) expect(new URL(u, BASE).origin, u).not.toBe(BASE);
    for (const u of ["javascript:alert(1)", "data:text/html,x"]) expect(new URL(u, BASE).protocol, u).not.toBe("https:");
  });
});

describe("embedUrl (exact hosts, built from the validated id)", () => {
  it.each(V.embed)("$input -> $expected", ({ input, expected }) => { expect(embedUrl(input)).toBe(expected); });
});
