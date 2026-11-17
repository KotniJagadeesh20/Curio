import { Fragment } from "react";
import { isSafeUrl } from "@/lib/urlRules";
import type { InlineDoc, Run } from "@/lib/richText";

/** A link stays on this site for "/path" links; other sites open in a new tab and get no referrer or ranking credit. */
function RunView({ run }: { run: Run }) {
  let node: React.ReactNode = run.text;
  if (run.italic) node = <em>{node}</em>;
  if (run.bold) node = <strong className="font-semibold text-foreground">{node}</strong>;
  if (typeof run.href === "string") {
    if (!isSafeUrl(run.href)) return <>{node}</>;            // never trust the API: an unsafe link is shown as its text
    const external = !run.href.startsWith("/");
    node = (
      <a href={run.href} className="text-primary underline underline-offset-2 hover:opacity-80"
        {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow ugc" } : {})}>{node}</a>
    );
  }
  return <>{node}</>;
}

const Runs = ({ runs }: { runs: Run[] }) => <>{runs.map((r, i) => <RunView key={i} run={r} />)}</>;

/** Renders a text block's validated `doc`. Every string is React text: nothing is ever inserted as HTML. */
export function RichText({ doc }: { doc: InlineDoc }) {
  return (
    <div className="space-y-5 text-[1.05rem] leading-8 text-foreground/80" data-testid="rich-text">
      {doc.map((n, i) => (
        <Fragment key={i}>
          {n.type === "paragraph" && <p><Runs runs={n.children} /></p>}
          {n.type === "list" && !n.ordered && (
            <ul className="space-y-2 pl-6 list-disc marker:text-primary">{n.items.map((it, j) => <li key={j}><Runs runs={it} /></li>)}</ul>
          )}
          {n.type === "list" && n.ordered && (
            <ol className="space-y-2 pl-6 list-decimal marker:text-primary marker:font-semibold">{n.items.map((it, j) => <li key={j}><Runs runs={it} /></li>)}</ol>
          )}
        </Fragment>
      ))}
    </div>
  );
}
