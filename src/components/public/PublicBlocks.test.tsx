import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PublicLegacyContent, StoredBlock } from "@/lib/types";

vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre data-testid="code">{value}</pre> }));
// LessonText throws for one marker string: a render-time failure that field validation can't see (the boundary's job).
vi.mock("@/components/LessonText", () => ({
  LessonText: ({ text }: { text: string }) => { if (text === "EXPLODE") throw new Error("boom"); return <p>{text}</p>; },
}));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
const fetchOwnerMedia = vi.hoisted(() => vi.fn(() => new Promise<Blob>(() => {})));
vi.mock("@/lib/media", async (orig) => ({ ...(await orig<typeof import("@/lib/media")>()), fetchOwnerMedia }));
import { PublicBlocks } from "./PublicBlocks";

const show = (blocks: unknown, legacy: PublicLegacyContent | null = null) =>
  render(<PublicBlocks page={{ blocks: blocks as StoredBlock[] | null, legacy }} />);

beforeEach(() => { fetchOwnerMedia.mockClear(); });   // braces: a returned function would run as a cleanup hook
afterEach(() => vi.restoreAllMocks());

describe("PublicBlocks", () => {
  it("renders every block type through the public renderer", () => {
    const { container } = show([
      { type: "heading", level: 2, text: "Getting around" },
      { type: "text", text: "x", doc: [{ type: "paragraph", children: [{ text: "Bold", bold: true }, { text: " and " }, { text: "a link", href: "https://example.org" }] }, { type: "list", ordered: false, items: [[{ text: "one" }], [{ text: "two" }]] }] },
      { type: "code", language: "java", code: "int x = 1;", caption: "" },
      { type: "image", url: "/api/public/media/abc", caption: "Tram", width: 800, height: 600 },
      { type: "video", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", caption: "" },
      { type: "html", html: "<p>hi</p>", height: 200 },
      { type: "svg", svg: "<svg xmlns='http://www.w3.org/2000/svg'/>", caption: "Diagram" },
      { type: "callout", variant: "tip", text: "Buy a Viva Viagem card" },
      { type: "table", hasHeader: true, caption: "Fares", rows: [["Ticket", "Price"], ["Single", "€2"]] },
      { type: "divider" },
    ]);
    expect(screen.getByRole("heading", { level: 2, name: "Getting around" })).toBeInTheDocument();
    expect(screen.getByText("Bold").tagName).toBe("STRONG");
    const link = screen.getByRole("link", { name: "a link" });
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(screen.getByText("one")).toBeInTheDocument();
    expect(screen.getByTestId("code")).toHaveTextContent("int x = 1;");
    expect(screen.getByRole("img", { name: "Tram" })).toHaveAttribute("src", "/api/public/media/abc");
    expect(container.querySelector('iframe[src="https://www.youtube.com/embed/dQw4w9WgXcQ"]')).not.toBeNull();
    expect(container.querySelector('iframe[sandbox=""]')).not.toBeNull();
    expect(screen.getByRole("img", { name: "Diagram" }).getAttribute("src")).toMatch(/^data:image\/svg\+xml/);
    expect(screen.getByText("Buy a Viva Viagem card")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Ticket" })).toBeInTheDocument();
    expect(container.querySelector("caption")).toHaveTextContent("Fares");
    expect(container.querySelector("hr")).not.toBeNull();
    expect(fetchOwnerMedia).not.toHaveBeenCalled();
  });

  it("one malformed block doesn't hide its valid neighbors", () => {
    show([
      { type: "heading", level: 2, text: "Before" },
      { type: "code", code: { not: "a string" } },
      { type: "text", text: 5 },
      { type: "image", url: 7, caption: "" },
      { type: "video", url: null, caption: "" },
      { type: "html", html: ["<p>"] },
      { type: "quiz", q: "?" },
      { type: "callout", variant: "warning", text: "After" },
    ]);
    expect(screen.getByRole("heading", { name: "Before" })).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(screen.queryByTestId("no-content")).toBeNull();
  });

  it("an image with an owner-media URL is not rendered and owner media is never fetched", () => {
    const { container } = show([{ type: "image", url: "/api/media/123/content", caption: "Example image" }, { type: "image", assetId: "123", url: "", caption: "x" }]);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByTestId("no-content")).toBeInTheDocument();
    expect(fetchOwnerMedia).not.toHaveBeenCalled();
  });

  it.each([[[]], [[{ type: "quiz" }, null, 5, { type: "code", code: 1 }]], [null], ["not an array"]])(
    "nothing renderable → the neutral message (%j)", (blocks) => {
      show(blocks);
      expect(screen.getByTestId("no-content")).toHaveTextContent("No content is available to display.");
    });

  it("a block that still throws while rendering is skipped by the error boundary; the others stay", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    show([{ type: "heading", level: 2, text: "Before" }, { type: "text", text: "EXPLODE" }, { type: "callout", variant: "tip", text: "After" }]);
    expect(screen.getByRole("heading", { name: "Before" })).toBeInTheDocument();
    expect(screen.getByText("After")).toBeInTheDocument();
    expect(screen.queryByText("EXPLODE")).toBeNull();
    expect(screen.queryByTestId("no-content")).toBeNull();
  });

  it("if every block throws, the neutral message is shown", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    show([{ type: "text", text: "EXPLODE" }, { type: "text", text: "EXPLODE" }]);
    expect(screen.getByTestId("no-content")).toBeInTheDocument();
  });

  it("legacy pages render through legacyToBlocks", () => {
    show(null, { concept: "Pods are the smallest unit.", realWorld: "Used everywhere.", commonMistakes: ["Forgetting limits"], bestPractices: [], interviewRelevance: "", codeLanguage: "yaml", codeExample: "kind: Pod" });
    expect(screen.getByRole("heading", { name: "Concept" })).toBeInTheDocument();
    expect(screen.getByText("Pods are the smallest unit.")).toBeInTheDocument();
    expect(screen.getByTestId("code")).toHaveTextContent("kind: Pod");
    expect(screen.getByText("Used everywhere.")).toBeInTheDocument();
  });

  it("a legacy page with wrong-typed fields doesn't crash", () => {
    show(null, { concept: 5, realWorld: null, commonMistakes: "x" } as unknown as PublicLegacyContent);
    expect(screen.getByTestId("no-content")).toBeInTheDocument();
  });

  it("does not mutate the page's blocks", () => {
    const blocks = [{ type: "image", url: "/api/public/media/a", caption: "c", assetId: "a" }, { type: "heading", level: 7, text: "H" }];
    const copy = structuredClone(blocks);
    show(blocks);
    expect(blocks).toEqual(copy);
  });
});
