import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollectionOutline } from "@/components/public/CollectionOutline";
import { NoContent, NotAvailable } from "@/components/public/NotAvailable";
import { ShareButton } from "@/components/public/ShareButton";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useConfirmedPublicData } from "@/hooks/useConfirmedPublicData";
import { useNoIndex } from "@/hooks/useNoIndex";
import { usePublicArrival, type ArrivalState } from "@/hooks/usePublicArrival";
import { usePublicCollection } from "@/hooks/useContent";
import { ApiError } from "@/lib/api";
import { publicMediaSrc } from "@/lib/mediaUrl";
import { paths } from "@/lib/paths";
import { firstPage } from "@/lib/publicNav";

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * `/@username/collection`: a published (or unlisted, by link) collection: header, published outline, "Start reading".
 * What is visible is decided by the server; every 404 (draft, hidden, deleted, suspended, mistyped) gets the same screen.
 */
export default function CollectionView({ username, slug }: { username: string; slug: string }) {
  const q = usePublicCollection(username, slug);
  const notFound = q.error instanceof ApiError && q.error.status === 404;

  // Cached data from an earlier visit is shown only once the server has confirmed it during this visit, and never after a
  // failed revalidation (see useConfirmedPublicData). The visit restarts when the URL switches to another collection.
  const detail = useConfirmedPublicData(q, `${username}/${slug}`);

  // Loading and other errors: just the site name. A 404 never shows the (possibly private) title.
  useDocumentTitle(notFound ? "Not available" : detail ? detail.collection.title : null);
  useNoIndex(detail?.unlisted === true);

  // Arrival, scroll restoration and focus (Step 14d-3); a failed request being retried counts as pending.
  const contentRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const arrivalState: ArrivalState = notFound ? "not-found" : q.isError ? (q.isFetching ? "pending" : "error") : detail ? "content" : "pending";
  const arrival = usePublicArrival({ arrivalKey: `collection:${username}/${slug}`, state: arrivalState, contentRef, headingRef, errorRef });

  if (notFound) return <Shell><NotAvailable what="collection" ref={headingRef} /></Shell>;
  if (q.isError) {
    return (
      <Shell>
        <div ref={errorRef} tabIndex={-1} role="region" aria-label="Couldn't load this collection" className="focus:outline-none">
          <ErrorState error={q.error} onRetry={() => { arrival.retry(); q.refetch(); }} />
        </div>
      </Shell>
    );
  }
  if (!detail) return <Shell><LoadingState label="Loading collection..." /></Shell>;

  const c = detail.collection;
  const cover = publicMediaSrc(c.coverUrl);
  const start = firstPage(detail.modules);
  const by = c.creator.displayName || c.creator.username;

  return (
    <Shell>
      <article ref={contentRef} className="space-y-8">
        <header className="space-y-4" data-scroll-anchor="header">
          {cover && (
            <div className="aspect-[16/9] max-h-80 w-full overflow-hidden rounded-lg bg-muted">
              <img src={cover} alt="" className="h-full w-full object-cover" data-testid="collection-cover" />
            </div>
          )}
          {c.category && (
            <Link to={`${paths.discover()}?category=${encodeURIComponent(c.category.slug)}`} className={`${badgeVariants({ variant: "secondary" })} w-fit`}>
              {c.category.name}
            </Link>
          )}
          <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold break-words focus:outline-none">{c.title}</h1>
          {c.description && <p className="text-lg text-muted-foreground whitespace-pre-line break-words">{c.description}</p>}
          <div className="text-sm text-muted-foreground">
            <p>By <Link to={paths.creatorProfile(c.creator.username)} className="font-medium text-foreground hover:underline">{by}</Link></p>
            <p>{plural(c.moduleCount, "module")} · {plural(c.pageCount, "page")}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {start && (
              <Button asChild className="gap-2">
                <Link to={paths.page(username, c.slug, start.moduleSlug, start.pageSlug)}><BookOpen className="h-4 w-4" />Start reading</Link>
              </Button>
            )}
            <ShareButton what="collection" title={c.title} path={paths.collection(username, c.slug)} />
          </div>
        </header>

        {start ? <CollectionOutline username={username} collectionSlug={c.slug} modules={detail.modules} anchors /> : <NoContent />}
      </article>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="container mx-auto max-w-3xl px-4 pb-16 pt-28">
      <Link to={paths.discover()} className="mb-6 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />Discover
      </Link>
      {children}
    </section>
  );
}
