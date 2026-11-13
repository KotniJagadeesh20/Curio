package com.codemastery.collection;

import com.codemastery.category.CategoryRepository;
import com.codemastery.collection.CollectionDtos.*;
import com.codemastery.config.CodedConflictException;
import com.codemastery.config.UrlPolicy;
import com.codemastery.config.VersionConflictException;
import com.codemastery.content.CollectionStatus;
import com.codemastery.content.ContentAccess;
import com.codemastery.content.Lesson;
import com.codemastery.content.LessonRepository;
import com.codemastery.content.PageStatus;
import com.codemastery.content.Section;
import com.codemastery.content.SectionRepository;
import com.codemastery.content.Track;
import com.codemastery.content.TrackRepository;
import com.codemastery.content.Visibility;
import com.codemastery.media.MediaReferenceService;
import java.util.Set;
import java.util.UUID;
import com.codemastery.security.CurrentUser;
import com.codemastery.user.User;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.BiConsumer;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Creator workspace (PLAN.md Step 5). Every operation on an existing collection, module or page resolves its target
 * through {@link ContentAccess} (ownership comes from the root collection in the database) inside this class's single
 * transaction, so the authorisation and the write can't be separated. New collections are owned by
 * {@link CurrentUser}; no request field can set an owner. All slug lookups are scoped to the owner / parent.
 */
@Service
@Transactional
public class CollectionService {
    /** How long a soft-deleted collection can be restored. */
    public static final Duration RESTORE_WINDOW = Duration.ofDays(30);
    private static final String DELETED_MARK = "~deleted~";
    private static final int MAX_BLOCKS = 500;
    private static final int MAX_BLOCKS_JSON = 500_000;      // sanity cap only; real block validation is Step 11

    private final ContentAccess access;
    private final CurrentUser currentUser;
    private final TrackRepository tracks;
    private final SectionRepository sections;
    private final LessonRepository lessons;
    private final CategoryRepository categories;
    private final ObjectMapper json;
    private final MediaReferenceService media;
    private final com.codemastery.media.MediaAssetRepository assetRepo;
    @jakarta.persistence.PersistenceContext private jakarta.persistence.EntityManager em;

    public CollectionService(ContentAccess access, CurrentUser currentUser, TrackRepository tracks,
                             SectionRepository sections, LessonRepository lessons, CategoryRepository categories,
                             ObjectMapper json, MediaReferenceService media,
                             com.codemastery.media.MediaAssetRepository assetRepo) {
        this.access = access;
        this.currentUser = currentUser;
        this.tracks = tracks;
        this.sections = sections;
        this.lessons = lessons;
        this.categories = categories;
        this.json = json;
        this.media = media;
        this.assetRepo = assetRepo;
    }

    // =====================================================================================================
    // collections
    // =====================================================================================================
    public CollectionSummary create(CollectionCreate r) {
        User me = currentUser.require();
        requireCoverRequest(r.coverUrl(), r.coverAssetId());
        String title = r.title().trim();
        String slug = r.slug() != null
                ? requireFree(r.slug(), tracks.existsByOwnerIdAndSlug(me.getId(), r.slug()))
                : Slugs.unique(title, s -> tracks.existsByOwnerIdAndSlug(me.getId(), s));
        Track t = new Track();
        t.setOwner(me);                                         // always the caller, never from the body
        t.setSlug(slug);
        t.setName(title);
        t.setDescription(r.description() == null ? "" : r.description().trim());
        if (r.coverUrl() != null) t.setCoverUrl(UrlPolicy.httpsOrNull("coverUrl", r.coverUrl().value()));
        if (r.categoryId() != null) t.setCategory(category(r.categoryId()));
        t.setStatus(CollectionStatus.DRAFT);
        t.setPosition(tracks.maxPosition(me.getId()) + 1);
        tracks.saveAndFlush(t);
        // the collection is not visible to anyone else yet, so there is nothing to lock it against; the asset locks are taken inside
        if (r.coverAssetId() != null && !r.coverAssetId().isNull()) media.setCover(t, r.coverAssetId().value());
        return summary(t);
    }

    @Transactional(readOnly = true)
    public List<CollectionSummary> mine(boolean deleted) {
        User me = currentUser.require();
        List<Track> list = deleted
                ? tracks.findByOwnerIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(me.getId())
                : tracks.findByOwnerIdAndDeletedAtIsNullOrderByPositionAscIdAsc(me.getId());
        return list.stream().map(this::summary).toList();
    }

