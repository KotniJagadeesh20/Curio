import { Link } from "react-router-dom";
import { BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { publicMediaSrc } from "@/lib/mediaUrl";
import { paths } from "@/lib/paths";
import type { PublicCollectionSummary } from "@/lib/types";

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/**
 * One published collection on Discover: cover (the thumb when there is one), title, description, category, creator and
 * counts. The whole card links to the collection. The creator is plain text until Step 15 makes `/@username` a real page.
 */
export function CollectionCard({ c }: { c: PublicCollectionSummary }) {
  const cover = publicMediaSrc(c.coverThumbUrl) ?? publicMediaSrc(c.coverUrl);
  const by = c.creator.displayName || c.creator.username;
  return (
    <Link to={paths.collection(c.creator.username, c.slug)} data-testid="collection-card"
      className="group flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card transition-colors hover:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <div className="aspect-[16/9] w-full overflow-hidden bg-muted">
        {cover ? (
          <img src={cover} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform group-hover:scale-[1.02]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground" data-testid="cover-placeholder">
            <BookOpen className="h-8 w-8" aria-hidden />
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {c.category && <Badge variant="secondary" className="w-fit">{c.category.name}</Badge>}
        <h2 className="text-lg font-semibold leading-snug break-words group-hover:underline">{c.title}</h2>
        {c.description && <p className="line-clamp-3 text-sm text-muted-foreground break-words">{c.description}</p>}
        <div className="mt-auto pt-2 text-xs text-muted-foreground">
          <p>By <span className="font-medium text-foreground">{by}</span></p>
          <p>{plural(c.moduleCount, "module")} · {plural(c.pageCount, "page")}</p>
        </div>
      </div>
    </Link>
  );
}
