package com.codemastery.media;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** RFC 9110 If-None-Match for GET: weak comparison, "*", lists, commas inside quoted tags, malformed headers. */
class EntityTagsTest {
    static final String SHA = "abc123";

    private static boolean m(String header) { return EntityTags.ifNoneMatchMatches(header, SHA); }

    @Test void strongTagMatches() { assertThat(m("\"abc123\"")).isTrue(); }

    @Test void weakTagWithTheSameOpaqueValueMatchesTheStrongOne() { assertThat(m("W/\"abc123\"")).isTrue(); }

    @Test void differentOpaqueValueDoesNotMatch() {
        assertThat(m("\"abc124\"")).isFalse();
        assertThat(m("W/\"abc124\"")).isFalse();
        assertThat(m("\"ABC123\"")).as("opaque tags are case-sensitive").isFalse();
    }

    @Test void wildcardMatchesAnyExistingResourceOnlyOnItsOwn() {
        assertThat(m("*")).isTrue();
        assertThat(m("  *  ")).isTrue();
        assertThat(m("*, \"zzz\"")).as("* is not allowed inside a list").isFalse();
        assertThat(m("\"*\"")).as("a quoted star is an ordinary tag").isFalse();
    }

    @Test void listsMatchWhenAnyTagMatches() {
        assertThat(m("\"x\", \"abc123\"")).isTrue();
        assertThat(m("\"abc123\", \"x\"")).isTrue();
        assertThat(m("\"x\",W/\"abc123\",\"y\"")).isTrue();
        assertThat(m("\"x\", \"y\"")).isFalse();
        assertThat(m("  \"x\" ,\t\"abc123\"  ")).as("optional whitespace around commas").isTrue();
        assertThat(m("\"x\",,\"abc123\"")).as("empty list elements are legal").isTrue();
    }

    @Test void commasInsideAQuotedTagBelongToTheTag() {
        assertThat(EntityTags.ifNoneMatchMatches("\"a,b\"", "a,b")).isTrue();
        assertThat(EntityTags.ifNoneMatchMatches("\"a,b\"", "a")).as("must not split on the comma").isFalse();
        assertThat(EntityTags.ifNoneMatchMatches("\"a,b\"", "b")).isFalse();
        assertThat(EntityTags.ifNoneMatchMatches("\"x\", \"a,b\", W/\"c\"", "a,b")).isTrue();
        assertThat(EntityTags.ifNoneMatchMatches("\"x,\"abc123\"", SHA)).as("a quote ends the tag, so \"x,\" is one tag followed by junk").isFalse();
    }

    @Test void malformedHeadersCountAsNoMatch() {
        for (String bad : new String[] {"abc123", "\"abc123", "abc123\"", "w/\"abc123\"", "W/abc123", "\"abc123\" \"x\"", "\"abc123\" junk",
                "\"x\", garbage", "\"abc123\"x", "", "   ", ",", "W/"}) {
            assertThat(m(bad)).as("[" + bad + "]").isFalse();
        }
        assertThat(EntityTags.ifNoneMatchMatches(null, SHA)).isFalse();
        assertThat(EntityTags.ifNoneMatchMatches("\"abc123\"", null)).isFalse();
    }
}
