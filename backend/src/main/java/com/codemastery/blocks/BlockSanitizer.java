package com.codemastery.blocks;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * READ boundary. Turns STORED blocks into what a public reader may be sent. Stored rows are never assumed safe: they may predate
 * validation, or have been written by an older version. It reads the stored data and never changes it.
 *
 * What the output guarantees to ANY API consumer (not just our React app):
 *  1. DATA-SAFE: every block is a known type built field by field from an allowlist (no extra fields pass through); every URL
 *     passed {@link UrlRules}; `svg` is clean markup re-serialised by {@link SvgSanitizer}; all other fields are plain text.
 *  2. ISOLATED-ONLY: the `html` field is author markup kept as written (CSS-based blocks must keep working). It is NOT safe to
 *     insert into a page. Each such block carries `"isolatedOnly": true`; it may only be rendered inside a sandboxed iframe
 *     with a restrictive CSP (sandbox="", no scripts, no network) - see BlockRenderer.
 *  3. Nothing in the output is safe to insert as ordinary page HTML.
 * Blocks that fail (unknown type, wrong shape, unsafe URL, an SVG that cannot be cleaned) are omitted, never passed through.
 * Idempotent: project(project(x)).equals(project(x)).
 */
public final class BlockSanitizer {
    private BlockSanitizer() {}

    /** Field order per type (the allowed field names are those in {@link BlockRules#FIELDS}). */
    public static List<Map<String, Object>> project(List<?> stored) {
        if (stored == null) return null;
        List<Map<String, Object>> out = new ArrayList<>();
        Set<String> usedIds = new HashSet<>();
        for (int i = 0; i < stored.size(); i++) {
            if (!(stored.get(i) instanceof Map<?, ?> raw)) continue;
            @SuppressWarnings("unchecked") Map<String, Object> b = (Map<String, Object>) raw;
            if (!(b.get("type") instanceof String type) || !BlockRules.isKnown(type)) continue;

            Map<String, Object> checked = b;
            String svg = null;
            Object doc = null;
            boolean hasDoc = false;
            if (type.equals("text")) {                     // a bad doc is dropped (the plain text still reads), never the whole block
                checked = new LinkedHashMap<>(b);
                hasDoc = checked.containsKey("doc");
                doc = checked.remove("doc");
            }
            if (type.equals("svg")) {                      // svg is cleaned, not rejected: judge everything else without it
                checked = new LinkedHashMap<>(b);
                Object s = checked.remove("svg");
                if (s != null && !(s instanceof String)) continue;
                svg = (String) s;
            }
            if (!BlockRules.check(type, checked, false).isEmpty()) continue;

            Map<String, Object> clean = new LinkedHashMap<>();
            clean.put("id", uniqueId(b.get("id"), i, usedIds));
            clean.put("type", type);
            Set<String> allowed = BlockRules.FIELDS.get(type);
            for (Map.Entry<String, Object> e : b.entrySet()) {
                if (!allowed.contains(e.getKey()) || e.getKey().equals("svg") || e.getKey().equals("doc")) continue;
                clean.put(e.getKey(), e.getKey().equals("rows") ? copyRows(e.getValue()) : e.getValue());
            }
            if (hasDoc && doc instanceof List<?> d && InlineDoc.problems(d, false).isEmpty()) clean.put("doc", InlineDoc.rebuild(d));
            if (type.equals("svg") && svg != null) {
                SvgSanitizer.Result r = SvgSanitizer.process(svg, false);
                if (r.fatal() || r.svg() == null) continue;   // cannot be made safe: omit the block rather than serve the original
                clean.put("svg", r.svg());
            }
            if (type.equals("html")) clean.put("isolatedOnly", true);
            out.add(clean);
        }
        return out;
    }

    /** Fresh lists of strings (the table passed {@link BlockRules#check}, so every row is a list of strings). */
    private static List<List<String>> copyRows(Object rows) {
        List<List<String>> out = new ArrayList<>();
        for (Object r : (List<?>) rows) {
            List<String> row = new ArrayList<>();
            for (Object c : (List<?>) r) row.add((String) c);
            out.add(row);
        }
        return out;
    }

    private static String uniqueId(Object id, int index, Set<String> used) {
        String candidate = id instanceof String s && !s.isEmpty() && s.length() <= BlockRules.MAX_ID && noControl(s) ? s : "b" + (index + 1);
        String out = candidate;
        for (int n = 2; !used.add(out); n++) out = candidate + "-" + n;
        return out;
    }

    private static boolean noControl(String s) {
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) < 0x20 || s.charAt(i) == 0x7f) return false;
        return true;
    }
}
