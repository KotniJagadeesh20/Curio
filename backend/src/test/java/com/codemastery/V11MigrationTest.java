package com.codemastery;

import java.util.UUID;
import org.junit.jupiter.api.Test;

/** V11 on in-memory H2. Real PostgreSQL: V11MigrationPostgresTest (skipped without PG_TEST_URL). */
class V11MigrationTest {
    private static String h2Url(String name) {
        return "jdbc:h2:mem:" + name + "-" + UUID.randomUUID()
                + ";MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DEFAULT_NULL_ORDERING=HIGH;DB_CLOSE_DELAY=-1";
    }

    @Test
    void existingContentIsBackfilledAndConstraintsAreInForce() throws Exception {
        V11MigrationChecks.existingContentIsBackfilled(h2Url("v11"), "sa", "");
    }

    @Test
    void freshDatabaseSeedContentHasCategoryAndStatus() throws Exception {
        V11MigrationChecks.freshDatabaseSeedContent(h2Url("v11b"), "sa", "");
    }
}
