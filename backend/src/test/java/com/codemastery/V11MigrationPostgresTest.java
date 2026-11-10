package com.codemastery;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/** Same V11 checks on a REAL PostgreSQL (pending production-readiness task P1). Skipped unless PG_TEST_URL is set; wipes the target DB. */
@EnabledIfEnvironmentVariable(named = "PG_TEST_URL", matches = ".+")
class V11MigrationPostgresTest {
    private static String url() { return System.getenv("PG_TEST_URL"); }
    private static String user() { return System.getenv().getOrDefault("PG_TEST_USER", "postgres"); }
    private static String password() { return System.getenv().getOrDefault("PG_TEST_PASSWORD", ""); }

    @Test
    void existingContentIsBackfilledAndConstraintsAreInForce() throws Exception {
        V11MigrationChecks.existingContentIsBackfilled(url(), user(), password());
    }

    @Test
    void freshDatabaseSeedContentHasCategoryAndStatus() throws Exception {
        V11MigrationChecks.freshDatabaseSeedContent(url(), user(), password());
    }
}
