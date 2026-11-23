import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CollectionCard } from "@/components/public/CollectionCard";
import { NotAvailable } from "@/components/public/NotAvailable";
import { ShareButton } from "@/components/public/ShareButton";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useConfirmedPublicData } from "@/hooks/useConfirmedPublicData";
import { usePublicArrival, type ArrivalState } from "@/hooks/usePublicArrival";
import { usePublicCreator, usePublicCreatorCollections } from "@/hooks/useContent";
import { ApiError } from "@/lib/api";
import { paths } from "@/lib/paths";
import type { PublicCollectionSummary } from "@/lib/types";

/** Images come from the server's https-only profile fields; anything else is never rendered (defence in depth). */
const httpsOnly = (url: string | null | undefined) => (url && /^https:\/\//i.test(url.trim()) ? url.trim() : null);
const refOf = (c: PublicCollectionSummary) => `${c.creator.username}/${c.slug}`;
const joined = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
};

interface Group { key: string; name: string; items: PublicCollectionSummary[] }

/**
 * Groups by category in the order categories first appear (the API's newest-first order), uncategorized under "Other"
 * last. Recomputed over everything loaded, so a group grows (or a new one appears) when another page loads.
 */
function groupByCategory(items: PublicCollectionSummary[]): Group[] {
  const groups = new Map<string, Group>();
  let other: Group | null = null;
  for (const c of items) {
    if (!c.category) { (other ??= { key: "~other", name: "Other", items: [] }).items.push(c); continue; }
    const g = groups.get(c.category.slug) ?? { key: c.category.slug, name: c.category.name, items: [] };
    g.items.push(c);
    groups.set(c.category.slug, g);
  }
  return other ? [...groups.values(), other] : [...groups.values()];
}

/**
 * `/@username`: the public creator profile (Step 15b, plan rev. 2.1 §3.2–§4).
 * - The profile request alone decides availability: a 404 (PRIVATE, unknown or suspended: the same answer) gets the
 *   neutral not-available screen, and the collections are never requested.
 * - Collections: the creator's LISTED collections (`?creator=`), 50 per page with "Load more", merged and de-duplicated by
 *   username/slug, grouped by category. Offset paging is not a snapshot: a collection published or unpublished meanwhile
 *   can shift page boundaries (plan §3.3 consistency limit); nothing here claims otherwise.
 */
