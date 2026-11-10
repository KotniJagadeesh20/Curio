import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  state: { user: null as null | { name: string; email: string; role: string }, isAdmin: false, logout: () => {} },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.state }));
vi.mock("./ThemeProvider", () => ({ useTheme: () => ({ theme: "light", toggleTheme: () => {} }) }));

import { Navbar } from "./Navbar";

const open = () => render(<MemoryRouter><Navbar /></MemoryRouter>);
const link = (name: string) => screen.queryAllByRole("link", { name }).filter((a) => a.closest("div.hidden"));

beforeEach(() => { auth.state = { user: null, isAdmin: false, logout: () => {} }; });

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
});
