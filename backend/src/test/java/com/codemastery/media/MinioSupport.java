package com.codemastery.media;

import org.springframework.util.unit.DataSize;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.BucketAlreadyOwnedByYouException;

/**
 * Connection details for the S3-compatible integration tests. They run only when {@code MINIO_TEST_ENDPOINT} is set (for example
 * {@code http://localhost:9000}), like {@code V11MigrationPostgresTest} with {@code PG_TEST_URL}. Credentials default to the
 * throwaway {@code minioadmin} pair of docker-compose.yml; the bucket is created if absent. The server is whatever is at that endpoint:
 * the tests say nothing about a real AWS bucket (P3/P8).
 */
final class MinioSupport {
    static final String ENV = "MINIO_TEST_ENDPOINT";

    static String endpoint() { return System.getenv(ENV); }
    static String accessKey() { return System.getenv().getOrDefault("MINIO_TEST_ACCESS_KEY", "minioadmin"); }
    static String secretKey() { return System.getenv().getOrDefault("MINIO_TEST_SECRET_KEY", "minioadmin"); }
    static String bucket() { return System.getenv().getOrDefault("MINIO_TEST_BUCKET", "codemastery-test"); }

    static MediaProperties.S3 config(String bucket, String prefix) {
        return new MediaProperties.S3(bucket, "us-east-1", endpoint(), true, accessKey(), secretKey(), prefix, DataSize.ofMegabytes(32));
    }

    static S3Client admin() {
        S3Client c = S3MediaStorage.buildClient(config(bucket(), ""));
        try {
            c.createBucket(r -> r.bucket(bucket()));
        } catch (BucketAlreadyOwnedByYouException ignored) {
            // fine
        } catch (software.amazon.awssdk.services.s3.model.S3Exception e) {
            if (!"BucketAlreadyOwnedByYou".equals(e.awsErrorDetails().errorCode())) throw e;
        }
        return c;
    }

    private MinioSupport() {}
}
