package com.codemastery.media;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.nio.file.NoSuchFileException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.Base64;
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials;
import software.amazon.awssdk.auth.credentials.AwsCredentialsProvider;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider;
import software.amazon.awssdk.core.checksums.RequestChecksumCalculation;
import software.amazon.awssdk.core.checksums.ResponseChecksumValidation;
import software.amazon.awssdk.core.client.config.ClientOverrideConfiguration;
import software.amazon.awssdk.core.exception.SdkException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.http.apache.ApacheHttpClient;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.S3Configuration;
import software.amazon.awssdk.services.s3.model.NoSuchKeyException;
import software.amazon.awssdk.services.s3.model.S3Exception;

/**
 * Production backend: one private bucket on AWS S3 or an S3-compatible store (MinIO, R2). No ACLs, no presigned URLs: bytes only leave
 * through the application's own controllers, which apply the visibility rules.
 *
 * <p><b>Why {@code put} buffers (PLAN.md P7).</b> The {@link MediaStorage} contract says a stream that disagrees with its declared length
 * must leave no object. With S3 a streamed {@code PutObject} cannot honour that for an <i>overlong</i> stream: the SDK sends exactly
 * {@code Content-Length} bytes and never looks at the rest, so the object is committed with truncated content and the excess goes
 * unnoticed ({@code S3MediaStorageSdkBehaviourTest} demonstrates this against a recording server). A <i>short</i> stream is caught only
 * after the request is on the wire. So the stream is read here into a buffer of exactly {@code length} bytes plus a one-byte probe for
 * excess, <b>verified before any request is made</b>, and then sent as a replayable byte-array body with an explicit SHA-256 that S3 verifies
 * on its side. Consequences: heap per call is bounded by {@code media.s3.max-object-size} (larger objects are refused, they would need
 * multipart upload, which is deliberately not implemented); a single {@code PutObject} means there is no multipart upload to leave behind;
 * the SDK may retry because the body is replayable.
 *
 * <p><b>Visibility.</b> S3 makes an object visible only when a {@code PutObject} completes, and an overwrite replaces the old object
 * atomically, so no reader ever sees a partial object and a failed overwrite keeps the previous bytes. <b>Delete</b> is idempotent
 * (S3 answers 204 for a missing key). Unlike the local backend there are no temporary files to tidy.
 *
 * <p><b>Not covered:</b> if a database row is already gone and a direct delete fails, nothing retries it (see MediaService). Bucket
 * versioning and replication are production configuration (P8): on a versioned bucket {@code delete} leaves a delete marker and the old
 * bytes remain as a noncurrent version until a lifecycle rule removes them.
 */
public final class S3MediaStorage implements MediaStorage, AutoCloseable {
    static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(5);
    static final Duration SOCKET_TIMEOUT = Duration.ofSeconds(30);
    static final Duration ATTEMPT_TIMEOUT = Duration.ofSeconds(45);
    static final Duration CALL_TIMEOUT = Duration.ofMinutes(2);

    private final S3Client client;
    private final String bucket;
    private final String prefix;
    private final long maxObjectBytes;

    public S3MediaStorage(S3Client client, String bucket, String prefix, long maxObjectBytes) {
        if (bucket == null || bucket.isBlank()) throw new IllegalArgumentException("media.s3.bucket is required");
        if (maxObjectBytes < 1 || maxObjectBytes > Integer.MAX_VALUE - 8) throw new IllegalArgumentException("invalid maximum object size");
        this.client = client;
        this.bucket = bucket;
        this.prefix = prefix == null ? "" : prefix;
        this.maxObjectBytes = maxObjectBytes;
    }

    public static S3MediaStorage create(MediaProperties.S3 cfg) {
        return new S3MediaStorage(buildClient(cfg), cfg.bucket(), cfg.keyPrefix(), cfg.maxObjectSize().toBytes());
    }

