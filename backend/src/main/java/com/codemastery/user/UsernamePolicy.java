package com.codemastery.user;

import java.util.Locale;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Pattern;

/**
 * The single source of truth for usernames. Used by signup, the V9 backfill and the seeded admin.
 * Usernames are stored lowercase and are immutable after signup, because they appear in public
 * URLs (/@username/...) that must not silently break.
 */
public final class UsernamePolicy {
    private static final Pattern FORMAT = Pattern.compile("^[a-z][a-z0-9_]{2,29}$");

    /** Names that would collide with routes, impersonate the platform, or are classic bug magnets. */
    private static final Set<String> RESERVED = Set.of(
            "admin", "administrator", "root", "system", "moderator", "mod", "moderation", "official",
            "staff", "team", "support", "help", "about", "null", "undefined", "anonymous",
            "api", "app", "auth", "www", "static", "assets", "docs", "status",
            "me", "user", "users", "public", "home", "search", "explore", "discover",
            "create", "settings", "login", "logout", "signin", "signup", "register",
            "dashboard", "profile", "profiles", "blog", "tracks", "track", "problem", "problems",
            "practice", "collection", "collections", "module", "modules", "page", "pages",
            "report", "reports", "terms", "privacy");

    public static final String FORMAT_HELP =
            "Username must be 3-30 characters: lowercase letters, digits or underscores, starting with a letter";

    private UsernamePolicy() {}

    public static String normalize(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
    }

    /** Expects an already normalized value. */
    public static boolean isValidFormat(String username) {
        return username != null && FORMAT.matcher(username).matches();
    }

    /** Expects an already normalized value. */
    public static boolean isReserved(String username) {
        return RESERVED.contains(username);
    }

    /**
     * Builds a valid, free username from an email address (used when signup doesn't supply one,
     * and by the V9 backfill). Appends a number until the result is free and not reserved.
     */
    public static String derive(String email, Predicate<String> taken, boolean allowReserved) {
        String e = email == null ? "" : email;
        int at = e.indexOf('@');
        String local = (at < 0 ? e : e.substring(0, at)).toLowerCase(Locale.ROOT);
        String base = local.replaceAll("[^a-z0-9_]", "_");
        if (base.isEmpty() || base.charAt(0) < 'a' || base.charAt(0) > 'z') base = "u" + base;
        if (base.length() > 24) base = base.substring(0, 24);   // leave room for a numeric suffix
        while (base.length() < 3) base += "0";

        String candidate = base;
        for (int i = 1; !acceptable(candidate, taken, allowReserved); i++) candidate = base + i;
        return candidate;
    }

    private static boolean acceptable(String c, Predicate<String> taken, boolean allowReserved) {
        return isValidFormat(c) && (allowReserved || !isReserved(c)) && !taken.test(c);
    }
}
