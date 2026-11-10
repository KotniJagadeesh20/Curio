import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog as UiDialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { CollectionForm } from "@/components/creator/CollectionForm";
import { NameDialog } from "@/components/creator/NameDialog";
import { StatusBadge } from "@/components/creator/StatusBadge";
import { visibilityNotes } from "@/lib/creator-status";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useAuth } from "@/context/AuthContext";
import { useMyCollection, useMyPage } from "@/hooks/useContent";
import {
  useCreateModule, useCreatePage, useDeleteCollection, useDeleteModule, useDeletePage, usePublishCollection, usePublishPage,
  useReorderModule, useReorderPage, useUnpublishCollection, useUpdateCollection, useUpdateModule, useUpdatePage,
} from "@/hooks/useCreatorMutations";
import { errorMessage, isMissingOrForbidden } from "@/lib/errors";
import { paths } from "@/lib/paths";
import type { CollectionDetail, CreatorModule, CreatorPageSummary } from "@/lib/types";
import NotFound from "@/pages/NotFound";

type Dialog =
  | { type: "module"; module?: CreatorModule }
  | { type: "page"; moduleId: number; page?: CreatorPageSummary }
  | { type: "delete-module"; module: CreatorModule }
  | { type: "delete-page"; page: CreatorPageSummary }
  | { type: "publish-page"; page: CreatorPageSummary }
  | { type: "delete-collection" }
  | null;

/** `/create/collections/:id` (the id is validated by the route adapter). Ownership is enforced by the server: another creator's collection answers 404/403 here. */
export default function CollectionEditor({ id }: { id: number }) {
  const query = useMyCollection(id);
  if (query.isLoading) return <div className="pt-28"><LoadingState label="Loading collection..." /></div>;
  if (query.isError) {
    if (isMissingOrForbidden(query.error)) return <NotFound />;
    return <div className="pt-28"><ErrorState error={query.error} onRetry={() => query.refetch()} /></div>;
  }
  return <EditorBody detail={query.data!} />;
}

