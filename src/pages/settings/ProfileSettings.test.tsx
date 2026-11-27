import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import type { MeResponse, Profile } from "@/lib/types";
import { err, installFakeApi, ok, type Reply } from "@/test/fakeApi";
import ProfileSettings from "./ProfileSettings";

/** Step 15c-4: /settings/profile (plan §5; tests 1–12, 10a, 16b). */
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const PROFILE: Profile = {
  displayName: "Bob",
  bio: "Writes about Java.",
  avatarUrl: "https://img.example.com/a.png",
  bannerUrl: null,
  socialLinks: { github: "https://github.com/bob", site: "https://bob.dev" },
  visibility: "PUBLIC",
};
const ME: MeResponse = {
  user: { id: 7, name: "Bob Person", email: "bob@example.com", username: "bob", role: "USER", createdAt: "2026-11-20T10:00:00Z" },
  profile: PROFILE,
};
const KEYS = ["avatarUrl", "bannerUrl", "bio", "displayName", "socialLinks", "visibility"];

let api: ReturnType<typeof installFakeApi>;
/** The PUT echoes what a server would store (trimmed values, blank-URL links dropped). */
const echo = ({ body }: { body: unknown }): Reply => ok(body);

function renderPage(routes: Record<string, (r: { body: unknown }) => Reply> = {}) {
  api = installFakeApi({ "GET /users/me": () => ok(ME), "PUT /users/me/profile": echo, ...routes });
  // useMyProfile retries a 5xx twice by design (15c-3); keep those retries instant here
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><MemoryRouter><ProfileSettings /></MemoryRouter></QueryClientProvider>,
  );
}
const loaded = () => screen.findByLabelText("Display name");
const field = (name: string) => screen.getByLabelText(name) as HTMLInputElement;
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const save = () => fireEvent.click(screen.getByRole("button", { name: /save/i }));
const puts = () => api.sent("PUT", "/users/me/profile");
const lastPut = () => puts()[puts().length - 1].body as Record<string, unknown>;
const linkRows = () => screen.getAllByRole("group", { name: /^Link \d+$/ });

/** A PUT that stays pending until `release` is called. */
function deferred() {
  let release!: (r: { status: number; body?: unknown }) => void;
  const promise = new Promise<{ status: number; body?: unknown }>((res) => { release = res; });
  return { handler: () => promise, release: (r: { status: number; body?: unknown }) => act(async () => { release(r); }) };
}

beforeEach(() => { tokenStore.set("tok"); toast.success.mockClear(); toast.error.mockClear(); });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("loading", () => {
  it("1: shows the heading and a loading state, then every saved value", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Profile settings" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    await loaded();
    expect(field("Display name").value).toBe("Bob");
    expect((screen.getByLabelText("Bio") as HTMLTextAreaElement).value).toBe("Writes about Java.");
    expect(field("Avatar URL").value).toBe("https://img.example.com/a.png");
    expect(field("Banner URL").value).toBe("");
    const rows = linkRows();
    expect(rows).toHaveLength(2);
    expect((within(rows[0]).getByLabelText("Link 1 name") as HTMLInputElement).value).toBe("github");
    expect((within(rows[0]).getByLabelText("Link 1 URL") as HTMLInputElement).value).toBe("https://github.com/bob");
    expect((within(rows[1]).getByLabelText("Link 2 name") as HTMLInputElement).value).toBe("site");
    expect(screen.getByRole("radio", { name: /public/i })).toBeChecked();
    expect(screen.getByRole("radio", { name: /private/i })).not.toBeChecked();
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /users/me"]);
  });

  it("11: a load failure shows the error with a retry that refetches", async () => {
    let fail = true;
    renderPage({ "GET /users/me": () => (fail ? err(500, "Server unavailable") : ok(ME)) });
    expect(await screen.findByText("Server unavailable")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Profile settings" })).toBeInTheDocument();
    const before = api.sent("GET", "/users/me").length;   // 3: the first attempt + the hook's two 5xx retries
    expect(before).toBe(3);
    fail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await loaded();
    expect(api.sent("GET", "/users/me")).toHaveLength(before + 1);
  });

  it("12: sets the document title", async () => {
    renderPage();
    await loaded();
    expect(document.title).toBe("Profile settings · AlgoQuest");
  });
});

describe("read-only account fields", () => {
  it("2: shows @username as text with the hint, and no input for username, email or role", async () => {
    renderPage();
    await loaded();
    expect(screen.getByText("@bob")).toBeInTheDocument();
    expect(screen.getByText("Usernames can't be changed")).toBeInTheDocument();
    expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument();   // email is not shown (Q-c7)
    const values = screen.getAllByRole("textbox").map((el) => (el as HTMLInputElement).value);
    expect(values).not.toContain("bob");
    expect(values).not.toContain("bob@example.com");
    expect(values).not.toContain("USER");
    expect(screen.queryByLabelText(/username|email|role/i)).not.toBeInTheDocument();
  });
});

