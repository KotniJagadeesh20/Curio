package com.codemastery.media;

import java.util.Collection;
import java.util.List;
import java.util.UUID;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MediaReferenceRepository extends JpaRepository<MediaReference, MediaReference.Key> {
    @Query("select r.assetId from MediaReference r where r.pageId = :pageId")
    List<UUID> assetIdsByPage(@Param("pageId") Long pageId);

    @Query("select distinct r.assetId from MediaReference r where r.pageId in :pageIds")
    List<UUID> assetIdsByPages(@Param("pageIds") Collection<Long> pageIds);

    @Query("select count(r) from MediaReference r where r.assetId = :assetId")
    long countByAsset(@Param("assetId") UUID assetId);

    /** Bulk delete (does not touch the persistence context: references are never loaded as entities except when just inserted). */
    @Modifying(flushAutomatically = true)
    @Query("delete from MediaReference r where r.pageId = :pageId and r.assetId in :assetIds")
    int deleteByPageAndAssets(@Param("pageId") Long pageId, @Param("assetIds") Collection<UUID> assetIds);

    /** Usages for the 409 body: page references with their collection (title, soft-deleted or not), by page id. */
    @Query("select t.id, t.name, l.id, l.title, t.deletedAt from MediaReference r, Lesson l join l.section s join s.track t "
         + "where r.assetId = :assetId and l.id = r.pageId order by l.id")
    List<Object[]> pageUsages(@Param("assetId") UUID assetId, Pageable page);

    @Query("select t.id, t.name, t.deletedAt from Track t where t.coverAssetId = :assetId order by t.id")
    List<Object[]> coverUsages(@Param("assetId") UUID assetId, Pageable page);

    @Query("select count(t) from Track t where t.coverAssetId = :assetId")
    long countCoverUsages(@Param("assetId") UUID assetId);

    /** Everything, for the integrity audit (page id, asset id). */
    @Query("select r.pageId, r.assetId from MediaReference r")
    List<Object[]> allPairs();
}
