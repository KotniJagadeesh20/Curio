package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.codemastery.content.Track;
import com.codemastery.content.TrackRepository;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Permanent collection purge (Step 20 will call it; nothing calls it in 12b except this test, which plays the part of that caller):
 * lock order collection -> modules -> pages -> assets, candidates collected after the locks and before the delete, and
 * {@code releaseAfter} stamps what nothing references any more. Also: the cover's RESTRICT foreign key can never block deleting the
 * collection (it protects the ASSET).
 */
class MediaPurgeContractTest extends MediaRefSupport {
    @Autowired TrackRepository trackRepo;

    @Test
    void purgingACollectionStampsItsCoverAndPageAssetsExceptThoseUsedElsewhere() throws Exception {
        Account a = signup();
        Coll doomed = collection(a), keeper = collection(a);
        long dm = module(a, doomed), km = module(a, keeper);
        UUID cover = uploadReal(a), onlyHere = uploadReal(a), shared = uploadReal(a), coverShared = uploadReal(a);
        long dp = page(a, dm, List.of(image("i1", onlyHere), image("i2", shared)));
        long kp = page(a, km, List.of(image("i1", shared)));
        ok(api(a, put("/api/collections/" + doomed.id()), Map.of("title", "T", "coverAssetId", cover.toString())), 200);
        ok(api(a, put("/api/collections/" + doomed.id()), Map.of("title", "T", "coverAssetId", coverShared.toString())), 200);
        ok(api(a, put("/api/collections/" + keeper.id()), Map.of("title", "T", "coverAssetId", coverShared.toString())), 200);
        ok(api(a, put("/api/collections/" + doomed.id()), Map.of("title", "T", "coverAssetId", cover.toString())), 200);   // doomed: cover; coverShared: keeper's too
        ok(api(a, put("/api/collections/" + keeper.id()), Map.of("title", "T", "coverAssetId", coverShared.toString())), 200);

        new TransactionTemplate(txManager).executeWithoutResult(s -> {
            // the caller's job: lock, collect, delete, flush, release
            jdbc.queryForList(lockCollection(doomed.id()));
            Track t = trackRepo.findById(doomed.id()).orElseThrow();
            Set<UUID> freed = mediaRefs.assetIdsOfCollection(t);
            assertThat(freed).containsExactlyInAnyOrder(cover, onlyHere, shared);
            trackRepo.delete(t);              // cascades modules and pages; the reference rows go with the pages
            trackRepo.flush();
            mediaRefs.releaseAfter(freed);
        });

        assertThat(trackRepo.findById(doomed.id())).as("the RESTRICT foreign key did not block deleting the collection").isEmpty();
        assertThat(stampOf(cover)).as("its cover, used nowhere else").isNotNull();
        assertThat(stampOf(onlyHere)).isNotNull();
        assertThat(stampOf(shared)).as("still on the keeper's page").isNull();
        assertThat(refCountOfAsset(shared)).isEqualTo(1);
        assertThat(refCount(kp)).isEqualTo(1);
        assertThat(refCount(dp)).isZero();
        assertThat(mediaRefs.isReferenced(coverShared)).isTrue();
        assertThat(stampOf(coverShared)).isNull();
    }

    @Test
    void softDeleteNeverReleasesAnything() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a), cover = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", cover.toString())), 200);
        ok(api(a, delete("/api/collections/" + c.id()), null), 204);
        assertThat(refCount(p)).isEqualTo(1);
        assertThat(stampOf(x)).isNull();
        assertThat(stampOf(cover)).isNull();
    }
}
