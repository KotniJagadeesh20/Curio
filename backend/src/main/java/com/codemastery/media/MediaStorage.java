package com.codemastery.media;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;

/**
 * Where the bytes live. Content never sees this: it holds an asset id, and keys are generated server-side from that id
 * ({@link MediaKeys}), never from anything a user supplied.
 *
 * <p>The primary contract is a stream with a known length: S3 needs the length up front (it can't stream an unknown size without
 * multipart upload), a future larger object doesn't have to fit in memory, and implementations must enforce it (fail if the stream
 * is shorter or longer than declared, leaving no object). Today's outputs are small and already in memory (the database row holds
 * their sizes and hashes before anything is stored), so callers normally use the {@code byte[]} convenience, which wraps the array
 * without copying it.
 */
public interface MediaStorage {
    /** Stores exactly {@code length} bytes read from {@code data}. Never leaves a partial object visible under {@code key}. */
    void put(String key, InputStream data, long length, String contentType) throws IOException;

    default void put(String key, byte[] data, String contentType) throws IOException {
        put(key, new ByteArrayInputStream(data), data.length, contentType);
    }

    /** @throws java.nio.file.NoSuchFileException (or any IOException) when the object can't be read */
    InputStream open(String key) throws IOException;

    /** Idempotent: deleting an object that does not exist succeeds. */
    void delete(String key) throws IOException;

    boolean exists(String key) throws IOException;
}
