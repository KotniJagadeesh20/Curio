import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  state: { user: null as null | { name: string; email: string; role: string }, isAdmin: false, logout: () => {} },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.state }));
// A11Y: stateful theme mock (initial theme from `themeState.initial`, default "light" as before) so the toggle's name can flip.
const themeState = vi.hoisted(() => ({ initial: "light" as "light" | "dark" }));
vi.mock("./ThemeProvider", () => ({
  useTheme: () => {
    const [theme, setTheme] = useState(themeState.initial);
    return { theme, toggleTheme: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
  },
}));

import { Navbar } from "./Navbar";

const open = () => render(<MemoryRouter><Navbar /></MemoryRouter>);
const link = (name: string) => screen.queryAllByRole("link", { name }).filter((a) => a.closest("div.hidden"));

beforeEach(() => { auth.state = { user: null, isAdmin: false, logout: () => {} }; themeState.initial = "light"; });

describe("Navbar", () => {
  it("shows Discover to everyone, and no Write link to a visitor", () => {
    open();
    expect(link("Discover")[0]).toHaveAttribute("href", "/discover");
    expect(screen.queryByRole("link", { name: "Write" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Login" })).toBeInTheDocument();
  });

  it("shows Write -> /create to any logged-in user, admin or not", () => {
    auth.state = { user: { name: "Ann", email: "a@x.io", role: "USER" }, isAdmin: false, logout: () => {} };
    open();
    expect(screen.getByRole("link", { name: "Write" })).toHaveAttribute("href", "/create");
    expect(screen.queryByRole("link", { name: "Admin" })).not.toBeInTheDocument();
  });

  it("keeps the existing links", () => {
    open();
    for (const name of ["Home", "Tracks", "Practice", "System Design", "Dashboard", "Blog"])
      expect(screen.getByRole("link", { name }), name).toBeInTheDocument();
  });

  // A11Y plan rev. 2, controls 3 and 4.
  it("names the theme toggle by the action it performs, and the name flips after toggling", () => {
    open();
    const toggle = screen.getByRole("button", { name: "Switch to dark theme" });
    fireEvent.click(toggle);
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBe(toggle);
    expect(toggle.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("in dark theme the toggle is named \"Switch to light theme\"", () => {
    themeState.initial = "dark";
    open();
    expect(screen.getByRole("button", { name: "Switch to light theme" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Switch to dark theme" })).not.toBeInTheDocument();
  });

  it("names the mobile menu button, exposes aria-expanded, and controls a panel that always exists", async () => {
    const { container } = open();
    const button = screen.getByRole("button", { name: "Open menu" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(button).toHaveAttribute("aria-controls", "mobile-nav-panel");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    const panel = container.querySelector("#mobile-nav-panel");
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("hidden");

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Close menu" })).toBe(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector("#mobile-nav-panel")).toBe(panel);
    expect(panel).not.toHaveAttribute("hidden");
    expect(panel!.querySelector('a[href="/discover"]')).not.toBeNull();

    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "Open menu" })).toBe(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(container.querySelector("#mobile-nav-panel")).toHaveAttribute("hidden"));
    expect(container.querySelector("#mobile-nav-panel")).toBe(panel);
  });
  // Step 15c-5: Profile settings next to the unchanged Profile item, in both account menus.
  const ann = () => { auth.state = { user: { name: "Ann", email: "a@x.io", role: "USER" }, isAdmin: false, logout: () => {} }; };

  it("desktop account menu has Profile -> /profile and Profile settings -> /settings/profile", async () => {
    ann();
    open();
    fireEvent.keyDown(screen.getByRole("button", { name: "Account menu" }), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    const items = Array.from(menu.querySelectorAll("a"));
    expect(items.find((a) => a.textContent?.trim() === "Profile")).toHaveAttribute("href", "/profile");
    expect(items.find((a) => a.textContent?.trim() === "Profile settings")).toHaveAttribute("href", "/settings/profile");
  });

  it("mobile menu has Profile -> /profile and Profile settings -> /settings/profile", () => {
    ann();
    const { container } = open();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const panel = container.querySelector("#mobile-nav-panel")!;
    const items = Array.from(panel.querySelectorAll("a"));
    expect(items.find((a) => a.textContent?.trim() === "Profile")).toHaveAttribute("href", "/profile");
    expect(items.find((a) => a.textContent?.trim() === "Profile settings")).toHaveAttribute("href", "/settings/profile");
  });

  it("a visitor sees neither Profile nor Profile settings, on desktop or in the mobile menu", () => {
    const { container } = open();
    expect(screen.queryByRole("button", { name: "Account menu" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(container.querySelector('a[href="/profile"]')).toBeNull();
    expect(container.querySelector('a[href="/settings/profile"]')).toBeNull();
    expect(screen.queryByText("Profile settings")).not.toBeInTheDocument();
  });
});
