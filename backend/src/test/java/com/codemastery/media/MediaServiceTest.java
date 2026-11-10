package com.codemastery.media;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.codemastery.user.User;
import java.io.IOException;
import java.io.InputStream;
import java.time.Duration;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;

/** The service's own guards, with its collaborators mocked so each guard is exercised alone. */
class MediaServiceTest {
    private final ImageProcessor processor = mock(ImageProcessor.class);
    private final MediaStorage storage = mock(MediaStorage.class);
    private final MediaTx tx = mock(MediaTx.class);
    private final MediaCleanup cleanup = mock(MediaCleanup.class);
    private final User user = new User();

    MediaServiceTest() { user.setId(1L); }

    private MediaService service(int slots, Duration wait) {
        MediaProperties p = new MediaProperties("local", new MediaProperties.Local("x"), DataSize.ofMegabytes(5), 25_000_000L, 20_000, DataSize.ofMegabytes(200), 500,
                256, slots, wait, Duration.ofMinutes(30), Duration.ofMinutes(10), false, 2560, 640, 85);
        return new MediaService(p, processor, storage, tx, cleanup, new LiveUploads());
    }

    private static MockMultipartFile fileClaiming(long claimedSize, byte[] actual) {
        return new MockMultipartFile("file", "a.jpg", "image/jpeg", actual) {
            @Override public long getSize() { return claimedSize; }
        };
    }

    @Test
    void theCountedBytesCatchAFileWhoseDeclaredSizeLies() {
        byte[] six = new byte[6 * 1024 * 1024];
        MediaException e = assertThrows(MediaException.class, () -> service(4, Duration.ofSeconds(1)).upload(user, fileClaiming(10, six)));
        assertEquals("MEDIA_TOO_LARGE", e.code());
        verify(processor, never()).process(any(), any(), any());
    }

    @Test
    void theDeclaredSizeIsEnoughToRefuseWithoutReadingAnything() {
        MockMultipartFile hostile = new MockMultipartFile("file", "a.jpg", "image/jpeg", new byte[10]) {
            @Override public long getSize() { return 6L * 1024 * 1024; }
            @Override public InputStream getInputStream() { throw new AssertionError("must not be read"); }
        };
        MediaException e = assertThrows(MediaException.class, () -> service(4, Duration.ofSeconds(1)).upload(user, hostile));
        assertEquals("MEDIA_TOO_LARGE", e.code());
    }

    @Test
    void uploadsBeyondTheSlotsWaitWithoutReadingTheirBytesThenGetBusyAndSlotsAreAlwaysReleased() throws Exception {
        CountDownLatch inProcessor = new CountDownLatch(1), release = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        when(processor.process(any(), any(), any())).thenAnswer(inv -> {
            if (calls.incrementAndGet() == 1) { inProcessor.countDown(); release.await(); }
            throw MediaException.corrupt();   // every upload ends in a failure: the slot must be freed on that path too
        });
        MediaService svc = service(1, Duration.ofMillis(300));
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<?> first = pool.submit(() -> assertThrows(MediaException.class, () -> svc.upload(user, new MockMultipartFile("file", "a.jpg", "image/jpeg", new byte[10]))));
        assertTrue(inProcessor.await(5, TimeUnit.SECONDS));

        AtomicInteger streamsOpened = new AtomicInteger();
        MockMultipartFile second = new MockMultipartFile("file", "b.jpg", "image/jpeg", new byte[10]) {
            @Override public InputStream getInputStream() throws IOException { streamsOpened.incrementAndGet(); return super.getInputStream(); }
        };
        MediaException busy = assertThrows(MediaException.class, () -> svc.upload(user, second));
        assertEquals("MEDIA_BUSY", busy.code());
        assertEquals(0, streamsOpened.get(), "a waiting upload holds no bytes: the slot is taken before the file is read");

        release.countDown();
        first.get(5, TimeUnit.SECONDS);
        pool.shutdown();
        MediaException third = assertThrows(MediaException.class, () -> svc.upload(user, new MockMultipartFile("file", "c.jpg", "image/jpeg", new byte[10])));
        assertEquals("MEDIA_CORRUPT", third.code(), "the slot was released after the failure, so this one reached the processor");
        verify(processor, times(2)).process(any(), any(), any());
    }

    @Test
    void anUploadThatFailsAfterReservationIsCleanedUp() throws Exception {
        MediaAsset reserved = new MediaAsset();
        reserved.setId(java.util.UUID.randomUUID());
        reserved.setStorageKey("media/x/original.jpg");
        reserved.setThumbKey("media/x/thumb.jpg");
        when(processor.process(any(), any(), any())).thenReturn(new ProcessedImage("image/jpeg", new byte[3], 1, 1, "a", new byte[2], 1, 1, "b"));
        when(tx.reserve(any(), any(), any())).thenReturn(reserved);
        org.mockito.Mockito.doThrow(new IOException("disk full")).when(storage).put(anyString(), any(byte[].class), anyString());
        MediaException e = assertThrows(MediaException.class, () -> service(4, Duration.ofSeconds(1)).upload(user, new MockMultipartFile("file", "a.jpg", "image/jpeg", new byte[10])));
        assertEquals("MEDIA_STORAGE_FAILED", e.code());
        verify(tx).markDeleting(any());
        verify(cleanup).finalizeDeletion(any());
    }
}