    @Transactional(readOnly = true)
    public CollectionDetail get(Long id) {
        Track t = access.collectionForRead(id);
        return new CollectionDetail(summary(t), t.getSections().stream()
                .sorted(java.util.Comparator.comparingInt(Section::getPosition)).map(this::moduleDto).toList());
    }

    public CollectionSummary update(Long id, CollectionUpdate r) {
        requireCoverRequest(r.coverUrl(), r.coverAssetId());
        lockCollectionIfOwner(id);
        Track t = access.collectionForWrite(id);
        t.setName(r.title().trim());
        if (r.slug() != null && !r.slug().equals(t.getSlug())) {
            requireSlugEditable(t);
            requireFree(r.slug(), tracks.existsByOwnerIdAndSlug(t.getOwner().getId(), r.slug()));
            t.setSlug(r.slug());
        }
        if (r.description() != null) t.setDescription(r.description().trim());
        applyCover(t, r.coverUrl(), r.coverAssetId());
        if (r.categoryId() != null) t.setCategory(category(r.categoryId()));
        tracks.flush();
        return summary(t);
    }

    /**
     * Soft delete: the collection is hidden everywhere, returns to DRAFT (so a restore never republishes by
     * surprise) and its slug is renamed to {@code slug~deleted~<id>} so the slug can be reused (UNIQUE(owner_id, slug)
     * can't be partial on H2). Modules and pages are untouched.
     */
    public void delete(Long id) {
        lockCollectionIfOwner(id);
        Track t = access.collectionForWrite(id);
        String suffix = DELETED_MARK + t.getId();
        String base = t.getSlug().length() + suffix.length() > 80 ? t.getSlug().substring(0, 80 - suffix.length()) : t.getSlug();
        t.setSlug(base + suffix);
        t.setStatus(CollectionStatus.DRAFT);
        t.setDeletedAt(Instant.now());
        tracks.flush();
    }

    /** Owner only, within {@link #RESTORE_WINDOW}; comes back as a DRAFT with its original slug (409 if it was reused). */
    public CollectionSummary restore(Long id) {
        lockCollectionIfOwner(id);
        Track t = access.collectionForRestore(id);
        if (t.getDeletedAt() == null) throw bad("Collection is not deleted");
        if (Instant.now().isAfter(t.getDeletedAt().plus(RESTORE_WINDOW))) {
            throw new ResponseStatusException(HttpStatus.GONE, "The 30-day restore window has passed");
        }
        String original = originalSlug(t.getSlug());
        requireFree(original, tracks.existsByOwnerIdAndSlug(t.getOwner().getId(), original));
        t.setSlug(original);
        t.setDeletedAt(null);
        tracks.flush();
        return summary(t);
    }

    /** DRAFT/PUBLISHED/UNLISTED ⇄ PUBLISHED or UNLISTED. Needs a title and at least one PUBLISHED page; drafts stay drafts. */
    public CollectionSummary publish(Long id, CollectionStatus target) {
        lockCollectionIfOwner(id);
        Track t = access.collectionForWrite(id);
        CollectionStatus status = target == null ? CollectionStatus.PUBLISHED : target;
        if (status == CollectionStatus.DRAFT) throw bad("Use unpublish to return a collection to draft");
        if (t.getName() == null || t.getName().isBlank()) throw bad("A collection needs a title before it can be published");
        if (publishedPages(t) == 0) throw bad("Add at least one published page before publishing this collection");
        t.setStatus(status);
        tracks.flush();
        return summary(t);
    }

    public CollectionSummary unpublish(Long id) {
        lockCollectionIfOwner(id);
        Track t = access.collectionForWrite(id);
        t.setStatus(CollectionStatus.DRAFT);
        tracks.flush();
        return summary(t);
    }

    // =====================================================================================================
    // modules (sections)
    // =====================================================================================================
    public ModuleDto createModule(Long collectionId, ModuleCreate r) {
        lockCollectionIfOwner(collectionId);
        Track t = access.collectionForWrite(collectionId);
        String title = r.title().trim();
        String slug = r.slug() != null
                ? requireFree(r.slug(), sections.existsByTrackIdAndSlug(t.getId(), r.slug()))
                : Slugs.unique(title, s -> sections.existsByTrackIdAndSlug(t.getId(), s));
        Section s = new Section();
        s.setTrack(t);
        s.setSlug(slug);
        s.setTitle(title);
        s.setPosition(t.getSections().stream().mapToInt(Section::getPosition).max().orElse(-1) + 1);
        t.getSections().add(s);
        tracks.flush();
        return moduleDto(s);
    }

