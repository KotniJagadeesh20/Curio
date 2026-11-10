import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Slug field that shows the resulting public URL fragment as a hint. */
export function SlugInput({ value, onChange, hint }: { value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <div className="space-y-2">
      <Label>Slug</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder="lowercase-with-hyphens" />
      <p className="text-xs text-muted-foreground">
        {hint ?? "Used in the URL. Lowercase letters, numbers and hyphens only."}
        {" "}Changing it breaks existing links.
      </p>
    </div>
  );
}
