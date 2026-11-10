package com.codemastery;

import static com.codemastery.media.MediaFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.codemastery.media.MediaAsset;
import com.codemastery.media.MediaStatus;
import com.codemastery.media.MediaStorage;
import com.fasterxml.jackson.databind.JsonNode;
import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.util.UUID;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;

/** 12a API contract: upload, owner-only serving, error codes. */
class MediaApiTest extends MediaApiTestSupport {
    @Autowired MediaStorage storage;

    private JsonNode uploadOk(String token, String name, String type, byte[] bytes) throws Exception {
        MvcResult r = mvc.perform(upload(token, name, type, bytes)).andExpect(status().isCreated()).andReturn();
        return read(r);
    }

    private void expectCode(MvcResult r, int status, String code) throws Exception {
        assertEquals(status, r.getResponse().getStatus(), r.getResponse().getContentAsString());
        assertEquals(code, read(r).get("code").asText());
    }

    // ---- upload ----

    @Test
    void uploadReturnsTheAssetAndStoresBothVariants() throws Exception {
        Account a = signup();
        JsonNode j = uploadOk(a.token(), "photo.jpg", "image/jpeg", resource("plain.jpg"));
        UUID id = UUID.fromString(j.get("id").asText());
        assertEquals("image/jpeg", j.get("contentType").asText());
        assertEquals(64, j.get("width").asInt());
        assertEquals(48, j.get("height").asInt());
        assertTrue(j.get("size").asLong() > 0);
        assertEquals(64, j.get("thumb").get("width").asInt());
        assertFalse(j.has("url"), "content refers to the id; the upload response carries no URL or path");
        assertFalse(j.toString().contains("media/"), "no storage key in the response");

        MediaAsset row = assets.findById(id).orElseThrow();
        assertEquals(MediaStatus.READY, row.getStatus());
        assertEquals(a.id(), row.getOwnerId());
        assertNotNull(row.getReadyAt());
        assertEquals("media/" + id + "/original.jpg", row.getStorageKey());
        assertEquals("media/" + id + "/thumb.jpg", row.getThumbKey());
        assertTrue(storage.exists(row.getStorageKey()));
        assertTrue(storage.exists(row.getThumbKey()));
        assertEquals(j.get("size").asLong(), row.getSizeBytes());
    }

    @Test
    void theStoredObjectsAreOurReencodingNotTheUpload() throws Exception {
        Account a = signup();
        byte[] polyglot = concat(resource("plain.jpg"), "<?php evil(); ?>".getBytes());
        JsonNode j = uploadOk(a.token(), "p.jpg", "image/jpeg", polyglot);
        MediaAsset row = assets.findById(UUID.fromString(j.get("id").asText())).orElseThrow();
        try (var in = storage.open(row.getStorageKey())) {
            byte[] stored = in.readAllBytes();
            assertFalse(contains(stored, "<?php"));
            assertEquals(ImageProcessorSha(stored), row.getSha256(), "the hash describes the stored bytes");
        }
    }

