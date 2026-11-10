const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const TOKEN_KEY = "auth_token";

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

/** One thing the server found wrong with one block (400 INVALID_BLOCKS): the block id (or "#3" without one), the field, what to do. */
export interface ServerBlockProblem { id: string; field: string; message: string }

function parseProblems(data: unknown): ServerBlockProblem[] | undefined {
  const raw = (data as { problems?: unknown } | null)?.problems;
  if (!Array.isArray(raw)) return undefined;
  return raw.flatMap((p) => (p && typeof p.id === "string" && typeof p.message === "string" ? [{ id: p.id, field: typeof p.field === "string" ? p.field : "", message: p.message }] : []));
}

export class ApiError extends Error {
  /** `code` is a machine-readable reason some 409s carry (VERSION_CONFLICT, PAGE_PUBLISHED). */
  constructor(public status: number, message: string, public code?: string, public problems?: ServerBlockProblem[]) {
    super(message);
  }
}

/** Called when the server rejects our token, so the UI can drop the session. */
let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

/** Tells the app the server rejected our token (for callers that do not go through `request`, such as the media upload). */
export const notifyUnauthorized = () => onUnauthorized?.();

/** Absolute URL of an API path (same base as every other call). */
export const apiUrl = (path: string) => `${BASE}/api${path}`;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = tokenStore.get();
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    // A 401 on a call that carried a token means the token expired or is invalid.
    if (res.status === 401 && token) onUnauthorized?.();
    throw new ApiError(res.status, data?.error ?? res.statusText ?? "Request failed", typeof data?.code === "string" ? data.code : undefined, parseProblems(data));
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>("GET", path),
  post: <T>(path: string, body?: unknown) => request<T>("POST", path, body ?? {}),
  put: <T>(path: string, body: unknown) => request<T>("PUT", path, body),
  patch: <T>(path: string, body: unknown) => request<T>("PATCH", path, body),
  delete: <T = void>(path: string) => request<T>("DELETE", path),
};
