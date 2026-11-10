package com.codemastery.media;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.util.unit.DataSize;

/** Every media limit is configuration (PLAN.md Step 12). Defaults are the approved ones. */
@ConfigurationProperties(prefix = "media")
public record MediaProperties(
        /** {@code local} or {@code s3}; any other value (including blank) fails at startup rather than silently using the disk. */
        @DefaultValue("local") String storage,
        @DefaultValue Local local,
        @DefaultValue("5MB") DataSize maxBytes,
        @DefaultValue("25000000") long maxPixels,
        @DefaultValue("20000") int maxSide,
        @DefaultValue("200MB") DataSize quotaBytes,
        @DefaultValue("500") int quotaAssets,
        @DefaultValue("256") int decodeBudgetMb,
        /** Uploads whose bytes may be in memory at once (reading and decoding); more wait, then get MEDIA_BUSY. */
        @DefaultValue("4") int maxConcurrentUploads,
        @DefaultValue("10s") Duration decodeWait,
        @DefaultValue("30m") Duration uploadTimeout,
        @DefaultValue("10m") Duration sweepInterval,
        @DefaultValue("true") boolean sweepEnabled,
        @DefaultValue("2560") int originalMaxEdge,
        @DefaultValue("640") int thumbMaxEdge,
        @DefaultValue("85") int jpegQuality,
        /** Browser/shared-cache lifetime of public media (no {@code immutable}: revocation can lag by up to this long). */
        @DefaultValue("60s") Duration publicMaxAge,
        /** S3-compatible storage settings (Step 12c); only read when {@code media.storage=s3}. */
        @DefaultValue S3 s3) {

    /** The pre-12c constructor (no S3 settings). */
    public MediaProperties(String storage, Local local, DataSize maxBytes, long maxPixels, int maxSide, DataSize quotaBytes, int quotaAssets,
                           int decodeBudgetMb, int maxConcurrentUploads, Duration decodeWait, Duration uploadTimeout, Duration sweepInterval,
                           boolean sweepEnabled, int originalMaxEdge, int thumbMaxEdge, int jpegQuality, Duration publicMaxAge) {
        this(storage, local, maxBytes, maxPixels, maxSide, quotaBytes, quotaAssets, decodeBudgetMb, maxConcurrentUploads, decodeWait,
                uploadTimeout, sweepInterval, sweepEnabled, originalMaxEdge, thumbMaxEdge, jpegQuality, publicMaxAge, new S3(null, "us-east-1", null, false, null, null, "", DataSize.ofMegabytes(32)));
    }

    /** The 12a constructor (before the public cache lifetime existed); keeps the default of 60 seconds. */
    public MediaProperties(String storage, Local local, DataSize maxBytes, long maxPixels, int maxSide, DataSize quotaBytes, int quotaAssets,
                           int decodeBudgetMb, int maxConcurrentUploads, Duration decodeWait, Duration uploadTimeout, Duration sweepInterval,
                           boolean sweepEnabled, int originalMaxEdge, int thumbMaxEdge, int jpegQuality) {
        this(storage, local, maxBytes, maxPixels, maxSide, quotaBytes, quotaAssets, decodeBudgetMb, maxConcurrentUploads, decodeWait,
                uploadTimeout, sweepInterval, sweepEnabled, originalMaxEdge, thumbMaxEdge, jpegQuality, Duration.ofSeconds(60));
    }

    /** MB of heap the upload input buffers can use at once: per upload the uploaded bytes plus ImageIO's cache of them, and a little slack. */
    public int inputBufferMb() {
        return (int) Math.min(Integer.MAX_VALUE, (long) maxConcurrentUploads * (2 * ((maxBytes.toBytes() + (1 << 20) - 1) >> 20) + 1));
    }

    public record Local(@DefaultValue("./data/media") String root) {}

    /**
     * @param bucket        required for {@code s3}; the bucket must already exist and must be private (the application never sets ACLs)
     * @param endpoint      optional override for MinIO, R2 and other S3-compatible stores; empty means AWS
     * @param pathStyle     path-style addressing ({@code host/bucket/key}); MinIO needs it, AWS does not
     * @param accessKey     optional static credentials for S3-compatible stores; leave both empty to use the default AWS credential chain
     * @param keyPrefix     optional prefix put in front of every object key (no leading slash)
     * @param maxObjectSize largest object {@code put} accepts. The stream is verified against its declared length in memory before anything
     *                      is sent (see {@link S3MediaStorage}), so this bounds heap per call; it must be at least {@code media.max-bytes}.
     */
    public record S3(String bucket, @DefaultValue("us-east-1") String region, String endpoint, @DefaultValue("false") boolean pathStyle,
                     String accessKey, String secretKey, @DefaultValue("") String keyPrefix, @DefaultValue("32MB") DataSize maxObjectSize) {
        public S3 {
            if ((accessKey == null || accessKey.isBlank()) != (secretKey == null || secretKey.isBlank())) {
                throw new IllegalArgumentException("media.s3.access-key and media.s3.secret-key must be set together or not at all");
            }
            if (keyPrefix != null && (keyPrefix.startsWith("/") || keyPrefix.contains("..") || keyPrefix.contains("//"))) {
                throw new IllegalArgumentException("media.s3.key-prefix must be relative, without '..' or '//'");
            }
            if (maxObjectSize == null || maxObjectSize.toBytes() < 1) throw new IllegalArgumentException("media.s3.max-object-size must be positive");
        }
    }

    @org.springframework.boot.context.properties.bind.ConstructorBinding
    public MediaProperties {
        if (maxBytes.toBytes() < 1) throw new IllegalArgumentException("media.max-bytes must be positive");
        if (maxPixels < 1 || maxSide < 1) throw new IllegalArgumentException("media.max-pixels and media.max-side must be positive");
        if (quotaBytes.toBytes() < 1 || quotaAssets < 1) throw new IllegalArgumentException("media quotas must be positive");
        if (maxConcurrentUploads < 1) throw new IllegalArgumentException("media.max-concurrent-uploads must be positive");
        if (decodeBudgetMb < 1) throw new IllegalArgumentException("media.decode-budget-mb must be positive");
        if (originalMaxEdge < thumbMaxEdge || thumbMaxEdge < 16) throw new IllegalArgumentException("media edge sizes are inconsistent");
        if (jpegQuality < 1 || jpegQuality > 100) throw new IllegalArgumentException("media.jpeg-quality must be 1-100");
        if (publicMaxAge == null || publicMaxAge.isNegative()) throw new IllegalArgumentException("media.public-max-age must not be negative");
        if (s3 == null) throw new IllegalArgumentException("media.s3 must not be null");
        if (s3.maxObjectSize().toBytes() < maxBytes.toBytes()) throw new IllegalArgumentException("media.s3.max-object-size must be at least media.max-bytes");
    }
}
