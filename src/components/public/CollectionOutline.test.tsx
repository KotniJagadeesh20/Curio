import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import type { PublicModule } from "@/lib/types";
import { CollectionOutline } from "./CollectionOutline";

const MODULES: PublicModule[] = [
  { slug: "day-2", title: "Day two", position: 1, pages: [{ slug: "museums", title: "Museums", summary: "", position: 0 }] },
  { slug: "day-1", title: "Day one", position: 0, pages: [
    { slug: "tram", title: "Tram 28", summary: "", position: 1 },
    { slug: "arrival", title: "Arrival & check-in", summary: "Airport to Alfama", position: 0 },
  ] },
];
const mount = (current?: { moduleSlug: string; pageSlug: string }) =>
  render(<MemoryRouter><CollectionOutline username="alice" collectionSlug="lisbon" modules={MODULES} current={current} /></MemoryRouter>);

describe("CollectionOutline", () => {
  it("lists modules and pages in reading order, fully expanded", () => {
    mount();
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["Day one", "Day two"]);
    expect(within(screen.getByRole("navigation", { name: "Collection contents" })).getAllByRole("link").map((a) => a.textContent))
      .toEqual(["Arrival & check-inAirport to Alfama", "Tram 28", "Museums"]);
  });

  it("links are module-qualified, encoded public page URLs", () => {
    mount();
    expect(screen.getByRole("link", { name: /Arrival/ })).toHaveAttribute("href", "/@alice/lisbon/day-1/arrival");
    expect(screen.getByRole("link", { name: "Museums" })).toHaveAttribute("href", "/@alice/lisbon/day-2/museums");
  });

  it("shows a page's summary when it has one", () => {
    mount();
    expect(screen.getByText("Airport to Alfama")).toBeInTheDocument();
  });

  it("marks exactly the current page with aria-current", () => {
    mount({ moduleSlug: "day-1", pageSlug: "tram" });
    const current = screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("Tram 28");
  });

  it("no current page by default, and no numeric ids anywhere in the markup", () => {
    const { container } = mount();
    expect(container.querySelector("[aria-current]")).toBeNull();
    expect(container.innerHTML).not.toMatch(/\bid="\d+"|data-id/);
  });
});
