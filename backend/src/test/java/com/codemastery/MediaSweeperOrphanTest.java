package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.codemastery.media.MediaStatus;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Future;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Step 12b sweeper: stamp-first, the 24 h grace, and the lock-and-recheck of both steps against references being created. */
class MediaSweeperOrphanTest extends MediaRefSupport {
    static final Duration GRACE = Duration.ofHours(24);

    private void stampAt(UUID id, Instant when) {
        jdbc.update("update media_assets set unreferenced_since = ? where id = ?", java.sql.Timestamp.from(when), id);
    }

    private boolean gone(UUID id) { return assets.findById(id).isEmpty(); }

    @Test
    void aReadyAssetWithoutAStampIsStampedFirstAndNeverPurgedInThePassThatStampedIt() throws Exception {
        Account a = signup();
        var x = insertAsset(a.id(), MediaStatus.READY, 10, 10, Instant.now());   // no stamp: e.g. orphaned by a cascade
        var far = Instant.now().plus(Duration.ofDays(365));
        var first = sweeper.sweepOnce(far);   // NB: a pass never purges what it stamped itself
        assertThat(first.stamped()).isGreaterThanOrEqualTo(1);
        // (other tests' leftover orphans share this database, so the assertions are about THIS asset, not global counts)
        assertThat(stampOf(x.getId())).as("stamped by this pass").isNotNull();
        assertThat(asset(x.getId()).getStatus()).as("stamped now, so it has to wait out the grace even with a far-future clock").isEqualTo(MediaStatus.READY);
        sweeper.sweepOnce(far);
        assertThat(gone(x.getId())).as("purged by the next pass").isTrue();
    }

    @Test
    void theGraceIsTwentyFourHoursFromTheStamp() throws Exception {
        Account a = signup();
        var x = insertAsset(a.id(), MediaStatus.READY, 10, 10, Instant.now());
        Instant stamp = Instant.now().minus(Duration.ofDays(3));
        stampAt(x.getId(), stamp);
        sweeper.sweepOnce(stamp.plus(GRACE).minus(Duration.ofMinutes(1)));
        assertThat(asset(x.getId()).getStatus()).as("23 h 59 m").isEqualTo(MediaStatus.READY);
        sweeper.sweepOnce(stamp.plus(GRACE).plus(Duration.ofMinutes(1)));
        assertThat(gone(x.getId())).as("24 h 01 m").isTrue();
    }

