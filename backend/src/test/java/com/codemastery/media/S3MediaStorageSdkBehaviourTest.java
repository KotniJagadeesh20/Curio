package com.codemastery.media;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.NoSuchFileException;
import java.security.MessageDigest;
import java.util.Arrays;
import java.util.Base64;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.util.unit.DataSize;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;

/**
 * P7: what the AWS SDK v2 (pinned in the pom) really does with a body stream, observed on the wire against a recording server, and what
 * {@link S3MediaStorage} therefore does instead. The "SDK behaviour" tests are tripwires: if an SDK upgrade changes them, the reasoning in
 * {@code S3MediaStorage}'s Javadoc must be re-checked. They show plain-HTTP behaviour only; HTTPS behaviour (unsigned payload) and real
 * stores are covered by the MinIO tests and, for a real bucket, P3/P8.
 */
class S3MediaStorageSdkBehaviourTest {
    private FakeS3Server server;
    private S3Client client;
    private S3MediaStorage storage;
    private final AtomicLong started = new AtomicLong();

    @BeforeEach
    void start() throws IOException {
        server = new FakeS3Server();
        server.onHeaders = r -> { if (r.method().equals("PUT")) started.incrementAndGet(); };
        client = S3MediaStorage.buildClient(new MediaProperties.S3("b", "us-east-1", server.endpoint(), true, "k", "s", "", DataSize.ofMegabytes(32)));
        storage = new S3MediaStorage(client, "b", "pre/", 1 << 20);
    }

    @AfterEach
    void stop() {
        client.close();
        server.close();
    }

    private static byte[] bytes(int n, int seed) {
        byte[] b = new byte[n];
        new java.util.Random(seed).nextBytes(b);
        return b;
    }

    private void sdkPut(String key, InputStream in, long declared) {
        client.putObject(r -> r.bucket("b").key(key).contentLength(declared), RequestBody.fromInputStream(in, declared));
    }

    // ---- what the SDK does with a stream ----

    @Test
    void sdkSilentlyTruncatesAnOverlongStreamAndReportsSuccess() {
        byte[] data = bytes(1000, 1);
        sdkPut("over", new ByteArrayInputStream(data), 600);   // no exception
        assertEquals(1, started.get());
        assertArrayEquals(Arrays.copyOf(data, 600), server.objects.get("b/over"), "a committed object holding only the first 600 bytes: the contract violation S3MediaStorage must prevent");
    }

    @Test
    void sdkNoticesAShortStreamOnlyAfterTheRequestIsOnTheWireAndWithANonSdkException() {
        assertThrows(IllegalStateException.class, () -> sdkPut("short", new ByteArrayInputStream(bytes(600, 2)), 1000),
                "not an SdkException, so a catch (SdkException) alone would let it escape");
        assertEquals(1, started.get(), "the headers (with the full Content-Length) were already sent");
        assertFalse(server.objects.containsKey("b/short"), "the incomplete body was not committed");
    }

    @Test
    void sdkStreamsTheBodyLazilyInsteadOfBufferingItBeforeSending() {
        AtomicLong read = new AtomicLong(), readWhenHeadersArrived = new AtomicLong(-1);
        server.onHeaders = r -> { if (r.method().equals("PUT")) readWhenHeadersArrived.compareAndSet(-1, read.get()); };
        InputStream spy = new ByteArrayInputStream(bytes(2_000_000, 3)) {
            @Override public synchronized int read(byte[] b, int off, int len) { int n = super.read(b, off, len); if (n > 0) read.addAndGet(n); return n; }
        };
        sdkPut("big", spy, 2_000_000);
        assertEquals(0, readWhenHeadersArrived.get(), "no pre-read: a bad stream would fail after the request has started");
        assertEquals(2_000_000, read.get());
    }

    // ---- what S3MediaStorage does instead ----