    public ModuleDto updateModule(Long id, ModuleUpdate r) {
        lockCollectionOfModule(id);
        Section s = access.moduleForWrite(id);
        Track t = s.getTrack();
        s.setTitle(r.title().trim());
        if (r.slug() != null && !r.slug().equals(s.getSlug())) {
            requireSlugEditable(t);
            requireFree(r.slug(), sections.existsByTrackIdAndSlug(t.getId(), r.slug()));
            s.setSlug(r.slug());
        }
        sections.flush();
        return moduleDto(s);
    }

    /** Hard delete (modules and pages are cheap to recreate; the UI confirms): removes its pages too. */
    public void deleteModule(Long id) {
        lockCollectionOfModule(id);
        Section s = access.moduleForWrite(id);
        // lock order: collection (above) -> module -> its pages (ascending id) -> assets (inside releaseAfter). The candidate assets are
        // collected AFTER the page locks, so a save that committed just before this delete is included; a save that is still waiting
        // finds its page gone afterwards and gets a clean 404.
        List<Lesson> pages = lockSiblings(s);
        Set<UUID> freed = media.assetIdsOfPages(pages.stream().map(Lesson::getId).toList());
        s.getTrack().getSections().remove(s);
        sections.flush();
        media.releaseAfter(freed);
    }

    public ModuleDto reorderModule(Long id, int position) {
        Section s = access.moduleForWrite(id);
        move(s.getTrack().getSections(), s, position, Section::setPosition);
        sections.flush();
        return moduleDto(s);
    }

    // =====================================================================================================
    // pages (lessons)
    // =====================================================================================================
    public PageDto createPage(Long moduleId, PageCreate r) {
        lockCollectionOfModule(moduleId);
        Section s = access.moduleForWrite(moduleId);
        String title = r.title().trim();
        String slug = r.slug() != null
                ? requireFree(r.slug(), lessons.existsBySectionIdAndSlug(s.getId(), r.slug()))
                : Slugs.unique(title, c -> lessons.existsBySectionIdAndSlug(s.getId(), c));
        Lesson l = new Lesson();
        l.setSection(s);
        l.setSlug(slug);
        l.setTitle(title);
        l.setSummary(r.summary() == null ? "" : r.summary().trim());
        l.setStatus(PageStatus.DRAFT);
        // lock order: collection (above) -> module and its pages -> assets. Nothing can be inserted under a module that a concurrent
        // delete holds: that delete holds the collection lock, and after it commits the module is gone (409 below).
        List<Lesson> current = lockSiblings(s);
        MediaReferenceService.BodyLock bodyLock = null;
        if (r.blocks() != null) {
            bodyLock = media.lockForBody(null, r.blocks());
            com.codemastery.blocks.BlockValidator.validate(r.blocks(), null, bodyLock.facts(), s.getTrack().getOwner().getId());
        }
        l.setBlocks(writeBlocks(r.blocks() == null ? List.of() : r.blocks()));
        l.setPosition(current.stream().mapToInt(Lesson::getPosition).max().orElse(-1) + 1);
        s.getLessons().add(l);
        sections.flush();
        if (bodyLock != null) media.applyBody(l.getId(), bodyLock);
        return pageDto(l);
    }

    @Transactional(readOnly = true)
    public PageDto getPage(Long id) {
        return pageDto(access.pageForRead(id));
    }

    /** Row lock + re-read: page writes (save, publish, unpublish, reorder) on the same page run one after another, each on committed state. */
    private void lockFresh(Lesson l) {
        try {
            em.refresh(l, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
        } catch (jakarta.persistence.EntityNotFoundException gone) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Page not found");   // deleted by another request meanwhile
        }
    }

