import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionInput } from "@/lib/types";
import { FakeXhr, asset, imageFile, trackObjectUrls } from "@/test/fakeXhr";
import { CollectionForm, type CollectionFormValues } from "./CollectionForm";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let urls: ReturnType<typeof trackObjectUrls>;

beforeEach(() => {
  FakeXhr.install();
  urls = trackObjectUrls();
  vi.stubGlobal("fetch", vi.fn(async (url: string) =>
    String(url).includes("/media/")
      ? { ok: true, status: 200, statusText: "", blob: async () => new Blob(["img"]) }
      : new Response("[]", { status: 200, headers: { "Content-Type": "application/json" } })));
});
afterEach(() => vi.unstubAllGlobals());

const base: CollectionFormValues = { title: "Java", slug: "java", description: "d", coverUrl: "", coverAssetId: null, categoryId: null };

function mount(initial: Partial<CollectionFormValues> = {}) {
  const onSubmit = vi.fn<(i: CollectionInput) => void>();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={qc}><CollectionForm initial={{ ...base, ...initial }} submitLabel="Save" pending={false} onSubmit={onSubmit} /></QueryClientProvider>);
  return { onSubmit, sent: () => onSubmit.mock.calls.at(-1)![0] };
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save" }));
const upload = async (id: string) => {
  fireEvent.change(screen.getByLabelText("Cover image file"), { target: { files: [imageFile()] } });
  await act(async () => FakeXhr.last.reply(201, asset(id)));
};

