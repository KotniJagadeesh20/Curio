import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CollectionForm } from "@/components/creator/CollectionForm";
import { StatusBadge } from "@/components/creator/StatusBadge";
import { visibilityNotes } from "@/lib/creator-status";
import { EmptyState, ErrorState, LoadingState } from "@/components/QueryState";
import { useMyCollections } from "@/hooks/useContent";
import { useCreateCollection, useRestoreCollection } from "@/hooks/useCreatorMutations";
import { errorMessage } from "@/lib/errors";
import { paths } from "@/lib/paths";
import type { CollectionSummary } from "@/lib/types";

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
  const navigate = useNavigate();
  const create = useCreateCollection();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New collection</DialogTitle>
          <DialogDescription>It starts as a draft. Add modules and pages, then publish when you're ready.</DialogDescription>
        </DialogHeader>
        <CollectionForm submitLabel="Create collection" pending={create.isPending}
          error={create.isError ? errorMessage(create.error) : null}
          onSubmit={(input) => create.mutate(input, {
            onSuccess: (c) => { toast.success("Collection created"); navigate(paths.editCollection(c.id)); },
          })} />
      </DialogContent>
    </Dialog>
  );
}
