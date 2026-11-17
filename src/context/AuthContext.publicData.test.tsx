import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokenStore } from "@/lib/api";
import { MemoryRouter } from "react-router-dom";
import { usePublicCollections } from "@/hooks/useContent";
import Discover from "@/pages/public/Discover";
import { err, installFakeApi, ok } from "@/test/fakeApi";
import { isPublicQueryKey } from "@/lib/queryKeys";
import { AuthProvider, useAuth } from "./AuthContext";

afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); });



describe("logout keeps public data (Step 14a, requirement D)", () => {
  it("an in-flight public Discover query survives the logout caused by an expired token's 401, then displays its results", async () => {
    tokenStore.set("expired-token");
    let releaseList: () => void = () => {};
    const fake = installFakeApi({
      "GET /auth/me": () => err(401, "expired"),
      "GET /public/categories": () => ok([]),
      // held open until the test releases it, i.e. until logout has definitely happened
      "GET /public/collections": () => new Promise((r) => {
        releaseList = () => r({ status: 200, body: { items: [{ slug: "kyoto", title: "Kyoto temples", description: "", coverUrl: null, coverThumbUrl: null,
          category: null, creator: { username: "alice", displayName: "Alice" }, moduleCount: 1, pageCount: 1 }], page: 0, size: 12, totalItems: 1, totalPages: 1 } });
      }),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let auth: ReturnType<typeof useAuth> | null = null;
    function AuthProbe() { auth = useAuth(); return null; }
    // a private query cached from the (stale) session, to prove logout still removes private data
    qc.setQueryData(["mine", "collections", { deleted: false }], [{ id: 1, title: "My draft" }]);
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/discover"]}><AuthProvider><AuthProbe /><Discover /></AuthProvider></MemoryRouter>
      </QueryClientProvider>,
    );

    // 1. the public query is in flight
    await waitFor(() => expect(fake.calls.some((c) => c.path.startsWith("/public/collections"))).toBe(true));
    const listQuery = () => qc.getQueryCache().findAll({ queryKey: ["public", "collections"] })[0];
    const inFlight = listQuery();
    expect(inFlight.state.fetchStatus).toBe("fetching");

    // 2. the expired token's 401 on /auth/me logs out: token cleared, no user, private cache gone
    await waitFor(() => expect(tokenStore.get()).toBeNull());
    await waitFor(() => expect(auth!.loading).toBe(false));
    expect(auth!.user).toBeNull();
    expect(fake.sent("GET", "/auth/me")).toHaveLength(1);
    expect(qc.getQueryData(["mine", "collections", { deleted: false }])).toBeUndefined();

    // 3. the public query was neither removed nor cancelled: same query object, still fetching, no error
    expect(listQuery()).toBe(inFlight);
    expect(inFlight.state.fetchStatus).toBe("fetching");
    expect(inFlight.state.status).toBe("pending");
    expect(screen.getByRole("status")).toHaveTextContent("Loading collections...");

    // 4. the request completes and Discover shows the result
    act(() => releaseList());
    expect(await screen.findByRole("heading", { name: "Kyoto temples" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).toBeNull();
    expect(inFlight.state.status).toBe("success");
    // only one list request: the result came from the original in-flight fetch, not a retry
    expect(fake.calls.filter((c) => c.path.startsWith("/public/collections"))).toHaveLength(1);
    // and it went out without the stale token
    expect(fake.calls.filter((c) => c.path.startsWith("/public/")).every((c) => !("Authorization" in c.headers))).toBe(true);
  });

  it("logout still removes the signed-in user's data and keeps only public data", async () => {
    tokenStore.set("tok");
    installFakeApi({
      "GET /auth/me": () => ok({ id: 1, name: "Ann", email: "a@x", role: "USER", createdAt: "", username: "ann" }),
      "GET /collections/mine": () => ok([]),
      "GET /public/collections": () => ok({ items: [], page: 0, size: 12, totalItems: 0, totalPages: 0 }),
      "GET /public/categories": () => ok([]),
    });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let logout: () => void = () => {};
    function Probe() {
      logout = useAuth().logout;
      useQuery({ queryKey: ["mine", "collections", { deleted: false }], queryFn: () => fetch("/api/collections/mine").then((r) => r.json()) });
      useQuery({ queryKey: ["categories"], queryFn: () => fetch("/api/public/categories").then((r) => r.json()) });
      usePublicCollections({ page: 0, size: 12 });
      return null;
    }
    render(<QueryClientProvider client={qc}><AuthProvider><Probe /></AuthProvider></QueryClientProvider>);
    await waitFor(() => expect(qc.getQueryCache().getAll().every((q) => q.state.status === "success")).toBe(true));
    const find = (k: string) => qc.getQueryCache().getAll().find((q) => q.queryKey[0] === k);
    const [mine, pub, cats] = [find("mine"), find("public"), find("categories")];
    act(() => logout());
    // the private query (and its data) is gone; a still-mounted screen may start a fresh one, exactly as with clear() before
    expect(find("mine")).not.toBe(mine);
    // the public ones are the very same queries, data intact
    expect(find("public")).toBe(pub);
    expect(find("categories")).toBe(cats);
    expect(find("public")!.state.status).toBe("success");
    expect(tokenStore.get()).toBeNull();
  });

  it("classifies public query keys", () => {
    expect(isPublicQueryKey(["public", "collections", {}])).toBe(true);
    expect(isPublicQueryKey(["categories"])).toBe(true);
    expect(isPublicQueryKey(["mine", "collections"])).toBe(false);
    expect(isPublicQueryKey(["page", 5])).toBe(false);
  });
});
