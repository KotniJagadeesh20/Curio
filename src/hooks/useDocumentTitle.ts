import { useEffect } from "react";

/** The product name in browser titles. The branding stays "AlgoQuest" until Step 16 renames it (approved Step 14 decision Q8). */
export const SITE_NAME = "AlgoQuest";

/**
 * Sets `document.title` to "`title` · SITE_NAME" while the component is mounted (or just SITE_NAME for a null title,
 * e.g. while loading) and puts the previous title back on unmount.
 */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} · ${SITE_NAME}` : SITE_NAME;
    return () => { document.title = previous; };
  }, [title]);
}
