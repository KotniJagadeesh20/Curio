import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HTML_FRAME_CSP, HTML_FRAME_MAX_HEIGHT, HTML_FRAME_MIN_HEIGHT, htmlFrameDocument, htmlFrameHeight } from "@/lib/htmlFrame";
import type { Block } from "@/lib/blocks";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
import { BlockRenderer } from "./BlockRenderer";

const V = JSON.parse(readFileSync(resolve(__dirname, "../../../shared/url-vectors.json"), "utf8")) as { accept: string[]; reject: string[]; embed: { input: string; expected: string | null }[] };
const html = (h: string, height = 200): Block => ({ id: "h", type: "html", html: h, height });
const show = (b: Block) => render(<BlockRenderer blocks={[b]} />);

describe("HTML block isolation", () => {
  it("is a fully sandboxed iframe: sandbox is present and EMPTY (no allow-scripts, allow-same-origin, allow-forms, allow-popups, ...)", () => {
    const { container } = show(html("<p>hi</p>"));
    const f = container.querySelector("iframe")!;
    expect(f.hasAttribute("sandbox")).toBe(true);
    expect(f.getAttribute("sandbox")).toBe("");
    expect(f.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(f.getAttribute("src")).toBeNull();                       // srcdoc only: never a URL the author controls
  });

  it("the creator's markup is rendered only through srcdoc, never inserted into the app's own DOM", () => {
    const { container } = show(html("<script>window.pwned=1</script><img src=x onerror='window.pwned=1'><b id='mine'>x</b>"));
    expect(container.querySelector("#mine")).toBeNull();
    expect(container.querySelector("script, img[onerror]")).toBeNull();
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
  });

  it("the iframe's srcdoc IS our fixed document (CSP first), not the creator's markup", () => {
    for (const markup of ["<p>hi</p>", "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src *\"><script>1</script>"]) {
      const { container, unmount } = show(html(markup));
      const srcdoc = container.querySelector("iframe")!.getAttribute("srcdoc")!;
      expect(srcdoc).toBe(htmlFrameDocument(markup));
      const parsed = new DOMParser().parseFromString(srcdoc, "text/html");
      expect(parsed.head.firstElementChild!.getAttribute("content")).toBe(HTML_FRAME_CSP);
      unmount();
    }
  });

  it("the CSP allows no script and no network of any kind", () => {
    const directives = Object.fromEntries(HTML_FRAME_CSP.split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));
    for (const d of ["default-src", "script-src", "connect-src", "form-action", "frame-src", "object-src", "base-uri", "media-src", "font-src"]) expect(directives[d], d).toEqual(["'none'"]);
    expect(directives["img-src"]).toEqual(["data:"]);
    expect(directives["style-src"]).toEqual(["'unsafe-inline'"]);
    expect(HTML_FRAME_CSP).not.toMatch(/https?:|\*|unsafe-eval|unsafe-hashes|blob:|filesystem:/);
  });

  const HOSTILE = [
    "<p>plain</p>",
    "</body></html><meta http-equiv=\"Content-Security-Policy\" content=\"default-src *\">",
    "</head><head><meta http-equiv=\"Content-Security-Policy\" content=\"script-src * 'unsafe-inline'\"></head>",
    "<meta http-equiv=\"refresh\" content=\"0;url=https://evil.example\">",
    "<base href=\"https://evil.example/\"><script src=\"x.js\"></script>",
    "<html><head><meta http-equiv=\"Content-Security-Policy\" content=\"\"></head><body>x</body></html>",
    "<!--  --><!doctype html><meta http-equiv=\"content-security-policy\" content=\"img-src *\">",
    "<style>@import url(https://evil.example/a.css)</style><img src=\"https://evil.example/t.gif\">",
  ];

  it.each(HOSTILE)("our CSP meta is the first thing in the head and before anything of the creator's: %s", (markup) => {
    const doc = htmlFrameDocument(markup);
    const parsed = new DOMParser().parseFromString(doc, "text/html");
    const first = parsed.head.firstElementChild!;
    expect(first.getAttribute("http-equiv")).toBe("Content-Security-Policy");
    expect(first.getAttribute("content")).toBe(HTML_FRAME_CSP);
    expect(parsed.querySelectorAll("meta[http-equiv]")[0]).toBe(first);
    expect(doc.indexOf(HTML_FRAME_CSP)).toBeLessThan(doc.indexOf(markup));
    // the creator's markup sits after our fixed head, inside the body
    expect(doc.indexOf("</head><body>")).toBeLessThan(doc.indexOf(markup));
    // nothing of ours can be replaced: exactly one doctype and one head precede the creator's content
    expect(doc.slice(0, doc.indexOf(markup)).match(/<head>/g)!.length).toBe(1);
  });

  it("is not rewritten by us: CSS-based HTML blocks keep working exactly as written", () => {
    expect(htmlFrameDocument("<style>p{color:red}</style><p>x</p>")).toContain("<body><style>p{color:red}</style><p>x</p></body>");
  });

  it("clamps the height", () => {
    expect(htmlFrameHeight(5)).toBe(HTML_FRAME_MIN_HEIGHT);
    expect(htmlFrameHeight(99999)).toBe(HTML_FRAME_MAX_HEIGHT);
    expect(htmlFrameHeight(undefined)).toBe(360);
    expect(htmlFrameHeight(NaN)).toBe(360);
    expect(htmlFrameHeight("300")).toBe(360);
    const { container } = show(html("x", 99999));
    expect(container.querySelector("iframe")!.style.height).toBe(`${HTML_FRAME_MAX_HEIGHT}px`);
  });
});

