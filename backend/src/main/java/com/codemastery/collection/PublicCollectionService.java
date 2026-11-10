package com.codemastery.collection;

import com.codemastery.category.Category;
import com.codemastery.category.CategoryRepository;
import com.codemastery.collection.PublicDtos.*;
import com.codemastery.content.*;
import com.codemastery.user.User;
import com.codemastery.user.UserProfile;
import com.codemastery.user.UserProfileRepository;
import com.codemastery.user.UsernamePolicy;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.util.stream.Collectors;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Anonymous public reads (PLAN.md Step 6). Nothing here looks at who is calling: the result is the same for a
 * stranger, the owner and an admin (owners preview drafts through the creator API).
 *
 * <p>Every lookup is scoped by creator username + slug (never a global slug). The visibility rule lives in
 * {@link Visibility}; the list and page queries repeat its status part in JPQL (with EXISTS for "has a published
 * page") so nothing is loaded just to be discarded, and the loaded entity is re-checked with {@link Visibility}.
 * Every miss (unknown, draft, hidden, deleted, suspended owner, empty) is the same 404, so existence isn't revealed.
 */
@Service
@Transactional(readOnly = true)
public class PublicCollectionService {
    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 50;

    private final TrackRepository tracks;
    private final LessonRepository lessons;
    private final CategoryRepository categories;
    private final UserProfileRepository profiles;
    private final ObjectMapper json;
    private final com.codemastery.media.MediaUrlResolver mediaUrls;

    public PublicCollectionService(TrackRepository tracks, LessonRepository lessons, CategoryRepository categories,
                                   UserProfileRepository profiles, ObjectMapper json, com.codemastery.media.MediaUrlResolver mediaUrls) {
        this.tracks = tracks;
        this.lessons = lessons;
        this.categories = categories;
        this.profiles = profiles;
        this.json = json;
        this.mediaUrls = mediaUrls;
    }

    // ---------- listing ----------
    public PagedResult<PublicCollectionSummary> list(String categorySlug, String q, Integer page, Integer size) {
        int p = page == null ? 0 : Math.max(0, page);
        int sz = size == null ? DEFAULT_SIZE : Math.min(MAX_SIZE, Math.max(1, size));
        PageRequest req = PageRequest.of(p, sz);
        String pattern = likePattern(q);
        Page<Track> result;
        if (categorySlug == null || categorySlug.isBlank()) {
            result = tracks.listPublic(pattern, req);
        } else {
            Optional<Category> c = categories.findBySlug(categorySlug.trim().toLowerCase(Locale.ROOT));
            if (c.isEmpty()) return new PagedResult<>(List.of(), p, sz, 0, 0);
            result = tracks.listPublicInCategory(c.get().getId(), pattern, req);
        }
        List<Track> rows = result.getContent();
        Map<Long, PublishedCountRow> counts = rows.isEmpty() ? Map.of()
                : lessons.publishedCounts(rows.stream().map(Track::getId).toList()).stream()
                        .collect(Collectors.toMap(PublishedCountRow::collectionId, r -> r));
        Map<Long, String> names = displayNames(rows);
        Map<UUID, com.codemastery.media.MediaAsset> covers = coverAssets(rows);
        List<PublicCollectionSummary> items = rows.stream().map(t -> {
            PublishedCountRow c = counts.get(t.getId());
            return summary(t, names, covers, c == null ? 0 : (int) c.moduleCount(), c == null ? 0 : (int) c.pageCount());
        }).toList();
        return new PagedResult<>(items, p, sz, result.getTotalElements(), result.getTotalPages());
    }

    // ---------- collection detail ----------
    public PublicCollectionDetail collection(String username, String slug) {
        Track t = readable(username, slug);
        List<PublishedPageRow> outline = lessons.publishedOutline(t.getId());
        if (outline.isEmpty()) throw notFound(); // a collection with no published page is never public
        Map<Long, List<PublishedPageRow>> byModule = new LinkedHashMap<>();
        for (PublishedPageRow r : outline) byModule.computeIfAbsent(r.moduleId(), k -> new ArrayList<>()).add(r);
        List<PublicModule> modules = byModule.values().stream().map(rs -> new PublicModule(
                rs.get(0).moduleSlug(), rs.get(0).moduleTitle(), rs.get(0).modulePosition(),
                rs.stream().map(r -> new PublicPageSummary(r.pageSlug(), r.pageTitle(), r.pageSummary(), r.pagePosition())).toList()))
                .toList();
        return new PublicCollectionDetail(summary(t, displayNames(List.of(t)), coverAssets(List.of(t)), modules.size(), outline.size()),
                t.getStatus() == CollectionStatus.UNLISTED, modules);
    }

    // ---------- page ----------
    public PublicPageView page(String username, String collectionSlug, String moduleSlug, String pageSlug) {
        String u = UsernamePolicy.normalize(username);
        List<Lesson> found = moduleSlug == null
                ? lessons.findPublicPageInCollection(u, collectionSlug, pageSlug)
                : lessons.findPublicPage(u, collectionSlug, moduleSlug, pageSlug);
        Lesson l = found.stream().filter(Visibility::pageReadable).findFirst().orElseThrow(PublicCollectionService::notFound);
        Section s = l.getSection();
        Track t = s.getTrack();
        CollectionRef ref = new CollectionRef(t.getSlug(), t.getName(), creator(t.getOwner(), displayNames(List.of(t))),
                t.getStatus() == CollectionStatus.UNLISTED);
        // READ boundary: stored blocks are projected through BlockSanitizer (unsafe ones omitted, the row is never changed)
        List<Map<String, Object>> blocks = l.getBlocks() == null ? null
                : com.codemastery.blocks.BlockSanitizer.project(parse(l.getBlocks(), new TypeReference<List<Map<String, Object>>>() {}));
        // uploaded images: assetId -> public url/width/height (one query); an image that can't be served is omitted like any bad block
        blocks = mediaUrls.resolveBlocks(blocks, t.getOwner().getId());
        LegacyContent legacy = l.getBlocks() != null ? null : new LegacyContent(l.getConcept(), l.getRealWorld(),
                parse(l.getCommonMistakes(), new TypeReference<List<String>>() {}),
                parse(l.getBestPractices(), new TypeReference<List<String>>() {}),
                l.getInterviewRelevance(), l.getCodeLanguage(), l.getCodeExample());
        return new PublicPageView(ref, new ModuleRef(s.getSlug(), s.getTitle()),
                new PublicPage(l.getSlug(), l.getTitle(), l.getSummary(), blocks, legacy));
    }

    // ---------- helpers ----------
    /** Owner-scoped lookup + the status part of the visibility rule (the published-page part is the outline check). */
    private Track readable(String username, String slug) {
        return tracks.findByOwnerUsernameAndSlug(UsernamePolicy.normalize(username), slug)
                .filter(Visibility::readableByStatus).orElseThrow(PublicCollectionService::notFound);
    }

    /** One query for the uploaded covers of a whole result page. */
    private Map<UUID, com.codemastery.media.MediaAsset> coverAssets(List<Track> rows) {
        Set<UUID> ids = rows.stream().map(Track::getCoverAssetId).filter(java.util.Objects::nonNull).collect(Collectors.toSet());
        return mediaUrls.coverAssets(ids);
    }

    private PublicCollectionSummary summary(Track t, Map<Long, String> names, Map<UUID, com.codemastery.media.MediaAsset> covers, int modules, int pages) {
        Category c = t.getCategory();
        // an uploaded cover wins; it must be READY and the owner's (the same rule the public media route applies), else the legacy link
        com.codemastery.media.MediaAsset cover = t.getCoverAssetId() == null ? null : covers.get(t.getCoverAssetId());
        boolean uploaded = cover != null && cover.getOwnerId().equals(t.getOwner().getId());
        String coverUrl = uploaded ? com.codemastery.media.MediaUrlResolver.publicUrl(cover.getId()) : t.getCoverUrl();
        String coverThumbUrl = uploaded ? com.codemastery.media.MediaUrlResolver.publicThumbUrl(cover.getId()) : null;
        return new PublicCollectionSummary(t.getSlug(), t.getName(), t.getDescription(), coverUrl, coverThumbUrl,
                c == null ? null : new CategoryRef(c.getSlug(), c.getName()), creator(t.getOwner(), names), modules, pages);
    }

    private static CreatorRef creator(User owner, Map<Long, String> names) {
        return new CreatorRef(owner.getUsername(), names.getOrDefault(owner.getId(), owner.getUsername()));
    }

    /** One query for all display names of a result page. The profile's own visibility is deliberately not consulted. */
    private Map<Long, String> displayNames(List<Track> rows) {
        Set<Long> ids = rows.stream().map(t -> t.getOwner().getId()).collect(Collectors.toSet());
        return ids.isEmpty() ? Map.of() : profiles.findAllById(ids).stream()
                .collect(Collectors.toMap(UserProfile::getUserId, UserProfile::getDisplayName));
    }

    /** Lower-cased substring pattern with LIKE wildcards escaped (escape char '!'). Blank = match all. */
    static String likePattern(String q) {
        if (q == null || q.isBlank()) return "%";
        String s = q.strip().toLowerCase(Locale.ROOT);
        if (s.length() > 100) s = s.substring(0, 100);
        return "%" + s.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
    }

    private <T> T parse(String raw, TypeReference<T> type) {
        try {
            return json.readValue(raw == null || raw.isBlank() ? "[]" : raw, type);
        } catch (JsonProcessingException e) {
            return json.convertValue(List.of(), type);
        }
    }

    private static ResponseStatusException notFound() {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, "Not found");
    }
}
