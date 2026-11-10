import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Step 8a removed the backend's /api/admin track/section/lesson endpoints (they bypassed ownership). This keeps the
 * frontend from ever calling them again: any such path in non-test source fails the build.
 */
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

describe("no frontend call to the removed legacy admin content routes", () => {
  const files = walk(resolve(process.cwd(), "src")).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

  it("scans real source files", () => expect(files.length).toBeGreaterThan(50));

  it("has no /admin/tracks, /admin/sections or /admin/lessons API path", () => {
    const offenders = files.filter((f) => /\/admin\/(tracks|sections|lessons)\b/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("only the problem, user and category admin APIs remain in the admin hooks", () => {
    const src = readFileSync(resolve(process.cwd(), "src/hooks/useAdmin.ts"), "utf8");
    const paths = [...src.matchAll(/["`]\/admin\/([a-z]+)/g)].map((m) => m[1]);
    expect(new Set(paths)).toEqual(new Set(["problems", "users"]));
  });
});