describe("collection cover: upload and the cover contract (never both fields)", () => {
  it("a new upload sends coverAssetId only", async () => {
    const m = mount();
    await upload(A);
    save();
    expect(m.sent()).toEqual({ title: "Java", description: "d", slug: "java", coverAssetId: A });
    expect("coverUrl" in m.sent()).toBe(false);
  });

  it("the cover preview is the thumb through the owner route", async () => {
    mount({ coverAssetId: A });
    expect(await screen.findByAltText("Cover image preview")).toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map((c) => String(c[0]))).toContain(`/api/media/${A}/content?variant=thumb`);
  });

  it("keeping the stored uploaded cover sends neither cover field (omitted = unchanged)", async () => {
    const m = mount({ coverAssetId: A });
    await screen.findByAltText("Cover image preview");
    save();
    expect("coverAssetId" in m.sent()).toBe(false);
    expect("coverUrl" in m.sent()).toBe(false);
  });

  it("replacing the stored cover sends the new id only", async () => {
    const m = mount({ coverAssetId: A });
    await screen.findByAltText("Cover image preview");
    await upload(B);
    save();
    expect(m.sent()).toMatchObject({ coverAssetId: B });
    expect("coverUrl" in m.sent()).toBe(false);
  });

  it("a failed replacement leaves the stored cover and sends nothing about it", async () => {
    const m = mount({ coverAssetId: A });
    await screen.findByAltText("Cover image preview");
    fireEvent.change(screen.getByLabelText("Cover image file"), { target: { files: [imageFile()] } });
    await act(async () => FakeXhr.last.reply(409, { error: "x", code: "MEDIA_QUOTA" }));
    expect(screen.getByRole("alert")).toHaveTextContent(/storage limit/i);
    save();
    expect("coverAssetId" in m.sent()).toBe(false);
    expect("coverUrl" in m.sent()).toBe(false);
  });

  it("removing the stored cover sends coverAssetId: null and no coverUrl", async () => {
    const m = mount({ coverAssetId: A });
    await screen.findByAltText("Cover image preview");
    fireEvent.click(screen.getByRole("button", { name: "Remove cover image" }));
    save();
    expect(m.sent().coverAssetId).toBeNull();
    expect("coverUrl" in m.sent()).toBe(false);
    expect(urls.live.size).toBe(0);
  });

  it("typing a link on a stored uploaded cover sends coverUrl only (the server then clears the asset)", async () => {
    const m = mount({ coverAssetId: A });
    await screen.findByAltText("Cover image preview");
    fireEvent.change(screen.getByLabelText("Cover image link"), { target: { value: "https://cdn.example.com/c.png" } });
    save();
    expect(m.sent()).toMatchObject({ coverUrl: "https://cdn.example.com/c.png" });
    expect("coverAssetId" in m.sent()).toBe(false);
  });

  it("uploading over a typed link sends coverAssetId only", async () => {
    const m = mount({ coverUrl: "https://cdn.example.com/old.png" });
    await upload(A);
    expect((screen.getByLabelText("Cover image link") as HTMLInputElement).value).toBe("");
    save();
    expect(m.sent()).toMatchObject({ coverAssetId: A });
    expect("coverUrl" in m.sent()).toBe(false);
  });

  it("the existing link-only behaviour is unchanged: '' clears an old link, a link is sent as typed, https is enforced", () => {
    const cleared = mount({ coverUrl: "https://cdn.example.com/old.png" });
    fireEvent.change(screen.getByLabelText("Cover image link"), { target: { value: "" } });
    save();
    expect(cleared.sent()).toMatchObject({ coverUrl: "" });
    expect("coverAssetId" in cleared.sent()).toBe(false);
  });

  it("a non-https link is still refused with no submit", () => {
    const m = mount();
    fireEvent.change(screen.getByLabelText("Cover image link"), { target: { value: "http://x.com/a.png" } });
    save();
    expect(m.onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText(/must be an https/i)).toBeInTheDocument();
  });

  it("whatever the sequence of steps, a submit never carries both coverAssetId and coverUrl", async () => {
    const m = mount({ coverUrl: "https://cdn.example.com/old.png" });
    await upload(A);
    save();
    fireEvent.click(screen.getByRole("button", { name: "Remove cover image" }));
    save();
    fireEvent.change(screen.getByLabelText("Cover image link"), { target: { value: "https://cdn.example.com/n.png" } });
    save();
    await upload(B);
    save();
    for (const [input] of m.onSubmit.mock.calls) expect("coverAssetId" in input && "coverUrl" in input).toBe(false);
    expect(m.onSubmit).toHaveBeenCalledTimes(4);
  });

  it("every object URL made for a cover preview is revoked by the time the form unmounts", async () => {
    const m = mount();
    await upload(A);
    await screen.findByAltText("Cover image preview");
    fireEvent.click(screen.getByRole("button", { name: "Remove cover image" }));
    expect(m.onSubmit).not.toHaveBeenCalled();
    expect(urls.live.size).toBe(0);
    expect(urls.created.length).toBe(urls.revoked.length);
  });

  describe("a link edit cannot be overwritten by a late upload", () => {
    const link = () => screen.getByLabelText("Cover image link") as HTMLInputElement;
    const start = () => fireEvent.change(screen.getByLabelText("Cover image file"), { target: { files: [imageFile()] } });

    it("the link field is locked while an upload runs; a forced edit is ignored; success sends coverAssetId only", async () => {
      const m = mount();
      start();
      expect(link()).toBeDisabled();
      fireEvent.change(link(), { target: { value: "https://cdn.example.com/late.png" } });
      await act(async () => FakeXhr.last.reply(201, asset(A)));
      expect(link().value).toBe("");
      save();
      expect(m.sent()).toMatchObject({ coverAssetId: A });
      expect("coverUrl" in m.sent()).toBe(false);
    });

    it("cancelling unlocks the field; the link then typed is sent alone, even if the cancelled request answers late", async () => {
      const m = mount();
      start();
      fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
      expect(link()).not.toBeDisabled();
      fireEvent.change(link(), { target: { value: "https://cdn.example.com/a.png" } });
      await act(async () => { FakeXhr.last.reply(201, asset(A)); });
      expect(link().value).toBe("https://cdn.example.com/a.png");
      save();
      expect(m.sent()).toMatchObject({ coverUrl: "https://cdn.example.com/a.png" });
      expect("coverAssetId" in m.sent()).toBe(false);
    });

    it("cancelling a replacement over a stored upload keeps the stored cover and a typed link then replaces it alone", async () => {
      const m = mount({ coverAssetId: A });
      await screen.findByAltText("Cover image preview");
      start();
      expect(link()).toBeDisabled();
      fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
      fireEvent.change(link(), { target: { value: "https://cdn.example.com/n.png" } });
      save();
      expect(m.sent()).toMatchObject({ coverUrl: "https://cdn.example.com/n.png" });
      expect("coverAssetId" in m.sent()).toBe(false);
    });
  });
});
