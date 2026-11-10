package com.codemastery;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.codemastery.media.MediaFixtures;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Shared helpers for the Step 12b tests: building content over HTTP, real uploads, and deterministic lock-holder concurrency. */
abstract class MediaRefSupport extends MediaApiTestSupport {
    @Autowired PlatformTransactionManager txManager;
    @Autowired com.codemastery.media.MediaReferenceService mediaRefs;
    @Autowired com.codemastery.media.MediaTx mediaTx;
    @Autowired com.codemastery.media.MediaSweeper sweeper;
    @Autowired com.codemastery.media.MediaStorage storage;
    @Autowired com.codemastery.user.UserRepository userRepo;

    /** Shared by every test class of the run, so it is never shut down per class; daemon threads let the JVM exit. */
    static final ExecutorService POOL = Executors.newCachedThreadPool(r -> {
        Thread t = new Thread(r, "media-test-worker");
        t.setDaemon(true);
        return t;
    });

    // ---------- content over HTTP ----------
    record Coll(long id, String slug, String owner) {}

    protected String username(Account a) { return userRepo.findById(a.id()).orElseThrow().getUsername(); }

    protected MvcResult api(Account a, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req, Object body) throws Exception {
        var r = as(a.token(), req);
        if (body != null) r = r.content(body(body));
        return mvc.perform(r).andReturn();
    }

    protected JsonNode ok(MvcResult r, int status) throws Exception {
        org.assertj.core.api.Assertions.assertThat(r.getResponse().getStatus()).as(r.getResponse().getContentAsString()).isEqualTo(status);
        String s = r.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
        return s.isBlank() ? null : json.readTree(s);
    }

    protected Coll collection(Account a) throws Exception {
        JsonNode c = ok(api(a, post("/api/collections"), Map.of("title", uniq("Coll"))), 201);
        return new Coll(c.get("id").asLong(), c.get("slug").asText(), username(a));
    }

    protected long module(Account a, Coll c) throws Exception {
        return ok(api(a, post("/api/collections/" + c.id() + "/modules"), Map.of("title", "Mod")), 201).get("id").asLong();
    }

    protected long page(Account a, long moduleId, List<Map<String, Object>> blocks) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>(Map.of("title", uniq("Page")));
        if (blocks != null) body.put("blocks", blocks);
        return ok(api(a, post("/api/modules/" + moduleId + "/pages"), body), 201).get("id").asLong();
    }

    protected JsonNode getPage(Account a, long pageId) throws Exception { return ok(api(a, get("/api/pages/" + pageId), null), 200); }

    protected MvcResult savePage(Account a, long pageId, List<Map<String, Object>> blocks) throws Exception {
        Map<String, Object> body = new java.util.HashMap<>(Map.of("title", "T"));
        if (blocks != null) body.put("blocks", blocks);
        return api(a, put("/api/pages/" + pageId), body);
    }

    protected void publishPage(Account a, long pageId) throws Exception { ok(api(a, post("/api/pages/" + pageId + "/publish"), null), 200); }

    protected void publishCollection(Account a, Coll c) throws Exception { ok(api(a, post("/api/collections/" + c.id() + "/publish"), null), 200); }

    protected static Map<String, Object> image(String blockId, UUID asset) { return Map.of("id", blockId, "type", "image", "assetId", asset.toString()); }

    protected static Map<String, Object> text(String blockId) { return Map.of("id", blockId, "type", "text", "text", "hello"); }

    /** A real upload through the API (a READY asset with real objects). */
    protected UUID uploadReal(Account a) throws Exception {
        MvcResult r = mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", MediaFixtures.jpeg(48, 32))).andReturn();
        return UUID.fromString(ok(r, 201).get("id").asText());
    }

    protected com.codemastery.media.MediaAsset asset(UUID id) { return assets.findById(id).orElseThrow(); }

    protected int refCount(long pageId) {
        return jdbc.queryForObject("select count(*) from media_references where page_id = ?", Integer.class, pageId);
    }

    protected int refCountOfAsset(UUID id) {
        return jdbc.queryForObject("select count(*) from media_references where asset_id = ?", Integer.class, id);
    }

    protected java.time.Instant stampOf(UUID id) { return asset(id).getUnreferencedSince(); }

    protected void clearStamp(UUID id) { jdbc.update("update media_assets set unreferenced_since = null where id = ?", id); }

    // ---------- deterministic concurrency: hold a row lock in another transaction ----------
    /** A transaction on its own thread that locks rows and keeps them until {@link #release()}; optionally changes things first. */
    final class Holder {
        private final CountDownLatch locked = new CountDownLatch(1), release = new CountDownLatch(1);
        private final Future<?> done;

        Holder(Consumer<org.springframework.jdbc.core.JdbcTemplate> whileHeld, String... lockSql) {
            TransactionTemplate tt = new TransactionTemplate(txManager);
            done = POOL.submit(() -> tt.executeWithoutResult(s -> {
                for (String sql : lockSql) jdbc.queryForList(sql);
                locked.countDown();
                try {
                    if (!release.await(30, TimeUnit.SECONDS)) throw new IllegalStateException("holder never released");
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
                if (whileHeld != null) whileHeld.accept(jdbc);
            }));
            try {
                if (!locked.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("holder could not lock");
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        /** Applies the change, commits and waits for the commit. */
        void release() throws Exception {
            release.countDown();
            done.get(20, TimeUnit.SECONDS);
        }
    }

    protected Holder hold(String... lockSql) { return new Holder(null, lockSql); }

    protected Holder holdAndThen(Consumer<org.springframework.jdbc.core.JdbcTemplate> change, String... lockSql) { return new Holder(change, lockSql); }

    protected static String lockCollection(long id) { return "select id from tracks where id = " + id + " for update"; }

    protected static String lockModule(long id) { return "select id from sections where id = " + id + " for update"; }

    protected static String lockPage(long id) { return "select id from lessons where id = " + id + " for update"; }

    protected static String lockAsset(UUID id) { return "select id from media_assets where id = '" + id + "' for update"; }

    protected <T> Future<T> async(Callable<T> c) { return POOL.submit(c); }

    /** Asserts the call is still waiting (blocked on a lock) after a short delay. */
    protected void assertBlocked(Future<?> f) throws Exception {
        try {
            f.get(600, TimeUnit.MILLISECONDS);
            throw new AssertionError("expected the call to be blocked on a lock, but it completed");
        } catch (TimeoutException expected) {
            // good: still waiting
        }
    }

    protected <T> T result(Future<T> f) throws Exception { return f.get(20, TimeUnit.SECONDS); }

    protected int status(MvcResult r) { return r.getResponse().getStatus(); }

    protected List<UUID> uploads(Account a, int n) throws Exception {
        List<UUID> out = new ArrayList<>();
        for (int i = 0; i < n; i++) out.add(uploadReal(a));
        return out;
    }
}