    /**
     * Sibling order is shared state of the module: lock the module row first (so two reorders/creates run one after another),
     * then lock and re-read every page in it so the renumbering starts from committed positions. Lock order is always
     * module -> pages; single-page writes lock only their own row, so there is no cycle.
     */
    private List<Lesson> lockSiblings(Section s) {
        try {
            // module row first (no cascade: a cascading refresh would lock the pages in position order), then the pages in ascending id
            // order, then refresh the module's state; the pages are already locked, so the cascade acquires nothing new
            List<?> row = em.createNativeQuery("select id from sections where id = :id for update").setParameter("id", s.getId()).getResultList();
            if (row.isEmpty()) throw new VersionConflictException();
            // re-query: a page committed by another request is not in the cached collection
            List<Lesson> current = em.createQuery("select l from Lesson l where l.section.id = :sid order by l.id", Lesson.class)
                    .setParameter("sid", s.getId()).setLockMode(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE).getResultList();
            em.refresh(s, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
            for (Lesson sib : current) em.refresh(sib, jakarta.persistence.LockModeType.PESSIMISTIC_WRITE);
            return current;
        } catch (jakarta.persistence.EntityNotFoundException gone) {
            throw new VersionConflictException();   // a page or the module changed under us: the client reloads and retries
        }
    }

    // ---------- collection-first locking (PLAN.md 12b lock hierarchy: collection -> module -> pages -> assets) ----------
    /**
     * Locks the collection row (a fresh {@code FOR UPDATE}, no entity involved) when the caller owns it. It runs BEFORE any entity of
     * this collection is loaded in the transaction, so everything loaded afterwards is the committed state that the previous
     * holder left: a soft delete, module delete or purge that committed first is seen by the {@code ContentAccess} check (404), and a
     * write cannot land under a parent that is being deleted. A caller who does not own the collection takes no lock and is then
     * refused by {@code ContentAccess} exactly as before (403/404).
     */
    private void lockCollectionIfOwner(Long collectionId) {
        User me = currentUser.require();
        if (tracks.isOwnedBy(collectionId, me.getId())) lockCollectionRow(collectionId);
    }

    private void lockCollectionOfModule(Long moduleId) {
        User me = currentUser.require();
        sections.collectionIdOwnedBy(moduleId, me.getId()).ifPresent(this::lockCollectionRow);
    }

    private void lockCollectionOfPage(Long pageId) {
        User me = currentUser.require();
        lessons.collectionIdOwnedBy(pageId, me.getId()).ifPresent(this::lockCollectionRow);
    }

    private void lockCollectionRow(Long collectionId) {
        em.createNativeQuery("select id from tracks where id = :id for update").setParameter("id", collectionId).getResultList();
    }

    // ---------- covers ----------
    /** Request-shape rules for the two cover fields (PLAN.md 12b cover contract); nothing has been read or written yet. */
    private static void requireCoverRequest(Patch<String> url, Patch<UUID> asset) {
        if (url != null && asset != null) throw bad("Send either coverAssetId or coverUrl, not both");
        if (url != null && url.isNull()) throw bad("coverUrl can't be null; send an empty string to clear the cover link");
        if (url != null && url.value().length() > 500) throw bad("coverUrl size must be between 0 and 500");
    }

    /**
     * absent: nothing changes. coverAssetId null: clears the asset cover, leaves the link. coverAssetId value: sets it and clears the
     * link. coverUrl "": clears the link only. coverUrl value: sets the link and clears the asset cover (the old asset is stamped).
     */
    private void applyCover(Track t, Patch<String> url, Patch<UUID> asset) {
        if (asset != null) {
            media.setCover(t, asset.value());                 // value or null (clear)
            if (!asset.isNull()) t.setCoverUrl(null);
        } else if (url != null) {
            String link = UrlPolicy.httpsOrNull("coverUrl", url.value());
            t.setCoverUrl(link);
            if (link != null) media.setCover(t, null);
        }
    }

    public PageDto updatePage(Long id, PageUpdate r) {
        lockCollectionOfPage(id);
        Lesson l = access.pageForWrite(id);
        // Lock the row and re-read it: the draft check and the version check below must see committed state, and a publish that
        // commits after this point waits for this save instead of slipping between the check and the write.
        lockFresh(l);
        Section s = l.getSection();
        // Autosave is a draft-only convenience: it must never change what readers of a live page see.
        if (Boolean.TRUE.equals(r.autosave()) && l.getStatus() == PageStatus.PUBLISHED) {
            throw new CodedConflictException("PAGE_PUBLISHED",
                    "This page is published, so changes are saved only when you press Save. Autosave was not applied.");
        }
        if (r.expectedVersion() != null && r.expectedVersion() != l.getVersion()) throw new VersionConflictException();
        // Data preservation first: decide about the stored body before anything is changed (and an exception rolls back).
        boolean unreadable = storedBlocksUnreadable(l.getBlocks());
        boolean discard = Boolean.TRUE.equals(r.discardUnreadableContent());
        if (discard && Boolean.TRUE.equals(r.autosave())) throw bad("Unreadable content can only be replaced by an explicit Save, never by autosave");
        if (discard && r.blocks() == null) throw bad("discardUnreadableContent needs the replacement blocks in the same request");
        if (discard && !unreadable) throw bad("This page's content is readable, so there is nothing to discard");
        if (r.blocks() != null && unreadable && !discard) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "This page's saved content can't be read, so it was not replaced. "
                    + "Title and summary can still be saved; to start the body over, discard the unreadable content explicitly.");
        }
        l.setTitle(r.title().trim());
        if (r.slug() != null && !r.slug().equals(l.getSlug())) {
            requireSlugEditable(s.getTrack());
            requireFree(r.slug(), lessons.existsBySectionIdAndSlug(s.getId(), r.slug()));
            l.setSlug(r.slug());
        }
        if (r.summary() != null) l.setSummary(r.summary().trim());
        MediaReferenceService.BodyLock bodyLock = null;
        if (r.blocks() != null) {
            // lock order: collection (above) -> page (lockFresh above) -> the union of the assets the page references now and the new
            // body names, sorted. Metadata-only saves never get here, so they never touch references.
            bodyLock = media.lockForBody(l.getId(), r.blocks());
            // validated against what is stored now (unknown blocks and size caps are judged relative to it); nothing is written on failure
            com.codemastery.blocks.BlockValidator.validate(r.blocks(), unreadable ? null : readBlocks(l.getBlocks()), bodyLock.facts(), s.getTrack().getOwner().getId());
            l.setBlocks(writeBlocks(r.blocks()));
        }
        try {
            lessons.flush();          // UPDATE ... WHERE id = ? AND version = ?: atomic against a simultaneous request
        } catch (org.springframework.dao.OptimisticLockingFailureException e) {
            throw new VersionConflictException();   // the whole transaction rolls back; nothing was written
        }
        if (bodyLock != null) media.applyBody(l.getId(), bodyLock);
        return pageDto(l);
    }

    /** DRAFT → PUBLISHED (idempotent). Doesn't touch the collection's own status. */
    public PageDto publishPage(Long id) {
        Lesson l = access.pageForWrite(id);
        lockFresh(l);
        l.setStatus(PageStatus.PUBLISHED);
        lessons.flush();
        return pageDto(l);
    }

    /** PUBLISHED → DRAFT (idempotent). A live collection that loses its last published page stops being publicly visible. */
    public PageDto unpublishPage(Long id) {
        Lesson l = access.pageForWrite(id);
        lockFresh(l);
        l.setStatus(PageStatus.DRAFT);
        lessons.flush();
        return pageDto(l);
    }

    public void deletePage(Long id) {
        lockCollectionOfPage(id);
        Lesson l = access.pageForWrite(id);
        lockFresh(l);
        Set<UUID> freed = media.assetIdsOfPages(List.of(l.getId()));   // after the page lock, before the delete
        l.getSection().getLessons().remove(l);
        sections.flush();
        media.releaseAfter(freed);
    }

    public PageDto reorderPage(Long id, int position) {
        Lesson l = access.pageForWrite(id);
        List<Lesson> current = lockSiblings(l.getSection());
        move(current, l, position, Lesson::setPosition);
        lessons.flush();
        return pageDto(l);
    }

    // =====================================================================================================
    // helpers
    // =====================================================================================================
    private static ResponseStatusException bad(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }

    /** Returns the slug if free, else 409 (the exists-check is the friendly path; the unique index is the backstop). */
    private static String requireFree(String slug, boolean taken) {
        if (taken) throw new ResponseStatusException(HttpStatus.CONFLICT, "Slug already in use");
        return slug;
    }

    /** Slugs appear in shared URLs, so they can only change while the whole collection is still a DRAFT. */
    private static void requireSlugEditable(Track root) {
        if (root.getStatus() != CollectionStatus.DRAFT) {
            throw bad("Slugs can't be changed once a collection is published; unpublish it first");
        }
    }

    private com.codemastery.category.Category category(Long id) {
        return categories.findById(id).orElseThrow(() -> bad("Unknown category"));
    }

    private static String originalSlug(String slug) {
        int i = slug.lastIndexOf(DELETED_MARK);
        return i < 0 ? slug : slug.substring(0, i);
    }

    private static long publishedPages(Track t) {
        return t.getSections().stream().flatMap(s -> s.getLessons().stream())
                .filter(l -> l.getStatus() == PageStatus.PUBLISHED).count();
    }

    /** Moves {@code item} to {@code position} (clamped) among its siblings and renumbers them 0..n-1. */
    private static <T> void move(List<T> siblings, T item, int position, BiConsumer<T, Integer> setPosition) {
        List<T> ordered = new ArrayList<>(siblings);
        ordered.remove(item);
        ordered.add(Math.min(position, ordered.size()), item);
        for (int i = 0; i < ordered.size(); i++) setPosition.accept(ordered.get(i), i);
    }

    /** Sanity limits only (shape + size); the real schema, SVG sanitising and URL rules arrive in Step 11. */
    private String writeBlocks(List<Map<String, Object>> blocks) {
        if (blocks.size() > MAX_BLOCKS) throw bad("A page can have at most " + MAX_BLOCKS + " blocks");
        for (Map<String, Object> b : blocks) {
            Object type = b == null ? null : b.get("type");
            if (!(type instanceof String s) || s.isBlank() || s.length() > 40) throw bad("Every block needs a 'type'");
        }
        try {
            String out = json.writeValueAsString(blocks);
            if (out.length() > MAX_BLOCKS_JSON) throw bad("Page content is too large");
            return out;
        } catch (JsonProcessingException e) {
            throw bad("Invalid blocks");
        }
    }

    /**
     * Stored blocks that can't be interpreted: not JSON (or JSON followed by junk), not an array, or an item that isn't
     * an object with a non-blank string {@code type} (the same rule {@link #writeBlocks} enforces on the way in).
     * {@code null} (legacy) and {@code []} (an empty page) are NOT unreadable. Such a body is never rewritten implicitly
     * and never reported as an empty array.
     */
    private boolean storedBlocksUnreadable(String raw) {
        if (raw == null) return false;
        try {
            com.fasterxml.jackson.databind.JsonNode root = json.readerFor(com.fasterxml.jackson.databind.JsonNode.class)
                    .with(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS).readTree(raw);
            if (root == null || !root.isArray()) return true;
            for (com.fasterxml.jackson.databind.JsonNode b : root) {
                com.fasterxml.jackson.databind.JsonNode type = b.get("type");
                if (!b.isObject() || type == null || !type.isTextual() || type.asText().isBlank()) return true;
            }
            return false;
        } catch (JsonProcessingException e) {
            return true;
        }
    }

    /** Only call for readable content ({@link #storedBlocksUnreadable} false). */
    private List<Map<String, Object>> readBlocks(String raw) {
        if (raw == null) return null;
        try {
            return json.readValue(raw, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("blocks passed the readability check but could not be read", e);
        }
    }

    // ---------- mapping ----------
    private CollectionSummary summary(Track t) {
        long total = t.getSections().stream().mapToLong(s -> s.getLessons().size()).sum();
        long published = publishedPages(t);
        Instant until = t.getDeletedAt() == null ? null : t.getDeletedAt().plus(RESTORE_WINDOW);
        return new CollectionSummary(t.getId(), t.getSlug(), t.getName(), t.getDescription(), t.getCoverUrl(), t.getCoverAssetId(),
                t.getCategory() == null ? null : t.getCategory().getId(), t.getStatus(),
                Visibility.collectionReadable(t),
                t.getModerationStatus() == com.codemastery.content.ModerationStatus.HIDDEN,
                t.getSections().size(), (int) total, (int) published, (int) (total - published),
                t.getDeletedAt(), until);
    }

    private ModuleDto moduleDto(Section s) {
        return new ModuleDto(s.getId(), s.getTrack().getId(), s.getSlug(), s.getTitle(), s.getPosition(),
                s.getLessons().stream().sorted(java.util.Comparator.comparingInt(Lesson::getPosition)).map(l -> new PageSummary(l.getId(), l.getSlug(), l.getTitle(), l.getStatus(), l.getPosition(), hasContent(l))).toList());
    }

    private PageDto pageDto(Lesson l) {
        Section s = l.getSection();
        boolean unreadable = storedBlocksUnreadable(l.getBlocks());
        return new PageDto(l.getId(), s.getId(), s.getTrack().getId(), l.getSlug(), l.getTitle(), l.getSummary(),
                unreadable ? null : readBlocks(l.getBlocks()), l.getStatus(), l.getPosition(), l.getBlocks() == null,
                legacyContent(l), unreadable, l.getVersion(), unreadable ? Map.of() : mediaFacts(readBlocks(l.getBlocks()), s.getTrack().getOwner().getId()));
    }

    /** One query for every uploaded image the page names; assets that aren't READY or aren't the owner's are simply absent. */
    private Map<String, MediaFacts> mediaFacts(List<Map<String, Object>> blocks, Long ownerId) {
        Set<UUID> ids = MediaReferenceService.extractAssetIds(blocks);
        if (ids.isEmpty()) return Map.of();
        Map<String, MediaFacts> out = new java.util.LinkedHashMap<>();
        for (com.codemastery.media.MediaAsset a : assetRepo.findAllById(ids)) {
            if (a.getStatus() == com.codemastery.media.MediaStatus.READY && a.getOwnerId().equals(ownerId)) {
                out.put(a.getId().toString(), new MediaFacts(a.getWidth(), a.getHeight(), a.getContentType()));
            }
        }
        return out;
    }

    private PublicDtos.LegacyContent legacyContent(Lesson l) {
        if (l.getBlocks() != null) return null;
        return new PublicDtos.LegacyContent(nz(l.getConcept()), nz(l.getRealWorld()), stringList(l.getCommonMistakes()),
                stringList(l.getBestPractices()), nz(l.getInterviewRelevance()), l.getCodeLanguage(), l.getCodeExample());
    }

    private static String nz(String s) { return s == null ? "" : s; }

    private List<String> stringList(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        try {
            return json.readValue(raw, new TypeReference<List<String>>() {});
        } catch (JsonProcessingException e) {
            return List.of(raw);                      // keep unparseable legacy text rather than dropping it
        }
    }

    /** The block fields that carry content (an uploaded image carries it in {@code assetId}, found by the 12d integration); a block with none of them filled (or a divider) is not meaningful. */
    private static final List<String> CONTENT_FIELDS = List.of("text", "code", "url", "assetId", "html", "svg");

    /**
     * A table is content when a data cell has text: every row, or every row but the first when {@code hasHeader} is true (a header-only
     * skeleton is not content). A table whose cells can't be read as text is never called empty.
     */
    private static boolean tableHasData(com.fasterxml.jackson.databind.JsonNode table) {
        com.fasterxml.jackson.databind.JsonNode rows = table.get("rows");
        if (rows == null || !rows.isArray()) return true;
        boolean header = table.path("hasHeader").asBoolean(false);
        int first = header ? 1 : 0;
        for (int i = first; i < rows.size(); i++) {
            com.fasterxml.jackson.databind.JsonNode row = rows.get(i);
            if (!row.isArray()) return true;
            for (com.fasterxml.jackson.databind.JsonNode cell : row) {
                if (!cell.isTextual() || !cell.asText().isBlank()) return true;
            }
        }
        return false;
    }

    /** See {@link PageSummary}. Cheap: the blocks column is already loaded with the page. */
    private boolean hasContent(Lesson l) {
        String raw = l.getBlocks();
        if (raw == null) {
            return !nz(l.getConcept()).isBlank() || !nz(l.getRealWorld()).isBlank() || !nz(l.getInterviewRelevance()).isBlank()
                    || !nz(l.getCodeExample()).isBlank() || !stringList(l.getCommonMistakes()).isEmpty()
                    || !stringList(l.getBestPractices()).isEmpty();
        }
        if (storedBlocksUnreadable(raw)) return true;      // never claim "empty" for content we can't interpret
        try {
            com.fasterxml.jackson.databind.JsonNode root = json.readTree(raw);
            if (root == null || !root.isArray()) return true;
            for (com.fasterxml.jackson.databind.JsonNode b : root) {
                for (String f : CONTENT_FIELDS) {
                    com.fasterxml.jackson.databind.JsonNode v = b.get(f);
                    if (v != null && v.isTextual() && !v.asText().isBlank()) return true;
                }
                String type = b.path("type").asText("");
                if (type.equals("table")) {       // Step 13: a table's content is in its cells; the header row is not data
                    if (tableHasData(b)) return true;
                    continue;
                }
                // a block of a type this version doesn't know may carry its content in other fields: don't call it empty
                if (!com.codemastery.blocks.BlockRules.isKnown(type)) return true;
            }
            return false;
        } catch (JsonProcessingException e) {
            return true;
        }
    }
}
