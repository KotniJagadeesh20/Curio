package com.codemastery;

import java.util.UUID;
import org.junit.jupiter.api.Test;

/** V9 on in-memory H2 (each test uses its own database). Real PostgreSQL: see V9MigrationPostgresTest. */
class V9MigrationTest {
    private static String h2Url(String name) {
        return "jdbc:h2:mem:" + name + "-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1";
    }

    @Test
    void backfillsUsernamesAndProfilesForExistingUsers() throws Exception {
        V9MigrationChecks.backfillForExistingUsers(h2Url("v9"), "sa", "");
    }

    @Test
    void usernameColumnIsNotNullAndUnique() throws Exception {
        V9MigrationChecks.freshDatabaseConstraints(h2Url("v9b"), "sa", "");
    }
}