describe("links and media are checked again at render time (the API is not trusted)", () => {
  const image = (url: string): Block => ({ id: "i", type: "image", url, caption: "c" });
  const video = (url: string): Block => ({ id: "v", type: "video", url, caption: "c" });

  it.each(V.reject)("renders nothing for the unsafe link %j (image and video)", (u) => {
    expect(show(image(u)).container.querySelector("img, video, iframe")).toBeNull();
    expect(show(video(u)).container.querySelector("img, video, iframe")).toBeNull();
  });

  it("renders the accepted links", () => {
    for (const u of V.accept.filter((x) => x.startsWith("https://example.com"))) {
      const { container, unmount } = show(image(u));
      expect(container.querySelector("img")!.getAttribute("src")).toBe(u);
      unmount();
    }
  });

  it.each(V.embed.filter((e) => e.expected))("embeds only the exact YouTube/Vimeo player URL built from the id: $input", ({ input, expected }) => {
    const { container } = show(video(input));
    expect(container.querySelector("iframe")!.getAttribute("src")).toBe(expected);
    expect(container.querySelector("video")).toBeNull();
  });

  it("a lookalike host is a plain https video file, never an embedded frame", () => {
    for (const u of ["https://evilyoutube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ"]) {
      const { container, unmount } = show(video(u));
      expect(container.querySelector("iframe")).toBeNull();
      expect(container.querySelector("video")!.getAttribute("src")).toBe(u);
      unmount();
    }
  });

  it("SVG is only ever shown through <img>, never inline", () => {
    const { container } = show({ id: "s", type: "svg", svg: "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>alert(2)</script></svg>", caption: "d" });
    expect(container.querySelector("svg, script")).toBeNull();
    expect(container.querySelector("img")!.getAttribute("src")!.startsWith("data:image/svg+xml")).toBe(true);
  });
});

