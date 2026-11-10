package com.codemastery;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

/**
 * Runs the same V9 checks against a REAL PostgreSQL. Skipped unless PG_TEST_URL is set.
 * WARNING: the target database is wiped (Flyway clean) at the start of each test, so point it at a
 * throwaway database. Example:
 *   docker run -d --rm -e POSTGRES_USER=verify -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16
 *   PG_TEST_URL=jdbc:postgresql://localhost:55432/v8db PG_TEST_USER=verify PG_TEST_PASSWORD=pw mvn test
 */
@EnabledIfEnvironmentVariable(named = "PG_TEST_URL", matches = ".+")
class V9MigrationPostgresTest {
    private static String url() { return System.getenv("PG_TEST_URL"); }
    private static String user() { return System.getenv().getOrDefault("PG_TEST_USER", "postgres"); }
    private static String password() { return System.getenv().getOrDefault("PG_TEST_PASSWORD", ""); }

    @Test
    void existingV8DatabaseWithUsersMigratesCleanly() throws Exception {
        V9MigrationChecks.backfillForExistingUsers(url(), user(), password());
    }

    @Test
    void freshDatabaseMigratesAndEnforcesConstraints() throws Exception {
        V9MigrationChecks.freshDatabaseConstraints(url(), user(), password());
    }
}
