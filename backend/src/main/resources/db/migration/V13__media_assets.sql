-- Step 12: media assets (additive only; V1-V12 are untouched). See PLAN.md, Step 12.
--
-- Content refers to media by id only. The storage keys below are server-generated from the id and never contain a
-- user-supplied name. 12a uses media_assets only; media_references and tracks.cover_asset_id are created now because an
-- applied migration can never be edited, and are used from 12b on.

CREATE TABLE media_assets (
    id                UUID                      PRIMARY KEY,
    owner_id          BIGINT                    NOT NULL REFERENCES users (id),
    -- UPLOADING (row reserved, objects being written) -> READY (served, referenceable) -> DELETING (unusable, being removed;
    -- the row is deleted only after both storage objects are confirmed gone)
    status            VARCHAR(16)               NOT NULL,
    -- canonical OUTPUT type (never the client's): image/jpeg or image/png
    content_type      VARCHAR(32)               NOT NULL,
    width             INTEGER                   NOT NULL,
    height            INTEGER                   NOT NULL,
    size_bytes        BIGINT                    NOT NULL,
    sha256            VARCHAR(64)               NOT NULL,
    thumb_width       INTEGER                   NOT NULL,
    thumb_height      INTEGER                   NOT NULL,
    thumb_size_bytes  BIGINT                    NOT NULL,
    thumb_sha256      VARCHAR(64)               NOT NULL,
    storage_key       VARCHAR(255)              NOT NULL,
    thumb_key         VARCHAR(255)              NOT NULL,
    created_at        TIMESTAMP WITH TIME ZONE  NOT NULL DEFAULT now(),
    ready_at          TIMESTAMP WITH TIME ZONE,
    -- grace clock for the orphan purge (12b): set at READY, and again when the last reference is removed
    unreferenced_since TIMESTAMP WITH TIME ZONE,
    delete_attempts   INTEGER                   NOT NULL DEFAULT 0,
    CONSTRAINT media_assets_status_chk CHECK (status IN ('UPLOADING', 'READY', 'DELETING')),
    CONSTRAINT media_assets_type_chk CHECK (content_type IN ('image/jpeg', 'image/png')),
    CONSTRAINT media_assets_sizes_chk CHECK (width > 0 AND height > 0 AND thumb_width > 0 AND thumb_height > 0
                                             AND size_bytes > 0 AND thumb_size_bytes > 0)
);
CREATE INDEX media_assets_owner_idx ON media_assets (owner_id);
CREATE INDEX media_assets_status_idx ON media_assets (status, unreferenced_since);
CREATE INDEX media_assets_status_created_idx ON media_assets (status, created_at);

-- page-block references only (one row per asset-page pair); a collection cover is tracks.cover_asset_id, never a row here
CREATE TABLE media_references (
    asset_id UUID   NOT NULL REFERENCES media_assets (id),
    page_id  BIGINT NOT NULL REFERENCES lessons (id) ON DELETE CASCADE,
    PRIMARY KEY (asset_id, page_id)
);
CREATE INDEX media_references_page_idx ON media_references (page_id);

-- canonical collection-cover reference; RESTRICT (the default) so a referenced asset row can never be deleted
ALTER TABLE tracks ADD COLUMN cover_asset_id UUID REFERENCES media_assets (id);
CREATE INDEX tracks_cover_asset_idx ON tracks (cover_asset_id);
