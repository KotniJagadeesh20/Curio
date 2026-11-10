package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Data preservation: stored blocks that can't be interpreted are never turned into an ordinary empty array and never
 * overwritten by accident. Three states stay distinct: null (legacy), a valid array (maybe empty), unreadable.
 */
class PageBlocksIntegrityTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;

    record Built(String token, long collectionId, long pageId) {}

    private long created(String token, String url, Map<String, Object> req) throws Exception {
        return read(mvc.perform(as(token, post(url)).content(body(req))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
    }

    private Built build() throws Exception {
        String token = newUserToken();
        long c = created(token, "/api/collections", Map.of("title", "T", "slug", uniq("int")));
        long m = created(token, "/api/collections/" + c + "/modules", Map.of("title", "M", "slug", "m"));
        long p = created(token, "/api/modules/" + m + "/pages", Map.of("title", "Original title", "slug", "p", "summary", "Original summary"));
        return new Built(token, c, p);
    }

    private void corrupt(Built b, String raw) {
        jdbc.update("update lessons set blocks = ? where id = ?", raw, b.pageId);
    }

    private String stored(Built b) {
        return jdbc.queryForObject("select blocks from lessons where id = ?", String.class, b.pageId);
    }

    private JsonNode page(Built b) throws Exception {
        return read(mvc.perform(as(b.token, get("/api/pages/" + b.pageId))).andExpect(status().isOk()).andReturn());
    }

    private static final String VALID = "[{\"id\":\"a\",\"type\":\"text\",\"text\":\"precious\"}]";

    /** Everything that is not a valid array of {type: string} objects. */
    private static final List<String> BROKEN = List.of(
            "{not json",
            "[{\"type\":\"text\",\"text\":\"truncated\"",
            "",
            "   ",
            "null",
            "{\"type\":\"text\",\"text\":\"an object, not an array\"}",
            "\"just a string\"",
            "[1,2,3]",
            "[\"text\"]",
            "[{\"text\":\"no type\"}]",
            "[{\"type\":7}]",
            "[{\"type\":\"\"}]",
            "[{\"type\":\"text\",\"text\":\"ok\"}, null]",
            "[{\"type\":\"text\",\"text\":\"ok\"}] trailing junk");

    @Test
    void unreadableContentIsReportedExplicitlyNeverAsAnEmptyArray() throws Exception {
        for (String raw : BROKEN) {
            Built b = build();
            corrupt(b, raw);
            JsonNode p = page(b);
            assertThat(p.get("blocksUnreadable").asBoolean()).as(raw).isTrue();
            assertThat(p.get("blocks").isNull()).as("not [] for " + raw).isTrue();
            assertThat(p.get("legacy").asBoolean()).as("not legacy for " + raw).isFalse();
            assertThat(p.get("legacyContent").isNull()).isTrue();
            assertThat(stored(b)).as("reading changes nothing").isEqualTo(raw);
        }
    }

    @Test
    void theThreeNormalStatesStayDistinct() throws Exception {
        Built b = build();
        // a brand-new page: a valid, empty array
        JsonNode fresh = page(b);
        assertThat(fresh.get("blocks").isArray()).isTrue();
        assertThat(fresh.get("blocks")).isEmpty();
        assertThat(fresh.get("blocksUnreadable").asBoolean()).isFalse();
        assertThat(fresh.get("legacy").asBoolean()).isFalse();
        corrupt(b, "[]");
        assertThat(page(b).get("blocksUnreadable").asBoolean()).as("[] is a genuinely empty page").isFalse();
        corrupt(b, VALID);
        JsonNode valid = page(b);
        assertThat(valid.get("blocks")).hasSize(1);
        assertThat(valid.get("blocksUnreadable").asBoolean()).isFalse();
        // null = legacy
        jdbc.update("update lessons set blocks = null where id = ?", b.pageId);
        JsonNode legacy = page(b);
        assertThat(legacy.get("legacy").asBoolean()).isTrue();
        assertThat(legacy.get("blocks").isNull()).isTrue();
        assertThat(legacy.get("blocksUnreadable").asBoolean()).isFalse();
    }

    @Test
    void titleAndSummaryCanStillBeSavedAndTheMalformedBodyIsLeftExactlyAsStored() throws Exception {
        for (String raw : BROKEN) {
            Built b = build();
            corrupt(b, raw);
            JsonNode saved = read(mvc.perform(as(b.token, put("/api/pages/" + b.pageId))
                    .content(body(Map.of("title", "New title", "summary", "New summary")))).andExpect(status().isOk()).andReturn());
            assertThat(saved.get("title").asText()).isEqualTo("New title");
            assertThat(saved.get("blocksUnreadable").asBoolean()).as(raw).isTrue();
            assertThat(saved.get("blocks").isNull()).isTrue();
            assertThat(stored(b)).as("body untouched: " + raw).isEqualTo(raw);
            assertThat(jdbc.queryForObject("select summary from lessons where id = ?", String.class, b.pageId)).isEqualTo("New summary");
        }
    }

    @Test
    void replacingBlocksIsRefusedWith409AndNothingAtAllChanges() throws Exception {
        for (String raw : BROKEN) {
            Built b = build();
            corrupt(b, raw);
            for (List<Object> replacement : List.<List<Object>>of(List.of(), List.of(Map.of("id", "n0", "type", "text", "text", "new")))) {
                mvc.perform(as(b.token, put("/api/pages/" + b.pageId))
                        .content(body(Map.of("title", "Changed", "summary", "Changed", "blocks", replacement))))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("can't be read")));
            }
            assertThat(stored(b)).as(raw).isEqualTo(raw);
            assertThat(jdbc.queryForObject("select title from lessons where id = ?", String.class, b.pageId)).as("title rolled back too").isEqualTo("Original title");
            assertThat(jdbc.queryForObject("select summary from lessons where id = ?", String.class, b.pageId)).isEqualTo("Original summary");
        }
    }

    @Test
    void anExplicitDiscardReplacesTheBodyAndOnlyThen() throws Exception {
        Built b = build();
        corrupt(b, "{not json");
        JsonNode recovered = read(mvc.perform(as(b.token, put("/api/pages/" + b.pageId))
                .content(body(Map.of("title", "Recovered", "blocks", List.of(Map.of("id", "n1", "type", "text", "text", "fresh")),
                        "discardUnreadableContent", true)))).andExpect(status().isOk()).andReturn());
        assertThat(recovered.get("blocksUnreadable").asBoolean()).isFalse();
        assertThat(recovered.get("blocks")).hasSize(1);
        assertThat(json.readTree(stored(b))).isEqualTo(json.readTree("[{\"id\":\"n1\",\"type\":\"text\",\"text\":\"fresh\"}]"));
        // and it behaves like any readable page from now on
        mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "Again", "blocks", List.of())))).andExpect(status().isOk());
    }

    @Test
    void theDiscardFlagIsRejectedWheneverItWouldNotBeSafe() throws Exception {
        Built b = build();
        corrupt(b, VALID);
        // readable content: nothing to discard
        mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "x", "blocks", List.of(), "discardUnreadableContent", true))))
            .andExpect(status().isBadRequest());
        assertThat(stored(b)).isEqualTo(VALID);
        // legacy (null) content: not unreadable either
        jdbc.update("update lessons set blocks = null where id = ?", b.pageId);
        mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "x", "blocks", List.of(), "discardUnreadableContent", true))))
            .andExpect(status().isBadRequest());
        assertThat(stored(b)).isNull();
        // unreadable content but no replacement blocks in the request
        corrupt(b, "{not json");
        mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "x", "discardUnreadableContent", true))))
            .andExpect(status().isBadRequest());
        // an explicit false behaves like omitting it
        mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "x", "blocks", List.of(), "discardUnreadableContent", false))))
            .andExpect(status().isConflict());
        assertThat(stored(b)).isEqualTo("{not json");
        assertThat(jdbc.queryForObject("select title from lessons where id = ?", String.class, b.pageId)).isEqualTo("Original title");
    }

    @Test
    void aReadablePageIsUnaffectedByTheNewGuard() throws Exception {
        Built b = build();
        corrupt(b, VALID);
        mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "t", "blocks", List.of(Map.of("id", "d0", "type", "divider"))))))
            .andExpect(status().isOk());
        assertThat(json.readTree(stored(b))).hasSize(1);
        mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "t", "blocks", List.of())))).andExpect(status().isOk());
        assertThat(stored(b)).isEqualTo("[]");
    }

    @Test
    void aNonOwnerCannotDiscardAndNothingChanges() throws Exception {
        Built b = build();
        corrupt(b, "{not json");
        Map<String, Object> req = Map.of("title", "x", "blocks", List.of(), "discardUnreadableContent", true);
        for (String who : List.of(newUserToken(), adminToken())) {
            assertThat(mvc.perform(as(who, put("/api/pages/" + b.pageId)).content(body(req))).andReturn().getResponse().getStatus()).isEqualTo(404);
        }
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/collections/" + b.collectionId + "/publish"))).andExpect(status().isOk());
        for (String who : List.of(newUserToken(), adminToken())) {
            mvc.perform(as(who, put("/api/pages/" + b.pageId)).content(body(req))).andExpect(status().isForbidden());
        }
        assertThat(stored(b)).isEqualTo("{not json");
    }

    @Test
    void publishingUnpublishingReorderingAndTheOutlineNeverTouchOrBreakOnUnreadableContent() throws Exception {
        Built b = build();
        corrupt(b, "[{\"type\":\"text\"");
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.blocksUnreadable").value(true));
        mvc.perform(as(b.token, patch("/api/pages/" + b.pageId + "/reorder")).content("{\"position\":0}")).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/unpublish"))).andExpect(status().isOk());
        JsonNode detail = read(mvc.perform(as(b.token, get("/api/collections/" + b.collectionId))).andExpect(status().isOk()).andReturn());
        assertThat(detail.get("modules").get(0).get("pages").get(0).get("hasContent").asBoolean()).as("never claimed empty").isTrue();
        assertThat(stored(b)).isEqualTo("[{\"type\":\"text\"");
    }

    @Test
    void theOwnerStillCannotSeeAnotherUsersUnreadableDraftBody() throws Exception {
        Built b = build();
        corrupt(b, "{not json");
        mvc.perform(as(newUserToken(), get("/api/pages/" + b.pageId))).andExpect(status().isNotFound());
    }
}
