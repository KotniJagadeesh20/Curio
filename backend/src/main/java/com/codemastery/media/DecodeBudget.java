package com.codemastery.media;

import java.time.Duration;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;

/**
 * Bounds image decoding by estimated memory (MB of raster), not by request count: one 25 MP image and many thumbnails
 * are very different loads. A request that can't get its share in time is refused with MEDIA_BUSY (503).
 */
public final class DecodeBudget {
    private final Semaphore permits;
    private final int total;
    private final java.util.concurrent.atomic.AtomicInteger peak = new java.util.concurrent.atomic.AtomicInteger();

    /** @param reservedMb other media memory counted against the same 25% allowance (upload input buffers) */
    public DecodeBudget(int budgetMb, long maxHeapBytes, int reservedMb) {
        long limit = maxHeapBytes / 4 / (1024 * 1024);
        if ((long) budgetMb + reservedMb > limit) {
            throw new IllegalStateException("media.decode-budget-mb=" + budgetMb + " plus " + reservedMb + " MB of upload buffers exceeds 25% of the heap (" + limit + " MB). Lower them or raise -Xmx.");
        }
        this.total = budgetMb;
        this.permits = new Semaphore(budgetMb, true);
    }

    public DecodeBudget(int budgetMb, long maxHeapBytes) { this(budgetMb, maxHeapBytes, 0); }

    /** The budget the application runs with: the configured decode budget, with the upload input buffers counted against the same heap allowance. */
    static DecodeBudget of(MediaProperties props, long maxHeapBytes) {
        return new DecodeBudget(props.decodeBudgetMb(), maxHeapBytes, props.inputBufferMb());
    }

    public int total() { return total; }

    public int available() { return permits.availablePermits(); }

    /** Highest budget in use at once since start (MB); for tests and monitoring. */
    public int peakUsedMb() { return peak.get(); }

    /** Whole MiB to reserve for an estimated peak of this many bytes (rounded up, at least 1). */
    static int mbFor(long bytes) {
        long mb = (bytes >> 20) + ((bytes & ((1 << 20) - 1)) != 0 ? 1 : 0);   // ceiling without the overflow of adding first
        return (int) Math.max(1, Math.min(Integer.MAX_VALUE, mb));
    }

    /** True when an image of this size could never fit the budget, however idle the server is. */
    boolean cannotEverFit(int mb) { return mb > total; }

    /** Runs the task holding {@code mb} of the budget, or throws MEDIA_BUSY if it can't be had within {@code wait}. */
    <T> T run(int mb, Duration wait, java.util.function.Supplier<T> task) {
        boolean got;
        try {
            got = permits.tryAcquire(mb, wait.toMillis(), TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw MediaException.busy();
        }
        if (!got) throw MediaException.busy();
        peak.accumulateAndGet(total - permits.availablePermits(), Math::max);
        try {
            return task.get();
        } finally {
            permits.release(mb);
        }
    }
}
