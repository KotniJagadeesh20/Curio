package com.codemastery.collection;

import java.text.Normalizer;
import java.util.function.Predicate;

/** Slug derivation for creator content. Slugs are at most 60 chars so the soft-delete suffix still fits VARCHAR(80). */
public final class Slugs {
    public static final int MAX = 60;
    private Slugs() {}

    /** "Java: Core & Basics!" -> "java-core-basics"; never empty ("untitled"). */
    public static String slugify(String title) {
        String s = Normalizer.normalize(title == null ? "" : title, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase()
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("^-+|-+$", "");
        if (s.length() > MAX) s = s.substring(0, MAX).replaceAll("-+$", "");
        return s.isEmpty() ? "untitled" : s;
    }

    /** First free of base, base-2, base-3 ... (the suffix is made to fit within MAX). */
    public static String unique(String title, Predicate<String> taken) {
        String base = slugify(title);
        if (!taken.test(base)) return base;
        for (int i = 2; i < 10_000; i++) {
            String suffix = "-" + i;
            String candidate = (base.length() + suffix.length() > MAX ? base.substring(0, MAX - suffix.length()) : base) + suffix;
            if (!taken.test(candidate)) return candidate;
        }
        throw new IllegalStateException("No free slug for " + title);
    }
}
