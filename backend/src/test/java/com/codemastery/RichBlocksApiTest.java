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
import org.springframework.test.web.servlet.MvcResult;

/** Step 13a over HTTP: the table block and a text block's rich-text doc: persistence, old-client protection, hasContent and both boundaries. */
class RichBlocksApiTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;

    record Built(String token, long collectionId, long moduleId, long pageId, String slug) {}

    private long created(String token, String url, Map<String, Object> req) throws Exception {
        return read(mvc.perform(as(token, post(url)).content(body(req))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
    }

    private Built build() throws Exception {
        String token = newUserToken();
        String slug = uniq("rich");
        long c = created(token, "/api/collections", Map.of("title", "T", "slug", slug));
        long m = created(token, "/api/collections/" + c + "/modules", Map.of("title", "M", "slug", "m"));
        long p = created(token, "/api/modules/" + m + "/pages", Map.of("title", "P", "slug", "p"));
        return new Built(token, c, m, p, slug);
    }

    private static Map<String, Object> blk(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private MvcResult save(Built b, Object blocks, Object... more) throws Exception {
        Map<String, Object> req = new LinkedHashMap<>(Map.of("title", "P", "summary", "S"));
        if (blocks != null) req.put("blocks", blocks);
        for (int i = 0; i < more.length; i += 2) req.put((String) more[i], more[i + 1]);
        return mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(req))).andReturn();
    }

    private void assertSaved(MvcResult r) throws Exception { assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(200); }

    private String stored(Built b) { return jdbc.queryForObject("select blocks from lessons where id = ?", String.class, b.pageId); }

    private String row(Built b) {
        return jdbc.queryForObject("select title || '|' || summary || '|' || coalesce(blocks,'null') || '|' || version from lessons where id = ?", String.class, b.pageId);
    }

    private boolean hasContent(Built b) throws Exception {
        JsonNode d = read(mvc.perform(as(b.token, get("/api/collections/" + b.collectionId))).andExpect(status().isOk()).andReturn());
        return d.get("modules").get(0).get("pages").get(0).get("hasContent").asBoolean();
    }

    private static final List<Object> DOC = List.of(
        Map.of("type", "paragraph", "children", List.of(Map.of("text", "Read the "), Map.of("text", "docs", "href", "https://docs.oracle.com/", "bold", true))),
        Map.of("type", "list", "ordered", false, "items", List.of(List.of(Map.of("text", "one")), List.of(Map.of("text", "two", "italic", true)))));
    private static final String DOC_TEXT = "Read the docs (https://docs.oracle.com/)\n\n- one\n- two";
    private static Map<String, Object> richBlock() { return blk("id", "r1", "type", "text", "text", DOC_TEXT, "doc", DOC); }
    private static Map<String, Object> tableBlock() {
        return blk("id", "t1", "type", "table", "hasHeader", true, "caption", "Oven times — ünïcode ✓", "rows", List.of(List.of("Dish", "Minutes"), List.of("Bread", "35"), List.of("Roast", "90")));
    }

    // ---------------------------------------------------------------------------------------------- persistence
    @Test
    void aTableAndARichTextBlockRoundTripExactly_onSaveReadAndInTheRow() throws Exception {
        Built b = build();
        List<Object> blocks = List.of(blk("id", "h", "type", "heading", "level", 2, "text", "Intro"), richBlock(), tableBlock(), blk("id", "p", "type", "text", "text", "plain, old style\n- a"));
        assertSaved(save(b, blocks));
        JsonNode expected = json.valueToTree(blocks);
        assertThat(json.readTree(stored(b))).isEqualTo(expected);
        assertThat(read(mvc.perform(as(b.token, get("/api/pages/" + b.pageId))).andReturn()).get("blocks")).isEqualTo(expected);
    }

    @Test
    void aPageCanBeCreatedWithTheNewBlocks_theTemplatePath() throws Exception {
        Built b = build();
        long id = created(b.token, "/api/modules/" + b.moduleId + "/pages", Map.of("title", "Seeded", "blocks", List.of(richBlock(), tableBlock())));
        assertThat(json.readTree(jdbc.queryForObject("select blocks from lessons where id = ?", String.class, id))).isEqualTo(json.valueToTree(List.of(richBlock(), tableBlock())));
        // and the same validation applies there
        MvcResult bad = mvc.perform(as(b.token, post("/api/modules/" + b.moduleId + "/pages")).content(body(Map.of("title", "Bad", "blocks", List.of(blk("id", "t", "type", "table", "rows", List.of(List.of("a"), List.of("b", "c"))))))))
            .andReturn();
        assertThat(bad.getResponse().getStatus()).isEqualTo(400);
        assertThat(read(bad).get("code").asText()).isEqualTo("INVALID_BLOCKS");
    }

    @Test
    void aMetadataOnlySaveLeavesRichBlocksByteForByte() throws Exception {
        Built b = build();
        assertSaved(save(b, List.of(richBlock(), tableBlock())));
        String before = stored(b);
        assertSaved(mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "Renamed", "summary", "New")))).andReturn());
        assertThat(stored(b)).isEqualTo(before);
    }

    // ---------------------------------------------------------------------------------------------- older clients
    @Test
    void anOlderClientThatDropsTheDocIsRefusedAndNothingChanges() throws Exception {
        Built b = build();
        assertSaved(save(b, List.of(richBlock())));
        String before = row(b);
        MvcResult r = save(b, List.of(blk("id", "r1", "type", "text", "text", DOC_TEXT)));          // same text, no doc
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        JsonNode err = read(r);
        assertThat(err.get("code").asText()).isEqualTo("INVALID_BLOCKS");
        assertThat(err.get("problems").get(0).get("id").asText()).isEqualTo("r1");
        assertThat(err.get("problems").get(0).get("message").asText()).contains("Reload");
        assertThat(row(b)).as("the stored formatting is untouched").isEqualTo(before);
    }

    @Test
    void anOlderClientThatEditsOnlyTheTextAndResendsTheOldDocIsRefusedAndNothingChanges() throws Exception {
        Built b = build();
        assertSaved(save(b, List.of(richBlock())));
        String before = row(b);
        MvcResult r = save(b, List.of(blk("id", "r1", "type", "text", "text", DOC_TEXT + "\n\nAn edit the doc doesn't know about", "doc", DOC)));
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        assertThat(read(r).get("problems").get(0).get("message").asText()).contains("doesn't match");
        assertThat(row(b)).isEqualTo(before);
    }

    @Test
    void theSameProtectionAppliesToAutosave() throws Exception {
        Built b = build();
        assertSaved(save(b, List.of(richBlock())));
        String before = row(b);
        assertThat(save(b, List.of(blk("id", "r1", "type", "text", "text", "typed by an old client")), "autosave", true).getResponse().getStatus()).isEqualTo(400);
        assertThat(row(b)).isEqualTo(before);
        // a client that knows doc can autosave an edit
        List<Object> edited = List.of(Map.of("type", "paragraph", "children", List.of(Map.of("text", "New text"))));
        assertSaved(save(b, List.of(blk("id", "r1", "type", "text", "text", "New text", "doc", edited)), "autosave", true));
    }

    @Test
    void aBlockStoredWithoutADocCanStillBeSavedAsItWas_andCanGainOne() throws Exception {
        Built b = build();
        Map<String, Object> plain = blk("id", "p", "type", "text", "text", "legacy text\n- a");
        assertSaved(save(b, List.of(plain)));
        assertSaved(save(b, List.of(plain, tableBlock())));
        assertSaved(save(b, List.of(blk("id", "p", "type", "text", "text", "Now formatted", "doc", List.of(Map.of("type", "paragraph", "children", List.of(Map.of("text", "Now formatted", "bold", true))))), tableBlock())));
    }

    // ---------------------------------------------------------------------------------------------- hasContent
    @Test
    void aTableIsContentOnlyWhenADataCellHasText() throws Exception {
        Built b = build();
        BiFn check = (hasHeader, rows) -> {
            Map<String, Object> t = blk("id", "t", "type", "table", "rows", rows);
            if (hasHeader != null) t.put("hasHeader", hasHeader);
            assertSaved(save(b, List.of(t)));
            return hasContent(b);
        };
        assertThat(check.run(true, List.of(List.of("Ingredient", "Quantity")))).as("header only").isFalse();
        assertThat(check.run(true, List.of(List.of("Ingredient", "Quantity"), List.of("", "  ")))).as("header + blank data").isFalse();
        assertThat(check.run(true, List.of(List.of("Ingredient", "Quantity"), List.of("", "2 cups")))).as("header + data").isTrue();
        assertThat(check.run(false, List.of(List.of("Ingredient", "Quantity")))).as("no header: every cell is data").isTrue();
        assertThat(check.run(null, List.of(List.of("x")))).as("hasHeader absent = false").isTrue();
        assertThat(check.run(false, List.of(List.of("", ""), List.of("", "")))).as("all blank").isFalse();
        assertThat(check.run(true, List.of(List.of("only a header cell")))).as("a header-only 1x1").isFalse();
        assertSaved(save(b, List.of(blk("id", "r", "type", "text", "text", "", "doc", List.of()), blk("id", "t", "type", "table", "hasHeader", true, "rows", List.of(List.of("H"))))));
        assertThat(hasContent(b)).as("an empty rich-text block next to a header-only table").isFalse();
        assertSaved(save(b, List.of(richBlock())));
        assertThat(hasContent(b)).as("rich text with words").isTrue();
        // stored data we can't inspect is never called empty
        jdbc.update("update lessons set blocks = ? where id = ?", "[{\"id\":\"t\",\"type\":\"table\",\"hasHeader\":true,\"rows\":\"oops\"}]", b.pageId);
        assertThat(hasContent(b)).isTrue();
        jdbc.update("update lessons set blocks = ? where id = ?", "[{\"id\":\"t\",\"type\":\"table\",\"hasHeader\":true,\"rows\":[[\"H\"],[5]]}]", b.pageId);
        assertThat(hasContent(b)).isTrue();
    }

    @Test
    void hasContentUsesTheSameKnownTypesAsBlockRules_soTheTwoCannotDrift() throws Exception {
        Built b = build();
        // every type BlockRules knows, stored with no content, is empty; any new type added to BlockRules is covered automatically
        for (String type : com.codemastery.blocks.BlockRules.knownTypes()) {
            String block = type.equals("table") ? "{\"id\":\"x\",\"type\":\"table\",\"hasHeader\":true,\"rows\":[[\"H\"]]}" : "{\"id\":\"x\",\"type\":\"" + type + "\"}";
            jdbc.update("update lessons set blocks = ? where id = ?", "[" + block + "]", b.pageId);
            assertThat(hasContent(b)).as("an empty known '" + type + "' block").isFalse();
        }
        // unknown-block compatibility: a type BlockRules doesn't know is never called empty, even with no fields
        for (String type : List.of("quote", "embed", "")) {
            assertThat(com.codemastery.blocks.BlockRules.isKnown(type)).isFalse();
            jdbc.update("update lessons set blocks = ? where id = ?", "[{\"id\":\"x\",\"type\":\"" + type + "\"}]", b.pageId);
            assertThat(hasContent(b)).as("an unknown '" + type + "' block").isTrue();
        }
        jdbc.update("update lessons set blocks = ? where id = ?", "[{\"id\":\"x\"}]", b.pageId);
        assertThat(hasContent(b)).as("a block with no type").isTrue();
    }

    @FunctionalInterface private interface BiFn { boolean run(Boolean hasHeader, Object rows) throws Exception; }

    // ---------------------------------------------------------------------------------------------- the public (read) boundary
    private JsonNode publicBlocks(Built b) throws Exception {
        String username = jdbc.queryForObject("select u.username from users u join tracks t on t.owner_id = u.id where t.id = ?", String.class, b.collectionId);
        return read(mvc.perform(get("/api/public/pages/" + username + "/" + b.slug + "/m/p")).andExpect(status().isOk()).andReturn()).get("page").get("blocks");
    }

    private void publish(Built b) throws Exception {
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/collections/" + b.collectionId + "/publish"))).andExpect(status().isOk());
    }

    @Test
    void thePublicApiServesValidTablesAndDocsAsStored_andReadingChangesNothing() throws Exception {
        Built b = build();
        assertSaved(save(b, List.of(richBlock(), tableBlock())));
        publish(b);
        String before = stored(b);
        assertThat(publicBlocks(b)).isEqualTo(json.valueToTree(List.of(richBlock(), tableBlock())));
        assertThat(stored(b)).isEqualTo(before);
    }

    @Test
    void thePublicApiDropsAnUnsafeDocButKeepsTheReadableText_andOmitsABrokenTable() throws Exception {
        Built b = build();
        assertSaved(save(b, List.of(blk("id", "ok", "type", "text", "text", "fine"))));
        publish(b);
        // rows written behind the API's back (an older version, a manual edit): the read boundary must not trust them
        String raw = json.writeValueAsString(List.of(
            blk("id", "r", "type", "text", "text", "Click here\n\n- a\n- b", "doc", List.of(Map.of("type", "paragraph", "children", List.of(Map.of("text", "Click here", "href", "javascript:alert(1)"))))),
            blk("id", "t1", "type", "table", "hasHeader", true, "rows", List.of(List.of("a", "b"), List.of("c"))),
            blk("id", "t2", "type", "table", "rows", List.of(List.of("<img src=x onerror=alert(1)>", "ok")), "onclick", "evil"),
            blk("id", "r2", "type", "text", "text", "kept", "doc", List.of(Map.of("type", "paragraph", "children", List.of(Map.of("text", "kept")), "onclick", "x")))));
        jdbc.update("update lessons set blocks = ? where id = ?", raw, b.pageId);
        JsonNode served = publicBlocks(b);
        List<String> ids = new ArrayList<>();
        served.forEach(x -> ids.add(x.get("id").asText()));
        assertThat(ids).as("the ragged table is omitted").containsExactly("r", "t2", "r2");
        assertThat(served.get(0).has("doc")).as("an unsafe doc is dropped").isFalse();
        assertThat(served.get(0).get("text").asText()).as("and the text still reads as paragraphs and a list").isEqualTo("Click here\n\n- a\n- b");
        assertThat(served.get(1).has("onclick")).isFalse();
        assertThat(served.get(1).get("rows").get(0).get(0).asText()).as("cell text is data, passed as text").isEqualTo("<img src=x onerror=alert(1)>");
        assertThat(served.get(2).has("doc")).as("a doc with an unexpected field is invalid as a whole").isFalse();
        assertThat(stored(b)).as("reading never rewrites the row").isEqualTo(raw);
    }
}
