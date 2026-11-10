package com.codemastery.collection;

import com.codemastery.content.CollectionStatus;
import com.codemastery.content.PageStatus;
import jakarta.validation.constraints.*;
import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Creator API shapes. Request records are STRICT (see {@code StrictCreatorJson}): a field the endpoint doesn't accept
 * (ownerId, moderationStatus, status on a collection...) is a 400, never silently ignored.
 */
public class CollectionDtos {
    static final String SLUG = "^[a-z0-9]+(-[a-z0-9]+)*$";

    // ---------- responses ----------
    /**
     * {@code hasContent}: the page has meaningful body content. False for no blocks, {@code []}, or blocks that are all
     * blank (an empty heading/text, a lone divider, a caption with no media). A legacy page counts when any of its old
     * fields is filled. When the stored JSON can't be read it is reported as true: never claim "empty" for data we
     * couldn't inspect.
     */
    public record PageSummary(Long id, String slug, String title, PageStatus status, int position, boolean hasContent) {}

    public record ModuleDto(Long id, Long collectionId, String slug, String title, int position, List<PageSummary> pages) {}

    /**
     * {@code legacy} = the page has never been saved with blocks ({@code blocks} is null). Then {@code legacyContent}
     * carries the old structured fields (what readers still see) so the editor can offer an explicit conversion; it is
     * null for every page that has blocks. Opening or reading a page never changes it.
     *
     * <p>Stored blocks are one of three things, and they are never confused: {@code null} (legacy, never saved with
     * blocks: {@code legacy=true}), a valid array (possibly empty: {@code blocks=[]}), or <b>unreadable</b> (not JSON,
     * not an array, or an item that isn't an object with a string {@code type}): then {@code blocks} is null,
     * {@code legacy} is false and {@code blocksUnreadable} is true. An unreadable body is left exactly as stored.
     */
    public record PageDto(Long id, Long moduleId, Long collectionId, String slug, String title, String summary,
                          List<Map<String, Object>> blocks, PageStatus status, int position, boolean legacy,
                          PublicDtos.LegacyContent legacyContent, boolean blocksUnreadable,
                          /** Content version for optimistic concurrency: send it back as {@code expectedVersion}. */
                          int version,
                          /**
                           * Facts about the uploaded images this page's blocks name, keyed by {@code assetId} (only READY assets of this
                           * owner). A side map, not fields on the blocks, so a block round-trips through GET and PUT unchanged. Never a URL:
                           * the editor fetches the image through the authenticated owner route.
                           */
                          Map<String, MediaFacts> media) {}

    public record MediaFacts(int width, int height, String contentType) {}

    public record CollectionSummary(Long id, String slug, String title, String description, String coverUrl,
                                    /** The uploaded-image cover (12b), or null. At most one of this and {@code coverUrl} is set. */
                                    java.util.UUID coverAssetId,
                                    Long categoryId, CollectionStatus status, boolean publiclyVisible, boolean hiddenByModeration,
                                    int moduleCount, int pageCount, int publishedPageCount, int draftPageCount,
                                    Instant deletedAt, Instant restorableUntil) {}

    /**
     * {@code draftPageCount} is the "N draft pages not visible" figure for the editor. {@code publiclyVisible} is false
     * for a PUBLISHED/UNLISTED collection that has no published page (or is hidden, deleted, owner suspended).
     */
    public record CollectionDetail(CollectionSummary collection, List<ModuleDto> modules) {}

    // ---------- requests ----------
    public record CollectionCreate(
            @NotBlank @Size(max = 160) String title,
            @Pattern(regexp = SLUG) @Size(max = Slugs.MAX) String slug,
            @Size(max = 5000) String description,
            @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = Patch.OfString.class) Patch<String> coverUrl,
            @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = Patch.OfUuid.class) Patch<java.util.UUID> coverAssetId,
            Long categoryId) {}

    /** Full replace of the title; every other field is optional and "omitted = unchanged" ("" clears description/cover). */
    public record CollectionUpdate(
            @NotBlank @Size(max = 160) String title,
            @Pattern(regexp = SLUG) @Size(max = Slugs.MAX) String slug,
            @Size(max = 5000) String description,
            @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = Patch.OfString.class) Patch<String> coverUrl,
            @com.fasterxml.jackson.databind.annotation.JsonDeserialize(using = Patch.OfUuid.class) Patch<java.util.UUID> coverAssetId,
            Long categoryId) {}

    /** Body is optional; {@code status} is PUBLISHED (default) or UNLISTED. */
    public record PublishRequest(CollectionStatus status) {}

    public record ModuleCreate(
            @NotBlank @Size(max = 160) String title,
            @Pattern(regexp = SLUG) @Size(max = Slugs.MAX) String slug) {}

    public record ModuleUpdate(
            @NotBlank @Size(max = 160) String title,
            @Pattern(regexp = SLUG) @Size(max = Slugs.MAX) String slug) {}

    /** A new page is always a DRAFT (publish it with {@code POST /api/pages/{id}/publish}); omitted blocks = empty page. */
    public record PageCreate(
            @NotBlank @Size(max = 200) String title,
            @Pattern(regexp = SLUG) @Size(max = Slugs.MAX) String slug,
            @Size(max = 2000) String summary,
            List<Map<String, Object>> blocks) {}

    /** Title required; slug, summary and blocks are optional and "omitted = unchanged" ([] clears the blocks). Updating never changes the page's status. */
    public record PageUpdate(
            @NotBlank @Size(max = 200) String title,
            @Pattern(regexp = SLUG) @Size(max = Slugs.MAX) String slug,
            @Size(max = 2000) String summary,
            List<Map<String, Object>> blocks,
            /**
             * Explicit recovery for a page whose stored blocks are unreadable ({@code PageDto.blocksUnreadable}): without
             * it such a page refuses a block replacement (409) so its content can never be overwritten by accident. Only
             * valid together with {@code blocks}, and only while the stored content really is unreadable (else 400).
             */
            Boolean discardUnreadableContent,
            /**
             * The {@code PageDto.version} the editor last saw. If the page has changed since, the update is refused with
             * 409 {@code code: VERSION_CONFLICT} and nothing is written. Omitted = last write wins (older clients).
             */
            @PositiveOrZero Integer expectedVersion,
            /** Set by the editor's autosave only: refused with 409 {@code code: PAGE_PUBLISHED} when the page is live. */
            Boolean autosave) {}

    /** Zero-based position among the siblings; out-of-range values are clamped to the end. */
    public record Reorder(@NotNull @PositiveOrZero Integer position) {}
}
