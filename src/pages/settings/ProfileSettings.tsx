import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ErrorState, LoadingState } from "@/components/QueryState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useMyProfile } from "@/hooks/useContent";
import { useUpdateProfile } from "@/hooks/useCreatorMutations";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { ApiError } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { paths } from "@/lib/paths";
import {
  hasProfileErrors,
  PROFILE_LIMITS,
  serverErrorField,
  toUpdateRequest,
  validateProfile,
  type ProfileErrors,
  type ProfileForm,
} from "@/lib/profile-validation";
import type { Profile } from "@/lib/types";

const TITLE = "Profile settings";
const noErrors = (): ProfileErrors => ({ fields: {}, links: {} });

/**
 * `/settings/profile` (Step 15c; behind ProtectedRoute). Edits the signed-in user's own profile with an explicit Save
 * (no autosave, no unsaved-changes guard: Q15-4). Client checks mirror the server for UX only; the server's 400 message
 * is shown under its field when it names one, otherwise above Save. While a save is pending every control is disabled,
 * so the reset from the server's answer can't discard an edit made in between.
 */
export default function ProfileSettings() {
  useDocumentTitle(TITLE);
  const me = useMyProfile();

  return (
    <section className="container mx-auto px-4 pt-28 pb-16 max-w-2xl">
      <h1 className="text-3xl font-bold mb-6">{TITLE}</h1>
      {me.isPending ? (
        <LoadingState />
      ) : me.isError ? (
        <ErrorState error={me.error} onRetry={() => me.refetch()} />
      ) : (
        <ProfileEditor username={me.data.user.username} saved={me.data.profile} />
      )}
    </section>
  );
}

