package com.codemastery.media;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;
import lombok.Getter;

/**
 * One page-block reference (V13 {@code media_references}): one row per asset-page pair, however many times the image appears on the
 * page. Written only by {@link MediaReferenceService}. A collection cover is {@code tracks.cover_asset_id}, never a row here.
 */
@Entity
@Table(name = "media_references")
@IdClass(MediaReference.Key.class)
@Getter
public class MediaReference {
    @Id
    @Column(name = "asset_id", nullable = false, updatable = false)
    private UUID assetId;

    @Id
    @Column(name = "page_id", nullable = false, updatable = false)
    private Long pageId;

    protected MediaReference() {}

    MediaReference(UUID assetId, Long pageId) {
        this.assetId = assetId;
        this.pageId = pageId;
    }

    public static class Key implements Serializable {
        private UUID assetId;
        private Long pageId;

        public Key() {}

        @Override public boolean equals(Object o) {
            return o instanceof Key k && Objects.equals(assetId, k.assetId) && Objects.equals(pageId, k.pageId);
        }

        @Override public int hashCode() { return Objects.hash(assetId, pageId); }
    }
}
