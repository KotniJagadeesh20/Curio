package com.codemastery.media;

import java.io.IOException;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.DirectoryStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * Development and test backend; single instance only, production uses S3 (12c).
 *
 * <p><b>Keys:</b> checked twice, independently: a strict pattern ({@link #validateKey}) and then the normalised path must stay under the root
 * ({@link #containedPath}). <b>Writes:</b> the bytes go to a {@code .part-*} file <i>in the same directory</i> as the destination (so
 * the same filesystem, and the final step is a rename), are fsynced, and are then moved into place: a reader never sees a half-written
 * object, and a crash after the move can't leave an empty file that the database calls READY. If the filesystem can't rename
 * atomically the move falls back to a plain same-directory rename. A failed or short write removes its temporary file. A process that
 * dies mid-write leaves a {@code .part-*} file, which can never be served (keys can't start with a dot); deleting any object of that asset
 * removes it ({@link #delete}), and the sweeper deletes the objects of every abandoned upload.
 */
public final class LocalDiskMediaStorage implements MediaStorage {
    private static final Pattern KEY = Pattern.compile("[A-Za-z0-9][A-Za-z0-9._-]*(/[A-Za-z0-9][A-Za-z0-9._-]*)*");
    static final String PART_PREFIX = ".part-";

    /** Test seam for the rename step. */
    interface Mover {
        void move(Path from, Path to, boolean atomic) throws IOException;
    }

    private static final Mover FILES = (from, to, atomic) -> {
        if (atomic) Files.move(from, to, StandardCopyOption.ATOMIC_MOVE);
        else Files.move(from, to, StandardCopyOption.REPLACE_EXISTING);
    };

    private final Path root;
    private final Mover mover;

    public LocalDiskMediaStorage(Path root) {
        this(root, FILES);
    }

    LocalDiskMediaStorage(Path root, Mover mover) {
        this.root = root.toAbsolutePath().normalize();
        this.mover = mover;
    }

    static void validateKey(String key) {
        if (key == null || key.length() > 255 || !KEY.matcher(key).matches()) throw new IllegalArgumentException("invalid storage key");
    }

    /** Second, independent layer: whatever the key looks like, the resolved path must be strictly inside the root. */
    Path containedPath(String key) {
        Path p = root.resolve(key).normalize();
        if (!p.startsWith(root) || p.equals(root)) throw new IllegalArgumentException("invalid storage key");
        return p;
    }

    Path resolve(String key) {
        validateKey(key);
        return containedPath(key);
    }

    @Override
    public void put(String key, InputStream data, long length, String contentType) throws IOException {
        Path target = resolve(key);
        Files.createDirectories(target.getParent());
        Path tmp = target.resolveSibling(PART_PREFIX + UUID.randomUUID());   // same directory => same filesystem
        try {
            try (FileChannel ch = FileChannel.open(tmp, StandardOpenOption.CREATE_NEW, StandardOpenOption.WRITE)) {
                long written = 0;
                byte[] buf = new byte[64 * 1024];
                int n;
                while (written <= length && (n = data.read(buf, 0, (int) Math.min(buf.length, length + 1 - written))) > 0) {   // reads at most one byte past the declared length
                    ByteBuffer bb = ByteBuffer.wrap(buf, 0, n);
                    while (bb.hasRemaining()) ch.write(bb);
                    written += n;
                }
                if (written != length) throw new IOException("stream held " + (written > length ? "more" : "fewer") + " bytes than the declared " + length);
                ch.force(true);   // durable before it becomes visible
            }
            try {
                mover.move(tmp, target, true);
            } catch (AtomicMoveNotSupportedException e) {
                mover.move(tmp, target, false);   // same directory, so still a rename on any normal filesystem
            }
        } finally {
            Files.deleteIfExists(tmp);   // a no-op after a successful move
        }
    }

    @Override
    public InputStream open(String key) throws IOException {
        return Files.newInputStream(resolve(key));
    }

    @Override
    public void delete(String key) throws IOException {
        Path p = resolve(key);
        Files.deleteIfExists(p);
        Path dir = p.getParent();
        if (dir == null || dir.equals(root) || !Files.isDirectory(dir)) return;
        // the directory belongs to one asset: anything half-written by a crashed upload goes with it
        try (DirectoryStream<Path> parts = Files.newDirectoryStream(dir, PART_PREFIX + "*")) {
            for (Path part : parts) Files.deleteIfExists(part);
        }
        try {   // tidy the per-asset directory once empty; the other variant still being there is fine
            Files.deleteIfExists(dir);
        } catch (java.nio.file.DirectoryNotEmptyException ignored) {
            // the sibling variant is still stored
        }
    }

    @Override
    public boolean exists(String key) throws IOException {
        return Files.isRegularFile(resolve(key));
    }
}
