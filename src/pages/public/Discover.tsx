import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CollectionCard } from "@/components/public/CollectionCard";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { usePublicArrival, type ArrivalState } from "@/hooks/usePublicArrival";
import { useCategories, usePublicCollections } from "@/hooks/useContent";

export const DISCOVER_PAGE_SIZE = 12;
/** The server trims the query and cuts it to 100 characters; the box stops there too. */
export const MAX_QUERY = 100;
export const SEARCH_DEBOUNCE_MS = 300;

/** `?page=` is 1-based for people; anything that isn't a positive whole number is page 1. */
const parsePage = (raw: string | null) => (raw && /^[1-9]\d{0,5}$/.test(raw) ? Number(raw) : 1);

/**
 * `/discover`: every listed collection (PUBLISHED and readable; never UNLISTED: the server decides), newest first.
 * The search text, category and page live in the URL (`?q=&category=&page=`) so a filtered view can be shared,
 * refreshed and navigated with back/forward.
 */
export default function Discover() {
  useDocumentTitle("Discover");
  const [params, setParams] = useSearchParams();
  const q = (params.get("q") ?? "").slice(0, MAX_QUERY);
  const category = params.get("category") ?? "";
  const page = parsePage(params.get("page"));

  /** Changes some params; any filter change goes back to page 1. Typing replaces the history entry instead of adding one. */
  const update = (patch: Record<string, string | null>, opts: { replace?: boolean } = {}) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (!("page" in patch)) next.delete("page");
      return next;
    }, { replace: opts.replace });
  };

  // The box is local while typing; the URL (and the request) follows after a pause.
  const [text, setText] = useState(q);
  useEffect(() => { setText(q); }, [q]);
  useEffect(() => {
    if (text.trim() === q.trim()) return;
    const t = setTimeout(() => update({ q: text.trim() || null }, { replace: true }), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed text should restart the pause
  }, [text]);

  const categories = useCategories();
  const list = usePublicCollections({ q: q || undefined, category: category || undefined, page: page - 1, size: DISCOVER_PAGE_SIZE }, { keepPrevious: true });
  const data = list.data;
  const totalPages = data?.totalPages ?? 0;
  const filtered = !!q || !!category;
  const clear = () => { setText(""); update({ q: null, category: null }); };

  // Arrival, scroll restoration and focus (Step 14d-3). The key is constant: search, filters and paging change only the
  // query string, which is never an arrival (no scroll, no focus).
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const arrivalState: ArrivalState = data ? "content" : list.isError ? (list.isFetching ? "pending" : "error") : "pending";
  const arrival = usePublicArrival({ arrivalKey: "discover", state: arrivalState, contentRef, headingRef, errorRef });

  return (
    <section className="container mx-auto max-w-6xl px-4 pb-16 pt-28">
      <header className="mb-6 space-y-2">
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold focus:outline-none">Discover</h1>
        <p className="text-muted-foreground">Guides, tutorials, recipes, travel notes and stories published by creators.</p>
      </header>

      <form role="search" className="relative mb-4" onSubmit={(e) => { e.preventDefault(); update({ q: text.trim() || null }); }}>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label="Search collections" placeholder="Search by title or description" className="pl-9"
          value={text} maxLength={MAX_QUERY} onChange={(e) => setText(e.target.value)} />
      </form>

      {categories.data && categories.data.length > 0 && (
        <div role="group" aria-label="Categories" className="mb-6 flex flex-wrap gap-2">
          <Button type="button" size="sm" variant={category ? "outline" : "default"} aria-pressed={!category}
            onClick={() => update({ category: null })}>All</Button>
          {categories.data.map((c) => (
            <Button key={c.slug} type="button" size="sm" variant={category === c.slug ? "default" : "outline"} aria-pressed={category === c.slug}
              onClick={() => update({ category: category === c.slug ? null : c.slug })}>{c.name}</Button>
          ))}
        </div>
      )}

      {list.isLoading && <LoadingState label="Loading collections..." />}
      {list.isError && !data && (
        <div ref={errorRef} tabIndex={-1} role="region" aria-label="Couldn't load Discover" className="focus:outline-none">
          <ErrorState error={list.error} onRetry={() => { arrival.retry(); list.refetch(); }} />
        </div>
      )}

      {data && (
        <div ref={contentRef} aria-busy={list.isFetching} className={list.isPlaceholderData ? "opacity-60 transition-opacity" : undefined}>
          <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
            {data.totalItems === 0 ? "" : `${data.totalItems} ${data.totalItems === 1 ? "collection" : "collections"}`}
          </p>

          {data.items.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center" data-testid="discover-empty">
              {page > 1 && totalPages > 0 ? (
                <>
                  <p className="text-muted-foreground">There is no page {page}.</p>
                  <Button variant="outline" onClick={() => update({ page: null })}>Go to the first page</Button>
                </>
              ) : filtered ? (
                <>
                  <p className="text-muted-foreground">No collections match your search.</p>
                  <Button variant="outline" onClick={clear}>Clear filters</Button>
                </>
              ) : (
                <p className="text-muted-foreground">Nothing has been published yet. Check back soon.</p>
              )}
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((c) => <li key={`${c.creator.username}/${c.slug}`} data-scroll-anchor={`card-${c.creator.username}/${c.slug}`}><CollectionCard c={c} /></li>)}
            </ul>
          )}

          {totalPages > 1 && (
            <nav aria-label="Pagination" data-scroll-anchor="pager" className="mt-8 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: page - 1 > 1 ? String(page - 1) : null })}>
                <ChevronLeft className="mr-1 h-4 w-4" />Previous
              </Button>
              <span className="text-sm text-muted-foreground">Page {Math.min(page, totalPages)} of {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => update({ page: String(page + 1) })}>
                Next<ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </nav>
          )}
          {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
        </div>
      )}
    </section>
  );
}
