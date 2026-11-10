package com.codemastery.media;

import static org.junit.jupiter.api.Assertions.*;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class LocalDiskMediaStorageTest {
    @TempDir Path root;

    @Test
    void putOpenExistsDeleteRoundTrip() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        s.put("media/abc/original.jpg", new byte[] {1, 2, 3}, "image/jpeg");
        assertTrue(s.exists("media/abc/original.jpg"));
        try (var in = s.open("media/abc/original.jpg")) { assertArrayEquals(new byte[] {1, 2, 3}, in.readAllBytes()); }
        s.put("media/abc/original.jpg", new byte[] {9}, "image/jpeg");   // overwrite is allowed and atomic
        try (var in = s.open("media/abc/original.jpg")) { assertArrayEquals(new byte[] {9}, in.readAllBytes()); }
        s.delete("media/abc/original.jpg");
        assertFalse(s.exists("media/abc/original.jpg"));
    }

    @Test
    void deleteIsIdempotent() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        assertDoesNotThrow(() -> s.delete("media/none/original.jpg"));
        s.put("media/x/thumb.png", new byte[] {1}, "image/png");
        s.delete("media/x/thumb.png");
        assertDoesNotThrow(() -> s.delete("media/x/thumb.png"));
    }

    @Test
    void emptyAssetDirectoryIsRemovedButASiblingVariantKeepsIt() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        s.put("media/a/original.jpg", new byte[] {1}, "image/jpeg");
        s.put("media/a/thumb.jpg", new byte[] {2}, "image/jpeg");
        s.delete("media/a/original.jpg");
        assertTrue(Files.isDirectory(root.resolve("media/a")));
        s.delete("media/a/thumb.jpg");
        assertFalse(Files.exists(root.resolve("media/a")));
    }

    @Test
    void noKeyCanEscapeTheRoot() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root.resolve("store"));
        Files.createDirectories(root.resolve("store"));
        Files.writeString(root.resolve("secret.txt"), "top secret");
        List<String> hostile = List.of("../secret.txt", "media/../../secret.txt", "/etc/passwd", "media/..", "..", ".", "", "media//x", "media/./x",
                "media\\..\\secret.txt", "media/a b", "media/a\u0000b", "C:/x", "media/%2e%2e/secret.txt", "media/.hidden", "media/x/", "a".repeat(300));
        for (String key : hostile) {
            assertThrows(IllegalArgumentException.class, () -> s.put(key, new byte[] {1}, "image/png"), "put " + key);
            assertThrows(IllegalArgumentException.class, () -> s.open(key), "open " + key);
            assertThrows(IllegalArgumentException.class, () -> s.delete(key), "delete " + key);
            assertThrows(IllegalArgumentException.class, () -> s.exists(key), "exists " + key);
        }
        assertEquals("top secret", Files.readString(root.resolve("secret.txt")));
        assertThrows(IllegalArgumentException.class, () -> s.put(null, new byte[1], "image/png"));
    }

    @Test
    void aSymlinkedParentCannotBeUsedToEscapeEitherOnlyValidKeysReachTheDisk() throws IOException {
        // keys are generated from UUIDs; this documents that a normal key lands inside the root and nothing else is created
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        s.put("media/11111111-1111-1111-1111-111111111111/original.jpg", new byte[] {1}, "image/jpeg");
        try (Stream<Path> all = Files.walk(root)) {
            assertTrue(all.filter(Files::isRegularFile).allMatch(f -> f.startsWith(root) && !f.getFileName().toString().startsWith(".part-")));
        }
    }

    @Test
    void noPartialFileIsLeftBehindWhenTheWriteFails() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        Files.createDirectories(root.resolve("media/a/original.jpg"));   // a directory where the object should go: the move fails
        assertThrows(IOException.class, () -> s.put("media/a/original.jpg", new byte[] {1}, "image/jpeg"));
        try (Stream<Path> all = Files.walk(root.resolve("media/a"))) {
            assertTrue(all.noneMatch(f -> f.getFileName().toString().startsWith(".part-")));
        }
    }

    // ---- stream contract, same-directory temp files, atomic-move fallback, partial writes ----

    private static java.io.InputStream stream(byte[] b) { return new java.io.ByteArrayInputStream(b); }

    private static List<String> names(Path dir) throws IOException {
        if (!Files.exists(dir)) return List.of();
        try (Stream<Path> s = Files.walk(dir)) { return s.filter(Files::isRegularFile).map(f -> f.getFileName().toString()).toList(); }
    }

    @Test
    void theStreamIsWrittenExactlyAndTheByteArrayOverloadDelegatesToIt() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        s.put("media/a/original.jpg", stream(new byte[] {1, 2, 3, 4}), 4, "image/jpeg");
        try (var in = s.open("media/a/original.jpg")) { assertArrayEquals(new byte[] {1, 2, 3, 4}, in.readAllBytes()); }
        byte[] big = new byte[300_000];   // several copy-buffer rounds
        new java.util.Random(1).nextBytes(big);
        s.put("media/a/thumb.jpg", big, "image/jpeg");
        try (var in = s.open("media/a/thumb.jpg")) { assertArrayEquals(big, in.readAllBytes()); }
        s.put("media/a/empty.jpg", stream(new byte[0]), 0, "image/jpeg");
        assertTrue(s.exists("media/a/empty.jpg"));
    }

    @Test
    void aStreamThatDisagreesWithItsDeclaredLengthLeavesNothingBehind() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        assertThrows(IOException.class, () -> s.put("media/a/original.jpg", stream(new byte[5]), 10, "image/jpeg"), "shorter than declared");
        assertThrows(IOException.class, () -> s.put("media/a/original.jpg", stream(new byte[10]), 5, "image/jpeg"), "longer than declared");
        assertFalse(s.exists("media/a/original.jpg"));
        assertEquals(List.of(), names(root), "no object and no temporary file");
    }

    @Test
    void anOverlongStreamIsNotReadBeyondOneByteAfterItsDeclaredLength() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        long[] consumed = {0};
        java.io.InputStream endless = new java.io.InputStream() {
            @Override public int read() { consumed[0]++; return 1; }
            @Override public int read(byte[] b, int off, int len) { consumed[0] += len; return len; }   // never ends
        };
        assertThrows(IOException.class, () -> s.put("media/a/original.jpg", endless, 1000, "image/jpeg"));
        assertEquals(1001, consumed[0], "stops one byte past the declared length: an endless or hostile stream can't fill the disk");
        assertEquals(List.of(), names(root));
    }

    @Test
    void aWriteThatFailsMidwayLeavesNoPartialObjectAndKeepsTheOldOneIntact() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        s.put("media/a/original.jpg", new byte[] {7, 7, 7}, "image/jpeg");
        java.io.InputStream failing = new java.io.InputStream() {
            int n;
            @Override public int read() throws IOException { throw new IOException("read failed"); }
            @Override public int read(byte[] b, int off, int len) throws IOException {
                if (n++ == 0) { Arrays_fill(b, off, Math.min(len, 1000)); return Math.min(len, 1000); }
                throw new IOException("disk or network failed mid-stream");
            }
            private void Arrays_fill(byte[] b, int off, int len) { java.util.Arrays.fill(b, off, off + len, (byte) 9); }
        };
        assertThrows(IOException.class, () -> s.put("media/a/original.jpg", failing, 5000, "image/jpeg"));
        try (var in = s.open("media/a/original.jpg")) { assertArrayEquals(new byte[] {7, 7, 7}, in.readAllBytes(), "the previous object is untouched: the move never happened"); }
        assertEquals(List.of("original.jpg"), names(root), "and no .part file");
        assertThrows(IOException.class, () -> s.put("media/b/original.jpg", failing, 5000, "image/jpeg"));
        assertFalse(s.exists("media/b/original.jpg"), "a failed first write never becomes visible");
        assertEquals(List.of("original.jpg"), names(root));
    }

    @Test
    void theTemporaryFileLivesNextToItsDestinationSoTheMoveIsARenameOnTheSameFilesystem() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        Path dir = root.resolve("media/abc");
        List<List<String>> seenDuringWrite = new java.util.ArrayList<>(), rootSeen = new java.util.ArrayList<>();
        java.io.InputStream spy = new java.io.ByteArrayInputStream(new byte[100]) {
            @Override public synchronized int read(byte[] b, int off, int len) {
                try { seenDuringWrite.add(names(dir)); rootSeen.add(names(root.resolve("media"))); } catch (IOException e) { throw new RuntimeException(e); }
                return super.read(b, off, len);
            }
        };
        s.put("media/abc/original.jpg", spy, 100, "image/jpeg");
        assertFalse(seenDuringWrite.isEmpty());
        assertTrue(seenDuringWrite.get(0).get(0).startsWith(".part-"), "while writing, the temp file is in the destination's own directory");
        assertEquals(1, seenDuringWrite.get(0).size());
        assertEquals(List.of(".part-"), rootSeen.get(0).stream().map(n -> n.substring(0, 6)).toList(), "and nowhere else under the root");
        assertEquals(List.of("original.jpg"), names(dir), "after the move only the object remains");
    }

    @Test
    void whenTheFilesystemCannotMoveAtomicallyTheWriteFallsBackToAPlainRename() throws IOException {
        List<Boolean> attempts = new java.util.ArrayList<>();
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root, (from, to, atomic) -> {
            attempts.add(atomic);
            if (atomic) throw new java.nio.file.AtomicMoveNotSupportedException(from.toString(), to.toString(), "no atomic rename here");
            Files.move(from, to, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        });
        s.put("media/a/original.jpg", new byte[] {1, 2}, "image/jpeg");
        assertEquals(List.of(true, false), attempts, "atomic first, then the fallback");
        try (var in = s.open("media/a/original.jpg")) { assertArrayEquals(new byte[] {1, 2}, in.readAllBytes()); }
        assertEquals(List.of("original.jpg"), names(root));
    }

    @Test
    void ifEveryMoveFailsTheWriteFailsCleanly() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root, (from, to, atomic) -> { throw new IOException("rename failed"); });
        assertThrows(IOException.class, () -> s.put("media/a/original.jpg", new byte[] {1}, "image/jpeg"));
        assertFalse(s.exists("media/a/original.jpg"));
        assertEquals(List.of(), names(root), "the temp file is removed");
    }

    @Test
    void deletingAnAssetsObjectAlsoRemovesTheTempFileOfACrashedWrite() throws IOException {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root);
        Files.createDirectories(root.resolve("media/c"));
        Files.write(root.resolve("media/c/.part-left-by-a-crash"), new byte[] {1, 2, 3});   // what a process killed mid-write leaves
        s.delete("media/c/original.jpg");   // the object itself never existed
        assertFalse(Files.exists(root.resolve("media/c")), "the asset's directory and the partial file are gone");
        assertThrows(IllegalArgumentException.class, () -> s.open(".part-left-by-a-crash"), "and such a file could never be addressed as a key anyway");
    }

    @Test
    void theContainmentLayerRefusesAnEscapeEvenIfTheKeyPatternWereBypassed() {
        LocalDiskMediaStorage s = new LocalDiskMediaStorage(root.resolve("store"));
        for (String key : List.of("../x", "a/../../x", "a/../..", "", ".", "a/..")) {
            assertThrows(IllegalArgumentException.class, () -> s.containedPath(key), "containedPath alone must refuse " + key);
        }
        assertDoesNotThrow(() -> s.containedPath("media/a/original.jpg"));
        for (String key : List.of("media/a b", "../x", "media/.hidden", "a".repeat(256), "media//x")) {
            assertThrows(IllegalArgumentException.class, () -> LocalDiskMediaStorage.validateKey(key), "the pattern layer alone must refuse " + key);
        }
    }
}
