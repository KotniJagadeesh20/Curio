package com.codemastery;

import static com.codemastery.media.MediaFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.reset;

import com.codemastery.media.MediaAsset;
import com.codemastery.media.MediaStatus;
import com.codemastery.media.MediaStorage;
import com.codemastery.media.MediaSweeper;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.web.servlet.MvcResult;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;

/**
 * Crash and failure recovery for every upload stage (PLAN.md Step 12, "Crash recovery"). A real crash is a process dying, which no
 * catch block sees; it is simulated with an {@link Error} (the service only catches Exception), leaving exactly the state a crash would.
 */
class MediaRecoveryTest extends MediaApiTestSupport {
    @SpyBean MediaStorage storage;
    @Autowired MediaSweeper sweeper;
    @Autowired com.codemastery.media.MediaTx mediaTx;

    static class SimulatedCrash extends Error {
        SimulatedCrash(String m) { super(m); }
    }

    private final List<String> putKeys = new ArrayList<>();

    private void stubPut(java.util.function.BiConsumer<String, org.mockito.invocation.InvocationOnMock> before, boolean crashAfterRealPutOfThumb) throws IOException {
        doAnswer(inv -> {
            String key = inv.getArgument(0);
            putKeys.add(key);
            before.accept(key, inv);
            Object r = inv.callRealMethod();
            if (crashAfterRealPutOfThumb && key.contains("/thumb.")) throw new SimulatedCrash("after both objects, before READY");
            return r;
        }).when(storage).put(anyString(), any(), anyString());
    }

    private static boolean causedBy(Throwable t, Class<? extends Throwable> type) {
        for (Throwable c = t; c != null; c = c.getCause()) if (type.isInstance(c)) return true;
        return false;
    }

