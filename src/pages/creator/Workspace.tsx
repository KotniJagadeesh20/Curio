import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { FileText, LayoutTemplate, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollectionForm } from "@/components/creator/CollectionForm";
import { StatusBadge } from "@/components/creator/StatusBadge";
import { visibilityNotes } from "@/lib/creator-status";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { useCategories, useMyCollections } from "@/hooks/useContent";
import { useCreateCollection, useRestoreCollection } from "@/hooks/useCreatorMutations";
import { errorMessage } from "@/lib/errors";
import { paths } from "@/lib/paths";
import type { CollectionInput, CollectionSummary } from "@/lib/types";
import {
  BLANK_TEMPLATE_ID, TEMPLATES, TemplateCreationError, createFromTemplate, initialCreationState, isBlank, pageCount, resolveCategoryId,
  stepsDone, totalSteps, type CollectionTemplate, type CreationProgress, type CreationState,
} from "@/lib/templates";

/** `/create`: the signed-in creator's own collections. The server only ever returns the caller's. */
export default function Workspace() {
  const [showDeleted, setShowDeleted] = useState(false);
  const [creating, setCreating] = useState(false);
  const list = useMyCollections(showDeleted);

  return (
    <section className="container mx-auto px-4 pt-28 pb-16 max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-bold">My Collections</h1>
          <p className="text-muted-foreground">Collections hold modules, and modules hold pages. Drafts are only visible to you.</p>
        </div>
        <Button onClick={() => setCreating(true)} className="gap-2"><Plus className="h-4 w-4" />New collection</Button>
      </div>

      <Tabs value={showDeleted ? "deleted" : "active"} onValueChange={(v) => setShowDeleted(v === "deleted")} className="mb-4">
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="deleted">Recently deleted</TabsTrigger>
        </TabsList>
      </Tabs>

      {list.isLoading && <LoadingState label="Loading your collections..." />}
      {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
      {list.data && list.data.length === 0 && (
        <EmptyState message={showDeleted ? "Nothing was deleted in the last 30 days." : "You have no collections yet. Create your first one."} />
      )}
      <ul className="space-y-3">
        {list.data?.map((c) => <li key={c.id}>{showDeleted ? <DeletedRow c={c} /> : <CollectionRow c={c} />}</li>)}
      </ul>

      {creating && <CreateDialog onClose={() => setCreating(false)} />}
    </section>
  );
}

function CollectionRow({ c }: { c: CollectionSummary }) {
  const notes = visibilityNotes(c);
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link to={paths.editCollection(c.id)} className="text-lg font-semibold hover:underline">{c.title}</Link>
            <StatusBadge status={c.status} />
            {c.hiddenByModeration && <Badge variant="destructive">Hidden</Badge>}
          </div>
          <p className="text-sm text-muted-foreground">
            {c.moduleCount} {c.moduleCount === 1 ? "module" : "modules"} · {c.pageCount} {c.pageCount === 1 ? "page" : "pages"}
            {c.pageCount > 0 && <> · {c.publishedPageCount} published</>}
          </p>
          {notes.map((n) => <p key={n} className="text-sm text-amber-600 dark:text-amber-400">{n}</p>)}
        </div>
        <Button asChild variant="outline" size="sm"><Link to={paths.editCollection(c.id)}>Open</Link></Button>
      </CardContent>
    </Card>
  );
}

