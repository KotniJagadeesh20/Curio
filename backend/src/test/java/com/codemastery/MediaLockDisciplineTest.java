package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Step 12b: the asset locks. A write must lock every asset whose reference state it changes, REMOVED ones included (the review's
 * "replace A with B" case), and must read them fresh, not from a copy the persistence context already holds.
 */
class MediaLockDisciplineTest extends MediaRefSupport {

    @Test
    void replacingAnImageWaitsForTheLockOfTheAssetBeingRemoved() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID oldImage = uploadReal(a), newImage = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", oldImage))), 200);
        Holder h = hold(lockAsset(oldImage));                      // e.g. a concurrent sweep or delete looking at the OLD image
        Future<MvcResult> replace = async(() -> savePage(a, p, List.of(image("i1", newImage))));
        assertBlocked(replace);                                    // the save locks the union: the removed asset too
        h.release();
        assertThat(status(result(replace))).isEqualTo(200);
        assertThat(refCountOfAsset(oldImage)).isZero();
        assertThat(stampOf(oldImage)).as("stamped under its lock").isNotNull();
    }

    @Test
    void removingAnImageAndDeletingAPageBothWaitForTheLockOfTheAssetTheyFree() throws Exception {
        Account a = signup();
        long m = module(a, collection(a));
        long p1 = page(a, m, null), p2 = page(a, m, null);
        UUID x = uploadReal(a), y = uploadReal(a);
        ok(savePage(a, p1, List.of(image("i1", x))), 200);
        ok(savePage(a, p2, List.of(image("i1", y))), 200);

        Holder h = hold(lockAsset(x));
        Future<MvcResult> remove = async(() -> savePage(a, p1, List.of()));
        assertBlocked(remove);
        h.release();
        assertThat(status(result(remove))).isEqualTo(200);

        h = hold(lockAsset(y));
        Future<MvcResult> del = async(() -> api(a, delete("/api/pages/" + p2), null));
        assertBlocked(del);
        h.release();
        assertThat(status(result(del))).isEqualTo(204);
        assertThat(stampOf(x)).isNotNull();
        assertThat(stampOf(y)).isNotNull();
    }

    @Test
    void aCoverChangeWaitsForTheOldCoversLockToo() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID oldCover = uploadReal(a), newCover = uploadReal(a);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", oldCover.toString())), 200);
        Holder h = hold(lockAsset(oldCover));
        Future<MvcResult> change = async(() -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", newCover.toString())));
        assertBlocked(change);
        h.release();
        assertThat(status(result(change))).isEqualTo(200);
        assertThat(stampOf(oldCover)).isNotNull();
    }

    @Test
    void theAssetLocksAreTakenInAscendingOrderSoOppositeOrderRequestsCannotDeadlock() throws Exception {
        Account a = signup();
        long m = module(a, collection(a));
        long p1 = page(a, m, null), p2 = page(a, m, null);
        List<UUID> pool = uploads(a, 4);
        // two pages naming the same assets in opposite orders, many times at once
        for (int round = 0; round < 6; round++) {
            List<Map<String, Object>> forward = List.of(image("b1", pool.get(0)), image("b2", pool.get(1)), image("b3", pool.get(2)), image("b4", pool.get(3)));
            List<Map<String, Object>> backward = List.of(image("b1", pool.get(3)), image("b2", pool.get(2)), image("b3", pool.get(1)), image("b4", pool.get(0)));
            Future<MvcResult> f1 = async(() -> savePage(a, p1, forward));
            Future<MvcResult> f2 = async(() -> savePage(a, p2, backward));
            assertThat(status(result(f1))).isEqualTo(200);
            assertThat(status(result(f2))).isEqualTo(200);
        }
    }

    /**
     * Observes the order itself instead of hoping for a deadlock: another transaction holds the LARGER of two assets, a page save names
     * both, and while it waits for the larger one it must already hold the SMALLER one (ascending order). A probe with NOWAIT proves it.
     */
    @Test
    void assetLocksAreAcquiredInAscendingOrder() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        List<UUID> two = uploads(a, 2);
        java.util.TreeSet<UUID> sorted = new java.util.TreeSet<>(two);
        UUID small = sorted.first(), large = sorted.last();
        Holder h = hold(lockAsset(large));
        Future<MvcResult> save = async(() -> savePage(a, p, List.of(image("i1", large), image("i2", small))));   // listed in descending order
        assertBlocked(save);
        // the save is parked on `large`; ascending order means it already holds `small`
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataAccessException.class,
                () -> jdbc.queryForList("select id from media_assets where id = '" + small + "' for update nowait"),
                "the smaller asset must already be locked by the waiting save");
        h.release();
        assertThat(status(result(save))).isEqualTo(200);
    }

    /**
     * The persistence-context pitfall: a JPQL lock query returns an entity that is ALREADY loaded without refreshing it. Here the asset
     * is loaded as READY, another transaction commits DELETING, and only then does the reference service lock it: it must see DELETING.
     */
    @Test
    void aLockedAssetIsReadFreshEvenWhenThePersistenceContextAlreadyHoldsAStaleCopy() throws Exception {
        Account a = signup();
        UUID x = uploadReal(a);
        Boolean ready = new TransactionTemplate(txManager).execute(s -> {
            assertThat(assets.findById(x).orElseThrow().getStatus()).isEqualTo(com.codemastery.media.MediaStatus.READY);   // now cached
            try {
                async(() -> jdbc.update("update media_assets set status = 'DELETING' where id = ?", x)).get();             // committed elsewhere
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
            var lock = mediaRefs.lockForBody(null, List.of(image("i1", x)));
            return lock.facts().get(x).ready();
        });
        assertThat(ready).as("the stale READY copy must not be used").isFalse();
        jdbc.update("update media_assets set status = 'READY' where id = ?", x);
    }
}
