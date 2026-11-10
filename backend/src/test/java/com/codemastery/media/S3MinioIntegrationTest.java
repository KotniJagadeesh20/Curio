package com.codemastery.media;

import static org.junit.jupiter.api.Assertions.*;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.ListMultipartUploadsResponse;
import software.amazon.awssdk.services.s3.model.ListObjectVersionsResponse;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;

/**
 * S3-specific guarantees against a real S3-compatible server: nothing partial is ever visible, no multipart upload is ever created,
 * and misconfiguration fails loudly. Skipped unless MINIO_TEST_ENDPOINT is set. Each test works under its own key prefix.
 */
@EnabledIfEnvironmentVariable(named = MinioSupport.ENV, matches = ".+")
class S3MinioIntegrationTest {
    private S3Client admin;
    private S3MediaStorage storage;
    private String prefix;

    @BeforeEach
    void open() {
        admin = MinioSupport.admin();
        prefix = "it-" + UUID.randomUUID() + "/";
        storage = S3MediaStorage.create(MinioSupport.config(MinioSupport.bucket(), prefix));
    }

    @AfterEach
    void cleanUp() {
        admin.listObjectsV2(r -> r.bucket(MinioSupport.bucket()).prefix(prefix)).contents()
                .forEach(o -> admin.deleteObject(d -> d.bucket(MinioSupport.bucket()).key(o.key())));
        storage.close();
        admin.close();
    }

    private long objectsUnderPrefix() {
        return admin.listObjectsV2(r -> r.bucket(MinioSupport.bucket()).prefix(prefix)).contents().size();
    }

    private long multipartUploadsUnderPrefix() {
        ListMultipartUploadsResponse r = admin.listMultipartUploads(b -> b.bucket(MinioSupport.bucket()).prefix(prefix));
        return r.uploads().size();
    }

    @Test
    void successfulUploadIsASingleObjectWithItsContentTypeAndNoMultipartUpload() throws IOException {
        byte[] data = new byte[2 * 1024 * 1024];
        new java.util.Random(7).nextBytes(data);
        storage.put("media/a/original.jpg", new ByteArrayInputStream(data), data.length, "image/jpeg");
        assertEquals(1, objectsUnderPrefix());
        assertEquals(0, multipartUploadsUnderPrefix());
        var head = admin.headObject(r -> r.bucket(MinioSupport.bucket()).key(prefix + "media/a/original.jpg"));
        assertEquals("image/jpeg", head.contentType());
        assertEquals(data.length, head.contentLength());
        try (var in = storage.open("media/a/original.jpg")) { assertArrayEquals(data, in.readAllBytes()); }
    }

    @Test
    void shortLongAndFailingStreamsLeaveNoObjectAndNoMultipartUpload() {
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", new ByteArrayInputStream(new byte[5]), 10, "image/jpeg"));
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", new ByteArrayInputStream(new byte[10]), 5, "image/jpeg"));
        assertThrows(IOException.class, () -> storage.put("media/a/original.jpg", new java.io.InputStream() {
            @Override public int read() throws IOException { throw new IOException("boom"); }
        }, 4_000_000, "image/jpeg"));
        assertEquals(0, objectsUnderPrefix());
        assertEquals(0, multipartUploadsUnderPrefix());
    }

    @Test
    void aClientThatDiesMidUploadLeavesNothingVisibleAndNoMultipartUpload() throws Exception {
        // What an interrupted upload looks like to the store: a valid signed PUT that announces 100 000 bytes, sends 1 000 and disconnects.
        String key = prefix + "media/cut/original.jpg";
        try (S3Presigner presigner = S3Presigner.builder().region(Region.of("us-east-1")).endpointOverride(URI.create(MinioSupport.endpoint()))
                .credentialsProvider(StaticCredentialsProvider.create(AwsBasicCredentials.create(MinioSupport.accessKey(), MinioSupport.secretKey())))
                .serviceConfiguration(software.amazon.awssdk.services.s3.S3Configuration.builder().pathStyleAccessEnabled(true).build()).build()) {
            URI url = presigner.presignPutObject(r -> r.signatureDuration(Duration.ofMinutes(5))
                    .putObjectRequest(p -> p.bucket(MinioSupport.bucket()).key(key))).url().toURI();
            try (Socket s = new Socket(url.getHost(), url.getPort())) {
                OutputStream out = s.getOutputStream();
                out.write(("PUT " + url.getRawPath() + "?" + url.getRawQuery() + " HTTP/1.1\r\nHost: " + url.getHost() + ":" + url.getPort()
                        + "\r\nContent-Length: 100000\r\n\r\n").getBytes(StandardCharsets.US_ASCII));
                out.write(new byte[1000]);
                out.flush();
            }   // closed without the rest
        }
        Thread.sleep(500);
        assertEquals(0, objectsUnderPrefix(), "an unfinished PUT is not committed");
        assertEquals(0, multipartUploadsUnderPrefix());
        assertFalse(storage.exists("media/cut/original.jpg"));
    }

    @Test
    void aFailedOverwriteKeepsTheOldObjectAndOpenDeleteExistsBehave() throws IOException {
        storage.put("media/a/thumb.png", new byte[] {7, 7, 7}, "image/png");
        assertThrows(IOException.class, () -> storage.put("media/a/thumb.png", new ByteArrayInputStream(new byte[1]), 2, "image/png"));
        try (var in = storage.open("media/a/thumb.png")) { assertArrayEquals(new byte[] {7, 7, 7}, in.readAllBytes()); }
        storage.delete("media/a/thumb.png");
        storage.delete("media/a/thumb.png");
        assertFalse(storage.exists("media/a/thumb.png"));
        assertThrows(java.nio.file.NoSuchFileException.class, () -> storage.open("media/a/thumb.png"));
    }

    @Test
    void theKeyPrefixIsAppliedAndNothingIsWrittenOutsideIt() throws IOException {
        storage.put("media/a/original.jpg", new byte[] {1}, "image/jpeg");
        assertEquals(prefix + "media/a/original.jpg", admin.listObjectsV2(r -> r.bucket(MinioSupport.bucket()).prefix(prefix)).contents().get(0).key());
        assertTrue(admin.listObjectsV2(r -> r.bucket(MinioSupport.bucket()).prefix("media/")).contents().stream().noneMatch(o -> o.key().endsWith(prefix + "media/a/original.jpg") && o.key().startsWith("media/")));
    }

    @Test
    void aMissingBucketOrBadCredentialsFailLoudly() {
        S3MediaStorage missing = S3MediaStorage.create(MinioSupport.config("no-such-bucket-" + UUID.randomUUID(), ""));
        try {
            assertThrows(IllegalStateException.class, missing::verifyBucket, "startup check");
            assertThrows(IOException.class, () -> missing.put("media/a/original.jpg", new byte[] {1}, "image/jpeg"));
            assertThrows(IOException.class, () -> missing.exists("media/a/original.jpg"), "a missing bucket is not 'the object is absent'");
        } finally { missing.close(); }
        var bad = new MediaProperties.S3(MinioSupport.bucket(), "us-east-1", MinioSupport.endpoint(), true, "wrong", "wrong-secret-key", "", org.springframework.util.unit.DataSize.ofMegabytes(32));
        S3MediaStorage denied = S3MediaStorage.create(bad);
        try {
            assertThrows(IllegalStateException.class, denied::verifyBucket);
            assertThrows(IOException.class, () -> denied.put("media/a/original.jpg", new byte[] {1}, "image/jpeg"));
        } finally { denied.close(); }
    }
}
