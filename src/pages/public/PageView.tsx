import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, ListTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { CollectionOutline } from "@/components/public/CollectionOutline";
import { NotAvailable } from "@/components/public/NotAvailable";
import { PageNav } from "@/components/public/PageNav";
import { PublicBlocks } from "@/components/public/PublicBlocks";
import { ShareButton } from "@/components/public/ShareButton";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useConfirmedPublicData } from "@/hooks/useConfirmedPublicData";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useNoIndex } from "@/hooks/useNoIndex";
import { usePublicArrival, type ArrivalState } from "@/hooks/usePublicArrival";
import { usePublicCollection, usePublicPage } from "@/hooks/useContent";
import { ApiError } from "@/lib/api";
import { paths } from "@/lib/paths";

interface Props { username: string; collectionSlug: string; moduleSlug: string; pageSlug: string }

const is404 = (e: unknown) => e instanceof ApiError && e.status === 404;

/**
 * `/@username/collection/module/page`: one published page, with its collection's published outline (sidebar on wide
 * screens, a "Contents" drawer below `lg`) and previous/next.
 *
 * Two queries: the page (content and metadata) and the collection (the outline; the page API doesn't return it). Both go
 * through the 14b stale-cache rule, and the reading view renders only once BOTH are confirmed, so content and navigation
 * never come from an outdated cache. Either 404 → the same neutral screen; any other error → error state.
 */