    @Test
    void aReferencedAssetIsNeverPurgedEvenWithAnAncientStamp() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a), cover = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", cover.toString())), 200);
        stampAt(x, Instant.now().minus(Duration.ofDays(400)));      // breaks the invariant on purpose: the sweeper must still not trust it
        stampAt(cover, Instant.now().minus(Duration.ofDays(400)));
        try {
            sweeper.sweepOnce(Instant.now().plus(Duration.ofDays(30)));
            assertThat(asset(x).getStatus()).isEqualTo(MediaStatus.READY);
            assertThat(asset(cover).getStatus()).isEqualTo(MediaStatus.READY);
            assertThat(mediaAudit.audit()).as("and the audit reports the broken invariant").hasSize(2)
                    .allMatch(f -> f.contains(x.toString()) || f.contains(cover.toString()));
        } finally {
            clearStamp(x);
            clearStamp(cover);
        }
    }

    @Test
    void aSweepIsIdempotentAndAWholeCycleLeavesNoOrphanBehind() throws Exception {
        Account a = signup();
        UUID x = uploadReal(a);
        var row = asset(x);
        Instant later = Instant.now().plus(Duration.ofDays(2));
        sweeper.sweepOnce(later);
        assertThat(gone(x)).isTrue();
        assertThat(storage.exists(row.getStorageKey())).isFalse();
        assertThat(storage.exists(row.getThumbKey())).isFalse();
        sweeper.sweepOnce(later);                                      // second run: nothing more to do for this asset
        assertThat(gone(x)).isTrue();
        assertThat(assets.countByOwner(a.id())).isZero();
    }

    // ------------------------------------------------------------------------------------------------------------------
    // recheck under the lock, deterministic (the candidate was selected, then the world changed)
    // ------------------------------------------------------------------------------------------------------------------
    @Test
    void stampingRechecksReferencesInsteadOfTrustingTheCandidateSelection() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        var x = insertAsset(a.id(), MediaStatus.READY, 10, 10, Instant.now());      // unreferenced, unstamped: a stamp candidate
        // ... the creator attaches it before the sweeper gets to it
        ok(savePage(a, p, List.of(image("i1", x.getId()))), 200);
        assertThat(mediaTx.stampIfOrphan(x.getId())).isFalse();
        assertThat(stampOf(x.getId())).as("no timestamp from an earlier observation").isNull();
        // a stamp that exists is never overwritten
        ok(savePage(a, p, List.of()), 200);
        Instant stamped = stampOf(x.getId());
        assertThat(stamped).isNotNull();
        assertThat(mediaTx.stampIfOrphan(x.getId())).isFalse();
        assertThat(stampOf(x.getId())).isEqualTo(stamped);
    }

    @Test
    void purgeReReadsTheStampUnderTheLockSoAnAttachThenDetachRestartsTheGrace() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID x = uploadReal(a);
        stampAt(x, Instant.now().minus(Duration.ofDays(2)));            // selected as a purge candidate (stamp older than the grace)
        Instant cutoff = Instant.now().minus(GRACE);
        // before the sweeper locks it: attached and detached again, which restamps with the current time
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        ok(savePage(a, p, List.of()), 200);
        assertThat(mediaTx.purgeIfOrphan(x, cutoff)).as("the stamp read under the lock is new").isFalse();
        assertThat(asset(x).getStatus()).isEqualTo(MediaStatus.READY);
        // and the grace really restarted: not purged 23 h after the detach, purged after 24 h
        Instant detached = stampOf(x);
        sweeper.sweepOnce(detached.plus(GRACE).minus(Duration.ofMinutes(1)));
        assertThat(asset(x).getStatus()).isEqualTo(MediaStatus.READY);
        sweeper.sweepOnce(detached.plus(GRACE).plus(Duration.ofMinutes(1)));
        assertThat(gone(x)).isTrue();
    }

    @Test
    void purgeRechecksReferencesToo() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID x = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        stampAt(x, Instant.now().minus(Duration.ofDays(2)));
        try {
            assertThat(mediaTx.purgeIfOrphan(x, Instant.now().minus(GRACE))).isFalse();
        } finally {
            clearStamp(x);
        }
    }

    // ------------------------------------------------------------------------------------------------------------------
    // real lock contention: the asset row is the synchronisation point
    // ------------------------------------------------------------------------------------------------------------------
    @Test
    void aSaveWaitingOnAnAssetLockSeesTheStateTheHolderCommittedNotAStaleCopy() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID x = uploadReal(a);
        // somebody holds the asset and, before releasing it, marks it DELETING (what DELETE or the purge does)
        Holder h = holdAndThen(j -> j.update("update media_assets set status = 'DELETING' where id = ?", x), lockAsset(x));
        Future<MvcResult> save = async(() -> savePage(a, p, List.of(image("i1", x))));
        assertBlocked(save);
        h.release();
        MvcResult r = result(save);
        assertThat(status(r)).as("a fresh read under the lock: the asset is no longer usable").isEqualTo(400);
        assertThat(refCountOfAsset(x)).isZero();
        jdbc.update("update media_assets set status = 'READY' where id = ?", x);   // leave a consistent state
    }

    @Test
    void aCoverChangeWaitingOnAnAssetLockAlsoSeesTheCommittedState() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID x = uploadReal(a);
        Holder h = holdAndThen(j -> j.update("update media_assets set status = 'DELETING' where id = ?", x), lockAsset(x));
        Future<MvcResult> set = async(() -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", x.toString())));
        assertBlocked(set);
        h.release();
        assertThat(status(result(set))).isEqualTo(400);
        jdbc.update("update media_assets set status = 'READY' where id = ?", x);
    }

    @Test
    void stampingAndAttachingAnOrphanSerialiseWhicheverRunsFirst() throws Exception {
        for (int round = 0; round < 6; round++) {
            Account a = signup();
            long p = page(a, module(a, collection(a)), null);
            var x = insertAsset(a.id(), MediaStatus.READY, 10, 10, Instant.now());      // an unstamped orphan: the stamp candidate
            Holder h = hold(lockAsset(x.getId()));
            Future<Boolean> stamp = async(() -> mediaTx.stampIfOrphan(x.getId()));
            Future<MvcResult> attach = async(() -> savePage(a, p, List.of(image("i1", x.getId()))));
            assertBlocked(stamp);
            assertBlocked(attach);
            h.release();
            Boolean stamped = result(stamp);
            assertThat(status(result(attach))).isEqualTo(200);
            // whoever ran first, the end state is the invariant: referenced and unstamped. A stale timestamp could not survive.
            assertThat(refCountOfAsset(x.getId())).isEqualTo(1);
            assertThat(stampOf(x.getId())).as("round " + round + " (stamp ran: " + stamped + ")").isNull();
        }
    }

    @Test
    void purgingAndAttachingAnOrphanEndInExactlyOneConsistentState() throws Exception {
        for (int round = 0; round < 6; round++) {
            Account a = signup();
            long p = page(a, module(a, collection(a)), null);
            UUID x = uploadReal(a);
            stampAt(x, Instant.now().minus(Duration.ofDays(2)));
            Holder h = hold(lockAsset(x));
            Future<Boolean> purge = async(() -> mediaTx.purgeIfOrphan(x, Instant.now().minus(GRACE)));
            Future<MvcResult> attach = async(() -> savePage(a, p, List.of(image("i1", x))));
            assertBlocked(purge);
            assertBlocked(attach);
            h.release();
            boolean purged = result(purge);
            int attachStatus = status(result(attach));
            var row = assets.findById(x).orElseThrow();
            if (purged) {
                assertThat(attachStatus).as("round " + round + ": purge won").isEqualTo(400);
                assertThat(row.getStatus()).isEqualTo(MediaStatus.DELETING);
                assertThat(refCountOfAsset(x)).isZero();
            } else {
                assertThat(attachStatus).as("round " + round + ": attach won").isEqualTo(200);
                assertThat(row.getStatus()).isEqualTo(MediaStatus.READY);
                assertThat(refCountOfAsset(x)).isEqualTo(1);
                assertThat(row.getUnreferencedSince()).isNull();
            }
            sweeper.sweepOnce(Instant.now());           // finish any DELETING row so nothing is left behind
        }
    }

    @Test
    void stampingAndAnAssetCoverSerialiseToo() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        var x = insertAsset(a.id(), MediaStatus.READY, 10, 10, Instant.now());
        Holder h = hold(lockAsset(x.getId()));
        Future<Boolean> stamp = async(() -> mediaTx.stampIfOrphan(x.getId()));
        Future<MvcResult> cover = async(() -> api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", x.getId().toString())));
        assertBlocked(stamp);
        assertBlocked(cover);
        h.release();
        result(stamp);
        assertThat(status(result(cover))).isEqualTo(200);
        assertThat(stampOf(x.getId())).isNull();
    }
}