function EditorBody({ detail }: { detail: CollectionDetail }) {
  const { collection: c, modules } = detail;
  const { user } = useAuth();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<Dialog>(null);
  const done = () => setDialog(null);

  const update = useUpdateCollection(c.id);
  const publish = usePublishCollection();
  const unpublish = useUnpublishCollection();
  const del = useDeleteCollection();
  const createModule = useCreateModule(c.id);
  const updateModule = useUpdateModule(c.id);
  const deleteModule = useDeleteModule(c.id);
  const reorderModule = useReorderModule(c.id);
  const createPage = useCreatePage(c.id);
  const updatePage = useUpdatePage(c.id);
  const publishPage = usePublishPage(c.id);
  const deletePage = useDeletePage(c.id);
  const reorderPage = useReorderPage(c.id);

  const run = <T,>(m: { mutate: (v: T, o: { onSuccess?: () => void; onError?: (e: unknown) => void }) => void }, v: T, ok: string) =>
    m.mutate(v, { onSuccess: () => toast.success(ok), onError: (e) => toast.error(errorMessage(e)) });

  const draft = c.status === "DRAFT";
  const canPublish = c.publishedPageCount > 0;
  const busy = publish.isPending || unpublish.isPending;
  const notes = visibilityNotes(c);
  const pageCount = (m: CreatorModule) => m.pages.length;

  return (
    <section className="container mx-auto px-4 pt-28 pb-16 max-w-4xl space-y-6">
      <div>
        <Link to={paths.workspace()} className="text-sm text-muted-foreground hover:underline">← My Collections</Link>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <h1 className="text-3xl font-bold">{c.title}</h1>
          <StatusBadge status={c.status} />
        </div>
        {notes.map((n) => <p key={n} className="text-sm text-amber-600 dark:text-amber-400 mt-1">{n}</p>)}
      </div>

      {/* ---- publishing ---- */}
      <Card data-testid="publishing">
        <CardHeader><CardTitle className="text-lg">Publishing</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {draft && "Only you can see this collection."}
            {c.status === "PUBLISHED" && "Readers can find it in Discover and open it with the link."}
            {c.status === "UNLISTED" && "Readers can open it with the link, but it is not listed in Discover or search."}
            {" "}Publishing needs at least one published page; pages you haven't published stay hidden.
          </p>
          {!canPublish && <p className="text-sm" data-testid="publish-hint">Publish at least one page below to enable publishing.</p>}
          <div className="flex flex-wrap gap-2">
            {(draft || c.status === "UNLISTED") && (
              <Button disabled={!canPublish || busy} onClick={() => run(publish, { id: c.id }, "Collection published")}>Publish</Button>
            )}
            {(draft || c.status === "PUBLISHED") && (
              <Button variant="outline" disabled={!canPublish || busy}
                onClick={() => run(publish, { id: c.id, status: "UNLISTED" }, "Collection is now unlisted")}>
                {draft ? "Publish as unlisted" : "Make unlisted"}
              </Button>
            )}
            {!draft && (
              <Button variant="outline" disabled={busy} onClick={() => run(unpublish, c.id, "Collection is a draft again")}>Unpublish</Button>
            )}
            {!draft && c.publiclyVisible && user?.username && (
              <Button asChild variant="ghost" className="gap-1">
                <Link to={paths.collection(user.username, c.slug)}><ExternalLink className="h-4 w-4" />View public page</Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ---- details ---- */}
      <Card>
        <CardHeader><CardTitle className="text-lg">Details</CardTitle></CardHeader>
        <CardContent>
          <CollectionForm
            key={`${c.id}:${c.slug}:${c.title}`}
            initial={{ title: c.title, slug: c.slug, description: c.description, coverUrl: c.coverUrl ?? "", coverAssetId: c.coverAssetId ?? null, categoryId: c.categoryId }}
            submitLabel="Save details" pending={update.isPending} slugLocked={!draft}
            error={update.isError ? errorMessage(update.error) : null}
            onSubmit={(input) => update.mutate(input, { onSuccess: () => toast.success("Details saved") })} />
        </CardContent>
      </Card>

      {/* ---- structure ---- */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Modules and pages</h2>
          <Button variant="outline" className="gap-2" onClick={() => setDialog({ type: "module" })}><Plus className="h-4 w-4" />Add module</Button>
        </div>
        <Alert data-testid="body-editor-notice">
          <AlertDescription>
            Open a page to write its content. Changes there are saved with its Save button, and a page needs content before
            readers get anything from it.
          </AlertDescription>
        </Alert>

        {modules.length === 0 && <p className="text-muted-foreground py-6 text-center">No modules yet. Add a module, then add pages to it.</p>}

        {modules.map((m, mi) => (
          <Card key={m.id} data-testid={`module-${m.id}`}>
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-semibold">{m.title}</h3>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" aria-label={`Move module ${m.title} up`} disabled={mi === 0 || reorderModule.isPending}
                    onClick={() => run(reorderModule, { id: m.id, position: mi - 1 }, "Module moved")}><ArrowUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Move module ${m.title} down`} disabled={mi === modules.length - 1 || reorderModule.isPending}
                    onClick={() => run(reorderModule, { id: m.id, position: mi + 1 }, "Module moved")}><ArrowDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Rename module ${m.title}`} onClick={() => setDialog({ type: "module", module: m })}><Pencil className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Delete module ${m.title}`} onClick={() => setDialog({ type: "delete-module", module: m })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>

              <ul className="divide-y">
                {m.pages.map((p, pi) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2" data-testid={`page-${p.id}`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <Link to={paths.editPage(p.id)} className="truncate hover:underline" aria-label={p.title}>{p.title}</Link>
                      <StatusBadge status={p.status} />
                      {!p.hasContent && <span className="text-xs text-muted-foreground" data-testid={`empty-${p.id}`}>No content yet</span>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" aria-label={`Move page ${p.title} up`} disabled={pi === 0 || reorderPage.isPending}
                        onClick={() => run(reorderPage, { id: p.id, position: pi - 1 }, "Page moved")}><ArrowUp className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Move page ${p.title} down`} disabled={pi === pageCount(m) - 1 || reorderPage.isPending}
                        onClick={() => run(reorderPage, { id: p.id, position: pi + 1 }, "Page moved")}><ArrowDown className="h-4 w-4" /></Button>
                      <Button asChild variant="outline" size="sm"><Link to={paths.editPage(p.id)}>Edit content</Link></Button>
                      {p.status === "PUBLISHED" ? (
                        <Button variant="outline" size="sm" disabled={publishPage.isPending}
                          onClick={() => run(publishPage, { id: p.id, publish: false }, "Page unpublished")}>Unpublish</Button>
                      ) : (
                        <Button variant="outline" size="sm" disabled={publishPage.isPending}
                          onClick={() => (p.hasContent ? run(publishPage, { id: p.id, publish: true }, "Page published") : setDialog({ type: "publish-page", page: p }))}>Publish</Button>
                      )}
                      <Button variant="ghost" size="icon" aria-label={`Edit page ${p.title}`} onClick={() => setDialog({ type: "page", moduleId: m.id, page: p })}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" aria-label={`Delete page ${p.title}`} onClick={() => setDialog({ type: "delete-page", page: p })}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </li>
                ))}
              </ul>
              {m.pages.length === 0 && <p className="text-sm text-muted-foreground">No pages in this module yet.</p>}
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => setDialog({ type: "page", moduleId: m.id })}><Plus className="h-4 w-4" />Add page</Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="pt-4 border-t">
        <Button variant="destructive" className="gap-2" onClick={() => setDialog({ type: "delete-collection" })}><Trash2 className="h-4 w-4" />Delete collection</Button>
        <p className="text-xs text-muted-foreground mt-2">You can restore it from "Recently deleted" for 30 days.</p>
      </div>

      {/* ---- dialogs ---- */}
      {dialog?.type === "module" && (() => {
        const mod = dialog.module;
        const m = mod ? updateModule : createModule;
        return (
          <NameDialog kind="module" mode={mod ? "edit" : "create"} slugLocked={!!mod && !draft}
            initial={mod && { title: mod.title, slug: mod.slug }}
            pending={m.isPending} error={m.isError ? errorMessage(m.error) : null}
            onClose={() => { createModule.reset(); updateModule.reset(); done(); }}
            onSubmit={(input) => {
              const onSuccess = () => { toast.success(mod ? "Module saved" : "Module added"); done(); };
              if (mod) updateModule.mutate({ id: mod.id, input: { title: input.title, slug: input.slug } }, { onSuccess });
              else createModule.mutate({ title: input.title, slug: input.slug }, { onSuccess });
            }} />
        );
      })()}
      {dialog?.type === "page" && (
        <PageDialog moduleId={dialog.moduleId} page={dialog.page} slugLocked={!draft}
          create={createPage} update={updatePage}
          onClose={() => { createPage.reset(); updatePage.reset(); done(); }}
          onDone={(msg) => { toast.success(msg); done(); }} />
      )}
      <ConfirmDialog open={dialog?.type === "delete-module"} title="Delete this module?"
        description={dialog?.type === "delete-module"
          ? `"${dialog.module.title}" and its ${pageCount(dialog.module)} ${pageCount(dialog.module) === 1 ? "page" : "pages"} will be permanently deleted.` : ""}
        onClose={done}
        onConfirm={() => { if (dialog?.type === "delete-module") run(deleteModule, dialog.module.id, "Module deleted"); done(); }} />
      <ConfirmDialog open={dialog?.type === "delete-page"} title="Delete this page?"
        description={dialog?.type === "delete-page" ? `"${dialog.page.title}" will be permanently deleted.` : ""}
        onClose={done}
        onConfirm={() => { if (dialog?.type === "delete-page") run(deletePage, dialog.page.id, "Page deleted"); done(); }} />
      <ConfirmDialog open={dialog?.type === "publish-page"} title="Publish an empty page?" confirmLabel="Publish anyway"
        description={dialog?.type === "publish-page"
          ? `"${dialog.page.title}" has no content yet. Readers won't see any meaningful body, only its title and summary.` : ""}
        onClose={done}
        onConfirm={() => { if (dialog?.type === "publish-page") run(publishPage, { id: dialog.page.id, publish: true }, "Page published"); done(); }} />
      <ConfirmDialog open={dialog?.type === "delete-collection"} title="Delete this collection?" confirmLabel="Delete collection"
        description="It disappears for readers immediately. You can restore it as a draft from Recently deleted within 30 days."
        onClose={done}
        onConfirm={() => {
          done();
          del.mutate(c.id, {
            onSuccess: () => { toast.success("Collection deleted"); navigate(paths.workspace()); },
            onError: (e) => toast.error(errorMessage(e)),
          });
        }} />
    </section>
  );
}

