package com.codemastery.media;

/** The re-encoded output of one upload: what will be stored (never the uploaded bytes). */
public record ProcessedImage(String contentType, byte[] original, int width, int height, String sha256,
                      byte[] thumb, int thumbWidth, int thumbHeight, String thumbSha256) {
    public long totalBytes() { return (long) original.length + thumb.length; }
}
