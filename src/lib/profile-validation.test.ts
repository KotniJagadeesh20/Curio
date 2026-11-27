import { describe, expect, it } from "vitest";
import {
  hasProfileErrors,
  PROFILE_LIMITS,
  serverErrorField,
  toUpdateRequest,
  validateProfile,
  type ProfileForm,
} from "./profile-validation";

/** Step 15c-2: client checks that mirror ProfileService.update / UrlPolicy (UX only; the server stays authoritative). */
const form = (over: Partial<ProfileForm> = {}): ProfileForm => ({
  displayName: "Bob",
  bio: "",
  avatarUrl: "",
  bannerUrl: "",
  links: [],
  visibility: "PUBLIC",
  ...over,
});
let n = 0;
const row = (label: string, url: string) => ({ id: `r${++n}`, label, url });

describe("validateProfile: displayName", () => {
  it("is required (blank or whitespace only)", () => {
    expect(validateProfile(form({ displayName: "" })).fields.displayName).toBeTruthy();
    expect(validateProfile(form({ displayName: "   " })).fields.displayName).toBeTruthy();
  });
  it("allows 120 characters and rejects 121, counted after trimming", () => {
    expect(hasProfileErrors(validateProfile(form({ displayName: "a".repeat(120) })))).toBe(false);
    expect(hasProfileErrors(validateProfile(form({ displayName: `  ${"a".repeat(120)}  ` })))).toBe(false);
    expect(validateProfile(form({ displayName: "a".repeat(121) })).fields.displayName).toBeTruthy();
  });
});

describe("validateProfile: bio", () => {
  it("allows 500 characters and rejects 501, counted after trimming", () => {
    expect(PROFILE_LIMITS.bio).toBe(500);
    expect(hasProfileErrors(validateProfile(form({ bio: "b".repeat(500) })))).toBe(false);
    expect(hasProfileErrors(validateProfile(form({ bio: ` ${"b".repeat(500)}\n` })))).toBe(false);
    expect(validateProfile(form({ bio: "b".repeat(501) })).fields.bio).toBeTruthy();
  });
});

describe("validateProfile: avatar and banner URLs", () => {
  it("blank is valid (cleared)", () => {
    expect(hasProfileErrors(validateProfile(form({ avatarUrl: "", bannerUrl: "   " })))).toBe(false);
  });
  // The same list as ProfileApiTest.nonHttpsAndMalformedUrlsAreRejected, minus "https:///nohost" (see below).
  it.each(["http://x.com/a.png", "javascript:alert(1)", "data:text/html,hi", "//x.com/a.png", "/relative.png",
    "https://user:pw@x.com/a.png", "not a url"])("rejects %s", (bad) => {
    const e = validateProfile(form({ avatarUrl: bad, bannerUrl: bad }));
    expect(e.fields.avatarUrl).toBeTruthy();
    expect(e.fields.bannerUrl).toBeTruthy();
  });
  it("documents a server-only rejection: the WHATWG URL parser reads https:///nohost as host \"nohost\"", () => {
    // Java's URI (UrlPolicy) has no host here and answers 400; the client check is UX only, so this case is left to the server.
    expect(validateProfile(form({ avatarUrl: "https:///nohost" })).fields.avatarUrl).toBeUndefined();
  });
  it("rejects more than 500 characters after trimming", () => {
    const long = `https://x.com/${"a".repeat(500 - "https://x.com/".length + 1)}`;
    expect(validateProfile(form({ avatarUrl: long })).fields.avatarUrl).toBeTruthy();
    expect(validateProfile(form({ bannerUrl: ` ${long.slice(0, 500)} ` })).fields.bannerUrl).toBeUndefined();
  });
  it("accepts a valid https URL with surrounding spaces", () => {
    expect(hasProfileErrors(validateProfile(form({ avatarUrl: "  https://img.example.com/a.png  " })))).toBe(false);
  });
});