/** Editing needs the page's current summary (the outline doesn't carry it), otherwise saving would blank it. */
function PageDialog({ moduleId, page, slugLocked, create, update, onClose, onDone }: {
  moduleId: number;
  page?: CreatorPageSummary;
  slugLocked: boolean;
  create: ReturnType<typeof useCreatePage>;
  update: ReturnType<typeof useUpdatePage>;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const current = useMyPage(page?.id);
  if (page && current.isLoading) return <div role="status" className="fixed inset-0 z-50 grid place-items-center bg-black/50 text-white">Loading page...</div>;
  if (page && current.isError) {
    return (
      <UiDialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit page</DialogTitle></DialogHeader>
          <p role="alert" className="text-sm text-destructive">{errorMessage(current.error)}</p>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogContent>
      </UiDialog>
    );
  }
  const m = page ? update : create;
  return (
    <NameDialog kind="page" mode={page ? "edit" : "create"} slugLocked={!!page && slugLocked}
      initial={page && { title: current.data?.title ?? page.title, slug: page.slug, summary: current.data?.summary ?? "" }}
      pending={m.isPending} error={m.isError ? errorMessage(m.error) : null} onClose={onClose}
      onSubmit={(input) => {
        if (page) update.mutate({ id: page.id, input }, { onSuccess: () => onDone("Page saved") });
        else create.mutate({ moduleId, input }, { onSuccess: () => onDone("Page added") });
      }} />
  );
}
