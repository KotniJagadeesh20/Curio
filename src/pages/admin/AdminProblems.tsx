import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { SlugInput } from "@/components/admin/SlugInput";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { useAdminProblem, useAdminProblems, useDeleteProblem, useSaveProblem } from "@/hooks/useAdmin";
import { useMyCollections } from "@/hooks/useContent";
import { fromLines, slugify, toLines, type ProblemInput } from "@/lib/admin-types";
import type { ProblemExample, ProblemSummary } from "@/lib/types";

const difficultyColors = {
  easy: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  medium: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  hard: "bg-red-500/10 text-red-500 border-red-500/20",
};

export default function AdminProblems() {
  const problemsQ = useAdminProblems();
  // A problem links to a track by slug, and the server resolves that among the admin's own (legacy) collections.
  const tracksQ = useMyCollections();
  const del = useDeleteProblem();
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<{ problem?: ProblemSummary } | null>(null);
  const [toDelete, setToDelete] = useState<ProblemSummary | null>(null);

  const trackName = useMemo(() => new Map((tracksQ.data ?? []).map((t) => [t.slug, t.title])), [tracksQ.data]);

  if (problemsQ.isLoading || tracksQ.isLoading) return <div className="p-6"><LoadingState /></div>;
  const error = problemsQ.error ?? tracksQ.error;
  if (error) return <div className="p-6"><ErrorState error={error} onRetry={() => { problemsQ.refetch(); tracksQ.refetch(); }} /></div>;

  const q = search.trim().toLowerCase();
  const problems = (problemsQ.data ?? []).filter((p) =>
    !q || [p.title, p.slug, p.category, p.concept].some((f) => f.toLowerCase().includes(q)));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Problems</h1>
          <p className="text-sm text-muted-foreground">{problemsQ.data?.length ?? 0} practice problems</p>
        </div>
        <Button onClick={() => setDialog({})} className="gap-2"><Plus className="h-4 w-4" />New Problem</Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Search problems..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead><TableHead>Track</TableHead><TableHead>Category</TableHead>
                <TableHead>Difficulty</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {problems.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.title}</div>
                    <div className="text-xs text-muted-foreground">/{p.slug}</div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{p.trackSlug ? trackName.get(p.trackSlug) ?? p.trackSlug : "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category || "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={difficultyColors[p.difficulty]}>{p.difficulty}</Badge></TableCell>
                  <TableCell><Badge variant={p.published ? "default" : "secondary"}>{p.published ? "Published" : "Draft"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="icon" aria-label="Edit problem" onClick={() => setDialog({ problem: p })}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" aria-label="Delete problem" className="text-destructive" onClick={() => setToDelete(p)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {problems.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No problems found</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {dialog && <ProblemDialog problem={dialog.problem} tracks={(tracksQ.data ?? []).map((t) => ({ slug: t.slug, name: t.title }))} onClose={() => setDialog(null)} />}
      <ConfirmDialog open={!!toDelete} onClose={() => setToDelete(null)}
        title={`Delete problem "${toDelete?.title}"?`} description="This cannot be undone."
        onConfirm={() => { if (toDelete) del.mutate(toDelete.id); setToDelete(null); }} />
    </div>
  );
}

type Form = Omit<ProblemInput, "constraints" | "hints"> & { constraintsText: string; hintsText: string };

const blank = (): Form => ({
  slug: "", trackSlug: "", title: "", difficulty: "easy", category: "", concept: "", description: "",
  examples: [], constraintsText: "", hintsText: "", solution: "", language: "java", starterCode: "", published: true,
});

function ProblemDialog({ problem, tracks, onClose }: { problem?: ProblemSummary; tracks: { slug: string; name: string }[]; onClose: () => void }) {
  const full = useAdminProblem(problem?.id ?? null);
  const save = useSaveProblem();
  const [form, setForm] = useState<Form | null>(problem ? null : blank());
  const [slugTouched, setSlugTouched] = useState(!!problem);

  useEffect(() => {
    const p = full.data;
    if (!p || form) return;
    setForm({
      slug: p.slug, trackSlug: p.trackSlug ?? "", title: p.title, difficulty: p.difficulty, category: p.category,
      concept: p.concept, description: p.description, examples: p.examples, constraintsText: fromLines(p.constraints),
      hintsText: fromLines(p.hints), solution: p.solution, language: p.language, starterCode: p.starterCode, published: p.published,
    });
  }, [full.data, form]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => f && { ...f, [k]: v });
  const setExample = (i: number, patch: Partial<ProblemExample>) =>
    setForm((f) => f && { ...f, examples: f.examples.map((e, idx) => (idx === i ? { ...e, ...patch } : e)) });

  const submit = () => {
    if (!form) return;
    const { constraintsText, hintsText, ...rest } = form;
    save.mutate({ id: problem?.id, data: { ...rest, constraints: toLines(constraintsText), hints: toLines(hintsText) } },
      { onSuccess: onClose });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{problem ? "Edit problem" : "New problem"}</DialogTitle></DialogHeader>
        {!form ? (full.error ? <ErrorState error={full.error} /> : <LoadingState />) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(e) => { set("title", e.target.value); if (!slugTouched) set("slug", slugify(e.target.value)); }} />
            </div>
            <SlugInput value={form.slug} onChange={(v) => { setSlugTouched(true); set("slug", v); }} />
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Track</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.trackSlug} onChange={(e) => set("trackSlug", e.target.value)}>
                  <option value="">None</option>
                  {tracks.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Difficulty</Label>
                <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.difficulty} onChange={(e) => set("difficulty", e.target.value as Form["difficulty"])}>
                  <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Input value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="Arrays & Strings" />
              </div>
              <div className="space-y-2">
                <Label>Concept</Label>
                <Input value={form.concept} onChange={(e) => set("concept", e.target.value)} placeholder="Hash Tables" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Examples</Label>
                <Button type="button" variant="outline" size="sm" className="gap-1"
                  onClick={() => set("examples", [...form.examples, { input: "", output: "", explanation: "" }])}>
                  <Plus className="h-3.5 w-3.5" />Add example
                </Button>
              </div>
              {form.examples.map((ex, i) => (
                <div key={i} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input placeholder="Input" value={ex.input} onChange={(e) => setExample(i, { input: e.target.value })} />
                    <Input placeholder="Output" value={ex.output} onChange={(e) => setExample(i, { output: e.target.value })} />
                  </div>
                  <div className="flex gap-2">
                    <Input placeholder="Explanation (optional)" value={ex.explanation} onChange={(e) => setExample(i, { explanation: e.target.value })} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove example" className="text-destructive shrink-0"
                      onClick={() => set("examples", form.examples.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Constraints (one per line)</Label>
                <Textarea rows={4} value={form.constraintsText} onChange={(e) => set("constraintsText", e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hints (one per line, in reveal order)</Label>
                <Textarea rows={4} value={form.hintsText} onChange={(e) => set("hintsText", e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Language</Label>
                <Input value={form.language} onChange={(e) => set("language", e.target.value)} />
              </div>
              <div className="col-span-3" />
            </div>
            <div className="space-y-2">
              <Label>Starter code</Label>
              <Textarea rows={6} className="font-mono text-xs" value={form.starterCode} onChange={(e) => set("starterCode", e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Solution</Label>
              <Textarea rows={6} className="font-mono text-xs" value={form.solution} onChange={(e) => set("solution", e.target.value)} />
            </div>
            <div className="flex items-center gap-3">
              <Switch id="problem-published" checked={form.published} onCheckedChange={(v) => set("published", v)} />
              <Label htmlFor="problem-published">Published</Label>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={!form || save.isPending || !form.title.trim() || !form.slug}>
            {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
