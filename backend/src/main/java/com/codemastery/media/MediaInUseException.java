package com.codemastery.media;

/** 409 {@code MEDIA_IN_USE}: the asset is a page image or a collection cover. Carries where (up to 20) and the real total. */
public class MediaInUseException extends RuntimeException {
    private final MediaReferenceService.Usages usages;

    public MediaInUseException(MediaReferenceService.Usages usages) {
        super("This image is used in your content, so it can't be deleted.");
        this.usages = usages;
    }

    public MediaReferenceService.Usages usages() { return usages; }
}
