import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaUploader } from "@/components/media/MediaUploader";
import { FakeXhr, asset, imageFile, stubOwnerMedia, trackObjectUrls } from "@/test/fakeXhr";

let urls: ReturnType<typeof trackObjectUrls>;
beforeEach(() => { FakeXhr.install(); urls = trackObjectUrls(); stubOwnerMedia(); });
afterEach(() => vi.unstubAllGlobals());

const choose = (file: File, label = "Image file") => fireEvent.change(screen.getByLabelText(label), { target: { files: [file] } });

describe("MediaUploader", () => {
  it("shows a local preview and progress while uploading, then reports the asset once", async () => {
    const onUploaded = vi.fn();
    render(<MediaUploader label="Image" onUploaded={onUploaded} />);
    choose(imageFile());
    expect(screen.getByAltText("Image being uploaded")).toHaveAttribute("src", urls.created[0]);
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.getByText(/Uploading\.\.\. 0%/)).toBeInTheDocument();

    act(() => FakeXhr.last.progress(400, 1000));
    expect(screen.getByText(/Uploading\.\.\. 40%/)).toBeInTheDocument();
    expect(onUploaded).not.toHaveBeenCalled();

    await act(async () => FakeXhr.last.reply(201, asset()));
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(onUploaded.mock.calls[0][0]).toMatchObject({ id: asset().id });
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(urls.live.size).toBe(0);   // the local preview is revoked on completion
  });

  it("cancel aborts the request, reports nothing and revokes the local preview", async () => {
    const onUploaded = vi.fn();
    render(<MediaUploader label="Image" onUploaded={onUploaded} />);
    choose(imageFile());
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(FakeXhr.last.aborted).toBe(true);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(urls.live.size).toBe(0);
    await act(async () => { FakeXhr.last.reply(201, asset()); });   // a late answer from the cancelled request is ignored
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("a failed replacement keeps showing the existing image and never reports an asset", async () => {
    const onUploaded = vi.fn();
    render(<MediaUploader label="Image" assetId="old-asset" onUploaded={onUploaded} />);
    expect(await screen.findByAltText("Image preview")).toBeInTheDocument();
    choose(imageFile());
    await act(async () => FakeXhr.last.reply(422, { error: "x", code: "MEDIA_CORRUPT" }));
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn't be read as an image/i);
    expect(await screen.findByAltText("Image preview")).toBeInTheDocument();   // the stored image is still there
    expect(urls.live.size).toBe(1);   // only the owner preview of the old image remains
  });

  it.each([
    [409, "MEDIA_QUOTA", /storage limit/i],
    [503, "MEDIA_BUSY", /busy.*try again/i],
    [413, "MEDIA_TOO_LARGE", /too large/i],
    [415, "MEDIA_TYPE_UNSUPPORTED", /isn't supported/i],
    [422, "MEDIA_ANIMATED", /animated/i],
  ])("maps %s %s to a plain message", async (status, code, text) => {
    render(<MediaUploader label="Image" onUploaded={vi.fn()} />);
    choose(imageFile());
    await act(async () => FakeXhr.last.reply(status, { error: "RAW", code }));
    expect(screen.getByRole("alert")).toHaveTextContent(text);
    expect(screen.getByRole("alert")).not.toHaveTextContent("RAW");
  });

  it("Try again re-sends the same file and a success then clears the error", async () => {
    const onUploaded = vi.fn();
    render(<MediaUploader label="Image" onUploaded={onUploaded} />);
    const file = imageFile("same.jpg");
    choose(file);
    await act(async () => FakeXhr.last.reply(503, { error: "busy", code: "MEDIA_BUSY" }));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(FakeXhr.instances).toHaveLength(2);
    expect(FakeXhr.last.body!.get("file")).toBe(file);
    await act(async () => FakeXhr.last.reply(201, asset()));
    expect(onUploaded).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(urls.live.size).toBe(0);
  });

  it("a network failure is reported as such and offers a retry", async () => {
    render(<MediaUploader label="Image" onUploaded={vi.fn()} />);
    choose(imageFile());
    await act(async () => FakeXhr.last.fail());
    expect(screen.getByRole("alert")).toHaveTextContent(/connection/i);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("refuses a wrong type or an oversized file without sending anything or creating a preview", () => {
    render(<MediaUploader label="Image" onUploaded={vi.fn()} />);
    choose(imageFile("a.gif", "image/gif"));
    expect(screen.getByRole("alert")).toHaveTextContent(/JPEG, PNG or WebP/);
    const big = imageFile("big.png", "image/png");
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    choose(big);
    expect(screen.getByRole("alert")).toHaveTextContent(/5 MB/);
    expect(FakeXhr.instances).toHaveLength(0);
    expect(urls.created).toHaveLength(0);
  });

  it("Remove is offered only with an asset and calls onRemove", async () => {
    const onRemove = vi.fn();
    const { rerender } = render(<MediaUploader label="Image" onUploaded={vi.fn()} onRemove={onRemove} />);
    expect(screen.queryByRole("button", { name: /Remove/ })).toBeNull();
    rerender(<MediaUploader label="Image" assetId="a1" onUploaded={vi.fn()} onRemove={onRemove} />);
    await screen.findByAltText("Image preview");
    fireEvent.click(screen.getByRole("button", { name: "Remove image" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("choosing a second file after a failure replaces the first preview and revokes it", async () => {
    render(<MediaUploader label="Image" onUploaded={vi.fn()} />);
    choose(imageFile("1.jpg"));
    await act(async () => FakeXhr.last.reply(422, { error: "x", code: "MEDIA_CORRUPT" }));
    choose(imageFile("2.jpg"));
    expect(urls.created).toHaveLength(2);
    expect(urls.revoked).toContain(urls.created[0]);
    expect([...urls.live]).toEqual([urls.created[1]]);
  });

  it("unmounting mid-upload aborts the request, frees the preview and never reports", async () => {
    const onUploaded = vi.fn();
    const { unmount } = render(<MediaUploader label="Image" onUploaded={onUploaded} />);
    choose(imageFile());
    unmount();
    expect(FakeXhr.last.aborted).toBe(true);
    expect(urls.live.size).toBe(0);
    await act(async () => { FakeXhr.last.reply(201, asset()); });
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it("reports to the caller's latest callback, not the one from when the upload began", async () => {
    const first = vi.fn(), second = vi.fn();
    const { rerender } = render(<MediaUploader label="Image" onUploaded={first} />);
    choose(imageFile());
    rerender(<MediaUploader label="Image" onUploaded={second} />);
    await act(async () => FakeXhr.last.reply(201, asset()));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("fetches the stored image through the owner route with the Authorization header and revokes it on unmount", async () => {
    localStorage.setItem("auth_token", "tok");
    const calls = stubOwnerMedia();
    const { unmount } = render(<MediaUploader label="Image" assetId="a1" onUploaded={vi.fn()} />);
    await screen.findByAltText("Image preview");
    expect(calls).toEqual([{ url: "/api/media/a1/content?variant=original", auth: "Bearer tok" }]);
    expect(urls.live.size).toBe(1);
    unmount();
    expect(urls.live.size).toBe(0);
    localStorage.clear();
  });

  it("an owner preview that cannot load says so instead of showing a broken image", async () => {
    stubOwnerMedia(404);
    render(<MediaUploader label="Image" assetId="gone" onUploaded={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/preview couldn't be loaded/i));
    expect(urls.created).toHaveLength(0);
  });

  it.each([
    [503, "MEDIA_BUSY"],
    [503, "MEDIA_STORAGE_FAILED"],
    [500, undefined],
  ])("offers Try again for the retryable failure %s %s", async (status, code) => {
    render(<MediaUploader label="Image" onUploaded={vi.fn()} />);
    choose(imageFile());
    await act(async () => FakeXhr.last.reply(status, { error: "x", code }));
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it.each([
    [415, "MEDIA_TYPE_UNSUPPORTED"],
    [422, "MEDIA_CORRUPT"],
    [422, "MEDIA_ANIMATED"],
    [422, "MEDIA_DIMENSIONS"],
    [422, "MEDIA_COLORSPACE_UNSUPPORTED"],
    [413, "MEDIA_TOO_LARGE"],
    [409, "MEDIA_QUOTA"],
    [400, "MEDIA_BAD_REQUEST"],
  ])("does not offer Try again for the permanent failure %s %s", async (status, code) => {
    render(<MediaUploader label="Image" onUploaded={vi.fn()} />);
    choose(imageFile());
    await act(async () => FakeXhr.last.reply(status, { error: "x", code }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a network failure is retryable and a client-side rejection (wrong type) is not", async () => {
    render(<MediaUploader label="Image" onUploaded={vi.fn()} />);
    choose(imageFile("a.gif", "image/gif"));
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    choose(imageFile());
    await act(async () => FakeXhr.last.fail());
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  it("tells its owner when an upload starts and ends", async () => {
    const busy = vi.fn();
    render(<MediaUploader label="Image" onUploaded={vi.fn()} onBusyChange={busy} />);
    choose(imageFile());
    expect(busy).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole("button", { name: "Cancel upload" }));
    expect(busy).toHaveBeenLastCalledWith(false);
  });
});
