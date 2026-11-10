package com.codemastery.media;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
import lombok.Getter;
import lombok.Setter;

/** One uploaded image (original + thumbnail), see V13 and PLAN.md Step 12. Content refers to it by {@link #id} only. */
@Entity
@Table(name = "media_assets")
@Getter
@Setter
public class MediaAsset {
    @Id
    private UUID id;

    @Column(name = "owner_id", nullable = false, updatable = false)
    private Long ownerId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private MediaStatus status;

    @Column(name = "content_type", nullable = false)
    private String contentType;

    @Column(nullable = false) private int width;
    @Column(nullable = false) private int height;
    @Column(name = "size_bytes", nullable = false) private long sizeBytes;
    @Column(nullable = false) private String sha256;

    @Column(name = "thumb_width", nullable = false) private int thumbWidth;
    @Column(name = "thumb_height", nullable = false) private int thumbHeight;
    @Column(name = "thumb_size_bytes", nullable = false) private long thumbSizeBytes;
    @Column(name = "thumb_sha256", nullable = false) private String thumbSha256;

    @Column(name = "storage_key", nullable = false) private String storageKey;
    @Column(name = "thumb_key", nullable = false) private String thumbKey;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    @Column(name = "ready_at")
    private Instant readyAt;

    @Column(name = "unreferenced_since")
    private Instant unreferencedSince;

    @Column(name = "delete_attempts", nullable = false)
    private int deleteAttempts;
}
