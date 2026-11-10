package com.codemastery.blocks;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The per-type schema, shared by the write boundary ({@link BlockValidator}) and the read boundary ({@link BlockSanitizer}).
 * Two kinds of rule:
 *  - SECURITY/SHAPE rules (field types, enums, URL rule, SVG safety, language charset): always enforced;
 *  - SIZE CAPS (text length, html size, ...): enforced on write, and skipped for a block that is unchanged from what is
 *    already stored (so tightening a cap never makes an old page unsaveable) and on read (a cap is not a safety matter).
 */
final class BlockRules {
    private BlockRules() {}

    static final int MAX_ID = 64;
    static final int MAX_HEADING = 300, MAX_TEXT = 20_000, MAX_CODE = 50_000, MAX_CAPTION = 500, MAX_HTML = 100_000, MAX_LANGUAGE = 30;
    static final int MIN_HEIGHT = 100, MAX_HEIGHT = 2_000;

    private static final Pattern LANGUAGE = Pattern.compile("^[A-Za-z0-9+#._-]{0,30}$");

    /** The fields each known type may carry besides id and type. */
    static final Map<String, Set<String>> FIELDS = Map.of(
            "heading", Set.of("level", "text"),
            "text", Set.of("text"),
            "code", Set.of("language", "code", "caption"),
            "image", Set.of("url", "assetId", "caption"),
            "video", Set.of("url", "caption"),
            "html", Set.of("html", "height"),
            "svg", Set.of("svg", "caption"),
            "callout", Set.of("variant", "text"),
            "divider", Set.of());

    private static final Pattern CANONICAL_UUID = Pattern.compile("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$");

    /** An image block's {@code assetId}: a canonical lower-case UUID, or null when it isn't one. */
    static java.util.UUID assetId(String s) {
        return s != null && CANONICAL_UUID.matcher(s).matches() ? java.util.UUID.fromString(s) : null;
    }

    static boolean isKnown(String type) { return FIELDS.containsKey(type); }

    /** Field problems for one known-type block, as (field -> message) pairs. */
    static List<String[]> check(String type, Map<String, Object> b, boolean enforceCaps) {
        List<String[]> out = new ArrayList<>();
        switch (type) {
            case "heading" -> {
                Object level = b.get("level");
                if (b.containsKey("level") && !(level instanceof Integer l && (l == 2 || l == 3))) out.add(p("level", "A heading level must be 2 or 3."));
                text(b, "text", MAX_HEADING, enforceCaps, out);
            }
            case "text" -> text(b, "text", MAX_TEXT, enforceCaps, out);
            case "code" -> {
                if (text(b, "language", -1, false, out) && b.get("language") instanceof String s && !LANGUAGE.matcher(s).matches()) {
                    out.add(p("language", "Use a short language name such as java or python."));
                }
                text(b, "code", MAX_CODE, enforceCaps, out);
                text(b, "caption", MAX_CAPTION, enforceCaps, out);
            }
            case "image", "video" -> {
                if (text(b, "url", -1, false, out) && b.get("url") instanceof String u) {
                    String problem = UrlRules.problem(u);
                    if (problem != null) out.add(p("url", problem));
                }
                if (type.equals("image") && text(b, "assetId", -1, false, out) && b.get("assetId") instanceof String a) {
                    if (assetId(a) == null) out.add(p("assetId", "This isn't a valid image id."));
                    else if (b.get("url") instanceof String u && !u.isEmpty()) out.add(p("assetId", "Use an uploaded image or a link, not both."));
                }
                text(b, "caption", MAX_CAPTION, enforceCaps, out);
            }
            case "html" -> {
                text(b, "html", MAX_HTML, enforceCaps, out);
                if (b.containsKey("height")) {
                    Object h = b.get("height");
                    if (!(h instanceof Integer i)) out.add(p("height", "The height must be a whole number of pixels."));
                    else if (enforceCaps && (i < MIN_HEIGHT || i > MAX_HEIGHT)) out.add(p("height", "The height must be between " + MIN_HEIGHT + " and " + MAX_HEIGHT + " pixels."));
                }
            }
            case "svg" -> {
                text(b, "caption", MAX_CAPTION, enforceCaps, out);
                if (text(b, "svg", -1, false, out) && b.get("svg") instanceof String s && !s.isBlank()) {
                    // the size cap is exempt for an unchanged block, but the structural budgets (elements, depth) and every safety rule never are
                    for (String why : SvgSanitizer.process(s, enforceCaps).problems()) out.add(p("svg", why));
                }
            }
            case "callout" -> {
                Object v = b.get("variant");
                if (b.containsKey("variant") && !("info".equals(v) || "tip".equals(v) || "warning".equals(v))) out.add(p("variant", "A callout is info, tip or warning."));
                text(b, "text", MAX_TEXT, enforceCaps, out);
            }
            default -> { /* divider: no fields */ }
        }
        return out;
    }

    /** @return true when the field is absent or a string (so further checks may read it). */
    private static boolean text(Map<String, Object> b, String field, int max, boolean enforceCaps, List<String[]> out) {
        if (!b.containsKey(field)) return false;
        Object v = b.get(field);
        if (!(v instanceof String s)) { out.add(p(field, "This must be text.")); return false; }
        if (enforceCaps && max > 0 && s.length() > max) out.add(p(field, "This is too long (limit " + max + " characters)."));
        return true;
    }

    private static String[] p(String field, String message) { return new String[] {field, message}; }
}
