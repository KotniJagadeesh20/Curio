import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { hasErrors, slugify, validateModule, validatePage, type FieldErrors } from "@/lib/creator-validation";
import type { PageInput } from "@/lib/types";

interface Props {
  kind: "module" | "page";
  mode: "create" | "edit";
  initial?: { title: string; slug: string; summary?: string };
  /** The server locks slugs while the collection is live. */
  slugLocked?: boolean;
  pending: boolean;
  error?: string | null;
  onSubmit: (input: PageInput) => void;
  onClose: () => void;
}

/** Create/rename dialog for a module (title, slug) or a page (title, slug, summary). No body: that is the Step 9 editor. */
export function NameDialog({ kind, mode, initial, slugLocked, pending, error, onSubmit, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [errors, setErrors] = useState<FieldErrors<PageInput>>({});
  const noun = kind === "module" ? "module" : "page";

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input: PageInput = { title: title.trim() };
    if (!slugLocked && slug.trim() && !(mode === "edit" && slug.trim() === initial?.slug)) input.slug = slug.trim();
    if (kind === "page") input.summary = summary;
    const found = kind === "module" ? validateModule(input) : validatePage(input);
    setErrors(found);
    if (!hasErrors(found)) onSubmit(input);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{mode === "create" ? `New ${noun}` : `Edit ${noun}`}</DialogTitle>
            <DialogDescription>
              {kind === "module" ? "A module groups related pages." : "Give the page a title and an optional summary. You'll write its content in the page editor."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="n-title">Title</Label>
            <Input id="n-title" autoFocus value={title} aria-invalid={!!errors.title} onChange={(e) => setTitle(e.target.value)} />
            {errors.title && <p role="alert" className="text-sm text-destructive">{errors.title}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="n-slug">URL name</Label>
            <Input id="n-slug" value={slug} disabled={slugLocked} placeholder={slugify(title) || "created from the title"}
              aria-invalid={!!errors.slug} onChange={(e) => setSlug(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              {slugLocked ? "URL names can't change while the collection is live. Unpublish it first." : "Leave empty to create it from the title."}
            </p>
            {errors.slug && <p role="alert" className="text-sm text-destructive">{errors.slug}</p>}
          </div>
          {kind === "page" && (
            <div className="space-y-2">
              <Label htmlFor="n-summary">Summary</Label>
              <Textarea id="n-summary" rows={3} value={summary} aria-invalid={!!errors.summary} onChange={(e) => setSummary(e.target.value)} />
              {errors.summary && <p role="alert" className="text-sm text-destructive">{errors.summary}</p>}
            </div>
          )}

          {error && <p role="alert" className="text-sm text-destructive" data-testid="form-error">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{mode === "create" ? "Create" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
