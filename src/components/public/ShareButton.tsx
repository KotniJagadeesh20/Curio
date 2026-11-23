import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { Copy, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { canonicalUrl, copyToClipboard, sharePublicLink } from "@/lib/share";

interface Props {
  /** The share-sheet title ("<page> · <collection>" for pages, the collection title for collections, the display name for profiles). */
  title: string;
  /** A canonical public path from `paths.*`. */
  path: string;
  what: "page" | "collection" | "profile";
}

const FIRST_HINT = "Your browser didn't allow copying automatically. The link is selected: press Ctrl+C (⌘C on Mac) to copy it.";
const RETRY_HINT = "Copy wasn't allowed. Press Ctrl+C (⌘C on Mac) now.";

/**
 * "Share" for a public collection or page (Step 14d-2): the native share sheet where available, otherwise the clipboard
 * ("Link copied"), otherwise a small popover with the link selected and manual-copy instructions, whose Copy button
 * retries the clipboard. Only rendered by the viewers for confirmed, available content.
 */
export function ShareButton({ title, path, what }: Props) {
  const url = canonicalUrl(path);
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const busyRef = useRef(false);                          // synchronous guard: a double click starts one share only
  const inputRef = useRef<HTMLInputElement>(null);
  const hintId = useId();

  const selectUrl = () => { const i = inputRef.current; if (i) { i.focus(); i.select(); } };

  const share = async (e: MouseEvent) => {
    e.preventDefault();                                   // we open the popover ourselves, only when it is needed
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const outcome = await sharePublicLink({ title, url });
      if (outcome === "copied") toast.success("Link copied");
      else if (outcome === "unavailable") { setRetryFailed(false); setManual(true); }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const retryCopy = async () => {
    if (await copyToClipboard(url)) {
      toast.success("Link copied");
      setManual(false);
    } else {
      setRetryFailed(true);
      selectUrl();
    }
  };

  useEffect(() => { if (!manual) setRetryFailed(false); }, [manual]);

  return (
    <Popover open={manual} onOpenChange={setManual}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="gap-2" onClick={share} aria-busy={busy || undefined}
          aria-label={`Share this ${what}`}>
          <Share2 className="h-4 w-4" />Share
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 space-y-3" align="start"
        onOpenAutoFocus={(e) => { e.preventDefault(); selectUrl(); }}>
        <label className="block text-sm font-medium" htmlFor={`${hintId}-url`}>Link to this {what}</label>
        <input id={`${hintId}-url`} ref={inputRef} readOnly value={url} aria-describedby={hintId} onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm" data-testid="share-url" />
        <p id={hintId} className={retryFailed ? "text-sm font-medium text-amber-600 dark:text-amber-400" : "text-sm text-muted-foreground"} aria-live="polite">
          {retryFailed ? RETRY_HINT : FIRST_HINT}
        </p>
        <Button type="button" size="sm" variant="secondary" className="gap-2" onClick={retryCopy}><Copy className="h-4 w-4" />Copy</Button>
      </PopoverContent>
    </Popover>
  );
}
