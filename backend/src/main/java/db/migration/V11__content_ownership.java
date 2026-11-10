package db.migration;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Ownership, category, status and soft-delete columns on the existing content tables (tracks = collections,
 * lessons = pages). A Java migration only because V1 created {@code UNIQUE(slug)} without a name, and the
 * generated name differs between PostgreSQL ({@code tracks_slug_key}) and H2, so it has to be looked up in
 * {@code information_schema} (standard on both) before it can be dropped. All DDL is plain portable SQL.
 *
 * <p>{@code owner_id} stays nullable: the admin user doesn't exist yet when migrations run on a fresh database.
 * {@code AdminSeeder} assigns every {@code owner_id IS NULL} track to the seeded admin at startup.
 * The legacy {@code published} columns are kept; the entities keep them in sync with {@code status}.
 */
public class V11__content_ownership extends BaseJavaMigration {

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        try (Statement s = c.createStatement()) {
            s.execute("ALTER TABLE tracks ADD COLUMN owner_id BIGINT REFERENCES users(id) ON DELETE RESTRICT");
            s.execute("ALTER TABLE tracks ADD COLUMN category_id BIGINT REFERENCES categories(id) ON DELETE RESTRICT");
            s.execute("ALTER TABLE tracks ADD COLUMN cover_url VARCHAR(500)");
            s.execute("ALTER TABLE tracks ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'");
            s.execute("ALTER TABLE tracks ADD COLUMN moderation_status VARCHAR(20) NOT NULL DEFAULT 'OK'");
            s.execute("ALTER TABLE tracks ADD COLUMN deleted_at TIMESTAMP WITH TIME ZONE");
            s.execute("ALTER TABLE lessons ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'");

            // Backfill: published flag -> status; existing content goes under the Programming category.
            s.execute("UPDATE tracks SET status = CASE WHEN published THEN 'PUBLISHED' ELSE 'DRAFT' END");
            s.execute("UPDATE lessons SET status = CASE WHEN published THEN 'PUBLISHED' ELSE 'DRAFT' END");
            s.execute("UPDATE tracks SET category_id = (SELECT id FROM categories WHERE slug = 'programming')");

            // Slugs become unique per owner instead of globally.
            for (String constraint : globalSlugUniqueConstraints(c)) {
                // quoted exactly as the catalog reports it (H2 upper-cases generated names, PostgreSQL lower-cases them)
                s.execute("ALTER TABLE tracks DROP CONSTRAINT \"" + constraint.replace("\"", "\"\"") + "\"");
            }
            s.execute("ALTER TABLE tracks ADD CONSTRAINT uq_tracks_owner_slug UNIQUE (owner_id, slug)");

            s.execute("CREATE INDEX idx_tracks_owner ON tracks(owner_id)");
            s.execute("CREATE INDEX idx_tracks_category ON tracks(category_id)");

            // user_profiles.featured_collection_id was created in V9 without its FK (the target didn't exist yet).
            s.execute("ALTER TABLE user_profiles ADD CONSTRAINT fk_profiles_featured_collection "
                    + "FOREIGN KEY (featured_collection_id) REFERENCES tracks(id) ON DELETE SET NULL");
        }
    }

    /** Names of UNIQUE constraints on tracks that cover exactly the one column {@code slug}. */
    private static List<String> globalSlugUniqueConstraints(Connection c) throws Exception {
        String sql = """
            SELECT tc.constraint_name
            FROM information_schema.table_constraints tc
            WHERE lower(tc.table_name) = 'tracks' AND tc.constraint_type = 'UNIQUE'
              AND (SELECT count(*) FROM information_schema.key_column_usage k
                   WHERE k.constraint_name = tc.constraint_name AND k.table_name = tc.table_name
                     AND k.table_schema = tc.table_schema) = 1
              AND EXISTS (SELECT 1 FROM information_schema.key_column_usage k
                          WHERE k.constraint_name = tc.constraint_name AND k.table_name = tc.table_name
                            AND k.table_schema = tc.table_schema AND lower(k.column_name) = 'slug')
              AND tc.table_schema = (SELECT current_schema())
            """;
        List<String> names = new ArrayList<>();
        try (PreparedStatement ps = c.prepareStatement(sql); ResultSet rs = ps.executeQuery()) {
            while (rs.next()) names.add(rs.getString(1));
        }
        if (names.isEmpty()) {
            throw new IllegalStateException("Could not find the UNIQUE(slug) constraint on tracks");
        }
        return names;
    }
}
