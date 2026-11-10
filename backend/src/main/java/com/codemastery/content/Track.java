package com.codemastery.content;

import com.codemastery.category.Category;
import com.codemastery.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "tracks")
@Getter
@Setter
public class Track {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    /** Unique per owner (UNIQUE(owner_id, slug)), not globally. */
    @Column(nullable = false)
    private String slug;
    @Column(nullable = false)
    private String name;
    @Column(nullable = false)
    private String description = "";
    @Column(nullable = false)
    private String icon = "book-open";
    @Column(nullable = false)
    private String color = "from-primary to-accent";
    @Column(nullable = false)
    private String difficulty = "Beginner";
    @Column(name = "estimated_hours", nullable = false)
    private int estimatedHours;
    @Column(nullable = false)
    private int position;
    /** Legacy flag, kept in sync with {@link #status} (true only for PUBLISHED) until Step 19 drops the column. */
    @Column(nullable = false)
    private boolean published = true;

    /** Set once at creation, never from a request body (updatable = false). Nullable in SQL until AdminSeeder backfills. */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "owner_id", updatable = false)
    private User owner;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private Category category;
    @Column(name = "cover_url")
    private String coverUrl;
    /**
     * The canonical collection-cover reference (V13). Written ONLY through {@code MediaReferenceService.setCover}, which locks the
     * collection and the assets and keeps the orphan clock right; a source-scan test fails if any other class calls the setter.
     */
    @Column(name = "cover_asset_id")
    private java.util.UUID coverAssetId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private CollectionStatus status = CollectionStatus.PUBLISHED;
    @Enumerated(EnumType.STRING)
    @Column(name = "moderation_status", nullable = false)
    private ModerationStatus moderationStatus = ModerationStatus.OK;
    @Column(name = "deleted_at")
    private Instant deletedAt;

    @OneToMany(mappedBy = "track", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<Section> sections = new ArrayList<>();

    public void setStatus(CollectionStatus status) {
        this.status = status;
        this.published = status == CollectionStatus.PUBLISHED;
    }

    public void setPublished(boolean published) {
        this.published = published;
        this.status = published ? CollectionStatus.PUBLISHED : CollectionStatus.DRAFT;
    }
}
