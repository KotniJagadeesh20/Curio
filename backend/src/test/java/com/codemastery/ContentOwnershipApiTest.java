package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.codemastery.content.TrackRepository;
import com.codemastery.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

/** Step 3: owner / category / status / moderation / soft-delete on tracks, and the legacy API on top of them. */
class ContentOwnershipApiTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired TrackRepository tracks;
    @Autowired UserRepository users;

    private long adminId() {
        return users.findByEmailIgnoreCase("admin@codemastery.local").orElseThrow().getId();
    }

    private long categoryId(String slug) {
        return jdbc.queryForObject("select id from categories where slug = ?", Long.class, slug);
    }

    /**
     * Builds a collection through the creator API (the only write path now): one module "intro", one published page
     * "first", and the collection published when {@code published}. Returns {collectionId, slug, pageSlug}.
     */
    private Object[] newTrackWithLesson(String token, boolean published, Map<String, Object> extra) throws Exception {
        String slug = uniq("own");
        var req = new java.util.HashMap<String, Object>(Map.of("title", "Own " + slug, "slug", slug));
        req.putAll(extra);
        JsonNode t = read(mvc.perform(as(token, post("/api/collections")).content(body(req)))
                .andExpect(status().isCreated()).andReturn());
        long id = t.get("id").asLong();
        JsonNode m = read(mvc.perform(as(token, post("/api/collections/" + id + "/modules"))
                .content(body(Map.of("title", "Intro", "slug", "intro")))).andExpect(status().isCreated()).andReturn());
        JsonNode p = read(mvc.perform(as(token, post("/api/modules/" + m.get("id").asLong() + "/pages"))
                .content(body(Map.of("title", "First", "slug", "first")))).andExpect(status().isCreated()).andReturn());
        mvc.perform(as(token, post("/api/pages/" + p.get("id").asLong() + "/publish"))).andExpect(status().isOk());
        if (published) mvc.perform(as(token, post("/api/collections/" + id + "/publish"))).andExpect(status().isOk());
        return new Object[]{id, slug, "first"};
    }

    /** Test cleanup: a real delete (the API only soft-deletes). */
    private void hardDelete(Object collectionId) {
        jdbc.update("delete from lessons where section_id in (select id from sections where track_id = ?)", collectionId);
        jdbc.update("delete from sections where track_id = ?", collectionId);
        jdbc.update("delete from tracks where id = ?", collectionId);
    }

    // ---------- seeded content ----------
    @Test
    void seededContentIsOwnedByAdminUnderProgrammingAndPublished() {
        // creators may legitimately reuse a seeded slug, so seeded rows are identified by (slug, admin owner)
        assertThat(tracks.countByOwnerIsNull()).as("no ownerless rows after startup").isZero();
        long admin = adminId();
        for (String slug : new String[]{"dsa", "system-design", "linux", "git", "java", "cloud", "docker", "kubernetes", "ai"}) {
            assertThat(jdbc.queryForObject("select count(*) from tracks where slug = ? and owner_id = ?", Long.class, slug, admin))
                    .as("seeded track " + slug + " is owned by the admin").isEqualTo(1);
        }
        long programming = categoryId("programming");
        assertThat(jdbc.queryForObject("select count(*) from tracks where slug in ('dsa','java','git') and owner_id = ? and category_id = ?",
                Long.class, admin, programming)).isEqualTo(3);
        assertThat(jdbc.queryForObject("select status from tracks where slug = 'dsa' and owner_id = ?", String.class, admin)).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("select moderation_status from tracks where slug = 'dsa' and owner_id = ?", String.class, admin)).isEqualTo("OK");
        assertThat(jdbc.queryForObject("select count(*) from lessons where status <> case when published then 'PUBLISHED' else 'DRAFT' end",
                Long.class)).isZero();
    }

    @Test
    void legacyPublicApiStillServesTheSeededContentUnchanged() throws Exception {
        mvc.perform(get("/api/tracks")).andExpect(status().isOk()).andExpect(jsonPath("$[?(@.slug=='dsa')]").exists());
        mvc.perform(get("/api/tracks/dsa")).andExpect(status().isOk())
            .andExpect(jsonPath("$.track.categoryId").value((int) categoryId("programming")));
        mvc.perform(get("/api/tracks/dsa/lessons/two-pointers")).andExpect(status().isOk());
    }

    // ---------- admin API sets owner / category / status ----------
    @Test
    void creatorCreatedCollectionIsOwnedByTheCallerAndTakesAnOptionalCategory() throws Exception {
        String admin = adminToken();
        long travel = categoryId("travel");
        Object[] t = newTrackWithLesson(admin, true, Map.of("categoryId", travel));
        assertThat(jdbc.queryForObject("select owner_id from tracks where id = ?", Long.class, t[0])).isEqualTo(adminId());
        assertThat(jdbc.queryForObject("select category_id from tracks where id = ?", Long.class, t[0])).isEqualTo(travel);

        // owner_id in a request body is refused (strict creator JSON); the owner is always the caller
        long other = users.findByEmailIgnoreCase(newUserEmail()).orElseThrow().getId();
        mvc.perform(as(admin, post("/api/collections")).content(body(Map.of("title", "Steal", "ownerId", other))))
            .andExpect(status().isBadRequest());
        Object[] t2 = newTrackWithLesson(admin, true, Map.of());
        assertThat(jdbc.queryForObject("select owner_id from tracks where id = ?", Long.class, t2[0])).isEqualTo(adminId());
        // no category given -> null (nullable)
        assertThat(jdbc.queryForObject("select category_id from tracks where id = ?", Long.class, t2[0])).isNull();
    }

    private String newUserEmail() throws Exception {
        String email = "owner-" + uniq("u") + "@test.com";
        mvc.perform(post("/api/auth/signup").contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Other", "email", email, "password", "password123"))));
        return email;
    }

    @Test
    void unknownCategoryIs400AndOmittedCategoryOnUpdateKeepsTheCurrentOne() throws Exception {
        String admin = adminToken();
        mvc.perform(as(admin, post("/api/collections"))
                .content(body(Map.of("slug", uniq("bad"), "title", "Bad", "categoryId", 999999))))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.error").value("Unknown category"));

        Object[] t = newTrackWithLesson(admin, true, Map.of("categoryId", categoryId("food")));
        mvc.perform(as(admin, put("/api/collections/" + t[0]))
                .content(body(Map.of("slug", t[1], "title", "Renamed"))))
            .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select category_id from tracks where id = ?", Long.class, t[0])).isEqualTo(categoryId("food"));
        mvc.perform(as(admin, put("/api/collections/" + t[0]))
                .content(body(Map.of("slug", t[1], "title", "Renamed", "categoryId", categoryId("creative")))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.categoryId").value((int) categoryId("creative")));
    }

    @Test
    void publishedFlagAndStatusStayInSync() throws Exception {
        String admin = adminToken();
        Object[] t = newTrackWithLesson(admin, false, Map.of());
        assertThat(jdbc.queryForObject("select status from tracks where id = ?", String.class, t[0])).isEqualTo("DRAFT");
        mvc.perform(as(admin, post("/api/collections/" + t[0] + "/publish"))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select status from tracks where id = ?", String.class, t[0])).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("select published from tracks where id = ?", Boolean.class, t[0])).isTrue();
        mvc.perform(as(admin, post("/api/collections/" + t[0] + "/unpublish"))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select status from tracks where id = ?", String.class, t[0])).isEqualTo("DRAFT");

        // pages too
        Long lessonId = jdbc.queryForObject("select l.id from lessons l join sections s on s.id = l.section_id where s.track_id = ?",
                Long.class, t[0]);
        assertThat(jdbc.queryForObject("select status from lessons where id = ?", String.class, lessonId)).isEqualTo("PUBLISHED");
        mvc.perform(as(admin, post("/api/pages/" + lessonId + "/unpublish"))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select status from lessons where id = ?", String.class, lessonId)).isEqualTo("DRAFT");
    }

    // ---------- category FK ----------
    @Test
    void deletingACategoryInUseIs409AndItStaysUntilNothingUsesIt() throws Exception {
        String admin = adminToken();
        JsonNode cat = read(mvc.perform(as(admin, post("/api/admin/categories"))
                .content(body(Map.of("slug", uniq("used"), "name", "Used")))).andExpect(status().isCreated()).andReturn());
        long catId = cat.get("id").asLong();
        Object[] t = newTrackWithLesson(admin, true, Map.of("categoryId", catId));

        mvc.perform(as(admin, delete("/api/admin/categories/" + catId))).andExpect(status().isConflict());
        mvc.perform(get("/api/public/categories")).andExpect(jsonPath("$[?(@.id==" + catId + ")]").exists());
        assertThat(jdbc.queryForObject("select category_id from tracks where id = ?", Long.class, t[0])).isEqualTo(catId);

        hardDelete(t[0]);
        mvc.perform(as(admin, delete("/api/admin/categories/" + catId))).andExpect(status().isNoContent());
    }

    // ---------- slug scope / owner FK ----------
    @Test
    void slugsAreUniquePerOwnerNotGlobally() throws Exception {
        String other = newUserEmail();
        long otherId = users.findByEmailIgnoreCase(other).orElseThrow().getId();
        jdbc.update("insert into tracks (slug, name, owner_id, status, published) values ('dsa', 'Someone else DSA', ?, 'DRAFT', false)", otherId);
        try {
            assertThrows(DataIntegrityViolationException.class, () ->
                    jdbc.update("insert into tracks (slug, name, owner_id) values ('dsa', 'Dup', ?)", otherId));
            assertThrows(DataIntegrityViolationException.class, () ->
                    jdbc.update("insert into tracks (slug, name, owner_id) values ('dsa', 'Dup', ?)", adminId()));
            // through the creator API a duplicate for the same owner is a 409
            mvc.perform(as(adminToken(), post("/api/collections")).content(body(Map.of("slug", "dsa", "title", "Dup"))))
                .andExpect(status().isConflict());
        } finally {
            jdbc.update("delete from tracks where owner_id = ?", otherId);
        }
    }

    @Test
    void anOwnerCannotBeDeletedWhileTheyOwnContent() throws Exception {
        assertThrows(DataIntegrityViolationException.class, () -> jdbc.update("delete from users where id = ?", adminId()));
    }

    @Test
    void featuredCollectionHasARealForeignKeyThatNullsWhenTheCollectionIsDeleted() throws Exception {
        String admin = adminToken();
        Object[] t = newTrackWithLesson(admin, true, Map.of());
        long aid = adminId();
        assertThrows(DataIntegrityViolationException.class, () ->
                jdbc.update("update user_profiles set featured_collection_id = 999999 where user_id = ?", aid));
        jdbc.update("update user_profiles set featured_collection_id = ? where user_id = ?", t[0], aid);
        hardDelete(t[0]);                                            // the FK acts on a real delete (the API only soft-deletes)
        assertThat(jdbc.queryForObject("select featured_collection_id from user_profiles where user_id = ?", Long.class, aid)).isNull();
    }

    // ---------- legacy public API honours the visibility rule ----------
    private void expectVisible(Object[] t, boolean listed, boolean readable) throws Exception {
        JsonNode all = read(mvc.perform(get("/api/tracks")).andReturn());
        assertThat(all.findValuesAsText("slug").contains((String) t[1])).as("listed").isEqualTo(listed);
        mvc.perform(get("/api/tracks/" + t[1])).andExpect(readable ? status().isOk() : status().isNotFound());
        mvc.perform(get("/api/tracks/" + t[1] + "/lessons/first")).andExpect(readable ? status().isOk() : status().isNotFound());
    }

    @Test
    void legacyPublicReadsFollowStatusModerationDeletionAndOwnerStatus() throws Exception {
        String admin = adminToken();
        Object[] t = newTrackWithLesson(admin, true, Map.of());
        expectVisible(t, true, true);

        jdbc.update("update tracks set status = 'UNLISTED', published = false where id = ?", t[0]);
        expectVisible(t, false, true);                               // direct link only, never listed

        jdbc.update("update tracks set status = 'DRAFT' where id = ?", t[0]);
        expectVisible(t, false, false);

        jdbc.update("update tracks set status = 'PUBLISHED', published = true, moderation_status = 'HIDDEN' where id = ?", t[0]);
        expectVisible(t, false, false);                              // hidden by admin moderation
        jdbc.update("update tracks set moderation_status = 'OK' where id = ?", t[0]);
        expectVisible(t, true, true);

        jdbc.update("update tracks set deleted_at = now() where id = ?", t[0]);
        expectVisible(t, false, false);                              // soft-deleted
        jdbc.update("update tracks set deleted_at = null where id = ?", t[0]);
        expectVisible(t, true, true);

        // a draft page is hidden even though its collection is published, as long as another page keeps the collection public
        jdbc.update("insert into lessons (section_id, slug, title, status, published) select id, 'second', 'Second', 'PUBLISHED', true from sections where track_id = ?", t[0]);
        jdbc.update("update lessons set status = 'DRAFT', published = false where slug = 'first' and section_id in (select id from sections where track_id = ?)", t[0]);
        mvc.perform(get("/api/tracks/" + t[1] + "/lessons/first")).andExpect(status().isNotFound());
        mvc.perform(get("/api/tracks/" + t[1] + "/lessons/second")).andExpect(status().isOk());
        mvc.perform(get("/api/tracks/" + t[1])).andExpect(status().isOk());
        // ... and once no page is published the collection itself disappears
        jdbc.update("update lessons set status = 'DRAFT', published = false where section_id in (select id from sections where track_id = ?)", t[0]);
        expectVisible(t, false, false);
    }

    @Test
    void suspendedOwnersContentDisappearsFromLegacyPublicReadsAndComesBack() throws Exception {
        String admin = adminToken();
        String email = newUserEmail();
        long uid = users.findByEmailIgnoreCase(email).orElseThrow().getId();
        Object[] t = newTrackWithLesson(admin, true, Map.of());
        jdbc.update("update users set role = 'ADMIN' where id = ?", uid);        // the legacy API serves admin-owned content only
        jdbc.update("update tracks set owner_id = ? where id = ?", uid, t[0]);
        expectVisible(t, true, true);

        jdbc.update("update users set status = 'SUSPENDED' where id = ?", uid);
        expectVisible(t, false, false);
        jdbc.update("update users set status = 'ACTIVE' where id = ?", uid);
        expectVisible(t, true, true);

        jdbc.update("delete from lessons where section_id in (select id from sections where track_id = ?)", t[0]);
        jdbc.update("delete from sections where track_id = ?", t[0]);
        jdbc.update("delete from tracks where id = ?", t[0]);
    }

    // ---------- full matrix through the real endpoints ----------
    @Test
    void everyStatusModerationDeletionAndOwnerCombinationBehavesLikeTheRuleOnAllPublicEndpoints() throws Exception {
        String admin = adminToken();
        String email = newUserEmail();
        long uid = users.findByEmailIgnoreCase(email).orElseThrow().getId();
        Object[] t = newTrackWithLesson(admin, true, Map.of());
        long id = (Long) t[0];
        jdbc.update("update users set role = 'ADMIN' where id = ?", uid);        // the legacy API serves admin-owned content only
        jdbc.update("update tracks set owner_id = ? where id = ?", uid, id);
        int checked = 0;
        try {
            for (String col : new String[]{"DRAFT", "PUBLISHED", "UNLISTED"})
                for (String mod : new String[]{"OK", "HIDDEN"})
                    for (boolean deleted : new boolean[]{false, true})
                        for (String owner : new String[]{"ACTIVE", "SUSPENDED"})
                            for (String page : new String[]{"DRAFT", "PUBLISHED"}) {
                                jdbc.update("update tracks set status = ?, published = ?, moderation_status = ?, "
                                        + "deleted_at = case when ? then now() else null end where id = ?",
                                        col, col.equals("PUBLISHED"), mod, deleted, id);
                                jdbc.update("update users set status = ? where id = ?", owner, uid);
                                jdbc.update("update lessons set status = ?, published = ? where section_id in "
                                        + "(select id from sections where track_id = ?)", page, page.equals("PUBLISHED"), id);

                                // a collection with no published page (its only page is a draft) is not public either
                                boolean readable = !col.equals("DRAFT") && mod.equals("OK") && !deleted && owner.equals("ACTIVE")
                                        && page.equals("PUBLISHED");
                                boolean listed = readable && col.equals("PUBLISHED");
                                boolean pageOk = readable && page.equals("PUBLISHED");
                                String ctx = col + "/" + mod + "/deleted=" + deleted + "/" + owner + "/page=" + page;

                                assertThat(read(mvc.perform(get("/api/tracks")).andReturn()).findValuesAsText("slug").contains((String) t[1]))
                                        .as("listed " + ctx).isEqualTo(listed);
                                mvc.perform(get("/api/tracks/" + t[1])).andExpect(readable ? status().isOk() : status().isNotFound());
                                mvc.perform(get("/api/tracks/" + t[1] + "/lessons/first"))
                                    .andExpect(pageOk ? status().isOk() : status().isNotFound());
                                if (readable) {   // a draft page is simply absent from the readable track's section
                                    JsonNode d = read(mvc.perform(get("/api/tracks/" + t[1])).andReturn());
                                    assertThat(d.get("sections").get(0).get("lessons").size()).as("lessons in " + ctx)
                                            .isEqualTo(page.equals("PUBLISHED") ? 1 : 0);
                                }
                                checked++;
                            }
        } finally {
            jdbc.update("update users set status = 'ACTIVE' where id = ?", uid);
            jdbc.update("delete from lessons where section_id in (select id from sections where track_id = ?)", id);
            jdbc.update("delete from sections where track_id = ?", id);
            jdbc.update("delete from tracks where id = ?", id);
        }
        assertThat(checked).isEqualTo(3 * 2 * 2 * 2 * 2);
    }

    @Test
    void problemsDoNotLeakTheSlugOfATrackThatIsNotPubliclyReadable() throws Exception {
        String admin = adminToken();
        Object[] t = newTrackWithLesson(admin, true, Map.of());
        String problemSlug = uniq("prob");
        mvc.perform(as(admin, post("/api/admin/problems")).content(body(Map.of(
                "slug", problemSlug, "title", "P", "difficulty", "easy", "trackSlug", t[1], "published", true))))
            .andExpect(status().isCreated());
        try {
            mvc.perform(get("/api/problems/" + problemSlug)).andExpect(jsonPath("$.trackSlug").value(t[1]));
            assertThat(read(mvc.perform(get("/api/problems?track=" + t[1])).andReturn()).findValuesAsText("slug")).contains(problemSlug);

            jdbc.update("update tracks set moderation_status = 'HIDDEN' where id = ?", t[0]);
            // the problem itself is governed by its own flag and stays readable, but the hidden track is not revealed
            mvc.perform(get("/api/problems/" + problemSlug)).andExpect(status().isOk()).andExpect(jsonPath("$.trackSlug").doesNotExist());
            assertThat(read(mvc.perform(get("/api/problems?track=" + t[1])).andReturn())).isEmpty();
            JsonNode all = read(mvc.perform(get("/api/problems")).andReturn());
            for (JsonNode p : all) if (p.get("slug").asText().equals(problemSlug)) assertThat(p.get("trackSlug").isNull()).isTrue();
            // the admin view still shows the real link (it is needed to edit the problem)
            mvc.perform(as(admin, get("/api/admin/problems"))).andExpect(status().isOk());
        } finally {
            jdbc.update("delete from problems where slug = ?", problemSlug);
            jdbc.update("delete from lessons where section_id in (select id from sections where track_id = ?)", t[0]);
            jdbc.update("delete from sections where track_id = ?", t[0]);
            jdbc.update("delete from tracks where id = ?", t[0]);
        }
    }

    @Test
    void publicCategoriesAndCreatorEndpointsExposeNoContentVisibilityLeaks() throws Exception {
        // these two public endpoints carry no collection data in Step 3; the creator profile gets collections in Step 6/15
        String body = mvc.perform(get("/api/public/categories")).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("owner").doesNotContain("moderation").doesNotContain("deleted");
        String creator = mvc.perform(get("/api/public/creators/admin")).andReturn().getResponse().getContentAsString();
        assertThat(creator).doesNotContain("collections").doesNotContain("moderation");
    }

    // ---------- published <-> status synchronisation on every update path ----------
    private void assertInSync() {
        assertThat(jdbc.queryForObject("select count(*) from tracks where published <> (status = 'PUBLISHED')", Long.class))
                .as("tracks: published must equal (status = PUBLISHED)").isZero();
        assertThat(jdbc.queryForObject("select count(*) from lessons where published <> (status = 'PUBLISHED')", Long.class))
                .as("lessons: published must equal (status = PUBLISHED)").isZero();
    }

    @Test
    void publishedAndStatusStayInSyncOnEveryWritePath() throws Exception {
        String admin = adminToken();
        assertInSync();                                              // seeded + migrated data

        // a new collection is a DRAFT (published = false) and a new page is a DRAFT
        String slug = uniq("sync");
        long id = read(mvc.perform(as(admin, post("/api/collections")).content(body(Map.of("slug", slug, "title", "S"))))
                .andExpect(status().isCreated()).andReturn()).get("id").asLong();
        assertThat(jdbc.queryForObject("select status from tracks where id = ?", String.class, id)).isEqualTo("DRAFT");
        assertInSync();

        long secId = read(mvc.perform(as(admin, post("/api/collections/" + id + "/modules"))
                .content(body(Map.of("title", "S", "slug", "s")))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
        long l1 = read(mvc.perform(as(admin, post("/api/modules/" + secId + "/pages"))
                .content(body(Map.of("title", "A", "slug", "a")))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
        long l2 = read(mvc.perform(as(admin, post("/api/modules/" + secId + "/pages"))
                .content(body(Map.of("title", "B", "slug", "b")))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
        assertThat(jdbc.queryForObject("select status from lessons where id = ?", String.class, l1)).isEqualTo("DRAFT");
        assertInSync();

        // every collection/page transition keeps both fields consistent; updating never changes the status
        mvc.perform(as(admin, post("/api/pages/" + l1 + "/publish"))).andExpect(status().isOk());
        assertInSync();
        mvc.perform(as(admin, put("/api/pages/" + l1)).content(body(Map.of("title", "A2")))).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select status from lessons where id = ?", String.class, l1)).isEqualTo("PUBLISHED");
        for (String action : new String[]{"publish", "unpublish", "publish"}) {
            mvc.perform(as(admin, post("/api/collections/" + id + "/" + action))).andExpect(status().isOk());
            assertThat(jdbc.queryForObject("select status from tracks where id = ?", String.class, id))
                    .isEqualTo(action.equals("publish") ? "PUBLISHED" : "DRAFT");
            assertInSync();
        }
        mvc.perform(as(admin, post("/api/collections/" + id + "/publish")).content(body(Map.of("status", "UNLISTED"))))
            .andExpect(status().isOk());
        assertInSync();                                              // UNLISTED reads as not published to legacy code
        for (String action : new String[]{"publish", "unpublish"}) {
            mvc.perform(as(admin, post("/api/pages/" + l2 + "/" + action))).andExpect(status().isOk());
            assertInSync();
        }

        // entity-level writes: both setters keep both fields consistent
        var track = tracks.findById(id).orElseThrow();
        track.setStatus(com.codemastery.content.CollectionStatus.UNLISTED);
        assertThat(track.isPublished()).as("UNLISTED reads as not published to legacy code").isFalse();
        tracks.save(track);
        assertInSync();
        track.setStatus(com.codemastery.content.CollectionStatus.PUBLISHED);
        assertThat(track.isPublished()).isTrue();
        track.setPublished(false);
        assertThat(track.getStatus()).isEqualTo(com.codemastery.content.CollectionStatus.DRAFT);
        tracks.save(track);
        assertInSync();

        mvc.perform(as(admin, delete("/api/collections/" + id))).andExpect(status().isNoContent());
        assertInSync();
    }
}
