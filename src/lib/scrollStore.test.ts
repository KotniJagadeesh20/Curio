// Step 14d-3: the scroll position store (brief rev. 2 C1 sequence numbers across reloads, C4 eviction and storage fallback).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Store = typeof import("./scrollStore");
/** A fresh module instance = a page (re)load: in-memory state is gone, sessionStorage stays. */
const load = async (): Promise<Store> => { vi.resetModules(); return import("./scrollStore"); };
const s = (y: number, seq: number, anchor: { id: string; offset: number } | null = null) => ({ y, anchor, seq });
const storedIds = () => Object.keys(sessionStorage).filter((k) => k.startsWith("curio:scroll:")).map((k) => k.slice("curio:scroll:".length)).sort();

beforeEach(() => { sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); sessionStorage.clear(); });

describe("basics", () => {
  it("writes and reads an entry; persisted to sessionStorage", async () => {
    const st = await load();
    const seq = st.nextSeq();
    expect(st.writeEntry("k1|/a", s(120, seq, { id: "block-b0", offset: 40 }))).toBe(true);
    expect(st.readEntry("k1|/a")).toEqual(s(120, seq, { id: "block-b0", offset: 40 }));
    expect(JSON.parse(sessionStorage.getItem("curio:scroll:k1|/a")!)).toEqual(s(120, seq, { id: "block-b0", offset: 40 }));
  });

  it("a write with a LOWER seq than the stored one is ignored; equal or higher replaces", async () => {
    const st = await load();
    st.writeEntry("e", s(500, 10));
    expect(st.writeEntry("e", s(1, 9))).toBe(false);
    expect(st.readEntry("e")!.y).toBe(500);
    expect(st.writeEntry("e", s(600, 10))).toBe(true);
    expect(st.writeEntry("e", s(700, 11))).toBe(true);
    expect(st.readEntry("e")!.y).toBe(700);
  });

  it("corrupt or foreign persisted values are ignored on load", async () => {
    sessionStorage.setItem("curio:scroll:bad", "{not json");
    sessionStorage.setItem("curio:scroll:wrong", JSON.stringify({ y: "x", seq: 1, anchor: null }));
    sessionStorage.setItem("curio:scroll:ok", JSON.stringify(s(5, 3)));
    const st = await load();
    expect(st.readEntry("bad")).toBeUndefined();
    expect(st.readEntry("wrong")).toBeUndefined();
    expect(st.readEntry("ok")).toEqual(s(5, 3));
  });
});

describe("C1: sequence numbers across reloads", () => {
  it("1. entry persisted with seq 150 → reload → nextSeq() > 150 and a new sample for that entry is accepted", async () => {
    let st = await load();
    st.writeEntry("e", s(300, 150));
    st = await load();                                  // reload
    const seq = st.nextSeq();
    expect(seq).toBeGreaterThan(150);
    expect(st.writeEntry("e", s(42, seq))).toBe(true);
    expect(st.readEntry("e")!.y).toBe(42);
  });

  it("2. persisted counter 300 but highest entry 150 → reload → nextSeq() > 300", async () => {
    sessionStorage.setItem("curio:scroll:e", JSON.stringify(s(1, 150)));
    sessionStorage.setItem("curio:scrollseq", "300");
    const st = await load();
    expect(st.nextSeq()).toBeGreaterThan(300);
  });

  it("3. after a reload a stale write (seq 149 < persisted 150) is still ignored", async () => {
    let st = await load();
    st.writeEntry("e", s(300, 150));
    st = await load();
    expect(st.writeEntry("e", s(1, 149))).toBe(false);
    expect(st.readEntry("e")!.y).toBe(300);
  });

  it("4. reload with sessionStorage throwing on read → nextSeq() = 1 and writes work in memory", async () => {
    sessionStorage.setItem("curio:scroll:e", JSON.stringify(s(1, 150)));
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("SecurityError"); });
    vi.spyOn(Storage.prototype, "key").mockImplementation(() => { throw new Error("SecurityError"); });
    const st = await load();
    expect(st.nextSeq()).toBe(1);
    expect(st.writeEntry("x", s(9, 2))).toBe(true);
    expect(st.readEntry("x")!.y).toBe(9);
    expect(st.isPersisting()).toBe(false);
  });

  it("5. one counter for every caller: allocations never repeat (two views in sequence share it)", async () => {
    const st = await load();
    const first = [st.nextSeq(), st.nextSeq()];
    const second = [st.nextSeq(), st.nextSeq()];
    expect(new Set([...first, ...second]).size).toBe(4);
    expect(Math.min(...second)).toBeGreaterThan(Math.max(...first));
  });

  it("the counter is persisted with writes, so a reload continues above it", async () => {
    let st = await load();
    for (let i = 0; i < 5; i++) st.nextSeq();
    const seq = st.nextSeq();
    st.writeEntry("e", s(1, seq));
    st = await load();
    expect(st.nextSeq()).toBeGreaterThan(seq);
  });
});

