import { vi } from "vitest";

/** A controllable XMLHttpRequest: tests decide when progress, success or failure happens. */
export class FakeXhr {
  static instances: FakeXhr[] = [];
  method = ""; url = ""; headers: Record<string, string> = {};
  status = 0; responseText = ""; aborted = false; sent = false; body: FormData | null = null;
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null; onerror: (() => void) | null = null; ontimeout: (() => void) | null = null; onabort: (() => void) | null = null;

  constructor() { FakeXhr.instances.push(this); }
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(k: string, v: string) { this.headers[k] = v; }
  send(body: FormData) { this.sent = true; this.body = body; }
  abort() { this.aborted = true; this.onabort?.(); }

  progress(loaded: number, total: number) { this.upload.onprogress?.({ lengthComputable: true, loaded, total }); }
  reply(status: number, body: unknown) { this.status = status; this.responseText = typeof body === "string" ? body : JSON.stringify(body); this.onload?.(); }
  fail() { this.onerror?.(); }

  static install() { FakeXhr.instances = []; vi.stubGlobal("XMLHttpRequest", FakeXhr); }
  static get last() { return FakeXhr.instances[FakeXhr.instances.length - 1]; }
}

export const asset = (id = "11111111-1111-4111-8111-111111111111") => ({
  id, contentType: "image/jpeg", width: 800, height: 600, size: 1234, thumb: { width: 640, height: 480, size: 99 },
});

/** Tracks every object URL created and revoked, so tests can assert none is left dangling. */
export function trackObjectUrls() {
  let n = 0;
  const live = new Set<string>(), created: string[] = [], revoked: string[] = [];
  const create = vi.fn(() => { const u = `blob:test/${++n}`; live.add(u); created.push(u); return u; });
  const revoke = vi.fn((u: string) => { live.delete(u); revoked.push(u); });
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  return { live, created, revoked };
}

/** A fetch that answers owner-media requests with an image blob (and records them); everything else is a 500. */
export function stubOwnerMedia(status = 200) {
  const calls: { url: string; auth: string | undefined }[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), auth: (init?.headers as Record<string, string> | undefined)?.Authorization });
    // a plain object: jsdom's Blob and Node's Response do not share a Blob class
    return { ok: status >= 200 && status < 300, status, statusText: "", blob: async () => new Blob(["img"], { type: "image/jpeg" }) };
  }));
  return calls;
}

export const imageFile = (name = "a.jpg", type = "image/jpeg", size = 10) => new File([new Uint8Array(size)], name, { type });
