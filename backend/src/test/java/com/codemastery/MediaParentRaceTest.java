package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.function.Consumer;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;

/**
 * Step 12b lock hierarchy (collection -> module -> pages -> assets). The deterministic tests hold the COLLECTION row in another
 * transaction, start the operation (it must wait, proving it takes the collection lock first), let the holder commit a delete, and
 * check that the operation then fails cleanly instead of writing beneath a parent that is gone. The stress tests run the
 * operations against each other from many threads and assert there is no deadlock, no 500 and that the audit finds no mismatch.
 *
 * <p>H2 only: this is evidence about the lock discipline, not about PostgreSQL's behaviour (backlog item P2 stays open).
 */
class MediaParentRaceTest extends MediaRefSupport {

    static Consumer<JdbcTemplate> softDelete(long collection) {
        return j -> j.update("update tracks set deleted_at = now(), status = 'DRAFT' where id = ?", collection);
    }

    static Consumer<JdbcTemplate> dropModule(long module) {
        return j -> {
            j.update("delete from lessons where section_id = ?", module);
            j.update("delete from sections where id = ?", module);
        };
    }

    // ------------------------------------------------------------------------------------------------------------------
    // an operation waits for the collection lock and then sees the committed parent state
    // ------------------------------------------------------------------------------------------------------------------
    @Test
    void aPageSaveWaitsForTheCollectionAndThenFailsIfTheCollectionWasSoftDeleted() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a);
        Holder h = holdAndThen(softDelete(c.id()), lockCollection(c.id()));
        Future<MvcResult> save = async(() -> savePage(a, p, List.of(image("i1", x))));
        assertBlocked(save);
        h.release();
        assertThat(status(result(save))).isEqualTo(404);
        assertThat(refCountOfAsset(x)).isZero();
        assertThat(jdbc.queryForObject("select blocks from lessons where id = ?", String.class, p)).isNotEqualTo("[{\"id\":\"i1\"}]");
    }

    @Test
    void aPageSaveWaitsForTheCollectionAndThenFailsIfItsModuleWasDeleted() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long m = module(a, c);
        long p = page(a, m, null);
        UUID x = uploadReal(a);
        Holder h = holdAndThen(dropModule(m), lockCollection(c.id()));
        Future<MvcResult> save = async(() -> savePage(a, p, List.of(image("i1", x))));
        assertBlocked(save);
        h.release();
        assertThat(status(result(save))).isEqualTo(404);
        assertThat(refCountOfAsset(x)).isZero();
    }

    @Test
    void aPageCreateWaitsForTheCollectionAndThenFailsIfTheModuleOrCollectionIsGone() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long m = module(a, c);
        UUID x = uploadReal(a);
        Holder h = holdAndThen(dropModule(m), lockCollection(c.id()));
        Future<MvcResult> create = async(() -> api(a, post("/api/modules/" + m + "/pages"), Map.of("title", "New", "blocks", List.of(image("i1", x)))));
        assertBlocked(create);
        h.release();
        assertThat(status(result(create))).as("module deleted while waiting").isEqualTo(404);

        long m2 = module(a, c);
        h = holdAndThen(softDelete(c.id()), lockCollection(c.id()));
        Future<MvcResult> create2 = async(() -> api(a, post("/api/modules/" + m2 + "/pages"), Map.of("title", "New", "blocks", List.of(image("i1", x)))));
        assertBlocked(create2);
        h.release();
        assertThat(status(result(create2))).as("collection soft-deleted while waiting").isEqualTo(404);
        assertThat(refCountOfAsset(x)).isZero();
        assertThat(jdbc.queryForObject("select count(*) from lessons where section_id = ?", Integer.class, m2)).isZero();
    }

    @Test
    void aPageDeleteAndAModuleDeleteWaitForTheCollection() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long m = module(a, c);
        long p = page(a, m, null);
        UUID x = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        Holder h = hold(lockCollection(c.id()));
        Future<MvcResult> del = async(() -> api(a, delete("/api/pages/" + p), null));
        Future<MvcResult> delMod = async(() -> api(a, delete("/api/modules/" + m), null));
        assertBlocked(del);
        assertBlocked(delMod);
        h.release();
        int s1 = status(result(del)), s2 = status(result(delMod));
        assertThat(List.of(s1, s2)).as("one deletes the page, the other finds it gone or deletes the module").allMatch(s -> s == 204 || s == 404);
        assertThat(s2).as("the module delete always succeeds").isEqualTo(204);
        assertThat(refCountOfAsset(x)).isZero();
        assertThat(stampOf(x)).as("freed by whichever ran").isNotNull();
    }

    @Test
    void aModuleDeleteAlsoWaitsForThePageLocksOfThePagesItRemoves() throws Exception {
        // page publish/unpublish/reorder keep page-level locking (they don't take the collection lock), so the module delete's own
        // module -> pages locks are what orders it against them
        Account a = signup();
        Coll c = collection(a);
        long m = module(a, c);
        long p = page(a, m, null);
        Holder h = hold(lockPage(p));
        Future<MvcResult> del = async(() -> api(a, delete("/api/modules/" + m), null));
        assertBlocked(del);
        h.release();
        assertThat(status(result(del))).isEqualTo(204);
    }

    @Test
    void aCoverChangeWaitsForTheCollectionAndFailsIfItWasSoftDeleted() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID x = uploadReal(a);
        Holder h = holdAndThen(softDelete(c.id()), lockCollection(c.id()));
        Future<MvcResult> set = async(() -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", x.toString())));
        assertBlocked(set);
        h.release();
        assertThat(status(result(set))).isEqualTo(404);
        assertThat(jdbc.queryForObject("select cover_asset_id from tracks where id = ?", String.class, c.id())).isNull();
    }

    @Test
    void aSoftDeleteAndARestoreWaitForTheCollectionToo() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        Holder h = hold(lockCollection(c.id()));
        Future<MvcResult> del = async(() -> api(a, delete("/api/collections/" + c.id()), null));
        assertBlocked(del);
        h.release();
        assertThat(status(result(del))).isEqualTo(204);
        h = hold(lockCollection(c.id()));
        Future<MvcResult> restore = async(() -> api(a, post("/api/collections/" + c.id() + "/restore"), null));
        assertBlocked(restore);
        h.release();
        assertThat(status(result(restore))).isEqualTo(200);
    }

    // ------------------------------------------------------------------------------------------------------------------
    // concurrent cover updates (the review's example): the collection lock serialises them
    // ------------------------------------------------------------------------------------------------------------------
    @Test
    void twoCoverUpdatesOnACollectionWithoutACoverRunOneAfterTheOtherAndLeaveOneCover() throws Exception {
        for (int round = 0; round < 5; round++) {
            Account a = signup();
            Coll c = collection(a);
            UUID b = uploadReal(a), d = uploadReal(a);
            Holder h = hold(lockCollection(c.id()));
            Future<MvcResult> setB = async(() -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", b.toString())));
            Future<MvcResult> setD = async(() -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", d.toString())));
            assertBlocked(setB);
            assertBlocked(setD);
            h.release();
            assertThat(status(result(setB))).isEqualTo(200);
            assertThat(status(result(setD))).isEqualTo(200);
            String cover = jdbc.queryForObject("select cover_asset_id from tracks where id = ?", String.class, c.id());
            UUID winner = UUID.fromString(cover), loser = winner.equals(b) ? d : b;
            assertThat(stampOf(winner)).as("round " + round + ": the final cover").isNull();
            assertThat(stampOf(loser)).as("round " + round + ": the one that was replaced is stamped, so it is not left referenced-but-unreferenced").isNotNull();
        }
        // (the audit that runs after the test also checks the referenced => no stamp invariant)
    }

    @Test
    void coverUpdatesFromAnExistingCoverAlsoSerialise() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID b = uploadReal(a), d = uploadReal(a), e = uploadReal(a);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", b.toString())), 200);
        Holder h = hold(lockCollection(c.id()));
        Future<MvcResult> toD = async(() -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", d.toString())));
        Future<MvcResult> toE = async(() -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", e.toString())));
        assertBlocked(toD);
        assertBlocked(toE);
        h.release();
        assertThat(status(result(toD))).isEqualTo(200);
        assertThat(status(result(toE))).isEqualTo(200);
        UUID winner = UUID.fromString(jdbc.queryForObject("select cover_asset_id from tracks where id = ?", String.class, c.id()));
        for (UUID u : List.of(b, d, e)) {
            if (u.equals(winner)) assertThat(stampOf(u)).isNull();
            else assertThat(stampOf(u)).as(u + " was a cover and is not any more").isNotNull();
        }
    }

    // ------------------------------------------------------------------------------------------------------------------
    // stress: everything against everything, real threads, no deadlock and a consistent end state
    // ------------------------------------------------------------------------------------------------------------------
    private List<Integer> runConcurrently(List<java.util.concurrent.Callable<MvcResult>> calls) throws Exception {
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> fs = new ArrayList<>();
        for (var call : calls) fs.add(async(() -> { go.await(); return status(call.call()); }));
        go.countDown();
        List<Integer> out = new ArrayList<>();
        for (Future<Integer> f : fs) out.add(f.get(60, java.util.concurrent.TimeUnit.SECONDS));
        return out;
    }

    @Test
    void aModuleDeleteRacingASaveThatAddsAReferenceNeverLeavesADanglingOrUnstampedAsset() throws Exception {
        for (int round = 0; round < 8; round++) {
            Account a = signup();
            Coll c = collection(a);
            long m = module(a, c);
            long p = page(a, m, null);
            long other = page(a, module(a, c), null);
            UUID only = uploadReal(a), shared = uploadReal(a);
            ok(savePage(a, other, List.of(image("i1", shared))), 200);
            List<Integer> r = runConcurrently(List.of(
                    () -> api(a, delete("/api/modules/" + m), null),
                    () -> savePage(a, p, List.of(image("i1", only), image("i2", shared)))));
            assertThat(r.get(0)).as("module delete, round " + round).isEqualTo(204);
            assertThat(r.get(1)).as("save, round " + round).isIn(200, 404);
            assertThat(refCountOfAsset(only)).as("nothing is left pointing at a deleted page").isZero();
            assertThat(stampOf(only)).as("an asset referenced only by the deleted module is stamped").isNotNull();
            assertThat(stampOf(shared)).as("an asset still used elsewhere is not").isNull();
            assertThat(refCountOfAsset(shared)).isEqualTo(1);
        }
    }

    @Test
    void twoModuleDeletesTouchingTheSameAssetsAndAPageSaveNeverDeadlock() throws Exception {
        for (int round = 0; round < 6; round++) {
            Account a = signup();
            Coll c = collection(a);
            long m1 = module(a, c), m2 = module(a, c);
            long p1 = page(a, m1, null), p2 = page(a, m2, null), p3 = page(a, m2, null);
            UUID x = uploadReal(a), y = uploadReal(a);
            ok(savePage(a, p1, List.of(image("i1", x), image("i2", y))), 200);
            ok(savePage(a, p2, List.of(image("i1", y), image("i2", x))), 200);
            List<Integer> r = runConcurrently(List.of(
                    () -> api(a, delete("/api/modules/" + m1), null),
                    () -> api(a, delete("/api/modules/" + m2), null),
                    () -> savePage(a, p3, List.of(image("i1", x)))));
            assertThat(r.get(0)).isEqualTo(204);
            assertThat(r.get(1)).isEqualTo(204);
            assertThat(r.get(2)).isIn(200, 404);
            assertThat(refCountOfAsset(y)).isZero();
            assertThat(stampOf(y)).isNotNull();
            // x: referenced only if the p3 save won against the m2 delete (it cannot: p3 lives in m2), so also freed
            assertThat(refCountOfAsset(x)).isZero();
            assertThat(stampOf(x)).isNotNull();
        }
    }

    @Test
    void aCoverUpdateRacingAPageSaveOnASharedAssetKeepsBothReferencesConsistent() throws Exception {
        for (int round = 0; round < 8; round++) {
            Account a = signup();
            Coll c = collection(a);
            long p = page(a, module(a, c), null);
            UUID x = uploadReal(a), y = uploadReal(a);
            ok(savePage(a, p, List.of(image("i1", x))), 200);
            List<Integer> r = runConcurrently(List.of(
                    () -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", x.toString())),
                    () -> savePage(a, p, List.of(image("i1", y))),
                    () -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", y.toString()))));
            assertThat(r).as("round " + round).allMatch(s -> s == 200);
            // x: cover (maybe) but no page reference; y: page reference (always) and maybe cover. The audit asserts the invariant afterwards.
            assertThat(refCountOfAsset(y)).isEqualTo(1);
            assertThat(stampOf(y)).isNull();
        }
    }

    @Test
    void randomOperationsAgainstTwoCollectionsNeverDeadlockOrLeaveAnInconsistentState() throws Exception {
        Account a = signup();
        Coll c1 = collection(a), c2 = collection(a);
        long m1 = module(a, c1), m2 = module(a, c2);
        long[] pages = {page(a, m1, null), page(a, m1, null), page(a, m2, null)};
        List<UUID> pool = uploads(a, 5);
        Random rnd = new Random(42);
        Map<String, Object> nullCover = new java.util.HashMap<>();
        nullCover.put("title", "T");
        nullCover.put("coverAssetId", null);
        CountDownLatch go = new CountDownLatch(1);
        List<Future<Integer>> fs = new ArrayList<>();
        for (int i = 0; i < 90; i++) {
            int op = rnd.nextInt(7), pi = rnd.nextInt(pages.length);
            List<Map<String, Object>> blocks = new ArrayList<>();
            for (int k = 0; k < rnd.nextInt(4); k++) blocks.add(image("b" + k, pool.get(rnd.nextInt(pool.size()))));
            UUID cover = pool.get(rnd.nextInt(pool.size()));
            boolean clearCover = rnd.nextBoolean();
            long page = pages[pi];
            Coll c = pi < 2 ? c1 : c2;
            long module = pi < 2 ? m1 : m2;
            fs.add(async(() -> {
                go.await();
                MvcResult r = switch (op) {
                    case 0, 1, 2 -> savePage(a, page, blocks);
                    case 3 -> api(a, put("/api/collections/" + c.id()), clearCover ? nullCover : Map.of("title", "T", "coverAssetId", cover.toString()));
                    case 4 -> api(a, post("/api/modules/" + module + "/pages"), Map.of("title", "N", "blocks", blocks));
                    case 5 -> api(a, delete("/api/pages/" + page), null);
                    default -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverUrl", "https://cdn.example.com/x.png"));
                };
                return status(r);
            }));
        }
        go.countDown();
        List<Integer> statuses = new ArrayList<>();
        for (Future<Integer> f : fs) statuses.add(f.get(90, java.util.concurrent.TimeUnit.SECONDS));
        assertThat(statuses).as("no lock timeout / deadlock / server error: %s", statuses).allMatch(s -> s == 200 || s == 201 || s == 204 || s == 400 || s == 404 || s == 409);
        assertThat(mediaAudit.audit()).isEmpty();
        // finish every orphan so the shared database stays tidy
        for (UUID u : pool) if (!mediaRefs.isReferenced(u)) assertThat(stampOf(u)).as("an unreferenced upload keeps an orphan clock").isNotNull();
    }
}