function DeletedRow({ c }: { c: CollectionSummary }) {
  const restore = useRestoreCollection();
  const until = c.restorableUntil ? new Date(c.restorableUntil).toLocaleDateString() : null;
  return (
    <Card>
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{c.title}</p>
          <p className="text-sm text-muted-foreground">{until ? `Can be restored until ${until}. It comes back as a draft.` : "Deleted."}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2" disabled={restore.isPending}
          onClick={() => restore.mutate(c.id, {
            onSuccess: () => toast.success("Collection restored as a draft"),
            onError: (e) => toast.error(errorMessage(e)),
          })}>
          <RotateCcw className="h-4 w-4" />Restore
        </Button>
      </CardContent>
    </Card>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const [templateId, setTemplateId] = useState(BLANK_TEMPLATE_ID);
  // started: a template run has begun (the picker is hidden so its progress can't be thrown away); running: a request is in flight
  const [phase, setPhase] = useState({ started: false, running: false });
  const template = TEMPLATES.find((t) => t.id === templateId);
  return (
    <Dialog open onOpenChange={(o) => !o && !phase.running && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>It starts as a draft. Add modules and pages, then publish when you're ready.</DialogDescription>
        </DialogHeader>
        {!phase.started && <TemplatePicker value={templateId} onChange={setTemplateId} />}
        {!template || isBlank(template)
          ? <BlankCreate />
          : <TemplateCreate key={template.id} template={template} onPhase={setPhase} />}
      </DialogContent>
    </Dialog>
  );
}

/**
 * The template choice: a Radix radio group (one tab stop; arrow keys move and select; Space selects the focused one), each option a
 * card whose label is the whole card.
 */
function TemplatePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  if (TEMPLATES.length < 2) return null;
  return (
    <RadioGroup value={value} onValueChange={onChange} aria-label="Template" className="grid gap-2 sm:grid-cols-2">
      {TEMPLATES.map((t) => {
        const selected = t.id === value;
        const pages = pageCount(t);
        const id = `template-${t.id}`;
        return (
          <label key={t.id} htmlFor={id}
            className={`flex cursor-pointer gap-3 rounded-md border p-3 text-left text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${selected ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
            <RadioGroupItem id={id} value={t.id} className="mt-0.5 shrink-0" />
            <span className="min-w-0">
              <span className="flex items-center gap-2 font-medium">{isBlank(t) ? <FileText className="h-4 w-4" /> : <LayoutTemplate className="h-4 w-4" />}{t.name}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{t.description}</span>
              {!isBlank(t) && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t.modules.length} {t.modules.length === 1 ? "module" : "modules"} · {pages} {pages === 1 ? "page" : "pages"}
                </span>
              )}
            </span>
          </label>
        );
      })}
    </RadioGroup>
  );
}

/** The blank collection: exactly the pre-template behaviour (one request, then the editor). */
function BlankCreate() {
  const navigate = useNavigate();
  const create = useCreateCollection();
  return (
    <CollectionForm submitLabel="Create collection" pending={create.isPending}
      error={create.isError ? errorMessage(create.error) : null}
      onSubmit={(input) => create.mutate(input, {
        onSuccess: (c) => { toast.success("Collection created"); navigate(paths.editCollection(c.id)); },
      })} />
  );
}

interface Run {
  input: CollectionInput;
  state: CreationState;
  progress: CreationProgress | null;
  error: { step: string; message: string } | null;
}

/**
 * A collection from a template: the same form (category preset from the template), then the collection, its modules and pages
 * created one request at a time with progress. A failure stops the run and keeps what was created; "Retry remaining" continues from
 * there without creating the collection again. One run at a time (a second click while one is running is ignored).
 */
function TemplateCreate({ template, onPhase }: { template: CollectionTemplate; onPhase: (p: { started: boolean; running: boolean }) => void }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const categories = useCategories();
  const inFlight = useRef(false);
  const [run, setRun] = useState<Run | null>(null);
  const [running, setRunning] = useState(false);
  const categoryId = resolveCategoryId(template, categories.data);
  const categoryMissing = !!template.category && !categories.isLoading && categoryId === null;

  const go = async (input: CollectionInput, state: CreationState) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setRunning(true);
    onPhase({ started: true, running: true });
    let reached = state;
    setRun({ input, state, progress: null, error: null });
    try {
      const done = await createFromTemplate(template, input, state, (s, progress) => {
        reached = s;
        setRun({ input, state: s, progress, error: null });
      });
      await qc.invalidateQueries({ queryKey: ["mine", "collections"] });
      toast.success(`Collection created from the ${template.name} template`);
      navigate(paths.editCollection(done.collection!.id));
    } catch (e) {
      const failure = e instanceof TemplateCreationError ? e : null;
      reached = failure?.state ?? reached;
      setRun({ input, state: reached, progress: null, error: { step: failure?.step ?? "", message: errorMessage(failure?.cause ?? e) } });
      if (reached.collection) void qc.invalidateQueries({ queryKey: ["mine", "collections"] });
    } finally {
      inFlight.current = false;
      setRunning(false);
      onPhase({ started: !!reached.collection, running: false });
    }
  };

  // Nothing created yet (or the collection itself was refused): the form, with the server's reason if any.
  if (!run?.state.collection) {
    return (
      <div className="space-y-3">
        {categoryMissing && (
          <p className="text-xs text-muted-foreground">This template's category isn't available right now; you can set one later.</p>
        )}
        <CollectionForm key={categories.isLoading ? "loading" : "ready"} submitLabel="Create from template" pending={running}
          initial={{ title: "", slug: "", description: "", coverUrl: "", coverAssetId: null, categoryId }}
          error={run?.error?.message ?? null}
          onSubmit={(input) => void go(input, run?.state ?? initialCreationState(template))} />
      </div>
    );
  }

  const total = totalSteps(template);
  const done = stepsDone(run.state);
  const collectionId = run.state.collection.id;
  return (
    <div className="space-y-3" data-testid="template-progress">
      <p className="text-sm font-medium">Creating "{run.state.collection.title}" from the {template.name} template</p>
      <Progress value={(done / total) * 100} aria-label="Template creation progress" />
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {done} of {total} created{running && run.progress ? `. Now: ${run.progress.current}` : ""}
      </p>
      {run.error && (
        <div role="alert" className="space-y-2 rounded-md border border-destructive/50 p-3 text-sm">
          <p className="text-destructive">Couldn't create {run.error.step}: {run.error.message}</p>
          <p className="text-muted-foreground">Everything created so far is kept as a draft. Retry to create the rest, or open the collection and finish it yourself.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={running} onClick={() => void go(run.input, run.state)}>Retry remaining</Button>
            <Button size="sm" variant="outline" onClick={() => navigate(paths.editCollection(collectionId))}>Open collection</Button>
          </div>
        </div>
      )}
    </div>
  );
}
