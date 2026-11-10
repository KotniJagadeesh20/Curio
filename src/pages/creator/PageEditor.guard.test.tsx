import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import { err, installFakeApi } from "@/test/fakeApi";
import { btn, makePage, mountEditor, puts, routes, saveState, typeText } from "@/test/pageEditorHarness";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/pages/NotFound", () => ({ default: () => <div>not-found-screen</div> }));
vi.mock("@/components/CodeEditor", () => ({ CodeEditor: ({ value }: { value: string }) => <pre>{value}</pre> }));
vi.mock("@/components/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));

beforeEach(() => { tokenStore.set("tok"); });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

const loaded = () => screen.findByRole("heading", { level: 1 });
const path = (r: { state: { location: { pathname: string } } }) => r.state.location.pathname;
const beforeUnloadPrevented = () => {
  const e = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(e);
  return e.defaultPrevented;
};

describe("clean page", () => {
  it("navigation is not intercepted and nothing is sent", async () => {
    const api = installFakeApi(routes(makePage()));
    const { router } = mountEditor();
    await loaded();
    await act(async () => { await router.navigate("/elsewhere"); });
    expect(path(router)).toBe("/elsewhere");
    expect(screen.queryByTestId("leave-dialog")).not.toBeInTheDocument();
    expect(puts(api)).toHaveLength(0);
  });

  it("a link click on a clean page navigates straight away", async () => {
    installFakeApi(routes(makePage()));
    const { router } = mountEditor();
    await loaded();
    fireEvent.click(screen.getByRole("link", { name: /back to collection/i }));
    await waitFor(() => expect(path(router)).toBe("/create/collections/5"));
  });

  it("beforeunload does not block closing the tab", async () => {
    installFakeApi(routes(makePage()));
    mountEditor();
    await loaded();
    expect(beforeUnloadPrevented()).toBe(false);
  });
});

describe("a draft with unsaved changes", () => {
  it("beforeunload asks the browser to confirm while there are unsaved changes, and not after they are saved", async () => {
    installFakeApi(routes(makePage()));
    mountEditor();
    await loaded();
    typeText("unsaved");
    expect(beforeUnloadPrevented()).toBe(true);
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(saveState()).toBe("Saved"));
    expect(beforeUnloadPrevented()).toBe(false);
  });

  it("programmatic navigation saves first, then goes (no dialog when the save works)", async () => {
    const page = makePage();
    const api = installFakeApi(routes(page));
    const { router } = mountEditor();
    await loaded();
    typeText("do not lose me");
    await act(async () => { void router.navigate("/elsewhere"); });
    await waitFor(() => expect(path(router)).toBe("/elsewhere"));
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0]).toMatchObject({ autosave: true, expectedVersion: 3 });
    expect(page.blocks![1]).toMatchObject({ text: "do not lose me" });
    expect(screen.queryByTestId("leave-dialog")).not.toBeInTheDocument();
  });

  it("a link click saves first, then follows the link", async () => {
    const page = makePage();
    const api = installFakeApi(routes(page));
    const { router } = mountEditor();
    await loaded();
    typeText("via link");
    fireEvent.click(screen.getByRole("link", { name: /back to collection/i }));
    await waitFor(() => expect(path(router)).toBe("/create/collections/5"));
    expect(puts(api)).toHaveLength(1);
    expect(page.blocks![1]).toMatchObject({ text: "via link" });
  });

  it("browser back and forward are guarded too", async () => {
    const page = makePage();
    const api = installFakeApi(routes(page));
    const { router } = mountEditor({ entries: ["/elsewhere", "/create/pages/9"], index: 1 });
    await loaded();
    typeText("before going back");
    await act(async () => { void router.navigate(-1); });                         // the back button
    await waitFor(() => expect(path(router)).toBe("/elsewhere"));
    expect(puts(api)).toHaveLength(1);
    expect(page.blocks![1]).toMatchObject({ text: "before going back" });
    await act(async () => { await router.navigate(1); });                         // forward to the editor again (clean now)
    await loaded();
    expect(screen.getByLabelText("Text")).toHaveValue("before going back");
    typeText("before going forward");
    await act(async () => { void router.navigate(-1); });
    await waitFor(() => expect(path(router)).toBe("/elsewhere"));
    expect(puts(api)).toHaveLength(2);
  });

  it("waits for a save that is already running instead of sending a second request", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const page = makePage();
    const base = routes(page);
    let first = true;
    const api = installFakeApi({ ...base, "PUT /pages/9": async (r) => { if (first) { first = false; await gate; } return base["PUT /pages/9"](r); } });
    const { router } = mountEditor();
    await loaded();
    typeText("in flight");
    fireEvent.click(btn("Save"));
    await waitFor(() => expect(saveState()).toBe("Saving..."));
    await act(async () => { void router.navigate("/elsewhere"); });
    expect(await screen.findByText("Saving your changes...")).toBeInTheDocument();
    expect(path(router)).toBe("/create/pages/9");
    expect(puts(api)).toHaveLength(1);
    release();
    await waitFor(() => expect(path(router)).toBe("/elsewhere"));
    expect(puts(api)).toHaveLength(1);
  });

  it("if saving fails, it offers Stay or Leave without saving; Stay keeps everything", async () => {
    const api = installFakeApi({ ...routes(makePage()), "PUT /pages/9": () => err(403, "You do not own this page") });
    const { router } = mountEditor();
    await loaded();
    typeText("precious words");
    await act(async () => { void router.navigate("/elsewhere"); });
    const dialog = await screen.findByTestId("leave-dialog");
    expect(dialog).toHaveTextContent(/could not be saved/i);
    expect(within(dialog).queryByRole("button", { name: "Save and leave" })).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Stay on this page" }));
    await waitFor(() => expect(screen.queryByTestId("leave-dialog")).not.toBeInTheDocument());
    expect(path(router)).toBe("/create/pages/9");
    expect(screen.getByLabelText("Text")).toHaveValue("precious words");
    expect(beforeUnloadPrevented()).toBe(true);
    expect(puts(api).length).toBeGreaterThanOrEqual(1);
  });

  it("'Leave without saving' leaves, and the dialog can be answered again if the person stays first", async () => {
    installFakeApi({ ...routes(makePage()), "PUT /pages/9": () => err(500, "Database down") });
    const { router } = mountEditor();
    await loaded();
    typeText("will be lost on purpose");
    await act(async () => { void router.navigate("/elsewhere"); });
    fireEvent.click(within(await screen.findByTestId("leave-dialog")).getByRole("button", { name: "Stay on this page" }));
    await waitFor(() => expect(screen.queryByTestId("leave-dialog")).not.toBeInTheDocument());
    await act(async () => { void router.navigate("/elsewhere"); });
    fireEvent.click(within(await screen.findByTestId("leave-dialog")).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(path(router)).toBe("/elsewhere"));
  });

  it("a network failure while leaving also ends in the dialog, with the edits kept", async () => {
    installFakeApi({ ...routes(makePage()), "PUT /pages/9": () => { throw new TypeError("Failed to fetch"); } });
    const { router } = mountEditor();
    await loaded();
    typeText("offline words");
    await act(async () => { void router.navigate("/elsewhere"); });
    fireEvent.click(within(await screen.findByTestId("leave-dialog")).getByRole("button", { name: "Stay on this page" }));
    await waitFor(() => expect(screen.queryByTestId("leave-dialog")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Text")).toHaveValue("offline words");
  });
});

