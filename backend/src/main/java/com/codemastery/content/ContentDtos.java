package com.codemastery.content;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;

public class ContentDtos {
    static final String SLUG = "^[a-z0-9]+(-[a-z0-9]+)*$";

    // ---------- responses ----------
    public record LessonSummary(Long id, String slug, String title, String duration, boolean published) {}

    public record SectionDto(Long id, String slug, String title, String icon, int position, List<LessonSummary> lessons) {}

    public record TrackSummary(Long id, String slug, String name, String description, String icon, String color,
                               String difficulty, int estimatedHours, int position, boolean published,
                               long sectionCount, long lessonCount, Long categoryId) {}

    public record TrackDetail(TrackSummary track, List<SectionDto> sections) {}

    public record LessonDto(Long id, Long sectionId, String trackSlug, String sectionSlug, String slug, String title,
                            String summary, String concept, String realWorld, List<String> commonMistakes,
                            List<String> bestPractices, String interviewRelevance, String duration,
                            String codeLanguage, String codeExample, List<java.util.Map<String, Object>> blocks,
                            int position, boolean published) {}

    public record Example(String input, String output, String explanation) {}

    public record ProblemSummary(Long id, String slug, String title, String difficulty, String trackSlug,
                                 String category, String concept, String excerpt, boolean published) {}

    public record ProblemDto(Long id, String slug, String title, String difficulty, String trackSlug, String category,
                             String concept, String description, List<Example> examples, List<String> constraints,
                             List<String> hints, String solution, String language, String starterCode,
                             boolean published) {}

    // ---------- admin requests (problems only; track/section/lesson writes live in the creator API) ----------
    public record ProblemRequest(
            @NotBlank @Pattern(regexp = SLUG) @Size(max = 100) String slug,
            @Size(max = 80) String trackSlug,
            @NotBlank @Size(max = 200) String title,
            @NotBlank @Pattern(regexp = "easy|medium|hard") String difficulty,
            @Size(max = 120) String category,
            @Size(max = 120) String concept,
            String description,
            @Valid List<Example> examples,
            List<String> constraints,
            List<String> hints,
            String solution,
            @Size(max = 30) String language,
            String starterCode,
            Boolean published) {}
}
