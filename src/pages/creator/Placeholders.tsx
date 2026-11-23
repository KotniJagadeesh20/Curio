import { useParams } from "react-router-dom";
import { PlaceholderPage } from "@/components/PlaceholderPage";
import { parseId } from "@/lib/paths";
import CollectionEditor from "@/pages/creator/CollectionEditor";
import PageEditor from "@/pages/creator/PageEditor";
import Workspace from "@/pages/creator/Workspace";
import NotFound from "@/pages/NotFound";

// Route adapters and placeholders. The public views (Discover, collection, page, and since Step 15b the creator
// profile) and their route adapters live in src/pages/public/ (routes.tsx); only the Step 15 profile-settings
// placeholder (Step 15c) is left here, next to the creator workspace adapters.

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
