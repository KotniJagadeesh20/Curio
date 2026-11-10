import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { apiPaths, parseHandle, parseId, paths, USERNAME_PATTERN } from "./paths";

describe("parseHandle", () => {
  it("accepts @username and lowercases it", () => {
    expect(parseHandle("@alice")).toBe("alice");
    expect(parseHandle("@Alice_01")).toBe("alice_01");
  });
  it("rejects anything that is not a valid @handle", () => {
    for (const h of [undefined, "", "alice", "@", "@ab", "@1abc", "@a-b-c", "@al ice", "@" + "a".repeat(31), "@@alice", "tracks"])
      expect(parseHandle(h), String(h)).toBeNull();
  });
});

describe("parseHandle vs backend UsernamePolicy", () => {
  const java = readFileSync(resolve(process.cwd(), "backend/src/main/java/com/codemastery/user/UsernamePolicy.java"), "utf8");
  const format = /Pattern\.compile\("([^"]+)"\)/.exec(java)?.[1];
  const reserved = [...(/RESERVED\s*=\s*Set\.of\(([^;]+)\);/.exec(java)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);

  it("uses exactly the backend's format pattern (drift guard: reads the Java source)", () => {
    expect(format).toBeDefined();
    expect(USERNAME_PATTERN.source).toBe(format);
  });
  it("accepts the length boundaries 3 and 30 and rejects 2 and 31", () => {
    expect(parseHandle("@abc")).toBe("abc");
    expect(parseHandle("@a" + "b".repeat(29))).toHaveLength(30);
    expect(parseHandle("@ab")).toBeNull();
    expect(parseHandle("@a" + "b".repeat(30))).toBeNull();
  });
  it("allows digits and underscores after the first letter, but not first, and nothing else", () => {
    expect(parseHandle("@a_1")).toBe("a_1");
    expect(parseHandle("@a__")).toBe("a__");
    for (const h of ["@_abc", "@1abc", "@a-bc", "@a.bc", "@abc\n", "@ abc", "@abc ", "@ábc", "@日本語abc", "@a%20c"])
      expect(parseHandle(h), JSON.stringify(h)).toBeNull();
  });
  it("is case-insensitive, like the backend's lowercase normalisation", () => {
    expect(parseHandle("@ALICE")).toBe("alice");
  });
  it("reads a non-empty reserved list from the backend", () => {
    expect(reserved.length).toBeGreaterThan(20);
    expect(reserved).toContain("admin");
  });
  it("does not reject reserved names: the backend is authoritative (the seeded admin may own one)", () => {
    const formatValid = reserved.filter((n) => USERNAME_PATTERN.test(n));
    expect(formatValid.length).toBeGreaterThan(20);
    for (const name of formatValid) expect(parseHandle("@" + name), name).toBe(name);
    // reserved names too short for the format ("me") are rejected by the format rule alone, as in the backend
    for (const name of reserved.filter((n) => !USERNAME_PATTERN.test(n))) expect(parseHandle("@" + name), name).toBeNull();
  });
});

describe("parseId", () => {
  it("accepts positive integers only", () => {
    expect(parseId("7")).toBe(7);
    for (const v of [undefined, "", "0", "-1", "01", "1.5", "abc", "1e3", " 1", "9".repeat(20)]) expect(parseId(v), String(v)).toBeNull();
  });
});

describe("browser paths", () => {
  it("builds /@username URLs and encodes segments", () => {
    expect(paths.creatorProfile("alice")).toBe("/@alice");
    expect(paths.collection("alice", "java-notes")).toBe("/@alice/java-notes");
    expect(paths.page("alice", "java", "core", "intro")).toBe("/@alice/java/core/intro");
    expect(paths.collection("a", "x/y?z")).toBe("/@a/x%2Fy%3Fz");
  });
  it("builds the workspace paths", () => {
    expect(paths.workspace()).toBe("/create");
    expect(paths.editCollection(3)).toBe("/create/collections/3");
    expect(paths.editPage(9)).toBe("/create/pages/9");
    expect(paths.profileSettings()).toBe("/settings/profile");
    expect(paths.discover()).toBe("/discover");
  });
});

describe("api paths", () => {
  it("always qualifies a public page with its module", () => {
    expect(apiPaths.publicPage("alice", "java", "core", "intro")).toBe("/public/pages/alice/java/core/intro");
  });
  it("has no builder for the unqualified compatibility route", () => {
    // page slugs are only unique per module: the frontend contract is the module-qualified route
    expect(Object.keys(apiPaths).filter((k) => /page/i.test(k))).toEqual(["publicPage", "modulePages", "page", "pageAction", "pageReorder"]);
    expect(apiPaths.publicPage.length).toBe(4);
  });
  it("encodes segments so a slug can't change the request path", () => {
    expect(apiPaths.publicCollection("a", "../admin")).toBe("/public/collections/a/..%2Fadmin");
  });
  it("builds the listing query only from what is set", () => {
    expect(apiPaths.publicCollections()).toBe("/public/collections");
    expect(apiPaths.publicCollections({ category: "programming", q: "  java ", page: 0, size: 20 }))
      .toBe("/public/collections?category=programming&q=java&page=0&size=20");
    expect(apiPaths.publicCollections({ q: "  " })).toBe("/public/collections");
  });
  it("builds the workspace API paths", () => {
    expect(apiPaths.myCollections()).toBe("/collections/mine");
    expect(apiPaths.myCollections(true)).toBe("/collections/mine?deleted=true");
    expect(apiPaths.collection(4)).toBe("/collections/4");
    expect(apiPaths.page(5)).toBe("/pages/5");
  });
});
