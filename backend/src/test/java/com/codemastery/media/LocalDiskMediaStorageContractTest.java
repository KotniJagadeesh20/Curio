package com.codemastery.media;

import java.nio.file.Path;
import org.junit.jupiter.api.io.TempDir;

class LocalDiskMediaStorageContractTest extends MediaStorageContractTest {
    @TempDir Path root;

    @Override
    MediaStorage storage() { return new LocalDiskMediaStorage(root); }
}
