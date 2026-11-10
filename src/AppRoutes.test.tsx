import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, RouterProvider, createMemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  state: { user: null as null | { name: string; role: "USER" | "ADMIN" }, loading: false, isAdmin: false },
}));
vi.mock("@/context/AuthContext", () => ({ useAuth: () => auth.state }));

// The pages that already exist are not under test here: stub them so the routing is what's being exercised.
const stub = vi.hoisted(() => (label: string) => ({ default: () => <div>{label}</div> }));
vi.mock("@/pages/Landing", () => stub("landing-page"));
vi.mock("@/pages/Tracks", () => stub("tracks-page"));
vi.mock("@/pages/TopicPage", () => stub("topic-page"));
vi.mock("@/pages/PracticePage", () => stub("practice-page"));
vi.mock("@/pages/SystemDesignPage", () => stub("system-design-page"));
vi.mock("@/pages/Problem", () => stub("problem-page"));
vi.mock("@/pages/Dashboard", () => stub("dashboard-page"));
vi.mock("@/pages/Signup", () => stub("signup-page"));
vi.mock("@/pages/ForgotPassword", () => stub("forgot-page"));
vi.mock("@/pages/Profile", () => stub("old-profile-page"));
vi.mock("@/pages/Blog", () => stub("blog-page"));
vi.mock("@/pages/admin/AdminDashboard", () => stub("admin-dashboard"));
vi.mock("@/pages/admin/AdminProblems", () => stub("admin-problems"));
vi.mock("@/pages/admin/AdminUsers", () => stub("admin-users"));
vi.mock("@/pages/creator/Workspace", () => ({ default: () => <div data-testid="workspace-screen" /> }));
vi.mock("@/pages/creator/CollectionEditor", () => ({ default: ({ id }: { id: number }) => <div data-testid="collection-editor-screen">{id}</div> }));
vi.mock("@/pages/creator/PageEditor", () => ({ default: ({ id }: { id: number }) => <div data-testid="page-editor-screen">{id}</div> }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer /> }));
vi.mock("@/components/admin/AdminLayout", () => ({ AdminLayout: () => <div>admin-layout<Outlet /></div> }));
// the login page reveals where the guard sent the user from
vi.mock("@/pages/Login", () => ({
  default: function LoginStub() {
    const from = (useLocation().state as { from?: string } | null)?.from;
    return <div>login-page from={String(from)}</div>;
  },
}));

import { AppRoutes } from "./AppRoutes";
import { appRouteObjects } from "./router";

const visit = (path: string) =>
  render(<MemoryRouter initialEntries={[path]}><AppRoutes /></MemoryRouter>);

const anon = () => { auth.state = { user: null, loading: false, isAdmin: false }; };
const asUser = () => { auth.state = { user: { name: "Ann", role: "USER" }, loading: false, isAdmin: false }; };
const asAdmin = () => { auth.state = { user: { name: "Root", role: "ADMIN" }, loading: false, isAdmin: true }; };
const param = (n: string) => screen.getByTestId(`param-${n}`).textContent;

beforeEach(anon);

