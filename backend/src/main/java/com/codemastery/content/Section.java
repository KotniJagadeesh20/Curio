package com.codemastery.content;

import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "sections")
@Getter
@Setter
public class Section {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "track_id")
    private Track track;
    @Column(nullable = false)
    private String slug;
    @Column(nullable = false)
    private String title;
    @Column(nullable = false)
    private String icon = "book-open";
    @Column(nullable = false)
    private int position;

    @OneToMany(mappedBy = "section", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("position ASC")
    private List<Lesson> lessons = new ArrayList<>();
}