describe("saving", () => {
  it("3: sends the complete, normalised body; toasts; shows the server's values", async () => {
    renderPage({ "PUT /users/me/profile": () => ok({ ...PROFILE, displayName: "Bob K", bio: "New bio", avatarUrl: null }) });
    await loaded();
    type(field("Display name"), "  Bob K  ");
    type(screen.getByLabelText("Bio"), " New bio ");
    type(field("Avatar URL"), "   ");
    save();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Profile saved"));
    expect(puts()).toHaveLength(1);
    expect(lastPut()).toEqual({
      displayName: "Bob K", bio: "New bio", avatarUrl: null, bannerUrl: null,
      socialLinks: { github: "https://github.com/bob", site: "https://bob.dev" }, visibility: "PUBLIC",
    });
    expect(field("Display name").value).toBe("Bob K");
    expect(field("Avatar URL").value).toBe("");
  });

  it("4: never sends protected fields, although the GET returned email and role", async () => {
    renderPage();
    await loaded();
    save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(Object.keys(lastPut()).sort()).toEqual(KEYS);
    for (const k of ["username", "email", "role", "status", "id", "name", "createdAt"]) expect(lastPut()).not.toHaveProperty(k);
  });

  it("16b: after a successful save the read-only @username is still shown (the cached user is kept)", async () => {
    renderPage();
    await loaded();
    type(field("Display name"), "Robert");
    save();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.getByText("@bob")).toBeInTheDocument();
  });
});

describe("client validation", () => {
  it("5: blocks the request, shows the error next to the field, and focuses the first invalid field", async () => {
    renderPage();
    await loaded();
    type(field("Display name"), "   ");
    type(field("Banner URL"), "http://insecure.example.com/b.png");
    save();
    expect(await screen.findByText("A display name is required")).toBeInTheDocument();
    expect(screen.getByText("The banner must be an https:// link")).toBeInTheDocument();
    expect(field("Display name")).toHaveAttribute("aria-invalid", "true");
    expect(field("Display name")).toHaveAccessibleDescription("A display name is required");
    expect(document.activeElement).toBe(field("Display name"));
    expect(puts()).toHaveLength(0);
  });

  it("6: the bio counter follows the text", async () => {
    renderPage();
    await loaded();
    expect(screen.getByText("18 / 500")).toBeInTheDocument();
    type(screen.getByLabelText("Bio"), "abc");
    expect(screen.getByText("3 / 500")).toBeInTheDocument();
  });
});

describe("social links", () => {
  it("7: add, edit and remove rows; the body follows", async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Remove link 1" }));
    expect(linkRows()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    const rows = linkRows();
    expect(rows).toHaveLength(2);
    type(within(rows[1]).getByLabelText("Link 2 name"), "mastodon");
    type(within(rows[1]).getByLabelText("Link 2 URL"), "https://social.example/@bob");
    type(within(rows[0]).getByLabelText("Link 1 URL"), "https://bob.dev/blog");
    save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(lastPut().socialLinks).toEqual({ site: "https://bob.dev/blog", mastodon: "https://social.example/@bob" });
  });

  it("7: Add link is disabled at 10 rows", async () => {
    renderPage();
    await loaded();
    for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    expect(linkRows()).toHaveLength(10);
    expect(screen.getByRole("button", { name: "Add link" })).toBeDisabled();
  });

  it("7: duplicate names and a partly filled row block save", async () => {
    renderPage();
    await loaded();
    type(screen.getByLabelText("Link 2 name"), "github");
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    type(screen.getByLabelText("Link 3 name"), "blog");
    save();
    expect(await screen.findAllByText("Each link needs a different name")).toHaveLength(2);
    expect(screen.getByText("Add the link's https:// address")).toBeInTheDocument();
    expect(puts()).toHaveLength(0);
  });

  it("7: a completely empty new row is ignored", async () => {
    renderPage();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "Add link" }));
    save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(Object.keys(lastPut().socialLinks as object)).toEqual(["github", "site"]);
  });
});

describe("visibility and the public profile link", () => {
  it("8: PUBLIC → PRIVATE hides the link only after saving; PRIVATE → PUBLIC brings it back", async () => {
    renderPage();
    await loaded();
    const link = () => screen.queryByRole("link", { name: "View public profile" });
    expect(link()).toHaveAttribute("href", "/@bob");
    expect(screen.getByText(/Private hides your profile page/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: /private/i }));
    expect(link()).toBeInTheDocument();                       // follows the SAVED visibility (Q-c3)
    save();
    await waitFor(() => expect(puts()).toHaveLength(1));
    expect(lastPut().visibility).toBe("PRIVATE");
    await waitFor(() => expect(link()).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("radio", { name: /public/i }));
    save();
    await waitFor(() => expect(puts()).toHaveLength(2));
    expect(lastPut().visibility).toBe("PUBLIC");
    expect(await screen.findByRole("link", { name: "View public profile" })).toHaveAttribute("href", "/@bob");
  });
});

