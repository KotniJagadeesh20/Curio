package com.codemastery.blocks;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Step 13: the rich-text document rules, the plain-text projection and the read-boundary rebuild. Vectors are shared with the editor (13c). */
class InlineDocTest {
    private static final ObjectMapper M = new ObjectMapper();
    private static final JsonNode V = load();

    private static JsonNode load() {
        File f = new File("../shared/richtext-projection-vectors.json");
        if (!f.isFile()) throw new IllegalStateException("shared vectors not found: " + f.getAbsolutePath());   // fail loudly, never skip
        try { return M.readTree(f); } catch (Exception e) { throw new IllegalStateException(e); }
    }

    private static Object plain(JsonNode n) { return M.convertValue(n, Object.class); }

    @Test
    void everyProjectionVectorIsValidAndProjectsToExactlyTheExpectedText() {
        assertThat(V.get("projection").size()).isGreaterThan(5);
        for (JsonNode c : V.get("projection")) {
            Object doc = plain(c.get("doc"));
            assertThat(InlineDoc.problems(doc, true)).as("valid: " + c.get("name").asText()).isEmpty();
            assertThat(InlineDoc.project((List<?>) doc)).as(c.get("name").asText()).isEqualTo(c.get("text").asText());
        }
    }

    @Test
    void everyInvalidVectorIsRefusedEvenWithoutSizeCaps() {
        assertThat(V.get("invalid").size()).isGreaterThan(10);
        for (JsonNode c : V.get("invalid")) {
            Object doc = plain(c.get("doc"));
            assertThat(InlineDoc.problems(doc, true)).as("refused: " + c.get("name").asText()).isNotEmpty();
            assertThat(InlineDoc.problems(doc, false)).as("shape and safety are not size caps: " + c.get("name").asText()).isNotEmpty();
        }
    }

    private static Map<String, Object> para(String text) { return Map.of("type", "paragraph", "children", List.of(Map.of("text", text))); }

    @Test
    void sizeCapsApplyOnlyToNewContent() {
        List<Object> manyNodes = new ArrayList<>();
        for (int i = 0; i < InlineDoc.MAX_NODES + 1; i++) manyNodes.add(para("x"));
        assertThat(InlineDoc.problems(manyNodes, true)).isNotEmpty();
        assertThat(InlineDoc.problems(manyNodes, false)).as("an unchanged stored block is exempt").isEmpty();
        assertThat(InlineDoc.problems(manyNodes.subList(0, InlineDoc.MAX_NODES), true)).as("exactly at the cap").isEmpty();

        List<Object> runs = new ArrayList<>();
        for (int i = 0; i < InlineDoc.MAX_RUNS + 1; i++) runs.add(Map.of("text", "x"));
        assertThat(InlineDoc.problems(List.of(Map.of("type", "paragraph", "children", runs)), true)).isNotEmpty();
        assertThat(InlineDoc.problems(List.of(Map.of("type", "paragraph", "children", runs.subList(0, InlineDoc.MAX_RUNS))), true)).isEmpty();

        String atCap = "a".repeat(BlockRules.MAX_TEXT);
        assertThat(InlineDoc.problems(List.of(para(atCap)), true)).isEmpty();
        assertThat(InlineDoc.problems(List.of(para(atCap + "a")), true)).isNotEmpty();
        assertThat(InlineDoc.problems(List.of(para(atCap + "a")), false)).isEmpty();
    }

    @Test
    void rebuildIsAFaithfulFieldOrderedCopyAndIdempotent() throws Exception {
        for (JsonNode c : V.get("projection")) {
            List<?> doc = (List<?>) plain(c.get("doc"));
            List<Object> once = InlineDoc.rebuild(doc);
            assertThat(once).as(c.get("name").asText()).isEqualTo(doc);
            assertThat(InlineDoc.rebuild(once)).isEqualTo(once);
            assertThat(InlineDoc.project(once)).isEqualTo(InlineDoc.project(doc));
            assertThat(once).isNotSameAs(doc);
        }
        List<?> shuffled = (List<?>) M.readValue("[{\"children\":[{\"href\":\"https://e.com/\",\"italic\":true,\"bold\":false,\"text\":\"x\"}],\"type\":\"paragraph\"}]", Object.class);
        assertThat(M.writeValueAsString(InlineDoc.rebuild(shuffled))).isEqualTo("[{\"type\":\"paragraph\",\"children\":[{\"text\":\"x\",\"bold\":false,\"italic\":true,\"href\":\"https://e.com/\"}]}]");
    }

    @Test
    void theProjectionOfAListIsReadableByTheOldRenderersRules() {
        // the old renderer starts a bullet at "- " and a numbered item at "1. " on its own line, and splits paragraphs on a blank line
        List<?> doc = (List<?>) plain(V.get("projection").get(8).get("doc"));
        String text = InlineDoc.project(doc);
        assertThat(text.split("\n\n")).hasSize(3);
        assertThat(text.split("\n\n")[1].split("\n")).allMatch(l -> l.matches("^\\d+\\. .+"));
    }
}
