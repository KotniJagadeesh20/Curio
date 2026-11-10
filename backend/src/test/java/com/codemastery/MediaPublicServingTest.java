package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.codemastery.content.CollectionStatus;
import com.codemastery.content.ModerationStatus;
import com.codemastery.content.PageStatus;
import com.codemastery.content.Visibility;
import com.codemastery.media.MediaAssetRepository;
import com.codemastery.user.UserStatus;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.support.TransactionTemplate;

/** Step 12b: anonymous media serving, its headers and conditional requests, and SQL-vs-Visibility parity. */
class MediaPublicServingTest extends MediaRefSupport {
    @Autowired MediaAssetRepository assetRepo;
    @Autowired com.codemastery.content.LessonRepository lessonRepo;
    @Autowired com.codemastery.content.TrackRepository trackRepo;

    record Pub(Account owner, Coll coll, long module, long page, UUID asset) {}

    /** A published collection with one published page that shows one uploaded image. */
    private Pub published(Account a) throws Exception {
        Coll c = collection(a);
        long m = module(a, c);
        UUID x = uploadReal(a);
        long p = page(a, m, List.of(image("i1", x)));
        publishPage(a, p);
        publishCollection(a, c);
        return new Pub(a, c, m, p, x);
    }

    private MvcResult pub(String url) throws Exception { return mvc.perform(get(url)).andReturn(); }

    private MvcResult pub(String url, String ifNoneMatch) throws Exception { return mvc.perform(get(url).header(HttpHeaders.IF_NONE_MATCH, ifNoneMatch)).andReturn(); }

    private static String url(UUID id) { return "/api/public/media/" + id; }

    @Test
    void aPublishedPagesImageIsServedAnonymouslyWithTheDocumentedHeaders() throws Exception {
        Pub p = published(signup());
        MvcResult r = pub(url(p.asset));
        assertThat(status(r)).isEqualTo(200);
        var h = r.getResponse();
        assertThat(h.getContentType()).isEqualTo("image/jpeg");
        assertThat(h.getHeader("Cache-Control")).isEqualTo("max-age=60, public");
        assertThat(h.getHeader("ETag")).isEqualTo("\"" + asset(p.asset).getSha256() + "\"");
        assertThat(h.getHeader("X-Content-Type-Options")).isEqualTo("nosniff");
        assertThat(h.getHeader("Content-Security-Policy")).isEqualTo("default-src 'none'; sandbox");
        assertThat(h.getHeader("Content-Disposition")).isNull();
        assertThat(h.getHeader("Accept-Ranges")).isEqualTo("none");
        assertThat(h.getContentLength()).isEqualTo((int) asset(p.asset).getSizeBytes());
        assertThat(h.getContentAsByteArray()).hasSize((int) asset(p.asset).getSizeBytes());

        MvcResult t = pub(url(p.asset) + "/thumb");
        assertThat(status(t)).isEqualTo(200);
        assertThat(t.getResponse().getHeader("ETag")).isEqualTo("\"" + asset(p.asset).getThumbSha256() + "\"");
        assertThat(t.getResponse().getContentLength()).isEqualTo((int) asset(p.asset).getThumbSizeBytes());
    }

