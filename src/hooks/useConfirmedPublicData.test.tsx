import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useConfirmedPublicData } from "./useConfirmedPublicData";

/** A promise the test settles by hand. */
function deferred() {
  let resolve: () => void = () => {}, reject: (e: unknown) => void = () => {};
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

type Q = { data: string | undefined; dataUpdatedAt: number; isFetching: boolean; isError: boolean };
const q = (o: Partial<Q>): Q => ({ data: "cached", dataUpdatedAt: Date.now() - 60_000, isFetching: false, isError: false, ...o });

describe("useConfirmedPublicData", () => {
  it("hides cached data from before the visit while it is being revalidated", () => {
    const { result } = renderHook(() => useConfirmedPublicData(q({ isFetching: true }), "a"));
    expect(result.current).toBeUndefined();
  });

  it("returns cached data that is not being revalidated", () => {
    const { result } = renderHook(() => useConfirmedPublicData(q({}), "a"));
    expect(result.current).toBe("cached");
  });

  it("returns data once it has been fetched during this visit, even while another fetch runs", () => {
    const { result, rerender } = renderHook((p: Q) => useConfirmedPublicData(p, "a"), { initialProps: q({ isFetching: true }) });
    expect(result.current).toBeUndefined();
    rerender(q({ data: "fresh", dataUpdatedAt: Date.now() + 1, isFetching: true }));
    expect(result.current).toBe("fresh");
  });

  it("never returns data after an error (404 or other), even data fetched during this visit", () => {
    const { result } = renderHook(() => useConfirmedPublicData(q({ data: "fresh", dataUpdatedAt: Date.now() + 1, isError: true }), "a"));
    expect(result.current).toBeUndefined();
  });

  it("restarts the visit when the key changes: data confirmed for the old key isn't trusted for the new one", async () => {
    const tick = () => new Promise((r) => setTimeout(r, 5));
    const { result, rerender } = renderHook(({ p, k }: { p: Q; k: string }) => useConfirmedPublicData(p, k),
      { initialProps: { p: q({ isFetching: true }), k: "a" } });
    expect(result.current).toBeUndefined();
    await tick();
    const fetchedDuringA = q({ data: "x", dataUpdatedAt: Date.now(), isFetching: true });   // after visit "a" opened
    rerender({ p: fetchedDuringA, k: "a" });
    expect(result.current).toBe("x");
    await tick();
    rerender({ p: fetchedDuringA, k: "b" });                                             // older than visit "b"
    expect(result.current).toBeUndefined();
  });

  it("returns nothing when there is no data", () => {
    const { result } = renderHook(() => useConfirmedPublicData(q({ data: undefined }), "a"));
    expect(result.current).toBeUndefined();
  });
});

describe("useConfirmedPublicData with revalidateOnVisit (14c: a query whose key doesn't change between visits)", () => {
  it("starts its own request when the visit starts and on every visit change, superseding one in flight", () => {
    const refetch = vi.fn(() => new Promise<void>(() => {}))   // left pending: only the calls matter here;
    const { rerender } = renderHook(({ k }: { k: string }) => useConfirmedPublicData({ ...q({}), refetch }, k, { revalidateOnVisit: true }), { initialProps: { k: "a" } });
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledWith({ cancelRefetch: true });
    rerender({ k: "a" });
    expect(refetch).toHaveBeenCalledTimes(1);
    rerender({ k: "b" });
    expect(refetch).toHaveBeenCalledTimes(2);
  });

  it("cached data that isn't being fetched is NOT confirmed: only after this visit's own request settles", async () => {
    const r = deferred();
    const refetch = vi.fn(() => r.promise);
    const { result, rerender } = renderHook((p: Q) => useConfirmedPublicData({ ...p, refetch }, "a", { revalidateOnVisit: true }), { initialProps: q({ isFetching: false }) });
    expect(result.current).toBeUndefined();
    rerender(q({ data: "fresh", dataUpdatedAt: Date.now() + 5 }));    // even a newer timestamp doesn't confirm on its own
    expect(result.current).toBeUndefined();
    await act(async () => { r.resolve(); });
    rerender(q({ data: "fresh", dataUpdatedAt: Date.now() + 5 }));
    expect(result.current).toBe("fresh");
  });

  it("never returns data after an error", () => {
    const { result } = renderHook(() => useConfirmedPublicData({ ...q({ dataUpdatedAt: Date.now() + 1, isError: true }), refetch: () => new Promise<void>(() => {}) }, "a", { revalidateOnVisit: true }));
    expect(result.current).toBeUndefined();
  });

  it("without the option, no refetch is triggered (14b behavior)", () => {
    const refetch = vi.fn(async () => undefined);
    renderHook(() => useConfirmedPublicData({ ...q({}), refetch }, "a"));
    expect(refetch).not.toHaveBeenCalled();
  });
});

describe("useConfirmedPublicData revalidateOnVisit: visit-scoped confirmation (review round 2)", () => {
  const opts = { revalidateOnVisit: true } as const;

  it("cached data whose dataUpdatedAt EQUALS the visit start time is not treated as confirmed", async () => {
    const T = 1_800_000_000_000;
    const now = vi.spyOn(Date, "now").mockReturnValue(T);
    const r = deferred();
    const { result, rerender } = renderHook((p: Q) => useConfirmedPublicData({ ...p, refetch: () => r.promise }, "a", opts),
      { initialProps: q({ data: "cached", dataUpdatedAt: T, isFetching: false }) });
    expect(result.current).toBeUndefined();
    rerender(q({ data: "cached", dataUpdatedAt: T, isFetching: true }));
    expect(result.current).toBeUndefined();
    await act(async () => { r.resolve(); });
    rerender(q({ data: "fresh", dataUpdatedAt: T }));          // same millisecond, but this visit's request has settled
    expect(result.current).toBe("fresh");
    now.mockRestore();
  });

  it("a request still in flight from the previous visit can't confirm the new one; only the new visit's request does", async () => {
    const reqs: ReturnType<typeof deferred>[] = [];
    const refetch = vi.fn(() => { const d = deferred(); reqs.push(d); return d.promise; });
    const { result, rerender } = renderHook(({ k, p }: { k: string; p: Q }) => useConfirmedPublicData({ ...p, refetch }, k, opts),
      { initialProps: { k: "a", p: q({}) } });
    expect(reqs).toHaveLength(1);                                 // visit a's request, still pending
    rerender({ k: "b", p: q({}) });                               // the URL changes while it is in flight
    expect(reqs).toHaveLength(2);
    expect(refetch).toHaveBeenLastCalledWith({ cancelRefetch: true });
    await act(async () => { reqs[0].resolve(); });               // visit a's request completes after visit b began
    rerender({ k: "b", p: q({ data: "from a's request", dataUpdatedAt: Date.now() + 1 }) });
    expect(result.current).toBeUndefined();
    await act(async () => { reqs[1].resolve(); });               // visit b's own request
    rerender({ k: "b", p: q({ data: "b", dataUpdatedAt: Date.now() + 2 }) });
    expect(result.current).toBe("b");
  });

  it("an older visit's request completing AFTER the newer visit was confirmed changes nothing", async () => {
    const reqs: ReturnType<typeof deferred>[] = [];
    const refetch = vi.fn(() => { const d = deferred(); reqs.push(d); return d.promise; });
    const { result, rerender } = renderHook(({ k, p }: { k: string; p: Q }) => useConfirmedPublicData({ ...p, refetch }, k, opts),
      { initialProps: { k: "a", p: q({}) } });
    rerender({ k: "b", p: q({}) });
    await act(async () => { reqs[1].resolve(); });
    rerender({ k: "b", p: q({ data: "b" }) });
    expect(result.current).toBe("b");
    await act(async () => { reqs[0].resolve(); });
    rerender({ k: "b", p: q({ data: "b" }) });
    expect(result.current).toBe("b");
    rerender({ k: "a", p: q({ data: "b" }) });                    // going back to "a" is a NEW visit: a's old request doesn't count
    expect(result.current).toBeUndefined();
    expect(reqs).toHaveLength(3);
  });

  it("only the current visit's request confirms: a failed one shows nothing until a later success (retry)", async () => {
    const r = deferred();
    const { result, rerender } = renderHook((p: Q) => useConfirmedPublicData({ ...p, refetch: () => r.promise }, "a", opts), { initialProps: q({}) });
    await act(async () => { r.reject(new Error("503")); });
    rerender(q({ isError: true }));
    expect(result.current).toBeUndefined();
    rerender(q({ data: "retried", isError: false }));             // the retry's success
    expect(result.current).toBe("retried");
  });

  it("a request that was already running when the visit began (no data, so it can't be superseded) is followed by the visit's own request", async () => {
    const reqs: ReturnType<typeof deferred>[] = [];
    const refetch = vi.fn(() => { const d = deferred(); reqs.push(d); return d.promise; });
    const { result, rerender } = renderHook((p: Q) => useConfirmedPublicData({ ...p, refetch }, "a", { ...opts, isFetchingInCache: () => true }),
      { initialProps: q({ data: undefined, isFetching: true }) });
    expect(reqs).toHaveLength(1);                                 // joins the running request
    await act(async () => { reqs[0].resolve(); });
    rerender(q({ data: "requested before the visit", dataUpdatedAt: Date.now() + 1 }));
    expect(result.current).toBeUndefined();
    expect(reqs).toHaveLength(2);                                 // then sends its own
    await act(async () => { reqs[1].resolve(); });
    rerender(q({ data: "own" }));
    expect(result.current).toBe("own");
  });

  it("unmounting ends the visit: a late response doesn't update anything", async () => {
    const r = deferred();
    const { unmount } = renderHook(() => useConfirmedPublicData({ ...q({}), refetch: () => r.promise }, "a", opts));
    unmount();
    await act(async () => { r.resolve(); });                      // no error, no state update after unmount
  });
});

describe("useConfirmedPublicData revalidateOnVisit: revisiting a URL is a new visit (review round 3)", () => {
  const opts = { revalidateOnVisit: true } as const;
  const setup = () => {
    const reqs: ReturnType<typeof deferred>[] = [];
    const refetch = vi.fn(() => { const d = deferred(); reqs.push(d); return d.promise; });
    const hook = renderHook(({ k, p }: { k: string; p: Q }) => useConfirmedPublicData({ ...p, refetch }, k, opts),
      { initialProps: { k: "A", p: q({}) } });
    return { reqs, ...hook };
  };

  it("A settles → B (pending) → back to A: A stays hidden until the THIRD visit's own request settles", async () => {
    const { reqs, result, rerender } = setup();
    await act(async () => { reqs[0].resolve(); });               // visit 1 (A) confirmed
    rerender({ k: "A", p: q({ data: "A1" }) });
    expect(result.current).toBe("A1");
    rerender({ k: "B", p: q({ data: "A1" }) });                   // visit 2 (B), its request left pending
    expect(result.current).toBeUndefined();
    rerender({ k: "A", p: q({ data: "A1" }) });                   // visit 3 (A again)
    expect(reqs).toHaveLength(3);
    expect(result.current).toBeUndefined();                       // visit 1's confirmation is not reused
    await act(async () => { reqs[1].resolve(); });               // B's request settles late: not this visit's
    rerender({ k: "A", p: q({ data: "from B's request" }) });
    expect(result.current).toBeUndefined();
    await act(async () => { reqs[2].resolve(); });               // visit 3's own request
    rerender({ k: "A", p: q({ data: "A3" }) });
    expect(result.current).toBe("A3");
  });

  it("an OLDER request for the same URL A (still pending from visit 1) can't confirm the third visit", async () => {
    const { reqs, result, rerender } = setup();                   // visit 1 (A): request 0 left pending
    rerender({ k: "B", p: q({}) });                               // visit 2 (B): request 1
    rerender({ k: "A", p: q({}) });                               // visit 3 (A): request 2
    expect(reqs).toHaveLength(3);
    await act(async () => { reqs[0].resolve(); });               // visit 1's A request completes now
    rerender({ k: "A", p: q({ data: "old A" }) });
    expect(result.current).toBeUndefined();
    await act(async () => { reqs[1].resolve(); });
    rerender({ k: "A", p: q({ data: "old A" }) });
    expect(result.current).toBeUndefined();
    await act(async () => { reqs[2].resolve(); });
    rerender({ k: "A", p: q({ data: "latest A" }) });
    expect(result.current).toBe("latest A");
  });

  it("A → B → A where every earlier request already settled: still a fresh confirmation for the third visit", async () => {
    const { reqs, result, rerender } = setup();
    await act(async () => { reqs[0].resolve(); });
    rerender({ k: "B", p: q({ data: "x" }) });
    await act(async () => { reqs[1].resolve(); });
    rerender({ k: "B", p: q({ data: "B" }) });
    expect(result.current).toBe("B");
    rerender({ k: "A", p: q({ data: "B" }) });
    expect(result.current).toBeUndefined();
    await act(async () => { reqs[2].resolve(); });
    rerender({ k: "A", p: q({ data: "A3" }) });
    expect(result.current).toBe("A3");
  });
});
