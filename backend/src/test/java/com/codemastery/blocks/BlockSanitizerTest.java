package com.codemastery.blocks;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class BlockSanitizerTest {
    private static Map<String, Object> blk(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }
    private static List<Object> list(Object... o) { return new ArrayList<>(List.of(o)); }

    @Test
    void nullStaysNullAndEmptyStaysEmpty() {
        assertThat(BlockSanitizer.project(null)).isNull();
        assertThat(BlockSanitizer.project(List.of())).isEmpty();
    }

    @Test
    void itDropsWhatIsNotAKnownWellFormedBlockAndKeepsTheOrderOfTheRest() {
        List<Map<String, Object>> out = BlockSanitizer.project(list("a string", 5, blk("id", "x"), blk("id", "y", "type", 7), blk("id", "t", "type", "table"),
                blk("id", "1", "type", "divider"), blk("id", "h", "type", "heading", "level", 5, "text", "x"), blk("id", "2", "type", "divider")));
        assertThat(out).extracting(m -> m.get("id")).containsExactly("1", "2");
    }

    @Test
    void onlyAllowlistedFieldsPassThrough() {
        Map<String, Object> out = BlockSanitizer.project(list(blk("id", "t", "type", "text", "text", "hi", "evil", "<script>", "onclick", "x"))).get(0);
        assertThat(out.keySet()).containsExactly("id", "type", "text");
    }

    @Test
    void idsAreMadeValidAndUnique() {
        List<Map<String, Object>> out = BlockSanitizer.project(list(blk("id", "a", "type", "divider"), blk("id", "a", "type", "divider"), blk("type", "divider"),
                blk("id", "x".repeat(100), "type", "divider"), blk("id", 7, "type", "divider"), blk("id", "b3", "type", "divider")));
        List<Object> ids = out.stream().map(m -> m.get("id")).toList();
        assertThat(ids).doesNotHaveDuplicates().allSatisfy(id -> assertThat(id.toString()).isNotEmpty().hasSizeLessThanOrEqualTo(BlockRules.MAX_ID));
        assertThat(ids.get(0)).isEqualTo("a");
    }

    @Test
    void htmlIsAlwaysMarkedIsolatedOnly_evenIfStoredAsFalseOrAbsent() {
        for (Object marker : new Object[] {Boolean.FALSE, "no", null}) {
            Map<String, Object> in = blk("id", "h", "type", "html", "html", "<p>x</p>", "height", 300);
            if (marker != null) in.put("isolatedOnly", marker);
            assertThat(BlockSanitizer.project(list(in)).get(0).get("isolatedOnly")).isEqualTo(true);
        }
    }

    @Test
    void aBlankSvgIsKeptAnUncleanableOneIsOmittedAndADirtyOneIsCleaned() {
        assertThat(BlockSanitizer.project(list(blk("id", "s", "type", "svg", "svg", "", "caption", "")))).hasSize(1);
        assertThat(BlockSanitizer.project(list(blk("id", "s", "type", "svg", "svg", "<!DOCTYPE x><svg xmlns=\"http://www.w3.org/2000/svg\"/>", "caption", "")))).isEmpty();
        assertThat(BlockSanitizer.project(list(blk("id", "s", "type", "svg", "svg", 5, "caption", "")))).isEmpty();
        Map<String, Object> cleaned = BlockSanitizer.project(list(blk("id", "s", "type", "svg", "caption", "c",
                "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>1</script><circle r=\"1\" onclick=\"x\"/></svg>"))).get(0);
        assertThat(cleaned.get("svg").toString()).contains("<circle r=\"1\"/>").doesNotContain("script").doesNotContain("onclick");
    }

    @Test
    void projectionIsIdempotent() {
        List<Object> messy = list(blk("id", "a", "type", "divider"), blk("id", "a", "type", "text", "text", "x", "extra", 1), blk("type", "html", "html", "<b>x</b>", "height", 9999),
                blk("id", "s", "type", "svg", "svg", "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"1\"><g><rect width=\"1\"/></g></svg>", "caption", ""),
                blk("id", "i", "type", "image", "url", "https://example.com/a.png", "caption", ""), blk("id", "bad", "type", "image", "url", "javascript:1", "caption", ""),
                blk("id", "c", "type", "callout", "variant", "warning", "text", "careful"));
        List<Map<String, Object>> once = BlockSanitizer.project(messy);
        assertThat(BlockSanitizer.project(new ArrayList<Object>(once))).isEqualTo(once);
    }
}
