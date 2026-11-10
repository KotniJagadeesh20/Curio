package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MvcResult;

/** Step 12b cover contract: absent / explicit null / "" / value for BOTH fields, both-present in every combination, create and update. */
class MediaCoverApiTest extends MediaRefSupport {
    static final String LINK = "https://cdn.example.com/cover.png";

    private MvcResult update(Account a, Coll c, String rawJsonFragment) throws Exception {
        return mvc.perform(as(a.token(), put("/api/collections/" + c.id()))
                .content("{\"title\":\"T\"" + (rawJsonFragment.isEmpty() ? "" : "," + rawJsonFragment) + "}")).andReturn();
    }

    private JsonNode summary(Account a, Coll c) throws Exception { return ok(api(a, get("/api/collections/" + c.id()), null), 200).get("collection"); }

    private String assetCover(Account a, Coll c) throws Exception { JsonNode n = summary(a, c).get("coverAssetId"); return n.isNull() ? null : n.asText(); }

    private String link(Account a, Coll c) throws Exception { JsonNode n = summary(a, c).get("coverUrl"); return n.isNull() ? null : n.asText(); }

    @Test
    void absentFieldsPreserveBothCovers() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID x = uploadReal(a);
        ok(update(a, c, "\"coverAssetId\":\"" + x + "\""), 200);
        ok(update(a, c, "\"description\":\"changed\""), 200);
        assertThat(assetCover(a, c)).isEqualTo(x.toString());
        ok(update(a, c, "\"coverUrl\":\"" + LINK + "\""), 200);
        ok(update(a, c, "\"description\":\"again\""), 200);
        assertThat(link(a, c)).isEqualTo(LINK);
    }

    @Test
    void settingAnAssetCoverClearsTheLinkAndSettingTheLinkClearsTheAssetCover() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID x = uploadReal(a), y = uploadReal(a);
        ok(update(a, c, "\"coverUrl\":\"" + LINK + "\""), 200);

        ok(update(a, c, "\"coverAssetId\":\"" + x + "\""), 200);
        assertThat(assetCover(a, c)).isEqualTo(x.toString());
        assertThat(link(a, c)).as("setting the asset cover clears the link").isNull();
        assertThat(stampOf(x)).isNull();

        ok(update(a, c, "\"coverAssetId\":\"" + y + "\""), 200);
        assertThat(stampOf(x)).as("the replaced cover is stamped").isNotNull();
        assertThat(stampOf(y)).isNull();

        ok(update(a, c, "\"coverUrl\":\"" + LINK + "\""), 200);
        assertThat(link(a, c)).isEqualTo(LINK);
        assertThat(assetCover(a, c)).as("setting the link clears the asset cover").isNull();
        assertThat(stampOf(y)).as("and stamps the asset that was the cover").isNotNull();
    }

    @Test
    void explicitNullOnTheAssetFieldClearsOnlyTheAssetCover() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID x = uploadReal(a);
        ok(update(a, c, "\"coverAssetId\":\"" + x + "\""), 200);
        ok(update(a, c, "\"coverAssetId\":null"), 200);
        assertThat(assetCover(a, c)).isNull();
        assertThat(stampOf(x)).isNotNull();

        // with a legacy link present (and no asset cover) null is a no-op for the link
        ok(update(a, c, "\"coverUrl\":\"" + LINK + "\""), 200);
        ok(update(a, c, "\"coverAssetId\":null"), 200);
        assertThat(link(a, c)).isEqualTo(LINK);
    }

    @Test
    void anEmptyLinkClearsTheLinkOnlyAndNullLinkIsRefused() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID x = uploadReal(a);
        ok(update(a, c, "\"coverUrl\":\"" + LINK + "\""), 200);
        ok(update(a, c, "\"coverUrl\":\"\""), 200);
        assertThat(link(a, c)).isNull();

        ok(update(a, c, "\"coverAssetId\":\"" + x + "\""), 200);
        ok(update(a, c, "\"coverUrl\":\"\""), 200);
        assertThat(assetCover(a, c)).as("\"\" clears the link; the asset cover is untouched").isEqualTo(x.toString());

        MvcResult nul = update(a, c, "\"coverUrl\":null");
        assertThat(ok(nul, 400).get("error").asText()).contains("empty string");
        assertThat(assetCover(a, c)).isEqualTo(x.toString());
    }

    @Test
    void bothFieldsInAnyStateAreRefusedAndNothingIsWritten() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        UUID x = uploadReal(a), y = uploadReal(a);
        ok(update(a, c, "\"coverAssetId\":\"" + x + "\""), 200);
        String[] assetStates = {"null", "\"" + y + "\""};
        String[] linkStates = {"null", "\"\"", "\"" + LINK + "\""};
        for (String as : assetStates) for (String ls : linkStates) {
            JsonNode n = ok(update(a, c, "\"coverAssetId\":" + as + ",\"coverUrl\":" + ls), 400);
            assertThat(n.get("error").asText()).as(as + " + " + ls).contains("not both");
        }
        assertThat(assetCover(a, c)).isEqualTo(x.toString());
        assertThat(link(a, c)).isNull();
        assertThat(stampOf(y)).as("the refused request did not touch the asset").isNotNull();   // still the upload's own orphan clock
    }

    @Test
    void invalidCoverAssetsAndMalformedValuesAreRefused() throws Exception {
        Account a = signup(), b = signup();
        Coll c = collection(a);
        UUID theirs = uploadReal(b);
        var uploading = insertAsset(a.id(), com.codemastery.media.MediaStatus.UPLOADING, 10, 10, java.time.Instant.now());
        for (String bad : new String[] {UUID.randomUUID().toString(), theirs.toString(), uploading.getId().toString()}) {
            JsonNode n = ok(update(a, c, "\"coverAssetId\":\"" + bad + "\""), 400);
            assertThat(n.get("code").asText()).isEqualTo("MEDIA_NOT_USABLE");
        }
        for (String malformed : new String[] {"\"\"", "\"nope\"", "\"1-1-1-1-1\"", "5", "true", "{}"}) {
            assertThat(status(update(a, c, "\"coverAssetId\":" + malformed))).as(malformed).isEqualTo(400);
        }
        assertThat(status(update(a, c, "\"coverUrl\":5"))).isEqualTo(400);
        assertThat(status(update(a, c, "\"coverUrl\":\"" + "a".repeat(501) + "\""))).isEqualTo(400);
        assertThat(assetCover(a, c)).isNull();
        assertThat(refCountOfAsset(theirs)).isZero();
        jdbc.update("delete from media_assets where id = ?", uploading.getId());
    }

    @Test
    void createAcceptsTheSameContract() throws Exception {
        Account a = signup();
        UUID x = uploadReal(a);
        JsonNode created = ok(api(a, post("/api/collections"), Map.of("title", "With cover", "coverAssetId", x.toString())), 201);
        assertThat(created.get("coverAssetId").asText()).isEqualTo(x.toString());
        assertThat(created.get("coverUrl").isNull()).isTrue();
        assertThat(stampOf(x)).isNull();

        assertThat(status(mvc.perform(as(a.token(), post("/api/collections")).content("{\"title\":\"T\",\"coverUrl\":null}")).andReturn())).isEqualTo(400);
        Map<String, Object> both = new HashMap<>(Map.of("title", "T", "coverUrl", LINK));
        both.put("coverAssetId", null);
        assertThat(status(api(a, post("/api/collections"), both))).isEqualTo(400);
        JsonNode nullAsset = ok(api(a, post("/api/collections"), Map.of("title", "No cover", "coverUrl", LINK)), 201);
        assertThat(nullAsset.get("coverUrl").asText()).isEqualTo(LINK);
        UUID theirs = uploadReal(signup());
        assertThat(ok(api(a, post("/api/collections"), Map.of("title", "T", "coverAssetId", theirs.toString())), 400).get("code").asText()).isEqualTo("MEDIA_NOT_USABLE");
    }

    @Test
    void theSameAssetCanBeACoverAndAPageImageAndStaysReferencedUntilBothGo() throws Exception {
        Account a = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a);
        ok(savePage(a, p, java.util.List.of(image("i1", x))), 200);
        ok(update(a, c, "\"coverAssetId\":\"" + x + "\""), 200);
        ok(update(a, c, "\"coverAssetId\":null"), 200);
        assertThat(stampOf(x)).as("the page still uses it").isNull();
        ok(savePage(a, p, java.util.List.of()), 200);
        assertThat(stampOf(x)).isNotNull();
    }
}
