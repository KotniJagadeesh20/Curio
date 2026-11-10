import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Eye, Loader2, Pencil, Save } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BlockEditor } from "@/components/editor/BlockEditor";
import { BlockRenderer } from "@/components/editor/BlockRenderer";
import { StatusBadge } from "@/components/creator/StatusBadge";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useQueryClient } from "@tanstack/react-query";
import { SaveBlocked, useAutosave } from "@/hooks/useAutosave";
import { useUnsavedGuard } from "@/hooks/useUnsavedGuard";
import { useMyPage } from "@/hooks/useContent";
import { usePublishPage, useUpdatePage } from "@/hooks/useCreatorMutations";
import {
  activeServerProblems, bodyProblems, hasMeaningfulContent, isUnsupported, legacyContentToBlocks, legacyHasContent, readBlocksForEditing, recordServerProblems, serializeBlocks, type RecordedProblem,
  type Block, type EditorBlock,
} from "@/lib/blocks";
import { hasErrors, LIMITS, validatePage } from "@/lib/creator-validation";
import { ApiError, api } from "@/lib/api";
import { errorMessage, isMissingOrForbidden } from "@/lib/errors";
import { apiPaths, paths } from "@/lib/paths";
import type { CreatorPage, PageInput, PageStatus } from "@/lib/types";
import NotFound from "@/pages/NotFound";

/** `/create/pages/:id` (the id is validated by the route adapter). The server enforces ownership on every call. */
export default function PageEditor({ id }: { id: number }) {
  const query = useMyPage(id);
  const [generation, setGeneration] = useState(0);   // bumped to start over from the server's copy (after a version conflict)
  if (query.isLoading) return <div className="pt-28"><LoadingState label="Loading page..." /></div>;
  if (query.isError) {
    if (isMissingOrForbidden(query.error)) return <NotFound />;
    return <div className="pt-28"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>;
  }
  // keyed by page: switching pages starts from that page's data; a background refetch never resets what is being typed
  return <Body key={`${query.data!.id}-${generation}`} page={query.data!} reload={async () => { await query.refetch(); setGeneration((g) => g + 1); }} />;
}

