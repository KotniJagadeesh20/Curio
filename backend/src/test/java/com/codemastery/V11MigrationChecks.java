package com.codemastery;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

/** The V11 assertions, shared by the H2 test and the (opt-in) real-PostgreSQL test. */
final class V11MigrationChecks {
    private V11MigrationChecks() {}

    private static String one(Statement s, String sql) throws SQLException {
        try (ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next(), sql);
            return rs.getString(1);
        }
    }

    private static boolean fails(Statement s, String sql) {
        try {
            s.execute(sql);
            return false;
        } catch (SQLException e) {
            return true;
        }
    }

    /** A database at V10 with published and draft content, migrated to the latest version. */
    static void existingContentIsBackfilled(String url, String user, String password) throws Exception {
        V9MigrationChecks.flyway(url, user, password, "10", true).migrate();
        try (Connection c = DriverManager.getConnection(url, user, password); Statement s = c.createStatement()) {
            s.execute("INSERT INTO users (email, name, password_hash, role, username) VALUES ('a@x.com','A','x','USER','user_a')");
            s.execute("INSERT INTO users (email, name, password_hash, role, username) VALUES ('b@x.com','B','x','USER','user_b')");
            s.execute("INSERT INTO user_profiles (user_id, display_name) SELECT id, name FROM users");
            s.execute("INSERT INTO tracks (slug, name, published) VALUES ('live', 'Live', TRUE)");
            s.execute("INSERT INTO tracks (slug, name, published) VALUES ('wip', 'WIP', FALSE)");
            s.execute("INSERT INTO sections (track_id, slug, title) SELECT id, 'intro', 'Intro' FROM tracks WHERE slug = 'live'");
            s.execute("INSERT INTO lessons (section_id, slug, title, published) SELECT id, 'one', 'One', TRUE FROM sections");
            s.execute("INSERT INTO lessons (section_id, slug, title, published) SELECT id, 'two', 'Two', FALSE FROM sections");
        }

        V9MigrationChecks.flyway(url, user, password, "latest", false).migrate();

        try (Connection c = DriverManager.getConnection(url, user, password); Statement s = c.createStatement()) {
            assertEquals("PUBLISHED", one(s, "SELECT status FROM tracks WHERE slug = 'live'"));
            assertEquals("DRAFT", one(s, "SELECT status FROM tracks WHERE slug = 'wip'"));
            assertEquals("PUBLISHED", one(s, "SELECT status FROM lessons WHERE slug = 'one'"));
            assertEquals("DRAFT", one(s, "SELECT status FROM lessons WHERE slug = 'two'"));
            assertEquals("0", one(s, "SELECT COUNT(*) FROM tracks WHERE moderation_status <> 'OK' OR deleted_at IS NOT NULL"));
            assertEquals("0", one(s, "SELECT COUNT(*) FROM tracks WHERE category_id IS NULL"), "all existing content has a category");
            assertEquals("0", one(s, "SELECT COUNT(*) FROM tracks t JOIN categories g ON g.id = t.category_id WHERE g.slug <> 'programming'"));
            assertEquals(one(s, "SELECT COUNT(*) FROM tracks"), one(s, "SELECT COUNT(*) FROM tracks WHERE owner_id IS NULL"),
                    "ownerless until AdminSeeder runs at startup (nullable by design)");

            // UNIQUE(slug) is gone, UNIQUE(owner_id, slug) is in force
            long a = Long.parseLong(one(s, "SELECT id FROM users WHERE username = 'user_a'"));
            long b = Long.parseLong(one(s, "SELECT id FROM users WHERE username = 'user_b'"));
            s.execute("UPDATE tracks SET owner_id = " + a + " WHERE slug = 'live'");
            assertFalse(fails(s, "INSERT INTO tracks (slug, name, owner_id) VALUES ('live', 'Same slug, other owner', " + b + ")"),
                    "slugs are unique per owner, not globally");
            assertTrue(fails(s, "INSERT INTO tracks (slug, name, owner_id) VALUES ('live', 'Same slug, same owner', " + a + ")"),
                    "same owner + same slug is still rejected");

            // the lookup dropped only the single-column slug constraint: every other UNIQUE still holds
            assertTrue(fails(s, "INSERT INTO sections (track_id, slug, title) SELECT id, 'intro', 'Dup' FROM tracks WHERE slug = 'live'"),
                    "sections keep UNIQUE(track_id, slug)");
            assertTrue(fails(s, "INSERT INTO users (email, name, password_hash, role, username) VALUES ('a@x.com','Dup','x','USER','dup_user')"),
                    "users keep UNIQUE(email)");
            assertTrue(fails(s, "INSERT INTO users (email, name, password_hash, role, username) VALUES ('c@x.com','Dup','x','USER','user_a')"),
                    "users keep UNIQUE(username)");
            assertTrue(fails(s, "INSERT INTO categories (slug, name) VALUES ('programming', 'Dup')"), "categories keep UNIQUE(slug)");
            assertTrue(fails(s, "INSERT INTO problems (slug, title, difficulty) SELECT slug, 'x', 'easy' FROM problems LIMIT 1"),
                    "problems keep UNIQUE(slug) (the seed has problems)");

            // FKs are RESTRICT: a used category and an owning user can't be deleted
            assertTrue(fails(s, "DELETE FROM categories WHERE slug = 'programming'"));
            assertTrue(fails(s, "DELETE FROM users WHERE id = " + a));

            // featured_collection_id now has a real FK, and SET NULL when the collection goes
            assertTrue(fails(s, "UPDATE user_profiles SET featured_collection_id = 999999 WHERE user_id = " + a));
            long live = Long.parseLong(one(s, "SELECT id FROM tracks WHERE slug = 'live'"));
            s.execute("UPDATE user_profiles SET featured_collection_id = " + live + " WHERE user_id = " + a);
            s.execute("DELETE FROM lessons WHERE section_id IN (SELECT id FROM sections WHERE track_id = " + live + ")");
            s.execute("DELETE FROM sections WHERE track_id = " + live);
            s.execute("DELETE FROM tracks WHERE id = " + live);
            assertNull(one(s, "SELECT featured_collection_id FROM user_profiles WHERE user_id = " + a));
        }
    }

    /** Fresh database: all migrations apply, and the seeded content already carries category + status. */
    static void freshDatabaseSeedContent(String url, String user, String password) throws Exception {
        V9MigrationChecks.flyway(url, user, password, "latest", true).migrate();
        try (Connection c = DriverManager.getConnection(url, user, password); Statement s = c.createStatement()) {
            assertEquals("0", one(s, "SELECT COUNT(*) FROM tracks WHERE category_id IS NULL"));
            assertEquals("0", one(s, "SELECT COUNT(*) FROM tracks WHERE status <> 'PUBLISHED'"));
            assertEquals("0", one(s, "SELECT COUNT(*) FROM lessons WHERE status <> CASE WHEN published THEN 'PUBLISHED' ELSE 'DRAFT' END"));
        }
    }
}
