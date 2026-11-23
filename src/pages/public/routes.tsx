import { useParams } from "react-router-dom";
import { parseHandle } from "@/lib/paths";
import NotFound from "@/pages/NotFound";
import CollectionView from "@/pages/public/CollectionView";
import CreatorProfile from "@/pages/public/CreatorProfile";
import PageView from "@/pages/public/PageView";

// Route adapters for the public viewers (moved here from src/pages/creator/Placeholders.tsx in Step 14d, unchanged).
// They turn the router's raw params into viewer props: the first segment must really be an @handle (React Router can't
// match "@:username"), and every other segment must be present; anything else is the app's NotFound, never an API call.

/** `/@username`: the public creator profile (Step 15b; replaces the Step 15 placeholder from Placeholders.tsx). */
export function PublicCreatorProfilePage() {
  const username = parseHandle(useParams().handle);
  if (!username) return <NotFound />;
  return <CreatorProfile username={username} />;
}

/** `/@username/collection`: the public collection viewer (Step 14b). */
export function PublicCollectionPage() {
  const { handle, collectionSlug } = useParams();
  const username = parseHandle(handle);
  if (!username || !collectionSlug) return <NotFound />;
  return <CollectionView username={username} slug={collectionSlug} />;
}

/** `/@username/collection/module/page`: the public page viewer (Step 14c). Module-qualified on purpose: page slugs are only unique within a module (see lib/paths.ts). */
export function PublicPageViewPage() {
  const { handle, collectionSlug, moduleSlug, pageSlug } = useParams();
  const username = parseHandle(handle);
  if (!username || !collectionSlug || !moduleSlug || !pageSlug) return <NotFound />;
  return <PageView username={username} collectionSlug={collectionSlug} moduleSlug={moduleSlug} pageSlug={pageSlug} />;
}