function Body({ page, reload }: { page: CreatorPage; reload: () => Promise<void> }) {
  const initial = useState(() => readBlocksForEditing(page.blocks))[0];
  const [title, setTitle] = useState(page.title);
  const [summary, setSummary] = useState(page.summary);
  const [blocks, setBlocks] = useState<EditorBlock[]>(initial.blocks);
  const [preview, setPreview] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // A legacy page keeps its old content until the creator converts it: until then `blocks` is never sent.
  const [stillLegacy, setStillLegacy] = useState(page.legacy);
  const [converted, setConverted] = useState(false);
  const legacyUnconverted = stillLegacy && !converted;
  // Stored content we can't interpret is never replaced implicitly. `serverUnreadable` is the server's verdict (a body that
  // isn't valid blocks JSON); `unreadable` counts items this editor itself could not read. Either one locks the body
  // until the creator explicitly discards the content (`recovering`), which the server also demands.
  const [serverUnreadable, setServerUnreadable] = useState(page.blocksUnreadable);
  const [recovering, setRecovering] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const unreadable = initial.unreadable;
  const lockedUnreadable = (serverUnreadable && !recovering) || unreadable > 0;
  // Saving the body is only safe when every stored item was understood (and the page isn't an unconverted legacy page).
  const bodyEditable = !legacyUnconverted && !lockedUnreadable;

  // The page's status as this editor knows it. It follows save and publish responses (never a late refetch), because autosave
  // must stop the moment a page is live.
  const [status, setStatus] = useState<PageStatus>(page.status);
  const published = status === "PUBLISHED";

  const snapshotOf = (t: string, s: string, b: EditorBlock[], editable = bodyEditable) =>
    JSON.stringify({ t: t.trim(), s, b: editable ? serializeBlocks(b) : null });
  const [baseline, setBaseline] = useState(() => snapshotOf(page.title, page.summary, initial.blocks));
  const current = snapshotOf(title, summary, blocks);
  const dirty = current !== baseline;

  const update = useUpdatePage(page.collectionId);
  const publish = usePublishPage(page.collectionId);
  const qc = useQueryClient();
  // What the SERVER refused (400 INVALID_BLOCKS), kept per block: each message shows on its block until that block is edited.
  const [serverProblems, setServerProblems] = useState<RecordedProblem[]>([]);
  const problems = bodyProblems(blocks);
  const fieldProblems = (() => {
    const out: Record<string, string> = { ...problems.fields };
    for (const [id, msg] of Object.entries(activeServerProblems(blocks, serverProblems))) out[id] = out[id] ? `${out[id]} ${msg}` : msg;
    return out;
  })();
  const busy = update.isPending || publish.isPending;

  // Live copies for code that runs later (timers, navigation): a save always sends the latest state, never a captured one.
  const live = useRef({ title, summary, blocks, bodyEditable, recovering, converted, snapshotOf, serverProblems });
  live.current = { title, summary, blocks, bodyEditable, recovering, converted, snapshotOf, serverProblems };
  const baselineRef = useRef(baseline);
  const versionRef = useRef<number | undefined>(page.version);   // only ever raised by save/publish responses
  const seqRef = useRef(0);
  const nowSnapshot = () => { const l = live.current; return l.snapshotOf(l.title, l.summary, l.blocks, l.bodyEditable); };

  // Autosave is for drafts only, and never while an explicit step is pending (conversion, recovery) or a publish is running.
  const autosaveAllowed = !published && !recovering && !converted && !publish.isPending;

  const performSave = async (mode: "auto" | "manual") => {
    const l = live.current;
    const input: PageInput = { title: l.title.trim(), summary: l.summary };
    const found: Record<string, string> = {};
    const v = validatePage(input);
    if (v.title) found.title = v.title;
    if (v.summary) found.summary = v.summary;
    const lp = bodyProblems(l.blocks);
    if (l.bodyEditable) {
      if (lp.body) found.body = lp.body;
      if (hasErrors(lp.fields)) found.body = "Fix the highlighted links before saving.";
    }
    if (mode === "manual") setFormErrors(found);
    if (hasErrors(found)) throw new SaveBlocked(Object.values(found)[0]);
    // Autosave never carries an explicit step: a conversion or a recovery (discarding unreadable content) is saved only by Save.
    if (mode === "auto" && (l.recovering || l.converted)) throw new SaveBlocked("Press Save to keep this change.");
    // The server already refused these blocks and they have not been touched since: don't ask again until they change (Save always asks).
    if (mode === "auto" && l.bodyEditable && hasErrors(activeServerProblems(l.blocks, l.serverProblems))) throw new SaveBlocked("Fix the highlighted blocks before saving.");
    if (l.bodyEditable) {
      input.blocks = serializeBlocks(l.blocks);         // never a slug or a status: those belong to the collection editor
      if (l.recovering) input.discardUnreadableContent = true;
    }
    if (versionRef.current !== undefined) input.expectedVersion = versionRef.current;
    if (mode === "auto") input.autosave = true;
    const submitted = l.snapshotOf(l.title, l.summary, l.blocks, l.bodyEditable);
    const seq = ++seqRef.current;
    let data: CreatorPage;
    try {
      data = await update.mutateAsync({ id: page.id, input, auto: mode === "auto" });
    } catch (e) {
      if (e instanceof ApiError && e.code === "INVALID_BLOCKS" && e.problems) setServerProblems(recordServerProblems(l.blocks, e.problems));
      if (e instanceof ApiError && e.code === "PAGE_PUBLISHED") {
        setStatus("PUBLISHED");                          // published elsewhere: stop autosaving this page
        throw new SaveBlocked("This page has been published, so changes are now saved only when you press Save.");
      }
      throw e;
    }
    if (seq === seqRef.current) { baselineRef.current = submitted; setBaseline(submitted); }
    if (typeof data.version === "number" && data.version > (versionRef.current ?? -1)) versionRef.current = data.version;
    setStatus(data.status);
    if (input.blocks) { setServerProblems([]); setStillLegacy(false); setConverted(false); setServerUnreadable(false); setRecovering(false); }
    if (mode === "manual") toast.success("Page saved");
  };

  const autosave = useAutosave({
    revision: current, dirty, enabled: autosaveAllowed,
    isDirty: () => nowSnapshot() !== baselineRef.current,
    save: performSave,
  });
  const saveError = autosave.error;
  const conflict = autosave.status === "failed" && saveError instanceof ApiError && saveError.code === "VERSION_CONFLICT";
  const saveNow = () => { void autosave.flush("manual"); };

  // "Keep my version": learn the server's current version, then save explicitly (the person chose to overwrite).
  const overwrite = async () => {
    try {
      const latest = await api.get<CreatorPage>(apiPaths.page(page.id));
      versionRef.current = latest.version;
      if (latest.blocksUnreadable && !recovering) { toast.error("The saved content can no longer be read, so it can't be overwritten here."); return; }
      void autosave.flush("manual");
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const guard = useUnsavedGuard({
    active: dirty || autosave.saving || autosave.status === "retrying" || autosave.status === "failed",
    canAutoFlush: autosaveAllowed && !conflict,
    flush: (explicit) => autosave.flush(explicit ? "manual" : "auto"),
  });

  // content we could not read is never called empty
  const meaningful = lockedUnreadable || (legacyUnconverted ? legacyHasContent(page.legacyContent!) : hasMeaningfulContent(blocks));
  const runPublish = (publishIt: boolean) =>
    publish.mutate({ id: page.id, publish: publishIt }, {
      onSuccess: (data) => { setStatus(data.status); toast.success(publishIt ? "Page published" : "Page unpublished"); },
      onError: (e) => toast.error(errorMessage(e)),
    });

  const stateText =
    autosave.status === "saving" ? "Saving..."
    : autosave.status === "retrying" ? "Couldn't save. Retrying..."
    : autosave.status === "failed" ? "Couldn't save your changes"
    : dirty ? (autosave.status === "paused" ? "Unsaved changes (autosave paused)" : "Unsaved changes")
    : "Saved";

  const legacyBlocks: Block[] = legacyUnconverted && page.legacyContent ? legacyContentToBlocks(page.legacyContent) : [];
  const convert = () => { setBlocks(legacyBlocks); setConverted(true); };
  const startRecovery = () => { setBlocks([]); setRecovering(true); setConfirmDiscard(false); };
  const cancelRecovery = () => { setBlocks(initial.blocks); setRecovering(false); };
  const previewable = blocks.filter((b): b is Block => !isUnsupported(b));
  const skipped = blocks.length - previewable.length;

  return (
    <section className="container mx-auto px-4 pt-28 pb-16 max-w-4xl space-y-6">
      <div>
        <Link to={paths.editCollection(page.collectionId)} className="text-sm text-muted-foreground hover:underline">← Back to collection</Link>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-3xl font-bold">{page.title}</h1>
          <StatusBadge status={status} />
          <span role="status" aria-live="polite" data-testid="save-state"
            className={dirty || autosave.status !== "idle" ? "text-sm font-medium text-amber-600 dark:text-amber-400" : "text-sm text-muted-foreground"}>
            {stateText}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1" data-testid="unsaved-warning">
          {published
            ? "This page is published. Changes are saved only when you press Save, so readers never see half-finished edits."
            : "Changes to a draft are saved automatically. Leaving with unsaved changes asks you first."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={saveNow} disabled={!dirty || busy || conflict} className="gap-2">
          {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}Save
        </Button>
        {published ? (
          <Button variant="outline" disabled={dirty || busy} onClick={() => runPublish(false)}>Unpublish</Button>
        ) : (
          <Button variant="outline" disabled={dirty || busy} onClick={() => (meaningful ? runPublish(true) : setConfirmPublish(true))}>Publish</Button>
        )}
        {bodyEditable && (
          <Button variant="ghost" className="gap-1" onClick={() => setPreview((p) => !p)}>
            {preview ? <><Pencil className="h-4 w-4" />Edit</> : <><Eye className="h-4 w-4" />Preview</>}
          </Button>
        )}
        {dirty && <p className="self-center text-sm text-muted-foreground" data-testid="publish-hint">Save your changes to publish.</p>}
      </div>

      {saveError != null && (autosave.status === "failed" || autosave.status === "retrying" || autosave.status === "paused") && !conflict && (
        <p role="alert" data-testid="save-error" className="text-sm text-destructive">
          {autosave.status === "retrying" ? `Couldn't save (${errorMessage(saveError)}). Trying again shortly; your changes are kept here.`
            : autosave.status === "paused" && saveError instanceof SaveBlocked ? `Autosave paused: ${saveError.message}`
            : errorMessage(saveError)}
        </p>
      )}
      {conflict && (
        <Alert variant="destructive" data-testid="conflict-panel">
          <AlertDescription className="space-y-3">
            <p>This page was changed somewhere else (another tab or device) since you opened it, so your latest edits were not saved. Your edits are still here.</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void reload()}>Reload the latest version (discard my edits)</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => void overwrite()}>Keep my version (overwrite)</Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="p-title">Title</Label>
          <Input id="p-title" value={title} aria-invalid={!!formErrors.title} maxLength={LIMITS.pageTitle + 50}
            onChange={(e) => setTitle(e.target.value)} />
          {formErrors.title && <p role="alert" className="text-sm text-destructive">{formErrors.title}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="p-summary">Summary</Label>
          <Textarea id="p-summary" rows={2} value={summary} aria-invalid={!!formErrors.summary}
            onChange={(e) => setSummary(e.target.value)} />
          {formErrors.summary && <p role="alert" className="text-sm text-destructive">{formErrors.summary}</p>}
        </div>
      </div>

      {legacyUnconverted && (
        <div className="space-y-3" data-testid="legacy-panel">
          <Alert>
            <AlertDescription>
              This is an older page. Readers currently see its original content, shown below as it would look converted to blocks.
              Nothing about the page body changes until you convert it <em>and</em> press Save. You can edit the title and summary
              without converting.
            </AlertDescription>
          </Alert>
          {legacyBlocks.length > 0 && (
            <div className="rounded-lg border border-border p-4 max-h-[50vh] overflow-y-auto" data-testid="legacy-preview"><BlockRenderer blocks={legacyBlocks} /></div>
          )}
          <Button variant="outline" onClick={convert}>{legacyBlocks.length > 0 ? "Convert to blocks" : "Start writing with blocks"}</Button>
        </div>
      )}

      {lockedUnreadable && (
        <Alert variant="destructive" data-testid="unreadable-alert">
          <AlertDescription className="space-y-3">
            <p>
              {serverUnreadable
                ? "The saved content of this page couldn't be read, so it is being kept exactly as it is and can't be edited here."
                : `${unreadable} saved ${unreadable === 1 ? "item" : "items"} on this page couldn't be read as content blocks. To protect your content, the page body can't be saved from this editor.`}
              {" "}You can still edit the title and summary.
            </p>
            {serverUnreadable && (
              <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDiscard(true)}>Discard it and start over</Button>
            )}
          </AlertDescription>
        </Alert>
      )}
      {recovering && (
        <Alert data-testid="recovery-note">
          <AlertDescription className="space-y-3">
            <p>The unreadable content will be permanently discarded when you press Save. Until then nothing has changed.</p>
            <Button type="button" variant="outline" size="sm" onClick={cancelRecovery}>Keep the unreadable content</Button>
          </AlertDescription>
        </Alert>
      )}

      {/* A body the server can't read is not shown as an (empty) editor: that would look like a blank page. */}
      {!legacyUnconverted && !(serverUnreadable && !recovering) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Content</h2>
            {converted && <span className="text-sm text-amber-600 dark:text-amber-400" data-testid="converted-note">Converted from the older format. Press Save to keep it.</span>}
          </div>
          {formErrors.body && <p role="alert" className="text-sm text-destructive" data-testid="body-error">{formErrors.body}</p>}
          {problems.body && <p role="alert" className="text-sm text-destructive">{problems.body}</p>}
          {preview && bodyEditable ? (
            <div className="rounded-lg border border-border p-4" data-testid="preview">
              {previewable.length ? <BlockRenderer blocks={previewable} /> : <p className="text-sm text-muted-foreground">Nothing to preview yet.</p>}
              {skipped > 0 && <p className="mt-4 text-xs text-muted-foreground">{skipped} unsupported {skipped === 1 ? "block is" : "blocks are"} not shown in the preview.</p>}
            </div>
          ) : (
            <BlockEditor blocks={blocks} onChange={setBlocks} problems={fieldProblems} disabled={!bodyEditable} />
          )}
        </div>
      )}

      <AlertDialog open={guard.open || guard.working}>
        <AlertDialogContent data-testid="leave-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{guard.working ? "Saving your changes..." : "You have unsaved changes"}</AlertDialogTitle>
            <AlertDialogDescription>
              {guard.working ? "One moment. We'll leave the page when this is saved."
                : guard.failed ? "Your changes could not be saved. If you leave now they will be lost."
                : published ? "This page is published, so your changes are saved only when you press Save. Save them now, or leave and lose them."
                : "Your changes could not be saved automatically. If you leave now they will be lost."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {!guard.working && (
            <AlertDialogFooter>
              <AlertDialogCancel onClick={guard.stay}>Stay on this page</AlertDialogCancel>
              {!autosaveAllowed && !conflict && (
                <Button type="button" onClick={() => void guard.saveAndLeave()}>Save and leave</Button>
              )}
              <Button type="button" variant="destructive" onClick={guard.leave}>Leave without saving</Button>
            </AlertDialogFooter>
          )}
        </AlertDialogContent>
      </AlertDialog>
      <ConfirmDialog open={confirmDiscard} title="Discard the unreadable content?" confirmLabel="Discard and start over"
        description="The saved body of this page can't be read. If you continue, it will be replaced with an empty page when you press Save, and it cannot be recovered."
        onClose={() => setConfirmDiscard(false)} onConfirm={startRecovery} />
      <ConfirmDialog open={confirmPublish} title="Publish an empty page?" confirmLabel="Publish anyway"
        description="This page has no content yet, so readers won't see any meaningful body, only its title and summary."
        onClose={() => setConfirmPublish(false)}
        onConfirm={() => { setConfirmPublish(false); runPublish(true); }} />
    </section>
  );
}
