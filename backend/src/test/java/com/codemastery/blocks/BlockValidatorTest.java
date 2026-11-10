package com.codemastery.blocks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class BlockValidatorTest {
    private static Map<String, Object> block(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
    private static List<Map<String, Object>> list(Map<String, Object>... b) { return new ArrayList<>(List.of(b)); }
    private static List<BlockProblem> problems(List<Map<String, Object>> in, List<Map<String, Object>> stored) {
        try { BlockValidator.validate(in, stored); return List.of(); }
        catch (InvalidBlocksException e) { return e.problems(); }
    }
    private static final String OK_SVG = "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"1\" height=\"1\"/></svg>";

    @Test
    void everyKnownTypeWithValidFieldsIsAccepted() {
        assertThat(problems(list(
            block("id", "a", "type", "heading", "level", 2, "text", "Hello"),
            block("id", "b", "type", "text", "text", "Plain"),
            block("id", "c", "type", "code", "language", "c++", "code", "int x;", "caption", ""),
            block("id", "d", "type", "image", "url", "https://example.com/a.png", "caption", "c"),
            block("id", "e", "type", "video", "url", "https://youtu.be/dQw4w9WgXcQ", "caption", ""),
            block("id", "f", "type", "html", "html", "<p>hi</p>", "height", 360),
            block("id", "g", "type", "svg", "svg", OK_SVG, "caption", ""),
            block("id", "h", "type", "callout", "variant", "tip", "text", "x"),
            block("id", "i", "type", "divider")), null)).isEmpty();
    }

    @Test
    void blankDraftBlocksAreAccepted() {
        assertThat(problems(list(block("id", "a", "type", "image", "url", "", "caption", ""), block("id", "b", "type", "svg", "svg", "", "caption", ""),
                block("id", "c", "type", "html", "html", "", "height", 360)), null)).isEmpty();
    }

    @Test
    void unsafeUrlsAreRejectedWithTheBlockIdAndField() {
        for (String u : List.of("javascript:alert(1)", "data:text/html,x", "//evil.com/x", "/\\evil.com", "http://example.com/a.png")) {
            List<BlockProblem> p = problems(list(block("id", "img1", "type", "image", "url", u, "caption", "")), null);
            assertThat(p).as(u).hasSize(1);
            assertThat(p.get(0).id()).isEqualTo("img1");
            assertThat(p.get(0).field()).isEqualTo("url");
        }
        assertThat(problems(list(block("id", "v", "type", "video", "url", "javascript:1", "caption", "")), null)).hasSize(1);
    }

    @Test
    void anUnsafeSvgIsRejectedWithBlockLevelMessages() {
        List<BlockProblem> p = problems(list(block("id", "s1", "type", "svg", "svg",
                "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"><script>1</script><foreignObject/></svg>", "caption", "")), null);
        assertThat(p).isNotEmpty().allSatisfy(x -> { assertThat(x.id()).isEqualTo("s1"); assertThat(x.field()).isEqualTo("svg"); });
        assertThat(p.stream().map(BlockProblem::message)).anyMatch(m -> m.contains("onload")).anyMatch(m -> m.contains("script")).anyMatch(m -> m.contains("foreignObject"));
    }

    @Test
    void shapeAndEnumErrors() {
        assertThat(problems(list(block("id", "a", "type", "heading", "level", 4, "text", "x")), null)).extracting(BlockProblem::field).contains("level");
        assertThat(problems(list(block("id", "a", "type", "callout", "variant", "danger", "text", "x")), null)).extracting(BlockProblem::field).contains("variant");
        assertThat(problems(list(block("id", "a", "type", "text", "text", 5)), null)).extracting(BlockProblem::field).contains("text");
        assertThat(problems(list(block("id", "a", "type", "code", "language", "java<script>", "code", "", "caption", "")), null)).extracting(BlockProblem::field).contains("language");
        assertThat(problems(list(block("id", "a", "type", "html", "html", "x", "height", "tall")), null)).extracting(BlockProblem::field).contains("height");
        assertThat(problems(list(block("id", "a", "type", "html", "html", "x", "height", 99999)), null)).extracting(BlockProblem::field).contains("height");
    }

    @Test
    void sizeCaps() {
        assertThat(problems(list(block("id", "a", "type", "text", "text", "x".repeat(BlockRules.MAX_TEXT + 1))), null)).hasSize(1);
        assertThat(problems(list(block("id", "a", "type", "html", "html", "x".repeat(BlockRules.MAX_HTML + 1), "height", 360)), null)).hasSize(1);
        assertThat(problems(list(block("id", "a", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><desc>" + "x".repeat(SvgSanitizer.MAX_CHARS) + "</desc></svg>", "caption", "")), null)).hasSize(1);
        assertThat(problems(list(block("id", "a", "type", "code", "language", "x", "code", "x".repeat(BlockRules.MAX_CODE + 1), "caption", "")), null)).hasSize(1);
        assertThat(problems(list(block("id", "a".repeat(65), "type", "divider")), null)).hasSize(1);
    }

    @Test
    void idsAreRequiredAndUnique() {
        assertThat(problems(list(block("type", "divider")), null)).extracting(BlockProblem::id).containsExactly("#1");
        assertThat(problems(list(block("id", "x", "type", "divider"), block("id", "x", "type", "divider")), null)).hasSize(1);
        assertThat(problems(list(block("id", "", "type", "divider")), null)).hasSize(1);
    }

    @Test
    void extraFieldsOnKnownBlocksAreRefusedUnlessAlreadyStoredWithTheSameValue() {
        assertThat(problems(list(block("id", "a", "type", "text", "text", "x", "onclick", "boom")), null)).hasSize(1);
        var stored = list(block("id", "a", "type", "text", "text", "x", "legacy", 1));
        assertThat(problems(list(block("id", "a", "type", "text", "text", "x", "legacy", 1)), stored)).isEmpty();
        assertThat(problems(list(block("id", "a", "type", "text", "text", "x", "legacy", 2)), stored)).hasSize(1);
        assertThat(problems(list(block("id", "a", "type", "text", "text", "x", "legacy", 1, "extra", 1)), stored)).hasSize(1);
    }

    // ---- legacy / unknown compatibility ----
    @Test
    void anUnknownBlockIsRefusedWhenNew() {
        assertThat(problems(list(block("id", "t", "type", "table", "rows", List.of())), null)).extracting(BlockProblem::field).containsExactly("type");
        assertThat(problems(list(block("id", "t", "type", "table", "rows", List.of())), list(block("id", "o", "type", "text", "text", "x")))).hasSize(1);
    }

    @Test
    void anUnknownBlockSurvivesWhenIdenticalToTheStoredOne_whateverItsIdsOrShape() {
        List<Map<String, Object>> stored = list(
            block("type", "table"),                                                        // no id
            block("id", "dup", "type", "embed", "weird", Map.of("a", List.of(1, 2.5, "s", true, Map.of("n", 1)))),
            block("id", "dup", "type", "embed2"),                                          // duplicate id
            block("id", "x".repeat(500), "type", "file", "name", "a.pdf"),                 // overlong id
            block("id", 42, "type", "mystery"),                                            // non-string id
            block("id", "\u0001ctl", "type", "mystery2"));                                  // control char in id
        List<Map<String, Object>> sent = new ArrayList<>(stored);
        assertThat(problems(sent, stored)).isEmpty();
        java.util.Collections.reverse(sent);                                               // reordering is fine
        assertThat(problems(sent, stored)).isEmpty();
    }

    @Test
    void aModifiedOrCopiedUnknownBlockIsRefused() {
        var stored = list(block("id", "u", "type", "table", "rows", 3));
        assertThat(problems(list(block("id", "u", "type", "table", "rows", 4)), stored)).hasSize(1);
        assertThat(problems(list(block("id", "u", "type", "table", "rows", 3, "extra", true)), stored)).hasSize(1);
        assertThat(problems(list(block("id", "u2", "type", "table", "rows", 3)), stored)).hasSize(1);   // same content, new id: a new block
        assertThat(problems(list(block("id", "u", "type", "table", "rows", 3), block("id", "u9", "type", "table", "rows", 9)), stored)).hasSize(1);
    }

    @Test
    void nothingIsGrandfatheredWhenThereIsNoStoredContent() {
        assertThat(problems(list(block("id", "u", "type", "table")), null)).hasSize(1);
    }

    @Test
    void anUnchangedKnownBlockIsExemptFromSizeCapsOnly() {
        var big = block("id", "a", "type", "text", "text", "x".repeat(BlockRules.MAX_TEXT + 500));
        assertThat(problems(list(big), list(new LinkedHashMap<>(big)))).isEmpty();                    // unchanged: cap skipped
        var edited = block("id", "a", "type", "text", "text", "x".repeat(BlockRules.MAX_TEXT + 501));
        assertThat(problems(list(edited), list(big))).hasSize(1);                                       // edited: cap applies again
        // never exempt from security: an unchanged image with an unsafe URL still fails
        var evil = block("id", "i", "type", "image", "url", "javascript:alert(1)", "caption", "");
        assertThat(problems(list(evil), list(new LinkedHashMap<>(evil)))).hasSize(1);
        var evilSvg = block("id", "s", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>1</script></svg>", "caption", "");
        assertThat(problems(list(evilSvg), list(new LinkedHashMap<>(evilSvg)))).isNotEmpty();
        // an unchanged oversize but SAFE svg is fine, an unchanged oversize UNSAFE one is not
        String safeBig = "<svg xmlns=\"http://www.w3.org/2000/svg\"><desc>" + "x".repeat(SvgSanitizer.MAX_CHARS) + "</desc></svg>";
        var bigSvg = block("id", "s", "type", "svg", "svg", safeBig, "caption", "");
        assertThat(problems(list(bigSvg), list(new LinkedHashMap<>(bigSvg)))).isEmpty();
    }

    @Test
    void aMissingTypeIsReportedNotThrownAsAnNpe() {
        assertThatCode(() -> BlockValidator.validate(list(block("id", "a")), null)).isInstanceOf(InvalidBlocksException.class);
        assertThatThrownBy(() -> BlockValidator.validate(list(block("id", "a", "type", 5)), null)).isInstanceOf(InvalidBlocksException.class);
    }
}
