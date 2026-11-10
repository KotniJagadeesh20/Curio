package com.codemastery.content;

import com.codemastery.user.User;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

public interface TrackRepository extends JpaRepository<Track, Long> {
    // There is deliberately NO global "findBySlug": slugs are unique per owner only. Creator code uses the
    // owner-scoped methods below; the legacy admin/learning code uses findLegacyBySlug (admin-owned content only).

    boolean existsByOwnerIdAndSlug(Long ownerId, String slug);

    /** True when this collection exists and belongs to the user (no entity is loaded): used to lock the collection row first. */
    @Query("select count(t) > 0 from Track t where t.id = :id and t.owner.id = :ownerId")
    boolean isOwnedBy(Long id, Long ownerId);

    /** Is any collection (including a soft-deleted one) using this asset as its cover? */
    boolean existsByCoverAssetId(java.util.UUID assetId);
    List<Track> findByOwnerIdAndDeletedAtIsNullOrderByPositionAscIdAsc(Long ownerId);
    List<Track> findByOwnerIdAndDeletedAtIsNotNullOrderByDeletedAtDesc(Long ownerId);

    @Query("select coalesce(max(t.position), -1) from Track t where t.owner.id = :ownerId")
    int maxPosition(Long ownerId);

    /**
     * Legacy lookup for the old learning UI and the admin problem form: only content owned by an ADMIN account (or
     * not yet adopted by one), oldest first, so a creator reusing a slug can neither shadow nor break it.
     */
    @Query("select t from Track t left join t.owner o where t.slug = :slug "
         + "and (o is null or o.role = com.codemastery.user.Role.ADMIN) order by t.id")
    List<Track> findLegacyBySlug(String slug);
    List<Track> findAllByOrderByPositionAsc();
    long countByOwnerIsNull();

    /** Gives every ownerless track (seeded content) to {@code owner}. Idempotent; never touches owned rows. */
    @Modifying(clearAutomatically = true)
    @Transactional
    @Query("update Track t set t.owner = :owner where t.owner is null")
    int assignOrphansTo(User owner);

    // ---------- public read API (Step 6) ----------
    /**
     * The public listing rule as a query (mirrors {@link Visibility#collectionListed(Track)}, and is checked against it
     * by a test): PUBLISHED, moderation OK, not deleted, ACTIVE owner, and an EXISTS check for a PUBLISHED page, so no
     * page is loaded. UNLISTED is excluded by construction.
     */
    String LISTED = "t.status = com.codemastery.content.CollectionStatus.PUBLISHED "
            + "and t.moderationStatus = com.codemastery.content.ModerationStatus.OK "
            + "and t.deletedAt is null and o.status = com.codemastery.user.UserStatus.ACTIVE "
            + "and exists (select 1 from Lesson l join l.section s where s.track = t "
            + "and l.status = com.codemastery.content.PageStatus.PUBLISHED)";

    @Query(value = "select t from Track t join fetch t.owner o left join fetch t.category where " + LISTED
            + " and (lower(t.name) like :q escape '!' or lower(t.description) like :q escape '!') order by t.id desc",
           countQuery = "select count(t) from Track t join t.owner o where " + LISTED + " and (lower(t.name) like :q escape '!' or lower(t.description) like :q escape '!')")
    Page<Track> listPublic(String q, Pageable page);

    @Query(value = "select t from Track t join fetch t.owner o left join fetch t.category c where " + LISTED
            + " and c.id = :categoryId and (lower(t.name) like :q escape '!' or lower(t.description) like :q escape '!') order by t.id desc",
           countQuery = "select count(t) from Track t join t.owner o join t.category c where " + LISTED
            + " and c.id = :categoryId and (lower(t.name) like :q escape '!' or lower(t.description) like :q escape '!')")
    Page<Track> listPublicInCategory(Long categoryId, String q, Pageable page);

    /** Owner-scoped public lookup (username + slug). Status rules are applied by the caller through {@link Visibility}. */
    @Query("select t from Track t join fetch t.owner o left join fetch t.category "
         + "where o.username = :username and t.slug = :slug and t.deletedAt is null")
    Optional<Track> findByOwnerUsernameAndSlug(String username, String slug);
}
