package com.codemastery.media;

import java.util.UUID;

/** Storage keys derive from the asset id alone, so cleanup works even when the database row is gone. */
final class MediaKeys {
    private MediaKeys() {}

    static String extension(String contentType) {
        return switch (contentType) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            default -> throw new IllegalArgumentException("unexpected output type " + contentType);
        };
    }

    static String original(UUID id, String contentType) { return "media/" + id + "/original." + extension(contentType); }

    static String thumb(UUID id, String contentType) { return "media/" + id + "/thumb." + extension(contentType); }
}
