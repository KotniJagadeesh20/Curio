package com.codemastery.media;

import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.scheduling.annotation.EnableScheduling;

@Configuration
@EnableConfigurationProperties(MediaProperties.class)
@EnableScheduling
class MediaConfig {
    private static final Logger log = LoggerFactory.getLogger(MediaConfig.class);

    /** Profiles that count as production: local disk is refused under any of them. */
    static final Profiles PRODUCTION = Profiles.of("prod", "production");

    @Bean
    MediaStorage mediaStorage(MediaProperties props, Environment env) {
        return create(props, env.acceptsProfiles(PRODUCTION));
    }

    /**
     * The only place a backend is chosen. There is no fallback: an unknown or blank value, local disk in production, and an S3
     * backend without a bucket (or with an unreachable one) all stop the application from starting.
     */
    static MediaStorage create(MediaProperties props, boolean production) {
        String kind = props.storage();
        if ("local".equals(kind)) {
            if (production) {
                throw new IllegalStateException("media.storage=local is not allowed in a production profile (prod/production): local disk is lost on "
                        + "ephemeral hosting and is single-instance only. Set media.storage=s3 (MEDIA_STORAGE=s3) and the media.s3.* settings.");
            }
            return new LocalDiskMediaStorage(Path.of(props.local().root()));
        }
        if ("s3".equals(kind)) {
            MediaProperties.S3 s3 = props.s3();
            if (s3.bucket() == null || s3.bucket().isBlank()) throw new IllegalStateException("media.storage=s3 requires media.s3.bucket (MEDIA_S3_BUCKET)");
            S3MediaStorage storage = S3MediaStorage.create(s3);
            try {
                storage.verifyBucket();
            } catch (RuntimeException e) {
                storage.close();
                throw e;
            }
            log.info("Media storage: S3 bucket '{}'{} (single-instance: LiveUploads and the sweeper are per process)", s3.bucket(),
                    s3.endpoint() == null || s3.endpoint().isBlank() ? "" : " at " + s3.endpoint());
            return storage;
        }
        throw new IllegalStateException("media.storage must be 'local' or 's3', got '" + kind + "'");
    }

    @Bean
    DecodeBudget decodeBudget(MediaProperties props) {
        return DecodeBudget.of(props, Runtime.getRuntime().maxMemory());
    }
}
