package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Step 9: what the page editor relies on. Blocks are a JSON array stored as sent: order, ids and unknown fields survive,
 * a failed save changes nothing, a save never touches status or slug, a legacy page stays legacy until blocks are sent
 * explicitly, and the legacy fields and "has content" are reported accurately.
 */
class PageBlocksApiTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;

    record Built(String token, long collectionId, long moduleId, long pageId, String slug) {}

    private long created(String token, String url, Map<String, Object> req) throws Exception {
        return read(mvc.perform(as(token, post(url)).content(body(req))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
    }

    private Built build(String token) throws Exception {
        String slug = uniq("blk");
        long c = created(token, "/api/collections", Map.of("title", "T", "slug", slug));
        long m = created(token, "/api/collections/" + c + "/modules", Map.of("title", "M", "slug", "m"));
        long p = created(token, "/api/modules/" + m + "/pages", Map.of("title", "P", "slug", "p"));
        return new Built(token, c, m, p, slug);
    }

    private Built build() throws Exception { return build(newUserToken()); }

    private static final java.util.concurrent.atomic.AtomicInteger AUTO_ID = new java.util.concurrent.atomic.AtomicInteger();

    /** A block map. Step 11: every block needs an id, so fixtures that don't care get a unique one. */
    private static Map<String, Object> blk(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        m.putIfAbsent("id", "auto" + AUTO_ID.incrementAndGet());
        return m;
    }

    private JsonNode save(Built b, Map<String, Object> req) throws Exception {
        return read(mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(req))).andExpect(status().isOk()).andReturn());
    }

    private JsonNode fetch(Built b) throws Exception {
        return read(mvc.perform(as(b.token, get("/api/pages/" + b.pageId))).andExpect(status().isOk()).andReturn());
    }

    private String stored(long pageId) {
        return jdbc.queryForObject("select blocks from lessons where id = ?", String.class, pageId);
    }

    private List<Object> allTypes() {
        return new ArrayList<>(List.of(
                blk("id", "b1", "type", "heading", "level", 2, "text", "Intro — ünïcode ✓"),
                blk("id", "b2", "type", "text", "text", "Line one\n\nLine \"two\"\n- bullet"),
                blk("id", "b3", "type", "code", "language", "java", "code", "class A {\n\tint x = 1;\n}", "caption", "c"),
                blk("id", "b4", "type", "image", "url", "https://example.com/a.png", "caption", "alt"),
                blk("id", "b5", "type", "video", "url", "https://www.youtube.com/watch?v=abc", "caption", ""),
                blk("id", "b6", "type", "html", "html", "<div>hi</div>", "height", 360),
                blk("id", "b7", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>", "caption", ""),
                blk("id", "b8", "type", "callout", "variant", "tip", "text", "careful"),
                blk("id", "b9", "type", "divider")));
    }

    // ---------- persistence ----------
    @Test
    void everyBlockTypeRoundTripsExactlyWithOrderAndIds() throws Exception {
        Built b = build();
        List<Object> blocks = allTypes();
        JsonNode saved = save(b, Map.of("title", "P", "blocks", blocks));
        JsonNode expected = json.valueToTree(blocks);
        assertThat(saved.get("blocks")).isEqualTo(expected);
        assertThat(fetch(b).get("blocks")).as("a fresh read").isEqualTo(expected);
        assertThat(json.readTree(stored(b.pageId))).as("what is stored").isEqualTo(expected);
    }

    @Test
    void reorderingIsJustASaveWithANewOrderAndNothingElseChanges() throws Exception {
        Built b = build();
        List<Object> blocks = allTypes();
        save(b, Map.of("title", "P", "blocks", blocks));
        List<Object> reversed = new ArrayList<>(blocks);
        java.util.Collections.reverse(reversed);
        JsonNode saved = save(b, Map.of("title", "P", "blocks", reversed));
        List<String> ids = new ArrayList<>();
        saved.get("blocks").forEach(x -> ids.add(x.get("id").asText()));
        assertThat(ids).containsExactly("b9", "b8", "b7", "b6", "b5", "b4", "b3", "b2", "b1");
        assertThat(fetch(b).get("blocks")).isEqualTo(json.valueToTree(reversed));
    }

    @Test
    void unknownBlockTypesAndExtraFieldsAreStoredVerbatim() throws Exception {
        Built b = build();
        // Step 11: a NEW unknown block is refused at the write boundary...
        List<Object> blocks = List.of(blk("id", "x1", "type", "table", "rows", List.of(List.of("a", "b"), List.of("c", "d")), "future", Map.of("k", 1)),
                blk("id", "t2", "type", "text", "text", "has an extra", "extra", true));
        mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "P", "blocks", blocks)))).andExpect(status().isBadRequest());
        // ...but one that is already stored (an older version / a later step wrote it) is preserved verbatim by a save of the same array
        jdbc.update("update lessons set blocks = ? where id = ?", json.writeValueAsString(blocks), b.pageId);
        save(b, Map.of("title", "P", "blocks", blocks));
        assertThat(fetch(b).get("blocks")).isEqualTo(json.valueToTree(blocks));
    }

    @Test
    void savingChangesNeitherTheStatusNorTheSlugNorTheCollection() throws Exception {
        Built b = build();
        save(b, Map.of("title", "P", "blocks", List.of(blk("type", "text", "text", "hello"))));
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/collections/" + b.collectionId + "/publish"))).andExpect(status().isOk());

        JsonNode saved = save(b, Map.of("title", "P renamed", "summary", "s", "blocks", allTypes()));
        assertThat(saved.get("status").asText()).isEqualTo("PUBLISHED");
        assertThat(saved.get("slug").asText()).isEqualTo("p");
        assertThat(jdbc.queryForObject("select status from tracks where id = ?", String.class, b.collectionId)).isEqualTo("PUBLISHED");

        // publish/unpublish leave the blocks alone
        String before = stored(b.pageId);
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/unpublish"))).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        assertThat(stored(b.pageId)).isEqualTo(before);
    }

    @Test
    void aRefusedSaveChangesNothingAtAll() throws Exception {
        Built b = build();
        save(b, Map.of("title", "P", "summary", "keep", "blocks", allTypes()));
        String before = stored(b.pageId);

        List<Object> tooMany = new ArrayList<>();
        for (int i = 0; i < 501; i++) tooMany.add(blk("type", "divider"));
        for (Map<String, Object> bad : List.<Map<String, Object>>of(
                Map.of("title", "X", "summary", "changed", "blocks", tooMany),
                Map.of("title", "X", "summary", "changed", "blocks", List.of(blk("type", "text", "text", "t".repeat(600_000)))),
                Map.of("title", "X", "summary", "changed", "blocks", List.of(blk("text", "no type"))))) {
            mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(bad))).andExpect(status().isBadRequest());
        }
        assertThat(stored(b.pageId)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select title from lessons where id = ?", String.class, b.pageId)).isEqualTo("P");
        assertThat(jdbc.queryForObject("select summary from lessons where id = ?", String.class, b.pageId)).isEqualTo("keep");
    }

    @Test
    void omittingBlocksKeepsThemAndAnEmptyArrayClearsThem() throws Exception {
        Built b = build();
        save(b, Map.of("title", "P", "blocks", allTypes()));
        String before = stored(b.pageId);
        save(b, Map.of("title", "Only title"));
        assertThat(stored(b.pageId)).isEqualTo(before);
        assertThat(save(b, Map.of("title", "P", "blocks", List.of())).get("blocks")).isEmpty();
    }

    // ---------- authorization ----------
    @Test
    void aNonOwnerIncludingAnAdminCannotWriteBlocksAndTheStoredBlocksStayIdentical() throws Exception {
        Built b = build();
        save(b, Map.of("title", "P", "blocks", allTypes()));
        String before = stored(b.pageId);
        String stranger = newUserToken(), admin = adminToken();
        Map<String, Object> req = Map.of("title", "Hijack", "blocks", List.of(blk("type", "text", "text", "pwned")));

        for (String who : List.of(stranger, admin)) {
            int unpublished = mvc.perform(as(who, put("/api/pages/" + b.pageId)).content(body(req))).andReturn().getResponse().getStatus();
            assertThat(unpublished).as("draft: not even visible").isEqualTo(404);
        }
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/collections/" + b.collectionId + "/publish"))).andExpect(status().isOk());
        for (String who : List.of(stranger, admin)) {
            mvc.perform(as(who, put("/api/pages/" + b.pageId)).content(body(req))).andExpect(status().isForbidden());
            mvc.perform(as(who, get("/api/pages/" + b.pageId))).andExpect(status().isForbidden());
        }
        mvc.perform(put("/api/pages/" + b.pageId).contentType("application/json").content(body(req))).andExpect(status().isUnauthorized());
        assertThat(stored(b.pageId)).isEqualTo(before);
        assertThat(jdbc.queryForObject("select title from lessons where id = ?", String.class, b.pageId)).isEqualTo("P");
    }

    @Test
    void theBlocksOfADraftAreNeverVisibleToAnotherUserThroughReads() throws Exception {
        Built b = build();
        save(b, Map.of("title", "P", "blocks", List.of(blk("type", "text", "text", "secret draft"))));
        String stranger = newUserToken();
        mvc.perform(as(stranger, get("/api/pages/" + b.pageId))).andExpect(status().isNotFound());
        mvc.perform(as(stranger, get("/api/collections/" + b.collectionId))).andExpect(status().isNotFound());
        assertThat(mvc.perform(get("/api/public/collections")).andReturn().getResponse().getContentAsString()).doesNotContain("secret draft");
    }

    // ---------- legacy pages ----------
    private long legacyPage(String slugOfModule) {
        return jdbc.queryForObject("select l.id from lessons l join sections s on s.id = l.section_id join tracks t on t.id = s.track_id "
                + "join users u on u.id = t.owner_id where t.slug = 'dsa' and u.email = 'admin@codemastery.local' and l.slug = ?", Long.class, slugOfModule);
    }

    @Test
    void aLegacyPageReportsAllItsLegacyFieldsExactlyAsReadersSeeThemAndReadingChangesNothing() throws Exception {
        String admin = adminToken();
        long id = legacyPage("two-pointers");
        Map<String, Object> row = jdbc.queryForMap("select concept, real_world, common_mistakes, best_practices, interview_relevance, code_language, code_example, blocks, summary, title from lessons where id = ?", id);
        assertThat(row.get("blocks")).isNull();

        JsonNode page = read(mvc.perform(as(admin, get("/api/pages/" + id))).andExpect(status().isOk()).andReturn());
        assertThat(page.get("legacy").asBoolean()).isTrue();
        assertThat(page.get("blocks").isNull()).isTrue();
        JsonNode lc = page.get("legacyContent");
        assertThat(lc.get("concept").asText()).isEqualTo(row.get("concept")).isNotBlank();
        assertThat(lc.get("realWorld").asText()).isEqualTo(row.get("real_world"));
        assertThat(lc.get("interviewRelevance").asText()).isEqualTo(row.get("interview_relevance"));
        assertThat(lc.get("codeLanguage").asText()).isEqualTo(row.get("code_language"));
        assertThat(lc.get("codeExample").asText()).isEqualTo(row.get("code_example"));
        assertThat(lc.get("commonMistakes")).isEqualTo(json.readTree((String) row.get("common_mistakes")));
        assertThat(lc.get("bestPractices")).isEqualTo(json.readTree((String) row.get("best_practices")));

        // the same data readers get from the public API
        Map<String, Object> path = jdbc.queryForMap("select s.slug as ms from sections s join lessons l on l.section_id = s.id where l.id = ?", id);
        JsonNode pub = read(mvc.perform(get("/api/public/pages/admin/dsa/" + path.get("ms") + "/two-pointers")).andExpect(status().isOk()).andReturn());
        assertThat(lc).isEqualTo(pub.get("page").get("legacy"));

        // nothing was written by looking
        assertThat(jdbc.queryForObject("select blocks from lessons where id = ?", String.class, id)).isNull();
        assertThat(jdbc.queryForMap("select concept, summary, title from lessons where id = ?", id).get("concept")).isEqualTo(row.get("concept"));
    }

    @Test
    void aTitleOrSummaryEditNeverConvertsALegacyPageButExplicitBlocksDo() throws Exception {
        String admin = adminToken();
        long id = legacyPage("two-pointers");
        String originalTitle = jdbc.queryForObject("select title from lessons where id = ?", String.class, id);
        String concept = jdbc.queryForObject("select concept from lessons where id = ?", String.class, id);
        try {
            mvc.perform(as(admin, put("/api/pages/" + id)).content(body(Map.of("title", "Renamed legacy", "summary", "new summary")))).andExpect(status().isOk());
            assertThat(jdbc.queryForObject("select blocks from lessons where id = ?", String.class, id)).as("still legacy").isNull();
            JsonNode after = read(mvc.perform(as(admin, get("/api/pages/" + id))).andReturn());
            assertThat(after.get("legacy").asBoolean()).isTrue();
            assertThat(after.get("legacyContent").get("concept").asText()).isEqualTo(concept);

            // an explicit blocks array converts: legacy flag off, legacyContent gone (the old columns stay in the DB)
            JsonNode converted = read(mvc.perform(as(admin, put("/api/pages/" + id)).content(body(Map.of("title", "Renamed legacy",
                    "blocks", List.of(blk("type", "text", "text", concept)))))).andExpect(status().isOk()).andReturn());
            assertThat(converted.get("legacy").asBoolean()).isFalse();
            assertThat(converted.get("legacyContent").isNull()).isTrue();
            assertThat(jdbc.queryForObject("select concept from lessons where id = ?", String.class, id)).as("old columns kept").isEqualTo(concept);
        } finally {
            jdbc.update("update lessons set title = ?, summary = summary, blocks = null where id = ?", originalTitle, id);
        }
    }

    // ---------- hasContent ----------
    private JsonNode outlinePage(Built b) throws Exception {
        JsonNode d = read(mvc.perform(as(b.token, get("/api/collections/" + b.collectionId))).andExpect(status().isOk()).andReturn());
        return d.get("modules").get(0).get("pages").get(0);
    }

    private boolean hasContent(Built b, List<Object> blocks) throws Exception {
        save(b, Map.of("title", "P", "blocks", blocks));
        return outlinePage(b).get("hasContent").asBoolean();
    }

    @Test
    void hasContentIsFalseForNothingMeaningfulAndTrueOtherwise() throws Exception {
        Built b = build();
        assertThat(outlinePage(b).get("hasContent").asBoolean()).as("a new page").isFalse();
        assertThat(hasContent(b, List.of())).as("[]").isFalse();
        assertThat(hasContent(b, List.of(blk("type", "heading", "level", 2, "text", "")))).as("empty heading").isFalse();
        assertThat(hasContent(b, List.of(blk("type", "text", "text", "  \n ")))).as("whitespace text").isFalse();
        assertThat(hasContent(b, List.of(blk("type", "divider")))).as("lone divider").isFalse();
        assertThat(hasContent(b, List.of(blk("type", "image", "url", "", "caption", "only a caption")))).as("caption without media").isFalse();
        assertThat(hasContent(b, List.of(blk("type", "text", "text", ""), blk("type", "callout", "variant", "info", "text", "")))).isFalse();

        assertThat(hasContent(b, List.of(blk("type", "text", "text", "hello")))).isTrue();
        assertThat(hasContent(b, List.of(blk("type", "divider"), blk("type", "code", "language", "java", "code", "int x;")))).isTrue();
        assertThat(hasContent(b, List.of(blk("type", "image", "url", "https://e.com/a.png", "caption", "")))).isTrue();
        assertThat(hasContent(b, List.of(blk("type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"/>")))).isTrue();
        assertThat(hasContent(b, List.of(blk("type", "html", "html", "<p>x</p>", "height", 100)))).isTrue();
        jdbc.update("update lessons set blocks = ? where id = ?", "[{\"id\":\"u\",\"type\":\"table\",\"rows\":[]}]", b.pageId);
        assertThat(outlinePage(b).get("hasContent").asBoolean()).as("unknown type: never claim empty").isTrue();
    }

    @Test
    void hasContentForLegacyPagesFollowsTheirOldFields() throws Exception {
        String admin = adminToken();
        assertThat(outlineOf(admin, "two-pointers").get("hasContent").asBoolean()).as("seeded, filled").isTrue();

        Built b = build();
        jdbc.update("update lessons set blocks = null where id = ?", b.pageId);
        assertThat(outlinePage(b).get("hasContent").asBoolean()).as("legacy with every field empty").isFalse();
        jdbc.update("update lessons set blocks = null, common_mistakes = '[\"a mistake\"]' where id = ?", b.pageId);
        assertThat(outlinePage(b).get("hasContent").asBoolean()).as("a list item counts").isTrue();
        jdbc.update("update lessons set common_mistakes = '[]', code_example = '   ' where id = ?", b.pageId);
        assertThat(outlinePage(b).get("hasContent").asBoolean()).as("blank code").isFalse();
        jdbc.update("update lessons set code_example = 'x = 1' where id = ?", b.pageId);
        assertThat(outlinePage(b).get("hasContent").asBoolean()).isTrue();
    }

    private JsonNode outlineOf(String admin, String pageSlug) throws Exception {
        long collectionId = jdbc.queryForObject("select t.id from tracks t join users u on u.id = t.owner_id where t.slug = 'dsa' and u.email = 'admin@codemastery.local'", Long.class);
        JsonNode d = read(mvc.perform(as(admin, get("/api/collections/" + collectionId))).andExpect(status().isOk()).andReturn());
        for (JsonNode m : d.get("modules")) for (JsonNode p : m.get("pages")) if (p.get("slug").asText().equals(pageSlug)) return p;
        throw new AssertionError("no page " + pageSlug);
    }

    @Test
    void unreadableStoredBlocksAreNeverReportedAsEmpty() throws Exception {
        Built b = build();
        jdbc.update("update lessons set blocks = '{not json' where id = ?", b.pageId);
        assertThat(outlinePage(b).get("hasContent").asBoolean()).isTrue();
    }

    @Test
    void publicReadsStillReturnTheSameOrderedBlocks() throws Exception {
        Built b = build();
        save(b, Map.of("title", "P", "blocks", allTypes()));
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/collections/" + b.collectionId + "/publish"))).andExpect(status().isOk());
        String username = jdbc.queryForObject("select u.username from users u join tracks t on t.owner_id = u.id where t.id = ?", String.class, b.collectionId);
        JsonNode pub = read(mvc.perform(get("/api/public/pages/" + username + "/" + b.slug + "/m/p")).andExpect(status().isOk()).andReturn());
        // Step 11: the public projection is the same blocks in the same order; the only addition is the isolatedOnly marker on html blocks
        com.fasterxml.jackson.databind.node.ArrayNode expected = (com.fasterxml.jackson.databind.node.ArrayNode) json.valueToTree(allTypes());
        for (JsonNode n : expected) if (n.get("type").asText().equals("html")) ((com.fasterxml.jackson.databind.node.ObjectNode) n).put("isolatedOnly", true);
        assertThat(pub.get("page").get("blocks")).isEqualTo(expected);
        assertThat(pub.get("page").get("legacy").isNull()).isTrue();
    }
}
