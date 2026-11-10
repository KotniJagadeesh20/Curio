import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setUnauthorizedHandler, tokenStore } from "@/lib/api";
import { useCategories } from "./useContent";
import {
  useCreateCollection, useCreateModule, useCreatePage, useDeleteCollection, useDeleteModule, useDeletePage,
  usePublishCollection, usePublishPage, useReorderModule, useReorderPage, useRestoreCollection,
  useUnpublishCollection, useUpdateCollection, useUpdateModule, useUpdatePage,
} from "./useCreatorMutations";

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

let fetchMock: ReturnType<typeof vi.fn>;
let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const call = (i = 0) => {
  const [url, init] = fetchMock.mock.calls[i] as [string, RequestInit];
  return { url, method: init.method, body: init.body ? JSON.parse(String(init.body)) : undefined, headers: init.headers as Record<string, string> };
};

/** Seeds one cached entry per key a write could touch, then reports which ones were marked stale. */
const KEYS = {
  list: ["mine", "collections", { deleted: false }],
  deletedList: ["mine", "collections", { deleted: true }],
  c5: ["mine", "collection", 5],
  c6: ["mine", "collection", 6],
  p9: ["mine", "page", 9],
  p10: ["mine", "page", 10],
  pub: ["public", "collection", "alice", "java"],
};
const seed = () => Object.values(KEYS).forEach((k) => qc.setQueryData(k, { seeded: true }));
const stale = () => Object.entries(KEYS).filter(([, k]) => qc.getQueryState(k)?.isInvalidated).map(([n]) => n).sort();

beforeEach(() => {
  fetchMock = vi.fn(() => json(200, {}));
  vi.stubGlobal("fetch", fetchMock);
  tokenStore.set("tok");
  qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } });
  seed();
});
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); setUnauthorizedHandler(null); });

async function run<T>(hook: () => { mutateAsync: (v: never) => Promise<unknown> }, vars: T) {
  const { result } = renderHook(hook, { wrapper });
  await act(async () => { await result.current.mutateAsync(vars as never); });
}

describe("requests: exact method, path, body and bearer token", () => {
  const cases: Array<[string, () => { mutateAsync: (v: never) => Promise<unknown> }, unknown, string, string, unknown]> = [
    ["create collection", () => useCreateCollection(), { title: "T", slug: "t", categoryId: 2 }, "POST", "/api/collections", { title: "T", slug: "t", categoryId: 2 }],
    ["update collection", () => useUpdateCollection(5), { title: "T2", description: "" }, "PUT", "/api/collections/5", { title: "T2", description: "" }],
    ["delete collection", () => useDeleteCollection(), 5, "DELETE", "/api/collections/5", undefined],
    ["restore collection", () => useRestoreCollection(), 5, "POST", "/api/collections/5/restore", {}],
    ["publish collection", () => usePublishCollection(), { id: 5 }, "POST", "/api/collections/5/publish", {}],
    ["publish collection unlisted", () => usePublishCollection(), { id: 5, status: "UNLISTED" }, "POST", "/api/collections/5/publish", { status: "UNLISTED" }],
    ["unpublish collection", () => useUnpublishCollection(), 5, "POST", "/api/collections/5/unpublish", {}],
    ["create module", () => useCreateModule(5), { title: "M" }, "POST", "/api/collections/5/modules", { title: "M" }],
    ["update module", () => useUpdateModule(5), { id: 7, input: { title: "M2" } }, "PUT", "/api/modules/7", { title: "M2" }],
    ["delete module", () => useDeleteModule(5), 7, "DELETE", "/api/modules/7", undefined],
    ["reorder module", () => useReorderModule(5), { id: 7, position: 2 }, "PATCH", "/api/modules/7/reorder", { position: 2 }],
    ["create page", () => useCreatePage(5), { moduleId: 7, input: { title: "P", summary: "s" } }, "POST", "/api/modules/7/pages", { title: "P", summary: "s" }],
    ["update page", () => useUpdatePage(5), { id: 9, input: { title: "P2" } }, "PUT", "/api/pages/9", { title: "P2" }],
    ["publish page", () => usePublishPage(5), { id: 9, publish: true }, "POST", "/api/pages/9/publish", {}],
    ["unpublish page", () => usePublishPage(5), { id: 9, publish: false }, "POST", "/api/pages/9/unpublish", {}],
    ["delete page", () => useDeletePage(5), 9, "DELETE", "/api/pages/9", undefined],
    ["reorder page", () => useReorderPage(5), { id: 9, position: 0 }, "PATCH", "/api/pages/9/reorder", { position: 0 }],
  ];
  it.each(cases)("%s", async (_n, hook, vars, method, url, body) => {
    fetchMock.mockImplementation(() => json(method === "DELETE" ? 204 : 200, {}));
    await run(hook, vars);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const c = call();
    expect(c.method).toBe(method);
    expect(c.url).toBe(url);
    expect(c.body).toEqual(body);
    expect(c.headers.Authorization).toBe("Bearer tok");
  });

  it("never sends an owner or status field it was not given (the server owns those)", async () => {
    await run(() => useCreateCollection(), { title: "T" });
    expect(Object.keys(call().body)).toEqual(["title"]);
  });
});