    @Test
    void putSendsExactlyTheDeclaredBytesWithAChecksumAndNoAclOrTrailer() throws Exception {
        byte[] data = bytes(300_000, 4);
        storage.put("media/a/original.jpg", new ByteArrayInputStream(data), data.length, "image/jpeg");
        var req = server.requests.stream().filter(r -> r.method().equals("PUT")).findFirst().orElseThrow();
        assertEquals("/b/pre/media/a/original.jpg", req.path(), "bucket, prefix, key");
        assertArrayEquals(data, server.objects.get("b/pre/media/a/original.jpg"));
        assertEquals("image/jpeg", req.header("content-type"));
        assertEquals(Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(data)), req.header("x-amz-checksum-sha256"), "S3 verifies the bytes server-side");
        assertNull(req.header("x-amz-acl"), "private bucket, never an ACL");
        assertNull(req.header("x-amz-trailer"), "no trailing CRC32: stores that predate it would reject the request");
        assertEquals(String.valueOf(data.length), req.header("x-amz-decoded-content-length") != null ? req.header("x-amz-decoded-content-length") : req.header("content-length"));
    }

    @Test
    void aStreamThatDisagreesWithItsLengthIsRefusedBeforeAnyRequestIsMade() {
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", new ByteArrayInputStream(new byte[5]), 10, "image/jpeg"), "shorter");
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", new ByteArrayInputStream(new byte[10]), 5, "image/jpeg"), "longer: the SDK alone would have truncated it");
        assertEquals(0, started.get(), "nothing was sent, so nothing can be committed");
        assertTrue(server.objects.isEmpty());
        assertTrue(server.requests.isEmpty());
    }

    @Test
    void anEndlessStreamIsReadAtMostOneByteBeyondItsDeclaredLength() {
        long[] consumed = {0};
        InputStream endless = new InputStream() {
            @Override public int read() { consumed[0]++; return 1; }
            @Override public int read(byte[] b, int off, int len) { consumed[0] += len; return len; }
        };
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", endless, 1000, "image/jpeg"));
        assertEquals(1001, consumed[0]);
        assertTrue(server.requests.isEmpty());
    }

    @Test
    void aStreamThatFailsMidwayCreatesNothing() {
        InputStream failing = new InputStream() {
            int n;
            @Override public int read() throws IOException { throw new IOException("boom"); }
            @Override public int read(byte[] b, int off, int len) throws IOException {
                if (n++ == 0) { Arrays.fill(b, off, off + 100, (byte) 1); return 100; }
                throw new IOException("network failed mid-stream");
            }
        };
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", failing, 5000, "image/jpeg"));
        assertTrue(server.requests.isEmpty());
    }

    @Test
    void anObjectOverTheConfiguredMaximumIsRefusedBeforeBufferingOrSending() {
        assertThrows(IllegalArgumentException.class, () -> storage.put("media/a/original.jpg", new ByteArrayInputStream(new byte[0]), (1 << 20) + 1, "image/jpeg"));
        assertThrows(IllegalArgumentException.class, () -> storage.put("media/a/original.jpg", new ByteArrayInputStream(new byte[0]), -1, "image/jpeg"));
        assertTrue(server.requests.isEmpty());
    }

    @Test
    void hostileKeysAreRefusedBeforeAnyRequest() {
        for (String key : List.of("../x", "/etc/passwd", "media//x", "media/a b", "", "media/.hidden", "a".repeat(300))) {
            assertThrows(IllegalArgumentException.class, () -> storage.put(key, new byte[] {1}, "image/png"), "put " + key);
            assertThrows(IllegalArgumentException.class, () -> storage.open(key), "open " + key);
            assertThrows(IllegalArgumentException.class, () -> storage.delete(key), "delete " + key);
            assertThrows(IllegalArgumentException.class, () -> storage.exists(key), "exists " + key);
        }
        assertTrue(server.requests.isEmpty());
    }

    @Test
    void aServerErrorOnPutSurfacesAsIOExceptionAfterRetriesAndStoresNothing() {
        server.putStatus = 500;
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", new byte[] {1, 2, 3}, "image/jpeg"));
        assertTrue(server.objects.isEmpty());
        assertTrue(server.requests.stream().filter(r -> r.method().equals("PUT")).count() > 1, "the SDK retried: possible because the body is a replayable byte array");
    }

    @Test
    void aFailedOverwriteKeepsTheOriginalBytes() throws IOException {
        byte[] original = bytes(2000, 8);
        storage.put("media/a/original.jpg", original, "image/jpeg");
        server.putStatus = 500;   // the next PUT (and its retries) fail
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", bytes(3000, 9), "image/jpeg"));
        server.putStatus = 0;
        assertArrayEquals(original, server.objects.get("b/pre/media/a/original.jpg"), "the store still holds the original");
        try (InputStream in = storage.open("media/a/original.jpg")) { assertArrayEquals(original, in.readAllBytes()); }
    }

    @Test
    void aConnectionCutMidBodyIsAnIOExceptionAndNothingIsStored() {
        server.cutPutAfter = 100;
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", bytes(50_000, 5), "image/jpeg"));
        assertTrue(server.objects.isEmpty(), "an incomplete request body is never committed");
    }

    @Test
    void openExistsDeleteMapTheStoresAnswers() throws IOException {
        storage.put("media/a/original.jpg", new byte[] {1, 2, 3}, "image/jpeg");
        assertTrue(storage.exists("media/a/original.jpg"));
        try (InputStream in = storage.open("media/a/original.jpg")) { assertArrayEquals(new byte[] {1, 2, 3}, in.readAllBytes()); }
        storage.delete("media/a/original.jpg");
        assertFalse(storage.exists("media/a/original.jpg"));
        assertDoesNotThrow(() -> storage.delete("media/a/original.jpg"), "idempotent");
        assertThrows(NoSuchFileException.class, () -> storage.open("media/a/original.jpg"));
    }

    @Test
    void aFailureThatIsNotNotFoundIsNeverReportedAsAbsent() {
        server.beforeHandling = r -> { if (r.method().equals("HEAD")) throw new RuntimeException("force a 500"); };
        assertThrows(IOException.class, () -> storage.exists("media/a/original.jpg"));
    }
}
