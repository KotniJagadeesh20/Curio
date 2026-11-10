package com.codemastery.media;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaAssetRepository extends JpaRepository<MediaAsset, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select m from MediaAsset m where m.id = :id")
    Optional<MediaAsset> lockById(@Param("id") UUID id);

    /** Quota usage: every row counts, whatever its status, until the row is deleted. */
    @Query("select count(m) from MediaAsset m where m.ownerId = :owner")
    long countByOwner(@Param("owner") Long owner);

    /** Actual stored output bytes: original plus thumbnail. */
    @Query("select coalesce(sum(m.sizeBytes + m.thumbSizeBytes), 0) from MediaAsset m where m.ownerId = :owner")
    long storedBytesByOwner(@Param("owner") Long owner);

    @Query("select m.id from MediaAsset m where m.status = :status and m.createdAt < :before order by m.id")
    List<UUID> idsByStatusCreatedBefore(@Param("status") MediaStatus status, @Param("before") Instant before, Pageable page);

    @Query("select m.id from MediaAsset m where m.status = :status order by m.id")
    List<UUID> idsByStatus(@Param("status") MediaStatus status, Pageable page);

    @Query("select m.id from MediaAsset m where m.status = :status and m.id > :after order by m.id")
    List<UUID> idsByStatusAfter(@Param("status") MediaStatus status, @Param("after") UUID after, Pageable page);

    // ---- orphan sweep candidates (ADVISORY: the authoritative checks are made under the asset lock, see MediaTx) ----
    String UNREFERENCED = "not exists (select 1 from MediaReference r where r.assetId = m.id) "
            + "and not exists (select 1 from Track t where t.coverAssetId = m.id)";

    @Query("select m.id from MediaAsset m where m.status = com.codemastery.media.MediaStatus.READY and m.unreferencedSince is null and " + UNREFERENCED + " order by m.id")
    List<UUID> unstampedOrphanIds(Pageable page);

    @Query("select m.id from MediaAsset m where m.status = com.codemastery.media.MediaStatus.READY and m.unreferencedSince is null and m.id > :after and " + UNREFERENCED + " order by m.id")
    List<UUID> unstampedOrphanIdsAfter(@Param("after") UUID after, Pageable page);

    @Query("select m.id from MediaAsset m where m.status = com.codemastery.media.MediaStatus.READY and m.unreferencedSince < :before and " + UNREFERENCED + " order by m.id")
    List<UUID> staleOrphanIds(@Param("before") Instant before, Pageable page);

    @Query("select m.id from MediaAsset m where m.status = com.codemastery.media.MediaStatus.READY and m.unreferencedSince < :before and m.id > :after and " + UNREFERENCED + " order by m.id")
    List<UUID> staleOrphanIdsAfter(@Param("before") Instant before, @Param("after") UUID after, Pageable page);

    /**
     * The public serving rule as ONE query (PLAN.md 12b "Public serving"): the asset is READY and is genuinely readable through a
     * published page or a collection cover. Mirrors {@code Visibility} (a parity test runs the whole matrix through both) plus one
     * media-only rule: the asset's owner must be the collection's owner. A null collection owner (legacy rows) therefore never serves
     * media. Anything else is the same 404 as an unknown id.
     */
    String COLLECTION_READABLE = "t.status in (com.codemastery.content.CollectionStatus.PUBLISHED, com.codemastery.content.CollectionStatus.UNLISTED) "
            + "and t.moderationStatus = com.codemastery.content.ModerationStatus.OK and t.deletedAt is null "
            + "and o.status <> com.codemastery.user.UserStatus.SUSPENDED and o.id = a.ownerId";

    @Query("select a from MediaAsset a where a.id = :id and a.status = com.codemastery.media.MediaStatus.READY and ("
         + " exists (select 1 from MediaReference r, Lesson l join l.section s join s.track t join t.owner o "
         + "   where r.assetId = a.id and l.id = r.pageId and l.status = com.codemastery.content.PageStatus.PUBLISHED and " + COLLECTION_READABLE + ")"
         + " or exists (select 1 from Track t join t.owner o where t.coverAssetId = a.id and " + COLLECTION_READABLE
         + "   and exists (select 1 from Lesson l2 join l2.section s2 where s2.track = t and l2.status = com.codemastery.content.PageStatus.PUBLISHED)))")
    Optional<MediaAsset> findPubliclyServable(@Param("id") UUID id);

    @Modifying
    @Query("update MediaAsset m set m.deleteAttempts = m.deleteAttempts + 1 where m.id = :id")
    int bumpDeleteAttempts(@Param("id") UUID id);
}
