package com.codemastery;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ContentApiTest extends ApiTestSupport {

    // ---------- seed integrity ----------
    @Test
    void seedDataIsLoadedAndPublic() throws Exception {
        JsonNode tracks = read(mvc.perform(get("/api/tracks")).andExpect(status().isOk()).andReturn());
        assertThat(tracks).hasSizeGreaterThanOrEqualTo(9);
        assertThat(tracks.findValuesAsText("slug"))
            .contains("dsa", "system-design", "linux", "git", "java", "cloud", "docker", "kubernetes", "ai");

        JsonNode dsa = read(mvc.perform(get("/api/tracks/dsa")).andExpect(status().isOk()).andReturn());
        assertThat(dsa.get("sections").size()).isGreaterThan(5);
        assertThat(dsa.get("track").get("lessonCount").asLong()).isGreaterThan(30);
    }

    @Test
    void lessonContentIsSeededWithStructuredFields() throws Exception {
        mvc.perform(get("/api/tracks/dsa/lessons/two-pointers"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.concept").isNotEmpty())
            .andExpect(jsonPath("$.commonMistakes").isArray())
            .andExpect(jsonPath("$.commonMistakes[0]").isString())
            .andExpect(jsonPath("$.codeLanguage").value("java"));
    }

    @Test
    void courseIntroContentIsOnlyAttachedToJava() throws Exception {
        // regression: the same lesson id exists in every track but the text is Java-specific
        mvc.perform(get("/api/tracks/java/lessons/course-intro"))
            .andExpect(jsonPath("$.concept").value(org.hamcrest.Matchers.containsString("Java")));
        mvc.perform(get("/api/tracks/dsa/lessons/course-intro"))
            .andExpect(jsonPath("$.concept").value(""));
    }

    @Test
    void sectionLevelContentWasKeptAsOverviewLessons() throws Exception {
        mvc.perform(get("/api/tracks/ai/lessons/ai-agents")).andExpect(status().isOk());
        mvc.perform(get("/api/tracks/linux/lessons/files")).andExpect(status().isOk());
    }

    @Test
    void twoSumHasFullProblemDetail() throws Exception {
        mvc.perform(get("/api/problems/two-sum"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.examples.length()").value(3))
            .andExpect(jsonPath("$.hints.length()").value(3))
            .andExpect(jsonPath("$.constraints").isNotEmpty())
            .andExpect(jsonPath("$.solution").isNotEmpty());
    }

    @Test
    void problemFiltersWork() throws Exception {
        JsonNode easyDsa = read(mvc.perform(get("/api/problems?track=dsa&difficulty=easy")).andReturn());
        assertThat(easyDsa.size()).isGreaterThan(0);
        easyDsa.forEach(p -> {
            assertThat(p.get("difficulty").asText()).isEqualTo("easy");
            assertThat(p.get("trackSlug").asText()).isEqualTo("dsa");
        });
    }

    @Test
    void unknownResourcesReturn404() throws Exception {
        mvc.perform(get("/api/tracks/nope")).andExpect(status().isNotFound());
        mvc.perform(get("/api/tracks/dsa/lessons/nope")).andExpect(status().isNotFound());
        mvc.perform(get("/api/problems/nope")).andExpect(status().isNotFound());
    }

    // ---------- creator lifecycle, seen through the legacy public reads ----------
    private long post201(String token, String url, Map<String, Object> req) throws Exception {
        return read(mvc.perform(as(token, post(url)).content(body(req))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
    }

    @Test
    void aCreatorCanBuildPublishAndDeleteACollectionAndTheLegacyReadsFollow() throws Exception {
        String admin = adminToken();
        String slug = uniq("rust");

        long id = post201(admin, "/api/collections", Map.of("slug", slug, "title", "Rust", "description", "Systems"));
        // a draft is invisible to the public
        mvc.perform(get("/api/tracks/" + slug)).andExpect(status().isNotFound());
        assertThat(read(mvc.perform(get("/api/tracks")).andReturn()).findValuesAsText("slug")).doesNotContain(slug);

        long moduleId = post201(admin, "/api/collections/" + id + "/modules", Map.of("slug", "ownership", "title", "Ownership"));
        long pageId = post201(admin, "/api/modules/" + moduleId + "/pages", Map.of("slug", "borrowing", "title", "Borrowing"));

        // publishing needs a published page
        mvc.perform(as(admin, post("/api/collections/" + id + "/publish"))).andExpect(status().isBadRequest());
        mvc.perform(as(admin, post("/api/pages/" + pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(admin, post("/api/collections/" + id + "/publish"))).andExpect(status().isOk());
        mvc.perform(get("/api/tracks/" + slug))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.track.lessonCount").value(1))
            .andExpect(jsonPath("$.sections[0].lessons[0].slug").value("borrowing"));
        mvc.perform(get("/api/tracks/" + slug + "/lessons/borrowing")).andExpect(status().isOk());

        // unpublishing the page hides it
        mvc.perform(as(admin, post("/api/pages/" + pageId + "/unpublish"))).andExpect(status().isOk());
        mvc.perform(get("/api/tracks/" + slug + "/lessons/borrowing")).andExpect(status().isNotFound());
        mvc.perform(as(admin, post("/api/pages/" + pageId + "/publish"))).andExpect(status().isOk());

        // deleting the collection (soft delete) removes it from the public API
        mvc.perform(as(admin, delete("/api/collections/" + id))).andExpect(status().isNoContent());
        mvc.perform(get("/api/tracks/" + slug)).andExpect(status().isNotFound());
        mvc.perform(get("/api/tracks/" + slug + "/lessons/borrowing")).andExpect(status().isNotFound());
    }

    @Test
    void validationAndConflicts() throws Exception {
        String admin = adminToken();
        mvc.perform(as(admin, post("/api/collections")).content(body(Map.of("slug", "Bad Slug", "title", "X"))))
            .andExpect(status().isBadRequest());
        mvc.perform(as(admin, post("/api/collections")).content(body(Map.of("slug", "dsa", "title", "Dup"))))
            .andExpect(status().isConflict());
        mvc.perform(as(admin, post("/api/admin/problems"))
                .content(body(Map.of("slug", uniq("p"), "title", "X", "difficulty", "extreme"))))
            .andExpect(status().isBadRequest());
        mvc.perform(as(admin, post("/api/admin/problems"))
                .content(body(Map.of("slug", uniq("p"), "title", "X", "difficulty", "easy", "trackSlug", "ghost"))))
            .andExpect(status().isBadRequest());
        mvc.perform(as(admin, delete("/api/collections/999999"))).andExpect(status().isNotFound());
    }

    @Test
    void problemStopsLinkingToATrackThatIsDeleted() throws Exception {
        String admin = adminToken();
        String trackSlug = uniq("tmp");
        long id = post201(admin, "/api/collections", Map.of("slug", trackSlug, "title", "Tmp"));
        // the track link is only shown while the track is publicly readable, which needs a published page
        long moduleId = post201(admin, "/api/collections/" + id + "/modules", Map.of("slug", "s", "title", "S"));
        long pageId = post201(admin, "/api/modules/" + moduleId + "/pages", Map.of("slug", "l", "title", "L"));
        mvc.perform(as(admin, post("/api/pages/" + pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(admin, post("/api/collections/" + id + "/publish"))).andExpect(status().isOk());
        String problemSlug = uniq("prob");
        mvc.perform(as(admin, post("/api/admin/problems")).content(body(Map.of(
                "slug", problemSlug, "title", "P", "difficulty", "easy", "trackSlug", trackSlug,
                "examples", List.of(Map.of("input", "1", "output", "2", "explanation", ""))))))
            .andExpect(status().isCreated());
        mvc.perform(get("/api/problems/" + problemSlug)).andExpect(jsonPath("$.trackSlug").value(trackSlug))
            .andExpect(jsonPath("$.examples[0].output").value("2"));

        mvc.perform(as(admin, delete("/api/collections/" + id))).andExpect(status().isNoContent());
        mvc.perform(get("/api/problems/" + problemSlug))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.trackSlug").doesNotExist());
    }

    // ---------- system design case studies ----------
    @Test
    void systemDesignHasHighAndLowLevelCaseStudies() throws Exception {
        JsonNode all = read(mvc.perform(get("/api/problems?track=system-design")).andReturn());
        long hld = all.findValues("category").stream().filter(c -> c.asText().equals("High Level Design")).count();
        long lld = all.findValues("category").stream().filter(c -> c.asText().equals("Low Level Design")).count();
        assertThat(hld).isGreaterThanOrEqualTo(4);
        assertThat(lld).isGreaterThanOrEqualTo(4);
        all.forEach(p -> {
            assertThat(p.get("concept").asText()).contains(","); // chips are comma-separated
            assertThat(p.get("excerpt").asText()).isNotBlank();
        });
        mvc.perform(get("/api/problems/parking-lot")).andExpect(status().isOk());
    }

    @Test
    void listExcerptIsCappedToTheFirstParagraph() throws Exception {
        String admin = adminToken();
        String slug = uniq("long");
        String body = "First paragraph here.\n\nSecond paragraph that must not appear. " + "x".repeat(500);
        mvc.perform(as(admin, post("/api/admin/problems")).content(body(Map.of(
                "slug", slug, "title", "Long", "difficulty", "easy", "description", body))))
            .andExpect(status().isCreated());
        JsonNode list = read(mvc.perform(get("/api/problems")).andReturn());
        String excerpt = list.findParents("slug").stream().filter(p -> p.get("slug").asText().equals(slug))
            .findFirst().orElseThrow().get("excerpt").asText();
        assertThat(excerpt).isEqualTo("First paragraph here.");

        String longOne = uniq("long2");
        mvc.perform(as(admin, post("/api/admin/problems")).content(body(Map.of(
                "slug", longOne, "title", "Long2", "difficulty", "easy", "description", "y".repeat(500)))))
            .andExpect(status().isCreated());
        list = read(mvc.perform(get("/api/problems")).andReturn());
        excerpt = list.findParents("slug").stream().filter(p -> p.get("slug").asText().equals(longOne))
            .findFirst().orElseThrow().get("excerpt").asText();
        assertThat(excerpt).hasSize(160).endsWith("...");
        // the full text is still available on the detail endpoint
        mvc.perform(get("/api/problems/" + longOne)).andExpect(jsonPath("$.description").value("y".repeat(500)));
    }

    // ---------- system design content (migration V4) ----------
    @Test
    void systemDesignFirstSectionsHaveRealContent() throws Exception {
        JsonNode detail = read(mvc.perform(get("/api/tracks/system-design")).andReturn());
        List<String> sections = List.of("welcome", "intro-system-design", "core-concepts", "load-balancing");
        int checked = 0;
        for (JsonNode section : detail.get("sections")) {
            if (!sections.contains(section.get("slug").asText())) continue;
            for (JsonNode l : section.get("lessons")) {
                JsonNode lesson = read(mvc.perform(get("/api/tracks/system-design/lessons/" + l.get("slug").asText()))
                        .andExpect(status().isOk()).andReturn());
                String slug = lesson.get("slug").asText();
                assertThat(lesson.get("concept").asText()).as(slug + " concept").hasSizeGreaterThan(300);
                assertThat(lesson.get("realWorld").asText()).as(slug + " realWorld").isNotBlank();
                assertThat(lesson.get("commonMistakes").size()).as(slug + " mistakes").isGreaterThanOrEqualTo(2);
                assertThat(lesson.get("bestPractices").size()).as(slug + " practices").isGreaterThanOrEqualTo(2);
                assertThat(lesson.get("interviewRelevance").asText()).as(slug + " interview").isNotBlank();
                assertThat(lesson.get("concept").asText()).as(slug + " has no markdown").doesNotContain("**");
                checked++;
            }
        }
        assertThat(checked).isEqualTo(18);
    }

    @Test
    void joinCommunityLessonWasRetitled() throws Exception {
        mvc.perform(get("/api/tracks/system-design/lessons/join-community"))
            .andExpect(jsonPath("$.title").value("How to Study This Course"));
    }
}