export default function PageView({ username, collectionSlug, moduleSlug, pageSlug }: Props) {
  const pq = usePublicPage(username, collectionSlug, moduleSlug, pageSlug);
  const qc = useQueryClient();
  const cq = usePublicCollection(username, collectionSlug);
  const visit = `${username}/${collectionSlug}/${moduleSlug}/${pageSlug}`;
  const page = useConfirmedPublicData(pq, visit);
  // The outline's query key is the same for every page of a collection, so it is explicitly revalidated on each visit
  // and only an outline fetched during this visit is used (an unpublished page never lingers in the navigation).
  const outline = useConfirmedPublicData(cq, visit, {
    revalidateOnVisit: true,
    // the real fetch state in the cache (usePublicCollection's key; guarded by the "request already running" test)
    isFetchingInCache: () => qc.getQueryState(["public", "collection", username, collectionSlug])?.fetchStatus === "fetching",
  });

  const notFound = is404(pq.error) || is404(cq.error);
  const failed = !notFound && (pq.isError || cq.isError);
  const ready = !notFound && !failed && page && outline ? { page, outline } : null;

  // The title comes from confirmed data only: never a cached title after a failed revalidation.
  useDocumentTitle(notFound ? "Not available" : ready ? ready.page.page.title : null);

  // noindex follows the last CONFIRMED page: set or cleared when a page is confirmed, cleared on a definitive 404, and
  // otherwise kept as it was. So it never drops while moving between unlisted pages (the next page is briefly
  // unconfirmed) or while only the outline query is failing, and it never comes from unconfirmed cached data.
  const [lastUnlisted, setLastUnlisted] = useState(false);
  const unlisted = notFound ? false : page ? page.collection.unlisted === true : lastUnlisted;
  if (unlisted !== lastUnlisted) setLastUnlisted(unlisted);
  useNoIndex(unlisted);

  // Arrival, scroll restoration and focus (Step 14d-3). The state is this visit's: a failed request that is being
  // retried counts as pending, so only its final outcome triggers anything.
  const contentRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const arrivalState: ArrivalState = notFound ? "not-found"
    : failed ? (pq.isFetching || cq.isFetching ? "pending" : "error")
    : ready ? "content" : "pending";
  const arrival = usePublicArrival({ arrivalKey: `page:${visit}`, state: arrivalState, contentRef, headingRef, errorRef });

  if (notFound) return <Shell><NotAvailable what="page" ref={headingRef} /></Shell>;
  if (failed) {
    const error = pq.isError ? pq.error : cq.error;
    return (
      <Shell>
        <div ref={errorRef} tabIndex={-1} role="region" aria-label="Couldn't load this page" className="focus:outline-none">
          <ErrorState error={error} onRetry={() => { arrival.retry(); if (pq.isError) pq.refetch(); if (cq.isError) cq.refetch(); }} />
        </div>
      </Shell>
    );
  }
  if (!ready) return <Shell><LoadingState label="Loading page..." /></Shell>;

  const { collection, module, page: p } = ready.page;
  const modules = ready.outline.modules;
  const current = { moduleSlug: module.slug, pageSlug: p.slug };
  const pagePath = paths.page(username, collection.slug, module.slug, p.slug);
  const outlineNav = (idPrefix: string) =>
    <CollectionOutline username={username} collectionSlug={collection.slug} modules={modules} current={current} idPrefix={idPrefix} />;

  return (
    <Shell>
      <div className="lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-10">
        <aside className="hidden lg:block" data-testid="page-sidebar">
          <div className="sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto pr-2">{outlineNav("sidebar-module")}</div>
        </aside>

        <article ref={contentRef} className="min-w-0 space-y-8">
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <li><Link to={paths.discover()} className="hover:text-foreground">Discover</Link></li>
              <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
              <li className="min-w-0"><Link to={paths.collection(username, collection.slug)} className="break-words hover:text-foreground">{collection.title}</Link></li>
              <li aria-hidden><ChevronRight className="h-3.5 w-3.5" /></li>
              <li className="min-w-0 break-words">{module.title}</li>
            </ol>
          </nav>

          <ContentsDrawer visit={visit} currentPath={pagePath}>{outlineNav("drawer-module")}</ContentsDrawer>

          <header className="space-y-3" data-scroll-anchor="title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h1 ref={headingRef} tabIndex={-1} className="min-w-0 text-3xl font-bold break-words focus:outline-none">{p.title}</h1>
              <ShareButton what="page" title={`${p.title} · ${collection.title}`} path={pagePath} />
            </div>
            {p.summary && <p className="text-lg text-muted-foreground whitespace-pre-line break-words">{p.summary}</p>}
          </header>

          <div className="max-w-[72ch]">
            <PublicBlocks key={visit} page={p} />
          </div>

          <div data-scroll-anchor="page-nav">
            <PageNav username={username} collectionSlug={collection.slug} modules={modules} moduleSlug={module.slug} pageSlug={p.slug} />
          </div>
        </article>
      </div>
    </Shell>
  );
}

/**
 * Below `lg`: the same outline in a drawer. It closes when a page link is followed (or the page changes). When the link
 * opens ANOTHER page, focus is left to the arrival (the new page's heading) instead of Radix returning it to "Contents";
 * Escape, the close button or the current page's own link keep the default (focus back on "Contents").
 * Exported only for its focus test (ContentsDrawer.focus.test.tsx), which keeps the drawer mounted across the navigation.
 */
export function ContentsDrawer({ visit, currentPath, children }: { visit: string; currentPath: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closedByNavigation = useRef(false);
  useEffect(() => setOpen(false), [visit]);
  const closeOnLink = (e: MouseEvent) => {
    const link = (e.target as HTMLElement).closest("a");
    if (!link) return;
    closedByNavigation.current = link.getAttribute("href") !== currentPath;
    setOpen(false);
  };
  return (
    <div className="lg:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2"><ListTree className="h-4 w-4" />Contents</Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto"
          onCloseAutoFocus={(e) => { if (closedByNavigation.current) { e.preventDefault(); closedByNavigation.current = false; } }}>
          <SheetHeader><SheetTitle>Contents</SheetTitle></SheetHeader>
          <div className="mt-4" onClick={closeOnLink}>{children}</div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <section className="container mx-auto max-w-6xl px-4 pb-16 pt-28">{children}</section>;
}
