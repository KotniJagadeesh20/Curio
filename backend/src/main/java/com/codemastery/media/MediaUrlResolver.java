package com.codemastery.media;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds the public form of media references when a response is built: content stores an {@code assetId}, never a URL. One query
 * per page or per list of collections, never one per image. The URL is site-relative ({@code /api/public/media/{id}}), which
 * {@code UrlRules} already accepts.
 *
 * <p>This resolves; it does not decide visibility. It is called only for content that is already publicly readable (a published page
 * of a readable collection, a listed collection), and it additionally requires the asset to be READY and owned by the collection
 * owner, so a stale or foreign reference can never produce a URL. The URL then works only while {@link PublicMediaService} agrees.
 */
@Component
public class MediaUrlResolver {
    private final MediaAssetRepository assets;

    public MediaUrlResolver(MediaAssetRepository assets) {
        this.assets = assets;
    }

    public static String publicUrl(UUID id) { return "/api/public/media/" + id; }

    public static String publicThumbUrl(UUID id) { return "/api/public/media/" + id + "/thumb"; }

    /**
     * Replaces each image block's {@code assetId} with {@code url}, {@code width} and {@code height}. A block whose asset is missing,
     * not READY or not the owner's is omitted, like any other bad block. Other blocks pass through untouched.
     */
    @Transactional(readOnly = true)
    public List<Map<String, Object>> resolveBlocks(List<Map<String, Object>> blocks, Long ownerId) {
        if (blocks == null) return null;
        Set<UUID> ids = MediaReferenceService.extractAssetIds(blocks);
        if (ids.isEmpty()) return blocks;
        Map<UUID, MediaAsset> byId = new java.util.HashMap<>();
        for (MediaAsset a : assets.findAllById(ids)) byId.put(a.getId(), a);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> b : blocks) {
            if (!(b.get("type") instanceof String t) || !t.equals("image") || !(b.get("assetId") instanceof String raw)) {
                out.add(b);
                continue;
            }
            UUID id = com.codemastery.collection.Patch.canonicalUuid(raw);
            MediaAsset a = id == null ? null : byId.get(id);
            if (a == null || a.getStatus() != MediaStatus.READY || !a.getOwnerId().equals(ownerId)) continue;
            Map<String, Object> resolved = new LinkedHashMap<>();
            for (Map.Entry<String, Object> e : b.entrySet()) {
                if (e.getKey().equals("assetId")) {
                    resolved.put("url", publicUrl(id));
                    resolved.put("width", a.getWidth());
                    resolved.put("height", a.getHeight());
                } else {
                    resolved.put(e.getKey(), e.getValue());
                }
            }
            out.add(resolved);
        }
        return out;
    }

    /** The READY assets (owned by their collection's owner) among these cover ids, by id: one query for a whole result page. */
    @Transactional(readOnly = true)
    public Map<UUID, MediaAsset> coverAssets(Set<UUID> coverIds) {
        Map<UUID, MediaAsset> out = new java.util.HashMap<>();
        if (coverIds.isEmpty()) return out;
        for (MediaAsset a : assets.findAllById(coverIds)) if (a.getStatus() == MediaStatus.READY) out.put(a.getId(), a);
        return out;
    }
}
