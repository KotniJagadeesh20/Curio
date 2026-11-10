import { useEffect, useState } from "react";
import { fetchOwnerMedia } from "@/lib/media";

export type OwnerMediaState = { status: "idle" | "loading" | "error"; url: null } | { status: "ready"; url: string };

/**
 * Object URL for the signed-in owner's asset (fetched with the Authorization header). Exactly one object URL is alive at a time:
 * it is revoked when the asset or variant changes, and when the component unmounts. A response that arrives after either is
 * discarded before any URL is created for it.
 */
export function useOwnerMediaUrl(assetId: string | null | undefined, variant: "original" | "thumb" = "original"): OwnerMediaState {
  const [state, setState] = useState<OwnerMediaState>({ status: "idle", url: null });
  useEffect(() => {
    if (!assetId) { setState({ status: "idle", url: null }); return; }
    const ctrl = new AbortController();
    let created: string | null = null;
    setState({ status: "loading", url: null });
    fetchOwnerMedia(assetId, variant, ctrl.signal).then(
      (blob) => {
        if (ctrl.signal.aborted) return;
        created = URL.createObjectURL(blob);
        setState({ status: "ready", url: created });
      },
      () => { if (!ctrl.signal.aborted) setState({ status: "error", url: null }); },
    );
    return () => {
      ctrl.abort();
      if (created) URL.revokeObjectURL(created);
    };
  }, [assetId, variant]);
  return state;
}
