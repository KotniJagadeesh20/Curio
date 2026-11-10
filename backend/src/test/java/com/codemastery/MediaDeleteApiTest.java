package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.reset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.codemastery.media.MediaStatus;
import com.codemastery.media.MediaStorage;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.test.web.servlet.MvcResult;

/** Step 12b: {@code DELETE /api/media/{id}}. */
class MediaDeleteApiTest extends MediaRefSupport {
    @SpyBean MediaStorage spyStorage;

    @AfterEach
    void unstub() { reset(spyStorage); }

    private MvcResult del(String token, UUID id) throws Exception {
        return mvc.perform(delete("/api/media/" + id).header("Authorization", "Bearer " + token)).andReturn();
    }

    @Test
    void anUnusedAssetIsDeletedOnTheSpotWithObjectsRowAndQuota() throws Exception {
        Account a = signup();
        UUID x = uploadReal(a);
        var row = asset(x);
        assertThat(assets.countByOwner(a.id())).isEqualTo(1);
        assertThat(status(del(a.token(), x))).isEqualTo(204);
        assertThat(assets.findById(x)).isEmpty();
        assertThat(spyStorage.exists(row.getStorageKey())).isFalse();
        assertThat(spyStorage.exists(row.getThumbKey())).isFalse();
        assertThat(assets.countByOwner(a.id())).as("quota released with the row").isZero();
        assertThat(status(del(a.token(), x))).as("gone: same answer as unknown").isEqualTo(404);
    }

    @Test
    void aReferencedAssetIsRefusedWithWhereItIsUsed() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        JsonNode n = ok(del(a.token(), x), 409);
        assertThat(n.get("code").asText()).isEqualTo("MEDIA_IN_USE");
        assertThat(n.get("totalUsages").asInt()).isEqualTo(1);
        JsonNode u = n.get("usages").get(0);
        assertThat(u.get("kind").asText()).isEqualTo("PAGE");
        assertThat(u.get("collectionId").asLong()).isEqualTo(c.id());
        assertThat(u.get("pageId").asLong()).isEqualTo(p);
        assertThat(u.get("pageTitle").asText()).isEqualTo("T");
        assertThat(u.get("inTrash").asBoolean()).isFalse();
        assertThat(assets.findById(x)).isPresent();
        assertThat(asset(x).getStatus()).isEqualTo(MediaStatus.READY);

        ok(savePage(a, p, List.of()), 200);                       // no longer used
        assertThat(status(del(a.token(), x))).isEqualTo(204);
    }

    @Test
    void aCoverIsAUsageAndASoftDeletedCollectionStillCounts() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID x = uploadReal(a);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", x.toString())), 200);
        JsonNode n = ok(del(a.token(), x), 409);
        assertThat(n.get("usages").get(0).get("kind").asText()).isEqualTo("COVER");
        assertThat(n.get("usages").get(0).get("inTrash").asBoolean()).isFalse();

        ok(api(a, delete("/api/collections/" + c.id()), null), 204);
        n = ok(del(a.token(), x), 409);
        assertThat(n.get("usages").get(0).get("inTrash").asBoolean()).as("in the trash, not forgotten").isTrue();
        assertThat(asset(x)).isNotNull();
    }

    @Test
    void usagesAreCappedAtTwentyButTheTotalIsReal() throws Exception {
        Account a = signup();
        long m = module(a, collection(a));
        UUID x = uploadReal(a);
        List<Long> pages = new ArrayList<>();
        for (int i = 0; i < 23; i++) pages.add(page(a, m, List.of(image("i1", x))));
        JsonNode n = ok(del(a.token(), x), 409);
        assertThat(n.get("usages")).hasSize(20);
        assertThat(n.get("totalUsages").asInt()).isEqualTo(23);
        for (long p : pages) ok(savePage(a, p, List.of()), 200);   // leave a consistent state
    }

    @Test
    void anUploadInProgressIsNotReady() throws Exception {
        Account a = signup();
        var up = insertAsset(a.id(), MediaStatus.UPLOADING, 10, 10, Instant.now());
        JsonNode n = ok(del(a.token(), up.getId()), 409);
        assertThat(n.get("code").asText()).isEqualTo("MEDIA_NOT_READY");
        assertThat(asset(up.getId()).getStatus()).isEqualTo(MediaStatus.UPLOADING);
        jdbc.update("delete from media_assets where id = ?", up.getId());
    }

    @Test
    void aRepeatOnADeletingAssetIsNoContentAndFinishesTheCleanup() throws Exception {
        Account a = signup();
        UUID x = uploadReal(a);
        jdbc.update("update media_assets set status = 'DELETING' where id = ?", x);
        assertThat(status(del(a.token(), x))).isEqualTo(204);
        assertThat(assets.findById(x)).isEmpty();
    }

    @Test
    void aStorageFailureStillAnswersNoContentAndTheSweeperFinishesTheJob() throws Exception {
        Account a = signup();
        UUID x = uploadReal(a);
        var row = asset(x);
        doThrow(new IOException("disk gone")).when(spyStorage).delete(anyString());
        assertThat(status(del(a.token(), x))).isEqualTo(204);
        assertThat(asset(x).getStatus()).isEqualTo(MediaStatus.DELETING);
        assertThat(assets.countByOwner(a.id())).as("keeps counting against quota until the row is removed").isEqualTo(1);
        reset(spyStorage);
        sweeper.sweepOnce(Instant.now());
        assertThat(assets.findById(x)).isEmpty();
        assertThat(spyStorage.exists(row.getStorageKey())).isFalse();
    }

    @Test
    void onlyTheOwnerMayDeleteAndTheRefusalsReuseTheExistingRules() throws Exception {
        Account a = signup(), b = signup();
        UUID x = uploadReal(a);
        assertThat(status(del(b.token(), x))).as("another user").isEqualTo(404);
        assertThat(status(del(adminToken(), x))).as("admins get no creator access").isEqualTo(404);
        assertThat(status(del(a.token(), UUID.randomUUID()))).isEqualTo(404);
        assertThat(status(mvc.perform(delete("/api/media/" + x)).andReturn())).as("anonymous").isEqualTo(401);
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.id());
        try {
            assertThat(status(del(a.token(), x))).as("suspended: the same 401 as every creator endpoint, not a new 403").isEqualTo(401);
        } finally {
            jdbc.update("update users set status = 'ACTIVE' where id = ?", a.id());
        }
        assertThat(asset(x).getStatus()).isEqualTo(MediaStatus.READY);
        assertThat(status(del(a.token(), x))).isEqualTo(204);
    }

    @Test
    void theForeignKeyIsTheSafetyNetAReferencedRowCannotBeRemovedUnderneath() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a), cover = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", cover.toString())), 200);
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("delete from media_assets where id = ?", x));
        org.junit.jupiter.api.Assertions.assertThrows(org.springframework.dao.DataIntegrityViolationException.class,
                () -> jdbc.update("delete from media_assets where id = ?", cover));
        // ... and it is the ASSET that is protected: the collection row itself can be deleted while it has an asset cover
        jdbc.update("delete from lessons where section_id in (select id from sections where track_id = ?)", c.id());   // cascades the reference row
        jdbc.update("delete from sections where track_id = ?", c.id());
        jdbc.update("delete from tracks where id = ?", c.id());
        assertThat(assets.findById(cover)).isPresent();
        assertThat(mediaRefs.isReferenced(cover)).isFalse();
    }
}
