package com.codemastery.content;

import com.codemastery.content.ContentDtos.*;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Optional;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class ContentService {
    private final TrackRepository tracks;
    private final SectionRepository sections;
    private final LessonRepository lessons;
    private final ProblemRepository problems;
    private final ObjectMapper json;
    private final com.codemastery.media.MediaUrlResolver mediaUrls;

    public ContentService(TrackRepository tracks, SectionRepository sections, LessonRepository lessons,
                          ProblemRepository problems, ObjectMapper json, com.codemastery.media.MediaUrlResolver mediaUrls) {
        this.tracks = tracks;
        this.sections = sections;
        this.lessons = lessons;
        this.problems = problems;
        this.json = json;
        this.mediaUrls = mediaUrls;
    }

    private static ResponseStatusException notFound(String what) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, what + " not found");
    }

    private <T> List<T> parse(String raw, TypeReference<List<T>> type) {
        try {
            return json.readValue(raw == null || raw.isBlank() ? "[]" : raw, type);
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }

    private String write(Object value) {
        try {
            return json.writeValueAsString(value == null ? List.of() : value);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String nz(String s) { return s == null ? "" : s; }

    // ---------- mapping ----------
    private TrackSummary summary(Track t) {
        return new TrackSummary(t.getId(), t.getSlug(), t.getName(), t.getDescription(), t.getIcon(), t.getColor(),
                t.getDifficulty(), t.getEstimatedHours(), t.getPosition(), t.isPublished(),
                sections.countByTrackId(t.getId()), sections.countPublishedLessons(t.getId()),
                t.getCategory() == null ? null : t.getCategory().getId());
    }

    private LessonSummary summary(Lesson l) {
        return new LessonSummary(l.getId(), l.getSlug(), l.getTitle(), l.getDuration(), l.isPublished());
    }

    private SectionDto dto(Section s, boolean includeUnpublished) {
        List<LessonSummary> ls = s.getLessons().stream()
                .filter(l -> includeUnpublished || l.isPublished()).map(this::summary).toList();
        return new SectionDto(s.getId(), s.getSlug(), s.getTitle(), s.getIcon(), s.getPosition(), ls);
    }

    private LessonDto dto(Lesson l) {
        Section s = l.getSection();
        return new LessonDto(l.getId(), s.getId(), s.getTrack().getSlug(), s.getSlug(), l.getSlug(), l.getTitle(),
                l.getSummary(), l.getConcept(), l.getRealWorld(), parse(l.getCommonMistakes(), new TypeReference<>() {}),
                parse(l.getBestPractices(), new TypeReference<>() {}), l.getInterviewRelevance(), l.getDuration(),
                l.getCodeLanguage(), l.getCodeExample(),
                // an admin account can author creator collections with uploaded images; this legacy route serves them too, so an image's
                // assetId must become a public url here as well (and never leave as a bare id; an ownerless legacy track has no assets)
                l.getBlocks() == null ? null
                        : mediaUrls.resolveBlocks(com.codemastery.blocks.BlockSanitizer.project(parse(l.getBlocks(), new TypeReference<List<java.util.Map<String, Object>>>() {})),
                                s.getTrack().getOwner() == null ? null : s.getTrack().getOwner().getId()),
                l.getPosition(), l.isPublished());
    }

    /** A problem may link to a track for grouping; the link is only exposed while that track is publicly readable. */
    private static String publicTrackSlug(Problem p) {
        Track t = p.getTrack();
        return t != null && Visibility.collectionReadable(t) ? t.getSlug() : null;
    }

    private ProblemSummary summary(Problem p) {
        return new ProblemSummary(p.getId(), p.getSlug(), p.getTitle(), p.getDifficulty(),
                publicTrackSlug(p), p.getCategory(), p.getConcept(),
                excerpt(p.getDescription()), p.isPublished());
    }

    /** First paragraph, capped, so list views don't ship full problem statements. */
    private static String excerpt(String description) {
        String first = nz(description).strip().split("\\R\\s*\\R", 2)[0].replaceAll("\\s+", " ");
        return first.length() <= 160 ? first : first.substring(0, 157).stripTrailing() + "...";
    }

    /** Admin view: always shows the real track link. */
    private ProblemDto dto(Problem p) {
        return dto(p, p.getTrack() == null ? null : p.getTrack().getSlug());
    }

    private ProblemDto dto(Problem p, String trackSlug) {
        return new ProblemDto(p.getId(), p.getSlug(), p.getTitle(), p.getDifficulty(),
                trackSlug, p.getCategory(), p.getConcept(),
                p.getDescription(), parse(p.getExamples(), new TypeReference<List<Example>>() {}),
                parse(p.getConstraints(), new TypeReference<List<String>>() {}),
                parse(p.getHints(), new TypeReference<List<String>>() {}), p.getSolution(), p.getLanguage(),
                p.getStarterCode(), p.isPublished());
    }

    /** The old learning UI serves admin-owned content only; creator collections are served by the creator/public APIs. */
    private static boolean legacyServed(Track t) {
        return t.getOwner() == null || t.getOwner().getRole() == com.codemastery.user.Role.ADMIN;
    }

    // ---------- public reads ----------
    @Transactional(readOnly = true)
    public List<TrackSummary> publicTracks() {
        // status rule in memory, "has a published page" as a count query (no loading of every lesson)
        return tracks.findAllByOrderByPositionAsc().stream().filter(ContentService::legacyServed)
                .filter(Visibility::listedByStatus)
                .map(this::summary).filter(s -> s.lessonCount() > 0).toList();
    }

    @Transactional(readOnly = true)
    public TrackDetail publicTrack(String slug) {
        Track t = tracks.findLegacyBySlug(slug).stream().findFirst().filter(Visibility::collectionReadable)
                .orElseThrow(() -> notFound("Track"));
        return new TrackDetail(summary(t), t.getSections().stream().map(s -> dto(s, false)).toList());
    }

    @Transactional(readOnly = true)
    public LessonDto publicLesson(String trackSlug, String lessonSlug) {
        return lessons.findByTrackAndSlug(trackSlug, lessonSlug).stream()
                .filter(Visibility::pageReadable)
                .findFirst().map(this::dto).orElseThrow(() -> notFound("Lesson"));
    }

    @Transactional(readOnly = true)
    public List<ProblemSummary> publicProblems(Optional<String> track, Optional<String> difficulty) {
        return problems.findByPublishedTrueOrderByCreatedAtAsc().stream()
                .filter(p -> track.isEmpty() || track.get().equals(publicTrackSlug(p)))
                .filter(p -> difficulty.isEmpty() || p.getDifficulty().equalsIgnoreCase(difficulty.get()))
                .map(this::summary).toList();
    }

    @Transactional(readOnly = true)
    public ProblemDto publicProblem(String slug) {
        return problems.findBySlug(slug).filter(Problem::isPublished).map(p -> dto(p, publicTrackSlug(p)))
                .orElseThrow(() -> notFound("Problem"));
    }

    // ---------- admin: problems ----------
    @Transactional(readOnly = true)
    public List<ProblemSummary> adminProblems() {
        return problems.findAll().stream()
                .sorted(java.util.Comparator.comparing(Problem::getCreatedAt)).map(this::summary).toList();
    }

    @Transactional(readOnly = true)
    public ProblemDto adminProblem(Long id) {
        return dto(problems.findById(id).orElseThrow(() -> notFound("Problem")));
    }

    public ProblemDto createProblem(ProblemRequest r) {
        return dto(problems.save(applyProblem(new Problem(), r)));
    }

    public ProblemDto updateProblem(Long id, ProblemRequest r) {
        Problem p = problems.findById(id).orElseThrow(() -> notFound("Problem"));
        return dto(problems.save(applyProblem(p, r)));
    }

    private Problem applyProblem(Problem p, ProblemRequest r) {
        p.setSlug(r.slug());
        p.setTitle(r.title().trim());
        p.setDifficulty(r.difficulty());
        p.setCategory(nz(r.category()));
        p.setConcept(nz(r.concept()));
        p.setDescription(nz(r.description()));
        p.setExamples(write(r.examples()));
        p.setConstraints(write(r.constraints()));
        p.setHints(write(r.hints()));
        p.setSolution(nz(r.solution()));
        if (r.language() != null && !r.language().isBlank()) p.setLanguage(r.language());
        p.setStarterCode(nz(r.starterCode()));
        if (r.published() != null) p.setPublished(r.published());
        if (r.trackSlug() == null || r.trackSlug().isBlank()) {
            p.setTrack(null);
        } else {
            p.setTrack(tracks.findLegacyBySlug(r.trackSlug()).stream().findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unknown track " + r.trackSlug())));
        }
        return p;
    }

    public void deleteProblem(Long id) {
        if (!problems.existsById(id)) throw notFound("Problem");
        problems.deleteById(id);
    }
}
