import { Component, useCallback, useMemo, useState, type ReactNode } from "react";
import { BlockRenderer } from "@/components/editor/BlockRenderer";
import { NoContent } from "@/components/public/NotAvailable";
import { legacyToBlocks } from "@/lib/blocks";
import { sanitizeLegacy, sanitizePublicBlocks } from "@/lib/publicBlocks";
import type { PublicPageView } from "@/lib/types";

/**
 * Last-resort guard around ONE public block: if it still throws while rendering (field validation is the primary
 * defense, see sanitizePublicBlocks), that block renders nothing and its neighbors stay on the page.
 */
class BlockBoundary extends Component<{ onFail: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFail(); }
  render() { return this.state.failed ? null : this.props.children; }
}

/**
 * A published page's content through the one renderer, in public mode. Blocks are validated first (public only; stored
 * content and the editor's normalization are never touched). Legacy pages (`blocks: null`) go through `legacyToBlocks`
 * and the same validation. Nothing renderable → the neutral "No content is available to display." message.
 * Mount it with a `key` per page so a block that failed on one page doesn't stay hidden on the next.
 */
export function PublicBlocks({ page }: { page: Pick<PublicPageView["page"], "blocks" | "legacy"> }) {
  const blocks = useMemo(() => {
    if (page.blocks !== null && page.blocks !== undefined) return sanitizePublicBlocks(page.blocks);
    return page.legacy ? sanitizePublicBlocks(legacyToBlocks(sanitizeLegacy(page.legacy))) : [];
  }, [page.blocks, page.legacy]);
  const [failed, setFailed] = useState(0);
  const onFail = useCallback(() => setFailed((n) => n + 1), []);

  if (blocks.length === 0 || failed >= blocks.length) return <NoContent />;
  return (
    <div className="space-y-8" data-testid="public-blocks">
      {blocks.map((b) => (
        <BlockBoundary key={b.id} onFail={onFail}>
          {/* a scroll-restoration anchor per block (Step 14d-3); the id is stable across visits of the same content */}
          <div data-scroll-anchor={`block-${b.id}`}><BlockRenderer blocks={[b]} mode="public" /></div>
        </BlockBoundary>
      ))}
    </div>
  );
}
