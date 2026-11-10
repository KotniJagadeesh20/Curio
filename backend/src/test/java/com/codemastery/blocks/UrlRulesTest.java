package com.codemastery.blocks;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
import org.junit.jupiter.api.Test;

/** The same vectors drive src/lib/urlRules.test.ts, so the server and the browser-side check cannot drift apart. */
class UrlRulesTest {
    private static final JsonNode V = load();

    private static JsonNode load() {
        try { return new ObjectMapper().readTree(new File("../shared/url-vectors.json")); }
        catch (Exception e) { throw new IllegalStateException(e); }
    }

    @Test
    void acceptsEverythingTheVectorsAccept() {
        for (JsonNode n : V.get("accept")) assertThat(UrlRules.problem(n.asText())).as(n.asText()).isNull();
    }

    @Test
    void rejectsEverythingTheVectorsReject() {
        for (JsonNode n : V.get("reject")) assertThat(UrlRules.problem(n.asText())).as("rejected: " + n.asText()).isNotNull();
    }

    @Test
    void blankIsAllowedInADraftButIsNotSafeToRender() {
        for (JsonNode n : V.get("blank")) {
            assertThat(UrlRules.problem(n.asText())).isNull();
            assertThat(UrlRules.isSafe(n.asText())).isFalse();
        }
        assertThat(UrlRules.problem(null)).isNull();
    }

    @Test
    void lengthIsCapped() {
        assertThat(UrlRules.problem("https://example.com/" + "a".repeat(UrlRules.MAX_LENGTH))).isNotNull();
        assertThat(UrlRules.problem("https://example.com/" + "a".repeat(UrlRules.MAX_LENGTH - 20))).isNull();
    }
}