describe("cache invalidation is targeted", () => {
  it("creating a collection refreshes only the lists", async () => {
    await run(() => useCreateCollection(), { title: "T" });
    expect(stale()).toEqual(["deletedList", "list"]);
  });
  it.each([
    ["publish collection", () => usePublishCollection(), { id: 5 }],
    ["unpublish collection", () => useUnpublishCollection(), 5],
    ["restore collection", () => useRestoreCollection(), 5],
    ["update collection", () => useUpdateCollection(5), { title: "x" }],
  ])("%s refreshes that collection, the lists and the public reads, not other collections or pages", async (_n, hook, vars) => {
    await run(hook as never, vars);
    expect(stale()).toEqual(["c5", "deletedList", "list", "pub"]);
  });
  it("deleting a collection drops its cached detail and refreshes lists and public reads", async () => {
    await run(() => useDeleteCollection(), 5);
    expect(qc.getQueryData(KEYS.c5)).toBeUndefined();
    expect(stale()).toEqual(["deletedList", "list", "pub"]);
    expect(qc.getQueryData(KEYS.c6)).toBeDefined();
  });
  it("adding a module or a page (always a draft) does not touch public reads", async () => {
    await run(() => useCreateModule(5), { title: "M" });
    expect(stale()).toEqual(["c5", "deletedList", "list"]);
    qc.clear(); seed();
    await run(() => useCreatePage(5), { moduleId: 7, input: { title: "P" } });
    expect(stale()).toEqual(["c5", "deletedList", "list"]);
  });
  it("publishing refreshes its collection, its own page and public reads, not another page", async () => {
    await run(() => usePublishPage(5), { id: 9, publish: true });
    expect(stale()).toEqual(["c5", "deletedList", "list", "p9", "pub"]);
  });
  it("editing a page puts the server's answer straight into its cache (no refetch that could bring back older data) and refreshes the outline and public reads", async () => {
    await run(() => useUpdatePage(5), { id: 9, input: { title: "x" } });
    expect(stale()).toEqual(["c5", "deletedList", "list", "pub"]);   // p9 is NOT invalidated
    expect(qc.getQueryData(KEYS.p9)).toBeDefined();
    expect(qc.getQueryData(KEYS.p10)).toBeDefined();
  });
  it("an autosave refreshes only the draft's own outline: no public reads", async () => {
    await run(() => useUpdatePage(5), { id: 9, input: { title: "x", autosave: true }, auto: true });
    expect(stale()).toEqual(["c5", "deletedList", "list"]);
  });
  it("deleting a page drops its cached copy", async () => {
    await run(() => useDeletePage(5), 9);
    expect(qc.getQueryData(KEYS.p9)).toBeUndefined();
    expect(qc.getQueryData(KEYS.p10)).toBeDefined();
    expect(stale()).toEqual(["c5", "deletedList", "list", "pub"]);
  });
  it("module edits, deletes and reorders refresh the collection and public reads", async () => {
    for (const [hook, vars] of [
      [() => useUpdateModule(5), { id: 7, input: { title: "x" } }],
      [() => useDeleteModule(5), 7],
      [() => useReorderModule(5), { id: 7, position: 1 }],
      [() => useReorderPage(5), { id: 9, position: 1 }],
    ] as const) {
      qc.clear(); seed();
      await run(hook as never, vars);
      expect(stale()).toEqual(["c5", "deletedList", "list", "pub"]);
    }
  });
  it("a failed write invalidates nothing", async () => {
    fetchMock.mockImplementation(() => json(400, { error: "nope" }));
    const { result } = renderHook(() => usePublishCollection(), { wrapper });
    await act(async () => { await result.current.mutateAsync({ id: 5 }).catch(() => undefined); });
    expect(stale()).toEqual([]);
  });
});

describe("errors reach the caller with the server's status and message", () => {
  const fail = async (status: number, message: string) => {
    fetchMock.mockImplementation(() => json(status, { error: message }));
    const { result } = renderHook(() => usePublishCollection(), { wrapper });
    let err: { status: number; message: string } | undefined;
    await act(async () => { await result.current.mutateAsync({ id: 5 }).catch((e) => { err = e; }); });
    return err;
  };
  it("400 (publish rule)", async () => {
    expect(await fail(400, "Add at least one published page before publishing this collection"))
      .toMatchObject({ status: 400, message: "Add at least one published page before publishing this collection" });
  });
  it("403, 404 and 409", async () => {
    expect(await fail(403, "You do not own this collection")).toMatchObject({ status: 403 });
    expect(await fail(404, "Collection not found")).toMatchObject({ status: 404 });
    expect(await fail(409, "Slug already in use")).toMatchObject({ status: 409, message: "Slug already in use" });
  });
  it("401 with a token drops the session via the unauthorized handler", async () => {
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    expect(await fail(401, "Unauthorized")).toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
  it("mutations are not retried", async () => {
    await fail(500, "boom");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("useCategories", () => {
  it("reads the public category list once", async () => {
    fetchMock.mockImplementation(() => json(200, [{ id: 1, slug: "programming", name: "Programming", icon: "code", position: 0 }]));
    const { result } = renderHook(() => useCategories(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(call().url).toBe("/api/public/categories");
    expect(result.current.data?.[0].slug).toBe("programming");
  });
});
