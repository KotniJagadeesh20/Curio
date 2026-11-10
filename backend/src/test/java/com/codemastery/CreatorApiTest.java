package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.codemastery.user.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/** Step 5: the creator workspace over real HTTP (MockMvc through the full security filter chain). */
class CreatorApiTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;

    record Creator(long id, String email, String token) {}

    private Creator newCreator() throws Exception {
        String email = "creator-" + UUID.randomUUID() + "@test.com";
        String token = read(mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Creator", "email", email, "password", "password123")))).andReturn()).get("token").asText();
        return new Creator(users.findByEmailIgnoreCase(email).orElseThrow().getId(), email, token);
    }

    private Creator admin() throws Exception {
        return new Creator(users.findByEmailIgnoreCase("admin@codemastery.local").orElseThrow().getId(), "admin", adminToken());
    }

    private ResultActions call(String token, MockHttpServletRequestBuilder req, Object body) throws Exception {
        MockHttpServletRequestBuilder r = token == null ? req.contentType(MediaType.APPLICATION_JSON) : as(token, req);
        if (body != null) r = r.content(body instanceof String s ? s : body(body));
        return mvc.perform(r);
    }

    private JsonNode ok(ResultActions a, int status) throws Exception {
        var res = a.andExpect(status().is(status)).andReturn();
        String c = res.getResponse().getContentAsString();
        return c.isBlank() ? null : json.readTree(c);
    }

    // ---- small builders; each returns the created JSON ----
    private JsonNode collection(Creator c, Map<String, Object> body) throws Exception {
        return ok(call(c.token, post("/api/collections"), body), 201);
    }

    private JsonNode collection(Creator c, String title) throws Exception {
        return collection(c, Map.of("title", title));
    }

    private JsonNode module(Creator c, long collectionId, String title) throws Exception {
        return ok(call(c.token, post("/api/collections/" + collectionId + "/modules"), Map.of("title", title)), 201);
    }

    private JsonNode page(Creator c, long moduleId, String title, String status) throws Exception {
        JsonNode created = ok(call(c.token, post("/api/modules/" + moduleId + "/pages"), Map.of("title", title)), 201);
        assertThat(created.get("status").asText()).as("a new page is always a draft").isEqualTo("DRAFT");
        return status.equals("PUBLISHED")
                ? ok(call(c.token, post("/api/pages/" + created.get("id").asLong() + "/publish"), null), 200)
                : created;
    }

    /** A collection with one module and a PUBLISHED page, still a DRAFT collection. Returns {collectionId, moduleId, pageId, slug}. */
    private Object[] ready(Creator c, String title) throws Exception {
        JsonNode col = collection(c, title);
        long id = col.get("id").asLong();
        long m = module(c, id, "Basics").get("id").asLong();
        long p = page(c, m, "Hello", "PUBLISHED").get("id").asLong();
        return new Object[]{id, m, p, col.get("slug").asText()};
    }

    private String dbString(String sql, Object... args) { return jdbc.queryForObject(sql, String.class, args); }

    // =====================================================================================================
    // collections
    // =====================================================================================================
    @Test
    void creatingACollectionMakesTheCallerTheOwnerAsADraft() throws Exception {
        Creator a = newCreator();
        JsonNode c = collection(a, Map.of("title", "  My Java Notes  ", "description", " intro ",
                "coverUrl", "https://example.com/c.png", "categoryId", jdbc.queryForObject("select id from categories where slug='programming'", Long.class)));
        assertThat(c.get("title").asText()).isEqualTo("My Java Notes");
        assertThat(c.get("slug").asText()).isEqualTo("my-java-notes");
        assertThat(c.get("status").asText()).isEqualTo("DRAFT");
        assertThat(c.get("description").asText()).isEqualTo("intro");
        assertThat(c.get("hiddenByModeration").asBoolean()).isFalse();
        long id = c.get("id").asLong();
        assertThat(jdbc.queryForObject("select owner_id from tracks where id = ?", Long.class, id)).isEqualTo(a.id);
        assertThat(dbString("select moderation_status from tracks where id = ?", id)).isEqualTo("OK");
        assertThat(jdbc.queryForObject("select published from tracks where id = ?", Boolean.class, id)).isFalse();
    }

    @Test
    void anAdminCreatingThroughTheCreatorApiOwnsTheirOwnCollection() throws Exception {
        Creator ad = admin();
        long id = collection(ad, uniq("Admin collection")).get("id").asLong();
        assertThat(jdbc.queryForObject("select owner_id from tracks where id = ?", Long.class, id)).isEqualTo(ad.id);
        ok(call(ad.token, delete("/api/collections/" + id), null), 204);
    }

    @Test
    void fieldsTheClientMustNeverControlAreRejectedNotIgnored() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        for (String field : List.of("ownerId", "owner", "moderationStatus", "status", "deletedAt", "id", "published")) {
            JsonNode err = ok(call(a.token, post("/api/collections"), Map.of("title", "X", field, field.equals("ownerId") ? b.id : "HIDDEN")), 400);
            assertThat(err.get("error").asText()).contains(field);
        }
        long id = collection(a, "Mine").get("id").asLong();
        ok(call(a.token, put("/api/collections/" + id), Map.of("title", "X", "ownerId", b.id)), 400);
        ok(call(a.token, put("/api/collections/" + id), Map.of("title", "X", "status", "PUBLISHED")), 400);
        long m = module(a, id, "M").get("id").asLong();
        ok(call(a.token, post("/api/collections/" + id + "/modules"), Map.of("title", "X", "ownerId", b.id)), 400);
        ok(call(a.token, post("/api/modules/" + m + "/pages"), Map.of("title", "X", "ownerId", b.id)), 400);
        ok(call(a.token, post("/api/modules/" + m + "/pages"), Map.of("title", "X", "moderationStatus", "OK")), 400);
        assertThat(jdbc.queryForObject("select owner_id from tracks where id = ?", Long.class, id)).isEqualTo(a.id);
        ok(call(a.token, post("/api/collections"), "{not json"), 400);
    }

    @Test
    void validationOfCollectionFields() throws Exception {
        Creator a = newCreator();
        for (Map<String, Object> bad : List.<Map<String, Object>>of(
                Map.of("title", "   "), Map.of("title", "t".repeat(161)), Map.of("title", "X", "slug", "Bad Slug"),
                Map.of("title", "X", "slug", "s".repeat(61)), Map.of("title", "X", "description", "d".repeat(5001)),
                Map.of("title", "X", "coverUrl", "http://example.com/c.png"), Map.of("title", "X", "coverUrl", "javascript:alert(1)"),
                Map.of("title", "X", "categoryId", 999999))) {
            ok(call(a.token, post("/api/collections"), bad), 400);
        }
        assertThat(ok(call(a.token, post("/api/collections"), Map.of("title", "X", "categoryId", 999999)), 400).get("error").asText())
                .isEqualTo("Unknown category");
    }

    @Test
    void twoCreatorsCanUseTheSameSlugButOneCreatorCannotUseItTwice() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        JsonNode ca = collection(a, Map.of("title", "Java", "slug", "java-learning"));
        JsonNode cb = collection(b, Map.of("title", "Java", "slug", "java-learning"));
        assertThat(ca.get("slug").asText()).isEqualTo(cb.get("slug").asText());
        assertThat(ca.get("id").asLong()).isNotEqualTo(cb.get("id").asLong());
        assertThat(ok(call(a.token, post("/api/collections"), Map.of("title", "Again", "slug", "java-learning")), 409).get("error").asText())
                .isEqualTo("Slug already in use");
        // derived slugs get a counter instead of failing
        assertThat(collection(a, "Java").get("slug").asText()).isEqualTo("java");
        assertThat(collection(a, "Java").get("slug").asText()).isEqualTo("java-2");
        // modules and pages are unique per parent, and free across parents
        long m1 = module(a, ca.get("id").asLong(), "Intro").get("id").asLong();
        assertThat(module(a, ca.get("id").asLong(), "Intro").get("slug").asText()).isEqualTo("intro-2");
        ok(call(a.token, post("/api/collections/" + ca.get("id").asLong() + "/modules"), Map.of("title", "x", "slug", "intro")), 409);
        long m2 = module(b, cb.get("id").asLong(), "Intro").get("id").asLong();
        assertThat(page(a, m1, "Hello", "DRAFT").get("slug").asText()).isEqualTo("hello");
        assertThat(page(a, m1, "Hello", "DRAFT").get("slug").asText()).isEqualTo("hello-2");
        assertThat(page(b, m2, "Hello", "DRAFT").get("slug").asText()).isEqualTo("hello");
    }

    @Test
    void aCreatorReusingASeededSlugNeitherBreaksNorShadowsTheLegacyLearningApi() throws Exception {
        Creator a = newCreator();
        JsonNode c = collection(a, Map.of("title", "My DSA", "slug", "dsa"));       // the seeded admin track is also "dsa"
        long m = module(a, c.get("id").asLong(), "M").get("id").asLong();
        page(a, m, "two-pointers", "PUBLISHED");
        ok(call(a.token, post("/api/collections/" + c.get("id").asLong() + "/publish"), null), 200);

        // still the admin's seeded track, no 500, and the creator's collection is not part of the legacy list
        JsonNode dsa = read(mvc.perform(get("/api/tracks/dsa")).andExpect(status().isOk()).andReturn());
        assertThat(dsa.get("track").get("name").asText()).isNotEqualTo("My DSA");
        assertThat(dsa.get("track").get("lessonCount").asLong()).isGreaterThan(30);
        mvc.perform(get("/api/tracks/dsa/lessons/two-pointers")).andExpect(status().isOk()).andExpect(jsonPath("$.concept").isNotEmpty());
        JsonNode list = read(mvc.perform(get("/api/tracks")).andReturn());
        assertThat(list.findValuesAsText("name")).doesNotContain("My DSA");
        // and a slug only a creator has is not served by the legacy API at all
        long own = collection(a, "Only Mine").get("id").asLong();
        long om = module(a, own, "M").get("id").asLong();
        page(a, om, "P", "PUBLISHED");
        ok(call(a.token, post("/api/collections/" + own + "/publish"), null), 200);
        mvc.perform(get("/api/tracks/only-mine")).andExpect(status().isNotFound());
        mvc.perform(get("/api/tracks/only-mine/lessons/p")).andExpect(status().isNotFound());
    }

    @Test
    void mineListsOnlyTheCallersLiveCollectionsAndTrashListsTheDeletedOnes() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        long c1 = collection(a, "One").get("id").asLong();
        long c2 = collection(a, "Two").get("id").asLong();
        long cb = collection(b, "Bee").get("id").asLong();
        JsonNode mine = ok(call(a.token, get("/api/collections/mine"), null), 200);
        assertThat(mine.findValues("id").stream().map(JsonNode::asLong)).containsExactly(c1, c2);   // creation order
        ok(call(a.token, delete("/api/collections/" + c1), null), 204);
        assertThat(ok(call(a.token, get("/api/collections/mine"), null), 200).findValues("id").stream().map(JsonNode::asLong)).containsExactly(c2);
        JsonNode trash = ok(call(a.token, get("/api/collections/mine?deleted=true"), null), 200);
        assertThat(trash).hasSize(1);
        assertThat(trash.get(0).get("id").asLong()).isEqualTo(c1);
        assertThat(trash.get(0).get("deletedAt").isNull()).isFalse();
        assertThat(trash.get(0).get("restorableUntil").isNull()).isFalse();
        assertThat(ok(call(b.token, get("/api/collections/mine"), null), 200).findValues("id").stream().map(JsonNode::asLong)).containsExactly(cb);
        assertThat(ok(call(b.token, get("/api/collections/mine?deleted=true"), null), 200)).isEmpty();
        mvc.perform(get("/api/collections/mine")).andExpect(status().isUnauthorized());
    }

    @Test
    void anOwnerReadsAndUpdatesTheirOwnCollectionWithPartialUpdateSemantics() throws Exception {
        Creator a = newCreator();
        JsonNode created = collection(a, Map.of("title", "Draft", "description", "d", "coverUrl", "https://example.com/c.png"));
        long id = created.get("id").asLong();
        long m = module(a, id, "Basics").get("id").asLong();
        page(a, m, "P1", "PUBLISHED");
        page(a, m, "P2", "DRAFT");

        JsonNode detail = ok(call(a.token, get("/api/collections/" + id), null), 200);
        assertThat(detail.get("collection").get("pageCount").asInt()).isEqualTo(2);
        assertThat(detail.get("collection").get("publishedPageCount").asInt()).isEqualTo(1);
        assertThat(detail.get("collection").get("draftPageCount").asInt()).isEqualTo(1);
        assertThat(detail.get("modules").get(0).get("pages")).hasSize(2);

        // omitted description/cover/category are unchanged; "" clears
        JsonNode upd = ok(call(a.token, put("/api/collections/" + id), Map.of("title", "Renamed")), 200);
        assertThat(upd.get("title").asText()).isEqualTo("Renamed");
        assertThat(upd.get("description").asText()).isEqualTo("d");
        assertThat(upd.get("coverUrl").asText()).isEqualTo("https://example.com/c.png");
        JsonNode cleared = ok(call(a.token, put("/api/collections/" + id), Map.of("title", "Renamed", "coverUrl", "", "description", "")), 200);
        assertThat(cleared.get("coverUrl").isNull()).isTrue();
        assertThat(cleared.get("description").asText()).isEmpty();
    }

    @Test
    void slugsCanOnlyChangeWhileTheCollectionIsADraft() throws Exception {
        Creator a = newCreator();
        Object[] r = ready(a, "Sluggy");
        long id = (Long) r[0];
        assertThat(ok(call(a.token, put("/api/collections/" + id), Map.of("title", "Sluggy", "slug", "better-slug")), 200).get("slug").asText()).isEqualTo("better-slug");
        long taken = collection(a, "Taken").get("id").asLong();
        ok(call(a.token, put("/api/collections/" + id), Map.of("title", "Sluggy", "slug", "taken")), 409);
        // module and page slugs follow the same rule
        ok(call(a.token, put("/api/modules/" + r[1]), Map.of("title", "Basics", "slug", "basics-2")), 200);
        ok(call(a.token, put("/api/pages/" + r[2]), Map.of("title", "Hello", "slug", "hello-2")), 200);

        ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 200);
        assertThat(ok(call(a.token, put("/api/collections/" + id), Map.of("title", "Sluggy", "slug", "other")), 400).get("error").asText()).contains("unpublish");
        ok(call(a.token, put("/api/modules/" + r[1]), Map.of("title", "Basics", "slug", "other")), 400);
        ok(call(a.token, put("/api/pages/" + r[2]), Map.of("title", "Hello", "slug", "other")), 400);
        // echoing the current slug is fine
        ok(call(a.token, put("/api/collections/" + id), Map.of("title", "Sluggy 2", "slug", "better-slug")), 200);
        ok(call(a.token, post("/api/collections/" + id + "/unpublish"), null), 200);
        ok(call(a.token, put("/api/collections/" + id), Map.of("title", "Sluggy", "slug", "other")), 200);
    }

    // =====================================================================================================
    // publishing
    // =====================================================================================================
    @Test
    void publishingNeedsAPublishedPageAndNeverPublishesDrafts() throws Exception {
        Creator a = newCreator();
        long id = collection(a, "Pub").get("id").asLong();
        assertThat(ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 400).get("error").asText()).contains("published page");
        long m = module(a, id, "M").get("id").asLong();
        ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 400);                        // empty module
        long draft = page(a, m, "Draft only", "DRAFT").get("id").asLong();
        ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 400);                        // only a draft page
        ok(call(a.token, post("/api/pages/" + draft + "/publish"), null), 200);
        page(a, m, "Second draft", "DRAFT");

        JsonNode published = ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 200);
        assertThat(published.get("status").asText()).isEqualTo("PUBLISHED");
        assertThat(published.get("draftPageCount").asInt()).as("drafts stay drafts").isEqualTo(1);
        assertThat(jdbc.queryForObject("select count(*) from lessons l join sections s on s.id = l.section_id where s.track_id = ? and l.status = 'DRAFT'", Long.class, id)).isEqualTo(1);
        assertThat(jdbc.queryForObject("select published from tracks where id = ?", Boolean.class, id)).isTrue();

        // idempotent, and every transition is explicit
        ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 200);
        assertThat(ok(call(a.token, post("/api/collections/" + id + "/publish"), Map.of("status", "UNLISTED")), 200).get("status").asText()).isEqualTo("UNLISTED");
        assertThat(ok(call(a.token, post("/api/collections/" + id + "/publish"), Map.of("status", "PUBLISHED")), 200).get("status").asText()).isEqualTo("PUBLISHED");
        assertThat(ok(call(a.token, post("/api/collections/" + id + "/unpublish"), null), 200).get("status").asText()).isEqualTo("DRAFT");
        assertThat(ok(call(a.token, post("/api/collections/" + id + "/publish"), Map.of("status", "UNLISTED")), 200).get("status").asText()).isEqualTo("UNLISTED");
        ok(call(a.token, post("/api/collections/" + id + "/publish"), Map.of("status", "DRAFT")), 400);
        ok(call(a.token, post("/api/collections/" + id + "/publish"), Map.of("status", "NOPE")), 400);
        ok(call(a.token, post("/api/collections/" + id + "/publish"), Map.of("status", "PUBLISHED", "ownerId", 1)), 400);
        // published <-> status stay in sync through the creator API too
        assertThat(jdbc.queryForObject("select count(*) from tracks where published <> (status = 'PUBLISHED')", Long.class)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from lessons where published <> (status = 'PUBLISHED')", Long.class)).isZero();
    }

    @Test
    void publicVisibilityFollowsTheSameRulesForACollectionOwnedByAnAdmin() throws Exception {
        // the legacy public API serves admin-owned content, so an admin-owned creator-API collection shows the rules end to end
        Creator ad = admin();
        JsonNode col = collection(ad, uniq("Visible"));
        long id = col.get("id").asLong();
        String slug = col.get("slug").asText();
        long m = module(ad, id, "M").get("id").asLong();
        long p = page(ad, m, "First", "PUBLISHED").get("id").asLong();
        try {
            mvc.perform(get("/api/tracks/" + slug)).andExpect(status().isNotFound());                                 // draft
            ok(call(ad.token, post("/api/collections/" + id + "/publish"), null), 200);
            mvc.perform(get("/api/tracks/" + slug + "/lessons/first")).andExpect(status().isOk());
            assertThat(read(mvc.perform(get("/api/tracks")).andReturn()).findValuesAsText("slug")).contains(slug);

            ok(call(ad.token, post("/api/collections/" + id + "/publish"), Map.of("status", "UNLISTED")), 200);
            mvc.perform(get("/api/tracks/" + slug)).andExpect(status().isOk());                                       // by link
            assertThat(read(mvc.perform(get("/api/tracks")).andReturn()).findValuesAsText("slug")).doesNotContain(slug);

            ok(call(ad.token, post("/api/collections/" + id + "/publish"), Map.of("status", "PUBLISHED")), 200);
            ok(call(ad.token, post("/api/pages/" + p + "/unpublish"), null), 200);
            mvc.perform(get("/api/tracks/" + slug + "/lessons/first")).andExpect(status().isNotFound());              // draft page
            ok(call(ad.token, post("/api/pages/" + p + "/publish"), null), 200);

            jdbc.update("update tracks set moderation_status = 'HIDDEN' where id = ?", id);
            mvc.perform(get("/api/tracks/" + slug)).andExpect(status().isNotFound());                                 // hidden by admin moderation
            assertThat(ok(call(ad.token, get("/api/collections/" + id), null), 200).get("collection").get("hiddenByModeration").asBoolean()).isTrue();
            jdbc.update("update tracks set moderation_status = 'OK' where id = ?", id);
            mvc.perform(get("/api/tracks/" + slug)).andExpect(status().isOk());

            ok(call(ad.token, delete("/api/collections/" + id), null), 204);
            mvc.perform(get("/api/tracks/" + slug)).andExpect(status().isNotFound());                                 // soft-deleted
        } finally {
            jdbc.update("delete from lessons where section_id in (select id from sections where track_id = ?)", id);
            jdbc.update("delete from sections where track_id = ?", id);
            jdbc.update("delete from tracks where id = ?", id);
        }
    }

    // =====================================================================================================
    // soft delete / restore
    // =====================================================================================================
    @Test
    void softDeleteHidesTheCollectionFreesTheSlugAndRestoreBringsItBackAsADraft() throws Exception {
        Creator a = newCreator();
        JsonNode created = collection(a, Map.of("title", "Trip", "slug", "my-trip"));
        long id = created.get("id").asLong();
        long m = module(a, id, "Day 1").get("id").asLong();
        long p = page(a, m, "Morning", "PUBLISHED").get("id").asLong();
        ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 200);

        ok(call(a.token, delete("/api/collections/" + id), null), 204);
        assertThat(dbString("select slug from tracks where id = ?", id)).isEqualTo("my-trip~deleted~" + id);
        assertThat(dbString("select status from tracks where id = ?", id)).isEqualTo("DRAFT");
        assertThat(jdbc.queryForObject("select deleted_at is not null from tracks where id = ?", Boolean.class, id)).isTrue();
        // nothing is reachable any more, even for the owner, except restore
        ok(call(a.token, get("/api/collections/" + id), null), 404);
        ok(call(a.token, put("/api/collections/" + id), Map.of("title", "x")), 404);
        ok(call(a.token, delete("/api/collections/" + id), null), 404);
        ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 404);
        ok(call(a.token, post("/api/collections/" + id + "/modules"), Map.of("title", "x")), 404);
        ok(call(a.token, put("/api/modules/" + m), Map.of("title", "x")), 404);
        ok(call(a.token, get("/api/pages/" + p), null), 404);
        ok(call(a.token, delete("/api/pages/" + p), null), 404);

        // the slug is free again
        long again = collection(a, Map.of("title", "Trip again", "slug", "my-trip")).get("id").asLong();
        // so restoring now conflicts, and nothing changes
        ok(call(a.token, post("/api/collections/" + id + "/restore"), null), 409);
        assertThat(jdbc.queryForObject("select deleted_at is not null from tracks where id = ?", Boolean.class, id)).isTrue();
        ok(call(a.token, delete("/api/collections/" + again), null), 204);

        JsonNode restored = ok(call(a.token, post("/api/collections/" + id + "/restore"), null), 200);
        assertThat(restored.get("slug").asText()).isEqualTo("my-trip");
        assertThat(restored.get("status").asText()).isEqualTo("DRAFT");
        assertThat(restored.get("deletedAt").isNull()).isTrue();
        assertThat(restored.get("pageCount").asInt()).isEqualTo(1);                // children were untouched
        ok(call(a.token, get("/api/collections/" + id), null), 200);
        ok(call(a.token, post("/api/collections/" + id + "/restore"), null), 400);   // not deleted any more
        ok(call(a.token, post("/api/collections/" + id + "/publish"), null), 200);   // republishing is explicit
    }

    @Test
    void restoreIsOwnerOnlyAndExpiresAfter30Days() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        long id = collection(a, "Old").get("id").asLong();
        ok(call(a.token, delete("/api/collections/" + id), null), 204);
        ok(call(b.token, post("/api/collections/" + id + "/restore"), null), 404);
        ok(call(admin().token, post("/api/collections/" + id + "/restore"), null), 404);
        mvc.perform(post("/api/collections/" + id + "/restore")).andExpect(status().isUnauthorized());

        jdbc.update("update tracks set deleted_at = now() - interval '29' day where id = ?", id);
        ok(call(a.token, post("/api/collections/" + id + "/restore"), null), 200);
        ok(call(a.token, delete("/api/collections/" + id), null), 204);
        jdbc.update("update tracks set deleted_at = now() - interval '31' day where id = ?", id);
        assertThat(ok(call(a.token, post("/api/collections/" + id + "/restore"), null), 410).get("error").asText()).contains("30-day");
    }

    // =====================================================================================================
    // modules and pages: lifecycle by the owner
    // =====================================================================================================
    @Test
    void modulesAndPagesCanBeCreatedEditedReorderedAndDeletedByTheOwner() throws Exception {
        Creator a = newCreator();
        long col = collection(a, "Course").get("id").asLong();
        long m1 = module(a, col, "One").get("id").asLong();
        long m2 = module(a, col, "Two").get("id").asLong();
        long m3 = module(a, col, "Three").get("id").asLong();

        JsonNode upd = ok(call(a.token, put("/api/modules/" + m2), Map.of("title", "Two (renamed)")), 200);
        assertThat(upd.get("title").asText()).isEqualTo("Two (renamed)");
        assertThat(upd.get("slug").asText()).isEqualTo("two");

        // reorder: move the last module to the front, then past the end (clamped)
        assertThat(ok(call(a.token, patch("/api/modules/" + m3 + "/reorder"), Map.of("position", 0)), 200).get("position").asInt()).isZero();
        assertThat(moduleOrder(a, col)).containsExactly(m3, m1, m2);
        ok(call(a.token, patch("/api/modules/" + m3 + "/reorder"), Map.of("position", 99)), 200);
        assertThat(moduleOrder(a, col)).containsExactly(m1, m2, m3);
        ok(call(a.token, patch("/api/modules/" + m3 + "/reorder"), Map.of("position", -1)), 400);
        ok(call(a.token, patch("/api/modules/" + m3 + "/reorder"), Map.of()), 400);

        // pages: default DRAFT, blocks stored, updated, reordered, deleted
        JsonNode p1 = ok(call(a.token, post("/api/modules/" + m1 + "/pages"), Map.of("title", "A")), 201);
        assertThat(p1.get("status").asText()).isEqualTo("DRAFT");
        assertThat(p1.get("blocks")).isEmpty();
        assertThat(p1.get("legacy").asBoolean()).isFalse();
        long pa = p1.get("id").asLong();
        long pb = page(a, m1, "B", "DRAFT").get("id").asLong();
        long pc = page(a, m1, "C", "DRAFT").get("id").asLong();
        List<Map<String, Object>> blocks = List.of(Map.of("id", "h1", "type", "heading", "level", 2, "text", "Hi"), Map.of("id", "t1", "type", "text", "text", "Body"));
        JsonNode saved = ok(call(a.token, put("/api/pages/" + pa), Map.of("title", "A2", "summary", "s", "blocks", blocks)), 200);
        assertThat(saved.get("status").asText()).as("updating content never changes the status").isEqualTo("DRAFT");
        ok(call(a.token, post("/api/pages/" + pa + "/publish"), null), 200);
        saved = ok(call(a.token, put("/api/pages/" + pa), Map.of("title", "A2")), 200);
        assertThat(saved.get("blocks")).hasSize(2);
        assertThat(saved.get("blocks").get(0).get("text").asText()).isEqualTo("Hi");
        assertThat(saved.get("summary").asText()).isEqualTo("s");
        assertThat(saved.get("status").asText()).isEqualTo("PUBLISHED");
        // omitted blocks/summary/status unchanged; [] clears blocks
        JsonNode same = ok(call(a.token, put("/api/pages/" + pa), Map.of("title", "A3")), 200);
        assertThat(same.get("blocks")).hasSize(2);
        assertThat(same.get("status").asText()).isEqualTo("PUBLISHED");
        assertThat(ok(call(a.token, put("/api/pages/" + pa), Map.of("title", "A3", "blocks", List.of())), 200).get("blocks")).isEmpty();
        assertThat(ok(call(a.token, get("/api/pages/" + pa), null), 200).get("collectionId").asLong()).isEqualTo(col);

        ok(call(a.token, patch("/api/pages/" + pc + "/reorder"), Map.of("position", 0)), 200);
        assertThat(pageOrder(a, col, m1)).containsExactly(pc, pa, pb);
        ok(call(a.token, delete("/api/pages/" + pa), null), 204);
        assertThat(pageOrder(a, col, m1)).containsExactly(pc, pb);
        ok(call(a.token, get("/api/pages/" + pa), null), 404);

        // deleting a module removes its pages
        ok(call(a.token, delete("/api/modules/" + m1), null), 204);
        ok(call(a.token, get("/api/pages/" + pb), null), 404);
        assertThat(jdbc.queryForObject("select count(*) from lessons where id in (?, ?)", Long.class, pb, pc)).isZero();
        assertThat(moduleOrder(a, col)).containsExactly(m2, m3);
    }

    private List<Long> moduleOrder(Creator c, long col) throws Exception {
        List<Long> ids = new ArrayList<>();
        ok(call(c.token, get("/api/collections/" + col), null), 200).get("modules").forEach(m -> ids.add(m.get("id").asLong()));
        return ids;
    }

    private List<Long> pageOrder(Creator c, long col, long module) throws Exception {
        List<Long> ids = new ArrayList<>();
        for (JsonNode m : ok(call(c.token, get("/api/collections/" + col), null), 200).get("modules"))
            if (m.get("id").asLong() == module) m.get("pages").forEach(p -> ids.add(p.get("id").asLong()));
        return ids;
    }

    @Test
    void pageBlocksGetSanityChecks() throws Exception {
        Creator a = newCreator();
        long col = collection(a, "Blocks").get("id").asLong();
        long m = module(a, col, "M").get("id").asLong();
        String url = "/api/modules/" + m + "/pages";
        ok(call(a.token, post(url), Map.of("title", "x", "blocks", List.of(Map.of("text", "no type")))), 400);
        ok(call(a.token, post(url), Map.of("title", "x", "blocks", List.of(Map.of("type", "")))), 400);
        ok(call(a.token, post(url), Map.of("title", "x", "blocks", List.of(Map.of("type", 5)))), 400);
        ok(call(a.token, post(url), Map.of("title", "x", "blocks", List.of("just a string"))), 400);
        List<Map<String, Object>> many = new ArrayList<>();
        for (int i = 0; i < 501; i++) many.add(Map.of("type", "divider"));
        ok(call(a.token, post(url), Map.of("title", "x", "blocks", many)), 400);
        ok(call(a.token, post(url), Map.of("title", "x", "blocks", List.of(Map.of("type", "text", "text", "t".repeat(600_000))))), 400);
        ok(call(a.token, post(url), Map.of("title", "x", "status", "UNLISTED")), 400);            // status is not a page field any more
        ok(call(a.token, post(url), Map.of("title", "x", "status", "PUBLISHED")), 400);
        ok(call(a.token, post(url), Map.of("title", "x", "blocks", List.of(Map.of("type", "divider")))), 400);          // Step 11: a block needs an id
        ok(call(a.token, post(url), Map.of("title", "x", "blocks", List.of(Map.of("id", "d1", "type", "divider")))), 201);
    }

    @Test
    void aSeededLegacyPageHasNoBlocksAndIsFlaggedLegacyWhenItsOwnerReadsIt() throws Exception {
        Creator ad = admin();
        long pageId = jdbc.queryForObject("select l.id from lessons l join sections s on s.id = l.section_id join tracks t on t.id = s.track_id "
                + "where t.slug = 'dsa' and t.owner_id = ? and l.slug = 'two-pointers' and l.blocks is null", Long.class, ad.id);
        JsonNode p = ok(call(ad.token, get("/api/pages/" + pageId), null), 200);       // the admin owns the seeded content
        assertThat(p.get("legacy").asBoolean()).isTrue();
        assertThat(p.get("blocks").isNull()).isTrue();
    }

    // =====================================================================================================
    // access matrix over HTTP: one row per endpoint
    // =====================================================================================================
    private record Ep(String name, String method, String path, Object body) {}

    private List<Ep> endpoints(long col, long mod, long page) {
        return List.of(
            new Ep("GET collection", "GET", "/api/collections/" + col, null),
            new Ep("PUT collection", "PUT", "/api/collections/" + col, Map.of("title", "HACKED")),
            new Ep("DELETE collection", "DELETE", "/api/collections/" + col, null),
            new Ep("POST restore", "POST", "/api/collections/" + col + "/restore", null),
            new Ep("POST publish", "POST", "/api/collections/" + col + "/publish", null),
            new Ep("POST unpublish", "POST", "/api/collections/" + col + "/unpublish", null),
            new Ep("POST module", "POST", "/api/collections/" + col + "/modules", Map.of("title", "HACKED")),
            new Ep("PUT module", "PUT", "/api/modules/" + mod, Map.of("title", "HACKED")),
            new Ep("DELETE module", "DELETE", "/api/modules/" + mod, null),
            new Ep("PATCH module reorder", "PATCH", "/api/modules/" + mod + "/reorder", Map.of("position", 0)),
            new Ep("POST page", "POST", "/api/modules/" + mod + "/pages", Map.of("title", "HACKED")),
            new Ep("GET page", "GET", "/api/pages/" + page, null),
            new Ep("PUT page", "PUT", "/api/pages/" + page, Map.of("title", "HACKED")),
            new Ep("POST page publish", "POST", "/api/pages/" + page + "/publish", null),
            new Ep("POST page unpublish", "POST", "/api/pages/" + page + "/unpublish", null),
            new Ep("DELETE page", "DELETE", "/api/pages/" + page, null),
            new Ep("PATCH page reorder", "PATCH", "/api/pages/" + page + "/reorder", Map.of("position", 0)));
    }

    private MockHttpServletRequestBuilder req(Ep e) {
        return switch (e.method) {
            case "GET" -> get(e.path);
            case "PUT" -> put(e.path);
            case "POST" -> post(e.path);
            case "PATCH" -> patch(e.path);
            default -> delete(e.path);
        };
    }

    /** Snapshot of everything a hostile call could change for the given collection. */
    private Map<String, Object> snapshot(long col) {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("track", jdbc.queryForMap("select slug, name, status, owner_id, deleted_at, moderation_status from tracks where id = ?", col));
        s.put("sections", jdbc.queryForList("select id, slug, title, position from sections where track_id = ? order by id", col));
        s.put("lessons", jdbc.queryForList("select l.id, l.slug, l.title, l.status, l.position from lessons l join sections s on s.id = l.section_id where s.track_id = ? order by l.id", col));
        return s;
    }

    private void expectDenied(String who, String token, List<Ep> eps, long col, int expected) throws Exception {
        Map<String, Object> before = snapshot(col);
        for (Ep e : eps) {
            ResultActions a = call(token, req(e), e.body);
            a.andExpect(status().is(expected));
            assertThat(snapshot(col)).as(who + " " + e.name + " must not change anything").isEqualTo(before);
        }
    }

    @Test
    void everyCreatorEndpointDeniesStrangersAdminsAnonymousAndSuspendedUsers() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        Creator ad = admin();

        // A published collection (visible to others -> 403) ...
        Object[] pub = ready(a, "Published one");
        ok(call(a.token, post("/api/collections/" + pub[0] + "/publish"), null), 200);
        // ... and a draft collection (invisible to others -> 404)
        Object[] draft = ready(a, "Draft one");

        List<Ep> pubEps = endpoints((Long) pub[0], (Long) pub[1], (Long) pub[2]);
        List<Ep> draftEps = endpoints((Long) draft[0], (Long) draft[1], (Long) draft[2]);

        expectDenied("other creator", b.token, pubEps, (Long) pub[0], 403);
        expectDenied("other creator", b.token, draftEps, (Long) draft[0], 404);
        expectDenied("admin", ad.token, pubEps, (Long) pub[0], 403);
        expectDenied("admin", ad.token, draftEps, (Long) draft[0], 404);
        expectDenied("anonymous", null, pubEps, (Long) pub[0], 401);
        expectDenied("anonymous", null, draftEps, (Long) draft[0], 401);

        // a draft's 404 is byte-identical to a missing id's 404 (no existence leak)
        for (Ep e : draftEps) {
            String leak = call(b.token, req(e), e.body).andReturn().getResponse().getContentAsString();
            String missing = e.path.replaceAll("/(\\d+)", "/987654321");
            String none = call(b.token, req(new Ep(e.name, e.method, missing, e.body)), e.body).andReturn().getResponse().getContentAsString();
            assertThat(leak).as(e.name).isEqualTo(none.replace("987654321", "x")).isNotNull();
        }

        // a suspended owner is locked out of everything, including their own content and creating new collections
        String token = a.token;
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.id);
        try {
            expectDenied("suspended owner", token, pubEps, (Long) pub[0], 401);
            expectDenied("suspended owner", token, draftEps, (Long) draft[0], 401);
            ok(call(token, post("/api/collections"), Map.of("title", "Nope")), 401);
            ok(call(token, get("/api/collections/mine"), null), 401);
            // and with the account suspended, a stranger sees even the published one as non-existent
            expectDenied("stranger vs suspended owner", b.token, pubEps, (Long) pub[0], 404);
        } finally {
            jdbc.update("update users set status = 'ACTIVE' where id = ?", a.id);
        }
        // reactivated: the owner is back in business, nothing was lost
        ok(call(token, get("/api/collections/" + pub[0]), null), 200);
        ok(call(token, post("/api/collections"), Map.of("title", "Back")), 201);
    }

    @Test
    void anonymousAndSuspendedUsersCannotCreateCollections() throws Exception {
        mvc.perform(post("/api/collections").contentType(MediaType.APPLICATION_JSON).content(body(Map.of("title", "x"))))
            .andExpect(status().isUnauthorized());
        Creator a = newCreator();
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.id);
        ok(call(a.token, post("/api/collections"), Map.of("title", "x")), 401);
        assertThat(jdbc.queryForObject("select count(*) from tracks where owner_id = ?", Long.class, a.id)).isZero();
    }

    @Test
    void strangersAndAdminsAreDeniedEvenWhenPassingAnotherCreatorsIdsInTheBody() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        Object[] r = ready(a, "Guarded");
        long bc = collection(b, "Bee").get("id").asLong();
        // B can't graft a page into A's module by naming it, and A's id can't be used to take over B's data
        ok(call(b.token, post("/api/modules/" + r[1] + "/pages"), Map.of("title", "graft")), 404);
        assertThat(jdbc.queryForObject("select count(*) from lessons where section_id = ?", Long.class, r[1])).isEqualTo(1);
        assertThat(jdbc.queryForObject("select owner_id from tracks where id = ?", Long.class, bc)).isEqualTo(b.id);
    }

    // =====================================================================================================
    // page publishing lifecycle and empty published collections
    // =====================================================================================================
    @Test
    void pagesArePublishedAndUnpublishedExplicitlyAndUpdatesPreserveTheStatus() throws Exception {
        Creator a = newCreator();
        long col = collection(a, "Pages").get("id").asLong();
        long m = module(a, col, "M").get("id").asLong();
        long p = ok(call(a.token, post("/api/modules/" + m + "/pages"), Map.of("title", "P")), 201).get("id").asLong();

        assertThat(ok(call(a.token, post("/api/pages/" + p + "/publish"), null), 200).get("status").asText()).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("select published from lessons where id = ?", Boolean.class, p)).isTrue();
        ok(call(a.token, post("/api/pages/" + p + "/publish"), null), 200);                                   // idempotent
        // a content update keeps whatever the status was
        assertThat(ok(call(a.token, put("/api/pages/" + p), Map.of("title", "P2", "blocks", List.of(Map.of("id", "d1", "type", "divider")))), 200)
                .get("status").asText()).isEqualTo("PUBLISHED");
        // status is not something an update can set, in either direction
        assertThat(ok(call(a.token, put("/api/pages/" + p), Map.of("title", "P2", "status", "DRAFT")), 400).get("error").asText()).contains("status");
        assertThat(ok(call(a.token, get("/api/pages/" + p), null), 200).get("status").asText()).isEqualTo("PUBLISHED");

        assertThat(ok(call(a.token, post("/api/pages/" + p + "/unpublish"), null), 200).get("status").asText()).isEqualTo("DRAFT");
        assertThat(jdbc.queryForObject("select published from lessons where id = ?", Boolean.class, p)).isFalse();
        ok(call(a.token, post("/api/pages/" + p + "/unpublish"), null), 200);                                 // idempotent
        assertThat(ok(call(a.token, put("/api/pages/" + p), Map.of("title", "P3")), 200).get("status").asText()).isEqualTo("DRAFT");

        // publishing a page doesn't publish its collection, and vice versa
        assertThat(ok(call(a.token, get("/api/collections/" + col), null), 200).get("collection").get("status").asText()).isEqualTo("DRAFT");
        ok(call(a.token, post("/api/pages/" + p + "/publish"), null), 200);
        ok(call(a.token, post("/api/collections/" + col + "/publish"), null), 200);
        ok(call(a.token, post("/api/pages/" + p + "/unpublish"), null), 200);
        assertThat(ok(call(a.token, get("/api/collections/" + col), null), 200).get("collection").get("status").asText()).isEqualTo("PUBLISHED");
        assertThat(jdbc.queryForObject("select count(*) from lessons where published <> (status = 'PUBLISHED')", Long.class)).isZero();
    }

    @Test
    void aPublishedCollectionWithoutAPublishedPageIsNeverPubliclyVisible() throws Exception {
        // admin-owned, so the legacy public API can show it; the rule itself is owner-independent (see the creator-owned test below)
        Creator ad = admin();
        JsonNode col = collection(ad, uniq("Empties"));
        long id = col.get("id").asLong();
        String slug = col.get("slug").asText();
        long m1 = module(ad, id, "One").get("id").asLong();
        long m2 = module(ad, id, "Two").get("id").asLong();
        long p1 = page(ad, m1, "Only", "PUBLISHED").get("id").asLong();
        long p2 = page(ad, m2, "Other", "PUBLISHED").get("id").asLong();
        try {
            ok(call(ad.token, post("/api/collections/" + id + "/publish"), null), 200);
            assertVisible(slug, true, true);

            // one published page left: still visible
            ok(call(ad.token, post("/api/pages/" + p1 + "/unpublish"), null), 200);
            assertVisible(slug, true, true);

            // last one drafted: the collection keeps its own status but vanishes from the public API, and says so
            JsonNode after = ok(call(ad.token, post("/api/pages/" + p2 + "/unpublish"), null), 200);
            assertVisible(slug, false, false);
            JsonNode detail = ok(call(ad.token, get("/api/collections/" + id), null), 200).get("collection");
            assertThat(detail.get("status").asText()).isEqualTo("PUBLISHED");
            assertThat(detail.get("publiclyVisible").asBoolean()).isFalse();
            assertThat(detail.get("publishedPageCount").asInt()).isZero();

            // back again
            ok(call(ad.token, post("/api/pages/" + p2 + "/publish"), null), 200);
            assertVisible(slug, true, true);
            assertThat(ok(call(ad.token, get("/api/collections/" + id), null), 200).get("collection").get("publiclyVisible").asBoolean()).isTrue();

            // deleting the last published page, and deleting the module that holds it, hide it too; unlisted behaves the same
            ok(call(ad.token, post("/api/collections/" + id + "/publish"), Map.of("status", "UNLISTED")), 200);
            assertVisible(slug, false, true);
            ok(call(ad.token, delete("/api/pages/" + p2), null), 204);
            assertVisible(slug, false, false);
            ok(call(ad.token, post("/api/modules/" + m2 + "/pages"), Map.of("title", "New")), 201);       // a draft page doesn't help
            assertVisible(slug, false, false);
            long p3 = page(ad, m1, "Third", "PUBLISHED").get("id").asLong();
            assertVisible(slug, false, true);
            ok(call(ad.token, delete("/api/modules/" + m1), null), 204);                                    // takes p1 and p3 with it
            assertVisible(slug, false, false);
            assertThat(p3).isPositive();
        } finally {
            jdbc.update("delete from lessons where section_id in (select id from sections where track_id = ?)", id);
            jdbc.update("delete from sections where track_id = ?", id);
            jdbc.update("delete from tracks where id = ?", id);
        }
    }

    /** Legacy public API view: listed in /api/tracks, and readable by slug. */
    private void assertVisible(String slug, boolean listed, boolean readable) throws Exception {
        assertThat(read(mvc.perform(get("/api/tracks")).andReturn()).findValuesAsText("slug").contains(slug)).as("listed").isEqualTo(listed);
        mvc.perform(get("/api/tracks/" + slug)).andExpect(readable ? status().isOk() : status().isNotFound());
    }

    @Test
    void aStrangerSeesAPublishedCollectionOnlyWhileItHasAPublishedPage() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        Object[] r = ready(a, "Live");                                         // one PUBLISHED page
        long col = (Long) r[0];
        ok(call(a.token, post("/api/collections/" + col + "/publish"), null), 200);
        ok(call(b.token, get("/api/collections/" + col), null), 403);          // visible, so "not yours"
        ok(call(a.token, post("/api/pages/" + r[2] + "/unpublish"), null), 200);
        ok(call(b.token, get("/api/collections/" + col), null), 404);          // no published page: indistinguishable from a draft
        ok(call(b.token, put("/api/collections/" + col), Map.of("title", "x")), 404);
        ok(call(a.token, post("/api/pages/" + r[2] + "/publish"), null), 200);
        ok(call(b.token, get("/api/collections/" + col), null), 403);
    }
}
