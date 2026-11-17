import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CollectionOutline } from "@/components/public/CollectionOutline";
import { NoContent, NotAvailable } from "@/components/public/NotAvailable";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useNoIndex } from "@/hooks/useNoIndex";
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

  // Cached data from an earlier visit may be out of date (the collection may since have been unpublished or deleted), and
  // React Query hands it over at once while it revalidates in the background. It is shown only once the server has
  // confirmed it during this visit: data fetched since this collection was opened here, or cached data that is not being
  // revalidated. The reference time restarts when the URL switches to another collection (the component is reused).
  const visit = `${username}/${slug}`;
  const openedAt = useRef({ visit, at: Date.now() });
  if (openedAt.current.visit !== visit) openedAt.current = { visit, at: Date.now() };
  const confirmed = q.dataUpdatedAt > openedAt.current.at || !q.isFetching;
  // A failed revalidation (404 or another error) also keeps React Query's old data around: never show it then either.
  const detail = q.data && confirmed && !q.isError ? q.data : undefined;

  // Loading and other errors: just the site name. A 404 never shows the (possibly private) title.
  useDocumentTitle(notFound ? "Not available" : detail ? detail.collection.title : null);
  useNoIndex(detail?.unlisted === true);

  if (notFound) return <Shell><NotAvailable what="collection" /></Shell>;
  if (q.isError) return <Shell><ErrorState error={q.error} onRetry={() => q.refetch()} /></Shell>;
  if (!detail) return <Shell><LoadingState label="Loading collection..." /></Shell>;

  const c = detail.collection;
  const cover = publicMediaSrc(c.coverUrl);
  const start = firstPage(detail.modules);
  const by = c.creator.displayName || c.creator.username;

  return (
    <Shell>
      <article className="space-y-8">
        <header className="space-y-4">
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
          <h1 className="text-3xl font-bold break-words">{c.title}</h1>
          {c.description && <p className="text-lg text-muted-foreground whitespace-pre-line break-words">{c.description}</p>}
          <div className="text-sm text-muted-foreground">
            <p>By <span className="font-medium text-foreground">{by}</span></p>
            <p>{plural(c.moduleCount, "module")} · {plural(c.pageCount, "page")}</p>
          </div>
          {start && (
            <Button asChild className="gap-2">
              <Link to={paths.page(username, c.slug, start.moduleSlug, start.pageSlug)}><BookOpen className="h-4 w-4" />Start reading</Link>
            </Button>
          )}
        </header>

        {start ? <CollectionOutline username={username} collectionSlug={c.slug} modules={detail.modules} /> : <NoContent />}
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