function ProfileEditor({ username, saved }: { username: string; saved: Profile }) {
  const update = useUpdateProfile();
  const nextId = useRef(0);
  const newId = () => `link-${++nextId.current}`;
  const fromProfile = (p: Profile): ProfileForm => ({
    displayName: p.displayName,
    bio: p.bio,
    avatarUrl: p.avatarUrl ?? "",
    bannerUrl: p.bannerUrl ?? "",
    links: Object.entries(p.socialLinks).map(([label, url]) => ({ id: newId(), label, url })),
    visibility: p.visibility,
  });

  const [form, setForm] = useState<ProfileForm>(() => fromProfile(saved));
  const [errors, setErrors] = useState<ProfileErrors>(noErrors);
  const [formError, setFormError] = useState<string | null>(null);
  /** Set synchronously on submit, so a second click in the same tick can't send a second PUT. */
  const saving = useRef(false);
  const busy = update.isPending;

  const edit = (patch: Partial<ProfileForm>) => {
    if (saving.current) return;            // controls are disabled too; this also covers synthetic events
    setForm((f) => ({ ...f, ...patch }));
  };
  const editLink = (id: string, patch: { label?: string; url?: string }) =>
    edit({ links: form.links.map((r) => (r.id === id ? { ...r, ...patch } : r)) });

  // focus the first invalid control after errors are rendered
  const [focusFirst, setFocusFirst] = useState(0);
  useEffect(() => {
    if (!focusFirst) return;
    document.querySelector<HTMLElement>("[data-profile-form] [aria-invalid='true']")?.focus();
  }, [focusFirst]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (saving.current) return;
    setFormError(null);
    const found = validateProfile(form);
    setErrors(found);
    if (hasProfileErrors(found)) { setFocusFirst((n) => n + 1); return; }

    saving.current = true;
    update.mutate(toUpdateRequest(form), {
      onSuccess: (profile) => {
        setForm(fromProfile(profile));
        setErrors(noErrors());
        toast.success("Profile saved");
      },
      onError: (error) => {
        const mapped = error instanceof ApiError && error.status === 400 ? serverErrorField(error.message) : null;
        if (!mapped) { setFormError(errorMessage(error)); return; }
        const next = noErrors();
        const row = mapped.linkLabel ? form.links.find((r) => r.label.trim() === mapped.linkLabel) : undefined;
        if (row) next.links[row.id] = { url: error.message };
        else next.fields[mapped.field] = error.message;
        setErrors(next);
        setFocusFirst((n) => n + 1);
      },
      onSettled: () => { saving.current = false; },
    });
  };

  const fieldError = (key: keyof ProfileErrors["fields"], id: string) =>
    errors.fields[key] ? <p id={id} className="text-sm text-destructive">{errors.fields[key]}</p> : null;
  const described = (...ids: Array<string | false | undefined>) => ids.filter(Boolean).join(" ") || undefined;
  const bioLength = form.bio.trim().length;

  return (
    <form onSubmit={submit} className="space-y-6" noValidate data-profile-form>
      <div className="space-y-1">
        <p className="text-sm font-medium">Username</p>
        <p className="font-mono">@{username}</p>
        <p className="text-sm text-muted-foreground">Usernames can't be changed</p>
        {saved.visibility === "PUBLIC" && (
          <Link to={paths.creatorProfile(username)} className="text-sm font-medium text-primary hover:underline">
            View public profile
          </Link>
        )}
      </div>

      <fieldset disabled={busy} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="p-name">Display name</Label>
          <Input id="p-name" value={form.displayName} aria-invalid={!!errors.fields.displayName}
            aria-describedby={described(errors.fields.displayName && "p-name-error")}
            onChange={(e) => edit({ displayName: e.target.value })} />
          {fieldError("displayName", "p-name-error")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-bio">Bio</Label>
          <Textarea id="p-bio" rows={4} value={form.bio} aria-invalid={!!errors.fields.bio}
            aria-describedby={described("p-bio-count", errors.fields.bio && "p-bio-error")}
            onChange={(e) => edit({ bio: e.target.value })} />
          <p id="p-bio-count" className={`text-xs ${bioLength > PROFILE_LIMITS.bio ? "text-destructive" : "text-muted-foreground"}`}>
            {bioLength} / {PROFILE_LIMITS.bio}
          </p>
          {fieldError("bio", "p-bio-error")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-avatar">Avatar URL</Label>
          <Input id="p-avatar" value={form.avatarUrl} placeholder="https://..." aria-invalid={!!errors.fields.avatarUrl}
            aria-describedby={described(errors.fields.avatarUrl && "p-avatar-error")}
            onChange={(e) => edit({ avatarUrl: e.target.value })} />
          {fieldError("avatarUrl", "p-avatar-error")}
        </div>

        <div className="space-y-2">
          <Label htmlFor="p-banner">Banner URL</Label>
          <Input id="p-banner" value={form.bannerUrl} placeholder="https://..." aria-invalid={!!errors.fields.bannerUrl}
            aria-describedby={described(errors.fields.bannerUrl && "p-banner-error")}
            onChange={(e) => edit({ bannerUrl: e.target.value })} />
          {fieldError("bannerUrl", "p-banner-error")}
        </div>

        <fieldset className="space-y-3" aria-describedby={described("p-links-hint", errors.fields.socialLinks && "p-links-error")}>
          <legend className="text-sm font-medium">Social links</legend>
          <p id="p-links-hint" className="text-xs text-muted-foreground">
            Up to {PROFILE_LIMITS.links} links. Names use lowercase letters, digits or _ (e.g. github); addresses start with https://.
          </p>
          {form.links.map((r, i) => {
            const n = i + 1;
            const err = errors.links[r.id] ?? {};
            return (
              <div key={r.id} role="group" aria-label={`Link ${n}`} className="flex flex-wrap items-start gap-2">
                <div className="w-full sm:w-40 space-y-1">
                  <Input aria-label={`Link ${n} name`} placeholder="name" value={r.label} aria-invalid={!!err.label}
                    aria-describedby={err.label ? `${r.id}-label-error` : undefined}
                    onChange={(e) => editLink(r.id, { label: e.target.value })} />
                  {err.label && <p id={`${r.id}-label-error`} className="text-sm text-destructive">{err.label}</p>}
                </div>
                <div className="flex-1 min-w-[12rem] space-y-1">
                  <Input aria-label={`Link ${n} URL`} placeholder="https://..." value={r.url} aria-invalid={!!err.url}
                    aria-describedby={err.url ? `${r.id}-url-error` : undefined}
                    onChange={(e) => editLink(r.id, { url: e.target.value })} />
                  {err.url && <p id={`${r.id}-url-error`} className="text-sm text-destructive">{err.url}</p>}
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label={`Remove link ${n}`}
                  onClick={() => edit({ links: form.links.filter((x) => x.id !== r.id) })}>
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            );
          })}
          <Button type="button" variant="outline" size="sm" disabled={form.links.length >= PROFILE_LIMITS.links}
            onClick={() => edit({ links: [...form.links, { id: newId(), label: "", url: "" }] })}>
            <Plus className="h-4 w-4 mr-1" aria-hidden="true" />Add link
          </Button>
          {errors.fields.socialLinks && <p id="p-links-error" className="text-sm text-destructive">{errors.fields.socialLinks}</p>}
        </fieldset>

        <fieldset className="space-y-2" aria-describedby="p-vis-hint">
          <legend className="text-sm font-medium">Profile visibility</legend>
          <RadioGroup value={form.visibility} disabled={busy}
            onValueChange={(v) => edit({ visibility: v as ProfileForm["visibility"] })}>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="p-vis-public" value="PUBLIC" />
              <Label htmlFor="p-vis-public">Public</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem id="p-vis-private" value="PRIVATE" />
              <Label htmlFor="p-vis-private">Private</Label>
            </div>
          </RadioGroup>
          <p id="p-vis-hint" className="text-xs text-muted-foreground">
            Private hides your profile page (/@{username}). Your published collections stay visible in Discover.
          </p>
          {errors.fields.visibility && <p className="text-sm text-destructive">{errors.fields.visibility}</p>}
        </fieldset>
      </fieldset>

      {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
      <Button type="submit" disabled={busy}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
        {busy ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
