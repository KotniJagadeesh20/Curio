import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_MAX_WAIT_MS, RETRY_BACKOFF_MS, SaveBlocked, useAutosave, type SaveMode } from "./useAutosave";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

/** A tiny model of an editor: `edit()` changes the text; a successful save records what it sent and cleans the page. */
function setup(opts: { enabled?: boolean; save?: (text: string, mode: SaveMode) => Promise<void> } = {}) {
  const m = { text: "", saved: "" };
  const sent: { text: string; mode: SaveMode; at: number }[] = [];
  let running = 0, maxRunning = 0;
  const save = vi.fn(async (mode: SaveMode) => {
    running++; maxRunning = Math.max(maxRunning, running);
    const text = m.text;                                   // reads the LATEST state when it runs
    sent.push({ text, mode, at: Date.now() });
    try {
      await opts.save?.(text, mode);
      m.saved = text;                                      // success: this is now the baseline
    } finally { running--; }
  });
  const hook = renderHook((p: { revision: string; enabled: boolean }) =>
    useAutosave({ revision: p.revision, dirty: p.revision !== "r:" + m.saved, enabled: p.enabled, isDirty: () => m.text !== m.saved, save }),
    { initialProps: { revision: "r:", enabled: opts.enabled ?? true } });
  const edit = (text: string, enabled = opts.enabled ?? true) => {
    m.text = text;
    hook.rerender({ revision: "r:" + text, enabled });
  };
  const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  return { m, sent, save, hook, edit, advance, maxRunning: () => maxRunning };
}

describe("debounce and max-wait", () => {
  it("saves once, 1.5 s after the last edit, and not a moment earlier", async () => {
    const t = setup();
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS - 1);
    expect(t.save).not.toHaveBeenCalled();
    await t.advance(1);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.sent[0]).toMatchObject({ text: "a", mode: "auto" });
  });

  it("rapid edits restart the debounce: five edits 500 ms apart produce ONE save, 1.5 s after the last", async () => {
    const t = setup();
    for (const x of ["a", "ab", "abc", "abcd", "abcde"]) { t.edit(x); await t.advance(500); }
    expect(t.save).not.toHaveBeenCalled();
    await t.advance(AUTOSAVE_DEBOUNCE_MS - 500);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.sent[0].text).toBe("abcde");
  });

  it("continuous typing still saves: never later than 15 s after the first unsaved edit", async () => {
    const t = setup();
    const start = Date.now();
    let text = "";
    for (let i = 0; i < 20; i++) { text += "x"; t.edit(text); await t.advance(1000); }
    expect(t.save).toHaveBeenCalled();
    const first = t.sent[0].at - start;
    expect(first).toBeGreaterThanOrEqual(AUTOSAVE_MAX_WAIT_MS - 1000);
    expect(first).toBeLessThanOrEqual(AUTOSAVE_MAX_WAIT_MS);
  });

  it("saves nothing for a clean page, and nothing when autosave is not allowed", async () => {
    const clean = setup();
    await clean.advance(60_000);
    expect(clean.save).not.toHaveBeenCalled();
    const off = setup({ enabled: false });
    off.edit("a", false);
    await off.advance(60_000);
    expect(off.save).not.toHaveBeenCalled();
  });

  it("turning autosave off while a debounce is pending cancels it", async () => {
    const t = setup();
    t.edit("a");
    await t.advance(1000);
    t.edit("a", false);                                    // e.g. the page was published meanwhile
    await t.advance(60_000);
    expect(t.save).not.toHaveBeenCalled();
  });

  it("unmounting cancels a pending save", async () => {
    const t = setup();
    t.edit("a");
    t.hook.unmount();
    await t.advance(60_000);
    expect(t.save).not.toHaveBeenCalled();
  });
});

