package com.codemastery;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

/** Shared helpers: boots the app on in-memory H2 (same Flyway migrations as Postgres). */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("h2")
abstract class ApiTestSupport {
    @Autowired protected MockMvc mvc;
    @Autowired protected ObjectMapper json;
    @Autowired protected com.codemastery.media.MediaIntegrityAudit mediaAudit;

    /** 12b: after every API test the media references must still match the page bodies and covers exactly (the audit repairs nothing). */
    @org.junit.jupiter.api.AfterEach
    void mediaReferencesStillConsistent() {
        org.assertj.core.api.Assertions.assertThat(mediaAudit.audit()).as("media integrity audit").isEmpty();
    }

    protected String adminToken() throws Exception {
        return login("admin@codemastery.local", "ChangeMe123!");
    }

    /** Registers a fresh user (unique email) and returns their token. */
    protected String newUserToken() throws Exception {
        String email = "user-" + UUID.randomUUID() + "@test.com";
        MvcResult r = mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Test", "email", email, "password", "password123")))).andReturn();
        return read(r).get("token").asText();
    }

    protected String login(String email, String password) throws Exception {
        MvcResult r = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("email", email, "password", password)))).andReturn();
        return read(r).get("token").asText();
    }

    protected String body(Object o) throws Exception {
        return json.writeValueAsString(o);
    }

    protected JsonNode read(MvcResult r) throws Exception {
        // the API answers UTF-8 JSON without a charset parameter, which MockMvc would otherwise decode as ISO-8859-1
        return json.readTree(r.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    protected MockHttpServletRequestBuilder as(String token, MockHttpServletRequestBuilder req) {
        return req.header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON);
    }

    protected static String uniq(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8);
    }
}
