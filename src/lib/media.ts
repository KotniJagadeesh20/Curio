// Creator media (Step 12d): upload with progress, owner-only fetch, and plain-language messages for the server's stable error codes.
// The server is authoritative; the checks here only save a round trip.
import { ApiError, apiUrl, notifyUnauthorized, tokenStore } from "@/lib/api";

/** POST /api/media 201 body (MediaAssetDto). No URL: content refers to the id. */
export interface MediaAsset {
  id: string;
  contentType: string;
  width: number;
  height: number;
  size: number;
  thumb: { width: number; height: number; size: number };
}

export const MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** media.max-bytes on the server (5 MB). */
export const MEDIA_MAX_BYTES = 5 * 1024 * 1024;
export const MEDIA_ACCEPT = MEDIA_TYPES.join(",");

/** UX-only pre-check; returns a message or null. The server decides (it reads the real bytes). */
export function checkMediaFile(file: { type: string; size: number }): string | null {
  if (!(MEDIA_TYPES as readonly string[]).includes(file.type)) return "Choose a JPEG, PNG or WebP image.";
  if (file.size > MEDIA_MAX_BYTES) return "That file is too large. The limit is 5 MB.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

const BY_CODE: Record<string, string> = {
  MEDIA_TOO_LARGE: "That file is too large. The limit is 5 MB.",
  MEDIA_TYPE_UNSUPPORTED: "That file type isn't supported. Use a JPEG, PNG or WebP image.",
  MEDIA_CORRUPT: "That file couldn't be read as an image. Try exporting it again.",
  MEDIA_ANIMATED: "Animated images aren't supported. Upload a still image.",
  MEDIA_DIMENSIONS: "That image's dimensions aren't supported. Use a smaller image.",
  MEDIA_COLORSPACE_UNSUPPORTED: "That image's colour format (for example CMYK) isn't supported. Export it as RGB.",
  MEDIA_QUOTA: "You've reached your image storage limit. Remove images you no longer use, or try again later.",
  MEDIA_BUSY: "The server is busy processing images. Please try again in a moment.",
  MEDIA_STORAGE_FAILED: "The image couldn't be stored. Please try again.",
  MEDIA_BAD_REQUEST: "The upload wasn't accepted. Please choose the file again.",
  MEDIA_NOT_USABLE: "That image isn't available any more. Upload it again.",
  MEDIA_NOT_FOUND: "That image couldn't be found.",
};

const GENERIC = "The upload failed. Please try again.";

/** A message a person can act on. Never the raw server text for a known code, never an internal detail. */
export function mediaErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code && BY_CODE[e.code]) return BY_CODE[e.code];
    if (e.status === 401) return "Your session has expired. Sign in again to upload.";
    if (e.status === 413) return BY_CODE.MEDIA_TOO_LARGE;
    if (e.status === 0) return "The upload couldn't reach the server. Check your connection and try again.";
    if (e.status >= 500) return "Something went wrong on our side. Please try again.";
  }
  return GENERIC;
}

/** Whether trying the same file again can help (busy / storage / network / 5xx), as opposed to a file the server rejected. */
export const isRetryableUpload = (e: unknown) =>
  e instanceof ApiError && (e.status === 0 || e.status >= 500 || e.code === "MEDIA_BUSY" || e.code === "MEDIA_STORAGE_FAILED");

export class UploadAborted extends Error {
  constructor() { super("Upload cancelled"); }
}

export interface UploadHandle {
  promise: Promise<MediaAsset>;
  /** Cancels the request. The promise rejects with UploadAborted; nothing else happens. */
  abort: () => void;
}

/**
 * POST /api/media as multipart (one part named `file`), with `XMLHttpRequest` because `fetch` has no upload progress.
 * `onProgress` gets 0..100. The Authorization header carries the same token every other call uses.
 */
export function uploadMedia(file: File, onProgress?: (percent: number) => void): UploadHandle {
  const xhr = new XMLHttpRequest();
  const promise = new Promise<MediaAsset>((resolve, reject) => {
    xhr.open("POST", apiUrl("/media"));
    const token = tokenStore.get();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && ev.total > 0) onProgress?.(Math.min(100, Math.round((ev.loaded / ev.total) * 100)));
    };
    xhr.onload = () => {
      let data: unknown = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* not JSON */ }
      const body = (data ?? {}) as { id?: unknown; error?: unknown; code?: unknown };
      if (xhr.status === 201 && typeof body.id === "string") { onProgress?.(100); resolve(data as MediaAsset); return; }
      if (xhr.status === 401 && token) notifyUnauthorized();
      reject(new ApiError(xhr.status, typeof body.error === "string" ? body.error : "Upload failed", typeof body.code === "string" ? body.code : undefined));
    };
    xhr.onerror = () => reject(new ApiError(0, "Network error"));
    xhr.ontimeout = () => reject(new ApiError(0, "Timed out"));
    xhr.onabort = () => reject(new UploadAborted());
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
  return { promise, abort: () => xhr.abort() };
}

/**
 * The owner's own asset, fetched with the Authorization header (an <img> can't send it). The caller turns the blob into an object
 * URL and owns revoking it. `variant` is "thumb" for the small version.
 */
export async function fetchOwnerMedia(id: string, variant: "original" | "thumb", signal?: AbortSignal): Promise<Blob> {
  const token = tokenStore.get();
  const res = await fetch(apiUrl(`/media/${encodeURIComponent(id)}/content?variant=${variant}`), {
    signal,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (res.status === 401 && token) notifyUnauthorized();
  if (!res.ok) throw new ApiError(res.status, res.statusText || "Could not load the image");
  return res.blob();
}