describe("single flight and the latest snapshot", () => {
  it("never overlaps: edits during a save wait, then exactly ONE follow-up request carries the latest text", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    const t = setup({ save: async () => { if (first) { first = false; await gate; } } });
    t.edit("one");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.status).toBe("saving");
    for (const x of ["one two", "one two three", "one two three four"]) { t.edit(x); await t.advance(2000); }
    expect(t.save).toHaveBeenCalledTimes(1);               // still the first request: nothing else started
    release();
    await t.advance(0);                                     // let React render the end of the first save, then the clock moves on
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.save).toHaveBeenCalledTimes(2);
    expect(t.sent.map((s) => s.text)).toEqual(["one", "one two three four"]);
    expect(t.maxRunning()).toBe(1);
    expect(t.hook.result.current.status).toBe("idle");
  });

  it("a flush while a save runs joins it instead of starting a second request, then saves what is left", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    const t = setup({ save: async () => { if (first) { first = false; await gate; } } });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    t.edit("ab");
    let done: boolean | undefined;
    const p = t.hook.result.current.flush().then((v) => { done = v; });
    await t.advance(10);
    expect(t.save).toHaveBeenCalledTimes(1);
    release();
    await act(async () => { await p; });
    expect(done).toBe(true);
    expect(t.sent.map((s) => s.text)).toEqual(["a", "ab"]);
    expect(t.maxRunning()).toBe(1);
  });

  // The invariant: at most one PUT in flight, whatever combination of triggers arrives. `maxRunning` counts overlapping requests.
  const gated = () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    let first = true;
    return { release: () => release(), save: async () => { if (first) { first = false; await gate; } } };
  };

  it("TWO flushes (e.g. Save + navigation guard) joining one running save, with edits made meanwhile: ONE follow-up request, not two", async () => {
    const g = gated();
    const t = setup({ save: g.save });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    t.edit("ab");                                          // dirty again while request 1 runs
    const f1 = t.hook.result.current.flush("manual");
    const f2 = t.hook.result.current.flush("auto");
    g.release();
    let r: boolean[] = [];
    await act(async () => { r = await Promise.all([f1, f2]); });
    expect(r).toEqual([true, true]);
    expect(t.sent.map((s) => s.text)).toEqual(["a", "ab"]);
    expect(t.maxRunning()).toBe(1);
  });

  it("the debounce timer firing, then a manual flush, then more flushes while it runs: still one request at a time", async () => {
    const g = gated();
    const t = setup({ save: g.save });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);                 // debounce fired: request 1 in flight
    const f = [t.hook.result.current.flush("manual"), t.hook.result.current.flush("manual")];
    await t.advance(60_000);                               // no timer may start another while it is in flight
    expect(t.save).toHaveBeenCalledTimes(1);
    g.release();
    await act(async () => { await Promise.all(f); });
    expect(t.save).toHaveBeenCalledTimes(1);               // the flushes joined it: nothing was left to send
    expect(t.maxRunning()).toBe(1);
  });

  it("a flush while a retry is scheduled cancels the timer: the retry never fires on top of the flush's request", async () => {
    let n = 0;
    const g = gated();
    const t = setup({ save: async () => { if (n++ === 0) throw new Error("network"); await g.save(); } });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);                 // request 1 fails -> retry scheduled
    expect(t.hook.result.current.status).toBe("retrying");
    const f = t.hook.result.current.flush("manual");       // request 2 starts now and is held open
    await t.advance(RETRY_BACKOFF_MS[0] + 60_000);         // the old retry timer would have fired here
    expect(t.save).toHaveBeenCalledTimes(2);
    expect(t.maxRunning()).toBe(1);
    g.release();
    await act(async () => { await f; });
    expect(t.maxRunning()).toBe(1);
  });

  it("a retry timer firing while a flush's request is in flight cannot start another (timer and flush racing)", async () => {
    let n = 0;
    const g = gated();
    const t = setup({ save: async () => { if (n++ === 0) throw new Error("network"); await g.save(); } });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    await t.advance(RETRY_BACKOFF_MS[0]);                  // the retry fires: request 2 held open
    expect(t.save).toHaveBeenCalledTimes(2);
    const f = t.hook.result.current.flush("auto");         // guard flush while the retry's request runs
    await t.advance(60_000);
    expect(t.save).toHaveBeenCalledTimes(2);
    g.release();
    await act(async () => { await f; });
    expect(t.maxRunning()).toBe(1);
  });

  it("a flush on a clean page sends nothing; on a dirty one it saves immediately in the given mode", async () => {
    const t = setup();
    await act(async () => { expect(await t.hook.result.current.flush()).toBe(true); });
    expect(t.save).not.toHaveBeenCalled();
    t.edit("a");
    await act(async () => { expect(await t.hook.result.current.flush("manual")).toBe(true); });
    expect(t.sent).toMatchObject([{ text: "a", mode: "manual" }]);
    await t.advance(60_000);
    expect(t.save).toHaveBeenCalledTimes(1);               // the pending debounce was cancelled by the flush
  });

  it("flush works even when autosave is not allowed (a published page's explicit Save)", async () => {
    const t = setup({ enabled: false });
    t.edit("a", false);
    await act(async () => { expect(await t.hook.result.current.flush("manual")).toBe(true); });
    expect(t.save).toHaveBeenCalledTimes(1);
  });
});

