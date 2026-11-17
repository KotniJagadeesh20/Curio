import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { NoContent, NotAvailable } from "./NotAvailable";

describe("neutral public states", () => {
  it("NotAvailable says the same thing for every hidden reason and links to Discover", () => {
    render(<MemoryRouter><NotAvailable what="collection" /></MemoryRouter>);
    expect(screen.getByRole("heading", { name: "This collection isn't available" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Browse Discover" })).toHaveAttribute("href", "/discover");
    expect(screen.getByTestId("not-available").textContent).not.toMatch(/draft|hidden|deleted|suspend|moderat/i);
  });

  it("NoContent uses the approved wording", () => {
    render(<NoContent />);
    expect(screen.getByText("No content is available to display.")).toBeInTheDocument();
  });
});
