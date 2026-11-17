import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, isPublicPath, setUnauthorizedHandler, tokenStore } from "./api";
import { err, installFakeApi, ok } from "@/test/fakeApi";

// Public reads never carry the stored token, so a stale or expired token can't turn a public page into a 401/logout.
const PAGE = "/public/pages/alice/lisbon/day-1/arrival";
const logout = vi.fn();

beforeEach(() => { logout.mockClear(); setUnauthorizedHandler(logout); });
afterEach(() => { vi.unstubAllGlobals(); tokenStore.clear(); setUnauthorizedHandler(null); });

describe("public API isolation", () => {
  it("classifies only /public paths as public", () => {
    expect(isPublicPath("/public/collections?q=x")).toBe(true);
    expect(isPublicPath("/public/categories")).toBe(true);
    expect(isPublicPath("/publicity")).toBe(false);
    expect(isPublicPath("/collections/mine")).toBe(false);
    expect(isPublicPath("/media/abc/content")).toBe(false);
  });

  it.each([
    ["anonymous (no stored token)", null],
    ["a valid stored token", "valid-token"],
    ["an expired stored token", "expired-token"],
  ])("with %s, a public read sends no Authorization header and succeeds", async (_label, token) => {
    if (token) tokenStore.set(token);
    const fake = installFakeApi({
      [`GET ${PAGE}`]: (req) => (req.headers.Authorization ? err(401, "token expired") : ok({ page: { title: "Arrival" } })),
    });
    await expect(api.get(PAGE)).resolves.toEqual({ page: { title: "Arrival" } });
    expect(fake.calls[0].headers).not.toHaveProperty("Authorization");
    expect(logout).not.toHaveBeenCalled();
    expect(tokenStore.get()).toBe(token);   // the session is left alone
  });

  it("a public 404 is just a 404: no logout", async () => {
    tokenStore.set("expired-token");
    installFakeApi({ [`GET ${PAGE}`]: () => err(404, "Not found") });
    await expect(api.get(PAGE)).rejects.toBeInstanceOf(ApiError);
    expect(logout).not.toHaveBeenCalled();
  });

  it("creator calls still send the token, and a 401 there still logs out (unchanged)", async () => {
    tokenStore.set("expired-token");
    const fake = installFakeApi({ "GET /collections/mine": () => err(401, "token expired") });
    await expect(api.get("/collections/mine")).rejects.toMatchObject({ status: 401 });
    expect(fake.calls[0].headers.Authorization).toBe("Bearer expired-token");
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
