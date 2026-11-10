import { useCallback, useEffect, useRef, useState } from "react";
import { useBlocker } from "react-router-dom";

interface Options {
  /** There is something to lose: unsaved edits, a running save, or a failed one. */
  active: boolean;
  /** true = leaving first saves automatically (drafts). false = the person must choose (a published page is never saved implicitly). */
  canAutoFlush: boolean;
  /** Saves now; resolves true when nothing unsaved is left. `explicit` = the person chose it ("Save and leave"), not an automatic save on the way out. */
  flush: (explicit: boolean) => Promise<boolean>;
}

/**
 * Unsaved-changes protection: `beforeunload` for closing/reloading the tab, and React Router's `useBlocker` for every
 * in-app navigation (links, back/forward, programmatic). Needs a data router (see router.tsx).
 *
 * A blocked navigation first tries to save (drafts). If that fails, or the page can't be saved implicitly, `open` is true and
 * the caller shows the choice: stay, (save and) leave, or leave without saving.
 */
export function useUnsavedGuard({ active, canAutoFlush, flush }: Options) {
  const activeRef = useRef(active);
  activeRef.current = active;
  const live = useRef({ canAutoFlush, flush });
  live.current = { canAutoFlush, flush };

  const blocker = useBlocker(
    useCallback(({ currentLocation, nextLocation }) =>
      activeRef.current && (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search), []),
  );

  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);          // "Save and leave" was tried and failed

  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  const blocked = blocker.state === "blocked";
  useEffect(() => {
    if (!blocked) { setOpen(false); setWorking(false); setFailed(false); return; }
    if (!activeRef.current) { blocker.proceed?.(); return; }
    if (!live.current.canAutoFlush) { setOpen(true); return; }
    let cancelled = false;
    setWorking(true);
    void live.current.flush(false).then((ok) => {
      if (cancelled) return;
      setWorking(false);
      if (ok) blocker.proceed?.(); else { setFailed(true); setOpen(true); }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts to the blocked/unblocked transition only
  }, [blocked]);

  const stay = () => blocker.reset?.();
  const leave = () => blocker.proceed?.();
  const saveAndLeave = async () => {
    setWorking(true);
    const ok = await live.current.flush(true);
    setWorking(false);
    if (ok) blocker.proceed?.(); else setFailed(true);
  };

  return { open: blocked && open, working: blocked && working, failed, stay, leave, saveAndLeave };
}
