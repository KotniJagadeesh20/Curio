package com.codemastery.blocks;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

class SvgSanitizerTest {
    private static String svg(String inner) { return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\">" + inner + "</svg>"; }

    private static final String GOOD = svg("<defs><linearGradient id=\"g1\"><stop offset=\"0\" stop-color=\"#fff\"/><stop offset=\"1\" stop-color=\"rgb(0,0,0)\"/></linearGradient></defs>"
            + "<g transform=\"translate(1,2) rotate(3)\"><rect x=\"1\" y=\"1\" width=\"8\" height=\"8\" rx=\"1\" fill=\"url(#g1)\" stroke=\"#333\" stroke-width=\"0.5\"/>"
            + "<path d=\"M1 1\n L 9 9 z\" fill=\"none\"/><circle cx=\"5\" cy=\"5\" r=\"2\"/><text x=\"1\" y=\"9\" font-family=\"'Segoe UI', Arial\" font-size=\"2\">Hi &amp; bye<tspan dy=\"1\">x</tspan></text></g><title>Diagram</title>");

    @Test
    void aNormalDiagramPassesWithNoProblemsAndKeepsItsContent() {
        SvgSanitizer.Result r = SvgSanitizer.process(GOOD);
        assertThat(r.problems()).isEmpty();
        assertThat(r.fatal()).isFalse();
        assertThat(r.svg()).contains("linearGradient", "url(#g1)", "Hi &amp; bye", "xmlns=\"http://www.w3.org/2000/svg\"");
    }

    @Test
    void aPrefixedButCorrectSvgNamespaceIsAccepted_andComesOutUnprefixed() {
        SvgSanitizer.Result r = SvgSanitizer.process("<s:svg xmlns:s=\"http://www.w3.org/2000/svg\"><s:rect width=\"1\"/></s:svg>");
        assertThat(r.problems()).isEmpty();
        assertThat(r.svg()).isEqualTo("<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"1\"/></svg>");
    }

    @Test
    void sanitisingIsIdempotent() {
        String once = SvgSanitizer.process(GOOD).svg();
        assertThat(SvgSanitizer.process(once).svg()).isEqualTo(once);
        String dirty = svg("<script>alert(1)</script><rect onload=\"x()\" width=\"1\" style=\"fill:red\"/>");
        String cleaned = SvgSanitizer.process(dirty).svg();
        assertThat(SvgSanitizer.process(cleaned).svg()).isEqualTo(cleaned);
        assertThat(SvgSanitizer.process(cleaned).problems()).isEmpty();
    }

    @Test
    void blankIsAllowedInADraft() {
        assertThat(SvgSanitizer.process("").problems()).isEmpty();
        assertThat(SvgSanitizer.process("   ").problems()).isEmpty();
    }

