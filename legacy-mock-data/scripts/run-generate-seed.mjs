import { build } from "esbuild";
import { pathToFileURL } from "node:url";
import fs from "node:fs";
import path from "node:path";

fs.mkdirSync("node_modules/.cache", { recursive: true });
const outfile = path.resolve("node_modules/.cache/generate-seed.bundle.mjs");
await build({
  entryPoints: ["scripts/generate-seed.ts"],
  bundle: true, platform: "node", format: "esm", packages: "external", outfile,
  alias: { "@": "./src" },
});
await import(pathToFileURL(outfile).href);
