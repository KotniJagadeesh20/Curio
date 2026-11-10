package com.codemastery.collection;

import java.util.List;
import java.util.Map;

/**
 * Anonymous, slug-based read shapes (Step 6). Deliberately contains no ids, no owner id or email, no status,
 * moderation or deletion fields and no draft counts: a reader can't tell a hidden collection from a missing one.
 */
public class PublicDtos {
    /** Only what a byline needs. Shown whatever the creator's profile visibility is (it is independent). */
    public record CreatorRef(String username, String displayName) {}

    public record CategoryRef(String slug, String name) {}

    /** Counts cover published content only: modules that have a published page, and published pages. */
    public record PublicCollectionSummary(String slug, String title, String description, String coverUrl,
                                          /** Card-size cover for an uploaded image, else null (a legacy link has no thumbnail). */
                                          String coverThumbUrl,
                                          CategoryRef category, CreatorRef creator, int moduleCount, int pageCount) {}

    public record PublicPageSummary(String slug, String title, String summary, int position) {}

    public record PublicModule(String slug, String title, int position, List<PublicPageSummary> pages) {}

    /** {@code unlisted}: reachable by direct link only (clients should not index it). */
    public record PublicCollectionDetail(PublicCollectionSummary collection, boolean unlisted, List<PublicModule> modules) {}

    public record CollectionRef(String slug, String title, CreatorRef creator, boolean unlisted) {}

    public record ModuleRef(String slug, String title) {}

    /** Old seeded pages (no blocks) keep their structured fields until Step 19 converts them. */
    public record LegacyContent(String concept, String realWorld, List<String> commonMistakes, List<String> bestPractices,
                                String interviewRelevance, String codeLanguage, String codeExample) {}

    public record PublicPage(String slug, String title, String summary, List<Map<String, Object>> blocks, LegacyContent legacy) {}

    public record PublicPageView(CollectionRef collection, ModuleRef module, PublicPage page) {}

    public record PagedResult<T>(List<T> items, int page, int size, long totalItems, int totalPages) {}
}
