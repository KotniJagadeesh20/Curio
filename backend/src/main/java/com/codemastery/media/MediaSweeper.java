package com.codemastery.media;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Recovers interrupted uploads and finishes deletions. Every step is idempotent and re-checks the row under its lock, so two
 * overlapping runs, a restart mid-run, or running it twice in a row can't corrupt anything. A row only ever moves forward
 * (UPLOADING -> DELETING -> removed); it is never resurrected.
 *
 * <p>Each pass, in this order: (0) stale UPLOADING rows become DELETING; (1) <b>stamp</b>: an unreferenced READY asset with no
 * {@code unreferenced_since} gets one (so an asset orphaned by a cascade starts its 24 h grace); (2) <b>purge</b>: an unreferenced
 * READY asset stamped more than 24 h ago becomes DELETING; (3) every DELETING row is removed (objects, then row). Steps 1 and 2 only
 * <i>select</i> candidates with an advisory query; the real decision is made in {@link MediaTx} under the asset's row lock, which is
 * where it serialises with page saves and cover changes. The purge candidates are chosen BEFORE the stamp step, so an asset
 * stamped in this pass is never purged in the same pass.
 *
 * <p>Afterwards the {@link MediaIntegrityAudit} runs read-only and logs any mismatch between references and content. It repairs nothing.
 */
@Component
public class MediaSweeper {
    private static final Logger log = LoggerFactory.getLogger(MediaSweeper.class);
    private static final int BATCH = 100, MAX_BATCHES = 20;

    public record Result(int expired, int removed, int pending, int stamped, int purged) {
        public Result(int expired, int removed, int pending) { this(expired, removed, pending, 0, 0); }
    }

    private final MediaAssetRepository assets;
    private final MediaTx tx;
    private final MediaCleanup cleanup;
    private final MediaProperties props;
    private final MediaIntegrityAudit audit;
    private volatile Instant lastRun = Instant.now();

    /** An unreferenced READY asset is purged this long after it became unreferenced. */
    static final java.time.Duration ORPHAN_GRACE = java.time.Duration.ofHours(24);

    public MediaSweeper(MediaAssetRepository assets, MediaTx tx, MediaCleanup cleanup, MediaProperties props, MediaIntegrityAudit audit) {
        this.assets = assets;
        this.tx = tx;
        this.cleanup = cleanup;
        this.props = props;
        this.audit = audit;
    }

    /** Wakes every minute; runs when {@code media.sweep-interval} has passed. */
    @Scheduled(fixedDelay = 60_000, initialDelay = 60_000)
    void scheduled() {
        Instant now = Instant.now();
        if (!props.sweepEnabled() || now.isBefore(lastRun.plus(props.sweepInterval()))) return;
        lastRun = now;
        try {
            Result r = sweepOnce(now);
            if (r.expired() + r.removed() + r.pending() + r.stamped() + r.purged() > 0) {
                log.info("media sweep: {} expired uploads, {} orphans stamped, {} orphans purged, {} assets removed, {} still pending",
                        r.expired(), r.stamped(), r.purged(), r.removed(), r.pending());
            }
            audit.logMismatches();
        } catch (RuntimeException e) {
            log.error("media sweep failed", e);
        }
    }

    public Result sweepOnce(Instant now) {
        Instant cutoff = now.minus(props.uploadTimeout());
        int expired = 0;
        for (int i = 0; i < MAX_BATCHES; i++) {
            List<UUID> ids = assets.idsByStatusCreatedBefore(MediaStatus.UPLOADING, cutoff, PageRequest.of(0, BATCH));
            int progressed = 0;
            for (UUID id : ids) if (tx.expireStaleUpload(id, cutoff)) { expired++; progressed++; }
            if (ids.size() < BATCH || progressed == 0) break;
        }
        // Purge candidates are chosen before stamping: a freshly stamped asset must wait out the grace period.
        Instant purgeCutoff = now.minus(ORPHAN_GRACE);
        List<UUID> purgeCandidates = new java.util.ArrayList<>();
        UUID cursor = null;
        for (int i = 0; i < MAX_BATCHES; i++) {
            List<UUID> ids = cursor == null
                    ? assets.staleOrphanIds(purgeCutoff, PageRequest.of(0, BATCH))
                    : assets.staleOrphanIdsAfter(purgeCutoff, cursor, PageRequest.of(0, BATCH));
            purgeCandidates.addAll(ids);
            if (ids.size() < BATCH) break;
            cursor = ids.get(ids.size() - 1);
        }
        int stamped = 0;
        cursor = null;
        for (int i = 0; i < MAX_BATCHES; i++) {
            List<UUID> ids = cursor == null
                    ? assets.unstampedOrphanIds(PageRequest.of(0, BATCH))
                    : assets.unstampedOrphanIdsAfter(cursor, PageRequest.of(0, BATCH));
            for (UUID id : ids) if (tx.stampIfOrphan(id)) stamped++;
            if (ids.size() < BATCH) break;
            cursor = ids.get(ids.size() - 1);
        }
        int purged = 0;
        for (UUID id : purgeCandidates) if (tx.purgeIfOrphan(id, purgeCutoff)) purged++;

        // Cursor by id (not by page number): rows that are removed mid-loop must not shift the pages and make us skip others.
        // Failures stay DELETING and are retried on the next sweep.
        int removed = 0, pending = 0;
        UUID after = null;
        for (int i = 0; i < MAX_BATCHES; i++) {
            List<UUID> ids = after == null
                    ? assets.idsByStatus(MediaStatus.DELETING, PageRequest.of(0, BATCH))
                    : assets.idsByStatusAfter(MediaStatus.DELETING, after, PageRequest.of(0, BATCH));
            for (UUID id : ids) {
                if (cleanup.finalizeDeletion(id)) removed++; else pending++;
            }
            if (ids.size() < BATCH) break;
            after = ids.get(ids.size() - 1);
        }
        return new Result(expired, removed, pending, stamped, purged);
    }
}
