package com.codemastery.media;

import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Finishes the deletion of a DELETING asset: both storage objects (idempotent, a missing one is success), then the row.
 * Safe to repeat at any point: a crash between the two object deletes, or between the last delete and the row delete,
 * just repeats harmless deletes on the next attempt. A failure bumps {@code delete_attempts} and leaves the row (which
 * keeps counting against quota) for the next pass.
 */
@Component
public class MediaCleanup {
    private static final Logger log = LoggerFactory.getLogger(MediaCleanup.class);
    static final int ALERT_ATTEMPTS = 5;

    private final MediaStorage storage;
    private final MediaTx tx;

    public MediaCleanup(MediaStorage storage, MediaTx tx) {
        this.storage = storage;
        this.tx = tx;
    }

    /** @return true when the asset is completely gone (objects and row) */
    public boolean finalizeDeletion(UUID id) {
        MediaAsset a = tx.find(id);
        if (a == null) return true;
        if (a.getStatus() != MediaStatus.DELETING) return false;
        try {
            storage.delete(a.getStorageKey());
            storage.delete(a.getThumbKey());
        } catch (Exception e) {
            tx.recordDeleteFailure(id);
            int attempts = a.getDeleteAttempts() + 1;
            if (attempts >= ALERT_ATTEMPTS) log.error("media {} still cannot be deleted from storage after {} attempts", id, attempts, e);
            else log.warn("media {} storage deletion failed (attempt {}): {}", id, attempts, e.toString());
            return false;
        }
        try {
            return tx.removeRow(id);
        } catch (RuntimeException e) {
            log.warn("media {} row removal failed, will retry: {}", id, e.toString());
            return false;
        }
    }
}
