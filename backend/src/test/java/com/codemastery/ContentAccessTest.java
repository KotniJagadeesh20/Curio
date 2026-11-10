package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;

import com.codemastery.content.ContentAccess;
import com.codemastery.user.Role;
import com.codemastery.user.User;
import com.codemastery.user.UserRepository;
import com.codemastery.user.UserService;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.server.ResponseStatusException;

/**
 * Step 4: the creator authorisation layer. The creator endpoints don't exist until Step 5, so each Step 5 endpoint is
 * listed below with the {@link ContentAccess} call it will make; Step 5 adds the same checks at HTTP level.
 */
class ContentAccessTest extends ApiTestSupport {
    @Autowired ContentAccess access;
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired UserService userService;

    User a, b, admin;
    long adminId;

    // fixtures, all owned by A
    long cPub, cUnl, cDraft, cHidden, cDeleted;                       // collections
    long mPub, mEmpty, mUnl, mDraft, mHidden, mDeleted;               // modules (mEmpty: only a draft page)
    long pPub, pDraft, pUnl, pInDraft, pHidden, pDeleted;             // pages

    private User newUser(String name) {
        return userService.register(name, name.toLowerCase() + "-" + UUID.randomUUID() + "@test.com", "password123", null);
    }

    private long track(User owner, String status, String moderation, boolean deleted) {
        String slug = uniq("fx");
        jdbc.update("insert into tracks (slug, name, owner_id, status, published, moderation_status, deleted_at) values (?, ?, ?, ?, ?, ?, "
                + (deleted ? "now()" : "null") + ")", slug, slug, owner.getId(), status, status.equals("PUBLISHED"), moderation);
        return jdbc.queryForObject("select id from tracks where slug = ? and owner_id = ?", Long.class, slug, owner.getId());
    }

    private long module(long track) {
        String slug = uniq("m");
        jdbc.update("insert into sections (track_id, slug, title) values (?, ?, ?)", track, slug, slug);
        return jdbc.queryForObject("select id from sections where track_id = ? and slug = ?", Long.class, track, slug);
    }

    private long page(long module, String status) {
        String slug = uniq("p");
        jdbc.update("insert into lessons (section_id, slug, title, status, published) values (?, ?, ?, ?, ?)",
                module, slug, slug, status, status.equals("PUBLISHED"));
        return jdbc.queryForObject("select id from lessons where section_id = ? and slug = ?", Long.class, module, slug);
    }

    @BeforeEach
    void fixtures() {
        SecurityContextHolder.clearContext();
        a = newUser("Alice");
        b = newUser("Bob");
        admin = users.findByEmailIgnoreCase("admin@codemastery.local").orElseThrow();
        adminId = admin.getId();

        cPub = track(a, "PUBLISHED", "OK", false);
        mPub = module(cPub);
        pPub = page(mPub, "PUBLISHED");
        pDraft = page(mPub, "DRAFT");
        mEmpty = module(cPub);
        page(mEmpty, "DRAFT");

        cUnl = track(a, "UNLISTED", "OK", false);
        mUnl = module(cUnl);
        pUnl = page(mUnl, "PUBLISHED");

        cDraft = track(a, "DRAFT", "OK", false);
        mDraft = module(cDraft);
        pInDraft = page(mDraft, "PUBLISHED");                          // published page, draft collection

        cHidden = track(a, "PUBLISHED", "HIDDEN", false);
        mHidden = module(cHidden);
        pHidden = page(mHidden, "PUBLISHED");

        cDeleted = track(a, "PUBLISHED", "OK", true);
        mDeleted = module(cDeleted);
        pDeleted = page(mDeleted, "PUBLISHED");
    }

    @AfterEach
    void cleanUp() {
        SecurityContextHolder.clearContext();
        jdbc.update("update users set status = 'ACTIVE' where id = ?", a.getId());
        for (User u : List.of(a, b)) {
            jdbc.update("delete from lessons where section_id in (select s.id from sections s join tracks t on t.id = s.track_id where t.owner_id = ?)", u.getId());
            jdbc.update("delete from sections where track_id in (select id from tracks where owner_id = ?)", u.getId());
            jdbc.update("delete from tracks where owner_id = ?", u.getId());
        }
    }