describe("a published page", () => {
  it("is never saved implicitly: leaving asks, 'Leave without saving' sends nothing", async () => {
    const api = installFakeApi(routes(makePage({ status: "PUBLISHED" })));
    const { router } = mountEditor();
    await loaded();
    typeText("not ready for readers");
    await act(async () => { void router.navigate("/elsewhere"); });
    const dialog = await screen.findByTestId("leave-dialog");
    expect(dialog).toHaveTextContent(/published/i);
    expect(puts(api)).toHaveLength(0);
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(path(router)).toBe("/elsewhere"));
    expect(puts(api)).toHaveLength(0);
  });

  it("'Save and leave' is an explicit save (no autosave flag), then leaves", async () => {
    const page = makePage({ status: "PUBLISHED" });
    const api = installFakeApi(routes(page));
    const { router } = mountEditor();
    await loaded();
    typeText("ready for readers");
    await act(async () => { void router.navigate("/elsewhere"); });
    fireEvent.click(within(await screen.findByTestId("leave-dialog")).getByRole("button", { name: "Save and leave" }));
    await waitFor(() => expect(path(router)).toBe("/elsewhere"));
    expect(puts(api)).toHaveLength(1);
    expect(puts(api)[0].autosave).toBeUndefined();
    expect(page.blocks![1]).toMatchObject({ text: "ready for readers" });
  });

  it("'Stay on this page' keeps the edits", async () => {
    installFakeApi(routes(makePage({ status: "PUBLISHED" })));
    const { router } = mountEditor();
    await loaded();
    typeText("still editing");
    await act(async () => { void router.navigate("/elsewhere"); });
    fireEvent.click(within(await screen.findByTestId("leave-dialog")).getByRole("button", { name: "Stay on this page" }));
    await waitFor(() => expect(screen.queryByTestId("leave-dialog")).not.toBeInTheDocument());
    expect(path(router)).toBe("/create/pages/9");
    expect(screen.getByLabelText("Text")).toHaveValue("still editing");
  });
});

describe("explicit steps are never saved implicitly on the way out", () => {
  it("a pending recovery (discard) is not saved by leaving: the person must choose", async () => {
    const page = makePage({ blocks: null, blocksUnreadable: true });
    const api = installFakeApi(routes(page));
    const { router } = mountEditor();
    await loaded();
    fireEvent.click(btn("Discard it and start over"));
    fireEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Discard and start over" }));
    await act(async () => { void router.navigate("/elsewhere"); });
    const dialog = await screen.findByTestId("leave-dialog");
    expect(within(dialog).getByRole("button", { name: "Save and leave" })).toBeInTheDocument();
    expect(puts(api)).toHaveLength(0);
    expect(page.blocksUnreadable).toBe(true);
    fireEvent.click(within(dialog).getByRole("button", { name: "Leave without saving" }));
    await waitFor(() => expect(path(router)).toBe("/elsewhere"));
    expect(puts(api)).toHaveLength(0);
    expect(page.blocksUnreadable).toBe(true);                                     // the unreadable content is still there
  });
});
