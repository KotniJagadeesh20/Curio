package com.codemastery.media;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** The shared storage contract against a real S3-compatible server. Skipped unless MINIO_TEST_ENDPOINT is set. */
@EnabledIfEnvironmentVariable(named = MinioSupport.ENV, matches = ".+")
class S3MinioStorageContractTest extends MediaStorageContractTest {
    private S3MediaStorage storage;

    @Override
    MediaStorage storage() {
        if (storage == null) {
            try (var admin = MinioSupport.admin()) { /* ensures the bucket exists */ }
            storage = S3MediaStorage.create(MinioSupport.config(MinioSupport.bucket(), "contract-" + java.util.UUID.randomUUID() + "/"));
        }
        return storage;
    }

    @AfterEach
    void close() { if (storage != null) storage.close(); }
}
