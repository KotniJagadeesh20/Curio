package com.codemastery.content;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface LessonRepository extends JpaRepository<Lesson, Long> {
    boolean existsBySectionIdAndSlug(Long sectionId, String slug);

    /** The id of the collection that owns this page, only if {@code ownerId} owns it (scalar: no entity is loaded). */
    @Query("select s.track.id from Lesson l join l.section s where l.id = :id and s.track.owner.id = :ownerId")
    java.util.Optional<Long> collectionIdOwnedBy(Long id, Long ownerId);

    /** Legacy public lookup: admin-owned (or not yet adopted) tracks only, see TrackRepository.findLegacyBySlug. */
    @Query("select l from Lesson l join fetch l.section s join fetch s.track t left join t.owner o "
         + "where t.slug = :trackSlug and l.slug = :lessonSlug "
         + "and (o is null or o.role = com.codemastery.user.Role.ADMIN) order by s.position, l.position")
    List<Lesson> findByTrackAndSlug(String trackSlug, String lessonSlug);

    // ---------- public read API (Step 6) ----------
    /** Outline of a collection: PUBLISHED pages only, hence only modules that have one. No blocks are loaded. */
    @Query("select new com.codemastery.content.PublishedPageRow(s.id, s.slug, s.title, s.position, "
         + "l.slug, l.title, l.summary, l.position) from Lesson l join l.section s "
         + "where s.track.id = :collectionId and l.status = com.codemastery.content.PageStatus.PUBLISHED "
         + "order by s.position, s.id, l.position, l.id")
    List<PublishedPageRow> publishedOutline(Long collectionId);

    @Query("select new com.codemastery.content.PublishedCountRow(s.track.id, count(distinct s.id), count(l.id)) "
         + "from Lesson l join l.section s where s.track.id in :collectionIds "
         + "and l.status = com.codemastery.content.PageStatus.PUBLISHED group by s.track.id")
    List<PublishedCountRow> publishedCounts(java.util.Collection<Long> collectionIds);

    /**
     * One published page, owner-scoped, with the collection-level rules in the query. The caller re-checks it with
     * {@link Visibility#pageReadable(Lesson)}. {@code moduleSlug} is optional through the second variant.
     */
    String PAGE_BASE = "select l from Lesson l join fetch l.section s join fetch s.track t join fetch t.owner o "
         + "where o.username = :username and t.slug = :collectionSlug and l.slug = :pageSlug "
         + "and l.status = com.codemastery.content.PageStatus.PUBLISHED "
         + "and t.status in (com.codemastery.content.CollectionStatus.PUBLISHED, com.codemastery.content.CollectionStatus.UNLISTED) "
         + "and t.moderationStatus = com.codemastery.content.ModerationStatus.OK "
         + "and t.deletedAt is null and o.status = com.codemastery.user.UserStatus.ACTIVE";

    @Query(PAGE_BASE + " and s.slug = :moduleSlug order by s.position, s.id, l.position, l.id")
    List<Lesson> findPublicPage(String username, String collectionSlug, String moduleSlug, String pageSlug);

    /** Without a module slug a page slug can occur in several modules: the caller takes the first in reading order. */
    @Query(PAGE_BASE + " order by s.position, s.id, l.position, l.id")
    List<Lesson> findPublicPageInCollection(String username, String collectionSlug, String pageSlug);
}
