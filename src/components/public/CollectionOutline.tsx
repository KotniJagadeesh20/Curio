import { Link } from "react-router-dom";
import { orderedModules } from "@/lib/publicNav";
import { paths } from "@/lib/paths";
import type { PublicModule } from "@/lib/types";

interface Props {
  username: string;
  collectionSlug: string;
  modules: readonly PublicModule[];
  /** The page being read (14c sidebar): its link gets `aria-current="page"`. */
  current?: { moduleSlug: string; pageSlug: string };
}

/**
 * A collection's published outline: each module with its pages in reading order, every page a module-qualified link.
 * Fully expanded (no collapsing). Slug-based only; no ids reach the DOM.
 */
export function CollectionOutline({ username, collectionSlug, modules, current }: Props) {
  return (
    <nav aria-label="Collection contents" className="space-y-6" data-testid="collection-outline">
      {orderedModules(modules).map((m) => (
        <section key={m.slug} aria-labelledby={`module-${m.slug}`}>
          <h2 id={`module-${m.slug}`} className="mb-2 text-lg font-semibold break-words">{m.title}</h2>
          <ol className="space-y-1 border-l border-border pl-4">
            {m.pages.map((p) => {
              const isCurrent = current?.moduleSlug === m.slug && current.pageSlug === p.slug;
              return (
                <li key={p.slug}>
                  <Link to={paths.page(username, collectionSlug, m.slug, p.slug)} aria-current={isCurrent ? "page" : undefined}
                    className={`block rounded-md px-2 py-1.5 hover:bg-muted ${isCurrent ? "bg-muted font-medium text-primary" : ""}`}>
                    <span className="block break-words">{p.title}</span>
                    {p.summary && <span className="mt-0.5 block text-sm text-muted-foreground break-words">{p.summary}</span>}
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </nav>
  );
}
