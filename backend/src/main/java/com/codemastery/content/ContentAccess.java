package com.codemastery.content;

import com.codemastery.security.CurrentUser;
import com.codemastery.user.User;
import java.util.function.BooleanSupplier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Authorisation for the creator workspace (PLAN.md Step 4). Every creator endpoint of Step 5 resolves its target
 * through one of these methods and uses what it returns, so there is exactly one place where ownership is decided.
 *
 * <p><b>Rules</b>
 * <ul>
 *   <li>Ownership is always taken from the <b>root collection</b> ({@code Track.owner}) reached through the
 *       database: module → collection, page → module → collection. A collection id supplied by the client is never
 *       trusted for this.</li>
 *   <li>401 when there is no authenticated ACTIVE user (checked first, so a suspended owner can't write or read).</li>
 *   <li>404 when the target doesn't exist, <b>or</b> exists but isn't publicly visible and the caller isn't the owner
 *       (drafts, hidden, unlisted-and-draft pages, soft-deleted, suspended owner): existence is not revealed.</li>
 *   <li>403 when the target is publicly visible but the caller isn't its owner.</li>
 *   <li>An <b>admin is just another non-owner</b> here: admins govern the platform, they don't edit other creators'
 *       content. The only admin exception is {@link #requireOwnerOrAdmin}, for moderation (Step 18).</li>
 *   <li>Soft-deleted collections (and everything in them) are 404 for every operation except
 *       {@link #collectionForRestore}.</li>
 * </ul>
 *
 * <p>Methods are read-only transactions that return the (lazy) entity; the caller (a transactional service in Step 5)
 * should call them inside its own transaction so the entity stays attached. Editing, deleting, reordering,
 * publishing and adding children all use the {@code ...ForWrite} variant of the thing being changed; a future "move
 * page to another module" must authorise <b>both</b> modules.
 */
@Service
@Transactional(readOnly = true)
public class ContentAccess {
    private final CurrentUser currentUser;
    private final TrackRepository tracks;
    private final SectionRepository sections;
    private final LessonRepository lessons;

    public ContentAccess(CurrentUser currentUser, TrackRepository tracks, SectionRepository sections,
                         LessonRepository lessons) {
        this.currentUser = currentUser;
        this.tracks = tracks;
        this.sections = sections;
        this.lessons = lessons;
    }

    // ---------- collections ----------
    /** Owner's workspace read (includes drafts and moderation-hidden collections). */
    public Track collectionForRead(Long id) { return collection(id, false); }

    /** Edit, delete, publish/unpublish, reorder modules, add a module. */
    public Track collectionForWrite(Long id) { return collection(id, false); }

    /** Like {@link #collectionForWrite} but also accepts a soft-deleted collection: used only to restore it. */
    public Track collectionForRestore(Long id) { return collection(id, true); }

    // ---------- modules (sections) ----------
    public Section moduleForRead(Long id) { return module(id); }

    /** Edit, delete, reorder, add a page. */
    public Section moduleForWrite(Long id) { return module(id); }

    // ---------- pages (lessons) ----------
    public Lesson pageForRead(Long id) { return page(id); }

    /** Edit, delete, reorder. */
    public Lesson pageForWrite(Long id) { return page(id); }

    // ---------- moderation ----------
    /**
     * For moderation operations <b>only</b> (hide/restore in Step 18): the owner or any admin. Never use this for
     * an edit endpoint: admins must not change other creators' content. Non-admin non-owners are treated as in
     * every other method (404 / 403).
     */
    public Track requireOwnerOrAdmin(Long collectionId) {
        User me = currentUser.require();
        Track t = tracks.findById(collectionId).orElseThrow(() -> notFound("Collection"));
        if (CurrentUser.isAdmin(me) || isOwner(t, me)) return t;
        throw denied(Visibility.collectionReadable(t), "collection");
    }

    // ---------- resolution ----------
    private Track collection(Long id, boolean allowDeleted) {
        User me = currentUser.require();
        Track t = tracks.findById(id).orElseThrow(() -> notFound("Collection"));
        return authorize(t, t, me, allowDeleted, "collection", () -> Visibility.collectionReadable(t));
    }

    private Section module(Long id) {
        User me = currentUser.require();
        Section s = sections.findById(id).orElseThrow(() -> notFound("Module"));
        return authorize(s, s.getTrack(), me, false, "module", () -> Visibility.moduleVisible(s));
    }

    private Lesson page(Long id) {
        User me = currentUser.require();
        Lesson l = lessons.findById(id).orElseThrow(() -> notFound("Page"));
        return authorize(l, l.getSection().getTrack(), me, false, "page", () -> Visibility.pageReadable(l));
    }

    private <T> T authorize(T target, Track root, User me, boolean allowDeleted, String what, BooleanSupplier publiclyVisible) {
        if (root.getDeletedAt() != null && !allowDeleted) throw notFound(what);
        if (isOwner(root, me)) return target;
        throw denied(publiclyVisible.getAsBoolean(), what);
    }

    private static boolean isOwner(Track root, User me) {
        return root.getOwner() != null && root.getOwner().getId().equals(me.getId());
    }

    /** 403 if the caller could see the thing publicly anyway, otherwise 404 (don't reveal that it exists). */
    private static ResponseStatusException denied(boolean publiclyVisible, String what) {
        return publiclyVisible
                ? new ResponseStatusException(HttpStatus.FORBIDDEN, "You do not own this " + what)
                : notFound(what);
    }

    private static ResponseStatusException notFound(String what) {
        String name = Character.toUpperCase(what.charAt(0)) + what.substring(1);
        return new ResponseStatusException(HttpStatus.NOT_FOUND, name + " not found");
    }
}
