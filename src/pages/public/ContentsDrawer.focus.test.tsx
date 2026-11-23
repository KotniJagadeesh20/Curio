// Step 14d-3 review correction (finding 2, sensitivity #9): the Contents drawer's focus hand-off, tested deterministically.
//
// Why a component test: in PageView every link to ANOTHER page replaces the view with its loading state, which unmounts
// the drawer and its "Contents" trigger before Radix's close auto-focus runs, so a real navigation can't show whether the
// prevention is there (see the 14d-3 correction report). Here the drawer stays mounted across the route change, the
// worst case for the hand-off, with the real Radix Sheet. Every focusin is recorded; "Contents" must never be among them.
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { ContentsDrawer } from "./PageView";

function Harness() {
  const { pathname } = useLocation();
  return (
    <>
      <p data-testid="where">{pathname}</p>
      <ContentsDrawer visit="v" currentPath="/a">
        <nav><Link to="/a">Current page</Link><Link to="/b">Another page</Link></nav>
      </ContentsDrawer>
    </>
  );
}
function setup() {
  render(<MemoryRouter initialEntries={["/a"]}><Routes><Route path="*" element={<Harness />} /></Routes></MemoryRouter>);
  const focusins: string[] = [];
  const log = (e: FocusEvent) => {
    const t = e.target as HTMLElement;
    focusins.push(`${t.tagName}:${(t.textContent ?? "").trim()}`);
  };
  document.addEventListener("focusin", log, true);
  const trigger = screen.getByRole("button", { name: "Contents" });
  return { trigger, focusins, done: () => document.removeEventListener("focusin", log, true) };
}
/** Until the dialog is gone AND Radix's deferred (setTimeout 0) unmount auto-focus has had its chance to run. */
async function closed() {
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await act(() => new Promise((r) => setTimeout(r, 50)));
}
const contents = (log: string[]) => log.filter((x) => x === "BUTTON:Contents");

describe("ContentsDrawer focus hand-off (deterministic; drawer kept mounted)", () => {
  it("a link to another page: 'Contents' never receives focus, not even briefly", async () => {
    const { trigger, focusins, done } = setup();
    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog");
    const opened = focusins.length;                              // opening focuses inside the dialog; only log what follows
    fireEvent.click(within(drawer).getByRole("link", { name: "Another page" }));
    await closed();
    expect(screen.getByTestId("where").textContent).toBe("/b");
    expect(contents(focusins.slice(opened))).toEqual([]);
    expect(document.activeElement).not.toBe(trigger);
    done();
  });

  it("control: Escape returns focus to 'Contents' (Radix's close auto-focus is active in this harness)", async () => {
    const { trigger, focusins, done } = setup();
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    const opened = focusins.length;
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await closed();
    expect(contents(focusins.slice(opened))).toEqual(["BUTTON:Contents"]);
    expect(document.activeElement).toBe(trigger);
    done();
  });

  it("control: the current page's own link keeps the default (focus back on 'Contents')", async () => {
    const { trigger, focusins, done } = setup();
    fireEvent.click(trigger);
    const drawer = await screen.findByRole("dialog");
    const opened = focusins.length;
    fireEvent.click(within(drawer).getByRole("link", { name: "Current page" }));
    await closed();
    expect(contents(focusins.slice(opened))).toEqual(["BUTTON:Contents"]);
    expect(document.activeElement).toBe(trigger);
    done();
  });

  it("the flag is per close: after a navigation close, a later Escape still returns focus to 'Contents'", async () => {
    const { trigger, focusins, done } = setup();
    fireEvent.click(trigger);
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("link", { name: "Another page" }));
    await closed();
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    const opened = focusins.length;
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await closed();
    expect(contents(focusins.slice(opened))).toEqual(["BUTTON:Contents"]);
    done();
  });
});
