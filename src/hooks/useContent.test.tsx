import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import { useMyCollection, useMyCollections, useMyPage, usePublicCollection, usePublicCollections, usePublicPage } from "./useContent";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

let fetchMock: ReturnType<typeof vi.fn>;
const wrapper = ({ children }: { children: ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};
const urls = () => fetchMock.mock.calls.map((c) => String(c[0]));
const headersOf = (i = 0) => (fetchMock.mock.calls[i][1] as RequestInit).headers as Record<string, string>;

beforeEach(() => {
  fetchMock = vi.fn(() => json(200, {}));
  vi.stubGlobal("fetch", fetchMock);
  tokenStore.clear();
});
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });

describe("public hooks", () => {
  it("usePublicPage calls the module-qualified API route", async () => {
    const { result } = renderHook(() => usePublicPage("alice", "java", "core", "intro"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls()).toEqual(["/api/public/pages/alice/java/core/intro"]);
  });

  it("does not fire until every part of the page address is known (never the unqualified route)", async () => {
    renderHook(() => usePublicPage("alice", "java", undefined, "intro"), { wrapper });
    renderHook(() => usePublicCollection("alice", undefined), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("usePublicCollections puts the filters in the query string", async () => {
    const { result } = renderHook(() => usePublicCollections({ category: "programming", q: "java", page: 1 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls()).toEqual(["/api/public/collections?category=programming&q=java&page=1"]);
  });

  it("a 404 is final: no retries, and the error carries the status", async () => {
    fetchMock.mockImplementation(() => json(404, { error: "Not found" }));
    const { result } = renderHook(() => usePublicCollection("alice", "gone"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as { status: number }).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a server error is retried (twice) before it is reported", async () => {
    fetchMock.mockImplementation(() => json(500, { error: "boom" }));
    const { result } = renderHook(() => usePublicCollection("alice", "x"), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("creator workspace hooks", () => {
  it("send the bearer token and hit the owner endpoints", async () => {
    tokenStore.set("tok123");
    const a = renderHook(() => useMyCollections(), { wrapper });
    const b = renderHook(() => useMyCollection(4), { wrapper });
    const c = renderHook(() => useMyPage(9), { wrapper });
    await waitFor(() => expect(a.result.current.isSuccess && b.result.current.isSuccess && c.result.current.isSuccess).toBe(true));
    expect(urls().sort()).toEqual(["/api/collections/4", "/api/collections/mine", "/api/pages/9"]);
    for (let i = 0; i < 3; i++) expect(headersOf(i).Authorization).toBe("Bearer tok123");
  });

  it("the trash list asks for deleted=true", async () => {
    const { result } = renderHook(() => useMyCollections(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls()).toEqual(["/api/collections/mine?deleted=true"]);
  });

  it("do not fire for a missing or non-numeric id", async () => {
    renderHook(() => useMyCollection(undefined), { wrapper });
    renderHook(() => useMyPage(Number.NaN), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a 403 or 404 on someone else's content is final, not retried", async () => {
    tokenStore.set("tok");
    fetchMock.mockImplementation(() => json(403, { error: "You do not own this collection" }));
    const { result } = renderHook(() => useMyCollection(4), { wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
