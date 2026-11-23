import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { PublicModule } from "@/lib/types";
import { PageNav } from "./PageNav";

const MODULES: PublicModule[] = [
  { slug: "day-2", title: "Day two", position: 1, pages: [{ slug: "museums", title: "Museums", summary: "", position: 0 }] },
  { slug: "day-1", title: "Day one", position: 0, pages: [
    { slug: "tram", title: "Tram 28", summary: "", position: 1 },
    { slug: "arrival", title: "Arrival", summary: "", position: 0 },
  ] },
];
const show = (moduleSlug: string, pageSlug: string, modules = MODULES) =>
  render(<MemoryRouter><PageNav username="alice" collectionSlug="lisbon" modules={modules} moduleSlug={moduleSlug} pageSlug={pageSlug} /></MemoryRouter>);

describe("PageNav", () => {
  it("links previous and next in reading order, module-qualified", () => {
    show("day-1", "tram");
    expect(screen.getByRole("link", { name: "Previous: Arrival" })).toHaveAttribute("href", "/@alice/lisbon/day-1/arrival");
    expect(screen.getByRole("link", { name: "Next: Museums" })).toHaveAttribute("href", "/@alice/lisbon/day-2/museums");
    expect(screen.getByRole("navigation", { name: "Page navigation" })).toBeInTheDocument();
  });

  it("crosses module boundaries backwards too", () => {
    show("day-2", "museums");
    expect(screen.getByRole("link", { name: "Previous: Tram 28" })).toHaveAttribute("href", "/@alice/lisbon/day-1/tram");
  });

  it("the first page has no Previous; the last page has no Next", () => {
    const first = show("day-1", "arrival");
    expect(screen.queryByRole("link", { name: /^Previous/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Next: Tram 28" })).toBeInTheDocument();
    first.unmount();
    show("day-2", "museums");
    expect(screen.queryByRole("link", { name: /^Next/ })).toBeNull();
  });

  it("renders nothing for a page missing from the published outline (a draft) or a one-page collection", () => {
    const a = show("day-1", "draft-page");
    expect(a.container).toBeEmptyDOMElement();
    a.unmount();
    const b = show("m", "only", [{ slug: "m", title: "M", position: 0, pages: [{ slug: "only", title: "Only", summary: "", position: 0 }] }]);
    expect(b.container).toBeEmptyDOMElement();
  });

  it("never links a page that isn't in the published outline", () => {
    show("day-1", "tram");
    for (const a of screen.getAllByRole("link")) expect(a.getAttribute("href")).not.toMatch(/draft/);
  });
});
