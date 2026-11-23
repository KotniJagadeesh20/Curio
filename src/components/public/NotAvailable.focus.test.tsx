// Step 14d-3: NotAvailable's heading can receive programmatic focus on arrival; nothing else changed.
import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NotAvailable } from "./NotAvailable";

describe("NotAvailable heading", () => {
  it("forwards a ref to the <h1>, which is focusable but not tabbable", () => {
    const ref = createRef<HTMLHeadingElement>();
    render(<MemoryRouter><NotAvailable what="page" ref={ref} /></MemoryRouter>);
    const h = screen.getByRole("heading", { level: 1, name: "This page isn't available" });
    expect(ref.current).toBe(h);
    expect(h).toHaveAttribute("tabindex", "-1");
    h.focus();
    expect(document.activeElement).toBe(h);
  });

  it("works without a ref, with the same wording", () => {
    render(<MemoryRouter><NotAvailable what="collection" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "This collection isn't available" })).toBeInTheDocument();
    expect(screen.getByText("It may have been moved or unpublished, or the link may be mistyped.")).toBeInTheDocument();
  });
});
