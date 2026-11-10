import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, setUnauthorizedHandler, tokenStore } from "@/lib/api";
import { MEDIA_MAX_BYTES, UploadAborted, checkMediaFile, fetchOwnerMedia, isRetryableUpload, mediaErrorMessage, uploadMedia } from "@/lib/media";
import { FakeXhr, asset, imageFile, stubOwnerMedia } from "@/test/fakeXhr";

beforeEach(() => { FakeXhr.install(); localStorage.clear(); });
afterEach(() => { vi.unstubAllGlobals(); setUnauthorizedHandler(null); });

describe("uploadMedia", () => {
  it("posts one multipart part named file to /api/media with the bearer token, reports progress and resolves with the asset", async () => {
    tokenStore.set("tok");
    const seen: number[] = [];
    const h = uploadMedia(imageFile(), (p) => seen.push(p));
    const x = FakeXhr.last;
    expect(x.method).toBe("POST");
    expect(x.url).toBe("/api/media");
    expect(x.headers.Authorization).toBe("Bearer tok");
    expect([...x.body!.keys()]).toEqual(["file"]);
    x.progress(250, 1000); x.progress(1000, 1000);
    x.reply(201, asset());
    await expect(h.promise).resolves.toMatchObject({ id: asset().id, width: 800 });
    expect(seen).toEqual([25, 100, 100]);
  });

  it("sends no Authorization header without a token", () => {
    uploadMedia(imageFile());
    expect(FakeXhr.last.headers.Authorization).toBeUndefined();
  });

  it("rejects with an ApiError carrying the server's status and code", async () => {
    const h = uploadMedia(imageFile());
    FakeXhr.last.reply(409, { error: "Your media storage limit is reached.", code: "MEDIA_QUOTA" });
    await expect(h.promise).rejects.toMatchObject({ status: 409, code: "MEDIA_QUOTA" });
  });

  it("treats a 2xx without an id, an HTML error page and a network failure as failures", async () => {
    const a = uploadMedia(imageFile()); FakeXhr.last.reply(201, {});
    await expect(a.promise).rejects.toBeInstanceOf(ApiError);
    const b = uploadMedia(imageFile()); FakeXhr.last.reply(502, "<html>bad gateway</html>");
    await expect(b.promise).rejects.toMatchObject({ status: 502 });
    const c = uploadMedia(imageFile()); FakeXhr.last.fail();
    await expect(c.promise).rejects.toMatchObject({ status: 0 });
  });

  it("abort() cancels the request and rejects with UploadAborted", async () => {
    const h = uploadMedia(imageFile());
    h.abort();
    expect(FakeXhr.last.aborted).toBe(true);
    await expect(h.promise).rejects.toBeInstanceOf(UploadAborted);
  });

  it("a 401 with a token drops the session, like every other call", async () => {
    tokenStore.set("tok");
    const onUnauthorized = vi.fn();
    setUnauthorizedHandler(onUnauthorized);
    const h = uploadMedia(imageFile());
    FakeXhr.last.reply(401, { error: "Unauthorized" });
    await expect(h.promise).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe("mediaErrorMessage", () => {
  const codes = ["MEDIA_TOO_LARGE", "MEDIA_TYPE_UNSUPPORTED", "MEDIA_CORRUPT", "MEDIA_ANIMATED", "MEDIA_DIMENSIONS", "MEDIA_COLORSPACE_UNSUPPORTED",
    "MEDIA_QUOTA", "MEDIA_BUSY", "MEDIA_STORAGE_FAILED", "MEDIA_BAD_REQUEST", "MEDIA_NOT_USABLE", "MEDIA_NOT_FOUND"];

  it("has its own plain message for every code the upload API can answer, never the raw server text", () => {
    const seen = new Set<string>();
    for (const code of codes) {
      const m = mediaErrorMessage(new ApiError(400, "RAW SERVER TEXT with internals", code));
      expect(m).not.toContain("RAW SERVER TEXT");
      expect(m.length).toBeGreaterThan(10);
      seen.add(m);
    }
    expect(seen.size).toBe(codes.length);
  });

  it("explains quota and busy in terms of what to do next", () => {
    expect(mediaErrorMessage(new ApiError(409, "x", "MEDIA_QUOTA"))).toMatch(/storage limit/i);
    expect(mediaErrorMessage(new ApiError(503, "x", "MEDIA_BUSY"))).toMatch(/busy.*try again/i);
  });

  it("falls back by status, and to a generic message for anything else", () => {
    expect(mediaErrorMessage(new ApiError(413, "x"))).toMatch(/too large/i);
    expect(mediaErrorMessage(new ApiError(401, "x"))).toMatch(/sign in/i);
    expect(mediaErrorMessage(new ApiError(0, "x"))).toMatch(/connection/i);
    expect(mediaErrorMessage(new ApiError(500, "stack trace"))).not.toContain("stack trace");
    expect(mediaErrorMessage(new Error("boom"))).toBe("The upload failed. Please try again.");
  });

  it("only busy, storage, network and 5xx failures are worth retrying with the same file", () => {
    expect(isRetryableUpload(new ApiError(503, "x", "MEDIA_BUSY"))).toBe(true);
    expect(isRetryableUpload(new ApiError(0, "x"))).toBe(true);
    expect(isRetryableUpload(new ApiError(422, "x", "MEDIA_CORRUPT"))).toBe(false);
    expect(isRetryableUpload(new ApiError(409, "x", "MEDIA_QUOTA"))).toBe(false);
  });
});

describe("checkMediaFile (UX only)", () => {
  it("accepts JPEG, PNG and WebP within 5 MB and refuses the rest", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(checkMediaFile({ type, size: 100 })).toBeNull();
    expect(checkMediaFile({ type: "image/gif", size: 100 })).toMatch(/JPEG, PNG or WebP/);
    expect(checkMediaFile({ type: "image/svg+xml", size: 100 })).not.toBeNull();
    expect(checkMediaFile({ type: "image/png", size: MEDIA_MAX_BYTES + 1 })).toMatch(/5 MB/);
    expect(checkMediaFile({ type: "image/png", size: MEDIA_MAX_BYTES })).toBeNull();
    expect(checkMediaFile({ type: "image/png", size: 0 })).toMatch(/empty/);
  });
});

describe("fetchOwnerMedia", () => {
  it("fetches the owner route with the Authorization header and returns a blob", async () => {
    tokenStore.set("tok");
    const calls = stubOwnerMedia();
    const blob = await fetchOwnerMedia("abc", "thumb");
    expect(blob).toBeInstanceOf(Blob);
    expect(calls).toEqual([{ url: "/api/media/abc/content?variant=thumb", auth: "Bearer tok" }]);
  });

  it("turns an error status into an ApiError", async () => {
    stubOwnerMedia(404);
    await expect(fetchOwnerMedia("abc", "original")).rejects.toMatchObject({ status: 404 });
  });
});
