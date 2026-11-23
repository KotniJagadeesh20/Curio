import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";

// A11Y plan rev. 2, controls 5–7: the icon-only social links have accessible names and keep their attributes.
describe("Footer social links", () => {
  it.each([
    ["GitHub", "https://github.com"],
    ["Twitter", "https://twitter.com"],
    ["LinkedIn", "https://linkedin.com"],
  ])("%s link is named and keeps href/target/rel", (name, href) => {
    render(<MemoryRouter><Footer /></MemoryRouter>);
    const link = screen.getByRole("link", { name });
    expect(link).toHaveAttribute("href", href);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });
});
