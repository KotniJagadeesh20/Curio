package com.codemastery.content;

import jakarta.persistence.*;
import lombok.Getter;
import org.hibernate.annotations.OptimisticLock;
import lombok.Setter;

@Entity
@org.hibernate.annotations.DynamicUpdate   // write only the changed columns: a stale copy must not overwrite status/position set by another request
@Table(name = "lessons")
@Getter
@Setter
public class Lesson {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "section_id")
    private Section section;
    @Column(nullable = false)
    private String slug;
    @Column(nullable = false)
    private String title;
    @Column(nullable = false)
    private String summary = "";
    @Column(nullable = false)
    private String concept = "";
    @Column(name = "real_world", nullable = false)
    private String realWorld = "";
    /** JSON array of strings. */
    @Column(name = "common_mistakes", nullable = false)
    private String commonMistakes = "[]";
    /** JSON array of strings. */
    @Column(name = "best_practices", nullable = false)
    private String bestPractices = "[]";
    @Column(name = "interview_relevance", nullable = false)
    private String interviewRelevance = "";
    private String duration;
    @Column(name = "code_language")
    private String codeLanguage;
    @Column(name = "code_example")
    private String codeExample;
    /** JSON array of content blocks; null = legacy fields only. */
    @Column(name = "blocks")
    private String blocks;
    /** Optimistic lock for the editor; incremented by Hibernate (atomic `where version = ?`) on content changes only. */
    @Version
    @Column(nullable = false)
    private int version;
    @OptimisticLock(excluded = true)
    @Column(nullable = false)
    private int position;
    /** Legacy flag, kept in sync with {@link #status} until Step 19 drops the column. */
    @OptimisticLock(excluded = true)
    @Column(nullable = false)
    private boolean published = true;
    @OptimisticLock(excluded = true)
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private PageStatus status = PageStatus.PUBLISHED;

    public void setStatus(PageStatus status) {
        this.status = status;
        this.published = status == PageStatus.PUBLISHED;
    }

    public void setPublished(boolean published) {
        this.published = published;
        this.status = published ? PageStatus.PUBLISHED : PageStatus.DRAFT;
    }
}