describe("C4: 200-entry cap and storage failures", () => {
  it("1. 250 writes → exactly the newest 200 (by seq) remain; entries 1–50 are gone", async () => {
    const st = await load();
    for (let i = 1; i <= 250; i++) st.writeEntry(`e${i}`, s(i, st.nextSeq()));
    for (let i = 1; i <= 50; i++) expect(st.readEntry(`e${i}`), `e${i}`).toBeUndefined();
    for (let i = 51; i <= 250; i++) expect(st.readEntry(`e${i}`), `e${i}`).toBeDefined();
  });

  it("2. sessionStorage then holds exactly 200 entries (plus the counter) and none of the evicted ids", async () => {
    const st = await load();
    for (let i = 1; i <= 250; i++) st.writeEntry(`e${i}`, s(i, st.nextSeq()));
    const ids = storedIds();
    expect(ids).toHaveLength(200);
    for (let i = 1; i <= 50; i++) expect(ids).not.toContain(`e${i}`);
    expect(sessionStorage.getItem("curio:scrollseq")).not.toBeNull();
  });

  it("3. setItem throws (quota) from the 120th write on → no exception escapes, memory keeps working with the cap", async () => {
    const st = await load();
    let writes = 0;
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith("curio:scroll:") && ++writes >= 120) throw new DOMException("full", "QuotaExceededError");
      return real.call(this, k, v);
    });
    for (let i = 1; i <= 250; i++) expect(() => st.writeEntry(`e${i}`, s(i, st.nextSeq()))).not.toThrow();
    expect(st.isPersisting()).toBe(false);
    expect(st.readEntry("e250")!.y).toBe(250);
    expect(st.readEntry("e50")).toBeUndefined();
    expect(st.readEntry("e51")).toBeDefined();
  });

  it("4. sessionStorage completely unavailable (getter throws) → write, read and eviction work in memory", async () => {
    vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => { throw new DOMException("denied", "SecurityError"); });
    const st = await load();
    for (let i = 1; i <= 210; i++) st.writeEntry(`e${i}`, s(i, st.nextSeq()));
    expect(st.readEntry("e10")).toBeUndefined();
    expect(st.readEntry("e11")!.y).toBe(11);
    expect(st.readEntry("e210")!.y).toBe(210);
    expect(st.isPersisting()).toBe(false);
  });

  it("5. rewriting an existing entry with a newer seq refreshes its age (not evicted as old)", async () => {
    const st = await load();
    st.writeEntry("keep", s(1, st.nextSeq()));
    for (let i = 1; i <= 150; i++) st.writeEntry(`e${i}`, s(i, st.nextSeq()));
    st.writeEntry("keep", s(2, st.nextSeq()));          // now the newest
    for (let i = 151; i <= 210; i++) st.writeEntry(`e${i}`, s(i, st.nextSeq()));
    expect(st.readEntry("keep")!.y).toBe(2);
    expect(st.readEntry("e1")).toBeUndefined();
  });
});
