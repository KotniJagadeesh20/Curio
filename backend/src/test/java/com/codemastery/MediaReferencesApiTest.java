package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.codemastery.media.MediaStatus;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Step 12b: how images are referenced from page blocks (the reference lifecycle) and what the write boundary refuses. */
class MediaReferencesApiTest extends MediaRefSupport {

    @Test
    void savingAnImageBlockCreatesOneReferenceAndTheBodyRoundTripsUnchanged() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a);
        assertThat(stampOf(x)).as("an upload starts its 24 h orphan clock when it becomes READY").isNotNull();

        ok(savePage(a, p, List.of(image("i1", x), text("t1"))), 200);

        assertThat(refCount(p)).isEqualTo(1);
        assertThat(stampOf(x)).as("a referenced asset has no orphan stamp").isNull();
        JsonNode page = getPage(a, p);
        assertThat(page.get("blocks").get(0).get("assetId").asText()).isEqualTo(x.toString());
        assertThat(page.get("blocks").get(0).has("width")).as("blocks are never decorated: GET output can be PUT back").isFalse();
        assertThat(page.get("media").get(x.toString()).get("width").asInt()).isEqualTo(asset(x).getWidth());
        assertThat(page.get("media").get(x.toString()).get("contentType").asText()).isEqualTo("image/jpeg");
        // the exact blocks that came back are accepted again
        MvcResult again = api(a, put("/api/pages/" + p), Map.of("title", "T", "blocks", json.convertValue(page.get("blocks"), List.class)));
        ok(again, 200);
        assertThat(refCount(p)).isEqualTo(1);
    }

    @Test
    void aPageWhoseOnlyContentIsAnUploadedImageHasContent() throws Exception {
        // found in 12d: hasContent ignored assetId, so such a page was reported empty
        Account a = signup();
        Coll c = collection(a);
        long m = module(a, c);
        long p = page(a, m, null);
        ok(savePage(a, p, List.of(Map.of("id", "i1", "type", "image", "url", ""))), 200);
        assertThat(hasContentOf(a, c, p)).as("an image block with no source is blank").isFalse();
        ok(savePage(a, p, List.of(image("i1", uploadReal(a)))), 200);
        assertThat(hasContentOf(a, c, p)).isTrue();
    }

    private boolean hasContentOf(Account a, Coll c, long pageId) throws Exception {
        JsonNode detail = ok(api(a, get("/api/collections/" + c.id()), null), 200);
        for (JsonNode mod : detail.get("modules")) for (JsonNode pg : mod.get("pages")) if (pg.get("id").asLong() == pageId) return pg.get("hasContent").asBoolean();
        throw new AssertionError("page not in outline");
    }

    @Test
    void theSameImageTwiceOnOnePageIsOneReferenceRow() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID x = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x), image("i2", x))), 200);
        assertThat(refCount(p)).isEqualTo(1);
        // dropping one of the two blocks keeps the reference (and the asset stays unstamped)
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        assertThat(refCount(p)).isEqualTo(1);
        assertThat(stampOf(x)).isNull();
    }

    @Test
    void replacingAnImageSwapsTheReferenceAndMovesTheOrphanClock() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID x = uploadReal(a), y = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        Instant before = Instant.now();
        ok(savePage(a, p, List.of(image("i1", y))), 200);
        assertThat(refCount(p)).isEqualTo(1);
        assertThat(refCountOfAsset(y)).isEqualTo(1);
        assertThat(refCountOfAsset(x)).isZero();
        assertThat(stampOf(y)).isNull();
        assertThat(stampOf(x)).as("the replaced asset is stamped when its last reference goes").isNotNull().isAfterOrEqualTo(before.minusSeconds(1));
    }

    @Test
    void removingTheImageStampsItAndAnImageSharedByTwoPagesStaysReferenced() throws Exception {
        Account a = signup();
        long m = module(a, collection(a));
        long p1 = page(a, m, null), p2 = page(a, m, null);
        UUID x = uploadReal(a);
        ok(savePage(a, p1, List.of(image("i1", x))), 200);
        ok(savePage(a, p2, List.of(image("i1", x))), 200);
        assertThat(refCountOfAsset(x)).isEqualTo(2);

        ok(savePage(a, p1, List.of(text("t1"))), 200);
        assertThat(refCountOfAsset(x)).isEqualTo(1);
        assertThat(stampOf(x)).as("still used by the other page").isNull();

        ok(savePage(a, p2, List.of()), 200);
        assertThat(refCountOfAsset(x)).isZero();
        assertThat(stampOf(x)).isNotNull();
    }

    @Test
    void aMetadataOnlySaveNeverTouchesBodyOrReferences() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID x = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        jdbc.update("update media_assets set unreferenced_since = null where id = ?", x);
        String bodyBefore = jdbc.queryForObject("select blocks from lessons where id = ?", String.class, p);
        ok(api(a, put("/api/pages/" + p), Map.of("title", "Only the title changed")), 200);   // no "blocks" field at all
        assertThat(jdbc.queryForObject("select blocks from lessons where id = ?", String.class, p)).isEqualTo(bodyBefore);
        assertThat(refCount(p)).isEqualTo(1);
        // and a metadata save does not even look at the asset: damage it, the save still works
        jdbc.update("update media_assets set status = 'DELETING' where id = ?", x);
        try {
            ok(api(a, put("/api/pages/" + p), Map.of("title", "Still fine")), 200);
        } finally {
            jdbc.update("update media_assets set status = 'READY' where id = ?", x);
        }
    }

    @Test
    void anAutosaveOfADraftCountsAsAReference() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID x = uploadReal(a);
        ok(api(a, put("/api/pages/" + p), Map.of("title", "T", "autosave", true, "blocks", List.of(image("i1", x)))), 200);
        assertThat(refCount(p)).isEqualTo(1);
    }

    @Test
    void creatingAPageWithImagesCreatesTheReferences() throws Exception {
        Account a = signup();
        long m = module(a, collection(a));
        UUID x = uploadReal(a), y = uploadReal(a);
        long p = page(a, m, List.of(image("i1", x), image("i2", y)));
        assertThat(refCount(p)).isEqualTo(2);
        assertThat(stampOf(x)).isNull();
        assertThat(stampOf(y)).isNull();
    }

    @Test
    void theWriteBoundaryRefusesUnusableAssetsAndWritesNothing() throws Exception {
        Account a = signup(), b = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID good = uploadReal(a), theirs = uploadReal(b);
        ok(savePage(a, p, List.of(image("i1", good))), 200);
        String body = jdbc.queryForObject("select blocks from lessons where id = ?", String.class, p);
        int version = jdbc.queryForObject("select version from lessons where id = ?", Integer.class, p);

        var uploading = insertAsset(a.id(), MediaStatus.UPLOADING, 10, 10, Instant.now());
        var deleting = insertAsset(a.id(), MediaStatus.DELETING, 10, 10, Instant.now());
        List<Map<String, Object>> bad = List.of(
                image("x1", UUID.randomUUID()),                     // unknown
                image("x2", theirs),                                // somebody else's
                image("x3", uploading.getId()),                     // not READY
                image("x4", deleting.getId()));                     // being deleted
        for (Map<String, Object> block : bad) {
            MvcResult r = savePage(a, p, List.of(block));
            JsonNode n = ok(r, 400);
            assertThat(n.get("code").asText()).isEqualTo("INVALID_BLOCKS");
            assertThat(n.get("problems").get(0).get("field").asText()).isEqualTo("assetId");
            assertThat(n.get("problems").get(0).get("message").asText()).as("one answer for unknown, not-ready and foreign").isEqualTo("This image isn't available. Upload it again.");
        }
        for (Map<String, Object> block : List.of(
                Map.<String, Object>of("id", "m1", "type", "image", "assetId", good.toString(), "url", "https://x.example/a.png"),   // both sources
                Map.<String, Object>of("id", "m2", "type", "image", "assetId", "not-a-uuid"),
                Map.<String, Object>of("id", "m3", "type", "image", "assetId", good.toString().toUpperCase()),                    // not canonical
                Map.<String, Object>of("id", "m4", "type", "image", "assetId", ""),
                Map.<String, Object>of("id", "m5", "type", "image", "assetId", 5),
                Map.<String, Object>of("id", "m6", "type", "video", "assetId", good.toString(), "url", "https://x.example/v.mp4"),   // video has no assets
                Map.<String, Object>of("id", "m7", "type", "html", "html", "<b>x</b>", "assetId", good.toString()))) {
            assertThat(ok(savePage(a, p, List.of(block)), 400).get("code").asText()).isEqualTo("INVALID_BLOCKS");
        }
        // nothing was written by any refusal
        assertThat(jdbc.queryForObject("select blocks from lessons where id = ?", String.class, p)).isEqualTo(body);
        assertThat(jdbc.queryForObject("select version from lessons where id = ?", Integer.class, p)).isEqualTo(version);
        assertThat(refCount(p)).isEqualTo(1);
        assertThat(refCountOfAsset(theirs)).isZero();
        assertThat(stampOf(good)).isNull();
        jdbc.update("delete from media_assets where id in (?, ?)", uploading.getId(), deleting.getId());
    }

    @Test
    void anImageUrlStillWorksAndIsNotAReference() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        ok(savePage(a, p, List.of(Map.of("id", "i1", "type", "image", "url", "https://x.example/a.png"))), 200);
        assertThat(refCount(p)).isZero();
    }

    @Test
    void deletingAPageOrModuleStampsWhatItFreedButNotWhatIsStillUsed() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long m1 = module(a, c), m2 = module(a, c);
        UUID onlyHere = uploadReal(a), shared = uploadReal(a), inModule = uploadReal(a);
        long p1 = page(a, m1, List.of(image("i1", onlyHere), image("i2", shared)));
        long p2 = page(a, m2, List.of(image("i1", shared)));
        long p3 = page(a, m1, List.of(image("i1", inModule)));
        assertThat(refCountOfAsset(shared)).isEqualTo(2);

        ok(api(a, delete("/api/pages/" + p1), null), 204);
        assertThat(refCountOfAsset(onlyHere)).isZero();
        assertThat(stampOf(onlyHere)).as("freed by the page delete").isNotNull();
        assertThat(stampOf(shared)).as("still on the other page").isNull();

        ok(api(a, delete("/api/modules/" + m1), null), 204);
        assertThat(refCountOfAsset(inModule)).isZero();
        assertThat(stampOf(inModule)).as("freed by the module delete").isNotNull();
        assertThat(refCountOfAsset(shared)).isEqualTo(1);
        assertThat(refCount(p2)).isEqualTo(1);
        assertThat(refCount(p3)).isZero();
    }

    @Test
    void aSoftDeletedCollectionKeepsItsReferencesAndRestoreWorks() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a), cover = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", cover.toString())), 200);

        ok(api(a, delete("/api/collections/" + c.id()), null), 204);
        assertThat(refCount(p)).as("page references survive a soft delete").isEqualTo(1);
        assertThat(asset(cover)).isNotNull();
        assertThat(stampOf(x)).isNull();
        assertThat(stampOf(cover)).isNull();
        assertThat(mediaRefs.isReferenced(cover)).as("a soft-deleted collection's cover still counts").isTrue();

        ok(api(a, post("/api/collections/" + c.id() + "/restore"), null), 200);
        assertThat(getPage(a, p).get("blocks").get(0).get("assetId").asText()).isEqualTo(x.toString());
        assertThat(ok(api(a, get("/api/collections/" + c.id()), null), 200).get("collection").get("coverAssetId").asText()).isEqualTo(cover.toString());
    }

    @Test
    void aSoftDeletedCollectionRefusesPageWrites() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a);
        ok(api(a, delete("/api/collections/" + c.id()), null), 204);
        assertThat(status(savePage(a, p, List.of(image("i1", x))))).isEqualTo(404);
        assertThat(refCountOfAsset(x)).isZero();
    }

    @Test
    void onlyTheOwnerOfTheCollectionIsHeardAndNoLockIsNeededForAStranger() throws Exception {
        Account a = signup(), b = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID theirs = uploadReal(b);
        assertThat(status(savePage(b, p, List.of(image("i1", theirs))))).isIn(403, 404);
        assertThat(refCountOfAsset(theirs)).isZero();
    }
}