describe("validateProfile: social links", () => {
  it("accepts valid rows, including a numeric-only label (the backend allows it)", () => {
    const e = validateProfile(form({ links: [row("github", "https://github.com/b"), row("2024", "https://b.dev")] }));
    expect(hasProfileErrors(e)).toBe(false);
  });
  it.each(["GitHub", "my site", "a".repeat(31), "dash-ed", "émoji"])("rejects the label %j", (label) => {
    const r = row(label, "https://x.com");
    expect(validateProfile(form({ links: [r] })).links[r.id]?.label).toBeTruthy();
  });
  it("a partly filled row needs both parts: blank URL blocks save (the server would silently drop it)", () => {
    const noUrl = row("github", "  ");
    const noLabel = row("", "https://x.com");
    const e = validateProfile(form({ links: [noUrl, noLabel] }));
    expect(e.links[noUrl.id]?.url).toBeTruthy();
    expect(e.links[noLabel.id]?.label).toBeTruthy();
  });
  it("ignores a completely empty row", () => {
    expect(hasProfileErrors(validateProfile(form({ links: [row("", ""), row(" ", " ")] })))).toBe(false);
  });
  it("rejects a non-https link URL on that row", () => {
    const r = row("site", "http://x.com");
    expect(validateProfile(form({ links: [r] })).links[r.id]?.url).toBeTruthy();
  });
  it("flags every row of a duplicated label", () => {
    const a = row("github", "https://github.com/a");
    const b = row("github", "https://github.com/b");
    const c = row("site", "https://c.dev");
    const e = validateProfile(form({ links: [a, b, c] }));
    expect(e.links[a.id]?.label).toBeTruthy();
    expect(e.links[b.id]?.label).toBeTruthy();
    expect(e.links[c.id]).toBeUndefined();
  });
  it("allows 10 links and rejects 11 (empty rows don't count)", () => {
    const ten = Array.from({ length: 10 }, (_, i) => row(`l${i}`, `https://x.com/${i}`));
    expect(hasProfileErrors(validateProfile(form({ links: [...ten, row("", "")] })))).toBe(false);
    const e = validateProfile(form({ links: [...ten, row("l10", "https://x.com/10")] }));
    expect(e.fields.socialLinks).toBeTruthy();
    expect(PROFILE_LIMITS.links).toBe(10);
  });
});

describe("toUpdateRequest", () => {
  it("sends exactly the six editable keys, always including visibility", () => {
    const body = toUpdateRequest(form({ visibility: "PRIVATE" }));
    expect(Object.keys(body).sort()).toEqual(["avatarUrl", "bannerUrl", "bio", "displayName", "socialLinks", "visibility"]);
    expect(body.visibility).toBe("PRIVATE");
  });
  it("never carries other fields, even if the form object has them", () => {
    const polluted = { ...form(), username: "x", email: "e@x", role: "ADMIN", status: "ACTIVE", id: 1 } as ProfileForm;
    expect(Object.keys(toUpdateRequest(polluted)).sort())
      .toEqual(["avatarUrl", "bannerUrl", "bio", "displayName", "socialLinks", "visibility"]);
  });
  it("trims text, sends blank URLs as null, and skips completely empty link rows", () => {
    expect(toUpdateRequest(form({
      displayName: "  Bob K ", bio: " hi \n", avatarUrl: "   ", bannerUrl: " https://b.example.com/x.png ",
      links: [row(" github ", " https://github.com/b "), row("", "")],
    }))).toEqual({
      displayName: "Bob K", bio: "hi", avatarUrl: null, bannerUrl: "https://b.example.com/x.png",
      socialLinks: { github: "https://github.com/b" }, visibility: "PUBLIC",
    });
  });
  it("keeps row order for non-numeric labels", () => {
    const body = toUpdateRequest(form({ links: [row("x", "https://x.com"), row("github", "https://g.com"), row("site", "https://s.com")] }));
    expect(Object.keys(body.socialLinks)).toEqual(["x", "github", "site"]);
  });
  it("documents the limitation: an integer-like label enumerates first, so its order is not guaranteed", () => {
    const body = toUpdateRequest(form({ links: [row("github", "https://g.com"), row("2024", "https://y.com")] }));
    expect(Object.keys(body.socialLinks)).toEqual(["2024", "github"]);   // JS object key order, not row order
  });
});

describe("serverErrorField", () => {
  it.each([
    ["displayName must be 1-120 characters", { field: "displayName" }],
    ["bio must be at most 500 characters", { field: "bio" }],
    ["avatarUrl must be an https URL", { field: "avatarUrl" }],
    ["avatarUrl is too long", { field: "avatarUrl" }],
    ["bannerUrl must be an https URL", { field: "bannerUrl" }],
    ["bannerUrl is too long", { field: "bannerUrl" }],
    ["socialLinks.github must be an https URL", { field: "socialLinks", linkLabel: "github" }],
    ["socialLinks.my_site_2 is too long", { field: "socialLinks", linkLabel: "my_site_2" }],
    ["At most 10 social links", { field: "socialLinks" }],
    ["Social link names must be 1-30 lowercase letters, digits or underscores", { field: "socialLinks" }],
    ["visibility must be PUBLIC or PRIVATE", { field: "visibility" }],
  ])("maps %j", (message, expected) => {
    expect(serverErrorField(message)).toEqual(expected);
  });
  it.each(["Usernames cannot be changed", "Field 'email' cannot be set here", "Invalid profile fields",
    "Invalid request body", "Profile missing", "Something went wrong", "", "displayNameX broken"])(
    "leaves %j unmapped (form-level alert)", (message) => {
      expect(serverErrorField(message)).toBeNull();
    });
});
