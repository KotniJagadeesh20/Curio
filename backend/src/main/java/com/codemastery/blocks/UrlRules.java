package com.codemastery.blocks;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * The one URL rule for image/video links in page blocks (mirrored by src/lib/urlRules.ts; both are tested against
 * shared/url-vectors.json). Accepted: an absolute https URL with a real DNS host (no credentials, no IP literal, no
 * localhost), or a site-relative path that browsers cannot turn into another host. Everything else is refused.
 */
public final class UrlRules {
    private UrlRules() {}

    public static final int MAX_LENGTH = 2048;
    public static final String MESSAGE = "Use an https:// link (or a /path on this site).";

    private static final Pattern HOST = Pattern.compile(
            "^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+([a-z]{2,63}|xn--[a-z0-9-]{1,59})$", Pattern.CASE_INSENSITIVE);
    private static final Pattern AUTHORITY = Pattern.compile("^([^:/]+)(?::(\\d{1,5}))?$");
    /** "/x" but never "//x" or "/\x" (browsers read "\" as "/"), and no encoded separator right after the first slash. */
    private static final Pattern RELATIVE = Pattern.compile("^/(?![/\\\\])(?!%2f|%5c)[^\\\\]*$", Pattern.CASE_INSENSITIVE);

    /** An empty link is fine in a draft (nothing is rendered for it). */
    public static boolean isBlank(String url) { return url == null || url.isBlank(); }

    /** Null when the URL is acceptable (or blank), otherwise the message to show. */
    public static String problem(String url) {
        if (isBlank(url)) return null;
        if (url.length() > MAX_LENGTH) return "This link is too long.";
        for (int i = 0; i < url.length(); i++) {
            char c = url.charAt(i);
            if (c <= 0x20 || c >= 0x7f) return MESSAGE;      // spaces, control characters, non-ASCII (percent-encode those)
        }
        if (url.charAt(0) == '/') return RELATIVE.matcher(url).matches() ? null : MESSAGE;
        if (!url.regionMatches(true, 0, "https://", 0, 8) || url.indexOf('\\') >= 0) return MESSAGE;
        try {
            URI u = new URI(url);
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getRawUserInfo() != null || u.getRawAuthority() == null) return MESSAGE;
            Matcher a = AUTHORITY.matcher(u.getRawAuthority());
            if (!a.matches() || !HOST.matcher(a.group(1)).matches()) return MESSAGE;
            if (a.group(2) != null && Integer.parseInt(a.group(2)) > 65535) return MESSAGE;
            return null;
        } catch (URISyntaxException e) {
            return MESSAGE;
        }
    }

    public static boolean isSafe(String url) { return !isBlank(url) && problem(url) == null; }
}
