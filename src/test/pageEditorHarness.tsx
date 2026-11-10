import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import PageEditor from "@/pages/creator/PageEditor";
import type { CreatorPage, StoredBlock } from "@/lib/types";
import { err, errCode, ok, type Reply, type Req } from "@/test/fakeApi";
import { vi } from "vitest";

export const STORED: StoredBlock[] = [
  { id: "h1", type: "heading", level: 2, text: "Intro" },
  { id: "t1", type: "text", text: "Hello world" },
  { id: "c1", type: "code", language: "java", code: "int x = 1;", caption: "" },
];

export const makePage = (over: Partial<CreatorPage> = {}): CreatorPage => ({
  id: 9, moduleId: 7, collectionId: 5, slug: "intro", title: "Intro page", summary: "A summary", blocks: JSON.parse(JSON.stringify(STORED)),
  status: "DRAFT", position: 0, legacy: false, legacyContent: null, blocksUnreadable: false, version: 3, ...over,
});

export type PutBody = {
  title: string; summary?: string; blocks?: StoredBlock[]; discardUnreadableContent?: boolean; expectedVersion?: number; autosave?: boolean;
};

/** A server that follows the real rules: version check, autosave refused on a live page, unreadable body kept, version bumped on save. */
export function routes(page: CreatorPage, extra: Record<string, (r: Req) => Reply> = {}) {
  const copy = () => JSON.parse(JSON.stringify(page));
  return {
    "GET /pages/9": () => ok(copy()),
    "PUT /pages/9": ({ body }: Req) => {
      const b = body as PutBody;
      if (b.autosave && page.status === "PUBLISHED") return errCode(409, "This page is published, so changes are saved only when you press Save.", "PAGE_PUBLISHED");
      if (b.expectedVersion !== undefined && b.expectedVersion !== page.version) return errCode(409, "This page was changed somewhere else.", "VERSION_CONFLICT");
      if (page.blocksUnreadable && b.blocks !== undefined && !b.discardUnreadableContent) return err(409, "This page's saved content can't be read, so it was not replaced.");
      if (b.discardUnreadableContent && (!page.blocksUnreadable || b.blocks === undefined)) return err(400, "Nothing to discard");
      page.title = b.title;
      page.version += 1;
      if (b.summary !== undefined) page.summary = b.summary;
      if (b.blocks !== undefined) { page.blocks = b.blocks; page.legacy = false; page.legacyContent = null; page.blocksUnreadable = false; }
      return ok(copy());
    },
    "POST /pages/9/publish": () => { page.status = "PUBLISHED"; return ok(copy()); },
    "POST /pages/9/unpublish": () => { page.status = "DRAFT"; return ok(copy()); },
    ...extra,
  };
}

export function mountEditor(opts: { id?: number; entries?: string[]; index?: number } = {}) {
  const id = opts.id ?? 9;
  const qc = new QueryClient({ defaultOptions: { queries: { retryDelay: 1 }, mutations: { retry: false } } });
  const router = createMemoryRouter([
    { path: "/create/pages/:id", element: <PageEditor id={id} /> },
    { path: "/create/collections/:id", element: <div data-testid="collection-route" /> },
    { path: "/elsewhere", element: <div data-testid="elsewhere-route" /> },
  ], { initialEntries: opts.entries ?? ["/create/pages/" + id], initialIndex: opts.index });
  const view = render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>);
  return { ...view, router, qc };
}

export const btn = (name: string | RegExp) => screen.getByRole("button", { name });
export const saveState = () => screen.getByTestId("save-state").textContent;
export const typeText = (v: string) => fireEvent.change(screen.getByLabelText("Text"), { target: { value: v } });
export const typeTitle = (v: string) => fireEvent.change(screen.getByLabelText("Title"), { target: { value: v } });
export const blockIds = () => [...document.querySelectorAll("[data-block-id]")].map((e) => e.getAttribute("data-block-id"));

export const puts = (api: { sent: (m: string, p: string) => Req[] }) => api.sent("PUT", "/pages/9").map((c) => c.body as PutBody);

/** With fake timers: lets promises, React renders and `ms` of fake time run. */
export const tick = (ms = 0) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
/** Loads the editor under fake timers (the first query answers through the fake `fetch`). */
export async function loadedFake() {
  for (let i = 0; i < 5; i++) await tick(0);
  await screen.findByRole("heading", { level: 1 }).catch(() => undefined);
}
