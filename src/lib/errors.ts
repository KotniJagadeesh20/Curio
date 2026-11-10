import { ApiError } from "@/lib/api";

export const errorMessage = (e: unknown) => (e instanceof Error && e.message ? e.message : "Something went wrong. Please try again.");

/** 403 and 404 are both "you can't have this" for the creator workspace (the server answers 404 for others' drafts). */
export const isMissingOrForbidden = (e: unknown) => e instanceof ApiError && (e.status === 404 || e.status === 403);
