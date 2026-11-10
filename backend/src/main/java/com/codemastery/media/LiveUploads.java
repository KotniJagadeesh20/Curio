package com.codemastery.media;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/**
 * The uploads this process is executing right now. {@link MediaTx#expireStaleUpload} refuses to expire a row listed here: an
 * UPLOADING row older than {@code media.upload-timeout} is only abandoned if no live request can still write to its storage keys.
 * Without this a slow upload could be expired and cleaned up (objects and row) while its thumbnail write was still in flight, and
 * the object written afterwards would have no row for anyone to find.
 *
 * <p>An id is registered BEFORE its row exists and released only after the upload reached a final state (READY, or its own cleanup
 * ran), in a {@code finally}. So the sweeper can never observe "row exists, upload live, id not registered", and a crashed process
 * (which loses the registry) is exactly the case the sweeper is meant to recover. Single-instance, like the sweeper itself: with
 * several instances sharing storage this would need a database lease (documented in PLAN.md, out of scope for v1).
 */
@Component
public class LiveUploads {
    private final Set<UUID> live = ConcurrentHashMap.newKeySet();

    public void register(UUID id) { live.add(id); }

    public void release(UUID id) { live.remove(id); }

    public boolean isLive(UUID id) { return live.contains(id); }
}