    private void actAs(User u) {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                u.getId(), null, List.of(new SimpleGrantedAuthority("ROLE_" + u.getRole().name()))));
    }

    // ---------- every future creator endpoint and the access call it will make ----------
    private Map<String, Function<Long, Object>> collectionEndpoints() {
        Map<String, Function<Long, Object>> m = new LinkedHashMap<>();
        m.put("GET    /api/collections/{id}", access::collectionForRead);
        m.put("PUT    /api/collections/{id}", access::collectionForWrite);
        m.put("DELETE /api/collections/{id}", access::collectionForWrite);
        m.put("POST   /api/collections/{id}/publish", access::collectionForWrite);
        m.put("POST   /api/collections/{id}/unpublish", access::collectionForWrite);
        m.put("POST   /api/collections/{id}/modules", access::collectionForWrite);
        return m;
    }

    private Map<String, Function<Long, Object>> moduleEndpoints() {
        Map<String, Function<Long, Object>> m = new LinkedHashMap<>();
        m.put("PUT    /api/modules/{id}", access::moduleForWrite);
        m.put("DELETE /api/modules/{id}", access::moduleForWrite);
        m.put("PATCH  /api/modules/{id}/reorder", access::moduleForWrite);
        m.put("POST   /api/modules/{id}/pages", access::moduleForWrite);
        m.put("(read) module", access::moduleForRead);
        return m;
    }

    private Map<String, Function<Long, Object>> pageEndpoints() {
        Map<String, Function<Long, Object>> m = new LinkedHashMap<>();
        m.put("GET    /api/pages/{id}", access::pageForRead);
        m.put("PUT    /api/pages/{id}", access::pageForWrite);
        m.put("DELETE /api/pages/{id}", access::pageForWrite);
        m.put("PATCH  /api/pages/{id}/reorder", access::pageForWrite);
        return m;
    }

    private static HttpStatus statusOf(Function<Long, Object> call, long id) {
        try {
            call.apply(id);
            return null;                                              // allowed
        } catch (ResponseStatusException e) {
            return HttpStatus.valueOf(e.getStatusCode().value());
        }
    }

    private static String reasonOf(Function<Long, Object> call, long id) {
        try {
            call.apply(id);
            return null;
        } catch (ResponseStatusException e) {
            return e.getReason();
        }
    }

    /** Asserts {@code expected} for every endpoint of the map against every id (id -> expected status, null = allowed). */
    private void expect(Map<String, Function<Long, Object>> endpoints, Map<Long, HttpStatus> expected, String who) {
        endpoints.forEach((name, call) -> expected.forEach((id, status) ->
                assertThat(statusOf(call, id)).as(who + " -> " + name + " on " + id).isEqualTo(status)));
    }

    private static Map<Long, HttpStatus> map(Object... kv) {
        Map<Long, HttpStatus> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((Long) kv[i], (HttpStatus) kv[i + 1]);
        return m;
    }

    private static final HttpStatus OK = null, NF = HttpStatus.NOT_FOUND, FORBIDDEN = HttpStatus.FORBIDDEN, UNAUTH = HttpStatus.UNAUTHORIZED;

    // ---------- the owner ----------
    @Test
    void theOwnerCanReachEverythingOfTheirsIncludingDraftsHiddenAndUnlistedButNotSoftDeleted() {
        actAs(a);
        expect(collectionEndpoints(), map(cPub, OK, cUnl, OK, cDraft, OK, cHidden, OK, cDeleted, NF), "owner");
        expect(moduleEndpoints(), map(mPub, OK, mEmpty, OK, mUnl, OK, mDraft, OK, mHidden, OK, mDeleted, NF), "owner");
        expect(pageEndpoints(), map(pPub, OK, pDraft, OK, pUnl, OK, pInDraft, OK, pHidden, OK, pDeleted, NF), "owner");
    }

    @Test
    void onlyRestoreAcceptsASoftDeletedCollectionAndOnlyFromItsOwner() {
        actAs(a);
        assertThat(access.collectionForRestore(cDeleted).getId()).isEqualTo(cDeleted);
        assertThat(statusOf(access::collectionForWrite, cDeleted)).isEqualTo(NF);
        actAs(b);
        assertThat(statusOf(access::collectionForRestore, cDeleted)).isEqualTo(NF);   // invisible to others
        assertThat(statusOf(access::collectionForRestore, cPub)).isEqualTo(FORBIDDEN);
    }

    // ---------- another creator ----------
    @Test
    void anotherCreatorGets404ForInvisibleContentAnd403ForVisibleContentOnEveryEndpoint() {
        actAs(b);
        // collections: visible = published and unlisted; invisible = draft, hidden by moderation, soft-deleted
        expect(collectionEndpoints(), map(cPub, FORBIDDEN, cUnl, FORBIDDEN, cDraft, NF, cHidden, NF, cDeleted, NF), "B");
        // modules: visible iff they have a publicly readable page
        expect(moduleEndpoints(), map(mPub, FORBIDDEN, mUnl, FORBIDDEN, mEmpty, NF, mDraft, NF, mHidden, NF, mDeleted, NF), "B");
        // pages: a draft page, a page in a draft/hidden/deleted collection are all invisible
        expect(pageEndpoints(), map(pPub, FORBIDDEN, pUnl, FORBIDDEN, pDraft, NF, pInDraft, NF, pHidden, NF, pDeleted, NF), "B");
    }

    @Test
    void aMissingIdIsIndistinguishableFromSomeoneElsesDraft() {
        actAs(b);
        long missing = 987_654_321L;
        assertThat(reasonOf(access::collectionForWrite, missing)).isEqualTo(reasonOf(access::collectionForWrite, cDraft));
        assertThat(reasonOf(access::moduleForWrite, missing)).isEqualTo(reasonOf(access::moduleForWrite, mDraft));
        assertThat(reasonOf(access::pageForWrite, missing)).isEqualTo(reasonOf(access::pageForWrite, pDraft));
        expect(collectionEndpoints(), map(missing, NF), "B");
        expect(moduleEndpoints(), map(missing, NF), "B");
        expect(pageEndpoints(), map(missing, NF), "B");
    }

    @Test
    void ownershipIsResolvedFromTheRootCollectionInTheDatabase() {
        // move A's published page into a module of B's collection: access follows the row, nothing the client sends
        long bCollection = track(b, "PUBLISHED", "OK", false);
        long bModule = module(bCollection);
        jdbc.update("update lessons set section_id = ? where id = ?", bModule, pPub);
        actAs(a);
        assertThat(statusOf(access::pageForWrite, pPub)).isEqualTo(FORBIDDEN);
        actAs(b);
        assertThat(statusOf(access::pageForWrite, pPub)).isEqualTo(OK);
    }

    // ---------- admin ----------
    @Test
    void anAdminCannotEditOrReadDraftsThroughCreatorEndpoints() {
        actAs(admin);
        assertThat(admin.getRole()).isEqualTo(Role.ADMIN);
        expect(collectionEndpoints(), map(cPub, FORBIDDEN, cUnl, FORBIDDEN, cDraft, NF, cHidden, NF, cDeleted, NF), "admin");
        expect(moduleEndpoints(), map(mPub, FORBIDDEN, mUnl, FORBIDDEN, mEmpty, NF, mDraft, NF, mHidden, NF, mDeleted, NF), "admin");
        expect(pageEndpoints(), map(pPub, FORBIDDEN, pUnl, FORBIDDEN, pDraft, NF, pInDraft, NF, pHidden, NF, pDeleted, NF), "admin");
        assertThat(statusOf(access::collectionForRestore, cDeleted)).isEqualTo(NF);
    }

    @Test
    void requireOwnerOrAdminLetsAdminsModerateButNobodyElse() {
        Function<Long, Object> moderate = access::requireOwnerOrAdmin;
        actAs(admin);
        for (long c : new long[]{cPub, cUnl, cDraft, cHidden}) assertThat(statusOf(moderate, c)).as("admin on " + c).isEqualTo(OK);
        assertThat(statusOf(moderate, 987_654_321L)).isEqualTo(NF);
        actAs(a);
        for (long c : new long[]{cPub, cUnl, cDraft, cHidden}) assertThat(statusOf(moderate, c)).as("owner on " + c).isEqualTo(OK);
        actAs(b);
        assertThat(statusOf(moderate, cPub)).isEqualTo(FORBIDDEN);
        assertThat(statusOf(moderate, cDraft)).isEqualTo(NF);
        assertThat(statusOf(moderate, cHidden)).isEqualTo(NF);
    }

    @Test
    void adminModerationAccessDoesNotChangeTheOwner() {
        actAs(admin);
        access.requireOwnerOrAdmin(cHidden);
        assertThat(jdbc.queryForObject("select owner_id from tracks where id = ?", Long.class, cHidden)).isEqualTo(a.getId());
    }

    // ---------- suspended and anonymous ----------
    @Test
    void aSuspendedOwnerIsRejectedOnEveryEndpointEvenForTheirOwnContent() {
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.getId());
        actAs(a);
        expect(collectionEndpoints(), map(cPub, UNAUTH, cDraft, UNAUTH, cDeleted, UNAUTH), "suspended owner");
        expect(moduleEndpoints(), map(mPub, UNAUTH, mDraft, UNAUTH), "suspended owner");
        expect(pageEndpoints(), map(pPub, UNAUTH, pDraft, UNAUTH), "suspended owner");
        assertThat(statusOf(access::collectionForRestore, cDeleted)).isEqualTo(UNAUTH);
        assertThat(statusOf(access::requireOwnerOrAdmin, cPub)).isEqualTo(UNAUTH);

        // and nobody else can see their content meanwhile: it is invisible, so 404 rather than 403
        actAs(b);
        expect(collectionEndpoints(), map(cPub, NF, cUnl, NF), "B vs suspended owner");
        expect(moduleEndpoints(), map(mPub, NF), "B vs suspended owner");
        expect(pageEndpoints(), map(pPub, NF), "B vs suspended owner");

        // reactivation restores access, nothing was deleted
        jdbc.update("update users set status = 'ACTIVE' where id = ?", a.getId());
        actAs(a);
        expect(collectionEndpoints(), map(cPub, OK, cDraft, OK), "reactivated owner");
        expect(pageEndpoints(), map(pPub, OK), "reactivated owner");
    }

    @Test
    void aSuspendedAdminCannotModerate() {
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", adminId);
        try {
            actAs(admin);
            assertThat(statusOf(access::requireOwnerOrAdmin, cPub)).isEqualTo(UNAUTH);
        } finally {
            jdbc.update("update users set status = 'ACTIVE' where id = ?", adminId);
        }
    }

    @Test
    void anonymousCallersAndStrayPrincipalsGet401BeforeAnyLookup() {
        // no authentication at all: even an unknown id is 401, not 404
        expect(collectionEndpoints(), map(cPub, UNAUTH, cDraft, UNAUTH, 987_654_321L, UNAUTH), "anonymous");
        expect(moduleEndpoints(), map(mPub, UNAUTH, 987_654_321L, UNAUTH), "anonymous");
        expect(pageEndpoints(), map(pPub, UNAUTH, 987_654_321L, UNAUTH), "anonymous");
        assertThat(statusOf(access::collectionForRestore, cDeleted)).isEqualTo(UNAUTH);
        assertThat(statusOf(access::requireOwnerOrAdmin, cPub)).isEqualTo(UNAUTH);

        // a principal that isn't a user id, and one for a user that no longer exists
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken("someone", null, List.of()));
        assertThat(statusOf(access::pageForWrite, pPub)).isEqualTo(UNAUTH);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(987_654_321L, null, List.of()));
        assertThat(statusOf(access::pageForWrite, pPub)).isEqualTo(UNAUTH);
    }
}
