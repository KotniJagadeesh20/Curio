import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { paths } from "@/lib/paths";

/**
 * The one screen for every public 404. The API answers draft, hidden, deleted, suspended and nonexistent content with
 * the same 404, and this screen says the same thing for all of them so the UI does not reveal which case it was.
 */
export function NotAvailable({ what = "page" }: { what?: "collection" | "page" }) {
  return (
    <div className="flex flex-col items-center gap-3 py-24 text-center" role="alert" data-testid="not-available">
      <h1 className="text-2xl font-semibold">This {what} isn't available</h1>
      <p className="max-w-md text-muted-foreground">It may have been moved or unpublished, or the link may be mistyped.</p>
      <Button asChild variant="outline"><Link to={paths.discover()}>Browse Discover</Link></Button>
    </div>
  );
}

/** Shown when a published page has nothing that can be displayed (empty, or every block was unreadable). Approved wording (Q1). */
export function NoContent() {
  return <p className="py-12 text-center text-muted-foreground" data-testid="no-content">No content is available to display.</p>;
}
