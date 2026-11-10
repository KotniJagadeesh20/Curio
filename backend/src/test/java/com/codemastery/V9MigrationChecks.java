package com.codemastery;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;
import org.flywaydb.core.Flyway;

/** The V9 assertions, shared by the H2 test and the real-PostgreSQL test. */
final class V9MigrationChecks {
    private V9MigrationChecks() {}

    static Flyway flyway(String url, String user, String password, String target, boolean cleanFirst) {
        Flyway f = Flyway.configure()
                .dataSource(url, user, password)
                .locations("classpath:db/migration")
                .placeholderReplacement(false)
                .cleanDisabled(false)
                .target(target)
                .load();
        if (cleanFirst) f.clean();
        return f;
    }

    /**
     * Migrates an empty database to V8, inserts "pre-existing" users, migrates to the latest
     * version and checks the backfill. Leaves the database at the latest version (callers may
     * boot the app on it afterwards).
     */
    static void backfillForExistingUsers(String url, String user, String password) throws Exception {
        flyway(url, user, password, "8", true).migrate();

        // email -> {name, role}; insertion order = id order
        Map<String, String[]> existing = new LinkedHashMap<>();
        existing.put("admin@codemastery.local", new String[]{"Admin", "ADMIN"});
        existing.put("admin@other.com", new String[]{"Impostor", "USER"});      // reserved for non-admins
        existing.put("Sam.Smith+x@example.com", new String[]{"Sam", "USER"});
        existing.put("123@x.com", new String[]{"Numeric", "USER"});
        existing.put("a@x.com", new String[]{"Short", "USER"});
        existing.put("dup@a.com", new String[]{"Dup One", "USER"});
        existing.put("dup@b.com", new String[]{"Dup Two", "USER"});
        existing.put("root@x.com", new String[]{"Root", "USER"});

        try (Connection c = DriverManager.getConnection(url, user, password); Statement s = c.createStatement()) {
            for (var e : existing.entrySet()) {
                s.execute("INSERT INTO users (email, name, password_hash, role) VALUES ('" + e.getKey() + "', '"
                        + e.getValue()[0] + "', 'x', '" + e.getValue()[1] + "')");
            }
        }

        flyway(url, user, password, "latest", false).migrate();

        Map<String, String> usernames = new LinkedHashMap<>();
        try (Connection c = DriverManager.getConnection(url, user, password); Statement s = c.createStatement()) {
            try (ResultSet rs = s.executeQuery(
                    "SELECT u.email, u.username, u.status, u.protected_account, p.display_name, p.visibility, p.social_links "
                            + "FROM users u JOIN user_profiles p ON p.user_id = u.id ORDER BY u.id")) {
                while (rs.next()) {
                    usernames.put(rs.getString(1), rs.getString(2));
                    assertEquals("ACTIVE", rs.getString(3));
                    assertFalse(rs.getBoolean(4), "the flag is set by AdminSeeder at startup, not the migration");
                    assertEquals(existing.get(rs.getString(1))[0], rs.getString(5), "display name = old name");
                    assertEquals("PUBLIC", rs.getString(6));
                    assertEquals("{}", rs.getString(7));
                }
            }
            try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM users")) {
                rs.next();
                assertEquals(existing.size(), rs.getInt(1));
            }
            try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM user_profiles")) {
                rs.next();
                assertEquals(existing.size(), rs.getInt(1), "every user has exactly one profile");
            }
        }

        assertEquals("admin", usernames.get("admin@codemastery.local"));     // admins may keep reserved handles
        assertEquals("admin1", usernames.get("admin@other.com"));
        assertEquals("sam_smith_x", usernames.get("Sam.Smith+x@example.com"));
        assertEquals("u123", usernames.get("123@x.com"));
        assertEquals("a00", usernames.get("a@x.com"));
        assertEquals("dup", usernames.get("dup@a.com"));
        assertEquals("dup1", usernames.get("dup@b.com"));
        assertEquals("root1", usernames.get("root@x.com"));
        assertEquals(usernames.size(), usernames.values().stream().distinct().count(), "all unique");
    }

    /** Migrates an empty database straight to the latest version and checks the constraints. */
    static void freshDatabaseConstraints(String url, String user, String password) throws Exception {
        flyway(url, user, password, "latest", true).migrate();
        try (Connection c = DriverManager.getConnection(url, user, password); Statement s = c.createStatement()) {
            s.execute("INSERT INTO users (email, name, password_hash, username) VALUES ('a@x.com','A','x','same_name')");
            assertThrows(SQLException.class, () -> s.execute(
                    "INSERT INTO users (email, name, password_hash, username) VALUES ('b@x.com','B','x','same_name')"));
            assertThrows(SQLException.class, () -> s.execute(
                    "INSERT INTO users (email, name, password_hash) VALUES ('c@x.com','C','x')"));
            // profile rows go away with their user
            s.execute("INSERT INTO user_profiles (user_id, display_name) SELECT id, name FROM users WHERE email='a@x.com'");
            s.execute("DELETE FROM users WHERE email='a@x.com'");
            try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM user_profiles")) {
                rs.next();
                assertEquals(0, rs.getInt(1), "ON DELETE CASCADE");
            }
        }
    }
}
