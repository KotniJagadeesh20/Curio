import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
import { ShareButton } from "./ShareButton";

function stubNavigator(o: { share?: unknown; canShare?: unknown; clipboard?: unknown }) {
  for (const k of ["share", "canShare", "clipboard"] as const) {
    Object.defineProperty(navigator, k, { value: o[k], configurable: true, writable: true });
  }
}
const URL_ = `${window.location.origin}/@alice/lisbon/day-1/arrival`;
const show = () => render(<ShareButton what="page" title="Arrival · Lisbon" path="/@alice/lisbon/day-1/arrival" />);
const shareBtn = () => screen.getByRole("button", { name: "Share this page" });
const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };

beforeEach(() => { toast.success.mockClear(); toast.error.mockClear(); });
afterEach(() => stubNavigator({}));

describe("ShareButton", () => {
  it("labels: visible 'Share', accessible name per kind", () => {
    show();
    expect(shareBtn()).toHaveTextContent("Share");
    render(<ShareButton what="collection" title="Lisbon" path="/@alice/lisbon" />);
    expect(screen.getByRole("button", { name: "Share this collection" })).toBeInTheDocument();
  });

  it("Step 15b: a profile's button is named 'Share this profile'", () => {
    render(<ShareButton what="profile" title="Alice Liddell" path="/@alice" />);
    expect(screen.getByRole("button", { name: "Share this profile" })).toHaveTextContent("Share");
  });

  it("native share: canonical URL and title, no toast, no popover", async () => {
    const share = vi.fn(async () => {});
    stubNavigator({ share });
    show();
    await click(shareBtn());
    expect(share).toHaveBeenCalledWith({ title: "Arrival · Lisbon", url: URL_ });
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("share sheet cancelled → nothing shown", async () => {
    stubNavigator({ share: vi.fn(async () => { throw Object.assign(new Error("x"), { name: "AbortError" }); }), clipboard: { writeText: vi.fn() } });
    show();
    await click(shareBtn());
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("no share sheet → copied to the clipboard → 'Link copied' toast, no popover", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ clipboard: { writeText } });
    show();
    await click(shareBtn());
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(toast.success).toHaveBeenCalledWith("Link copied");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("clipboard refused → manual-copy popover: URL shown, focused and selected, with instructions", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    show();
    await click(shareBtn());
    const input = await screen.findByTestId("share-url") as HTMLInputElement;
    expect(input).toHaveValue(URL_);
    expect(input).toHaveAttribute("readonly");
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, URL_.length]);
    expect(input).toHaveAccessibleDescription(/press Ctrl\+C \(⌘C on Mac\)/);
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("no clipboard at all → the same popover", async () => {
    stubNavigator({});
    show();
    await click(shareBtn());
    expect(await screen.findByTestId("share-url")).toHaveValue(URL_);
  });

  it("Copy retries the clipboard: success → toast and the popover closes", async () => {
    let allowed = false;
    const writeText = vi.fn(async () => { if (!allowed) throw new Error("denied"); });
    stubNavigator({ clipboard: { writeText } });
    show();
    await click(shareBtn());
    await screen.findByTestId("share-url");
    allowed = true;
    await click(screen.getByRole("button", { name: "Copy" }));
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledWith("Link copied");
    await waitFor(() => expect(screen.queryByTestId("share-url")).toBeNull());
  });

  it("Copy retry fails → URL re-selected and focused, instructions emphasised, popover stays", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    show();
    await click(shareBtn());
    const input = await screen.findByTestId("share-url") as HTMLInputElement;
    await click(screen.getByRole("button", { name: "Copy" }));
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, URL_.length]);
    expect(input).toHaveAccessibleDescription("Copy wasn't allowed. Press Ctrl+C (⌘C on Mac) now.");
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByTestId("share-url")).toBeInTheDocument();
  });

  it("Escape closes the popover and returns focus to Share; reopening starts with the first instructions again", async () => {
    stubNavigator({ clipboard: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    show();
    await click(shareBtn());
    await screen.findByTestId("share-url");
    await click(screen.getByRole("button", { name: "Copy" }));     // emphasised hint
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("share-url")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(shareBtn()));
    await click(shareBtn());
    expect(await screen.findByTestId("share-url")).toHaveAccessibleDescription(/didn't allow copying automatically/);
  });

  it("a double click while a share is in progress starts only one share", async () => {
    let finish: () => void = () => {};
    const share = vi.fn(() => new Promise<void>((r) => { finish = r; }));
    stubNavigator({ share });
    show();
    fireEvent.click(shareBtn());
    fireEvent.click(shareBtn());
    expect(share).toHaveBeenCalledTimes(1);
    expect(shareBtn()).toHaveAttribute("aria-busy", "true");
    await act(async () => { finish(); });
    expect(shareBtn()).not.toHaveAttribute("aria-busy");
    await click(shareBtn());                                       // a later click shares again
    expect(share).toHaveBeenCalledTimes(2);
  });

  it("clicking Share again after a copy copies again (no stale state)", async () => {
    const writeText = vi.fn(async () => {});
    stubNavigator({ clipboard: { writeText } });
    show();
    await click(shareBtn());
    await click(shareBtn());
    expect(writeText).toHaveBeenCalledTimes(2);
    expect(toast.success).toHaveBeenCalledTimes(2);
  });
});