describe("table block", () => {
  const tbl = (rows: string[][], hasHeader: boolean, caption = ""): Block => ({ id: "t", type: "table", hasHeader, caption, rows });

  it("renders semantic markup: header cells are th scope=col, data cells td, the caption is the table's caption", () => {
    const { container } = show(tbl([["Dish", "Minutes"], ["Roast chicken", "90"], ["Bread", "35"]], true, "Oven times"));
    const ths = [...container.querySelectorAll("thead th")];
    expect(ths.map((t) => t.textContent)).toEqual(["Dish", "Minutes"]);
    expect(ths.every((t) => t.getAttribute("scope") === "col")).toBe(true);
    expect([...container.querySelectorAll("tbody tr")].map((r) => [...r.querySelectorAll("td")].map((c) => c.textContent))).toEqual([["Roast chicken", "90"], ["Bread", "35"]]);
    expect(container.querySelector("table > caption")!.textContent).toBe("Oven times");
  });

  it("without a header every row is data and there is no thead", () => {
    const { container } = show(tbl([["a", "b"], ["c", "d"]], false));
    expect(container.querySelector("thead")).toBeNull();
    expect(container.querySelector("th")).toBeNull();
    expect(container.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(container.querySelector("caption")).toBeNull();
  });

  it("cell text is shown as text, never as markup", () => {
    const { container } = show(tbl([["<b id='x'>bold</b>"]], false));
    expect(container.querySelector("#x")).toBeNull();
    expect(container.querySelector("td")!.textContent).toBe("<b id='x'>bold</b>");
  });

  it("a wide table scrolls inside its own box on narrow screens", () => {
    const { getByTestId } = show(tbl([Array.from({ length: 10 }, (_, i) => `column ${i}`)], true));
    expect(getByTestId("table-scroll")).toHaveClass("overflow-x-auto");
    expect(getByTestId("table-scroll").querySelector("table")).toBeInTheDocument();
  });

  it("a malformed table renders nothing rather than crashing", () => {
    const { container } = show({ id: "t", type: "table", hasHeader: true, caption: "", rows: "oops" } as unknown as Block);
    expect(container.querySelector("table")).toBeNull();
  });
});

describe("rich text (text block with a doc)", () => {
  const rt = (doc: unknown, text = "fallback text"): Block => ({ id: "r", type: "text", text, doc } as Block);

  it("renders paragraphs, lists, bold, italic and links from the doc", () => {
    const { container } = show(rt([
      { type: "paragraph", children: [{ text: "a " }, { text: "b", bold: true }, { text: "c", italic: true }, { text: "site", href: "/discover" }, { text: "ext", href: "https://e.com/x" }] },
      { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] },
      { type: "list", ordered: true, items: [[{ text: "first" }]] },
    ]));
    expect(container.querySelector("strong")!.textContent).toBe("b");
    expect(container.querySelector("em")!.textContent).toBe("c");
    const [site, ext] = [...container.querySelectorAll("a")];
    expect(site.getAttribute("href")).toBe("/discover");
    expect(site.getAttribute("target")).toBeNull();
    expect(ext.getAttribute("target")).toBe("_blank");
    expect(ext.getAttribute("rel")).toContain("noopener");
    expect([...container.querySelectorAll("ul li")].map((l) => l.textContent)).toEqual(["one", "two"]);
    expect(container.querySelector("ol li")!.textContent).toBe("first");
    expect(container.textContent).not.toContain("fallback text");
  });

  it("text is never markup, and an unsafe link is shown as plain text", () => {
    const { container } = show(rt([{ type: "paragraph", children: [{ text: "<b id='x'>y</b>" }] }]));
    expect(container.querySelector("#x")).toBeNull();
    const unsafe = show(rt([{ type: "paragraph", children: [{ text: "click", href: "javascript:alert(1)" }] }]));
    expect(unsafe.container.querySelector("a")).toBeNull();
  });

  it("falls back to the plain text when there is no doc or the doc is invalid", () => {
    expect(show(rt(undefined, "plain body")).container.textContent).toContain("plain body");
    const bad = show(rt([{ type: "heading", children: [{ text: "h" }] }], "projected body"));
    expect(bad.container.textContent).toContain("projected body");
    expect(bad.container.querySelector("[data-testid=rich-text]")).toBeNull();
  });
});