export default function CreatorProfile({ username }: { username: string }) {
  const q = usePublicCreator(username);
  const notFound = q.error instanceof ApiError && q.error.status === 404;
  const creator = useConfirmedPublicData(q, username);
  const cols = usePublicCreatorCollections(username, !!creator);

  const name = creator ? creator.displayName || creator.username : null;
  useDocumentTitle(notFound ? "Not available" : creator ? `${name} (@${creator.username})` : null);

  const contentRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const collectionsSettled = cols.isSuccess || (cols.isError && !cols.isFetching);
  const arrivalState: ArrivalState = notFound ? "not-found"
    : q.isError ? (q.isFetching ? "pending" : "error")
    : creator && collectionsSettled ? "content" : "pending";
  const arrival = usePublicArrival({ arrivalKey: `creator:${username}`, state: arrivalState, contentRef, headingRef, errorRef });

  // Merged, de-duplicated collections ("Showing N of M": M is the latest response's totalItems, no snapshot claim).
  const items = useMemo(() => {
    const seen = new Set<string>();
    const out: PublicCollectionSummary[] = [];
    for (const page of cols.data?.pages ?? []) for (const c of page.items) {
      const ref = refOf(c);
      if (!seen.has(ref)) { seen.add(ref); out.push(c); }
    }
    return out;
  }, [cols.data]);
  const pages = cols.data?.pages ?? [];
  const total = pages.length ? pages[pages.length - 1].totalItems : 0;
  const groups = useMemo(() => groupByCategory(items), [items]);

  // Focus after "Load more": stays on the button while it remains; when it disappears, moves to the first new card.
  const loadMoreRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{ before: Set<string> } | null>(null);
  const loadMore = () => {
    if (cols.isFetchingNextPage) return;
    pendingFocus.current = document.activeElement === loadMoreRef.current ? { before: new Set(items.map(refOf)) } : null;
    void cols.fetchNextPage();
  };
  useEffect(() => {
    const p = pendingFocus.current;
    if (!p || cols.isFetchingNextPage) return;
    if (cols.isFetchNextPageError) { pendingFocus.current = null; return; }
    pendingFocus.current = null;
    if (cols.hasNextPage) { loadMoreRef.current?.focus(); return; }
    const first = items.find((c) => !p.before.has(refOf(c)));
    if (!first) return;
    listRef.current?.querySelector<HTMLElement>(`[data-collection-ref="${CSS.escape(refOf(first))}"] [data-testid="collection-card"]`)?.focus();
  }, [cols.isFetchingNextPage, cols.isFetchNextPageError, cols.hasNextPage, items]);

  if (notFound) return <Shell><NotAvailable what="profile" ref={headingRef} /></Shell>;
  if (q.isError) {
    return (
      <Shell>
        <div ref={errorRef} tabIndex={-1} className="focus:outline-none">
          <ErrorState error={q.error} onRetry={() => { arrival.retry(); q.refetch(); }} />
        </div>
      </Shell>
    );
  }
  if (!creator) return <Shell><LoadingState label="Loading profile..." /></Shell>;

  const banner = httpsOnly(creator.bannerUrl);
  const avatar = httpsOnly(creator.avatarUrl);
  const links = Object.entries(creator.socialLinks ?? {}).filter(([, url]) => httpsOnly(url));
  const since = joined(creator.joinedAt);

  return (
    <Shell>
      <article ref={contentRef} className="space-y-10">
        <header className="space-y-4" data-scroll-anchor="header">
          {banner && (
            <div className="aspect-[4/1] w-full overflow-hidden rounded-lg bg-muted">
              <img src={banner} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" data-testid="creator-banner" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-4">
            {avatar && (
              <img src={avatar} alt="" referrerPolicy="no-referrer" width={80} height={80}
                className="h-20 w-20 rounded-full border border-border object-cover" data-testid="creator-avatar" />
            )}
            <div className="min-w-0 flex-1">
              <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold break-words focus:outline-none">{name}</h1>
              <p className="text-muted-foreground">@{creator.username}</p>
            </div>
            <ShareButton what="profile" title={name!} path={paths.creatorProfile(creator.username)} />
          </div>
          {creator.bio && <p className="whitespace-pre-line break-words">{creator.bio}</p>}
          {links.length > 0 && (
            <ul aria-label="Links" className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {links.map(([label, url]) => (
                <li key={label}>
                  <a href={httpsOnly(url)!} target="_blank" rel="noopener noreferrer nofollow" className="text-primary underline-offset-2 hover:underline">{label}</a>
                </li>
              ))}
            </ul>
          )}
          {since && <p className="text-sm text-muted-foreground">Joined {since}</p>}
        </header>

        <section aria-labelledby="creator-collections" className="space-y-6" data-scroll-anchor="collections">
          <h2 id="creator-collections" className="text-xl font-semibold">Collections</h2>
          {cols.isError && !cols.data ? (
            <ErrorState error={cols.error} onRetry={() => { void cols.refetch(); }} />
          ) : !cols.data ? (
            <LoadingState label="Loading collections..." />
          ) : items.length === 0 ? (
            <EmptyState message="No published collections yet" />
          ) : (
            <div ref={listRef} className="space-y-8">
              {groups.map((g) => (
                <div key={g.key} className="space-y-3">
                  <h3 id={`group-${g.key}`} className="text-lg font-medium">{g.name}</h3>
                  <ul aria-labelledby={`group-${g.key}`} className="grid gap-4 sm:grid-cols-2">
                    {g.items.map((c) => (
                      <li key={refOf(c)} data-collection-ref={refOf(c)}><CollectionCard c={c} showCreator={false} /></li>
                    ))}
                  </ul>
                </div>
              ))}
              {cols.isFetchNextPageError && (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
                  <span>Couldn't load more collections.</span>
                  <Button variant="outline" size="sm" onClick={loadMore}>Retry</Button>
                </div>
              )}
              {cols.hasNextPage && (
                <div className="flex flex-wrap items-center gap-3">
                  <Button ref={loadMoreRef} variant="outline" onClick={loadMore} aria-disabled={cols.isFetchingNextPage || undefined}>
                    {cols.isFetchingNextPage ? "Loading..." : "Load more collections"}
                  </Button>
                  <span className="text-sm text-muted-foreground">Showing {items.length} of {total}</span>
                </div>
              )}
            </div>
          )}
        </section>
      </article>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="container mx-auto max-w-4xl px-4 pb-16 pt-28">
      <Link to={paths.discover()} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Discover
      </Link>
      {children}
    </section>
  );
}
