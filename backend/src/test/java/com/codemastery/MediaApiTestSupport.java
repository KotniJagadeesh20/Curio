package com.codemastery;

import com.codemastery.media.MediaAsset;
import com.codemastery.media.MediaAssetRepository;
import com.codemastery.media.MediaStatus;
import com.fasterxml.jackson.databind.JsonNode;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

/** Media API tests: a throw-away storage directory, the scheduled sweeper off (tests call it explicitly). */
abstract class MediaApiTestSupport extends ApiTestSupport {
    static final Path ROOT;

    static {
        try {
            ROOT = Files.createTempDirectory("media-test-");
            ROOT.toFile().deleteOnExit();
        } catch (IOException e) {
            throw new ExceptionInInitializerError(e);
        }
    }

    @DynamicPropertySource
    static void mediaProps(DynamicPropertyRegistry r) {
        r.add("media.local.root", ROOT::toString);
        r.add("media.sweep-enabled", () -> "false");
    }

    @Autowired protected MediaAssetRepository assets;
    @Autowired protected JdbcTemplate jdbc;

    record Account(String token, long id, String email) {}

    protected Account signup() throws Exception {
        String email = "media-" + UUID.randomUUID() + "@test.com";
        MvcResult r = mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Media Tester", "email", email, "password", "password123")))).andReturn();
        JsonNode n = read(r);
        return new Account(n.get("token").asText(), n.get("user").get("id").asLong(), email);
    }

    protected MockMultipartHttpServletRequestBuilder upload(String token, String partName, String filename, String contentType, byte[] bytes) {
        return (MockMultipartHttpServletRequestBuilder) multipart("/api/media")
                .file(new MockMultipartFile(partName, filename, contentType, bytes))
                .header("Authorization", "Bearer " + token);
    }

    protected MockMultipartHttpServletRequestBuilder upload(String token, String filename, String contentType, byte[] bytes) {
        return upload(token, "file", filename, contentType, bytes);
    }

    /** A READY/UPLOADING/DELETING row inserted directly, with objects optionally written, for state-based tests. */
    protected MediaAsset insertAsset(long ownerId, MediaStatus status, long sizeBytes, long thumbBytes, java.time.Instant createdAt) {
        MediaAsset a = new MediaAsset();
        a.setId(UUID.randomUUID());
        a.setOwnerId(ownerId);
        a.setStatus(status);
        a.setContentType("image/jpeg");
        a.setWidth(10);
        a.setHeight(10);
        a.setSizeBytes(sizeBytes);
        a.setSha256("0".repeat(64));
        a.setThumbWidth(10);
        a.setThumbHeight(10);
        a.setThumbSizeBytes(thumbBytes);
        a.setThumbSha256("0".repeat(64));
        a.setStorageKey("media/" + a.getId() + "/original.jpg");
        a.setThumbKey("media/" + a.getId() + "/thumb.jpg");
        a.setCreatedAt(createdAt);
        return assets.saveAndFlush(a);
    }
}
