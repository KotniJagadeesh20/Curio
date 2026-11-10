package com.codemastery.media;

import java.util.UUID;

public final class MediaDtos {
    private MediaDtos() {}

    public record Thumb(int width, int height, long size) {}

    /** One place an asset is used (409 {@code MEDIA_IN_USE}): a page block or a collection cover; {@code inTrash} = the collection is soft-deleted. */
    public record Usage(String kind, Long collectionId, String collectionTitle, Long pageId, String pageTitle, boolean inTrash) {}

    /** The upload response: the new asset's id and metadata. No URL: content refers to the id, URLs are built when responses are. */
    public record MediaAssetDto(UUID id, String contentType, int width, int height, long size, Thumb thumb) {
        static MediaAssetDto of(MediaAsset a) {
            return new MediaAssetDto(a.getId(), a.getContentType(), a.getWidth(), a.getHeight(), a.getSizeBytes(),
                    new Thumb(a.getThumbWidth(), a.getThumbHeight(), a.getThumbSizeBytes()));
        }
    }
}
