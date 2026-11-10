package db.migration;

import com.codemastery.user.UsernamePolicy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.flywaydb.core.api.migration.BaseJavaMigration;
import org.flywaydb.core.api.migration.Context;

/**
 * Adds usernames, account status and creator profiles.
 * A Java migration (not SQL) because backfilling usernames needs sanitising, de-duplication and
 * reserved-name handling, which is {@link UsernamePolicy}. Plain JDBC DDL, so it runs on
 * PostgreSQL and H2 alike.
 */
public class V9__user_profiles_and_usernames extends BaseJavaMigration {

    private record Row(long id, String email, String name, boolean admin) {}

    @Override
    public void migrate(Context context) throws Exception {
        Connection c = context.getConnection();
        try (Statement s = c.createStatement()) {
            s.execute("ALTER TABLE users ADD COLUMN username VARCHAR(30)");
            s.execute("ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'");
            s.execute("ALTER TABLE users ADD COLUMN protected_account BOOLEAN NOT NULL DEFAULT FALSE");
            s.execute("""
                CREATE TABLE user_profiles (
                    user_id                BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    display_name           VARCHAR(120) NOT NULL,
                    bio                    VARCHAR(500) NOT NULL DEFAULT '',
                    avatar_url             VARCHAR(500),
                    banner_url             VARCHAR(500),
                    social_links           TEXT NOT NULL DEFAULT '{}',
                    interests              TEXT NOT NULL DEFAULT '[]',
                    featured_collection_id BIGINT,
                    visibility             VARCHAR(20) NOT NULL DEFAULT 'PUBLIC',
                    updated_at             TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
                )""");
        }

        List<Row> rows = new ArrayList<>();
        try (Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT id, email, name, role FROM users ORDER BY id")) {
            while (rs.next()) {
                rows.add(new Row(rs.getLong(1), rs.getString(2), rs.getString(3), "ADMIN".equals(rs.getString(4))));
            }
        }

        Set<String> taken = new HashSet<>();
        try (PreparedStatement setUsername = c.prepareStatement("UPDATE users SET username = ? WHERE id = ?");
             PreparedStatement addProfile = c.prepareStatement(
                     "INSERT INTO user_profiles (user_id, display_name) VALUES (?, ?)")) {
            for (Row r : rows) {
                // Admins may keep a reserved handle (the seeded admin becomes "admin").
                String username = UsernamePolicy.derive(r.email(), taken::contains, r.admin());
                taken.add(username);
                setUsername.setString(1, username);
                setUsername.setLong(2, r.id());
                setUsername.executeUpdate();
                addProfile.setLong(1, r.id());
                addProfile.setString(2, r.name());
                addProfile.executeUpdate();
            }
        }

        try (Statement s = c.createStatement()) {
            s.execute("ALTER TABLE users ALTER COLUMN username SET NOT NULL");
            s.execute("ALTER TABLE users ADD CONSTRAINT uq_users_username UNIQUE (username)");
        }
    }
}
