import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { apiPaths } from "@/lib/paths";
import type { CollectionInput, CollectionSummary, CreatorModule, CreatorPage, ModuleInput, PageInput } from "@/lib/types";

/**
 * Creator write hooks (Step 8). They only call the owner-checked creator API: the server decides ownership, status
 * transitions and slug rules, and a 400/403/404/409 comes back as an `ApiError` for the caller to show. Nothing here
 * pretends to know the rules.
 *
 * Invalidation is targeted, by what a write can change:
 *  - the collection's own detail (`["mine","collection",id]`): structure, counts, draft/published numbers
 *  - the list (`["mine","collections"]`): status badges and counts on the cards
 *  - one page (`["mine","page",id]`): only when that page changed
 *  - `["public"]`: only when a write changes what readers can see (publish, unpublish, delete, restore, slug changes,
 *    removing a page or module)
 * Pages of OTHER collections are never refetched.
 */
const mine = {
  list: ["mine", "collections"] as const,
  detail: (id: number) => ["mine", "collection", id] as const,
  page: (id: number) => ["mine", "page", id] as const,
};
const publicKey = ["public"] as const;

const refreshCollection = (qc: QueryClient, collectionId: number, opts: { publicToo?: boolean } = {}) => {
  const jobs = [
    qc.invalidateQueries({ queryKey: mine.detail(collectionId) }),
    qc.invalidateQueries({ queryKey: mine.list }),
  ];
  if (opts.publicToo) jobs.push(qc.invalidateQueries({ queryKey: publicKey }));
  return Promise.all(jobs);
};

// ---- collections ----
export const useCreateCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CollectionInput) => api.post<CollectionSummary>(apiPaths.collections(), input),
    onSuccess: () => qc.invalidateQueries({ queryKey: mine.list }),
  });
};

export const useUpdateCollection = (id: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CollectionInput) => api.put<CollectionSummary>(apiPaths.collection(id), input),
    // a slug change moves the public URL
    onSuccess: () => refreshCollection(qc, id, { publicToo: true }),
  });
};

/** Soft delete (restorable for 30 days). */
export const useDeleteCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(apiPaths.collection(id)),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: mine.detail(id) });
      return Promise.all([qc.invalidateQueries({ queryKey: mine.list }), qc.invalidateQueries({ queryKey: publicKey })]);
    },
  });
};

export const useRestoreCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<CollectionSummary>(apiPaths.collectionAction(id, "restore")),
    onSuccess: (_d, id) => refreshCollection(qc, id, { publicToo: true }),
  });
};

/** `status` is PUBLISHED (default) or UNLISTED: exactly what the backend accepts. Needs a published page (server rule). */
export const usePublishCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status?: "PUBLISHED" | "UNLISTED" }) =>
      api.post<CollectionSummary>(apiPaths.collectionAction(id, "publish"), status ? { status } : {}),
    onSuccess: (_d, v) => refreshCollection(qc, v.id, { publicToo: true }),
  });
};

export const useUnpublishCollection = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.post<CollectionSummary>(apiPaths.collectionAction(id, "unpublish")),
    onSuccess: (_d, id) => refreshCollection(qc, id, { publicToo: true }),
  });
};

// ---- modules ----
export const useCreateModule = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ModuleInput) => api.post<CreatorModule>(apiPaths.collectionModules(collectionId), input),
    onSuccess: () => refreshCollection(qc, collectionId),     // an empty module is invisible publicly
  });
};

export const useUpdateModule = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: ModuleInput }) => api.put<CreatorModule>(apiPaths.module(id), input),
    onSuccess: () => refreshCollection(qc, collectionId, { publicToo: true }),
  });
};

/** Hard delete of the module and its pages (the UI confirms). */
export const useDeleteModule = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(apiPaths.module(id)),
    onSuccess: () => refreshCollection(qc, collectionId, { publicToo: true }),
  });
};

export const useReorderModule = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, position }: { id: number; position: number }) =>
      api.patch<CreatorModule>(apiPaths.moduleReorder(id), { position }),
    onSuccess: () => refreshCollection(qc, collectionId, { publicToo: true }),
  });
};

// ---- pages (metadata only in Step 8; the block editor is Step 9) ----
export const useCreatePage = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, input }: { moduleId: number; input: PageInput }) =>
      api.post<CreatorPage>(apiPaths.modulePages(moduleId), input),
    onSuccess: () => refreshCollection(qc, collectionId),     // always a draft: nothing public changes
  });
};

/**
 * `auto` marks an autosave: it tells the server to refuse the write if the page is live (409 PAGE_PUBLISHED), and it only
 * refreshes the draft's own outline. The response is the freshest copy of the page, so it goes straight into the cache
 * instead of being refetched (a refetch answering late could otherwise bring back an older version). Nothing here waits
 * for refetches: a save is finished when the server answered, so the editor can start the next one.
 */
export const useUpdatePage = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: PageInput; auto?: boolean }) => api.put<CreatorPage>(apiPaths.page(id), input),
    onSuccess: (data, v) => {
      qc.setQueryData(mine.page(v.id), data);
      void refreshCollection(qc, collectionId, { publicToo: !v.auto });
    },
  });
};

export const usePublishPage = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, publish }: { id: number; publish: boolean }) =>
      api.post<CreatorPage>(apiPaths.pageAction(id, publish ? "publish" : "unpublish")),
    onSuccess: (_d, v) =>
      Promise.all([refreshCollection(qc, collectionId, { publicToo: true }), qc.invalidateQueries({ queryKey: mine.page(v.id) })]),
  });
};

export const useDeletePage = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(apiPaths.page(id)),
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: mine.page(id) });
      return refreshCollection(qc, collectionId, { publicToo: true });
    },
  });
};

export const useReorderPage = (collectionId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, position }: { id: number; position: number }) =>
      api.patch<CreatorPage>(apiPaths.pageReorder(id), { position }),
    onSuccess: () => refreshCollection(qc, collectionId, { publicToo: true }),
  });
};