    /**
     * Checksums are only sent when the API requires them (we add an explicit SHA-256 ourselves): the SDK's newer default of trailing
     * CRC32 in {@code aws-chunked} encoding is rejected by older MinIO and some other S3-compatible stores.
     */
    static S3Client buildClient(MediaProperties.S3 cfg) {
        var b = S3Client.builder()
                .region(Region.of(cfg.region()))
                .serviceConfiguration(S3Configuration.builder().pathStyleAccessEnabled(cfg.pathStyle()).build())
                .requestChecksumCalculation(RequestChecksumCalculation.WHEN_REQUIRED)
                .responseChecksumValidation(ResponseChecksumValidation.WHEN_REQUIRED)
                .httpClientBuilder(ApacheHttpClient.builder().connectionTimeout(CONNECT_TIMEOUT).socketTimeout(SOCKET_TIMEOUT))
                .overrideConfiguration(ClientOverrideConfiguration.builder().apiCallAttemptTimeout(ATTEMPT_TIMEOUT).apiCallTimeout(CALL_TIMEOUT).build());
        AwsCredentialsProvider creds = cfg.accessKey() == null || cfg.accessKey().isBlank()
                ? DefaultCredentialsProvider.create()
                : StaticCredentialsProvider.create(AwsBasicCredentials.create(cfg.accessKey(), cfg.secretKey()));
        b.credentialsProvider(creds);
        if (cfg.endpoint() != null && !cfg.endpoint().isBlank()) b.endpointOverride(URI.create(cfg.endpoint()));
        return b.build();
    }

    /** Fails fast at startup when the bucket is missing or unreachable, rather than at the first upload. */
    public void verifyBucket() {
        try {
            client.headBucket(r -> r.bucket(bucket));
        } catch (SdkException e) {
            throw new IllegalStateException("media.storage=s3 but bucket '" + bucket + "' is not reachable or does not exist: " + e.getMessage(), e);
        }
    }

    private String objectKey(String key) {
        LocalDiskMediaStorage.validateKey(key);   // the same strict, server-generated key shape for every backend
        return prefix + key;
    }

    @Override
    public void put(String key, InputStream data, long length, String contentType) throws IOException {
        String k = objectKey(key);
        if (length < 0 || length > maxObjectBytes) throw new IllegalArgumentException("object of " + length + " bytes is outside 0.." + maxObjectBytes);
        byte[] body = readExactly(data, (int) length);   // nothing has been sent yet: a bad stream cannot create an object
        try {
            client.putObject(r -> r.bucket(bucket).key(k).contentType(contentType).contentLength(length).checksumSHA256(sha256Base64(body)),
                    RequestBody.fromBytes(body));
        } catch (SdkException e) {
            throw wrap("put", e);
        }
    }

    /** Reads {@code length} bytes and then one more read to prove the stream has ended: at most {@code length + 1} bytes are consumed. */
    static byte[] readExactly(InputStream in, int length) throws IOException {
        byte[] buf = new byte[length];
        int off = 0;
        while (off < length) {
            int n = in.read(buf, off, length - off);
            if (n < 0) throw new IOException("stream held fewer bytes than the declared " + length);
            off += n;
        }
        if (in.read() != -1) throw new IOException("stream held more bytes than the declared " + length);
        return buf;
    }

    private static String sha256Base64(byte[] b) {
        try {
            return Base64.getEncoder().encodeToString(MessageDigest.getInstance("SHA-256").digest(b));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    @Override
    public InputStream open(String key) throws IOException {
        String k = objectKey(key);
        try {
            return client.getObject(r -> r.bucket(bucket).key(k));
        } catch (NoSuchKeyException e) {
            throw new NoSuchFileException(key);
        } catch (SdkException e) {
            throw wrap("open", e);
        }
    }

    @Override
    public void delete(String key) throws IOException {
        String k = objectKey(key);
        try {
            client.deleteObject(r -> r.bucket(bucket).key(k));
        } catch (SdkException e) {
            throw wrap("delete", e);
        }
    }

    @Override
    public boolean exists(String key) throws IOException {
        String k = objectKey(key);
        try {
            client.headObject(r -> r.bucket(bucket).key(k));
            return true;
        } catch (NoSuchKeyException e) {
            return false;
        } catch (S3Exception e) {
            if (e.statusCode() == 404 && !"NoSuchBucket".equals(e.awsErrorDetails() == null ? null : e.awsErrorDetails().errorCode())) return false;
            throw wrap("exists", e);
        } catch (SdkException e) {
            throw wrap("exists", e);
        }
    }

    private static IOException wrap(String op, SdkException e) {
        if (e instanceof software.amazon.awssdk.core.exception.AbortedException) Thread.currentThread().interrupt();
        return new IOException("S3 " + op + " failed: " + e.getMessage(), e);
    }

    @Override
    public void close() {
        client.close();
    }
}
