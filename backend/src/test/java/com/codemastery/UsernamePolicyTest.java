package com.codemastery;

import static org.junit.jupiter.api.Assertions.*;

import com.codemastery.user.UsernamePolicy;
import java.util.Set;
import org.junit.jupiter.api.Test;

class UsernamePolicyTest {

    @Test
    void formatRules() {
        assertTrue(UsernamePolicy.isValidFormat("jagadeesh"));
        assertTrue(UsernamePolicy.isValidFormat("a_b9"));
        assertFalse(UsernamePolicy.isValidFormat("ab"));                 // too short
        assertFalse(UsernamePolicy.isValidFormat("a".repeat(31)));       // too long
        assertFalse(UsernamePolicy.isValidFormat("9lives"));             // must start with a letter
        assertFalse(UsernamePolicy.isValidFormat("_x_"));
        assertFalse(UsernamePolicy.isValidFormat("has-dash"));
        assertFalse(UsernamePolicy.isValidFormat("Upper"));              // callers normalize first
        assertFalse(UsernamePolicy.isValidFormat("sp ace"));
    }

    @Test
    void normalizeLowercasesAndTrims() {
        assertEquals("jagadeesh", UsernamePolicy.normalize("  JagaDeesh "));
    }

    @Test
    void reservedNamesIncludeTheRequiredOnes() {
        for (String n : new String[]{"admin", "root", "system", "moderator", "official", "null", "undefined",
                "api", "discover", "create", "settings", "login", "signup", "me"}) {
            assertTrue(UsernamePolicy.isReserved(n), n);
        }
        assertFalse(UsernamePolicy.isReserved("jagadeesh"));
    }

    @Test
    void deriveSanitizesAndPads() {
        assertEquals("sam_smith_x", UsernamePolicy.derive("Sam.Smith+x@example.com", s -> false, false));
        assertEquals("u123", UsernamePolicy.derive("123@x.com", s -> false, false));
        assertEquals("a00", UsernamePolicy.derive("a@x.com", s -> false, false));
        assertEquals("u_0", UsernamePolicy.derive("_@x.com", s -> false, false));
        assertEquals("u00", UsernamePolicy.derive("@x.com", s -> false, false)); // empty local part
    }

    @Test
    void deriveAvoidsReservedAndTakenNames() {
        assertEquals("admin1", UsernamePolicy.derive("admin@x.com", s -> false, false));
        assertEquals("admin", UsernamePolicy.derive("admin@x.com", s -> false, true));   // seeded admin
        Set<String> taken = Set.of("dup", "dup1");
        assertEquals("dup2", UsernamePolicy.derive("dup@x.com", taken::contains, false));
    }

    @Test
    void deriveNeverExceedsMaxLength() {
        String longLocal = "x".repeat(60) + "@x.com";
        String u = UsernamePolicy.derive(longLocal, s -> s.length() > 0 && !s.endsWith("7"), false);
        assertTrue(UsernamePolicy.isValidFormat(u), u);
    }
}
