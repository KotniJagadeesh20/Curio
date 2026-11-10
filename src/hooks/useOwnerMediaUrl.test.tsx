import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOwnerMediaUrl } from "@/hooks/useOwnerMediaUrl";
import { stubOwnerMedia, trackObjectUrls } from "@/test/fakeXhr";

let urls: ReturnType<typeof trackObjectUrls>;
beforeEach(() => { urls = trackObjectUrls(); });
afterEach(() => vi.unstubAllGlobals());

describe("useOwnerMediaUrl", () => {
  it("keeps exactly one object URL alive: the old one is revoked when the asset changes, the last when it unmounts", async () => {
    stubOwnerMedia();
    const { result, rerender, unmount } = renderHook(({ id }) => useOwnerMediaUrl(id), { initialProps: { id: "a" as string | null } });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(urls.live.size).toBe(1);
    rerender({ id: "b" });
    await waitFor(() => expect(urls.created).toHaveLength(2));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect([...urls.live]).toEqual([urls.created[1]]);
    rerender({ id: null });
    expect(urls.live.size).toBe(0);
    expect(result.current.status).toBe("idle");
    rerender({ id: "c" });
    await waitFor(() => expect(result.current.status).toBe("ready"));
    unmount();
    expect(urls.live.size).toBe(0);
    expect(urls.created.length).toBe(urls.revoked.length);
  });

  it("a response that arrives after the component left creates no object URL", async () => {
    let release: () => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => new Promise((res) => { release = () => res({ ok: true, status: 200, blob: async () => new Blob(["x"]) }); })));
    const { unmount } = renderHook(() => useOwnerMediaUrl("slow"));
    unmount();
    release();
    await Promise.resolve();
    await Promise.resolve();
    expect(urls.created).toHaveLength(0);
  });

  it("reports an error for a failed fetch and creates nothing", async () => {
    stubOwnerMedia(404);
    const { result } = renderHook(() => useOwnerMediaUrl("gone"));
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(urls.created).toHaveLength(0);
  });
});