    @Test
    void conditionalRequestsUseWeakComparisonAndNeverOutliveVisibility() throws Exception {
        Account a = signup();
        Pub p = published(a);
        String sha = asset(p.asset).getSha256();
        for (String inm : new String[] {"\"" + sha + "\"", "W/\"" + sha + "\"", "*", "\"zzz\", \"" + sha + "\"", "W/\"zzz\",W/\"" + sha + "\""}) {
            MvcResult r = pub(url(p.asset), inm);
            assertThat(status(r)).as(inm).isEqualTo(304);
            assertThat(r.getResponse().getContentAsByteArray()).isEmpty();
            assertThat(r.getResponse().getHeader("ETag")).isEqualTo("\"" + sha + "\"");
            assertThat(r.getResponse().getHeader("Cache-Control")).isEqualTo("max-age=60, public");
        }
        // malformed headers are no match (200). Two of these are ones Spring's own, more lenient parser WOULD match (it finds the tag
        // anywhere in the text), which is why the controller must not let Spring evaluate If-None-Match
        for (String inm : new String[] {"\"zzz\"", "sha", "\"" + sha, "\"x\" junk", "\"zzz\" \"" + sha + "\"", "\"" + sha + "\" junk", "junk \"" + sha + "\""}) {
            assertThat(status(pub(url(p.asset), inm))).as(inm).isEqualTo(200);
        }
        // the thumbnail has its own tag: with an image larger than the thumbnail edge the two variants differ, and a tag only matches its own
        MvcResult bigUpload = mvc.perform(upload(a.token(), "big.jpg", "image/jpeg", com.codemastery.media.MediaFixtures.jpeg(1400, 900))).andReturn();
        UUID big = UUID.fromString(ok(bigUpload, 201).get("id").asText());
        ok(savePage(a, p.page, List.of(image("i1", p.asset), image("i2", big))), 200);
        String bigSha = asset(big).getSha256(), bigThumbSha = asset(big).getThumbSha256();
        assertThat(bigThumbSha).isNotEqualTo(bigSha);
        assertThat(status(pub(url(big) + "/thumb", "\"" + bigSha + "\""))).as("original's tag on the thumbnail").isEqualTo(200);
        assertThat(status(pub(url(big), "\"" + bigThumbSha + "\""))).as("thumbnail's tag on the original").isEqualTo(200);
        assertThat(status(pub(url(big) + "/thumb", "W/\"" + bigThumbSha + "\""))).isEqualTo(304);
        ok(savePage(a, p.page, List.of(image("i1", p.asset))), 200);

        // revoke: the same, valid conditional request is now a 404, never a 304
        ok(api(a, post("/api/pages/" + p.page + "/unpublish"), null), 200);
        assertThat(status(pub(url(p.asset), "\"" + sha + "\""))).isEqualTo(404);
        assertThat(status(pub(url(p.asset), "*"))).isEqualTo(404);
        assertThat(status(pub(url(p.asset)))).isEqualTo(404);
    }

    @Test
    void everyRefusalIsTheSameNotFound() throws Exception {
        Account a = signup();
        Pub p = published(a);
        UUID draftOnly = uploadReal(a);                                  // referenced only by a draft page
        long draftPage = page(a, p.module, List.of(image("d1", draftOnly)));
        UUID unreferenced = uploadReal(a);
        String expected = pub(url(UUID.randomUUID())).getResponse().getContentAsString();
        for (String bad : new String[] {url(draftOnly), url(unreferenced), url(UUID.randomUUID()), "/api/public/media/not-a-uuid",
                "/api/public/media/" + p.asset.toString().toUpperCase().replace('-', '_'), url(draftOnly) + "/thumb"}) {
            MvcResult r = pub(bad);
            assertThat(status(r)).as(bad).isEqualTo(404);
            assertThat(r.getResponse().getContentAsString()).as(bad).isEqualTo(expected);
            assertThat(r.getResponse().getHeader("ETag")).isNull();
        }
        assertThat(draftPage).isPositive();
    }

    @Test
    void anImageSharedByAPublicPageAndADraftIsPublicAndADraftOnlyImageIsNot() throws Exception {
        Account a = signup();
        Pub p = published(a);
        long draft = page(a, p.module, List.of(image("d1", p.asset)));
        assertThat(status(pub(url(p.asset)))).isEqualTo(200);
        // the draft's text is never exposed through the public API
        ok(api(a, put("/api/pages/" + draft), Map.of("title", "T", "blocks", List.of(text("secret")))), 200);
        assertThat(status(pub(url(p.asset)))).isEqualTo(200);
        // once the only public page stops using it, it is private again
        ok(savePage(a, p.page, List.of()), 200);
        ok(savePage(a, draft, List.of(image("d1", p.asset))), 200);
        assertThat(status(pub(url(p.asset)))).isEqualTo(404);
    }

