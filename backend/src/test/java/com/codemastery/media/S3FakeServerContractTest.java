package com.codemastery.media;

import org.junit.jupiter.api.AfterEach;
import org.springframework.util.unit.DataSize;

/** The shared contract against the recording stand-in: runs everywhere (no container), but proves only the client side, not a real store. */
class S3FakeServerContractTest extends MediaStorageContractTest {
    private FakeS3Server server;
    private S3MediaStorage storage;

    @Override
    MediaStorage storage() throws Exception {
        if (storage == null) {
            server = new FakeS3Server();
            storage = S3MediaStorage.create(new MediaProperties.S3("b", "us-east-1", server.endpoint(), true, "k", "s", "p/", DataSize.ofMegabytes(32)));
        }
        return storage;
    }

    @AfterEach
    void close() {
        if (storage != null) storage.close();
        if (server != null) server.close();
    }
}
