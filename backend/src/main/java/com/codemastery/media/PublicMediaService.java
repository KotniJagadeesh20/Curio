package com.codemastery.media;

import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Anonymous media serving. The decision order is fixed: parse the id, then PUBLIC VISIBILITY, then the conditional request, then the
 * bytes. Visibility always comes first, so a revoked asset answers 404 even to a client holding a valid ETag, never 304.
 * Every refusal (malformed id, unknown, draft, hidden, deleted, suspended owner, not READY, other owner's) is the same 404.
 */
@Service
public class PublicMediaService {
    private static final Logger log = LoggerFactory.getLogger(PublicMediaService.class);

    private final MediaAssetRepository assets;
    private final MediaStorage storage;

    public PublicMediaService(MediaAssetRepository assets, MediaStorage storage) {
        this.assets = assets;
        this.storage = storage;
    }

    public sealed interface Result permits NotModified, Served {}

    /** @param etag the quoted strong ETag */
    public record NotModified(String etag) implements Result {}

    public record Served(InputStream stream, String contentType, long length, String etag) implements Result {}

    @Transactional(readOnly = true)
    public MediaAsset servable(UUID id) {
        return assets.findPubliclyServable(id).orElseThrow(MediaException::notFound);
    }

    public Result open(String rawId, boolean thumb, String ifNoneMatch) {
        UUID id = com.codemastery.collection.Patch.canonicalUuid(rawId == null ? null : rawId.toLowerCase(java.util.Locale.ROOT));
        if (id == null) throw MediaException.notFound();
        MediaAsset a = servable(id);                                             // 404 unless publicly readable
        String sha = thumb ? a.getThumbSha256() : a.getSha256();
        String etag = "\"" + sha + "\"";
        if (EntityTags.ifNoneMatchMatches(ifNoneMatch, sha)) return new NotModified(etag);
        String key = thumb ? a.getThumbKey() : a.getStorageKey();
        try {
            return new Served(storage.open(key), a.getContentType(), thumb ? a.getThumbSizeBytes() : a.getSizeBytes(), etag);
        } catch (IOException e) {
            log.error("media {} is READY and public but its object {} cannot be read: {}", id, key, e.toString());
            throw MediaException.notFound();
        }
    }
}
