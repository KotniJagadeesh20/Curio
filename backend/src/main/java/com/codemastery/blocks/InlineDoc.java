package com.codemastery.blocks;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * The structured rich-text document of a {@code text} block ({@code doc}), Step 13.
 *
 * <pre>
 * doc   := [ node* ]
 * node  := {"type":"paragraph","children":[run+]}
 *        | {"type":"list","ordered":bool,"items":[[run+]+]}        (flat: no nested lists)
 * run   := {"text":non-empty string, "bold"?:bool, "italic"?:bool, "href"?:https-or-relative URL}
 * </pre>
 *
 * Run text is one line (no control characters, so no line breaks); a paragraph break is a new node. Nothing here is HTML.
 *
 * <p>{@link #project} is the PLAIN-TEXT PROJECTION stored in the block's {@code text} field next to {@code doc}. It is written in the
 * plain syntax the old renderer already understands, so if {@code doc} is ever dropped the {@code text} still reads as paragraphs
 * and lists:
 * <ul>
 *   <li>nodes are joined by one blank line;</li>
 *   <li>a paragraph is its runs concatenated; a link run is {@code label (href)}; bold and italic leave no marker;</li>
 *   <li>a list is one line per item: {@code "- item"}, or {@code "1. item"}, {@code "2. item"} ... for an ordered list.</li>
 * </ul>
 * Shared test vectors ({@code shared/richtext-projection-vectors.json}) pin this algorithm so a second implementation can't drift.
 */
public final class InlineDoc {
    private InlineDoc() {}

    public static final int MAX_NODES = 200, MAX_RUNS = 2_000;
    private static final int MAX_PROBLEMS = 5;

    private static final Set<String> PARAGRAPH_KEYS = Set.of("type", "children");
    private static final Set<String> LIST_KEYS = Set.of("type", "ordered", "items");
    private static final Set<String> RUN_KEYS = Set.of("text", "bold", "italic", "href");

    /**
     * Problems with a stored or incoming {@code doc} (empty = valid). Shape and safety rules always apply (structure, types, the
     * link rule); the size caps only when {@code enforceCaps} (an unchanged stored block is exempt, as for every other cap).
     */
    public static List<String> problems(Object doc, boolean enforceCaps) {
        List<String> out = new ArrayList<>();
        if (!(doc instanceof List<?> nodes)) return List.of("The formatted text must be a list of paragraphs and lists.");
        if (enforceCaps && nodes.size() > MAX_NODES) add(out, "This text has too many paragraphs and lists (limit " + MAX_NODES + ").");
        int[] runs = {0};
        long[] chars = {0};
        for (Object n : nodes) {
            if (!(n instanceof Map<?, ?> node)) { add(out, "Every part of the formatted text must be an object."); continue; }
            Object type = node.get("type");
            if ("paragraph".equals(type)) {
                keys(node, PARAGRAPH_KEYS, out);
                runList(node.get("children"), runs, chars, out);
            } else if ("list".equals(type)) {
                keys(node, LIST_KEYS, out);
                if (!(node.get("ordered") instanceof Boolean)) add(out, "A list must say whether it is ordered (true or false).");
                if (!(node.get("items") instanceof List<?> items) || items.isEmpty()) add(out, "A list needs at least one item.");
                else for (Object item : items) runList(item, runs, chars, out);
            } else {
                add(out, "Unknown kind of formatted text.");
            }
        }
        if (enforceCaps && runs[0] > MAX_RUNS) add(out, "This text has too many formatted pieces (limit " + MAX_RUNS + ").");
        if (enforceCaps && chars[0] > BlockRules.MAX_TEXT) add(out, "This is too long (limit " + BlockRules.MAX_TEXT + " characters).");
        return out;
    }

    private static void runList(Object value, int[] runs, long[] chars, List<String> out) {
        if (!(value instanceof List<?> list) || list.isEmpty()) { add(out, "Every paragraph and list item needs some text."); return; }
        for (Object r : list) {
            runs[0]++;
            if (!(r instanceof Map<?, ?> run)) { add(out, "Every piece of formatted text must be an object."); continue; }
            keys(run, RUN_KEYS, out);
            if (!(run.get("text") instanceof String t) || t.isEmpty()) { add(out, "Every piece of formatted text needs some text."); }
            else {
                chars[0] += t.length();
                if (hasControl(t)) add(out, "Formatted text can't contain line breaks or control characters.");
            }
            for (String flag : List.of("bold", "italic")) {
                if (run.containsKey(flag) && !(run.get(flag) instanceof Boolean)) add(out, "'" + flag + "' must be true or false.");
            }
            if (run.containsKey("href")) {
                if (!(run.get("href") instanceof String h) || h.isBlank()) add(out, "A link needs an address.");
                else { String why = UrlRules.problem(h); if (why != null) add(out, why); }
            }
        }
    }

    private static void keys(Map<?, ?> m, Set<String> allowed, List<String> out) {
        for (Object k : m.keySet()) if (!(k instanceof String s) || !allowed.contains(s)) add(out, "Unexpected field in the formatted text.");
    }

    /** The plain-text projection of a VALID doc (see the class comment). */
    public static String project(List<?> doc) {
        StringBuilder out = new StringBuilder();
        boolean first = true;
        for (Object n : doc) {
            Map<?, ?> node = (Map<?, ?>) n;
            if (!first) out.append("\n\n");
            first = false;
            if ("paragraph".equals(node.get("type"))) {
                out.append(runsText((List<?>) node.get("children")));
            } else {
                boolean ordered = Boolean.TRUE.equals(node.get("ordered"));
                List<?> items = (List<?>) node.get("items");
                for (int i = 0; i < items.size(); i++) {
                    if (i > 0) out.append('\n');
                    out.append(ordered ? (i + 1) + ". " : "- ").append(runsText((List<?>) items.get(i)));
                }
            }
        }
        return out.toString();
    }

    private static String runsText(List<?> runs) {
        StringBuilder sb = new StringBuilder();
        for (Object r : runs) {
            Map<?, ?> run = (Map<?, ?>) r;
            sb.append((String) run.get("text"));
            if (run.get("href") instanceof String h) sb.append(" (").append(h).append(')');
        }
        return sb.toString();
    }

    /** A fresh copy of a VALID doc, built field by field in a fixed key order (used by the read boundary). Idempotent. */
    public static List<Object> rebuild(List<?> doc) {
        List<Object> out = new ArrayList<>();
        for (Object n : doc) {
            Map<?, ?> node = (Map<?, ?>) n;
            Map<String, Object> clean = new LinkedHashMap<>();
            if ("paragraph".equals(node.get("type"))) {
                clean.put("type", "paragraph");
                clean.put("children", rebuildRuns((List<?>) node.get("children")));
            } else {
                clean.put("type", "list");
                clean.put("ordered", node.get("ordered"));
                List<Object> items = new ArrayList<>();
                for (Object item : (List<?>) node.get("items")) items.add(rebuildRuns((List<?>) item));
                clean.put("items", items);
            }
            out.add(clean);
        }
        return out;
    }

    private static List<Object> rebuildRuns(List<?> runs) {
        List<Object> out = new ArrayList<>();
        for (Object r : runs) {
            Map<?, ?> run = (Map<?, ?>) r;
            Map<String, Object> clean = new LinkedHashMap<>();
            clean.put("text", run.get("text"));
            for (String k : List.of("bold", "italic", "href")) if (run.containsKey(k)) clean.put(k, run.get(k));
            out.add(clean);
        }
        return out;
    }

    private static boolean hasControl(String s) {
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) < 0x20 || s.charAt(i) == 0x7f) return true;
        return false;
    }

    private static void add(List<String> into, String message) {
        if (into.size() < MAX_PROBLEMS && !into.contains(message)) into.add(message);
    }
}
