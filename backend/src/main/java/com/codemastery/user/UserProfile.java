package com.codemastery.user;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "user_profiles")
@Getter
@Setter
public class UserProfile {
    @Id
    @Column(name = "user_id")
    private Long userId;
    @Column(name = "display_name", nullable = false)
    private String displayName;
    @Column(nullable = false)
    private String bio = "";
    @Column(name = "avatar_url")
    private String avatarUrl;
    @Column(name = "banner_url")
    private String bannerUrl;
    /** JSON object of label -> https URL. */
    @Column(name = "social_links", nullable = false)
    private String socialLinks = "{}";
    /** JSON array of strings. Stored now, exposed in a later step. */
    @Column(nullable = false)
    private String interests = "[]";
    /** Stored now, wired up (with its FK) once collections are owned. */
    @Column(name = "featured_collection_id")
    private Long featuredCollectionId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ProfileVisibility visibility = ProfileVisibility.PUBLIC;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();
}
