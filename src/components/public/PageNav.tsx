import { Link } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { paths } from "@/lib/paths";
import { prevNext } from "@/lib/publicNav";
import type { PublicModule } from "@/lib/types";

interface Props {
  username: string;
  collectionSlug: string;
  modules: readonly PublicModule[];
  moduleSlug: string;
  pageSlug: string;
}

/**
 * Previous / Next in the published reading order, crossing module boundaries. Each is missing at its end, and both are
 * missing for a page that isn't in the published outline, so navigation never points at a draft.
 */
export function PageNav({ username, collectionSlug, modules, moduleSlug, pageSlug }: Props) {
  const { prev, next } = prevNext(modules, moduleSlug, pageSlug);
  if (!prev && !next) return null;
  const href = (p: { moduleSlug: string; pageSlug: string }) => paths.page(username, collectionSlug, p.moduleSlug, p.pageSlug);
  const box = "flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border p-4 hover:bg-muted";
  return (
    <nav aria-label="Page navigation" className="flex flex-col gap-3 border-t border-border pt-8 sm:flex-row">
      {prev ? (
        <Link to={href(prev)} className={box} aria-label={`Previous: ${prev.title}`}>
          <ChevronLeft className="h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0"><span className="block text-xs text-muted-foreground">Previous</span><span className="block break-words font-medium">{prev.title}</span></span>
        </Link>
      ) : <span className="hidden flex-1 sm:block" />}
      {next ? (
        <Link to={href(next)} className={`${box} justify-end text-right`} aria-label={`Next: ${next.title}`}>
          <span className="min-w-0"><span className="block text-xs text-muted-foreground">Next</span><span className="block break-words font-medium">{next.title}</span></span>
          <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
        </Link>
      ) : <span className="hidden flex-1 sm:block" />}
    </nav>
  );
}
