import { useRef, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories } from "@/hooks/useContent";
import { coverFields, hasErrors, LIMITS, slugify, validateCollection, type FieldErrors } from "@/lib/creator-validation";
import { MediaUploader } from "@/components/media/MediaUploader";
import type { CollectionInput } from "@/lib/types";

export interface CollectionFormValues {
  title: string;
  slug: string;
  description: string;
  coverUrl: string;
  /** The uploaded cover, if any (Step 12). Independent of `coverUrl`: the form keeps at most one of the two. */
  coverAssetId?: string | null;
  categoryId: number | null;
}

const emptyCollection: CollectionFormValues = { title: "", slug: "", description: "", coverUrl: "", coverAssetId: null, categoryId: null };

interface Props {
  initial?: CollectionFormValues;
  submitLabel: string;
  pending: boolean;
  /** Server error to show above the button (400/409 text from the API). */
  error?: string | null;
  /** Once published the server locks the slug; say why instead of failing on submit. */
  slugLocked?: boolean;
  onSubmit: (input: CollectionInput) => void;
}

export function CollectionForm({ initial = emptyCollection, submitLabel, pending, error, slugLocked, onSubmit }: Props) {
  const [v, setV] = useState(() => ({ ...initial, coverAssetId: initial.coverAssetId ?? null }));
  const initialAsset = useRef(initial.coverAssetId ?? null).current;   // what the server holds, to send only what changed
  const [coverUploading, setCoverUploading] = useState(false);   // an upload is running: the link field is locked so its completion cannot overwrite a newer link
  const [errors, setErrors] = useState<FieldErrors<CollectionInput>>({});
  const categories = useCategories();
  const set = <K extends keyof CollectionFormValues>(k: K, val: CollectionFormValues[K]) => setV((p) => ({ ...p, [k]: val }));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input: CollectionInput = { title: v.title.trim(), description: v.description, ...coverFields({ coverAssetId: initialAsset }, v) };
    if (!slugLocked && v.slug.trim()) input.slug = v.slug.trim();
    if (v.categoryId !== null) input.categoryId = v.categoryId;
    const found = validateCollection(input);
    setErrors(found);
    if (!hasErrors(found)) onSubmit(input);
  };

  const fieldError = (k: keyof CollectionInput) =>
    errors[k] ? <p id={`${k}-error`} role="alert" className="text-sm text-destructive">{errors[k]}</p> : null;

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="c-title">Title</Label>
        <Input id="c-title" value={v.title} maxLength={LIMITS.collectionTitle + 50} aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "title-error" : undefined} onChange={(e) => set("title", e.target.value)} />
        {fieldError("title")}
      </div>

      <div className="space-y-2">
        <Label htmlFor="c-slug">URL name</Label>
        <Input id="c-slug" value={v.slug} disabled={slugLocked} aria-invalid={!!errors.slug}
          aria-describedby={errors.slug ? "slug-error" : "c-slug-hint"}
          placeholder={slugify(v.title) || "created from the title"} onChange={(e) => set("slug", e.target.value)} />
        <p id="c-slug-hint" className="text-xs text-muted-foreground">
          {slugLocked
            ? "The URL name can't change while the collection is live. Unpublish it first."
            : "Part of the public link. Leave empty to create it from the title."}
        </p>
        {fieldError("slug")}
      </div>

      <div className="space-y-2">
        <Label htmlFor="c-desc">Description</Label>
        <Textarea id="c-desc" rows={3} value={v.description} aria-invalid={!!errors.description}
          onChange={(e) => set("description", e.target.value)} />
        {fieldError("description")}
      </div>

      <div className="space-y-2">
        <Label htmlFor="c-category">Category</Label>
        <Select value={v.categoryId === null ? undefined : String(v.categoryId)} onValueChange={(x) => set("categoryId", Number(x))}>
          <SelectTrigger id="c-category" aria-label="Category" disabled={categories.isLoading}>
            <SelectValue placeholder={categories.isLoading ? "Loading categories..." : "Choose a category"} />
          </SelectTrigger>
          <SelectContent>
            {(categories.data ?? []).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {categories.isError && <p className="text-xs text-muted-foreground">Categories couldn't be loaded; you can set one later.</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="c-cover">Cover image</Label>
        <MediaUploader label="Cover image" variant="thumb" assetId={v.coverAssetId}
          onUploaded={(a) => setV((p) => ({ ...p, coverAssetId: a.id, coverUrl: "" }))}
          onRemove={() => setV((p) => ({ ...p, coverAssetId: null }))} onBusyChange={setCoverUploading} />
        <Input id="c-cover" value={v.coverUrl} placeholder="Or paste an image link: https://..." aria-label="Cover image link" disabled={coverUploading} aria-invalid={!!errors.coverUrl}
          aria-describedby={errors.coverUrl ? "coverUrl-error" : undefined}
          onChange={(e) => { if (!coverUploading) setV((p) => ({ ...p, coverUrl: e.target.value, coverAssetId: e.target.value.trim() ? null : p.coverAssetId })); }} />
        {fieldError("coverUrl")}
      </div>

      {error && <p role="alert" className="text-sm text-destructive" data-testid="form-error">{error}</p>}
      <Button type="submit" disabled={pending}>
        {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitLabel}
      </Button>
    </form>
  );
}
