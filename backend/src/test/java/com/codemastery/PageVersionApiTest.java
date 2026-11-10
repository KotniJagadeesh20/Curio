package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** Optimistic concurrency for page updates (Step 10): expectedVersion, 409 VERSION_CONFLICT, atomicity, compatibility. */
class PageVersionApiTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired com.codemastery.content.LessonRepository lessonRepo;
    @Autowired org.springframework.transaction.PlatformTransactionManager txm;

    record Built(String token, long collectionId, long pageId) {}

    private long created(String token, String url, Map<String, Object> req) throws Exception {
        return read(mvc.perform(as(token, post(url)).content(body(req))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
    }

    private Built build() throws Exception {
        String token = newUserToken();
        long c = created(token, "/api/collections", Map.of("title", "T", "slug", uniq("ver")));
        long m = created(token, "/api/collections/" + c + "/modules", Map.of("title", "M", "slug", "m"));
        long p = created(token, "/api/modules/" + m + "/pages", Map.of("title", "Title", "slug", "p", "summary", "S"));
        return new Built(token, c, p);
    }

    private JsonNode page(Built b) throws Exception {
        return read(mvc.perform(as(b.token, get("/api/pages/" + b.pageId))).andExpect(status().isOk()).andReturn());
    }

    private static final List<Map<String, Object>> A = List.of(Map.of("id", "a", "type", "text", "text", "from A"));
    private static final List<Map<String, Object>> B = List.of(Map.of("id", "b", "type", "text", "text", "from B"));

    private Map<String, Object> update(String title, List<Map<String, Object>> blocks, Integer expected) {
        var m = new java.util.LinkedHashMap<String, Object>();
        m.put("title", title);
        m.put("summary", "S");
        if (blocks != null) m.put("blocks", blocks);
        if (expected != null) m.put("expectedVersion", expected);
        return m;
    }

    private int save(Built b, Map<String, Object> req) throws Exception {
        return mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(req))).andReturn().getResponse().getStatus();
    }

    private String row(Built b) {
        return jdbc.queryForObject("select title || '|' || summary || '|' || coalesce(blocks,'null') from lessons where id = ?", String.class, b.pageId);
    }

    @Test
    void responseCarriesTheVersionAndEveryContentSaveIncrementsIt() throws Exception {
        Built b = build();
        int v0 = page(b).get("version").asInt();
        JsonNode saved = read(mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(update("One", A, v0))))
                .andExpect(status().isOk()).andReturn());
        assertThat(saved.get("version").asInt()).isEqualTo(v0 + 1);
        assertThat(page(b).get("version").asInt()).isEqualTo(v0 + 1);
        // the next save with the returned version works too
        assertThat(save(b, update("Two", B, v0 + 1))).isEqualTo(200);
        assertThat(page(b).get("version").asInt()).isEqualTo(v0 + 2);
    }

    @Test
    void aStaleUpdateIsRefusedWithAMachineReadableConflictAndChangesNothing() throws Exception {
        Built b = build();
        int v0 = page(b).get("version").asInt();
        assertThat(save(b, update("Winner", A, v0))).isEqualTo(200);
        String before = row(b);
        JsonNode err = read(mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(update("Loser", B, v0))))
                .andExpect(status().isConflict()).andReturn());
        assertThat(err.get("code").asText()).isEqualTo("VERSION_CONFLICT");
        assertThat(row(b)).as("title, summary and blocks unchanged").isEqualTo(before);
        assertThat(page(b).get("version").asInt()).isEqualTo(v0 + 1);
        // a version from the future is stale as well
        assertThat(save(b, update("Future", B, v0 + 5))).isEqualTo(409);
        assertThat(row(b)).isEqualTo(before);
    }

    @Test
    void aMetadataOnlyUpdateIsAlsoVersionChecked() throws Exception {
        Built b = build();
        int v0 = page(b).get("version").asInt();
        assertThat(save(b, update("Winner", null, v0))).isEqualTo(200);
        String before = row(b);
        assertThat(save(b, update("Loser", null, v0))).isEqualTo(409);
        assertThat(row(b)).isEqualTo(before);
    }

    @Test
    void omittingExpectedVersionKeepsTheOldLastWriteWinsBehaviour() throws Exception {
        Built b = build();
        int v0 = page(b).get("version").asInt();
        assertThat(save(b, update("First", A, null))).isEqualTo(200);
        assertThat(save(b, update("Second", B, null))).isEqualTo(200);
        assertThat(row(b)).startsWith("Second|S|");
        assertThat(page(b).get("version").asInt()).isEqualTo(v0 + 2);
    }

    @Test
    void anInvalidVersionIsABadRequest() throws Exception {
        Built b = build();
        assertThat(save(b, update("X", A, -1))).isEqualTo(400);
    }

    @Test
    void publishUnpublishAndReorderDoNotInvalidateAnOpenEditor() throws Exception {
        Built b = build();
        int v0 = page(b).get("version").asInt();
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        mvc.perform(as(b.token, patch("/api/pages/" + b.pageId + "/reorder")).content(body(Map.of("position", 0)))).andExpect(status().isOk());
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/unpublish"))).andExpect(status().isOk());
        assertThat(page(b).get("version").asInt()).isEqualTo(v0);
        assertThat(save(b, update("Still valid", A, v0))).isEqualTo(200);
    }

    @Test
    void aConflictOnAnUnreadablePageStaysTheOtherKindOfConflict() throws Exception {
        Built b = build();
        jdbc.update("update lessons set blocks = ? where id = ?", "{broken", b.pageId);
        int v = page(b).get("version").asInt();
        JsonNode err = read(mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(update("T", A, v))))
                .andExpect(status().isConflict()).andReturn());
        assertThat(err.has("code")).as("the unreadable-content 409 has no VERSION_CONFLICT code").isFalse();
        assertThat(jdbc.queryForObject("select blocks from lessons where id = ?", String.class, b.pageId)).isEqualTo("{broken");
    }

    @Test
    void simultaneousUpdatesWithTheSameVersionLetExactlyOneWin() throws Exception {
        for (int round = 0; round < 5; round++) {
            Built b = build();
            int v0 = page(b).get("version").asInt();
            int n = 8;
            ExecutorService pool = Executors.newFixedThreadPool(n);
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < n; i++) {
                String title = "Writer " + i;
                List<Map<String, Object>> blocks = List.of(Map.of("id", "w" + i, "type", "text", "text", title));
                results.add(pool.submit(() -> {
                    go.await();
                    return save(b, update(title, blocks, v0));
                }));
            }
            go.countDown();
            int ok = 0, conflict = 0;
            for (Future<Integer> f : results) {
                int s = f.get();
                if (s == 200) ok++;
                else if (s == 409) conflict++;
                else throw new AssertionError("unexpected status " + s);
            }
            pool.shutdown();
            assertThat(ok).as("exactly one winner").isEqualTo(1);
            assertThat(conflict).isEqualTo(n - 1);
            assertThat(page(b).get("version").asInt()).isEqualTo(v0 + 1);
            // the stored row is one writer's complete save, never a mixture
            String stored = row(b);
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("^Writer (\\d)\\|S\\|(.*)$").matcher(stored);
            assertThat(m.matches()).as(stored).isTrue();
            String w = m.group(1);
            assertThat(m.group(2)).contains("\"id\":\"w" + w + "\"").contains("\"text\":\"Writer " + w + "\"");
        }
    }

    private String statusOf(Built b) {
        return jdbc.queryForObject("select status from lessons where id = ?", String.class, b.pageId);
    }

    /** One transaction holds a stale DRAFT copy; another request publishes and commits; the stale copy then writes. Status must survive. */
    private void staleWriteAfter(Built b, String firstStatusCall, String expectStatus) throws Exception {
        var tx = new org.springframework.transaction.support.TransactionTemplate(txm);
        ExecutorService other = Executors.newSingleThreadExecutor();
        try {
            tx.executeWithoutResult(st -> {
                var stale = lessonRepo.findById(b.pageId).orElseThrow();   // loaded now (status as it is at this moment)
                try {
                    other.submit(() -> mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/" + firstStatusCall))
                            .content("{}")).andExpect(status().isOk())).get();
                } catch (Exception e) { throw new AssertionError(e); }
                stale.setTitle("Stale writer");
                lessonRepo.flush();                                          // the UPDATE the stale request would issue
            });
        } finally { other.shutdown(); }
        assertThat(statusOf(b)).as("a stale write must not undo the " + firstStatusCall).isEqualTo(expectStatus);
        assertThat(row(b)).startsWith("Stale writer|");
    }

    @Test
    void aStaleCopyCannotRevertAPublishThatCommittedMeanwhile() throws Exception {
        staleWriteAfter(build(), "publish", "PUBLISHED");
    }

    @Test
    void aStaleCopyCannotRepublishAPageThatWasUnpublishedMeanwhile() throws Exception {
        Built b = build();
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish")).content("{}")).andExpect(status().isOk());
        staleWriteAfter(b, "unpublish", "DRAFT");
    }

    /** Autosave and publish racing for real: whenever publish answered 200, the page ends up PUBLISHED. */
    @Test
    void autosaveRacingAPublishNeverLeavesTheDraftBehind() throws Exception {
        for (int round = 0; round < 15; round++) {
            Built b = build();
            ExecutorService pool = Executors.newFixedThreadPool(2);
            CountDownLatch go = new CountDownLatch(1);
            var auto = update("Auto " + round, A, null);
            auto.put("autosave", true);
            Future<Integer> a = pool.submit(() -> { go.await(); return save(b, auto); });
            Future<Integer> p = pool.submit(() -> { go.await();
                return mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish")).content("{}")).andReturn().getResponse().getStatus(); });
            go.countDown();
            int autoStatus = a.get(), pubStatus = p.get();
            pool.shutdown();
            assertThat(pubStatus).isEqualTo(200);
            assertThat(autoStatus).isIn(200, 409);
            assertThat(statusOf(b)).as("round " + round).isEqualTo("PUBLISHED");
        }
    }

    @Test
    void autosaveNeverReplacesUnreadableContent() throws Exception {
        Built b = build();
        jdbc.update("update lessons set blocks = ? where id = ?", "{not json", b.pageId);
        int v = page(b).get("version").asInt();
        var withBlocks = update("T", A, v); withBlocks.put("autosave", true);
        assertThat(save(b, withBlocks)).as("blocks over unreadable content").isEqualTo(409);
        var discard = update("T", A, v); discard.put("autosave", true); discard.put("discardUnreadableContent", true);
        assertThat(save(b, discard)).as("autosave + discard").isEqualTo(400);
        assertThat(jdbc.queryForObject("select blocks from lessons where id = ?", String.class, b.pageId)).isEqualTo("{not json");
        var explicit = update("T", A, v); explicit.put("discardUnreadableContent", true);
        assertThat(save(b, explicit)).as("explicit Save may discard").isEqualTo(200);
    }

    /** Reorders and creates in one module, all at once: positions must end up a clean 0..n-1 (no duplicates, no lost renumbering), never a 500. */
    @Test
    void concurrentReordersAndCreatesKeepPagePositionsAPermutation() throws Exception {
        for (int round = 0; round < 6; round++) {
            Built b = build();
            long moduleId = jdbc.queryForObject("select section_id from lessons where id = ?", Long.class, b.pageId);
            List<Long> ids = new ArrayList<>(List.of(b.pageId));
            for (int i = 0; i < 5; i++) ids.add(created(b.token, "/api/modules/" + moduleId + "/pages", Map.of("title", "P" + i, "slug", "p" + i)));
            ExecutorService pool = Executors.newFixedThreadPool(8);
            CountDownLatch go = new CountDownLatch(1);
            List<Future<Integer>> rs = new ArrayList<>();
            for (int i = 0; i < 6; i++) {
                long id = ids.get(i); int to = (i * 5 + round) % 6;
                rs.add(pool.submit(() -> { go.await(); return mvc.perform(as(b.token, patch("/api/pages/" + id + "/reorder")).content(body(Map.of("position", to))))
                        .andReturn().getResponse().getStatus(); }));
            }
            for (int i = 0; i < 2; i++) {
                String slug = "n" + i;
                rs.add(pool.submit(() -> { go.await(); return mvc.perform(as(b.token, post("/api/modules/" + moduleId + "/pages")).content(body(Map.of("title", "N", "slug", slug))))
                        .andReturn().getResponse().getStatus(); }));
            }
            go.countDown();
            for (Future<Integer> f : rs) assertThat(f.get()).as("round " + round).isIn(200, 201, 409);
            pool.shutdown();
            List<Integer> pos = jdbc.queryForList("select position from lessons where section_id = ? order by position", Integer.class, moduleId);
            for (int i = 0; i < pos.size(); i++) assertThat(pos.get(i)).as("positions " + pos + " round " + round).isEqualTo(i);
        }
    }

    @Test
    void savingOrPublishingAPageThatWasJustDeletedIsA404Not500() throws Exception {
        Built b = build();
        mvc.perform(as(b.token, delete("/api/pages/" + b.pageId))).andExpect(status().isNoContent());
        assertThat(save(b, update("Ghost", A, 0))).isEqualTo(404);
        assertThat(mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish")).content("{}")).andReturn().getResponse().getStatus()).isEqualTo(404);
    }

    @Test
    void aNonOwnerStillGetsTheOwnershipAnswerAndNothingChanges() throws Exception {
        Built b = build();
        String other = newUserToken();
        int v = page(b).get("version").asInt();
        String before = row(b);
        mvc.perform(as(other, put("/api/pages/" + b.pageId)).content(body(update("Hacked", A, v)))).andExpect(status().isNotFound());
        assertThat(row(b)).isEqualTo(before);
        assertThat(page(b).get("version").asInt()).isEqualTo(v);
    }

    @Test
    void autosaveIsRefusedOnAPublishedPageAndNeverChangesIt() throws Exception {
        Built b = build();
        int v = page(b).get("version").asInt();
        // a draft accepts an autosave
        var auto = update("Draft edit", A, v);
        auto.put("autosave", true);
        assertThat(save(b, auto)).isEqualTo(200);
        mvc.perform(as(b.token, post("/api/pages/" + b.pageId + "/publish"))).andExpect(status().isOk());
        String live = row(b);
        var again = update("Half typed", B, v + 1);
        again.put("autosave", true);
        JsonNode err = read(mvc.perform(as(b.token, put("/api/pages/" + b.pageId)).content(body(again))).andExpect(status().isConflict()).andReturn());
        assertThat(err.get("code").asText()).isEqualTo("PAGE_PUBLISHED");
        assertThat(row(b)).as("live content untouched").isEqualTo(live);
        assertThat(page(b).get("version").asInt()).isEqualTo(v + 1);
        // an explicit Save (no flag, or false) still works on a published page
        var explicit = update("Deliberate", B, v + 1);
        explicit.put("autosave", false);
        assertThat(save(b, explicit)).isEqualTo(200);
        assertThat(save(b, update("Deliberate 2", A, v + 2))).isEqualTo(200);
    }
}
