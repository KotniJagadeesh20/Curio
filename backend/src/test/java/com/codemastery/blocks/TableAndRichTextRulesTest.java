package com.codemastery.blocks;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Step 13a: the table block and a text block's {@code doc}, at the write boundary (BlockValidator) and the read boundary (BlockSanitizer). */
class TableAndRichTextRulesTest {
    private static Map<String, Object> block(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
    @SafeVarargs private static List<Map<String, Object>> list(Map<String, Object>... b) { return new ArrayList<>(List.of(b)); }
    private static List<BlockProblem> problems(List<Map<String, Object>> in, List<Map<String, Object>> stored) {
        try { BlockValidator.validate(in, stored); return List.of(); }
        catch (InvalidBlocksException e) { return e.problems(); }
    }
    private static List<List<String>> rows(String... cells) { return List.of(List.of(cells)); }
    private static Map<String, Object> table(Object rows, Object... more) {
        Map<String, Object> m = block("id", "t", "type", "table", "hasHeader", true, "rows", rows);
        for (int i = 0; i < more.length; i += 2) m.put((String) more[i], more[i + 1]);
        return m;
    }
    private static List<Object> para(String text) { return List.of(Map.of("type", "paragraph", "children", List.of(Map.of("text", text)))); }
    private static Map<String, Object> rich(String id, String text, Object doc) { return block("id", id, "type", "text", "text", text, "doc", doc); }

    // ================================================================================ table: write boundary
    @Test
    void aWellFormedTableIsAccepted() {
        assertThat(problems(list(table(List.of(List.of("Dish", "Minutes"), List.of("Bread", "35")), "caption", "Oven times")), null)).isEmpty();
        assertThat(problems(list(block("id", "t", "type", "table", "rows", rows("only"))), null)).as("hasHeader and caption are optional, 1x1 is fine").isEmpty();
        assertThat(problems(list(table(rows("", ""), "hasHeader", false)), null)).as("blank cells are fine in a draft").isEmpty();
    }

    @Test
    void malformedTablesAreRefusedWithAMessageOnTheRowsOrTheFlag() {
        List<Object> bad = new ArrayList<>(java.util.Arrays.asList(
            List.of(), "rows", null, 7, List.of("a", "b"), List.of(List.of()), List.of(List.of("a", "b"), List.of("c")),
            List.of(List.of("a", 1)), List.of(List.of("a", List.of("b"))), List.of(List.of("a", java.util.Collections.singletonList(null))),
            List.of("a", "b"), Map.of("0", List.of("a"))));
        for (Object rowsValue : bad) {
            Map<String, Object> t = table(rowsValue);
            assertThat(problems(list(t), null)).as("rows = " + rowsValue).extracting(BlockProblem::field).containsExactly("rows");
        }
        Map<String, Object> missing = block("id", "t", "type", "table");
        assertThat(problems(list(missing), null)).extracting(BlockProblem::field).containsExactly("rows");
        assertThat(problems(list(table(rows("a"), "hasHeader", "yes")), null)).extracting(BlockProblem::field).containsExactly("hasHeader");
        assertThat(problems(list(table(rows("a"), "caption", 5)), null)).extracting(BlockProblem::field).containsExactly("caption");
        assertThat(problems(list(table(rows("a"), "style", "x")), null)).extracting(BlockProblem::field).containsExactly("style");
        assertThat(problems(list(block("id", "d", "type", "divider", "rows", rows("a"))), null)).as("rows belong to a table only").hasSize(1);
    }

    private static List<List<String>> grid(int r, int c, String cell) {
        List<List<String>> g = new ArrayList<>();
        for (int i = 0; i < r; i++) { List<String> row = new ArrayList<>(); for (int j = 0; j < c; j++) row.add(cell); g.add(row); }
        return g;
    }

    @Test
    void sizeLimitsAreEnforcedForNewOrChangedTablesOnly() {
        assertThat(problems(list(table(grid(BlockRules.MAX_TABLE_ROWS, BlockRules.MAX_TABLE_COLS, "x"))), null)).as("exactly at the row and column caps").isEmpty();
        assertThat(problems(list(table(grid(BlockRules.MAX_TABLE_ROWS + 1, 2, "x"))), null)).extracting(BlockProblem::field).containsExactly("rows");
        assertThat(problems(list(table(grid(2, BlockRules.MAX_TABLE_COLS + 1, "x"))), null)).extracting(BlockProblem::field).containsExactly("rows");
        assertThat(problems(list(table(rows("a".repeat(BlockRules.MAX_CELL)))), null)).isEmpty();
        assertThat(problems(list(table(rows("a".repeat(BlockRules.MAX_CELL + 1)))), null)).extracting(BlockProblem::field).containsExactly("rows");
        assertThat(problems(list(table(grid(40, 10, "a".repeat(60)))), null)).as("24 000 characters in all").extracting(BlockProblem::field).containsExactly("rows");
        assertThat(problems(list(table(rows("a"), "caption", "c".repeat(BlockRules.MAX_CAPTION + 1))), null)).extracting(BlockProblem::field).containsExactly("caption");

        Map<String, Object> stored = table(grid(BlockRules.MAX_TABLE_ROWS + 5, 2, "x"));
        assertThat(problems(list(new LinkedHashMap<>(stored)), list(stored))).as("an unchanged oversized stored table can still be saved").isEmpty();
        Map<String, Object> ragged = table(List.of(List.of("a", "b"), List.of("c")));
        assertThat(problems(list(new LinkedHashMap<>(ragged)), list(ragged))).as("but the shape rules are never waived").hasSize(1);
    }

    @Test
    void aTableDoesNotChangeTheRulesForOtherTypesAndTextStillWorksWithoutADoc() {
        assertThat(problems(list(block("id", "a", "type", "text", "text", "plain, as before"), table(rows("x"))), null)).isEmpty();
        assertThat(problems(list(block("id", "a", "type", "text", "text", "t", "html", "<b>")), null)).as("other extra fields are still refused").hasSize(1);
    }

    // ================================================================================ doc: write boundary
    private static final Object DOC = List.of(
        Map.of("type", "paragraph", "children", List.of(Map.of("text", "Install "), Map.of("text", "Java", "bold", true), Map.of("text", " ("), Map.of("text", "docs", "href", "https://docs.oracle.com/"), Map.of("text", ")"))),
        Map.of("type", "list", "ordered", true, "items", List.of(List.of(Map.of("text", "Download")), List.of(Map.of("text", "Run it", "italic", true)))));
    private static final String DOC_TEXT = "Install Java (docs (https://docs.oracle.com/))\n\n1. Download\n2. Run it";

    @Test
    void aValidDocWithItsExactProjectionIsAcceptedAndAnEmptyDocNeedsEmptyText() {
        assertThat(InlineDoc.project((List<?>) DOC)).isEqualTo(DOC_TEXT);
        assertThat(problems(list(rich("r", DOC_TEXT, DOC)), null)).isEmpty();
        assertThat(problems(list(rich("r", "", List.of())), null)).isEmpty();
    }

    @Test
    void aTextThatIsNotTheProjectionIsRefused_theOldClientEditedOnlyTheText() {
        Map<String, Object> stored = rich("r", DOC_TEXT, DOC);
        List<BlockProblem> p = problems(list(rich("r", DOC_TEXT + " and an edit", DOC)), list(stored));
        assertThat(p).extracting(BlockProblem::field).containsExactly("text");
        assertThat(problems(list(rich("r", "", DOC)), null)).extracting(BlockProblem::field).containsExactly("text");
        Map<String, Object> noText = block("id", "r", "type", "text", "doc", DOC);
        assertThat(problems(list(noText), null)).as("a doc without its text").extracting(BlockProblem::field).containsExactly("text");
        assertThat(problems(list(rich("r", "x", List.of())), null)).as("an empty doc with text").hasSize(1);
    }

    @Test
    void aStoredDocThatComesBackWithoutOneIsRefused_theOldClientDroppedTheFormatting() {
        Map<String, Object> stored = rich("r", DOC_TEXT, DOC);
        List<BlockProblem> p = problems(list(block("id", "r", "type", "text", "text", DOC_TEXT)), list(stored));
        assertThat(p).extracting(BlockProblem::field).containsExactly("doc");
        assertThat(p.get(0).id()).isEqualTo("r");
        assertThat(problems(list(block("id", "r", "type", "text", "text", "something else")), list(stored))).hasSize(1);
        assertThat(problems(list(block("id", "r", "type", "text", "text", "")), list(rich("r", "", List.of())))).as("even an empty doc may not be dropped").hasSize(1);
        // a plain stored block may stay plain, and gaining a doc is the new editor's job
        Map<String, Object> plain = block("id", "p", "type", "text", "text", DOC_TEXT);
        assertThat(problems(list(new LinkedHashMap<>(plain)), list(plain))).isEmpty();
        assertThat(problems(list(rich("p", DOC_TEXT, DOC)), list(plain))).isEmpty();
        // dropping the block altogether (or another block with that id of another type) is not this rule's business
        assertThat(problems(list(block("id", "other", "type", "divider")), list(stored))).isEmpty();
    }

    @Test
    void anUnchangedStoredDocBlockIsAcceptedEvenIfItsTextHasDrifted() {
        Map<String, Object> drifted = rich("r", "stale text", DOC);       // cannot be written by this version, but must not strand the page
        assertThat(problems(list(new LinkedHashMap<>(drifted)), list(drifted))).isEmpty();
    }

    @Test
    void anInvalidDocIsRefusedOnTheDocField_unsafeLinksStructureAndExtras() {
        String[] hrefs = {"javascript:alert(1)", "http://example.com/", "//evil.example/x", "data:text/html,x", "https://user:pw@example.com/"};
        for (String href : hrefs) {
            Object doc = List.of(Map.of("type", "paragraph", "children", List.of(Map.of("text", "x", "href", href))));
            assertThat(problems(list(rich("r", "x (" + href + ")", doc)), null)).as(href).extracting(BlockProblem::field).contains("doc");
        }
        assertThat(problems(list(rich("r", "x", "just a string")), null)).extracting(BlockProblem::field).containsExactly("doc");
        assertThat(problems(list(rich("r", "x", List.of(Map.of("type", "paragraph", "children", List.of(Map.of("text", "x", "style", "evil")))))), null)).extracting(BlockProblem::field).containsExactly("doc");
        assertThat(problems(list(block("id", "h", "type", "heading", "level", 2, "text", "t", "doc", DOC)), null)).as("doc belongs to a text block only").hasSize(1);
        assertThat(problems(list(block("id", "c", "type", "callout", "variant", "info", "text", "t", "doc", DOC)), null)).hasSize(1);
        // a bad doc is not also reported as a projection mismatch
        assertThat(problems(list(rich("r", "anything", "bad")), null)).hasSize(1);
    }

    // ================================================================================ read boundary
    @Test
    void theSanitizerKeepsAValidTableAndRebuildsItFromFreshLists() {
        List<List<String>> rows = List.of(List.of("Dish", "Minutes"), List.of("Bread", "35"));
        Map<String, Object> out = BlockSanitizer.project(list(table(rows, "caption", "Oven times", "evil", "<script>"))).get(0);
        assertThat(out.keySet()).containsExactly("id", "type", "hasHeader", "rows", "caption");
        assertThat(out.get("rows")).isEqualTo(rows).isNotSameAs(rows);
    }

    @Test
    void theSanitizerOmitsATableThatCannotBeTrusted_butNotOneThatIsMerelyLarge() {
        assertThat(BlockSanitizer.project(list(table(List.of(List.of("a", "b"), List.of("c")))))).isEmpty();
        assertThat(BlockSanitizer.project(list(table(List.of(List.of("a", 1)))))).isEmpty();
        assertThat(BlockSanitizer.project(list(table("not rows")))).isEmpty();
        assertThat(BlockSanitizer.project(list(block("id", "t", "type", "table")))).isEmpty();
        assertThat(BlockSanitizer.project(list(table(grid(BlockRules.MAX_TABLE_ROWS + 5, 2, "x"))))).as("a cap is not a safety matter").hasSize(1);
    }

    @Test
    void theSanitizerKeepsAValidDocRebuiltAndIdempotent() {
        Map<String, Object> once = BlockSanitizer.project(list(rich("r", DOC_TEXT, DOC))).get(0);
        assertThat(once.keySet()).containsExactly("id", "type", "text", "doc");
        assertThat(once.get("doc")).isEqualTo(DOC);
        assertThat(BlockSanitizer.project(list(once)).get(0)).isEqualTo(once);
    }

    @Test
    void anInvalidDocIsDroppedAndTheReadableTextIsKept_neverTheWholeBlock() {
        Object unsafe = List.of(Map.of("type", "paragraph", "children", List.of(Map.of("text", "click", "href", "javascript:alert(1)"))));
        Object[] badDocs = {unsafe, "nope", List.of("x"), List.of(Map.of("type", "paragraph")), List.of(Map.of("type", "script", "src", "x"))};
        for (Object bad : badDocs) {
            List<Map<String, Object>> out = BlockSanitizer.project(list(rich("r", "Step one\n\n- a\n- b", bad)));
            assertThat(out).as("doc = " + bad).hasSize(1);
            assertThat(out.get(0).keySet()).containsExactly("id", "type", "text");
            assertThat(out.get(0).get("text")).isEqualTo("Step one\n\n- a\n- b");
        }
        assertThat(BlockSanitizer.project(list(block("id", "n", "type", "text", "text", "t", "doc", null))).get(0).keySet()).as("a null doc").containsExactly("id", "type", "text");
    }

    @Test
    void aTextBlockWithoutADocIsUnchangedByTheSanitizer() {
        Map<String, Object> out = BlockSanitizer.project(list(block("id", "p", "type", "text", "text", "plain\n- a"))).get(0);
        assertThat(out).isEqualTo(block("id", "p", "type", "text", "text", "plain\n- a"));
    }
}