    private static String ImageProcessorSha(byte[] b) throws Exception {
        return java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(b));
    }

    @Test
    void errorsHaveStableCodes() throws Exception {
        Account a = signup();
        expectCode(mvc.perform(upload(a.token(), "x.gif", "image/gif", "GIF89a....".getBytes())).andReturn(), 415, "MEDIA_TYPE_UNSUPPORTED");
        expectCode(mvc.perform(upload(a.token(), "x.jpg", "image/jpeg", resource("cmyk.jpg"))).andReturn(), 422, "MEDIA_COLORSPACE_UNSUPPORTED");
        expectCode(mvc.perform(upload(a.token(), "x.webp", "image/webp", resource("animated.webp"))).andReturn(), 422, "MEDIA_ANIMATED");
        expectCode(mvc.perform(upload(a.token(), "x.png", "image/png", resource("animated.apng"))).andReturn(), 422, "MEDIA_ANIMATED");
        expectCode(mvc.perform(upload(a.token(), "x.png", "image/png", pngHeaderOnly(20_000, 20_000))).andReturn(), 422, "MEDIA_DIMENSIONS");
        expectCode(mvc.perform(upload(a.token(), "x.jpg", "image/jpeg", head(resource("plain.jpg"), 400))).andReturn(), 422, "MEDIA_CORRUPT");
        expectCode(mvc.perform(upload(a.token(), "x.jpg", "image/png", resource("plain.jpg"))).andReturn(), 415, "MEDIA_TYPE_UNSUPPORTED");
        assertEquals(0, assets.countByOwner(a.id()), "a rejected upload leaves no row");
    }

    @Test
    void anOversizedFileIsRefusedByTheApplicationCountAsWell() throws Exception {
        Account a = signup();
        byte[] big = new byte[5 * 1024 * 1024 + 1];
        big[0] = (byte) 0xFF; big[1] = (byte) 0xD8; big[2] = (byte) 0xFF;
        expectCode(mvc.perform(upload(a.token(), "big.jpg", "image/jpeg", big)).andReturn(), 413, "MEDIA_TOO_LARGE");
        assertEquals(0, assets.countByOwner(a.id()));
    }

    @Test
    void onlyOneFilePartNamedFileIsAccepted() throws Exception {
        Account a = signup();
        byte[] img = resource("plain.jpg");
        expectCode(mvc.perform(upload(a.token(), "photo", "a.jpg", "image/jpeg", img)).andReturn(), 400, "MEDIA_BAD_REQUEST");   // wrong part name
        expectCode(mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", img).file(new MockMultipartFile("file", "b.jpg", "image/jpeg", img))).andReturn(), 400, "MEDIA_BAD_REQUEST");   // two files
        expectCode(mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", img).file(new MockMultipartFile("other", "b.jpg", "image/jpeg", img))).andReturn(), 400, "MEDIA_BAD_REQUEST");  // extra part
        expectCode(mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", img).param("note", "hi")).andReturn(), 400, "MEDIA_BAD_REQUEST");   // extra form field
        expectCode(mvc.perform(post("/api/media").header("Authorization", "Bearer " + a.token()).contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn(), 400, "MEDIA_BAD_REQUEST");
        assertEquals(0, assets.countByOwner(a.id()));
    }

    @Test
    void uploadNeedsAnActiveAuthenticatedUser() throws Exception {
        mvc.perform(multipart("/api/media").file(new MockMultipartFile("file", "a.jpg", "image/jpeg", resource("plain.jpg")))).andExpect(status().isUnauthorized());
        mvc.perform(upload("garbage", "a.jpg", "image/jpeg", resource("plain.jpg"))).andExpect(status().isUnauthorized());
        Account a = signup();
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.id());
        mvc.perform(upload(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"))).andExpect(status().isUnauthorized());   // same as every creator endpoint
        assertEquals(0, assets.countByOwner(a.id()));
    }

    // ---- owner-only serving ----

    @Test
    void theOwnerGetsTheirImageWithTheRightHeaders() throws Exception {
        Account a = signup();
        JsonNode j = uploadOk(a.token(), "photo.jpg", "image/jpeg", jpeg(1600, 900));
        String id = j.get("id").asText();
        MvcResult r = mvc.perform(get("/api/media/" + id + "/content").header("Authorization", "Bearer " + a.token()))
                .andExpect(status().isOk()).andReturn();
        var res = r.getResponse();
        assertEquals("image/jpeg", res.getContentType());
        assertEquals("nosniff", res.getHeader("X-Content-Type-Options"));
        assertEquals("default-src 'none'; sandbox", res.getHeader("Content-Security-Policy"));
        String cc = res.getHeader("Cache-Control");
        assertTrue(cc.contains("private") && cc.contains("no-store"), cc);
        assertNull(res.getHeader("ETag"), "owner-only responses are never conditionally cached");
        assertNull(res.getHeader("Content-Disposition"));
        byte[] body = res.getContentAsByteArray();
        assertEquals(j.get("size").asLong(), body.length);
        assertEquals(res.getContentLengthLong(), body.length);
        BufferedImage img = ImageIO.read(new ByteArrayInputStream(body));
        assertEquals(1600, img.getWidth());

        MvcResult t = mvc.perform(get("/api/media/" + id + "/content?variant=thumb").header("Authorization", "Bearer " + a.token()))
                .andExpect(status().isOk()).andReturn();
        BufferedImage thumb = ImageIO.read(new ByteArrayInputStream(t.getResponse().getContentAsByteArray()));
        assertEquals(640, thumb.getWidth());
        assertEquals(j.get("thumb").get("size").asLong(), t.getResponse().getContentAsByteArray().length);
    }

    @Test
    void aPngWithAlphaIsServedAsPng() throws Exception {
        Account a = signup();
        JsonNode j = uploadOk(a.token(), "a.png", "image/png", resource("alpha.png"));
        assertEquals("image/png", j.get("contentType").asText());
        MvcResult r = mvc.perform(get("/api/media/" + j.get("id").asText() + "/content").header("Authorization", "Bearer " + a.token())).andExpect(status().isOk()).andReturn();
        assertEquals("image/png", r.getResponse().getContentType());
    }

    @Test
    void noOneButTheOwnerCanFetchAnAsset_andAllMissesLookAlike() throws Exception {
        Account owner = signup(), stranger = signup();
        String id = uploadOk(owner.token(), "a.jpg", "image/jpeg", resource("plain.jpg")).get("id").asText();
        String path = "/api/media/" + id + "/content";

        MvcResult strangerRes = mvc.perform(get(path).header("Authorization", "Bearer " + stranger.token())).andExpect(status().isNotFound()).andReturn();
        MvcResult adminRes = mvc.perform(get(path).header("Authorization", "Bearer " + adminToken())).andExpect(status().isNotFound()).andReturn();   // admins get no creator access
        MvcResult unknownRes = mvc.perform(get("/api/media/" + UUID.randomUUID() + "/content").header("Authorization", "Bearer " + owner.token())).andExpect(status().isNotFound()).andReturn();
        assertEquals(strangerRes.getResponse().getContentAsString(), unknownRes.getResponse().getContentAsString(), "someone else's asset is indistinguishable from a missing one");
        assertEquals(adminRes.getResponse().getContentAsString(), unknownRes.getResponse().getContentAsString());
        mvc.perform(get(path + "?variant=thumb").header("Authorization", "Bearer " + stranger.token())).andExpect(status().isNotFound());
        mvc.perform(get(path)).andExpect(status().isUnauthorized());   // anonymous: there is no public media route in 12a
        mvc.perform(get("/api/public/media/" + id)).andExpect(status().isNotFound());
    }

    @Test
    void aSuspendedOwnerCannotFetchTheirAssets() throws Exception {
        Account a = signup();
        String id = uploadOk(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg")).get("id").asText();
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.id());
        mvc.perform(get("/api/media/" + id + "/content").header("Authorization", "Bearer " + a.token())).andExpect(status().isUnauthorized());
    }

    @Test
    void onlyReadyAssetsAreServed() throws Exception {
        Account a = signup();
        for (MediaStatus s : new MediaStatus[] {MediaStatus.UPLOADING, MediaStatus.DELETING}) {
            MediaAsset row = insertAsset(a.id(), s, 10, 10, Instant.now());
            storage.put(row.getStorageKey(), new byte[] {1}, "image/jpeg");
            mvc.perform(get("/api/media/" + row.getId() + "/content").header("Authorization", "Bearer " + a.token())).andExpect(status().isNotFound());
        }
    }

    @Test
    void badInputToTheServingRoute() throws Exception {
        Account a = signup();
        String id = uploadOk(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg")).get("id").asText();
        mvc.perform(get("/api/media/" + id + "/content?variant=huge").header("Authorization", "Bearer " + a.token())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/media/not-a-uuid/content").header("Authorization", "Bearer " + a.token())).andExpect(status().isBadRequest());
        mvc.perform(get("/api/media/" + id + "/../content").header("Authorization", "Bearer " + a.token())).andExpect(result -> assertTrue(result.getResponse().getStatus() >= 400));
    }

    @Test
    void aRowWhoseObjectVanishedIsA404NotA500() throws Exception {
        Account a = signup();
        JsonNode j = uploadOk(a.token(), "a.jpg", "image/jpeg", resource("plain.jpg"));
        MediaAsset row = assets.findById(UUID.fromString(j.get("id").asText())).orElseThrow();
        storage.delete(row.getStorageKey());
        mvc.perform(get("/api/media/" + row.getId() + "/content").header("Authorization", "Bearer " + a.token())).andExpect(status().isNotFound());
    }

    @Test
    void webpUploadsWorkEndToEnd() throws Exception {
        Account a = signup();
        assertEquals("image/jpeg", uploadOk(a.token(), "a.webp", "image/webp", resource("lossy.webp")).get("contentType").asText());
        assertEquals("image/png", uploadOk(a.token(), "a.webp", "image/webp", resource("lossless-alpha.webp")).get("contentType").asText());
    }
}
