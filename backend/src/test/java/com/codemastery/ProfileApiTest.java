package com.codemastery;

import com.codemastery.user.User;
import com.codemastery.user.UserRepository;
import com.codemastery.user.UserStatus;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ProfileApiTest extends ApiTestSupport {
    @Autowired UserRepository users;

    /** Signs up with an optional username; returns the response body (token + user). */
    private JsonNode signup(String email, String username) throws Exception {
        Map<String, Object> req = new java.util.HashMap<>(
                Map.of("name", "Test User", "email", email, "password", "password123"));
        if (username != null) req.put("username", username);
        return read(mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(req))).andExpect(status().isCreated()).andReturn());
    }

    private ResultActions signupRaw(String email, String username) throws Exception {
        return mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "T", "email", email, "password", "password123", "username", username))));
    }

    private static String email() { return "p-" + UUID.randomUUID() + "@test.com"; }
    private static String handle() { return "u" + UUID.randomUUID().toString().replace("-", "").substring(0, 12); }

    // ---- signup / usernames ----

    @Test
    void signupWithoutUsernameDerivesOneFromEmail() throws Exception {
        String local = "derive" + UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        JsonNode r = signup(local + "@test.com", null);
        assertEquals(local, r.get("user").get("username").asText());
    }

    @Test
    void signupWithUsernameStoresItLowercased() throws Exception {
        String h = handle();
        JsonNode r = signup(email(), h.toUpperCase());
        assertEquals(h, r.get("user").get("username").asText());
    }

    @Test
    void duplicateUsernameIsRejectedCaseInsensitively() throws Exception {
        String h = handle();
        signup(email(), h);
        signupRaw(email(), h.toUpperCase()).andExpect(status().isConflict());
    }

    @Test
    void reservedUsernamesAreRejected() throws Exception {
        for (String n : new String[]{"admin", "root", "system", "moderator", "official", "null", "undefined", "Admin"}) {
            signupRaw(email(), n).andExpect(status().isConflict());
        }
    }

    @Test
    void invalidUsernamesAreRejected() throws Exception {
        for (String n : new String[]{"ab", "9starts", "has space", "dash-ed", "x".repeat(31)}) {
            signupRaw(email(), n).andExpect(status().isBadRequest());
        }
    }

    @Test
    void derivedUsernameSkipsReservedNames() throws Exception {
        // "root@..." can't become "root"; it must get a free, valid, different handle
        JsonNode r = signup("root@" + UUID.randomUUID() + ".com", null);
        String u = r.get("user").get("username").asText();
        assertNotEquals("root", u);
        assertTrue(u.startsWith("root"));
    }

    @Test
    void seededAdminHasTheAdminUsername() throws Exception {
        var me = read(mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + adminToken()))
                .andReturn());
        assertEquals("admin", me.get("username").asText());
    }

    // ---- /api/users/me and profile editing ----

    @Test
    void meReturnsUserAndDefaultProfile() throws Exception {
        JsonNode s = signup(email(), handle());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + s.get("token").asText()))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.user.username").value(s.get("user").get("username").asText()))
            .andExpect(jsonPath("$.profile.displayName").value("Test User"))
            .andExpect(jsonPath("$.profile.visibility").value("PUBLIC"))
            .andExpect(jsonPath("$.profile.socialLinks").isMap());
    }

    @Test
    void meRequiresAuth() throws Exception {
        mvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
        mvc.perform(put("/api/users/me/profile").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void ownerCanUpdateProfile() throws Exception {
        String token = newUserToken();
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of(
                "displayName", "  Jagadeesh K  ",
                "bio", "Developer and writer",
                "avatarUrl", "https://img.example.com/a.png",
                "bannerUrl", "https://img.example.com/b.png",
                "socialLinks", Map.of("github", "https://github.com/jk", "x", "https://x.com/jk")))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.displayName").value("Jagadeesh K"))
            .andExpect(jsonPath("$.socialLinks.github").value("https://github.com/jk"))
            .andExpect(jsonPath("$.visibility").value("PUBLIC"));   // omitted = unchanged
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token))
            .andExpect(jsonPath("$.profile.bio").value("Developer and writer"))
            .andExpect(jsonPath("$.profile.bannerUrl").value("https://img.example.com/b.png"));
    }

    @Test
    void forbiddenFieldsAreRejectedNotIgnored() throws Exception {
        String token = newUserToken();
        for (String field : new String[]{"username", "email", "role", "status", "id", "protectedAccount"}) {
            mvc.perform(as(token, put("/api/users/me/profile"))
                    .content(body(Map.of("displayName", "X", field, "ADMIN"))))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "X", "username", "newname"))))
            .andExpect(jsonPath("$.error").value("Usernames cannot be changed"));
    }

    @Test
    void usernameStaysTheSameAfterProfileUpdates() throws Exception {
        JsonNode s = signup(email(), handle());
        String token = s.get("token").asText();
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "Renamed"))))
            .andExpect(status().isOk());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token))
            .andExpect(jsonPath("$.user.username").value(s.get("user").get("username").asText()));
    }

    @Test
    void nonHttpsAndMalformedUrlsAreRejected() throws Exception {
        String token = newUserToken();
        for (String bad : new String[]{"http://x.com/a.png", "javascript:alert(1)", "data:text/html,hi",
                "//x.com/a.png", "/relative.png", "https://user:pw@x.com/a.png", "not a url", "https:///nohost"}) {
            mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "X", "avatarUrl", bad))))
                .andExpect(status().isBadRequest());
            mvc.perform(as(token, put("/api/users/me/profile"))
                    .content(body(Map.of("displayName", "X", "socialLinks", Map.of("site", bad)))))
                .andExpect(status().isBadRequest());
        }
    }

    @Test
    void fieldLengthAndLinkLimitsAreEnforced() throws Exception {
        String token = newUserToken();
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "  "))))
            .andExpect(status().isBadRequest());
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "X", "bio", "b".repeat(501)))))
            .andExpect(status().isBadRequest());
        Map<String, String> many = new java.util.LinkedHashMap<>();
        for (int i = 0; i < 11; i++) many.put("l" + i, "https://x.com/" + i);
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "X", "socialLinks", many))))
            .andExpect(status().isBadRequest());
        mvc.perform(as(token, put("/api/users/me/profile"))
                .content(body(Map.of("displayName", "X", "socialLinks", Map.of("Bad Label!", "https://x.com")))))
            .andExpect(status().isBadRequest());
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "X", "visibility", "SECRET"))))
            .andExpect(status().isBadRequest());
    }

    // ---- public profile ----

    @Test
    void publicProfileNeedsNoTokenAndNeverExposesEmailOrRole() throws Exception {
        String em = email();
        String h = handle();
        String token = signup(em, h).get("token").asText();
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of(
                "displayName", "Public Person", "bio", "hi", "socialLinks", Map.of("web", "https://x.com")))))
            .andExpect(status().isOk());

        String raw = mvc.perform(get("/api/public/creators/" + h.toUpperCase()))   // lookup is case-insensitive
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value(h))
            .andExpect(jsonPath("$.displayName").value("Public Person"))
            .andExpect(jsonPath("$.socialLinks.web").value("https://x.com"))
            .andExpect(jsonPath("$.joinedAt").exists())
            .andReturn().getResponse().getContentAsString();
        assertFalse(raw.contains(em), "email must not leak");
        assertFalse(raw.toLowerCase().contains("role"));
        assertFalse(raw.toLowerCase().contains("password"));
    }

    @Test
    void unknownCreatorIs404() throws Exception {
        mvc.perform(get("/api/public/creators/nobody_" + UUID.randomUUID().toString().substring(0, 6)))
            .andExpect(status().isNotFound());
    }

    @Test
    void privateProfileIs404PublicallyButStillVisibleToItsOwner() throws Exception {
        String h = handle();
        String token = signup(email(), h).get("token").asText();
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "Hidden", "visibility", "PRIVATE"))))
            .andExpect(status().isOk());
        mvc.perform(get("/api/public/creators/" + h)).andExpect(status().isNotFound());
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.profile.visibility").value("PRIVATE"));

        // and back to public
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "Hidden", "visibility", "PUBLIC"))))
            .andExpect(status().isOk());
        mvc.perform(get("/api/public/creators/" + h)).andExpect(status().isOk());
    }

    // ---- suspension ----

    @Test
    void suspendedUserCannotLoginAndExistingTokenStopsWorking() throws Exception {
        String em = email();
        String h = handle();
        String token = signup(em, h).get("token").asText();
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        setStatus(h, UserStatus.SUSPENDED);

        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        mvc.perform(as(token, put("/api/users/me/profile")).content(body(Map.of("displayName", "X"))))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("email", em, "password", "password123"))))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("Account suspended"));
        // wrong password must not reveal that the account is suspended
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("email", em, "password", "wrong-password"))))
            .andExpect(status().isUnauthorized());
        // their public profile disappears
        mvc.perform(get("/api/public/creators/" + h)).andExpect(status().isNotFound());

        // reactivation restores everything
        setStatus(h, UserStatus.ACTIVE);
        mvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token)).andExpect(status().isOk());
        mvc.perform(get("/api/public/creators/" + h)).andExpect(status().isOk());
    }

    // ---- protected seeded admin ----

    @Test
    void seededAdminCannotBeDemotedByAnotherAdmin() throws Exception {
        String admin = adminToken();
        long seededId = read(mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + admin)).andReturn())
                .get("id").asLong();

        // promote a second admin, who then tries to demote the seeded one
        JsonNode other = signup(email(), handle());
        long otherId = other.get("user").get("id").asLong();
        mvc.perform(as(admin, patch("/api/admin/users/" + otherId + "/role")).content(body(Map.of("role", "ADMIN"))))
            .andExpect(status().isOk());
        String otherToken = other.get("token").asText();

        mvc.perform(as(otherToken, patch("/api/admin/users/" + seededId + "/role")).content(body(Map.of("role", "USER"))))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value(
                    "This is the protected platform admin account and cannot have its role changed"));
        assertEquals("ADMIN", users.findById(seededId).orElseThrow().getRole().name());
        assertTrue(users.findById(seededId).orElseThrow().isProtectedAccount());
    }

    @Test
    void ordinaryAdminsAreNotProtected() throws Exception {
        String admin = adminToken();
        JsonNode other = signup(email(), handle());
        long otherId = other.get("user").get("id").asLong();
        mvc.perform(as(admin, patch("/api/admin/users/" + otherId + "/role")).content(body(Map.of("role", "ADMIN"))))
            .andExpect(status().isOk());
        mvc.perform(as(admin, patch("/api/admin/users/" + otherId + "/role")).content(body(Map.of("role", "USER"))))
            .andExpect(status().isOk());
        assertFalse(users.findById(otherId).orElseThrow().isProtectedAccount());
    }

    private void setStatus(String username, UserStatus status) {
        User u = users.findByUsername(username).orElseThrow();
        u.setStatus(status);
        users.save(u);
    }
}
