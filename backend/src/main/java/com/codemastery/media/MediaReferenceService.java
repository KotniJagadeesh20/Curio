package com.codemastery.media;

import com.codemastery.blocks.AssetFacts;
import com.codemastery.content.Track;
import com.codemastery.content.TrackRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityNotFoundException;
import jakarta.persistence.LockModeType;
import jakarta.persistence.PersistenceContext;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.UUID;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The ONLY writer of media references: {@code media_references} rows (page blocks) and {@code tracks.cover_asset_id} (covers).
 * A source-scan test fails if any other class writes either, and {@link MediaIntegrityAudit} recomputes the expected references from
 * the page bodies and covers and compares them with what is stored.
 *
 * <p><b>Lock hierarchy (PLAN.md Step 12b), the only order used anywhere:</b> collection row -> module row -> page rows (ascending id)
 * -> asset rows (ascending UUID). The callers ({@code CollectionService}) take the first three; this class takes asset locks and
 * always takes them <i>sorted</i>, as one set, so any two transactions that lock overlapping assets lock them in the same order.
 * Every asset lock is a fresh {@code FOR UPDATE} read ({@link #lockFresh}): a JPQL lock query returns an already-loaded entity with
 * stale fields, which would let a stale {@code status} through.
 *
 * <p><b>Invariant, maintained by every writer under the asset lock:</b> a referenced asset has {@code unreferenced_since IS NULL}; an
 * unreferenced asset has NULL (orphaned, not yet stamped by the sweeper) or the time it became unreferenced. Because every reference
 * writer and every sweeper step locks the asset row first, the asset row is the synchronisation point.
 *
 * <p>"Referenced" has one definition, {@link #isReferenced}: a {@code media_references} row <b>or</b> any collection cover
 * (soft-deleted collections included, so a restore finds its images). The two checks are separate statements on purpose: under READ
 * COMMITTED each statement sees the latest committed state, and a single compare-and-set with a {@code NOT EXISTS} subquery can miss a
 * reference committed while it waited for the row lock.
 */
@Service
public class MediaReferenceService {
    private final MediaReferenceRepository refs;
    private final TrackRepository tracks;
    @PersistenceContext private EntityManager em;

    public MediaReferenceService(MediaReferenceRepository refs, TrackRepository tracks) {
        this.refs = refs;
        this.tracks = tracks;
    }

    // ------------------------------------------------------------------------------------------------------------------
    // extraction
    // ------------------------------------------------------------------------------------------------------------------
    /** The asset ids named by image blocks. Tolerant: anything that isn't an image block with a canonical {@code assetId} is skipped. */
    public static Set<UUID> extractAssetIds(List<Map<String, Object>> blocks) {
        Set<UUID> ids = new TreeSet<>();
        if (blocks == null) return ids;
        for (Map<String, Object> b : blocks) {
            if (b != null && "image".equals(b.get("type")) && b.get("assetId") instanceof String s) {
                UUID id = com.codemastery.collection.Patch.canonicalUuid(s);
                if (id != null) ids.add(id);
            }
        }
        return ids;
    }

    // ------------------------------------------------------------------------------------------------------------------
    // locking
    // ------------------------------------------------------------------------------------------------------------------
    /** A fresh {@code FOR UPDATE} read of one asset (null when the row is gone). */
    MediaAsset lockFresh(UUID id) {
        MediaAsset a = em.find(MediaAsset.class, id);
        if (a == null) return null;
        try {
            em.refresh(a, LockModeType.PESSIMISTIC_WRITE);   // waits for the holder, then re-reads committed state
        } catch (EntityNotFoundException gone) {
            return null;
        }
        return a;
    }

    /** Locks the given assets one by one in ascending UUID order. Unknown ids are simply absent from the result. */
    Map<UUID, MediaAsset> lockSorted(Collection<UUID> ids) {
        Map<UUID, MediaAsset> locked = new HashMap<>();
        for (UUID id : new TreeSet<>(ids)) {
            MediaAsset a = lockFresh(id);
            if (a != null) locked.put(id, a);
        }
        return locked;
    }

    // ------------------------------------------------------------------------------------------------------------------
    // page bodies
    // ------------------------------------------------------------------------------------------------------------------
    /** The locked assets of one page-body write: everything the page references now plus everything the new body names. */
    public static final class BodyLock {
        private final Set<UUID> existing, incoming;
        private final Map<UUID, MediaAsset> locked;

        BodyLock(Set<UUID> existing, Set<UUID> incoming, Map<UUID, MediaAsset> locked) {
            this.existing = existing;
            this.incoming = incoming;
            this.locked = locked;
        }

        /** What {@code BlockValidator} may know: ready and owner for every incoming asset that exists. */
        public Map<UUID, AssetFacts> facts() {
            Map<UUID, AssetFacts> out = new HashMap<>();
            for (UUID id : incoming) {
                MediaAsset a = locked.get(id);
                if (a != null) out.put(id, new AssetFacts(a.getStatus() == MediaStatus.READY, a.getOwnerId()));
            }
            return out;
        }

        public Set<UUID> incoming() { return incoming; }
    }

    /**
     * Step 1 of a page-body write (call after the collection, module and page locks): locks the <b>union</b> of the assets the page
     * references now and the assets the new body names, sorted by UUID, so additions, removals and replacements all follow the same
     * discipline and the orphan clock of a removed asset is changed under its lock. {@code pageId} is null for a page being created.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public BodyLock lockForBody(Long pageId, List<Map<String, Object>> blocks) {
        Set<UUID> incoming = extractAssetIds(blocks);
        Set<UUID> existing = pageId == null ? new TreeSet<>() : new TreeSet<>(refs.assetIdsByPage(pageId));
        Set<UUID> union = new TreeSet<>(existing);
        union.addAll(incoming);
        return new BodyLock(existing, incoming, lockSorted(union));
    }

    /**
     * Step 2 (after the page row has been written and flushed, so a new page has its id): diff and apply. Added assets lose their
     * orphan stamp; removed assets that nothing else references get a fresh one. Never called for a metadata-only save.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void applyBody(Long pageId, BodyLock lock) {
        List<UUID> added = new ArrayList<>(), removed = new ArrayList<>();
        for (UUID id : lock.incoming) if (!lock.existing.contains(id)) added.add(id);
        for (UUID id : lock.existing) if (!lock.incoming.contains(id)) removed.add(id);
        for (UUID id : added) {
            em.persist(new MediaReference(id, pageId));
            MediaAsset a = lock.locked.get(id);
            if (a != null) a.setUnreferencedSince(null);
        }
        if (!removed.isEmpty()) refs.deleteByPageAndAssets(pageId, removed);
        em.flush();
        stampIfUnreferenced(removed, lock.locked);
    }

    // ------------------------------------------------------------------------------------------------------------------
    // covers
    // ------------------------------------------------------------------------------------------------------------------
    /**
     * Changes a collection's cover (null clears it). The caller has locked the collection row and then loaded {@code track}, so its
     * current cover is the committed one. Locks the old and the new asset together, sorted; the new one must exist, be READY and be
     * owned by the collection owner (else {@link MediaException#unusable()}). Writes {@code cover_asset_id}, clears the new asset's
     * orphan stamp and stamps the old one if nothing else references it.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void setCover(Track track, UUID newCover) {
        UUID old = track.getCoverAssetId();
        if (java.util.Objects.equals(old, newCover)) return;
        Set<UUID> both = new TreeSet<>();
        if (old != null) both.add(old);
        if (newCover != null) both.add(newCover);
        Map<UUID, MediaAsset> locked = lockSorted(both);
        if (newCover != null) {
            MediaAsset a = locked.get(newCover);
            if (a == null || a.getStatus() != MediaStatus.READY || !a.getOwnerId().equals(track.getOwner().getId())) throw MediaException.unusable();
            a.setUnreferencedSince(null);
        }
        track.setCoverAssetId(newCover);
        em.flush();
        if (old != null) stampIfUnreferenced(List.of(old), locked);
    }

    // ------------------------------------------------------------------------------------------------------------------
    // removal of pages, modules, collections
    // ------------------------------------------------------------------------------------------------------------------
    /** The assets referenced by these pages. Call AFTER the page locks are held, BEFORE the pages are deleted. */
    public Set<UUID> assetIdsOfPages(Collection<Long> pageIds) {
        return pageIds.isEmpty() ? new TreeSet<>() : new TreeSet<>(refs.assetIdsByPages(pageIds));
    }

    /**
     * After pages (or a collection) were deleted and flushed: lock the candidates sorted and stamp those that nothing references any
     * more. {@code candidates} were collected before the delete and after the locks, so they include references that a concurrent
     * save committed just before.
     */
    @Transactional(propagation = Propagation.MANDATORY)
    public void releaseAfter(Collection<UUID> candidates) {
        if (candidates.isEmpty()) return;
        em.flush();
        stampIfUnreferenced(candidates, lockSorted(candidates));
    }

    /**
     * Permanent collection purge (Step 20 will call this; nothing calls it in 12b except tests): the assets of the cover and of every
     * page, to be passed to {@link #releaseAfter} after the rows are deleted. Soft delete never calls it: a soft-deleted collection
     * keeps its references so a restore works.
     */
    public Set<UUID> assetIdsOfCollection(Track track) {
        Set<UUID> out = new TreeSet<>();
        if (track.getCoverAssetId() != null) out.add(track.getCoverAssetId());
        List<Long> pageIds = new ArrayList<>();
        track.getSections().forEach(s -> s.getLessons().forEach(l -> pageIds.add(l.getId())));
        out.addAll(assetIdsOfPages(pageIds));
        return out;
    }

    private void stampIfUnreferenced(Collection<UUID> ids, Map<UUID, MediaAsset> locked) {
        Instant now = Instant.now();
        for (UUID id : ids) {
            MediaAsset a = locked.get(id);
            if (a == null || a.getStatus() != MediaStatus.READY) continue;
            if (!isReferenced(id)) a.setUnreferencedSince(now);
        }
    }

    // ------------------------------------------------------------------------------------------------------------------
    // reads
    // ------------------------------------------------------------------------------------------------------------------
    /** The one definition of "referenced": a page reference or any collection cover (soft-deleted collections included). */
    public boolean isReferenced(UUID assetId) {
        return refs.countByAsset(assetId) > 0 || tracks.existsByCoverAssetId(assetId);
    }

    /** Where an asset is used (for the 409 body): covers first, then pages, at most {@code limit} entries, plus the real total. */
    public Usages usages(UUID assetId, int limit) {
        List<MediaDtos.Usage> out = new ArrayList<>();
        for (Object[] r : refs.coverUsages(assetId, PageRequest.of(0, limit))) {
            out.add(new MediaDtos.Usage("COVER", (Long) r[0], (String) r[1], null, null, r[2] != null));
        }
        if (out.size() < limit) {
            for (Object[] r : refs.pageUsages(assetId, PageRequest.of(0, limit - out.size()))) {
                out.add(new MediaDtos.Usage("PAGE", (Long) r[0], (String) r[1], (Long) r[2], (String) r[3], r[4] != null));
            }
        }
        return new Usages(out, refs.countCoverUsages(assetId) + refs.countByAsset(assetId));
    }

    public record Usages(List<MediaDtos.Usage> items, long total) {}
}
