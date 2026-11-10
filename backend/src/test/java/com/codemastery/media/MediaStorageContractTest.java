package com.codemastery.media;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

/** What every {@link MediaStorage} backend must do (PLAN.md 12c: "storage contract tests run against both backends"). */
abstract class MediaStorageContractTest {
    abstract MediaStorage storage() throws Exception;

    private static byte[] bytes(int n, int seed) {
        byte[] b = new byte[n];
        new java.util.Random(seed).nextBytes(b);
        return b;
    }

    private static byte[] read(MediaStorage s, String key) throws IOException {
        try (InputStream in = s.open(key)) { return in.readAllBytes(); }
    }

    private static String key(String leaf) { return "media/" + java.util.UUID.randomUUID() + "/" + leaf; }

    @Test
    void uploadReadDelete() throws Exception {
        MediaStorage s = storage();
        String k = key("original.jpg");
        assertFalse(s.exists(k));
        s.put(k, new byte[] {1, 2, 3}, "image/jpeg");
        assertTrue(s.exists(k));
        assertArrayEquals(new byte[] {1, 2, 3}, read(s, k));
        s.delete(k);
        assertFalse(s.exists(k));
        assertThrows(IOException.class, () -> s.open(k), "reading a deleted object fails");
    }

    @Test
    void deleteIsIdempotent() throws Exception {
        MediaStorage s = storage();
        assertDoesNotThrow(() -> s.delete(key("original.jpg")));
        String k = key("thumb.png");
        s.put(k, new byte[] {1}, "image/png");
        s.delete(k);
        assertDoesNotThrow(() -> s.delete(k));
    }

    @Test
    void overwriteReplacesTheObject() throws Exception {
        MediaStorage s = storage();
        String k = key("original.jpg");
        s.put(k, new byte[] {7, 7, 7}, "image/jpeg");
        s.put(k, new byte[] {9}, "image/jpeg");
        assertArrayEquals(new byte[] {9}, read(s, k));
        s.delete(k);
    }

    @Test
    void emptyAndMultiMegabyteObjectsRoundTrip() throws Exception {
        MediaStorage s = storage();
        String empty = key("empty.png"), big = key("big.png");
        s.put(empty, new ByteArrayInputStream(new byte[0]), 0, "image/png");
        assertTrue(s.exists(empty));
        assertEquals(0, read(s, empty).length);
        byte[] data = bytes(3 * 1024 * 1024 + 17, 1);
        s.put(big, new ByteArrayInputStream(data), data.length, "image/png");
        assertArrayEquals(data, read(s, big));
        s.delete(empty);
        s.delete(big);
    }

    @Test
    void aStreamThatDisagreesWithItsDeclaredLengthLeavesNoObject() throws Exception {
        MediaStorage s = storage();
        String k = key("original.jpg");
        assertThrows(IOException.class, () -> s.put(k, new ByteArrayInputStream(new byte[5]), 10, "image/jpeg"), "shorter");
        assertThrows(IOException.class, () -> s.put(k, new ByteArrayInputStream(new byte[10]), 5, "image/jpeg"), "longer");
        assertFalse(s.exists(k));
    }

    @Test
    void aFailedOverwriteKeepsThePreviousObjectIntact() throws Exception {
        MediaStorage s = storage();
        String k = key("original.jpg");
        s.put(k, new byte[] {7, 7, 7}, "image/jpeg");
        InputStream failing = new InputStream() {
            int n;
            @Override public int read() throws IOException { throw new IOException("read failed"); }
            @Override public int read(byte[] b, int off, int len) throws IOException {
                if (n++ == 0) { Arrays.fill(b, off, off + 1000, (byte) 9); return 1000; }
                throw new IOException("disk or network failed mid-stream");
            }
        };
        assertThrows(IOException.class, () -> s.put(k, failing, 5000, "image/jpeg"));
        assertArrayEquals(new byte[] {7, 7, 7}, read(s, k));
        String fresh = key("original.jpg");
        assertThrows(IOException.class, () -> s.put(fresh, new InputStream() {
            @Override public int read() throws IOException { throw new IOException("boom"); }
        }, 10, "image/jpeg"));
        assertFalse(s.exists(fresh), "a failed first write never becomes visible");
        s.delete(k);
    }

    @Test
    void anEndlessStreamIsNotConsumedBeyondOneByteAfterItsDeclaredLength() throws Exception {
        MediaStorage s = storage();
        long[] consumed = {0};
        InputStream endless = new InputStream() {
            @Override public int read() { consumed[0]++; return 1; }
            @Override public int read(byte[] b, int off, int len) { consumed[0] += len; return len; }
        };
        String k = key("original.jpg");
        assertThrows(IOException.class, () -> s.put(k, endless, 1000, "image/jpeg"));
        assertEquals(1001, consumed[0]);
        assertFalse(s.exists(k));
    }

    @Test
    void noKeyCanEscapeOrBeMalformed() throws Exception {
        MediaStorage s = storage();
        for (String k : List.of("../secret.txt", "media/../../x", "/etc/passwd", "..", ".", "", "media//x", "media/./x", "media/a b", "media/.hidden", "a".repeat(300))) {
            assertThrows(IllegalArgumentException.class, () -> s.put(k, new byte[] {1}, "image/png"), "put " + k);
            assertThrows(IllegalArgumentException.class, () -> s.open(k), "open " + k);
            assertThrows(IllegalArgumentException.class, () -> s.delete(k), "delete " + k);
            assertThrows(IllegalArgumentException.class, () -> s.exists(k), "exists " + k);
        }
    }
}
