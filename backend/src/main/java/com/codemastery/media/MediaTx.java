package com.codemastery.media;

import com.codemastery.user.User;
import com.codemastery.user.UserRepository;
import java.time.Instant;
import java.util.UUID;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Every database transition of an asset. Storage I/O never happens inside these transactions (a database transaction cannot
 * make a filesystem or S3 operation atomic); the callers order the two so every crash leaves something the sweeper can finish.
 *
 * <p><b>Lock order, everywhere:</b> the owner's {@code users} row first, then asset rows. Anything that reserves quota
 * ({@link #reserve}) or releases it (the final row delete, {@link #removeRow}) takes the users-row lock, so two concurrent
 * uploads can never both pass a quota check made against the same previous total.
 */
@Component
public class MediaTx {
    private final MediaAssetRepository assets;
    private final UserRepository users;
    private final MediaProperties props;
    private final MediaReferenceService references;
    private final LiveUploads liveUploads;

    public MediaTx(MediaAssetRepository assets, UserRepository users, MediaProperties props, MediaReferenceService references, LiveUploads liveUploads) {
        this.assets = assets;
        this.users = users;
        this.props = props;
        this.references = references;
        this.liveUploads = liveUploads;
    }

    /** Non-authoritative early check so an over-quota user doesn't cost us a decode. Reserves nothing. */
    @Transactional(readOnly = true)
    public void quotaPrecheck(Long ownerId) {
        if (assets.countByOwner(ownerId) >= props.quotaAssets() || assets.storedBytesByOwner(ownerId) >= props.quotaBytes().toBytes()) {
            throw MediaException.quota();
        }
    }

    /** The authoritative quota check and the UPLOADING row, under the owner's users-row lock. */
    @Transactional
    public MediaAsset reserve(Long ownerId, UUID id, ProcessedImage p) {
        users.lockById(ownerId).orElseThrow(MediaException::notFound);
        long count = assets.countByOwner(ownerId);
        long bytes = assets.storedBytesByOwner(ownerId);
        if (count + 1 > props.quotaAssets() || bytes + p.totalBytes() > props.quotaBytes().toBytes()) throw MediaException.quota();

        MediaAsset a = new MediaAsset();
        a.setId(id);
        a.setOwnerId(ownerId);
        a.setStatus(MediaStatus.UPLOADING);
        a.setContentType(p.contentType());
        a.setWidth(p.width());
        a.setHeight(p.height());
        a.setSizeBytes(p.original().length);
        a.setSha256(p.sha256());
        a.setThumbWidth(p.thumbWidth());
        a.setThumbHeight(p.thumbHeight());
        a.setThumbSizeBytes(p.thumb().length);
        a.setThumbSha256(p.thumbSha256());
        a.setStorageKey(MediaKeys.original(id, p.contentType()));
        a.setThumbKey(MediaKeys.thumb(id, p.contentType()));
        return assets.saveAndFlush(a);
    }

    /** UPLOADING -> READY. Fails (and the caller cleans up) if the sweeper already took the row. */
    @Transactional
    public MediaAsset markReady(UUID id) {
        // a row that is gone is the same "this upload was abandoned underneath you, retry" as a row that is no longer UPLOADING
        MediaAsset a = assets.lockById(id).orElseThrow(MediaException::storageFailed);
        if (a.getStatus() != MediaStatus.UPLOADING) throw MediaException.storageFailed();
        Instant now = Instant.now();
        a.setStatus(MediaStatus.READY);
        a.setReadyAt(now);
        a.setUnreferencedSince(now);
        return a;
    }

    /** Any not-yet-DELETING state -> DELETING (idempotent). The row keeps counting against quota until it is removed. */
    @Transactional
    public void markDeleting(UUID id) {
        assets.lockById(id).ifPresent(a -> a.setStatus(MediaStatus.DELETING));
    }

    /** Sweeper: a stale UPLOADING row becomes DELETING; re-checked under the row lock so a late upload that just finished is left alone. */
    @Transactional
    public boolean expireStaleUpload(UUID id, Instant cutoff) {
        // a request of THIS process may still be writing this upload's objects: never abandon it from under that request
        if (liveUploads.isLive(id)) return false;
        MediaAsset a = assets.lockById(id).orElse(null);
        if (a == null || a.getStatus() != MediaStatus.UPLOADING || !a.getCreatedAt().isBefore(cutoff)) return false;
        a.setStatus(MediaStatus.DELETING);
        return true;
    }

    /**
     * {@code DELETE /api/media/{id}}, the database half. Locks the asset row, then re-checks "referenced" in separate statements
     * (see {@link MediaReferenceService}), then marks it DELETING. Non-owner, admin and unknown ids are all 404. The row keeps
     * counting against quota until the caller finishes the storage cleanup and the row is removed.
     *
     * @return true when this call moved the asset to DELETING, false when it already was (a repeat is 204 as well)
     */
    @Transactional
    public boolean requestDeletion(Long ownerId, UUID id) {
        MediaAsset a = assets.lockById(id).orElseThrow(MediaException::notFound);
        if (!a.getOwnerId().equals(ownerId)) throw MediaException.notFound();
        if (a.getStatus() == MediaStatus.DELETING) return false;
        if (a.getStatus() == MediaStatus.UPLOADING) throw MediaException.notReady();
        if (references.isReferenced(id)) throw new MediaInUseException(references.usages(id, USAGE_LIMIT));
        a.setStatus(MediaStatus.DELETING);
        return true;
    }

    static final int USAGE_LIMIT = 20;

    /**
     * Sweeper step 1. Locks the asset, requires READY and a NULL stamp <i>as read under the lock</i>, re-checks references in a
     * separate statement, and only then writes the time (read after the lock was acquired, never one observed earlier). Never
     * overwrites a stamp.
     */
    @Transactional
    public boolean stampIfOrphan(UUID id) {
        MediaAsset a = assets.lockById(id).orElse(null);
        if (a == null || a.getStatus() != MediaStatus.READY || a.getUnreferencedSince() != null) return false;
        if (references.isReferenced(id)) return false;
        a.setUnreferencedSince(Instant.now());
        return true;
    }

    /**
     * Sweeper step 2. Locks the asset and re-reads status, stamp and references <i>under the lock</i>: the stamp as selected may be
     * stale (an attach followed by a detach restamps it). Requires READY, unreferenced and a stamp older than {@code cutoff}.
     */
    @Transactional
    public boolean purgeIfOrphan(UUID id, Instant cutoff) {
        MediaAsset a = assets.lockById(id).orElse(null);
        if (a == null || a.getStatus() != MediaStatus.READY) return false;
        Instant stamp = a.getUnreferencedSince();
        if (stamp == null || !stamp.isBefore(cutoff)) return false;
        if (references.isReferenced(id)) return false;
        a.setStatus(MediaStatus.DELETING);
        return true;
    }

    @Transactional
    public void recordDeleteFailure(UUID id) {
        assets.bumpDeleteAttempts(id);
    }

    /** The final step: the row goes, and with it the quota it held. Users-row lock first, then the asset row, re-checked. */
    @Transactional
    public boolean removeRow(UUID id) {
        MediaAsset peek = assets.findById(id).orElse(null);
        if (peek == null) return true;
        users.lockById(peek.getOwnerId());
        MediaAsset a = assets.lockById(id).orElse(null);
        if (a == null) return true;
        if (a.getStatus() != MediaStatus.DELETING) return false;
        assets.delete(a);
        return true;
    }

    @Transactional(readOnly = true)
    public MediaAsset find(UUID id) {
        return assets.findById(id).orElse(null);
    }
}
