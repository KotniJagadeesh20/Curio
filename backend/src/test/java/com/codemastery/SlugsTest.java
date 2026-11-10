package com.codemastery;

import static org.junit.jupiter.api.Assertions.*;

import com.codemastery.collection.Slugs;
import java.util.Set;
import org.junit.jupiter.api.Test;

class SlugsTest {
    @Test
    void slugifyProducesValidSlugs() {
        assertEquals("java-core-basics", Slugs.slugify("Java: Core & Basics!"));
        assertEquals("cafe-creme", Slugs.slugify("  Café   Crème "));
        assertEquals("untitled", Slugs.slugify("???"));
        assertEquals("untitled", Slugs.slugify(null));
        String longTitle = "word ".repeat(40);
        String s = Slugs.slugify(longTitle);
        assertTrue(s.length() <= Slugs.MAX && s.matches("^[a-z0-9]+(-[a-z0-9]+)*$"), s);
    }

    @Test
    void uniqueAppendsACounterAndStaysWithinTheLimit() {
        assertEquals("intro", Slugs.unique("Intro", s -> false));
        assertEquals("intro-2", Slugs.unique("Intro", Set.of("intro")::contains));
        assertEquals("intro-3", Slugs.unique("Intro", Set.of("intro", "intro-2")::contains));
        String base = Slugs.slugify("x".repeat(80));
        String u = Slugs.unique("x".repeat(80), Set.of(base)::contains);
        assertTrue(u.length() <= Slugs.MAX && u.endsWith("-2"), u);
    }
}