    static Stream<Arguments> attacks() {
        return Stream.of(
            Arguments.of("script element", svg("<script>alert(1)</script>")),
            Arguments.of("script, upper-case", svg("<SCRIPT>alert(1)</SCRIPT>")),
            Arguments.of("prefixed script", svg("<svg:script xmlns:svg=\"http://www.w3.org/2000/svg\">alert(1)</svg:script>")),
            Arguments.of("onload on root", "<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"alert(1)\"/>"),
            Arguments.of("onclick", svg("<rect width=\"1\" onclick=\"alert(1)\"/>")),
            Arguments.of("ONLOAD upper-case", svg("<rect width=\"1\" ONLOAD=\"alert(1)\"/>")),
            Arguments.of("foreignObject", svg("<foreignObject><div>hi</div></foreignObject>")),
            Arguments.of("foreignObject with html namespace", svg("<foreignObject><body xmlns=\"http://www.w3.org/1999/xhtml\"><script>1</script></body></foreignObject>")),
            Arguments.of("use with external href", svg("<use href=\"http://evil.example/x.svg#a\"/>")),
            Arguments.of("use with internal href (expansion bomb vector)", svg("<g id=\"a\"/><use href=\"#a\"/>")),
            Arguments.of("image with external href", svg("<image href=\"https://evil.example/t.png\"/>")),
            Arguments.of("image with data uri", svg("<image href=\"data:image/png;base64,AAAA\"/>")),
            Arguments.of("anchor", svg("<a href=\"javascript:alert(1)\"><rect width=\"1\"/></a>")),
            Arguments.of("gradient href external", svg("<linearGradient id=\"g\" xlink:href=\"https://evil.example/x#a\" xmlns:xlink=\"http://www.w3.org/1999/xlink\"/>")),
            Arguments.of("gradient href javascript", svg("<linearGradient id=\"g\" href=\"javascript:alert(1)\"/>")),
            Arguments.of("style element", svg("<style>rect{fill:url(http://evil.example/x)}</style>")),
            Arguments.of("style element with @import", svg("<style>@import url(https://evil.example/x.css);</style>")),
            Arguments.of("style attribute", svg("<rect width=\"1\" style=\"fill:red\"/>")),
            Arguments.of("style attribute url", svg("<rect width=\"1\" style=\"fill:url(https://evil.example/a)\"/>")),
            Arguments.of("fill url external", svg("<rect width=\"1\" fill=\"url(https://evil.example/a)\"/>")),
            Arguments.of("fill url protocol-relative", svg("<rect width=\"1\" fill=\"url(//evil.example/a)\"/>")),
            Arguments.of("fill url quoted external", svg("<rect width=\"1\" fill=\"url('http://evil.example/a')\"/>")),
            Arguments.of("fill javascript", svg("<rect width=\"1\" fill=\"javascript:alert(1)\"/>")),
            Arguments.of("fill javascript entity-encoded colon", svg("<rect width=\"1\" fill=\"javascript&#58;alert(1)\"/>")),
            Arguments.of("fill javascript entity-encoded letters", svg("<rect width=\"1\" fill=\"&#106;avascript&#58;alert(1)\"/>")),
            Arguments.of("fill with data uri", svg("<rect width=\"1\" fill=\"data:text/html,x\"/>")),
            Arguments.of("control char in value", svg("<rect width=\"1\" fill=\"red&#1;\"/>")),
            Arguments.of("angle bracket in value", svg("<rect width=\"1\" fill=\"&lt;script&gt;\"/>")),
            Arguments.of("animate", svg("<rect width=\"1\"><animate attributeName=\"href\" to=\"javascript:alert(1)\"/></rect>")),
            Arguments.of("set", svg("<a><set attributeName=\"href\" to=\"javascript:alert(1)\"/></a>")),
            Arguments.of("foreign namespace element", svg("<inkscape:foo xmlns:inkscape=\"http://www.inkscape.org/namespaces/inkscape\"/>")),
            Arguments.of("foreign-namespace element with an allowed local name", svg("<ev:rect xmlns:ev=\"http://evil.example/\" width=\"1\"/>")),
            Arguments.of("foreign-namespace attribute", svg("<rect xmlns:ev=\"http://evil.example/\" ev:width=\"1\"/>")),
            Arguments.of("foreign namespace declaration", "<svg xmlns=\"http://www.w3.org/2000/svg\" xmlns:evil=\"http://evil.example/\"/>"),
            Arguments.of("wrong default namespace", "<svg xmlns=\"http://evil.example/\"/>"),
            Arguments.of("class attribute", svg("<rect width=\"1\" class=\"a\"/>")),
            Arguments.of("data attribute", svg("<rect width=\"1\" data-x=\"1\"/>")),
            Arguments.of("bad id", svg("<g id=\"1 bad\"/>")),
            Arguments.of("DOCTYPE with external entity (XXE)", "<?xml version=\"1.0\"?><!DOCTYPE svg [<!ENTITY x SYSTEM \"file:///etc/passwd\">]><svg xmlns=\"http://www.w3.org/2000/svg\"><text>&x;</text></svg>"),
            Arguments.of("billion laughs", "<!DOCTYPE svg [<!ENTITY a \"aaaaaaaaaa\"><!ENTITY b \"&a;&a;&a;&a;&a;&a;&a;&a;\">]><svg xmlns=\"http://www.w3.org/2000/svg\"><text>&b;</text></svg>"),
            Arguments.of("lower-case doctype", "<!doctype svg><svg xmlns=\"http://www.w3.org/2000/svg\"/>"),
            Arguments.of("processing instruction", "<svg xmlns=\"http://www.w3.org/2000/svg\"><?xml-stylesheet href=\"http://evil.example/x.css\"?></svg>"),
            Arguments.of("not svg at all", "<html><body><script>alert(1)</script></body></html>"),
            Arguments.of("two roots", "<svg xmlns=\"http://www.w3.org/2000/svg\"/><svg xmlns=\"http://www.w3.org/2000/svg\"/>"),
            Arguments.of("text outside the root", "hello <svg xmlns=\"http://www.w3.org/2000/svg\"/>"),
            Arguments.of("unclosed element", "<svg xmlns=\"http://www.w3.org/2000/svg\"><g><rect width=\"1\"></svg>"),
            Arguments.of("plain text", "this is not svg"),
            Arguments.of("script smuggled in a CDATA text node", svg("<text><![CDATA[<script>alert(1)</script>]]></text>").replace("<text>", "<style>").replace("</text>", "</style>"))
        );
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("attacks")
    void everyAttackIsFlaggedOnWrite(String name, String attack) {
        SvgSanitizer.Result r = SvgSanitizer.process(attack);
        assertThat(r.fatal() || !r.problems().isEmpty()).as(name).isTrue();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("attacks")
    void onReadTheOutputIsEitherOmittedOrFreeOfEveryAttackPattern(String name, String attack) {
        SvgSanitizer.Result r = SvgSanitizer.process(attack);
        if (r.fatal()) { assertThat(r.svg()).isNull(); return; }
        String out = r.svg().toLowerCase();
        assertThat(out).as(name).doesNotContain("<script", "onload", "onclick", "foreignobject", "<style", "style=", "javascript", "<use", "<image", "<a ", "<animate", "<set", "evil.example", "data:", "<!doctype", "<!entity");
        assertThat(SvgSanitizer.process(r.svg()).problems()).as("clean output re-checks clean: " + name).isEmpty();
    }

    @Test
    void stripModeKeepsTheSafePartsAndDropsTheRest() {
        SvgSanitizer.Result r = SvgSanitizer.process(svg("<rect width=\"4\" height=\"4\" fill=\"red\" onclick=\"x()\"/><script>alert(1)</script><circle r=\"2\"/>"));
        assertThat(r.fatal()).isFalse();
        assertThat(r.problems()).hasSize(2);
        assertThat(r.svg()).contains("<rect", "width=\"4\"", "height=\"4\"", "fill=\"red\"", "<circle r=\"2\"/>").doesNotContain("script", "onclick", "alert");
    }

    @Test
    void sizeAndStructureBudgets() {
        assertThat(SvgSanitizer.process(svg("<!-- " + "x".repeat(SvgSanitizer.MAX_CHARS) + " -->")).fatal()).isTrue();
        assertThat(SvgSanitizer.process(svg("<g/>".repeat(SvgSanitizer.MAX_ELEMENTS + 1)).replace("<g/>", "<g/>")).fatal()).isTrue();
        String deep = "<g>".repeat(SvgSanitizer.MAX_DEPTH + 1) + "</g>".repeat(SvgSanitizer.MAX_DEPTH + 1);
        assertThat(SvgSanitizer.process(svg(deep)).fatal()).isTrue();
        String ok = "<g>".repeat(SvgSanitizer.MAX_DEPTH - 2) + "</g>".repeat(SvgSanitizer.MAX_DEPTH - 2);
        assertThat(SvgSanitizer.process(svg(ok)).problems()).isEmpty();
        // an unchanged oversize block skips ONLY the character cap
        String big = svg("<desc>" + "x".repeat(SvgSanitizer.MAX_CHARS) + "</desc>");
        assertThat(SvgSanitizer.process(big, true).fatal()).isTrue();
        assertThat(SvgSanitizer.process(big, false).problems()).isEmpty();
        assertThat(SvgSanitizer.process(big.replace("<desc>", "<script>").replace("</desc>", "</script>"), false).problems()).isNotEmpty();
    }

    @Test
    void textContentIsEscapedNotInterpreted() {
        SvgSanitizer.Result r = SvgSanitizer.process(svg("<text>&lt;script&gt;alert(1)&lt;/script&gt;</text>"));
        assertThat(r.problems()).isEmpty();
        assertThat(r.svg()).contains("&lt;script&gt;alert(1)&lt;/script&gt;").doesNotContain("<script");
    }
}
