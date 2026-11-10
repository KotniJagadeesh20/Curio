import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, RefreshCw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { OwnerImage } from "@/components/media/OwnerImage";
import { MEDIA_ACCEPT, UploadAborted, checkMediaFile, isRetryableUpload, mediaErrorMessage, uploadMedia, type MediaAsset, type UploadHandle } from "@/lib/media";

interface Props {
  /** The asset currently in use, if any: shown through the authenticated owner route. */
  assetId?: string | null;
  /** Which stored size to preview. */
  variant?: "original" | "thumb";
  /** "Image" / "Cover image": used in button and field names. */
  label: string;
  /** Called once, after the server created the asset. Never called for a cancelled, failed or abandoned upload. */
  onUploaded: (asset: MediaAsset) => void;
  /** When given, a Remove button is offered while an asset is in use. */
  onRemove?: () => void;
  disabled?: boolean;
  /**
   * Tells the owner whether an upload is running. While it is, the owner must not let the person edit the link for the same image:
   * the upload's completion would otherwise overwrite that newer choice. (Image blocks and covers disable their link field.)
   */
  onBusyChange?: (busy: boolean) => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "failed"; message: string; file: File | null; retryable: boolean };

/**
 * Upload one image: local preview and progress while it goes, Cancel, and a plain message when it fails.
 *
 * It keeps ALL upload state to itself and reports exactly one event upward, `onUploaded`, after success. Until then the caller's data
 * is unchanged: a block or form never carries a pending, cancelled or failed upload, so nothing half-done can reach autosave, and
 * a failed replacement leaves the existing image in place. Every object URL it creates (the local preview) is revoked when the preview
 * is replaced, finished, cancelled or unmounted; the owner preview of the stored asset is `OwnerImage`'s, with the same rule.
 */
export function MediaUploader({ assetId, variant = "original", label, onUploaded, onRemove, disabled, onBusyChange }: Props) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const handle = useRef<UploadHandle | null>(null);
  const previewRef = useRef<string | null>(null);
  const onUploadedRef = useRef(onUploaded);
  onUploadedRef.current = onUploaded;   // the caller's latest callback, never one captured when the upload began
  const onBusyRef = useRef(onBusyChange);
  onBusyRef.current = onBusyChange;
  const busy = phase.kind === "uploading";
  useEffect(() => { onBusyRef.current?.(busy); }, [busy]);

  const releasePreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
    setLocalPreview(null);
  };

  // leaving (unmount) cancels the request and frees the preview; the server-side asset, if it was created, is an orphan the sweeper removes
  useEffect(() => () => {
    handle.current?.abort();
    handle.current = null;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  }, []);

  const start = (file: File) => {
    const problem = checkMediaFile(file);
    if (problem) { releasePreview(); setPhase({ kind: "failed", message: problem, file: null, retryable: false }); return; }
    releasePreview();
    previewRef.current = URL.createObjectURL(file);
    setLocalPreview(previewRef.current);
    setPhase({ kind: "uploading", percent: 0 });
    const h = uploadMedia(file, (percent) => { if (handle.current === h) setPhase({ kind: "uploading", percent }); });
    handle.current = h;
    h.promise.then(
      (asset) => {
        if (handle.current !== h) return;
        handle.current = null;
        releasePreview();
        setPhase({ kind: "idle" });
        onUploadedRef.current(asset);
      },
      (e) => {
        if (handle.current !== h) return;           // cancelled or superseded
        handle.current = null;
        releasePreview();
        if (e instanceof UploadAborted) { setPhase({ kind: "idle" }); return; }
        setPhase({ kind: "failed", message: mediaErrorMessage(e), file, retryable: isRetryableUpload(e) });
      },
    );
  };

  const cancel = () => {
    const h = handle.current;
    handle.current = null;                           // detach first: the abort rejection is then ignored
    h?.abort();
    releasePreview();
    setPhase({ kind: "idle" });
  };

  const uploading = phase.kind === "uploading";
  const pick = () => input.current?.click();

  return (
    <div className="space-y-2" data-testid="media-uploader">
      {uploading && localPreview ? (
        <img src={localPreview} alt={`${label} being uploaded`} className="max-h-48 rounded-lg border border-border" />
      ) : assetId ? (
        <OwnerImage assetId={assetId} variant={variant} alt={`${label} preview`} className="max-h-48 rounded-lg border border-border" />
      ) : null}

      <input ref={input} type="file" hidden accept={MEDIA_ACCEPT} aria-label={`${label} file`} disabled={disabled}
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";                       // choosing the same file again must fire a change
          if (file) start(file);
        }} />

      {uploading ? (
        <div className="space-y-1">
          <Progress value={phase.percent} aria-label={`${label} upload progress`} className="h-2" />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1" role="status">
              <Loader2 className="h-3 w-3 animate-spin" />Uploading... {phase.percent}%
            </span>
            <Button type="button" size="sm" variant="ghost" onClick={cancel}><X className="mr-1 h-3.5 w-3.5" />Cancel upload</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={pick}>
            <ImagePlus className="mr-1 h-3.5 w-3.5" />{assetId ? `Replace ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
          </Button>
          {assetId && onRemove && (
            <Button type="button" size="sm" variant="ghost" className="text-destructive" disabled={disabled} onClick={onRemove}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />Remove {label.toLowerCase()}
            </Button>
          )}
        </div>
      )}

      {phase.kind === "failed" && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-xs text-destructive">{phase.message}</p>
          {phase.file && phase.retryable && (
            <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={() => start(phase.file!)}>
              <RefreshCw className="mr-1 h-3.5 w-3.5" />Try again
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
