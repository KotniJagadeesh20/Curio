import { useEffect, useRef, useState } from "react";
import type { UseQueryResult } from "@tanstack/react-query";

type Q<T> = Pick<UseQueryResult<T, unknown>, "data" | "dataUpdatedAt" | "isFetching" | "isError"> & {
  refetch?: (opts: { cancelRefetch: boolean }) => Promise<unknown>;
};

/**
 * A public query's data, but only once the server has confirmed it during the current visit (Step 14b rule, shared by
 * the collection and page viewers since 14c).
 *
 * Default (14b, unchanged): cached data from an earlier visit may be out of date (the content may since have been
 * unpublished or deleted), and React Query hands it over at once while it revalidates in the background. It is returned
 * only once confirmed: data fetched since this visit started, or cached data that is not being revalidated. The visit
 * restarts when `visitKey` changes (the component is reused across URLs). A failed revalidation (404 or another error)
 * also keeps React Query's old data around: it is never returned then either.
 *
 * `revalidateOnVisit` (14c): for a query whose KEY stays the same while the visit changes (the page viewer's collection
 * outline, shared by every page of a collection). Confirmation is tracked per visit, never by comparing timestamps:
 * - every visit starts its OWN request (`cancelRefetch: true`), superseding any request still in flight from an earlier
 *   visit (or from before the visit), so a response requested before this visit can never confirm it;
 * - every visit has a unique generation number (not just the URL-derived `visitKey`, so revisiting a URL is a new
 *   visit); only the current visit's own request, once it has settled, marks that generation confirmed; a superseded or
 *   late request from an older visit (including an earlier visit to the same URL) is ignored;
 * - until then nothing is returned, whatever the cache holds and whatever its `dataUpdatedAt`;
 * - after that, data is returned while the query is not in error (a retry after a failed request shows the retried,
 *   newer data; a later failed refetch hides it again).
 * React Query can only cancel an in-flight request when the query already has data; with no data it always joins the
 * running request. So the query's real fetch state is read from the cache when the visit starts (`isFetchingInCache`,
 * before this visit's own mount fetch can begin): if a request was already running and couldn't be superseded, the
 * visit waits for it and then sends its own, and only that one confirms the visit.
 */
export function useConfirmedPublicData<T>(
  q: Q<T>, visitKey: string, opts: { revalidateOnVisit?: boolean; isFetchingInCache?: () => boolean } = {},
): T | undefined {
  const { revalidateOnVisit = false, isFetchingInCache } = opts;
  // Recorded when the visit starts (during render, before this visit's own mount fetch can begin): a request that is
  // already running and can't be superseded (no data yet, so React Query would join it) was requested before the visit.
  // Every visit gets its own generation number: A → B → A is three distinct visits, so a confirmation recorded for the
  // first A can never be mistaken for the second.
  const start = (id: number) => ({ id, visit: visitKey, at: Date.now(), joinsOlderRequest: revalidateOnVisit && q.data === undefined && !!isFetchingInCache?.() });
  const openedAt = useRef(start(1));
  if (openedAt.current.visit !== visitKey) openedAt.current = start(openedAt.current.id + 1);

  // visit-scoped confirmation (revalidateOnVisit only)
  const [settledVisit, setSettledVisit] = useState<number | null>(null);   // the generation whose own request settled
  const { refetch } = q;
  useEffect(() => {
    if (!revalidateOnVisit || !refetch) return;
    const visitId = openedAt.current.id;       // the visit this effect (and its requests) belongs to
    let cancelled = false;                     // set when the visit ends: its requests can no longer confirm anything
    const settle = () => { if (!cancelled) setSettledVisit(visitId); };
    // with data, cancelRefetch supersedes any running request; without data React Query joins it, so a request that
    // was already running when the visit began is awaited first and followed by this visit's own request
    const own = () => refetch({ cancelRefetch: true }).then(settle, settle);
    const afterOlder = () => { if (!cancelled) void own(); };
    if (openedAt.current.joinsOlderRequest) refetch({ cancelRefetch: true }).then(afterOlder, afterOlder);
    else void own();
    return () => { cancelled = true; };
  }, [visitKey, revalidateOnVisit, refetch]);

  const confirmed = revalidateOnVisit
    ? settledVisit === openedAt.current.id
    : q.dataUpdatedAt > openedAt.current.at || !q.isFetching;
  return q.data && confirmed && !q.isError ? q.data : undefined;
}
