import { useParams } from "react-router-dom";
import { Param, PlaceholderPage } from "@/components/PlaceholderPage";
import { parseHandle, parseId } from "@/lib/paths";
import CollectionEditor from "@/pages/creator/CollectionEditor";
import PageEditor from "@/pages/creator/PageEditor";
import Workspace from "@/pages/creator/Workspace";
import NotFound from "@/pages/NotFound";

// Route adapters and placeholders. Public screens arrive in Steps 14-15.

// ---- public (Step 14, Step 15) ----
export const DiscoverPage = () => <PlaceholderPage title="Discover" step="Step 14" />;

/** `/@username`: NotFound unless the segment really is an @handle (React Router can't match "@:username"). */
export function CreatorProfilePage() {
  const username = parseHandle(useParams().handle);
  if (!username) return <NotFound />;
  return (
    <PlaceholderPage title={`@${username}`} step="Step 15">
      <Param name="username" value={username} />
    </PlaceholderPage>
  );
}

export function PublicCollectionPage() {
  const { handle, collectionSlug } = useParams();
  const username = parseHandle(handle);
  if (!username || !collectionSlug) return <NotFound />;
  return (
    <PlaceholderPage title="Collection" step="Step 14">
      <Param name="username" value={username} />
      <Param name="collectionSlug" value={collectionSlug} />
    </PlaceholderPage>
  );
}

/** Module-qualified on purpose: page slugs are only unique within a module (see lib/paths.ts). */
export function PublicPageViewPage() {
  const { handle, collectionSlug, moduleSlug, pageSlug } = useParams();
  const username = parseHandle(handle);
  if (!username || !collectionSlug || !moduleSlug || !pageSlug) return <NotFound />;
  return (
    <PlaceholderPage title="Page" step="Step 14">
      <Param name="username" value={username} />
      <Param name="collectionSlug" value={collectionSlug} />
      <Param name="moduleSlug" value={moduleSlug} />
      <Param name="pageSlug" value={pageSlug} />
    </PlaceholderPage>
  );
}

// ---- creator workspace (mounted behind ProtectedRoute) ----
// Steps 8-9 replaced the creator placeholders with real screens; the route adapters stay here so the id guard
// (a bad id is a 404, never a request for "NaN") lives in one place next to the other route params.
export const WorkspacePage = () => <Workspace />;

export function CollectionEditorPage() {
  const id = parseId(useParams().id);
  if (id === null) return <NotFound />;
  return <CollectionEditor id={id} />;
}

export function PageEditorPage() {
  const id = parseId(useParams().id);
  if (id === null) return <NotFound />;
  return <PageEditor id={id} />;
}

export const ProfileSettingsPage = () => <PlaceholderPage title="Profile settings" step="Step 15" />;
