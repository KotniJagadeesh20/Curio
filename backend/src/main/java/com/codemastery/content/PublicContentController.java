package com.codemastery.content;

import com.codemastery.content.ContentDtos.*;
import java.util.List;
import java.util.Optional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class PublicContentController {
    private final ContentService content;

    public PublicContentController(ContentService content) {
        this.content = content;
    }

    @GetMapping("/tracks")
    public List<TrackSummary> tracks() {
        return content.publicTracks();
    }

    @GetMapping("/tracks/{slug}")
    public TrackDetail track(@PathVariable String slug) {
        return content.publicTrack(slug);
    }

    @GetMapping("/tracks/{trackSlug}/lessons/{lessonSlug}")
    public LessonDto lesson(@PathVariable String trackSlug, @PathVariable String lessonSlug) {
        return content.publicLesson(trackSlug, lessonSlug);
    }

    @GetMapping("/problems")
    public List<ProblemSummary> problems(@RequestParam Optional<String> track,
                                         @RequestParam Optional<String> difficulty) {
        return content.publicProblems(track, difficulty);
    }

    @GetMapping("/problems/{slug}")
    public ProblemDto problem(@PathVariable String slug) {
        return content.publicProblem(slug);
    }
}
