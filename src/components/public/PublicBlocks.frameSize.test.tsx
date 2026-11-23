// Step 14d-3 review correction (finding 1): settling doesn't wait for iframes because every iframe the public renderer
// produces has its box fixed by our own markup before its document loads. An iframe's box never depends on its document
// (iframes don't size to content; the HTML blocks' documents are sandboxed with no scripts, so they can't ask to be
// resized either). This pins the markup that makes that true; t14d3c.mjs C1 measures it in Chrome.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StoredBlock } from "@/lib/types";
import { HTML_FRAME_DEFAULT_HEIGHT, HTML_FRAME_MAX_HEIGHT, HTML_FRAME_MIN_HEIGHT } from "@/lib/htmlFrame";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: () => <pre /> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
import { PublicBlocks } from "./PublicBlocks";

const frames = (blocks: unknown[]) =>
  Array.from(render(<PublicBlocks page={{ blocks: blocks as StoredBlock[], legacy: null }} />).container.querySelectorAll("iframe"));

describe("public iframes reserve their box before loading", () => {
  it.each([
    ["YouTube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
    ["youtu.be", "https://youtu.be/dQw4w9WgXcQ"],
    ["Vimeo", "https://vimeo.com/76979871"],
  ])("video embed (%s): full width with a fixed 16:9 aspect ratio, no content-dependent size", (_n, url) => {
    const [f] = frames([{ type: "video", url, caption: "" }]);
    expect(f).toBeDefined();
    expect(f.className.split(" ")).toEqual(expect.arrayContaining(["w-full", "aspect-video"]));
    expect(f.hasAttribute("height")).toBe(false);             // nothing that could compete with the aspect ratio
  });

  it.each([
    [200, "200px"],
    [undefined, `${HTML_FRAME_DEFAULT_HEIGHT}px`],
    [5, `${HTML_FRAME_MIN_HEIGHT}px`],
    [99999, `${HTML_FRAME_MAX_HEIGHT}px`],
  ])("HTML block (height %s): an explicit inline height (%s), sandboxed without scripts", (height, css) => {
    const [f] = frames([{ type: "html", html: "<div style='height:3000px'>tall</div>", ...(height === undefined ? {} : { height }) }]);
    expect(f.style.height).toBe(css);
    expect(f.getAttribute("sandbox")).toBe("");                 // no allow-scripts: the document can't resize anything
  });

  it("the renderer produces no other iframe kinds (a non-embeddable video URL is a <video>, not an iframe)", () => {
    const all = frames([
      { type: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "" },
      { type: "video", url: "https://cdn.example.org/clip.mp4", caption: "" },
      { type: "html", html: "<p>x</p>" },
    ]);
    expect(all).toHaveLength(2);
  });
});
