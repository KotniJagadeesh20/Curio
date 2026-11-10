package com.codemastery;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** V13 (media) on in-memory H2: purely additive, constraints hold, references protect assets. */
class V13MigrationTest {
    private static String freshUrl() {
        return "jdbc:h2:mem:v13-" + UUID.randomUUID() + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1";
    }

    private static long one(Statement s, String sql) throws SQLException {
        try (ResultSet rs = s.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private static void assertRejected(Statement s, String sql, String why) {
        assertThrows(SQLException.class, () -> s.execute(sql), why);
    }

    private static final String ASSET = "INSERT INTO media_assets (id, owner_id, status, content_type, width, height, size_bytes, sha256, thumb_width, thumb_height, thumb_size_bytes, thumb_sha256, storage_key, thumb_key) "
            + "SELECT '%s', id, '%s', '%s', 10, 10, 100, 'a', 10, 10, 50, 'b', 'media/k/original.jpg', 'media/k/thumb.jpg' FROM users WHERE email = 'admin@codemastery.local'";

    @Test
    void existingDataIsUntouchedAndTheNewSchemaEnforcesItsRules() throws Exception {
        String url = freshUrl();
        V9MigrationChecks.flyway(url, "sa", "", "12", true).migrate();
        long before;
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement s = c.createStatement()) {
            s.execute("INSERT INTO users (email, name, username, password_hash) VALUES ('admin@codemastery.local', 'A', 'adm', 'x')");
            s.execute("INSERT INTO tracks (slug, name, status) VALUES ('t', 'T', 'DRAFT')");
            s.execute("INSERT INTO sections (track_id, slug, title) SELECT id, 's', 'S' FROM tracks");
            s.execute("INSERT INTO lessons (section_id, slug, title, blocks) SELECT id, 'l', 'Keep', '[{\"type\":\"text\"}]' FROM sections");
            before = one(s, "SELECT COUNT(*) FROM lessons");
            assertEquals(0, one(s, "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'media_assets'"));
        }
        V9MigrationChecks.flyway(url, "sa", "", "latest", false).migrate();
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement s = c.createStatement()) {
            assertEquals(before, one(s, "SELECT COUNT(*) FROM lessons"));
            assertEquals("Keep", read(s, "SELECT title FROM lessons WHERE slug = 'l'"));
            assertEquals("[{\"type\":\"text\"}]", read(s, "SELECT blocks FROM lessons WHERE slug = 'l'"));
            assertNull(read(s, "SELECT cover_asset_id FROM tracks WHERE slug = 't'"), "existing collections have no asset cover");
            assertEquals("YES", read(s, "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'tracks' AND column_name = 'cover_asset_id'"));

            String id = UUID.randomUUID().toString();
            s.execute(String.format(ASSET, id, "READY", "image/jpeg"));
            assertEquals(0, one(s, "SELECT delete_attempts FROM media_assets"), "delete_attempts defaults to 0");
            assertNotNull(read(s, "SELECT created_at FROM media_assets"));
            assertEquals("NO", read(s, "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'media_assets' AND column_name = 'sha256'"));

            assertRejected(s, String.format(ASSET, UUID.randomUUID(), "BOGUS", "image/jpeg"), "unknown status");
            assertRejected(s, String.format(ASSET, UUID.randomUUID(), "READY", "image/svg+xml"), "only the canonical output types");
            assertRejected(s, String.format(ASSET, UUID.randomUUID(), "READY", "image/webp"), "webp is input only, never stored");
            assertRejected(s, "INSERT INTO media_assets (id, owner_id, status, content_type, width, height, size_bytes, sha256, thumb_width, thumb_height, thumb_size_bytes, thumb_sha256, storage_key, thumb_key) "
                    + "VALUES ('" + UUID.randomUUID() + "', 999999, 'READY', 'image/png', 1, 1, 1, 'a', 1, 1, 1, 'b', 'k', 't')", "owner must exist");
            assertRejected(s, "UPDATE media_assets SET size_bytes = 0", "sizes must be positive");

            // references: one row per asset-page pair, page delete cascades, an asset row can't be deleted while referenced
            s.execute("INSERT INTO media_references (asset_id, page_id) SELECT '" + id + "', id FROM lessons");
            assertRejected(s, "INSERT INTO media_references (asset_id, page_id) SELECT '" + id + "', id FROM lessons", "duplicate pair");
            assertRejected(s, "DELETE FROM media_assets", "referenced asset can't be deleted");
            s.execute("DELETE FROM lessons");
            assertEquals(0, one(s, "SELECT COUNT(*) FROM media_references"), "references go with their page");
            s.execute("DELETE FROM media_assets");

            // the canonical cover reference also protects the asset
            s.execute(String.format(ASSET, id, "READY", "image/png"));
            s.execute("UPDATE tracks SET cover_asset_id = '" + id + "'");
            assertRejected(s, "DELETE FROM media_assets", "an asset used as a cover can't be deleted");
            assertRejected(s, "UPDATE tracks SET cover_asset_id = '" + UUID.randomUUID() + "'", "cover must reference a real asset");
        }
    }

    private static String read(Statement s, String sql) throws SQLException {
        try (ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next());
            return rs.getString(1);
        }
    }

    @Test
    void aFreshDatabaseMigratesStraightToV13() throws Exception {
        String url = freshUrl();
        V9MigrationChecks.flyway(url, "sa", "", "latest", true).migrate();
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement s = c.createStatement()) {
            assertEquals(2, one(s, "SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('media_assets', 'media_references')"));
            assertEquals("13", read(s, "SELECT MAX(CAST(version AS INT)) FROM \"flyway_schema_history\" WHERE version IS NOT NULL"));
        }
    }
}
