-- Optimistic concurrency for the page editor: bumped by Hibernate on every content change (title, slug, summary, blocks).
-- Publish/unpublish and reordering do not bump it (see @OptimisticLock on Lesson), so an open editor stays valid across them.
ALTER TABLE lessons ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
