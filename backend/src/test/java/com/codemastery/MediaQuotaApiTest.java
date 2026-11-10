package com.codemastery;

import static com.codemastery.media.MediaFixtures.*;
import static org.junit.jupiter.api.Assertions.*;

import com.codemastery.media.MediaAsset;
import com.codemastery.media.MediaStatus;
import com.codemastery.media.MediaSweeper;
import com.codemastery.media.MediaTx;
import com.codemastery.user.UserRepository;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Quotas (3 assets, 300 KB): atomic under concurrency, counting every status and the actual stored bytes. */
@TestPropertySource(properties = {"media.quota-assets=3", "media.quota-bytes=300KB"})
class MediaQuotaApiTest extends MediaApiTestSupport {
    @Autowired MediaSweeper sweeper;
    @Autowired MediaTx mediaTx;
    @Autowired UserRepository users;
    @Autowired PlatformTransactionManager txm;

    private List<MvcResult> uploadConcurrently(String token, int n, byte[][] images) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(n);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<MvcResult>> fs = new ArrayList<>();
        for (int i = 0; i < n; i++) {
            byte[] img = images[i % images.length];
            fs.add(pool.submit(() -> {
                go.await();
                return mvc.perform(upload(token, "a.jpg", "image/jpeg", img)).andReturn();
            }));
        }
        go.countDown();
        List<MvcResult> out = new ArrayList<>();
        for (Future<MvcResult> f : fs) out.add(f.get());
        pool.shutdown();
        return out;
    }

    private static long count(List<MvcResult> rs, int status) {
        return rs.stream().filter(r -> r.getResponse().getStatus() == status).count();
    }

    @Test
    void concurrentUploadsCannotExceedTheAssetQuota() throws Exception {
        Account a = signup();
        List<MvcResult> rs = uploadConcurrently(a.token(), 10, new byte[][] {jpeg(100, 100)});
        assertEquals(3, count(rs, 201), "exactly the quota succeeds");
        assertEquals(7, count(rs, 409));
        for (MvcResult r : rs) if (r.getResponse().getStatus() == 409) assertEquals("MEDIA_QUOTA", read(r).get("code").asText());
        assertEquals(3, assets.countByOwner(a.id()));
    }

    @Test
    void concurrentUploadsCannotExceedTheByteQuota() throws Exception {
        Account a = signup();
        byte[] noise = noiseJpeg(300, 300, 7);
        long per = uploadSizeOf(noise);
        assertTrue(2 * per <= 300 * 1024 && 3 * per > 300 * 1024, "fixture assumption: two fit, three don't (per asset " + per + " bytes)");
        Account b = signup();
        List<MvcResult> rs = uploadConcurrently(b.token(), 8, new byte[][] {noise});
        assertEquals(2, count(rs, 201));
        assertEquals(6, count(rs, 409));
        assertTrue(assets.storedBytesByOwner(b.id()) <= 300 * 1024);
    }

    /** Uploads once with a throw-away user and returns what quota it consumed (original + thumbnail, as stored). */
    private long uploadSizeOf(byte[] img) throws Exception {
        Account probe = signup();
        MvcResult r = mvc.perform(upload(probe.token(), "a.jpg", "image/jpeg", img)).andReturn();
        assertEquals(201, r.getResponse().getStatus());
        return assets.storedBytesByOwner(probe.id());
    }

    @Test
    void quotaCountsActualStoredOutputBytesIncludingTheThumbnail() throws Exception {
        Account a = signup();
        MvcResult r = mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", jpeg(1600, 900))).andReturn();
        assertEquals(201, r.getResponse().getStatus());
        MediaAsset row = assets.findById(java.util.UUID.fromString(read(r).get("id").asText())).orElseThrow();
        assertTrue(row.getThumbSizeBytes() > 0 && row.getSizeBytes() > row.getThumbSizeBytes());
        assertEquals(row.getSizeBytes() + row.getThumbSizeBytes(), assets.storedBytesByOwner(a.id()), "original + thumbnail, not the uploaded size");
    }

    @Test
    void everyStatusCountsUntilTheRowIsGone() throws Exception {
        Account a = signup();
        insertAsset(a.id(), MediaStatus.UPLOADING, 10, 10, Instant.now());
        insertAsset(a.id(), MediaStatus.READY, 10, 10, Instant.now());
        MediaAsset deleting = insertAsset(a.id(), MediaStatus.DELETING, 10, 10, Instant.now());
        assertEquals(409, mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn().getResponse().getStatus(),
                "UPLOADING, READY and DELETING all hold quota");

        // the DELETING row's objects are already gone, but it keeps counting until the sweeper removes the row
        assertEquals(409, mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn().getResponse().getStatus());
        sweeper.sweepOnce(Instant.now());
        assertTrue(assets.findById(deleting.getId()).isEmpty());
        assertEquals(201, mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn().getResponse().getStatus(), "released once the row is removed");
    }

    @Test
    void bytesFromEveryStatusCountToo() throws Exception {
        Account a = signup();
        insertAsset(a.id(), MediaStatus.DELETING, 150 * 1024, 100 * 1024, Instant.now());   // 250 KB held by a half-deleted asset
        assertEquals(409, mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", noiseJpeg(300, 300, 3))).andReturn().getResponse().getStatus());
        assertEquals(201, mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn().getResponse().getStatus(), "a small image still fits in the 50 KB left");
    }

    @Test
    void quotaIsPerUser() throws Exception {
        Account a = signup(), b = signup();
        for (int i = 0; i < 3; i++) assertEquals(201, mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn().getResponse().getStatus());
        assertEquals(409, mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn().getResponse().getStatus());
        assertEquals(201, mvc.perform(upload(b.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andReturn().getResponse().getStatus());
    }

    // ---- the reserve and release paths take the same users-row lock ----

    /** Holds the owner's users-row lock in one transaction and reports whether {@code op} finished while it was held. */
    private boolean finishesWhileUserIsLocked(long userId, Runnable op) throws Exception {
        CountDownLatch locked = new CountDownLatch(1);
        AtomicBoolean opDone = new AtomicBoolean(), doneWhileLocked = new AtomicBoolean();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<?> holder = pool.submit(() -> new TransactionTemplate(txm).executeWithoutResult(s -> {
            users.lockById(userId);
            locked.countDown();
            try { Thread.sleep(700); } catch (InterruptedException e) { throw new RuntimeException(e); }
            doneWhileLocked.set(opDone.get());
        }));
        Future<?> worker = pool.submit(() -> {
            try { locked.await(); } catch (InterruptedException e) { throw new RuntimeException(e); }
            op.run();
            opDone.set(true);
        });
        holder.get();
        worker.get();
        pool.shutdown();
        assertTrue(opDone.get());
        return doneWhileLocked.get();
    }

    @Test
    void reservingQuotaWaitsForTheUsersRowLock() throws Exception {
        Account a = signup();
        var processed = processor().process(resource("plain.jpg"), "image/jpeg", "a.jpg");
        assertFalse(finishesWhileUserIsLocked(a.id(), () -> mediaTx.reserve(a.id(), java.util.UUID.randomUUID(), processed)),
                "reserve must block on the users-row lock, or two uploads can pass the same quota check");
    }

    @Test
    void releasingQuotaWaitsForTheUsersRowLock() throws Exception {
        Account a = signup();
        MediaAsset row = insertAsset(a.id(), MediaStatus.DELETING, 10, 10, Instant.now());
        assertFalse(finishesWhileUserIsLocked(a.id(), () -> assertTrue(mediaTx.removeRow(row.getId()))),
                "the final row delete (the quota release) follows the same locking rule");
        assertTrue(assets.findById(row.getId()).isEmpty());
    }
}
