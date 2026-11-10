import { vi } from "vitest";

export interface Req { method: string; path: string; body: unknown; headers: Record<string, string> }
export type Reply = { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>;
export type Handler = (req: Req) => Reply;

/**
 * Installs a fake `fetch` that answers by "METHOD /api/path" (query string included). Handlers may be replaced
 * mid-test to model server state changing; every request is recorded so tests can assert exactly what was sent.
 */
export function installFakeApi(routes: Record<string, Handler>) {
  const calls: Req[] = [];
  const table = { ...routes };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const [pathOnly] = String(url).split("?");
    const req: Req = {
      method: init?.method ?? "GET",
      path: String(url).replace(/^\/api/, ""),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: (init?.headers ?? {}) as Record<string, string>,
    };
    calls.push(req);
    const handler = table[`${req.method} ${req.path}`] ?? table[`${req.method} ${pathOnly.replace(/^\/api/, "")}`];
    const reply = handler ? await handler(req) : { status: 500, body: { error: `unmocked ${req.method} ${req.path}` } };
    return new Response(reply.status === 204 ? null : JSON.stringify(reply.body ?? {}), {
      status: reply.status,
      headers: { "Content-Type": "application/json" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return {
    calls,
    set: (key: string, h: Handler) => { table[key] = h; },
    sent: (method: string, path: string) => calls.filter((c) => c.method === method && c.path === path),
  };
}

export const ok = (body: unknown): Reply => ({ status: 200, body });
export const err = (status: number, error: string): Reply => ({ status, body: { error } });
/** An error reply carrying the machine-readable `code` some 409s have (VERSION_CONFLICT, PAGE_PUBLISHED). */
export const errCode = (status: number, error: string, code: string): Reply => ({ status, body: { error, code } });
/** The server's 400 for page blocks it refuses (Step 11): which block, which field, what to fix. */
export const errBlocks = (problems: { id: string; field: string; message: string }[]): Reply =>
  ({ status: 400, body: { error: "Some blocks need fixing before this page can be saved.", code: "INVALID_BLOCKS", problems } });
