import type { ReactNode } from "react";

/**
 * Step 7 skeleton: proves a route exists and receives its parameters. Each screen is replaced by the real UI in a
 * later step (named in `step`), so nothing here should grow logic.
 */
export function PlaceholderPage({ title, step, note, children }: { title: string; step: string; note?: string; children?: ReactNode }) {
  return (
    <section className="container mx-auto px-4 pt-32 pb-16" data-testid="placeholder">
      <h1 className="text-3xl font-bold mb-2">{title}</h1>
      <p className="text-muted-foreground mb-6">Coming in {step}.</p>
      {note && <p className="mb-6" data-testid="placeholder-note">{note}</p>}
      {children && <dl className="text-sm space-y-1">{children}</dl>}
    </section>
  );
}

export function Param({ name, value }: { name: string; value: string | number | undefined }) {
  return (
    <div className="flex gap-2">
      <dt className="font-mono text-muted-foreground">{name}</dt>
      <dd className="font-mono" data-testid={`param-${name}`}>{value}</dd>
    </div>
  );
}