describe("server errors", () => {
  it("9: a known 400 message is shown under its field", async () => {
    renderPage({ "PUT /users/me/profile": () => err(400, "avatarUrl must be an https URL") });
    await loaded();
    save();
    expect(await screen.findByText("avatarUrl must be an https URL")).toBeInTheDocument();
    expect(field("Avatar URL")).toHaveAttribute("aria-invalid", "true");
    expect(field("Avatar URL")).toHaveAccessibleDescription("avatarUrl must be an https URL");
  });

  it("9: a socialLinks.<label> message is shown on that row's URL", async () => {
    renderPage({ "PUT /users/me/profile": () => err(400, "socialLinks.site must be an https URL") });
    await loaded();
    save();
    await screen.findByText("socialLinks.site must be an https URL");
    expect(field("Link 2 URL")).toHaveAttribute("aria-invalid", "true");
    expect(field("Link 1 URL")).not.toHaveAttribute("aria-invalid", "true");
  });

  it("9: an unmapped 400 goes to the form-level alert", async () => {
    renderPage({ "PUT /users/me/profile": () => err(400, "Usernames cannot be changed") });
    await loaded();
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Usernames cannot be changed");
  });

  it("9: a 500 goes to the form-level alert and keeps the edits", async () => {
    renderPage({ "PUT /users/me/profile": () => err(500, "Server unavailable") });
    await loaded();
    type(field("Display name"), "Edited");
    save();
    expect(await screen.findByRole("alert")).toHaveTextContent("Server unavailable");
    expect(field("Display name").value).toBe("Edited");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("9: server errors are cleared on the next submit", async () => {
    let fail = true;
    renderPage({ "PUT /users/me/profile": ({ body }) => (fail ? err(400, "bio must be at most 500 characters") : ok(body)) });
    await loaded();
    save();
    await screen.findByText("bio must be at most 500 characters");
    fail = false;
    save();
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(screen.queryByText("bio must be at most 500 characters")).not.toBeInTheDocument();
  });
});

describe("saving state", () => {
  it("10: Save shows Saving… and is disabled while pending; a double submit sends one PUT", async () => {
    const d = deferred();
    renderPage({ "PUT /users/me/profile": d.handler });
    await loaded();
    const button0 = screen.getByRole("button", { name: "Save" });
    fireEvent.click(button0);
    fireEvent.click(button0);                      // the same element, now "Saving…"
    fireEvent.submit(button0.closest("form")!);
    const button = await screen.findByRole("button", { name: /Saving/ });
    expect(button).toBeDisabled();
    await d.release({ status: 200, body: PROFILE });
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    expect(puts()).toHaveLength(1);
  });

  it("10a: every editable control is disabled while saving and edits are ignored; success re-enables them with server values", async () => {
    const d = deferred();
    renderPage({ "PUT /users/me/profile": d.handler });
    await loaded();
    save();
    await screen.findByRole("button", { name: /Saving/ });
    const controls = [field("Display name"), screen.getByLabelText("Bio"), field("Avatar URL"), field("Banner URL"),
      field("Link 1 name"), field("Link 1 URL"), screen.getByRole("button", { name: "Remove link 1" }),
      screen.getByRole("button", { name: "Add link" }), screen.getByRole("radio", { name: /public/i }),
      screen.getByRole("radio", { name: /private/i })];
    for (const c of controls) expect(c).toBeDisabled();
    type(screen.getByLabelText("Bio"), "typed while saving");
    expect((screen.getByLabelText("Bio") as HTMLTextAreaElement).value).toBe("Writes about Java.");
    await d.release({ status: 200, body: { ...PROFILE, displayName: "From server" } });
    await waitFor(() => expect(field("Display name")).toBeEnabled());
    for (const c of [field("Display name"), screen.getByLabelText("Bio"), field("Link 1 URL")]) expect(c).toBeEnabled();
    expect(field("Display name").value).toBe("From server");
  });

  it.each([[400, "bio must be at most 500 characters"], [500, "Server unavailable"]])(
    "10a: after a failed save (%i) the controls are enabled again and keep the user's edits", async (status, message) => {
      const d = deferred();
      renderPage({ "PUT /users/me/profile": d.handler });
      await loaded();
      type(field("Display name"), "My edit");
      save();
      await screen.findByRole("button", { name: /Saving/ });
      expect(field("Display name")).toBeDisabled();
      await d.release({ status, body: { error: message } });
      await waitFor(() => expect(field("Display name")).toBeEnabled());
      expect(field("Display name").value).toBe("My edit");
      expect(screen.getByText(message)).toBeInTheDocument();
    });
});
