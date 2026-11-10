package com.codemastery.media;

/**
 * {@code If-None-Match} for GET (RFC 9110 section 13.1.2): the header is either {@code *} on its own or a comma-separated list of
 * entity-tags, each {@code [W/]"opaque"}. The comparison is the <b>weak</b> one: {@code W/"x"} matches {@code "x"}. A tag's opaque
 * part may contain commas (only a double quote ends it), so the header is tokenised by quotes, never split on commas. A malformed
 * header counts as no match (the caller answers 200 with the body, never 400).
 */
public final class EntityTags {
    private EntityTags() {}

    /** @param opaque the current tag's value WITHOUT quotes (for media: the variant's sha256) */
    public static boolean ifNoneMatchMatches(String header, String opaque) {
        if (header == null || opaque == null) return false;
        String h = header.strip();
        if (h.isEmpty()) return false;
        if (h.equals("*")) return true;
        boolean matched = false;
        int i = 0, n = h.length();
        while (true) {
            while (i < n && (h.charAt(i) == ' ' || h.charAt(i) == '\t')) i++;
            if (i >= n) return false;                       // a list needs at least one tag; trailing OWS after a tag is handled below
            if (h.startsWith("W/", i)) i += 2;
            if (i >= n || h.charAt(i) != '"') return false;  // unquoted or garbage: malformed
            int close = h.indexOf('"', i + 1);
            if (close < 0) return false;                     // unterminated quote
            if (h.substring(i + 1, close).equals(opaque)) matched = true;
            i = close + 1;
            while (i < n && (h.charAt(i) == ' ' || h.charAt(i) == '\t')) i++;
            if (i >= n) return matched;
            if (h.charAt(i) != ',') return false;           // two tags without a comma, or junk after a tag
            i++;
            while (i < n && (h.charAt(i) == ' ' || h.charAt(i) == '\t' || h.charAt(i) == ',')) i++;   // empty list elements are allowed
            if (i >= n) return matched;
        }
    }
}
