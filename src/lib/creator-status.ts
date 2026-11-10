import type { CollectionSummary } from "@/lib/types";

/** Plain-language reasons a collection can't be opened by readers right now (all derived from server-provided facts). */
export function visibilityNotes(c: CollectionSummary): string[] {
  const notes: string[] = [];
  if (c.deletedAt) return notes;
  if (c.hiddenByModeration) notes.push("Hidden by moderation: readers can't open it.");
  if (c.status !== "DRAFT" && !c.hiddenByModeration && !c.publiclyVisible) {
    notes.push("Not visible to readers yet: it has no published page.");
  }
  if (c.draftPageCount > 0) {
    notes.push(`${c.draftPageCount} draft ${c.draftPageCount === 1 ? "page is" : "pages are"} not visible to readers.`);
  }
  return notes;
}
