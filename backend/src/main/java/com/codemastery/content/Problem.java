package com.codemastery.content;

import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "problems")
@Getter
@Setter
public class Problem {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(nullable = false, unique = true)
    private String slug;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "track_id")
    private Track track;
    @Column(nullable = false)
    private String title;
    @Column(nullable = false)
    private String difficulty;
    @Column(nullable = false)
    private String category = "";
    @Column(nullable = false)
    private String concept = "";
    @Column(nullable = false)
    private String description = "";
    /** JSON array of {input, output, explanation}. */
    @Column(nullable = false)
    private String examples = "[]";
    /** JSON array of strings. */
    @Column(nullable = false)
    private String constraints = "[]";
    /** JSON array of strings. */
    @Column(nullable = false)
    private String hints = "[]";
    @Column(nullable = false)
    private String solution = "";
    @Column(nullable = false)
    private String language = "java";
    @Column(name = "starter_code", nullable = false)
    private String starterCode = "";
    @Column(nullable = false)
    private boolean published = true;
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();
}
