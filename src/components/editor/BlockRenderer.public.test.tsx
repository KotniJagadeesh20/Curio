// Step 14c: BlockRenderer's public mode. Kept in its own file because it spies on the owner-media fetch module.
import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Block } from "@/lib/blocks";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
const fetchOwnerMedia = vi.hoisted(() => vi.fn(() => new Promise<Blob>(() => {})));
vi.mock("@/lib/media", async (orig) => ({ ...(await orig<typeof import("@/lib/media")>()), fetchOwnerMedia }));
import { BlockRenderer } from "./BlockRenderer";

const img = (o: Record<string, unknown>): Block => ({ id: "i", type: "image", caption: "Example image", ...o } as unknown as Block);
const pub = (b: Block) => render(<BlockRenderer blocks={[b]} mode="public" />);
let fetchSpy: ReturnType<typeof vi.fn>;
const ownerMediaRequests = () => fetchSpy.mock.calls.filter(([u]) => /\/api\/media\//.test(String(u)) || /^\/media\//.test(String(u)));
const noOwnerMediaInDom = (c: HTMLElement) => expect(c.querySelector('img[src*="/api/media/"], img[src^="blob:"]')).toBeNull();

beforeEach(() => {
  fetchOwnerMedia.mockClear();
  fetchSpy = vi.fn(async () => new Response("{}"));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("BlockRenderer public mode: owner media is never requested", () => {
  it.each([
    "/api/media/123/content",
    "/api/media/123",
    "/api/media/123/content?variant=thumb",
    "/%61pi/media/123/content",
    "/api/public/../media/123/content",
    "/api%2Fmedia/123/content",
    "/images/other-site-path.png",
  ])("an image with url %s renders nothing, never calls fetchOwnerMedia, and requests no /api/media/*", (url) => {
    const { container } = pub(img({ url }));
    expect(container.querySelector("img, figure")).toBeNull();
    expect(fetchOwnerMedia).not.toHaveBeenCalled();
    expect(ownerMediaRequests()).toEqual([]);
    noOwnerMediaInDom(container);
  });

  it("the same on this app's own origin and the API's origin, however the path is spelled", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com");
    for (const url of [
      "https://api.example.com/api/media/123/content",
      "https://api.example.com/%61pi/media/123/content",
      "https://api.example.com/foo/../api/media/123/content",
      "https://api.example.com/api%2Fmedia/123/content",
      "https://API.example.com/api/media/123/content",
    ]) {
      const { container, unmount } = pub(img({ url }));
      expect(container.querySelector("img"), url).toBeNull();
      unmount();
    }
    expect(fetchOwnerMedia).not.toHaveBeenCalled();
    expect(ownerMediaRequests()).toEqual([]);
  });

  it("an assetId-only image, or assetId with an owner URL, renders nothing (no OwnerImage fallback)", () => {
    for (const b of [img({ assetId: "123", url: "" }), img({ assetId: "123" }), img({ assetId: "123", url: "/api/media/123/content" })]) {
      const { container, unmount } = pub(b);
      expect(container.querySelector("img, figure")).toBeNull();
      noOwnerMediaInDom(container);
      unmount();
    }
    expect(fetchOwnerMedia).not.toHaveBeenCalled();
    expect(ownerMediaRequests()).toEqual([]);
  });

  it("control: owner mode (the default) still uses OwnerImage for an assetId-only block, so the spy above is live", () => {
    render(<BlockRenderer blocks={[img({ assetId: "123", url: "" })]} />);
    expect(fetchOwnerMedia).toHaveBeenCalledWith("123", "original", expect.anything());
  });
});

describe("BlockRenderer public mode: valid images still render", () => {
  it("a public media URL renders, site-relative without an API base", () => {
    const { container } = pub(img({ url: "/api/public/media/abc" }));
    const el = container.querySelector("img")!;
    expect(el.getAttribute("src")).toBe("/api/public/media/abc");
    expect(el.getAttribute("alt")).toBe("Example image");
    expect(el.getAttribute("loading")).toBe("lazy");
    expect(el.getAttribute("decoding")).toBe("async");
    expect(container.querySelector("figcaption")).toHaveTextContent("Example image");
  });

  it("a public media URL keeps the API-base prefix", () => {
    vi.stubEnv("VITE_API_URL", "https://api.example.com/api");
    const { container } = pub(img({ url: "/api/public/media/abc/thumb" }));
    expect(container.querySelector("img")!.getAttribute("src")).toBe("https://api.example.com/api/public/media/abc/thumb");
  });

  it("uploaded images reserve their space with width/height from the public API", () => {
    const { container } = pub(img({ url: "/api/public/media/abc", width: 1200, height: 800 }));
    const el = container.querySelector("img")!;
    expect(el.getAttribute("width")).toBe("1200");
    expect(el.getAttribute("height")).toBe("800");
  });

  it("invalid dimensions are not used", () => {
    for (const [width, height] of [[0, 800], [-5, 800], [Number.NaN, 800], ["1200", 800], [1200, undefined]]) {
      const { container, unmount } = pub(img({ url: "/api/public/media/abc", width, height }));
      const el = container.querySelector("img")!;
      expect(el.hasAttribute("width")).toBe(false);
      expect(el.hasAttribute("height")).toBe(false);
      unmount();
    }
  });

  it("a valid external image renders, without dimensions", () => {
    const { container } = pub(img({ url: "https://images.example.org/photo.jpg" }));
    const el = container.querySelector("img")!;
    expect(el.getAttribute("src")).toBe("https://images.example.org/photo.jpg");
    expect(el.hasAttribute("width")).toBe(false);
    expect(fetchOwnerMedia).not.toHaveBeenCalled();
  });

  it("an unsafe external URL renders nothing", () => {
    for (const url of ["http://images.example.org/a.png", "javascript:alert(1)", "https://localhost/a.png"]) {
      const { container, unmount } = pub(img({ url }));
      expect(container.querySelector("img")).toBeNull();
      unmount();
    }
  });
});

describe("BlockRenderer public mode: every other block renders exactly as in owner mode", () => {
  const others: Block[] = [
    { id: "a", type: "heading", level: 2, text: "H2" },
    { id: "b", type: "heading", level: 3, text: "H3" },
    { id: "c", type: "text", text: "plain\ntext" },
    { id: "d", type: "text", text: "rich", doc: [{ type: "paragraph", children: [{ text: "rich", bold: true }] }] },
    { id: "e", type: "code", code: "x = 1", language: "python", caption: "cap" },
    { id: "f", type: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "v" },
    { id: "g", type: "html", html: "<p>x</p>", height: 300 },
    { id: "h", type: "svg", svg: "<svg xmlns='http://www.w3.org/2000/svg'/>", caption: "s" },
    { id: "i", type: "callout", variant: "warning", text: "careful" },
    { id: "j", type: "table", hasHeader: true, caption: "t", rows: [["a", "b"], ["c", "d"]] },
    { id: "k", type: "divider" },
  ];
  it.each(others.map((b) => [b.type + ":" + b.id, b] as const))("%s", (_n, b) => {
    const owner = render(<BlockRenderer blocks={[b]} />).container.innerHTML;
    const pubHtml = render(<BlockRenderer blocks={[b]} mode="public" />).container.innerHTML;
    expect(pubHtml).toBe(owner);
  });
});
