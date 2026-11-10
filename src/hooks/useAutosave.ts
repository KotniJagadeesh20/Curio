import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api";

export const AUTOSAVE_DEBOUNCE_MS = 1500;
export const AUTOSAVE_MAX_WAIT_MS = 15000;
/** Waits before the 1st, 2nd and 3rd automatic retry of a network/5xx failure; after that only a manual action retries. */
export const RETRY_BACKOFF_MS = [2000, 5000, 15000];

/** Thrown by `save` when there is nothing valid to send yet (e.g. a blank title). Autosave pauses until the next edit. */
export class SaveBlocked extends Error {}

export type SaveMode = "auto" | "manual";
/** idle = nothing running; saving = a request is in flight; retrying = failed, a retry is scheduled; failed = stopped, needs the user; paused = invalid input, resumes on the next edit. */
export type AutosaveStatus = "idle" | "saving" | "retrying" | "failed" | "paused";

/** Only a network failure (no response at all) or a 5xx is retried by itself: the request is a full-state PUT, so repeating it is safe. */
export const isRetryable = (e: unknown) => !(e instanceof ApiError) || e.status >= 500;

interface Options {
  /** Changes whenever the editable content changes (the snapshot); every change restarts the debounce. */
  revision: string;
  /** Render-time "has unsaved changes" (drives scheduling). */
  dirty: boolean;
  /** Autosave allowed right now (drafts only, ...). Manual `flush` works either way. */
  enabled: boolean;
  /** Reads live state (refs), not render state: used right after a save to see whether more edits arrived meanwhile. */
  isDirty: () => boolean;
  /** Saves the LATEST state (reads it when called, never a captured copy). Resolves when the server accepted it. */
  save: (mode: SaveMode) => Promise<void>;
}

/**
 * Debounced, single-flight autosave.
 *  - 1.5 s after the last edit, but never later than 15 s after the first unsaved edit (so continuous typing still saves).
 *  - One request at a time. Edits made while it runs are not queued as snapshots: when it ends, the next save reads the
 *    latest state, so exactly one follow-up request carries everything.
 *  - network/5xx: retried after 2 s, 5 s, 15 s; 400/401/403/404/409 are never retried by themselves.
 *  - `flush` = save now (manual Save, navigation): joins a running request, then saves whatever is still unsaved.
 */
export function useAutosave({ revision, dirty, enabled, isDirty, save }: Options) {
  const live = useRef({ revision, isDirty, save });
  live.current = { revision, isDirty, save };

  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const [tick, setTick] = useState(0);                 // re-evaluates the schedule when a request ends

  const inflight = useRef<Promise<boolean> | null>(null);
  const failures = useRef(0);
  const stopped = useRef(false);                       // failed for a reason retrying won't fix: wait for the user
  const pausedAt = useRef<string | null>(null);        // revision at which input was invalid: wait for another edit
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstDirtyAt = useRef<number | null>(null);
  const lastEditAt = useRef(0);
  const seenRevision = useRef(revision);

  const clearSave = () => { if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null; } };
  const clearRetry = () => { if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; } };

  const run = useCallback((mode: SaveMode): Promise<boolean> => {
    if (inflight.current) return inflight.current;     // never two requests at once
    clearSave();
    clearRetry();
    setStatus("saving");
    setError(null);
    const p = (async () => {
      try {
        await live.current.save(mode);
        failures.current = 0;
        stopped.current = false;
        pausedAt.current = null;
        firstDirtyAt.current = null;
        setStatus("idle");
        return true;
      } catch (e) {
        setError(e);
        if (e instanceof SaveBlocked || (e instanceof ApiError && e.status === 400)) {
          pausedAt.current = live.current.revision;    // resumes when the content changes again
          setStatus("paused");
        } else if (isRetryable(e) && failures.current < RETRY_BACKOFF_MS.length) {
          const wait = RETRY_BACKOFF_MS[failures.current++];
          setStatus("retrying");
          retryTimer.current = setTimeout(() => { retryTimer.current = null; void run("auto"); }, wait);
        } else {
          stopped.current = true;                      // 401/403/404/409, or the retries ran out
          setStatus("failed");
        }
        return false;
      } finally {
        inflight.current = null;
        setTick((t) => t + 1);
      }
    })();
    inflight.current = p;
    return p;
  }, []);

  // Scheduling: runs on every edit and whenever a request ends.
  useEffect(() => {
    const now = Date.now();
    if (revision !== seenRevision.current) { seenRevision.current = revision; lastEditAt.current = now; }
    if (!enabled || !dirty) { firstDirtyAt.current = null; return; }
    if (inflight.current || retryTimer.current || stopped.current) return;   // the running/retrying request will carry the latest state
    if (pausedAt.current !== null && pausedAt.current === revision) return;  // still the content that was invalid
    pausedAt.current = null;
    firstDirtyAt.current ??= now;
    if (!lastEditAt.current) lastEditAt.current = now;
    const due = Math.min(lastEditAt.current + AUTOSAVE_DEBOUNCE_MS, firstDirtyAt.current + AUTOSAVE_MAX_WAIT_MS);
    clearSave();
    saveTimer.current = setTimeout(() => { saveTimer.current = null; void run("auto"); }, Math.max(0, due - now));
    return clearSave;
  }, [revision, dirty, enabled, tick, run]);

  useEffect(() => () => { clearSave(); clearRetry(); }, []);

  /** Saves now. Resolves true when nothing unsaved is left, false when a save failed (the edits stay in memory). */
  const flush = useCallback(async (mode: SaveMode = "manual"): Promise<boolean> => {
    clearSave();
    clearRetry();
    stopped.current = false;
    pausedAt.current = null;
    failures.current = 0;
    for (let pass = 0; pass < 4; pass++) {
      if (inflight.current) await inflight.current;    // join the running request, then see whether anything is left
      if (!live.current.isDirty()) return true;
      if (!(await run(mode))) return false;
    }
    return !live.current.isDirty();
  }, [run]);

  return { status, error, flush, saving: status === "saving" };
}
