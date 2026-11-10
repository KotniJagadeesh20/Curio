package com.codemastery.media;

import org.springframework.http.HttpStatus;

/** A refused media request. {@link #code()} is the stable, machine-readable reason; the message never exposes internals. */
public class MediaException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public MediaException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() { return status; }
    public String code() { return code; }

    public static MediaException tooLarge(long max) { return new MediaException(HttpStatus.PAYLOAD_TOO_LARGE, "MEDIA_TOO_LARGE", "The file is too large (the limit is " + max / (1024 * 1024) + " MB)."); }
    public static MediaException unsupported(String why) { return new MediaException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "MEDIA_TYPE_UNSUPPORTED", why); }
    public static MediaException corrupt() { return new MediaException(HttpStatus.UNPROCESSABLE_ENTITY, "MEDIA_CORRUPT", "The file is not a readable image."); }
    public static MediaException animated() { return new MediaException(HttpStatus.UNPROCESSABLE_ENTITY, "MEDIA_ANIMATED", "Animated images are not supported. Upload a still image."); }
    public static MediaException dimensions(String why) { return new MediaException(HttpStatus.UNPROCESSABLE_ENTITY, "MEDIA_DIMENSIONS", why); }
    public static MediaException colorspace() { return new MediaException(HttpStatus.UNPROCESSABLE_ENTITY, "MEDIA_COLORSPACE_UNSUPPORTED", "This colour format (for example CMYK) is not supported. Export the image as RGB (sRGB) and try again."); }
    public static MediaException quota() { return new MediaException(HttpStatus.CONFLICT, "MEDIA_QUOTA", "Your media storage limit is reached."); }
    public static MediaException busy() { return new MediaException(HttpStatus.SERVICE_UNAVAILABLE, "MEDIA_BUSY", "The server is busy processing images. Try again shortly."); }
    public static MediaException badRequest(String why) { return new MediaException(HttpStatus.BAD_REQUEST, "MEDIA_BAD_REQUEST", why); }
    public static MediaException storageFailed() { return new MediaException(HttpStatus.SERVICE_UNAVAILABLE, "MEDIA_STORAGE_FAILED", "The image could not be stored. Try again."); }
    public static MediaException notReady() { return new MediaException(HttpStatus.CONFLICT, "MEDIA_NOT_READY", "This image is still being processed."); }
    /** A collection cover or an image block named an asset that does not exist, is not READY or is not the owner's: one answer for all three. */
    public static MediaException unusable() { return new MediaException(HttpStatus.BAD_REQUEST, "MEDIA_NOT_USABLE", "That image isn't available. Upload it again."); }
    public static MediaException notFound() { return new MediaException(HttpStatus.NOT_FOUND, "MEDIA_NOT_FOUND", "Media not found"); }
}
