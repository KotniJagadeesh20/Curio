import { Badge } from "@/components/ui/badge";
import type { CollectionStatus, PageStatus } from "@/lib/types";

const LABEL: Record<CollectionStatus, string> = { DRAFT: "Draft", PUBLISHED: "Published", UNLISTED: "Unlisted" };

/** What the creator chose. Whether readers can actually open it is a separate fact (`VisibilityNotes`). */
export function StatusBadge({ status }: { status: CollectionStatus | PageStatus }) {
  const live = status === "PUBLISHED";
  return (
    <Badge variant={live ? "default" : "secondary"} data-testid="status-badge">
      {LABEL[status as CollectionStatus]}
    </Badge>
  );
}
