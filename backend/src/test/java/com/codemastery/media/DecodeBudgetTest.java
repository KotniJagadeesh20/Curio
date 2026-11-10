package com.codemastery.media;

import static org.junit.jupiter.api.Assertions.*;

import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class DecodeBudgetTest {
    @Test
    void mbForRoundsUpWithoutOverflow() {
        assertEquals(1, DecodeBudget.mbFor(0));
        assertEquals(1, DecodeBudget.mbFor(1));
        assertEquals(1, DecodeBudget.mbFor(1 << 20));
        assertEquals(2, DecodeBudget.mbFor((1 << 20) + 1));
        assertEquals(191, DecodeBudget.mbFor(200_000_000L));
        assertEquals(Integer.MAX_VALUE, DecodeBudget.mbFor(Long.MAX_VALUE));   // no overflow from adding the rounding before shifting
    }

    @Test
    void tasksThatDoNotFitTogetherNeverRunTogether() throws Exception {
        DecodeBudget b = new DecodeBudget(4, Long.MAX_VALUE);
        AtomicInteger inFlight = new AtomicInteger(), peak = new AtomicInteger();
        ExecutorService pool = Executors.newFixedThreadPool(6);
        List<java.util.concurrent.Future<?>> fs = new ArrayList<>();
        for (int i = 0; i < 6; i++) {
            fs.add(pool.submit(() -> b.run(3, Duration.ofSeconds(10), () -> {
                peak.accumulateAndGet(inFlight.incrementAndGet(), Math::max);
                try { Thread.sleep(30); } catch (InterruptedException e) { throw new RuntimeException(e); }
                inFlight.decrementAndGet();
                return null;
            })));
        }
        for (var f : fs) f.get();
        pool.shutdown();
        assertEquals(1, peak.get(), "3 MB tasks in a 4 MB budget must run one at a time");
        assertEquals(4, b.available(), "everything is released");
    }

    @Test
    void waitingTooLongIsBusyAndLeaksNothing() throws Exception {
        DecodeBudget b = new DecodeBudget(4, Long.MAX_VALUE);
        CountDownLatch holding = new CountDownLatch(1), release = new CountDownLatch(1);
        Thread t = new Thread(() -> b.run(4, Duration.ofSeconds(5), () -> {
            holding.countDown();
            try { release.await(); } catch (InterruptedException ignored) { }
            return null;
        }));
        t.start();
        assertTrue(holding.await(5, TimeUnit.SECONDS));
        MediaException e = assertThrows(MediaException.class, () -> b.run(1, Duration.ofMillis(50), () -> null));
        assertEquals("MEDIA_BUSY", e.code());
        assertEquals(503, e.status().value());
        release.countDown();
        t.join();
        assertEquals(4, b.available());
    }

    @Test
    void aFailingTaskStillReleasesItsShare() {
        DecodeBudget b = new DecodeBudget(4, Long.MAX_VALUE);
        assertThrows(IllegalStateException.class, () -> b.run(4, Duration.ofSeconds(1), () -> { throw new IllegalStateException("boom"); }));
        assertEquals(4, b.available());
    }

    @Test
    void aBudgetAbove25PercentOfTheHeapRefusesToStart() {
        assertThrows(IllegalStateException.class, () -> new DecodeBudget(256, 512L * 1024 * 1024));   // 25% of 512 MB is 128 MB
        assertDoesNotThrow(() -> new DecodeBudget(128, 512L * 1024 * 1024));
        // upload input buffers count against the same allowance
        assertThrows(IllegalStateException.class, () -> new DecodeBudget(120, 512L * 1024 * 1024, 11));
        assertDoesNotThrow(() -> new DecodeBudget(117, 512L * 1024 * 1024, 11));
    }

    @Test
    void theConfiguredBudgetCountsTheUploadInputBuffersAgainstTheHeap() {
        MediaProperties props = MediaFixtures.props(256);   // 4 concurrent uploads x (2 x 5 MB + 1 MB) = 44 MB of input buffers
        assertEquals(44, props.inputBufferMb());
        assertEquals(256, DecodeBudget.of(props, 2048L * 1024 * 1024).total());   // 25% of 2 GB = 512 MB: fits
        assertThrows(IllegalStateException.class, () -> DecodeBudget.of(props, 1100L * 1024 * 1024), "25% of 1100 MB is 275 MB, less than 256 + 44");
        assertDoesNotThrow(() -> DecodeBudget.of(props, 1200L * 1024 * 1024));
    }
}
