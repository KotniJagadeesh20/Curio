package com.codemastery.content;

import com.codemastery.user.UserStatus;

/**
 * The single place that decides what the public can see (PLAN.md section 3a). Pure functions, no I/O.
 *
 * <p>A collection is publicly <b>readable</b> if its status is PUBLISHED or UNLISTED, moderation is OK, it is not
 * soft-deleted and its owner is not suspended. It is publicly <b>listed</b> (discover, search, profile lists) only
 * if PUBLISHED and readable. A page is readable only if the page itself is PUBLISHED and its collection is readable.
 *
 * <p>A null owner status means the row has no owner yet (a legacy row before {@code AdminSeeder} has run): it is
 * treated as not suspended so seeded content never disappears.
 */
public final class Visibility {
    private Visibility() {}

    public static boolean collectionReadable(CollectionStatus status, ModerationStatus moderation,
                                             boolean deleted, UserStatus ownerStatus) {
        return (status == CollectionStatus.PUBLISHED || status == CollectionStatus.UNLISTED)
                && moderation == ModerationStatus.OK
                && !deleted
                && ownerStatus != UserStatus.SUSPENDED;
    }

    public static boolean collectionListed(CollectionStatus status, ModerationStatus moderation,
                                           boolean deleted, UserStatus ownerStatus) {
        return status == CollectionStatus.PUBLISHED && collectionReadable(status, moderation, deleted, ownerStatus);
    }

    public static boolean pageReadable(PageStatus page, CollectionStatus status, ModerationStatus moderation,
                                       boolean deleted, UserStatus ownerStatus) {
        return page == PageStatus.PUBLISHED && collectionReadable(status, moderation, deleted, ownerStatus);
    }

    // ---- convenience for entities ----
    /**
     * Full public-readability rule for one loaded collection: the status rule above <b>and</b> at least one
     * PUBLISHED page. A collection that is PUBLISHED/UNLISTED but has no published page (its last one was deleted or
     * returned to draft) is therefore never exposed, whatever its own status says. Loads the pages: for list queries
     * use {@link #listedByStatus} plus a database existence check instead.
     */
    public static boolean collectionReadable(Track t) {
        return readableByStatus(t) && hasPublishedPage(t);
    }

    public static boolean collectionListed(Track t) {
        return listedByStatus(t) && hasPublishedPage(t);
    }

    /** The status/moderation/deletion/owner part of the rule only (no page check). */
    public static boolean readableByStatus(Track t) {
        return collectionReadable(t.getStatus(), t.getModerationStatus(), t.getDeletedAt() != null, ownerStatus(t));
    }

    public static boolean listedByStatus(Track t) {
        return collectionListed(t.getStatus(), t.getModerationStatus(), t.getDeletedAt() != null, ownerStatus(t));
    }

    public static boolean hasPublishedPage(Track t) {
        return t.getSections().stream().anyMatch(s -> s.getLessons().stream().anyMatch(l -> l.getStatus() == PageStatus.PUBLISHED));
    }

    public static boolean pageReadable(Lesson l) {
        Track t = l.getSection().getTrack();
        return pageReadable(l.getStatus(), t.getStatus(), t.getModerationStatus(), t.getDeletedAt() != null, ownerStatus(t));
    }

    /** A module has no status of its own: it is visible iff at least one of its pages is publicly readable. */
    public static boolean moduleVisible(Section s) {
        return s.getLessons().stream().anyMatch(Visibility::pageReadable);
    }

    private static UserStatus ownerStatus(Track t) {
        return t.getOwner() == null ? null : t.getOwner().getStatus();
    }
}
