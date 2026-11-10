package com.codemastery.media;

import static org.junit.jupiter.api.Assertions.*;

import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.util.unit.DataSize;

/** Backend selection and the production guard: no path may end in local disk unless local disk was asked for outside production. */
class MediaConfigTest {
    @TempDir Path root;

    private MediaProperties props(String storage, MediaProperties.S3 s3) {
        return new MediaProperties(storage, new MediaProperties.Local(root.toString()), DataSize.ofMegabytes(5), 25_000_000L, 20_000, DataSize.ofMegabytes(200), 500,
                256, 4, java.time.Duration.ofSeconds(10), java.time.Duration.ofMinutes(30), java.time.Duration.ofMinutes(10), true, 2560, 640, 85,
                java.time.Duration.ofSeconds(60), s3);
    }

    private static MediaProperties.S3 s3(String bucket, String endpoint) {
        return new MediaProperties.S3(bucket, "us-east-1", endpoint, true, "k", "s", "", DataSize.ofMegabytes(32));
    }

    @Test
    void localIsAllowedOutsideProductionAndRefusedInIt() {
        assertInstanceOf(LocalDiskMediaStorage.class, MediaConfig.create(props("local", s3(null, null)), false));
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> MediaConfig.create(props("local", s3(null, null)), true));
        assertTrue(e.getMessage().contains("not allowed in a production profile"));
    }

    @Test
    void unknownOrBlankStorageNeverFallsBackToTheDisk() {
        for (String bad : new String[] {"", " ", "S3", "Local", "s3 ", "gcs", "none"}) {
            assertThrows(IllegalStateException.class, () -> MediaConfig.create(props(bad, s3("b", null)), false), "storage='" + bad + "'");
            assertThrows(IllegalStateException.class, () -> MediaConfig.create(props(bad, s3("b", null)), true), "storage='" + bad + "' in production");
        }
    }

    @Test
    void s3WithoutABucketFailsAtStartup() {
        assertThrows(IllegalStateException.class, () -> MediaConfig.create(props("s3", s3(null, null)), true));
        assertThrows(IllegalStateException.class, () -> MediaConfig.create(props("s3", s3("  ", null)), false));
    }

    @Test
    void s3WithAnUnreachableBucketFailsAtStartupRatherThanAtTheFirstUpload() {
        IllegalStateException e = assertThrows(IllegalStateException.class, () -> MediaConfig.create(props("s3", s3("b", "http://127.0.0.1:1")), true));
        assertTrue(e.getMessage().contains("not reachable"));
    }

    @Test
    void s3WithAReachableBucketStartsEvenInProduction() throws Exception {
        try (FakeS3Server server = new FakeS3Server()) {
            MediaStorage s = MediaConfig.create(props("s3", s3("b", server.endpoint())), true);
            assertInstanceOf(S3MediaStorage.class, s);
            ((S3MediaStorage) s).close();
        }
    }

    // ---- the real property binding and profile detection ----

    private ApplicationContextRunner runner(String... props) {
        return new ApplicationContextRunner().withUserConfiguration(MediaConfig.class)
                .withPropertyValues("media.local.root=" + root, "media.max-request-bytes=6MB").withPropertyValues(props);
    }

    @Test
    void theDefaultConfigurationUnderAProductionProfileDoesNotStart() {
        for (String profile : new String[] {"prod", "production"}) {
            runner().withInitializer(c -> c.getEnvironment().setActiveProfiles(profile)).run(ctx -> {
                assertNotNull(ctx.getStartupFailure(), "profile " + profile);
                assertTrue(rootCauseMessage(ctx.getStartupFailure()).contains("not allowed in a production profile"));
            });
        }
    }

    @Test
    void theDefaultConfigurationWithoutAProductionProfileUsesLocalDisk() {
        runner().run(ctx -> assertInstanceOf(LocalDiskMediaStorage.class, ctx.getBean(MediaStorage.class)));
        runner().withInitializer(c -> c.getEnvironment().setActiveProfiles("h2")).run(ctx -> assertInstanceOf(LocalDiskMediaStorage.class, ctx.getBean(MediaStorage.class)));
    }

    @Test
    void s3PropertiesBindFromConfigurationAndAProductionProfileStarts() throws Exception {
        try (FakeS3Server server = new FakeS3Server()) {
            runner("media.storage=s3", "media.s3.bucket=b", "media.s3.endpoint=" + server.endpoint(), "media.s3.path-style=true", "media.s3.access-key=k",
                    "media.s3.secret-key=s", "media.s3.key-prefix=env1/").withInitializer(c -> c.getEnvironment().setActiveProfiles("prod")).run(ctx -> {
                assertNull(ctx.getStartupFailure());
                MediaStorage s = ctx.getBean(MediaStorage.class);
                assertInstanceOf(S3MediaStorage.class, s);
                s.put("media/a/original.jpg", new byte[] {1, 2}, "image/jpeg");
                assertTrue(server.objects.containsKey("b/env1/media/a/original.jpg"), "prefix and path-style came from the properties");
            });
        }
    }

    @Test
    void anUnknownStorageValueFailsTheContext() {
        runner("media.storage=bogus").run(ctx -> assertNotNull(ctx.getStartupFailure()));
        runner("media.storage=").run(ctx -> assertNotNull(ctx.getStartupFailure()));
    }

    @Test
    void inconsistentS3SettingsAreRefusedWhenTheyAreBound() {
        assertThrows(IllegalArgumentException.class, () -> new MediaProperties.S3("b", "us-east-1", null, false, "only-a-key", null, "", DataSize.ofMegabytes(32)));
        assertThrows(IllegalArgumentException.class, () -> new MediaProperties.S3("b", "us-east-1", null, false, null, null, "/abs", DataSize.ofMegabytes(32)));
        assertThrows(IllegalArgumentException.class, () -> new MediaProperties.S3("b", "us-east-1", null, false, null, null, "a/../b", DataSize.ofMegabytes(32)));
        assertThrows(IllegalArgumentException.class, () -> props("local", new MediaProperties.S3("b", "us-east-1", null, false, null, null, "", DataSize.ofMegabytes(1))),
                "max-object-size below max-bytes");
    }

    private static String rootCauseMessage(Throwable t) {
        while (t.getCause() != null) t = t.getCause();
        return String.valueOf(t.getMessage());
    }
}
