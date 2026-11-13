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

/** Step 11 end to end: the write boundary (400 INVALID_BLOCKS), preservation of old content, and the read boundary on BOTH public paths. */
class BlockSecurityApiTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;

    record Built(String token, long collectionId, long moduleId, long pageId, String slug) {}

    private long created(String token, String url, Map<String, Object> req) throws Exception {
        return read(mvc.perform(as(token, post(url)).content(body(req))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
    }

    private Built build() throws Exception {
        String token = newUserToken();
        String slug = uniq("sec");
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

    private MvcResult save(Built b, Map<String, Object> req) throws Exception {
        return mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(req))).andReturn();
    }

    private Map<String, Object> req(Object blocks) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("title", "P"); m.put("summary", "S");
        if (blocks != null) m.put("blocks", blocks);
        return m;
    }

    private String row(Built b) {
        return jdbc.queryForObject("select title || '|' || summary || '|' || coalesce(blocks,'null') || '|' || version from lessons where id = ?", String.class, b.pageId);
    }

    private String blocksColumn(long pageId) { return jdbc.queryForObject("select blocks from lessons where id = ?", String.class, pageId); }

    private static final String SVG_OK = "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"1\" height=\"1\"/></svg>";

    // ===================================================================================================== write boundary
    @Test
    void everyUnsafeOrInvalidBlockIsRefusedWithBlockLevelProblemsAndNothingIsSaved() throws Exception {
        Built b = build();
        assertThat(save(b, req(List.of(blk("id", "ok", "type", "text", "text", "fine")))).getResponse().getStatus()).isEqualTo(200);
        String before = row(b);
        List<Map<String, Object>> attacks = List.of(
            blk("id", "a1", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>", "caption", ""),
            blk("id", "a2", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"/>", "caption", ""),
            blk("id", "a3", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><foreignObject><div/></foreignObject></svg>", "caption", ""),
            blk("id", "a4", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><image href=\"https://evil.example/x.png\"/></svg>", "caption", ""),
            blk("id", "a5", "type", "svg", "svg", "<!DOCTYPE svg [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><svg xmlns=\"http://www.w3.org/2000/svg\"><text>&x;</text></svg>", "caption", ""),
            blk("id", "a6", "type", "image", "url", "javascript:alert(1)", "caption", ""),
            blk("id", "a7", "type", "image", "url", "data:text/html,<script>alert(1)</script>", "caption", ""),
            blk("id", "a8", "type", "video", "url", "//evil.example/v.mp4", "caption", ""),
            blk("id", "a9", "type", "video", "url", "http://example.com/v.mp4", "caption", ""),
            blk("id", "b1", "type", "image", "url", "/\\evil.example/a.png", "caption", ""),
            blk("id", "b2", "type", "widget", "rows", List.of()),
            blk("id", "b3", "type", "text", "text", "x".repeat(20_001)),
            blk("id", "b4", "type", "html", "html", "x".repeat(100_001), "height", 360),
            blk("id", "b5", "type", "text", "text", "x", "onclick", "boom"));
        for (Map<String, Object> attack : attacks) {
            MvcResult r = save(b, req(List.of(blk("id", "ok", "type", "text", "text", "fine"), attack)));
            assertThat(r.getResponse().getStatus()).as(attack.get("id").toString()).isEqualTo(400);
            JsonNode err = read(r);
            assertThat(err.get("code").asText()).isEqualTo("INVALID_BLOCKS");
            assertThat(err.get("problems")).isNotEmpty();
            assertThat(err.get("problems").get(0).get("id").asText()).isEqualTo(attack.get("id"));
            assertThat(err.get("problems").get(0).get("message").asText()).isNotBlank();
            assertThat(row(b)).as("nothing saved after " + attack.get("id")).isEqualTo(before);   // body, title, summary and version
        }
    }

    @Test
    void autosaveIsValidatedToo_andCreatePageToo() throws Exception {
        Built b = build();
        Map<String, Object> r = req(List.of(blk("id", "s", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><script/></svg>", "caption", "")));
        r.put("autosave", true);
        assertThat(save(b, r).getResponse().getStatus()).isEqualTo(400);
        mvc.perform(as(b.token, post("/api/modules/" + b.moduleId + "/pages")).content(body(Map.of("title", "N", "slug", "n",
                "blocks", List.of(blk("id", "i", "type", "image", "url", "javascript:1", "caption", ""))))))
            .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_BLOCKS"));
    }

    @Test
    void validContentOfEveryTypeStillSaves() throws Exception {
        Built b = build();
        List<Map<String, Object>> all = List.of(
            blk("id", "b1", "type", "heading", "level", 2, "text", "Intro"), blk("id", "b2", "type", "text", "text", "Body"),
            blk("id", "b3", "type", "code", "language", "java", "code", "class A {}", "caption", ""),
            blk("id", "b4", "type", "image", "url", "https://example.com/a.png", "caption", "c"),
            blk("id", "b5", "type", "video", "url", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "caption", ""),
            blk("id", "b6", "type", "html", "html", "<style>p{color:red}</style><p>hi</p>", "height", 360),
            blk("id", "b7", "type", "svg", "svg", SVG_OK, "caption", ""), blk("id", "b8", "type", "callout", "variant", "tip", "text", "x"), blk("id", "b9", "type", "divider"));
        assertThat(save(b, req(all)).getResponse().getStatus()).isEqualTo(200);
    }

    // ===================================================================================================== old content stays editable
    private static final List<Map<String, Object>> UNSAFE_STORED = List.of(
        blk("id", "keep", "type", "text", "text", "safe text"),
        blk("id", "bad-svg", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>alert(1)</script><rect width=\"1\" height=\"1\"/></svg>", "caption", ""),
        blk("id", "bad-img", "type", "image", "url", "javascript:alert(1)", "caption", ""));

    private void seed(Built b, Object blocks) throws Exception {
        jdbc.update("update lessons set blocks = ? where id = ?", json.writeValueAsString(blocks), b.pageId);
    }

    @Test
    void aMetadataOnlySaveWorksOnAPageWithUnsafeBlocksAndLeavesTheBodyByteForByteUntouched() throws Exception {
        Built b = build();
        seed(b, UNSAFE_STORED);
        String body = blocksColumn(b.pageId);
        MvcResult r = mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "New title", "summary", "New summary")))).andReturn();
        assertThat(r.getResponse().getStatus()).isEqualTo(200);
        assertThat(blocksColumn(b.pageId)).isEqualTo(body);
        assertThat(read(r).get("title").asText()).isEqualTo("New title");
        // the owner still gets the ORIGINAL content back in the editor
        JsonNode mine = read(mvc.perform(as(b.token, get("/api/pages/" + b.pageId))).andExpect(status().isOk()).andReturn());
        assertThat(mine.get("blocks")).isEqualTo(json.valueToTree(UNSAFE_STORED));
    }

    @Test
    void replacingTheBlockArrayRequiresFixingOrRemovingTheUnsafeBlocks() throws Exception {
        Built b = build();
        seed(b, UNSAFE_STORED);
        String body = blocksColumn(b.pageId);
        // resending the unsafe blocks unchanged does NOT make them acceptable
        MvcResult r = save(b, req(UNSAFE_STORED));
        assertThat(r.getResponse().getStatus()).isEqualTo(400);
        assertThat(new java.util.HashSet<>(read(r).get("problems").findValuesAsText("id"))).containsExactlyInAnyOrder("bad-svg", "bad-img");   // one entry per problem, so a block can repeat
        assertThat(blocksColumn(b.pageId)).isEqualTo(body);
        // removing them is enough
        assertThat(save(b, req(List.of(UNSAFE_STORED.get(0)))).getResponse().getStatus()).isEqualTo(200);
        assertThat(blocksColumn(b.pageId)).doesNotContain("script").doesNotContain("javascript");
    }

    @Test
    void unknownLegacyBlocksSurviveAnUnrelatedEdit_whateverTheirIds() throws Exception {
        Built b = build();
        List<Map<String, Object>> stored = List.of(
            blk("type", "widget", "rows", List.of(List.of("a", "b"))),
            blk("id", "dup", "type", "embed", "deep", Map.of("n", List.of(1, 2.5, true, "s"))),
            blk("id", "dup", "type", "file", "name", "a.pdf"),
            blk("id", "x".repeat(300), "type", "future"),
            blk("id", "t1", "type", "text", "text", "editable"));
        seed(b, stored);
        List<Map<String, Object>> sent = new ArrayList<>(stored);
        sent.set(4, blk("id", "t1", "type", "text", "text", "edited"));
        assertThat(save(b, req(sent)).getResponse().getStatus()).isEqualTo(200);
        JsonNode now = json.readTree(blocksColumn(b.pageId));
        for (int i = 0; i < 4; i++) assertThat(now.get(i)).as("unknown block " + i).isEqualTo(json.valueToTree(stored.get(i)));
        assertThat(now.get(4).get("text").asText()).isEqualTo("edited");
        // a modified or newly added unknown block is refused
        sent.set(0, blk("type", "widget", "rows", List.of(List.of("CHANGED"))));
        assertThat(save(b, req(sent)).getResponse().getStatus()).isEqualTo(400);
        sent.set(0, stored.get(0));
        sent.add(blk("id", "n", "type", "widget", "rows", List.of()));
        assertThat(save(b, req(sent)).getResponse().getStatus()).isEqualTo(400);
    }

    @Test
    void discardingUnreadableContentGrandfathersNothing() throws Exception {
        Built b = build();
        jdbc.update("update lessons set blocks = ? where id = ?", "{not json", b.pageId);
        Map<String, Object> r = req(List.of(blk("id", "u", "type", "widget")));
        r.put("discardUnreadableContent", true);
        assertThat(save(b, r).getResponse().getStatus()).isEqualTo(400);
        assertThat(blocksColumn(b.pageId)).isEqualTo("{not json");
        r.put("blocks", List.of(blk("id", "n", "type", "text", "text", "fresh")));
        assertThat(save(b, r).getResponse().getStatus()).isEqualTo(200);
    }

    // ===================================================================================================== read boundary
    private static final List<Map<String, Object>> MIXED = List.of(
        blk("id", "h", "type", "heading", "level", 2, "text", "Title"),
        blk("id", "bad-svg", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>alert(1)</script><rect width=\"1\" height=\"1\"/></svg>", "caption", "cap"),
        blk("id", "dead-svg", "type", "svg", "svg", "<!DOCTYPE svg [<!ENTITY x \"y\">]><svg xmlns=\"http://www.w3.org/2000/svg\"/>", "caption", ""),
        blk("id", "bad-img", "type", "image", "url", "javascript:alert(1)", "caption", ""),
        blk("id", "bad-vid", "type", "video", "url", "//evil.example/v.mp4", "caption", ""),
        blk("id", "unk", "type", "widget", "rows", List.of()),
        blk("id", "extra", "type", "text", "text", "plain", "evil", "<script>x</script>"),
        blk("id", "html", "type", "html", "html", "<style>p{color:red}</style><p onclick=\"x()\">hi</p>", "height", 300),
        blk("id", "good-img", "type", "image", "url", "https://example.com/a.png", "caption", "ok"),
        blk("id", "d", "type", "divider"));

    private void assertProjected(JsonNode blocks) {
        List<String> ids = new ArrayList<>();
        blocks.forEach(x -> ids.add(x.get("id").asText()));
        assertThat(ids).containsExactly("h", "bad-svg", "extra", "html", "good-img", "d");      // unsafe/unknown/uncleanable omitted, order kept
        String s = blocks.toString();
        assertThat(s).doesNotContain("alert(1)").doesNotContain("<script").doesNotContain("onload").doesNotContain("javascript").doesNotContain("evil.example")
                .doesNotContain("DOCTYPE").doesNotContain("\"evil\"");
        JsonNode svg = blocks.get(1);
        assertThat(svg.get("svg").asText()).contains("<rect").doesNotContain("script").doesNotContain("onload");
        assertThat(svg.get("caption").asText()).isEqualTo("cap");
        JsonNode html = blocks.get(3);
        assertThat(html.get("isolatedOnly").asBoolean()).isTrue();
        assertThat(html.get("html").asText()).contains("<style>");                             // CSS-based HTML blocks are preserved as written
        for (JsonNode x : blocks) if (!x.get("type").asText().equals("html")) assertThat(x.has("isolatedOnly")).isFalse();
    }

    @Test
    void thePublicApiServesOnlyTheProjectionAndNeverChangesTheStoredRow() throws Exception {
        Built b = build();
        seed(b, MIXED);
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/collections/" + b.collectionId + "/publish"))).andExpect(status().isOk());
        String stored = blocksColumn(b.pageId);
        String username = jdbc.queryForObject("select u.username from users u join tracks t on t.owner_id = u.id where t.id = ?", String.class, b.collectionId);
        String url = "/api/public/pages/" + username + "/" + b.slug + "/m/p";
        JsonNode first = read(mvc.perform(get(url)).andExpect(status().isOk()).andReturn()).get("page").get("blocks");
        assertProjected(first);
        assertThat(blocksColumn(b.pageId)).as("reading never modifies the row").isEqualTo(stored);
        // the owner's editor still sees everything that is stored
        assertThat(read(mvc.perform(as(b.token, get("/api/pages/" + b.pageId))).andReturn()).get("blocks")).isEqualTo(json.valueToTree(MIXED));
        // idempotent: serving the projection again gives the same thing
        assertThat(read(mvc.perform(get(url)).andReturn()).get("page").get("blocks")).isEqualTo(first);
        jdbc.update("update lessons set blocks = ? where id = ?", first.toString(), b.pageId);
        assertThat(read(mvc.perform(get(url)).andReturn()).get("page").get("blocks")).as("project(project(x)) == project(x)").isEqualTo(first);
    }

    @Test
    void theLegacyTracksApiIsProjectedToo() throws Exception {
        long id = jdbc.queryForObject("select l.id from lessons l join sections s on s.id = l.section_id join tracks t on t.id = s.track_id where t.slug = 'dsa' and l.slug = 'two-pointers' and t.owner_id = (select id from users where email = 'admin@codemastery.local')", Long.class);
        String original = blocksColumn(id);
        try {
            jdbc.update("update lessons set blocks = ? where id = ?", json.writeValueAsString(MIXED), id);
            JsonNode lesson = read(mvc.perform(get("/api/tracks/dsa/lessons/two-pointers")).andExpect(status().isOk()).andReturn());
            assertProjected(lesson.get("blocks"));
            assertThat(blocksColumn(id)).isEqualTo(json.writeValueAsString(MIXED));
        } finally {
            jdbc.update("update lessons set blocks = ? where id = ?", original, id);
        }
    }

    @Test
    void apiResponsesCarryTheBaselineSecurityHeaders() throws Exception {
        for (String url : List.of("/api/public/collections", "/api/tracks/dsa/lessons/two-pointers")) {
            var res = mvc.perform(get(url)).andReturn().getResponse();
            assertThat(res.getHeader("X-Content-Type-Options")).as(url).isEqualTo("nosniff");
            assertThat(res.getHeader("Referrer-Policy")).as(url).isEqualTo("no-referrer");
            assertThat(res.getHeader("Content-Security-Policy")).as(url).isEqualTo("default-src 'none'; frame-ancestors 'none'");
            assertThat(res.getContentType()).as(url).startsWith("application/json");
        }
    }
}
