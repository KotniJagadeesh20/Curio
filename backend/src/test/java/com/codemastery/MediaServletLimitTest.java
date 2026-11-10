package com.codemastery;

import static com.codemastery.media.MediaFixtures.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.codemastery.media.MediaProperties;
import com.codemastery.media.MediaService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.ByteArrayOutputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.web.servlet.MultipartProperties;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.SpyBean;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * MockMvc skips the servlet container, so the servlet-layer multipart limit is proven here against a real embedded server:
 * an oversized upload is refused before the controller (MediaService) is ever reached.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("h2")
class MediaServletLimitTest {
    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("media.local.root", () -> MediaApiTestSupport.ROOT.toString());
        r.add("media.sweep-enabled", () -> "false");
    }

    @LocalServerPort int port;
    @Autowired MultipartProperties multipart;
    @Autowired MediaProperties media;
    @Autowired ObjectMapper json;
    @SpyBean MediaService service;

    private final HttpClient http = HttpClient.newHttpClient();

    private String token() throws Exception {
        String body = json.writeValueAsString(java.util.Map.of("name", "T", "email", "lim-" + UUID.randomUUID() + "@test.com", "password", "password123"));
        HttpResponse<String> r = http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/auth/signup"))
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
        return json.readTree(r.body()).get("token").asText();
    }

    private HttpResponse<String> post(String token, byte[] file) throws Exception {
        String boundary = "----b" + UUID.randomUUID();
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        out.writeBytes(("--" + boundary + "\r\nContent-Disposition: form-data; name=\"file\"; filename=\"a.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n").getBytes(StandardCharsets.ISO_8859_1));
        out.writeBytes(file);
        out.writeBytes(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.ISO_8859_1));
        return http.send(HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/api/media"))
                .header("Authorization", "Bearer " + token).header("Content-Type", "multipart/form-data; boundary=" + boundary)
                .POST(HttpRequest.BodyPublishers.ofByteArray(out.toByteArray())).build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void theServletLimitsAreDerivedFromTheMediaLimits() {
        assertEquals(media.maxBytes().toBytes(), multipart.getMaxFileSize().toBytes(), "one source of truth for the per-file limit");
        assertTrue(multipart.getMaxRequestSize().toBytes() >= media.maxBytes().toBytes(), "the request limit leaves room for multipart overhead");
    }

    @Test
    void aFileOverTheServletLimitIsRefusedBeforeTheControllerRuns() throws Exception {
        String token = token();
        byte[] over = new byte[(int) media.maxBytes().toBytes() + 1000];
        over[0] = (byte) 0xFF; over[1] = (byte) 0xD8; over[2] = (byte) 0xFF;
        HttpResponse<String> r = post(token, over);
        assertEquals(413, r.statusCode(), r.body());
        JsonNode j = json.readTree(r.body());
        assertEquals("MEDIA_TOO_LARGE", j.get("code").asText());
        verify(service, never()).upload(any(), any());
    }

    @Test
    void aNormalUploadStillWorksOverRealHttp() throws Exception {
        HttpResponse<String> r = post(token(), resource("plain.jpg"));
        assertEquals(201, r.statusCode(), r.body());
        assertEquals("image/jpeg", json.readTree(r.body()).get("contentType").asText());
        verify(service).upload(any(), any());
    }

    @Test
    void anonymousUploadsAreRefusedBeforeTheBodyIsUsed() throws Exception {
        HttpResponse<String> r = post("not-a-token", resource("plain.jpg"));
        assertEquals(401, r.statusCode());
        verify(service, never()).upload(any(), any());
    }
}