describe("failures", () => {
  const network = () => Promise.reject(new TypeError("Failed to fetch"));

  it("retries a network failure after 2 s, 5 s, then 15 s, then stops and waits for the user", async () => {
    const t = setup({ save: network });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.save).toHaveBeenCalledTimes(1);
    expect(t.hook.result.current.status).toBe("retrying");
    await t.advance(RETRY_BACKOFF_MS[0] - 1);
    expect(t.save).toHaveBeenCalledTimes(1);
    await t.advance(1);
    expect(t.save).toHaveBeenCalledTimes(2);
    await t.advance(RETRY_BACKOFF_MS[1]);
    expect(t.save).toHaveBeenCalledTimes(3);
    await t.advance(RETRY_BACKOFF_MS[2]);
    expect(t.save).toHaveBeenCalledTimes(4);
    expect(t.hook.result.current.status).toBe("failed");
    await t.advance(10 * 60_000);
    expect(t.save).toHaveBeenCalledTimes(4);               // no fifth automatic attempt
  });

  it("a 5xx is retried; the retry sends the LATEST text, and editing during the wait does not hammer the server", async () => {
    let fail = true;
    const t = setup({ save: async () => { if (fail) throw new ApiError(503, "Unavailable"); } });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.hook.result.current.status).toBe("retrying");
    t.edit("a b");
    await t.advance(1000);
    t.edit("a b c");
    await t.advance(500);
    expect(t.save).toHaveBeenCalledTimes(1);               // still waiting for the 2 s backoff
    fail = false;
    await t.advance(RETRY_BACKOFF_MS[0]);
    expect(t.sent.map((s) => s.text)).toEqual(["a", "a b c"]);
    expect(t.hook.result.current.status).toBe("idle");
  });

  it.each([[401], [403], [404], [409]])("%s is never retried automatically", async (status) => {
    const t = setup({ save: () => Promise.reject(new ApiError(status, "no")) });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.hook.result.current.status).toBe("failed");
    t.edit("a b");                                         // even more typing does not restart it
    await t.advance(10 * 60_000);
    expect(t.save).toHaveBeenCalledTimes(1);
  });

  it("a 400 pauses autosave until the content changes, then tries again", async () => {
    let bad = true;
    const t = setup({ save: async () => { if (bad) throw new ApiError(400, "invalid"); } });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.hook.result.current.status).toBe("paused");
    await t.advance(60_000);
    expect(t.save).toHaveBeenCalledTimes(1);
    bad = false;
    t.edit("a fixed");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.save).toHaveBeenCalledTimes(2);
    expect(t.hook.result.current.status).toBe("idle");
  });

  it("SaveBlocked (nothing valid to send yet) pauses until the next edit and sends nothing", async () => {
    let invalid = true;
    const t = setup({ save: async () => { if (invalid) throw new SaveBlocked("A title is required"); } });
    t.edit("a");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.hook.result.current.status).toBe("paused");
    expect(t.hook.result.current.error).toBeInstanceOf(SaveBlocked);
    await t.advance(60_000);
    expect(t.save).toHaveBeenCalledTimes(1);
    invalid = false;
    t.edit("ab");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.save).toHaveBeenCalledTimes(2);
  });

  it("a manual flush retries immediately after any failure, and reports false while it keeps failing (edits stay in memory)", async () => {
    let fail = true;
    const t = setup({ save: async () => { if (fail) throw new ApiError(403, "no"); } });
    t.edit("precious");
    await t.advance(AUTOSAVE_DEBOUNCE_MS);
    expect(t.hook.result.current.status).toBe("failed");
    await act(async () => { expect(await t.hook.result.current.flush("manual")).toBe(false); });
    expect(t.save).toHaveBeenCalledTimes(2);
    expect(t.m.text).toBe("precious");
    fail = false;
    await act(async () => { expect(await t.hook.result.current.flush("manual")).toBe(true); });
    expect(t.m.saved).toBe("precious");
    expect(t.hook.result.current.status).toBe("idle");
  });
});