    private MvcResult uploadExpectingCrash(Account a) {
        Exception e = assertThrows(Exception.class, () -> mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))));
        assertTrue(causedBy(e, SimulatedCrash.class), e.toString());
        return null;
    }

    private List<MediaAsset> rowsOf(Account a) {
        return assets.findAll().stream().filter(m -> m.getOwnerId() == a.id()).toList();
    }

    private void sweepAsIfLater() {
        sweeper.sweepOnce(Instant.now().plus(Duration.ofMinutes(31)));
    }

    // ---- handled failures (an exception the service sees) ----

    @Test
    void aStorageFailureAfterReservationCleansUpImmediately() throws Exception {
        Account a = signup();
        stubPut((k, inv) -> { if (k.contains("/thumb.")) throw new RuntimeException(new IOException("disk full")); }, false);
        MvcResult r = mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn();
        assertEquals(503, r.getResponse().getStatus());
        assertEquals("MEDIA_STORAGE_FAILED", read(r).get("code").asText());
        assertEquals(0, rowsOf(a).size(), "the row is gone");
        for (String k : putKeys) assertFalse(storage.exists(k), "no object left behind: " + k);
        assertFalse(putKeys.isEmpty());
    }

    @Test
    void ifCleanupItselfFailsTheRowStaysDeletingAndHoldsQuotaUntilTheSweeperFinishes() throws Exception {
        Account a = signup();
        stubPut((k, inv) -> { if (k.contains("/thumb.")) throw new RuntimeException(new IOException("disk full")); }, false);
        doAnswer(inv -> { throw new IOException("storage down"); }).when(storage).delete(anyString());
        assertEquals(503, mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn().getResponse().getStatus());
        List<MediaAsset> rows = rowsOf(a);
        assertEquals(1, rows.size());
        assertEquals(MediaStatus.DELETING, rows.get(0).getStatus());
        assertTrue(rows.get(0).getDeleteAttempts() >= 1, "the failed attempt is recorded");
        assertEquals(1, assets.countByOwner(a.id()), "still counts against the quota");
        String original = rows.get(0).getStorageKey();
        reset(storage);   // storage is back
        assertTrue(storage.exists(original), "the original really was left behind");
        sweeper.sweepOnce(Instant.now());
        assertEquals(0, rowsOf(a).size());
        assertFalse(storage.exists(original));
    }

    // ---- crashes at each stage ----

    @Test
    void crashBeforeEitherObjectIsStored() throws Exception {
        Account a = signup();
        stubPut((k, inv) -> { throw new SimulatedCrash("before any object"); }, false);
        uploadExpectingCrash(a);
        List<MediaAsset> rows = rowsOf(a);
        assertEquals(1, rows.size(), "the reservation was committed before any write");
        MediaAsset row = rows.get(0);
        assertEquals(MediaStatus.UPLOADING, row.getStatus());
        reset(storage);
        assertFalse(storage.exists(row.getStorageKey()));
        assertFalse(storage.exists(row.getThumbKey()));
        mvc.perform(get("/api/media/" + row.getId() + "/content").header("Authorization", "Bearer " + a.token())).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());

        sweeper.sweepOnce(Instant.now());
        assertEquals(MediaStatus.UPLOADING, assets.findById(row.getId()).orElseThrow().getStatus(), "not stale yet: left alone");
        sweepAsIfLater();
        assertTrue(assets.findById(row.getId()).isEmpty(), "stale upload is expired, its (absent) objects deleted as a no-op, row removed");
        assertEquals(0, assets.countByOwner(a.id()), "quota released");
    }

    @Test
    void aCrashInTheMiddleOfAWriteLeavesATempFileThatTheSweeperRemovesWithTheAsset() throws Exception {
        Account a = signup();
        stubPut((k, inv) -> {
            try {
                java.nio.file.Path dir = ROOT.resolve(k).getParent();
                java.nio.file.Files.createDirectories(dir);
                java.nio.file.Files.write(dir.resolve(".part-killed-mid-write"), new byte[] {1, 2, 3});   // what the storage leaves when the process dies during a write
            } catch (java.io.IOException e) { throw new RuntimeException(e); }
            throw new SimulatedCrash("killed while writing the original");
        }, false);
        uploadExpectingCrash(a);
        MediaAsset row = rowsOf(a).get(0);
        reset(storage);
        java.nio.file.Path dir = ROOT.resolve("media").resolve(row.getId().toString());
        assertTrue(java.nio.file.Files.exists(dir.resolve(".part-killed-mid-write")));
        assertFalse(storage.exists(row.getStorageKey()), "no object was ever visible: the partial write was never moved into place");
        mvc.perform(get("/api/media/" + row.getId() + "/content").header("Authorization", "Bearer " + a.token())).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
        sweepAsIfLater();
        assertTrue(assets.findById(row.getId()).isEmpty());
        assertFalse(java.nio.file.Files.exists(dir), "the temp file and the asset's directory are gone");
    }

    @Test
    void stateTransitionsRecheckTheRowUnderItsLockSoARaceCannotExpireALiveUpload() throws Exception {
        Account a = signup();
        Instant cutoff = Instant.now().minus(Duration.ofMinutes(30));
        MediaAsset fresh = insertAsset(a.id(), MediaStatus.UPLOADING, 10, 10, Instant.now());
        assertFalse(mediaTx.expireStaleUpload(fresh.getId(), cutoff), "newer than the cutoff: not stale, even if a sweep had listed it");
        assertEquals(MediaStatus.UPLOADING, assets.findById(fresh.getId()).orElseThrow().getStatus());

        MediaAsset finished = insertAsset(a.id(), MediaStatus.READY, 10, 10, Instant.now().minus(Duration.ofHours(2)));
        assertFalse(mediaTx.expireStaleUpload(finished.getId(), cutoff), "an upload that completed after the sweep listed it is left alone");
        assertEquals(MediaStatus.READY, assets.findById(finished.getId()).orElseThrow().getStatus());

        MediaAsset stale = insertAsset(a.id(), MediaStatus.UPLOADING, 10, 10, Instant.now().minus(Duration.ofHours(2)));
        assertTrue(mediaTx.expireStaleUpload(stale.getId(), cutoff));
        assertEquals(MediaStatus.DELETING, assets.findById(stale.getId()).orElseThrow().getStatus());
        assertFalse(mediaTx.expireStaleUpload(stale.getId(), cutoff), "already moved on");
        assertFalse(mediaTx.expireStaleUpload(UUID.randomUUID(), cutoff), "unknown row");
    }

    @Test
    void crashAfterTheOriginalButBeforeTheThumbnail() throws Exception {
        Account a = signup();
        stubPut((k, inv) -> { if (k.contains("/thumb.")) throw new SimulatedCrash("between original and thumbnail"); }, false);
        uploadExpectingCrash(a);
        MediaAsset row = rowsOf(a).get(0);
        reset(storage);
        assertEquals(MediaStatus.UPLOADING, row.getStatus());
        assertTrue(storage.exists(row.getStorageKey()));
        assertFalse(storage.exists(row.getThumbKey()));
        sweepAsIfLater();
        assertTrue(assets.findById(row.getId()).isEmpty());
        assertFalse(storage.exists(row.getStorageKey()), "the orphaned original is removed too");
    }

    @Test
    void crashAfterBothObjectsButBeforeReady() throws Exception {
        Account a = signup();
        stubPut((k, inv) -> { }, true);
        uploadExpectingCrash(a);
        MediaAsset row = rowsOf(a).get(0);
        reset(storage);
        assertEquals(MediaStatus.UPLOADING, row.getStatus());
        assertTrue(storage.exists(row.getStorageKey()) && storage.exists(row.getThumbKey()));
        mvc.perform(get("/api/media/" + row.getId() + "/content").header("Authorization", "Bearer " + a.token())).andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isNotFound());
        sweepAsIfLater();
        assertTrue(assets.findById(row.getId()).isEmpty(), "the upload is discarded, never completed: the client never got a 201");
        assertFalse(storage.exists(row.getStorageKey()));
        assertFalse(storage.exists(row.getThumbKey()));
    }

    @Test
    void failureOrCrashDuringDeletionIsRetried() throws Exception {
        Account a = signup();
        UUID id = UUID.fromString(mvcUpload(a));
        MediaAsset row = assets.findById(id).orElseThrow();
        jdbc.update("update media_assets set status = 'DELETING' where id = ?", id);

        // the first object is deleted, deleting the second fails (or the process dies right there)
        AtomicInteger calls = new AtomicInteger();
        doAnswer(inv -> {
            if (calls.incrementAndGet() == 2) throw new IOException("second delete fails");
            return inv.callRealMethod();
        }).when(storage).delete(anyString());
        MediaSweeper.Result r1 = sweeper.sweepOnce(Instant.now());
        assertTrue(r1.pending() >= 1);
        MediaAsset after = assets.findById(id).orElseThrow();
        assertEquals(MediaStatus.DELETING, after.getStatus(), "the row stays until both objects are confirmed gone");
        assertEquals(1, after.getDeleteAttempts());
        reset(storage);
        assertFalse(storage.exists(row.getStorageKey()), "first object already gone");
        assertTrue(storage.exists(row.getThumbKey()), "second object still there");
        assertEquals(1, assets.countByOwner(a.id()), "and still holds quota");

        sweeper.sweepOnce(Instant.now());
        assertTrue(assets.findById(id).isEmpty());
        assertFalse(storage.exists(row.getThumbKey()));
    }

    @Test
    void aCrashBetweenTheLastObjectDeleteAndTheRowDeleteJustRepeatsHarmlessDeletes() throws Exception {
        Account a = signup();
        UUID id = UUID.fromString(mvcUpload(a));
        MediaAsset row = assets.findById(id).orElseThrow();
        jdbc.update("update media_assets set status = 'DELETING' where id = ?", id);
        storage.delete(row.getStorageKey());
        storage.delete(row.getThumbKey());   // objects gone, row still there: exactly the state after that crash
        sweeper.sweepOnce(Instant.now());
        assertTrue(assets.findById(id).isEmpty());
    }

    // ---- the sweeper itself ----

    @Test
    void sweepingTwiceIsSafeAndTheSecondRunHasNothingToDo() throws Exception {
        Account a = signup();
        stubPut((k, inv) -> { if (k.contains("/thumb.")) throw new SimulatedCrash("x"); }, false);
        uploadExpectingCrash(a);
        reset(storage);
        sweepAsIfLater();
        MediaSweeper.Result second = sweeper.sweepOnce(Instant.now().plus(Duration.ofMinutes(31)));
        assertEquals(new MediaSweeper.Result(0, 0, 0), second);
        assertEquals(0, rowsOf(a).size());
    }

    @Test
    void theSweeperLeavesReadyAssetsAndFreshUploadsAlone() throws Exception {
        Account a = signup();
        UUID ready = UUID.fromString(mvcUpload(a));
        MediaAsset fresh = insertAsset(a.id(), MediaStatus.UPLOADING, 10, 10, Instant.now());
        sweeper.sweepOnce(Instant.now());
        assertEquals(MediaStatus.READY, assets.findById(ready).orElseThrow().getStatus());
        assertEquals(MediaStatus.UPLOADING, assets.findById(fresh.getId()).orElseThrow().getStatus());
        // 12b: an upload is stamped when it becomes READY, so the 24 h grace is already running; an unreferenced asset is purged once it is over
        sweeper.sweepOnce(Instant.now().plus(Duration.ofHours(23)));
        assertEquals(MediaStatus.READY, assets.findById(ready).orElseThrow().getStatus());
        sweeper.sweepOnce(Instant.now().plus(Duration.ofHours(25)));
        assertTrue(assets.findById(ready).isEmpty());   // purged, then removed by the DELETING pass of the same sweep
        // an asset with NO stamp (orphaned by a cascade) is stamped first and never purged in the pass that stamped it
        MediaAsset unstamped = insertAsset(a.id(), MediaStatus.READY, 10, 10, Instant.now());
        sweeper.sweepOnce(Instant.now().plus(Duration.ofDays(30)));
        MediaAsset after = assets.findById(unstamped.getId()).orElseThrow();
        assertEquals(MediaStatus.READY, after.getStatus());
        assertNotNull(after.getUnreferencedSince());
        sweeper.sweepOnce(Instant.now().plus(Duration.ofDays(30)));
        assertTrue(assets.findById(unstamped.getId()).isEmpty());
    }

    @Test
    void twoSweepersRacingOnTheSameRowBothFinishCleanly() throws Exception {
        Account a = signup();
        UUID id = UUID.fromString(mvcUpload(a));
        jdbc.update("update media_assets set status = 'DELETING' where id = ?", id);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<MediaSweeper.Result>> fs = new ArrayList<>();
        for (int i = 0; i < 2; i++) fs.add(pool.submit(() -> { go.await(); return sweeper.sweepOnce(Instant.now()); }));
        go.countDown();
        for (var f : fs) f.get();   // neither throws
        pool.shutdown();
        assertTrue(assets.findById(id).isEmpty());
    }

    @Test
    void aRowTheSweeperAlreadyTookCanNeverBecomeReadyAgain() throws Exception {
        Account a = signup();
        MediaAsset row = insertAsset(a.id(), MediaStatus.DELETING, 10, 10, Instant.now());
        assertThrows(com.codemastery.media.MediaException.class, () -> mediaTx.markReady(row.getId()), "a slow upload finishing after its row was expired must fail, not resurrect it");
        assertEquals(MediaStatus.DELETING, assets.findById(row.getId()).orElseThrow().getStatus());
        mediaTx.markDeleting(row.getId());   // idempotent
        assertEquals(MediaStatus.DELETING, assets.findById(row.getId()).orElseThrow().getStatus());
    }

    // ------------------------------------------------------------------------------------------------------------------
    // 12b review: an active upload must not be cleaned up underneath its own storage writes
    // ------------------------------------------------------------------------------------------------------------------
    /** Blocks the THUMBNAIL write of the next upload until released; the original has been written by then. */
    private static final class BlockedThumb {
        final CountDownLatch reached = new CountDownLatch(1), release = new CountDownLatch(1);
    }

    private BlockedThumb blockThumbnailWrite() throws IOException {
        BlockedThumb b = new BlockedThumb();
        doAnswer(inv -> {
            String key = inv.getArgument(0);
            if (key.contains("/thumb.")) {
                b.reached.countDown();
                assertTrue(b.release.await(30, java.util.concurrent.TimeUnit.SECONDS), "test never released the write");
            }
            return inv.callRealMethod();
        }).when(storage).put(anyString(), any(), anyString());
        return b;
    }

    private UUID onlyUploadingRowOf(Account a) {
        List<UUID> ids = jdbc.queryForList("select id from media_assets where owner_id = ? and status = 'UPLOADING'", UUID.class, a.id());
        assertEquals(1, ids.size());
        return ids.get(0);
    }

    private int objectsOf(UUID id) throws IOException {
        return (storage.exists("media/" + id + "/original.jpg") ? 1 : 0) + (storage.exists("media/" + id + "/thumb.jpg") ? 1 : 0);
    }

    @Test
    void aSlowUploadIsNotExpiredOrCleanedUpWhileItsThumbnailWriteIsStillRunning() throws Exception {
        Account a = signup();
        BlockedThumb b = blockThumbnailWrite();
        Future<MvcResult> upload = Executors.newSingleThreadExecutor().submit(() -> mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn());
        assertTrue(b.reached.await(20, java.util.concurrent.TimeUnit.SECONDS), "the upload never reached its thumbnail write");
        UUID id = onlyUploadingRowOf(a);
        assertEquals(1, objectsOf(id), "the original is written, the thumbnail is in flight");

        // 40 minutes pass (past media.upload-timeout) and the sweeper runs while the write is still open
        jdbc.update("update media_assets set created_at = ? where id = ?", java.sql.Timestamp.from(Instant.now().minus(Duration.ofMinutes(40))), id);
        MediaSweeper.Result r = sweeper.sweepOnce(Instant.now());
        assertEquals(0, r.expired(), "a live upload is never expired");
        assertEquals(MediaStatus.UPLOADING, assets.findById(id).orElseThrow().getStatus());
        assertEquals(1, objectsOf(id), "and nothing was deleted from under it");

        b.release.countDown();
        MvcResult done = upload.get(30, java.util.concurrent.TimeUnit.SECONDS);
        assertEquals(201, done.getResponse().getStatus());
        assertEquals(MediaStatus.READY, assets.findById(id).orElseThrow().getStatus());
        assertEquals(2, objectsOf(id), "both objects exist and are tracked");
        assertTrue(sweeper.sweepOnce(Instant.now()).expired() == 0);
    }

    /**
     * Defence in depth for the same sequence if the sweeper DID get there first (another instance, or a hung request that outlived its
     * registration): the row is gone when the late write completes. The upload's own cleanup deletes the id-derived keys directly,
     * so no untracked object remains.
     */
    @Test
    void aWriteThatCompletesAfterTheRowWasCleanedUpLeavesNoUntrackedObject() throws Exception {
        Account a = signup();
        BlockedThumb b = blockThumbnailWrite();
        Future<MvcResult> upload = Executors.newSingleThreadExecutor().submit(() -> mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn());
        assertTrue(b.reached.await(20, java.util.concurrent.TimeUnit.SECONDS));
        UUID id = onlyUploadingRowOf(a);
        // exactly what an expiry + cleanup does: the original is deleted and the row removed, while the thumbnail write is still open
        storage.delete("media/" + id + "/original.jpg");
        jdbc.update("delete from media_assets where id = ?", id);

        b.release.countDown();
        MvcResult done = upload.get(30, java.util.concurrent.TimeUnit.SECONDS);
        assertEquals(503, done.getResponse().getStatus(), "markReady cannot succeed without a row: the client is told to retry");
        assertEquals(0, objectsOf(id), "the late thumbnail was removed by the upload's own cleanup");
        assertFalse(java.nio.file.Files.exists(ROOT.resolve("media").resolve(id.toString()).resolve("thumb.jpg")));
        assertTrue(assets.findById(id).isEmpty());
    }

    @Test
    void aCrashedUploadStillGetsExpiredBecauseTheRegistryDiesWithTheProcess() throws Exception {
        // the simulated crash (an Error, no cleanup) must release the registration in the finally, like a dead process would
        Account a = signup();
        doAnswer(inv -> { String key = inv.getArgument(0); Object r = inv.callRealMethod(); if (key.contains("/thumb.")) throw new SimulatedCrash("after both objects"); return r; })
                .when(storage).put(anyString(), any(), anyString());
        try {
            mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn();
        } catch (Throwable expected) {
            assertTrue(causedBy(expected, SimulatedCrash.class));
        }
        reset(storage);
        UUID id = onlyUploadingRowOf(a);
        jdbc.update("update media_assets set created_at = ? where id = ?", java.sql.Timestamp.from(Instant.now().minus(Duration.ofMinutes(40))), id);
        assertEquals(1, sweeper.sweepOnce(Instant.now()).expired());
        assertTrue(assets.findById(id).isEmpty());
        assertEquals(0, objectsOf(id));
    }

    private String mvcUpload(Account a) throws Exception {
        MvcResult r = mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn();
        assertEquals(201, r.getResponse().getStatus());
        return read(r).get("id").asText();
    }
}
