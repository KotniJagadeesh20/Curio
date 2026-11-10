package com.codemastery;

import static org.junit.jupiter.api.Assertions.*;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** V12 (lessons.version) on in-memory H2: existing pages get version 0, the column is NOT NULL, nothing else changes. */
class V12MigrationTest {
    @Test
    void existingPagesAreBackfilledWithVersionZeroAndTheirContentIsUntouched() throws Exception {
        String url = "jdbc:h2:mem:v12-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1";
        V9MigrationChecks.flyway(url, "sa", "", "11", true).migrate();
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement s = c.createStatement()) {
            s.execute("INSERT INTO tracks (slug, name, status) VALUES ('t', 'T', 'DRAFT')");
            s.execute("INSERT INTO sections (track_id, slug, title) SELECT id, 's', 'S' FROM tracks");
            s.execute("INSERT INTO lessons (section_id, slug, title, blocks, status, published) SELECT id, 'l', 'Keep', '[{\"type\":\"text\"}]', 'DRAFT', FALSE FROM sections");
            try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'lessons' AND column_name = 'version'")) {
                rs.next();
                assertEquals(0, rs.getInt(1), "no version column before V12");
            }
        }
        V9MigrationChecks.flyway(url, "sa", "", "latest", false).migrate();
        try (Connection c = DriverManager.getConnection(url, "sa", ""); Statement s = c.createStatement()) {
            try (ResultSet rs = s.executeQuery("SELECT version, title, blocks FROM lessons WHERE slug = 'l'")) {
                assertTrue(rs.next());
                assertEquals(0, rs.getInt("version"));
                assertEquals("Keep", rs.getString("title"));
                assertEquals("[{\"type\":\"text\"}]", rs.getString("blocks"));
            }
            try (ResultSet rs = s.executeQuery("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'lessons' AND column_name = 'version'")) {
                assertTrue(rs.next());
                assertEquals("NO", rs.getString(1));
            }
            // a new row without an explicit version also gets 0
            s.execute("INSERT INTO lessons (section_id, slug, title) SELECT id, 'l2', 'Two' FROM sections");
            try (ResultSet rs = s.executeQuery("SELECT version FROM lessons WHERE slug = 'l2'")) {
                rs.next();
                assertEquals(0, rs.getInt(1));
            }
        }
    }
}