describe("public creator routes (anonymous)", () => {
  it("renders /discover", () => {
    visit("/discover");
    expect(screen.getByRole("heading", { name: "Discover" })).toBeInTheDocument();
  });

  it("renders @username, lower-cased", () => {
    visit("/@Alice");
    expect(screen.getByRole("heading", { name: "@alice" })).toBeInTheDocument();
    expect(param("username")).toBe("alice");
  });

  it("renders /@username/collection", () => {
    visit("/@alice/java-notes");
    expect(param("username")).toBe("alice");
    expect(param("collectionSlug")).toBe("java-notes");
  });

  it("renders the module-qualified page route with all four parameters", () => {
    visit("/@alice/java/core/intro");
    expect([param("username"), param("collectionSlug"), param("moduleSlug"), param("pageSlug")]).toEqual(["alice", "java", "core", "intro"]);
  });

  it.each(["/alice", "/alice/java", "/alice/java/core/intro", "/@", "/@ab", "/@1abc", "/@al-ice", "/someword"])(
    "%s is a 404 (the first segment is not a valid @handle)", (path) => {
      visit(path);
      expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
    });

  it.each(["/@alice/java/core", "/@alice/java/core/intro/extra"])("%s is a 404 (no such shape)", (path) => {
    visit(path);
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
  });

  it("does not let :handle shadow the existing static routes", () => {
    for (const [path, label] of [["/tracks", "tracks-page"], ["/practice", "practice-page"], ["/blog", "blog-page"],
      ["/login", "login-page"], ["/signup", "signup-page"], ["/system-design", "system-design-page"], ["/", "landing-page"]] as const) {
      const { unmount } = visit(path);
      expect(screen.getByText(new RegExp(label)), path).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps the old two-segment learning routes working", () => {
    visit("/track/java/arrays");
    expect(screen.getByText("topic-page")).toBeInTheDocument();
  });
});

describe("workspace guards", () => {
  it.each(["/create", "/create/collections/5", "/create/pages/5", "/settings/profile"])(
    "anonymous %s -> login, remembering where they were headed", (path) => {
      visit(path);
      expect(screen.getByText(`login-page from=${path}`)).toBeInTheDocument();
    });

  it("shows nothing (a spinner) while the session is still being restored, and does not redirect", () => {
    auth.state = { user: null, loading: true, isAdmin: false };
    visit("/create");
    expect(screen.queryByText(/login-page/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("workspace-screen")).not.toBeInTheDocument();
  });

  it("a logged-in user (not an admin) reaches every workspace route", () => {
    asUser();
    for (const [path, test] of [["/create", () => screen.getByTestId("workspace-screen")],
      ["/create/collections/12", () => screen.getByTestId("collection-editor-screen")],
      ["/create/pages/7", () => screen.getByTestId("page-editor-screen")],
      ["/settings/profile", () => screen.getByRole("heading", { name: "Profile settings" })]] as const) {
      const { unmount } = visit(path);
      expect(test(), path).toBeInTheDocument();
      unmount();
    }
  });

  it("passes the numeric id to the editors", () => {
    asUser();
    visit("/create/collections/12");
    expect(screen.getByTestId("collection-editor-screen")).toHaveTextContent("12");
    visit("/create/pages/7");
    expect(screen.getByTestId("page-editor-screen")).toHaveTextContent("7");
  });

  it.each(["/create/collections/abc", "/create/collections/0", "/create/collections/-3", "/create/pages/1.5", "/create/pages/9999999999999999999999"])(
    "%s is a 404 for a logged-in user (bad id)", (path) => {
      asUser();
      visit(path);
      expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
    });

  it("/create is not swallowed by the :handle route, and is a 404 for deeper unknown paths", () => {
    asUser();
    visit("/create/unknown/thing");
    expect(screen.getByText("Oops! Page not found")).toBeInTheDocument();
  });

  it("the old /profile page and the new /settings/profile page are separate", () => {
    asUser();
    visit("/profile");
    expect(screen.getByText("old-profile-page")).toBeInTheDocument();
  });

  it("the public routes stay public for a logged-in user too", () => {
    asUser();
    visit("/discover");
    expect(screen.getByRole("heading", { name: "Discover" })).toBeInTheDocument();
  });
});

describe("admin stays ADMIN-only", () => {
  it("anonymous -> login", () => {
    visit("/admin");
    expect(screen.getByText("login-page from=/admin")).toBeInTheDocument();
  });

  it("a normal user (who may write) is sent home, not into /admin", () => {
    asUser();
    visit("/admin/users");
    expect(screen.queryByText(/admin-/)).not.toBeInTheDocument();
    expect(screen.getByText("landing-page")).toBeInTheDocument();
  });

  it("an admin reaches /admin", () => {
    asAdmin();
    visit("/admin/users");
    expect(screen.getByText("admin-users")).toBeInTheDocument();
  });

  it("an admin reaches the dashboard, problems and users (admin problem management is kept)", () => {
    asAdmin();
    for (const [path, text] of [["/admin", "admin-dashboard"], ["/admin/problems", "admin-problems"], ["/admin/users", "admin-users"]] as const) {
      const { unmount } = visit(path);
      expect(screen.getByText(text), path).toBeInTheDocument();
      unmount();
    }
  });

  it("the old /admin/tracks screen is gone: an admin lands in their own workspace, nobody else gets anything", () => {
    asAdmin();
    const first = visit("/admin/tracks");
    expect(screen.getByTestId("workspace-screen")).toBeInTheDocument();
    first.unmount();
    asUser();
    const second = visit("/admin/tracks");
    expect(screen.queryByTestId("workspace-screen")).not.toBeInTheDocument();
    expect(screen.getByText("landing-page")).toBeInTheDocument();
    second.unmount();
    auth.state = { user: null, loading: false, isAdmin: false };
    visit("/admin/tracks");
    expect(screen.getByText("login-page from=/admin")).toBeInTheDocument();
  });

  it("an admin can also use the workspace like any creator", () => {
    asAdmin();
    visit("/create");
    expect(screen.getByTestId("workspace-screen")).toBeInTheDocument();
  });
});

// The app runs on a data router (createBrowserRouter, needed for useBlocker). The same routes must behave identically there.
describe("under the app's data router (router.tsx)", () => {
  const visitData = (path: string) => render(<RouterProvider router={createMemoryRouter(appRouteObjects, { initialEntries: [path] })} />);

  it("serves the same public routes, static routes before :handle, and NotFound handling", () => {
    visitData("/discover");
    expect(screen.getByRole("heading", { name: "Discover" })).toBeInTheDocument();
  });

  it.each(["/create", "/create/collections/5", "/create/pages/5", "/settings/profile"])("anonymous %s -> login, remembering where they were headed", (path) => {
    visitData(path);
    expect(screen.getByText(`login-page from=${path}`)).toBeInTheDocument();
  });

  it("a logged-in user reaches the page editor route, an invalid id is NotFound, and the admin redirect still lands on /create", () => {
    asUser();
    const a = visitData("/create/pages/7");
    expect(screen.getByTestId("page-editor-screen")).toHaveTextContent("7");
    a.unmount();
    const b = visitData("/create/pages/abc");
    expect(screen.queryByTestId("page-editor-screen")).not.toBeInTheDocument();
    b.unmount();
    asAdmin();
    visitData("/admin/tracks");
    expect(screen.getByTestId("workspace-screen")).toBeInTheDocument();
  });

  it("the legacy learning routes still resolve", () => {
    visitData("/track/java/arrays");
    expect(screen.getByText("topic-page")).toBeInTheDocument();
  });
});
