package com.codemastery.media;

import com.codemastery.user.User;
import java.io.IOException;
import java.io.InputStream;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

/**
 * Upload orchestration (no @Transactional here on purpose: database and storage can't be atomic, so each step is its own
 * transaction and the order is what makes every crash recoverable):
 * <ol>
 *   <li>validate and process fully in memory (nothing persisted),</li>
 *   <li>reserve: quota check + UPLOADING row under the owner's users-row lock, committed <i>before</i> any object is written,</li>
 *   <li>put original, then thumbnail,</li>
 *   <li>mark READY (the 201 is only sent after this commit).</li>
 * </ol>
 * A handled failure in 3 or 4 deletes whatever was written and removes the row. A crash (the process dying, which no catch
 * block sees) leaves an UPLOADING row that names its objects through id-derived keys; {@link MediaSweeper} finishes it.
 */
@Service
public class MediaService {
    private static final Logger log = LoggerFactory.getLogger(MediaService.class);

    private final MediaProperties props;
    private final ImageProcessor processor;
    private final MediaStorage storage;
    private final MediaTx tx;
    private final MediaCleanup cleanup;
    private final LiveUploads liveUploads;
    /** Bounds how many uploads hold their bytes in memory at once; acquired BEFORE the bytes are read, so waiting uploads hold none. */
    private final java.util.concurrent.Semaphore uploadSlots;

    public MediaService(MediaProperties props, ImageProcessor processor, MediaStorage storage, MediaTx tx, MediaCleanup cleanup, LiveUploads liveUploads) {
        this.props = props;
        this.processor = processor;
        this.storage = storage;
        this.tx = tx;
        this.cleanup = cleanup;
        this.liveUploads = liveUploads;
        this.uploadSlots = new java.util.concurrent.Semaphore(props.maxConcurrentUploads(), true);
    }

    public MediaAsset upload(User owner, MultipartFile file) {
        tx.quotaPrecheck(owner.getId());
        ProcessedImage processed = readAndProcess(file);

        UUID id = UUID.randomUUID();
        // Registered before the row exists and released only in the finally: while it is registered the sweeper will not expire the
        // row, so no cleanup can run underneath this request's storage writes.
        liveUploads.register(id);
        try {
            MediaAsset reserved = tx.reserve(owner.getId(), id, processed);
            try {
                storage.put(reserved.getStorageKey(), processed.original(), processed.contentType());
                storage.put(reserved.getThumbKey(), processed.thumb(), processed.contentType());
                return tx.markReady(id);
            } catch (Exception e) {   // not Error: a simulated or real crash must NOT run cleanup, the sweeper owns that case
                log.warn("media upload {} failed after reservation, cleaning up: {}", id, e.toString());
                abandon(id, processed.contentType());
                throw e instanceof MediaException m ? m : MediaException.storageFailed();
            }
        } finally {
            liveUploads.release(id);
        }
    }

    /** Reading the bytes and decoding them: the memory-heavy part, run inside an upload slot (and the decode budget inside the processor). */
    private ProcessedImage readAndProcess(MultipartFile file) {
        boolean got;
        try {
            got = uploadSlots.tryAcquire(props.decodeWait().toMillis(), java.util.concurrent.TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw MediaException.busy();
        }
        if (!got) throw MediaException.busy();
        try {
            return processor.process(readCapped(file), file.getContentType(), file.getOriginalFilename());
        } finally {
            uploadSlots.release();
        }
    }

    /**
     * A handled failure after the reservation. The keys derive from the id and the output type alone, so both objects are deleted
     * directly (idempotent) whatever state the row is in: if the row was already removed underneath this request, the row-driven
     * cleanup has nothing to find, and an object written late would otherwise be left with no row. Then the row (if any) follows
     * the normal DELETING path; whatever this cannot finish, the sweeper retries.
     */
    private void abandon(UUID id, String contentType) {
        for (String key : new String[] {MediaKeys.original(id, contentType), MediaKeys.thumb(id, contentType)}) {
            try {
                storage.delete(key);
            } catch (Exception e) {
                log.warn("media {} object {} could not be deleted after a failed upload: {}", id, key, e.toString());
            }
        }
        try {
            tx.markDeleting(id);
            cleanup.finalizeDeletion(id);   // whatever this can't finish, the sweeper retries
        } catch (RuntimeException e) {
            log.warn("media {} cleanup after failed upload did not finish, sweeper will retry: {}", id, e.toString());
        }
    }

    /** Reads at most {@code media.max-bytes} (+1 to detect overflow): the real byte count, independent of any declared length. */
    private byte[] readCapped(MultipartFile file) {
        long max = props.maxBytes().toBytes();
        if (file.getSize() > max) throw MediaException.tooLarge(max);
        try (InputStream in = file.getInputStream()) {
            byte[] data = in.readNBytes((int) max + 1);
            if (data.length > max) throw MediaException.tooLarge(max);
            return data;
        } catch (IOException e) {
            throw MediaException.corrupt();
        }
    }

    /** An owner's own READY asset, or 404 (unknown, someone else's, not READY: all the same answer). */
    public Served openOwned(User owner, UUID id, boolean thumb) {
        MediaAsset a = tx.find(id);
        if (a == null || !a.getOwnerId().equals(owner.getId()) || a.getStatus() != MediaStatus.READY) throw MediaException.notFound();
        String key = thumb ? a.getThumbKey() : a.getStorageKey();
        try {
            return new Served(storage.open(key), a.getContentType(), thumb ? a.getThumbSizeBytes() : a.getSizeBytes());
        } catch (IOException e) {
            log.error("media {} is READY but its object {} cannot be read: {}", id, key, e.toString());
            throw MediaException.notFound();
        }
    }

    /**
     * {@code DELETE /api/media/{id}}: the database decision is one transaction (lock, re-check references, DELETING); the storage
     * removal is attempted inline afterwards and its failure never fails the request: the sweeper retries every DELETING row.
     */
    public void delete(User owner, UUID id) {
        tx.requestDeletion(owner.getId(), id);
        try {
            cleanup.finalizeDeletion(id);
        } catch (RuntimeException e) {
            log.warn("media {} marked DELETING, inline cleanup did not finish, sweeper will retry: {}", id, e.toString());
        }
    }

    public record Served(InputStream stream, String contentType, long length) {}
}