    @Test
    void unlistedHiddenDeletedAndSuspendedBehaveLikeTheContentThatUsesThem() throws Exception {
        Account a = signup();
        Pub p = published(a);
        assertThat(status(pub(url(p.asset)))).isEqualTo(200);

        ok(api(a, post("/api/collections/" + p.coll.id() + "/publish"), Map.of("status", "UNLISTED")), 200);
        assertThat(status(pub(url(p.asset)))).as("unlisted: direct link works").isEqualTo(200);
        publishCollection(a, p.coll);

        jdbc.update("update tracks set moderation_status = 'HIDDEN' where id = ?", p.coll.id());
        assertThat(status(pub(url(p.asset)))).as("hidden").isEqualTo(404);
        jdbc.update("update tracks set moderation_status = 'OK' where id = ?", p.coll.id());
        assertThat(status(pub(url(p.asset)))).isEqualTo(200);

        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.id());
        assertThat(status(pub(url(p.asset)))).as("suspended owner").isEqualTo(404);
        jdbc.update("update users set status = 'ACTIVE' where id = ?", a.id());
        assertThat(status(pub(url(p.asset)))).isEqualTo(200);

        ok(api(a, delete("/api/collections/" + p.coll.id()), null), 204);
        assertThat(status(pub(url(p.asset)))).as("soft-deleted").isEqualTo(404);
        ok(api(a, post("/api/collections/" + p.coll.id() + "/restore"), null), 200);
        assertThat(status(pub(url(p.asset)))).as("restored collections come back as drafts").isEqualTo(404);
    }

    @Test
    void aCollectionCoverIsPublicOnlyWhileTheCollectionIsReadableWithAPublishedPage() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long m = module(a, c);
        long p = page(a, m, null);
        UUID cover = uploadReal(a);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "Covered", "coverAssetId", cover.toString())), 200);
        assertThat(status(pub(url(cover)))).as("draft collection").isEqualTo(404);
        publishPage(a, p);
        publishCollection(a, c);
        assertThat(status(pub(url(cover)))).isEqualTo(200);
        assertThat(status(pub(url(cover) + "/thumb"))).isEqualTo(200);

        JsonNode listed = json.readTree(pub("/api/public/collections?q=Covered").getResponse().getContentAsString());
        JsonNode item = listed.get("items").get(0);
        assertThat(item.get("coverUrl").asText()).isEqualTo(url(cover));
        assertThat(item.get("coverThumbUrl").asText()).isEqualTo(url(cover) + "/thumb");

        ok(api(a, post("/api/pages/" + p + "/unpublish"), null), 200);   // no published page: the cover goes private with the collection
        assertThat(status(pub(url(cover)))).isEqualTo(404);

        // a legacy link cover has no thumbnail
        publishPage(a, p);
        ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "Covered", "coverUrl", "https://cdn.example.com/c.png")), 200);
        item = json.readTree(pub("/api/public/collections?q=Covered").getResponse().getContentAsString()).get("items").get(0);
        assertThat(item.get("coverUrl").asText()).isEqualTo("https://cdn.example.com/c.png");
        assertThat(item.get("coverThumbUrl").isNull()).isTrue();
        assertThat(status(pub(url(cover)))).as("no longer a cover").isEqualTo(404);
    }

    @Test
    void thePublicPageShowsAUrlWidthAndHeightInsteadOfTheAssetId() throws Exception {
        Account a = signup();
        Pub p = published(a);
        JsonNode page = json.readTree(pub("/api/public/pages/" + p.coll.owner() + "/" + p.coll.slug() + "/mod/" + slugOf(p.page)).getResponse().getContentAsString());
        JsonNode block = page.get("page").get("blocks").get(0);
        assertThat(block.get("type").asText()).isEqualTo("image");
        assertThat(block.has("assetId")).as("the id is only part of the url").isFalse();
        assertThat(block.get("url").asText()).isEqualTo(url(p.asset));
        assertThat(block.get("width").asInt()).isEqualTo(asset(p.asset).getWidth());
        assertThat(block.get("height").asInt()).isEqualTo(asset(p.asset).getHeight());
        // a stale reference (asset no longer READY) is omitted like any bad block, never leaked as a broken url
        jdbc.update("update media_assets set owner_id = ? where id = ?", signup().id(), p.asset);
        try {
            JsonNode again = json.readTree(pub("/api/public/pages/" + p.coll.owner() + "/" + p.coll.slug() + "/mod/" + slugOf(p.page)).getResponse().getContentAsString());
            assertThat(again.get("page").get("blocks")).isEmpty();
            assertThat(status(pub(url(p.asset)))).isEqualTo(404);
        } finally {
            jdbc.update("update media_assets set owner_id = ? where id = ?", p.owner.id(), p.asset);
        }
    }

    private String slugOf(long pageId) { return jdbc.queryForObject("select slug from lessons where id = ?", String.class, pageId); }

    // ------------------------------------------------------------------------------------------------------------------
    // parity with Visibility
    // ------------------------------------------------------------------------------------------------------------------
    @Test
    void theSqlRuleAgreesWithVisibilityForTheWholeMatrix() throws Exception {
        Account a = signup();
        List<String> differences = new ArrayList<>();
        int combos = 0;
        for (CollectionStatus cs : CollectionStatus.values())
            for (ModerationStatus ms : ModerationStatus.values())
                for (boolean deleted : new boolean[] {false, true})
                    for (UserStatus us : UserStatus.values())
                        for (PageStatus ps : PageStatus.values()) {
                            Coll c = collection(a);
                            long m = module(a, c);
                            UUID pageAsset = uploadReal(a), coverAsset = uploadReal(a);
                            long p = page(a, m, List.of(image("i1", pageAsset)));
                            ok(api(a, put("/api/collections/" + c.id()), Map.of("title", "T", "coverAssetId", coverAsset.toString())), 200);
                            jdbc.update("update tracks set status = ?, moderation_status = ?, deleted_at = ? where id = ?", cs.name(), ms.name(),
                                    deleted ? java.sql.Timestamp.from(java.time.Instant.now()) : null, c.id());
                            jdbc.update("update lessons set status = ? where id = ?", ps.name(), p);
                            jdbc.update("update users set status = ? where id = ?", us.name(), a.id());
                            combos++;
                            try {
                                // the oracle: Visibility, evaluated on the real loaded rows
                                boolean[] expected = new TransactionTemplate(txManager).execute(s -> {
                                    var lesson = lessonRepo.findById(p).orElseThrow();
                                    var track = trackRepo.findById(c.id()).orElseThrow();
                                    return new boolean[] {Visibility.pageReadable(lesson), Visibility.collectionReadable(track)};
                                });
                                boolean gotPage = assetRepo.findPubliclyServable(pageAsset).isPresent();
                                boolean gotCover = assetRepo.findPubliclyServable(coverAsset).isPresent();
                                String label = cs + "/" + ms + "/deleted=" + deleted + "/" + us + "/page=" + ps;
                                if (gotPage != expected[0]) differences.add(label + ": page image sql=" + gotPage + " visibility=" + expected[0]);
                                if (gotCover != expected[1]) differences.add(label + ": cover sql=" + gotCover + " visibility=" + expected[1]);
                                // and the real route agrees with the query
                                assertThat(status(pub(url(pageAsset))) == 200).as(label).isEqualTo(gotPage);
                            } finally {
                                jdbc.update("update users set status = 'ACTIVE' where id = ?", a.id());
                            }
                        }
        assertThat(combos).isEqualTo(3 * 2 * 2 * 2 * 2);
        assertThat(differences).as("SQL and Visibility must never diverge").isEmpty();
    }

    @Test
    void mediaOnlyRulesOnTopOfVisibilityOwnerMatchReadyAndNullOwner() throws Exception {
        Account a = signup(), other = signup();
        Pub p = published(a);
        UUID cover = uploadReal(a);
        ok(api(a, put("/api/collections/" + p.coll.id()), Map.of("title", "T", "coverAssetId", cover.toString())), 200);
        assertThat(assetRepo.findPubliclyServable(p.asset)).isPresent();
        assertThat(assetRepo.findPubliclyServable(cover)).isPresent();
        try {
            // an asset owned by someone other than the collection owner is never served, through a page or as a cover
            jdbc.update("update media_assets set owner_id = ? where id in (?, ?)", other.id(), p.asset, cover);
            assertThat(assetRepo.findPubliclyServable(p.asset)).as("page reference, foreign asset").isEmpty();
            assertThat(assetRepo.findPubliclyServable(cover)).as("cover, foreign asset").isEmpty();
            jdbc.update("update media_assets set owner_id = ? where id in (?, ?)", a.id(), p.asset, cover);
            // not READY
            jdbc.update("update media_assets set status = 'UPLOADING' where id in (?, ?)", p.asset, cover);
            assertThat(assetRepo.findPubliclyServable(p.asset)).isEmpty();
            assertThat(assetRepo.findPubliclyServable(cover)).isEmpty();
            jdbc.update("update media_assets set status = 'READY' where id in (?, ?)", p.asset, cover);
            // a legacy collection without an owner is Visibility-readable but can never match an asset owner
            jdbc.update("update tracks set owner_id = null where id = ?", p.coll.id());
            assertThat(assetRepo.findPubliclyServable(p.asset)).as("null collection owner").isEmpty();
            assertThat(assetRepo.findPubliclyServable(cover)).as("null collection owner, cover").isEmpty();
        } finally {
            jdbc.update("update tracks set owner_id = ? where id = ?", a.id(), p.coll.id());
            jdbc.update("update media_assets set owner_id = ?, status = 'READY' where id in (?, ?)", a.id(), p.asset, cover);
        }
        assertThat(assetRepo.findPubliclyServable(p.asset)).isPresent();
    }

    @Test
    void aPageMovedToAnotherCollectionFollowsThatCollectionsVisibility() throws Exception {
        Account a = signup();
        Pub pub = published(a);
        Coll draftColl = collection(a);
        long draftModule = module(a, draftColl);
        assertThat(status(pub(url(pub.asset)))).isEqualTo(200);
        jdbc.update("update lessons set section_id = ? where id = ?", draftModule, pub.page);   // the page now lives in a draft collection
        assertThat(status(pub(url(pub.asset)))).isEqualTo(404);
        jdbc.update("update lessons set section_id = ? where id = ?", pub.module, pub.page);
        assertThat(status(pub(url(pub.asset)))).isEqualTo(200);
    }

    @Test
    void theLegacyLessonRouteAlsoTurnsAnAdminAuthoredImageIntoAPublicUrl() throws Exception {
        // an admin account can author creator collections too; the legacy /api/tracks/... route serves admin-owned content
        var admin = userRepo.findByEmailIgnoreCase("admin@codemastery.local").orElseThrow();
        Account a = new Account(adminToken(), admin.getId(), admin.getEmail());
        Pub p = published(a);
        String collSlug = p.coll.slug(), pageSlug = slugOf(p.page);
        JsonNode lesson = json.readTree(pub("/api/tracks/" + collSlug + "/lessons/" + pageSlug).getResponse().getContentAsString());
        JsonNode block = lesson.get("blocks").get(0);
        assertThat(block.has("assetId")).as("never a bare asset id").isFalse();
        assertThat(block.get("url").asText()).isEqualTo(url(p.asset));
        assertThat(status(pub(url(p.asset)))).isEqualTo(200);
        ok(api(a, delete("/api/collections/" + p.coll.id()), null), 204);   // tidy the shared database: nothing public is left behind
    }
}
