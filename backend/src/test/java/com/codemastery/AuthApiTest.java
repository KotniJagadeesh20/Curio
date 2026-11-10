package com.codemastery;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthApiTest extends ApiTestSupport {

    @Test
    void signupLoginAndMe() throws Exception {
        String email = "a-" + UUID.randomUUID() + "@test.com";
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Ann", "email", email, "password", "password123"))))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.user.role").value("USER"))
            .andExpect(jsonPath("$.user.passwordHash").doesNotExist());

        String token = login(email, "password123");
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.email").value(email));
    }

    @Test
    void duplicateEmailIsRejectedCaseInsensitively() throws Exception {
        String email = "dup-" + UUID.randomUUID() + "@test.com";
        String req = body(Map.of("name", "A", "email", email, "password", "password123"));
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(req))
            .andExpect(status().isCreated());
        String upper = body(Map.of("name", "A", "email", email.toUpperCase(), "password", "password123"));
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON).content(upper))
            .andExpect(status().isConflict());
    }

    @Test
    void weakPasswordAndBadEmailAreRejected() throws Exception {
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "A", "email", "x@test.com", "password", "short"))))
            .andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "A", "email", "not-an-email", "password", "password123"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void wrongPasswordGivesGenericUnauthorized() throws Exception {
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("email", "admin@codemastery.local", "password", "wrong"))))
            .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("email", "nobody@test.com", "password", "wrong"))))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void meRequiresAValidToken() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer garbage"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void adminRoutesAreRoleProtected() throws Exception {
        mvc.perform(get("/api/admin/problems")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/admin/problems").header("Authorization", "Bearer " + newUserToken()))
            .andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/problems").header("Authorization", "Bearer " + adminToken()))
            .andExpect(status().isOk());
    }

    @Test
    void writesToPublicContentPathsStillRequireAdmin() throws Exception {
        // GET on /api/tracks is public, but POST must not be reachable by users.
        mvc.perform(post("/api/tracks").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void adminCannotChangeOwnRole() throws Exception {
        String admin = adminToken();
        var me = read(mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + admin)).andReturn());
        mvc.perform(as(admin, patch("/api/admin/users/" + me.get("id").asLong() + "/role"))
                .content(body(Map.of("role", "USER"))))
            .andExpect(status().isBadRequest());
    }

    @Test
    void demotedAdminLosesAccessImmediately() throws Exception {
        String admin = adminToken();
        // create a second admin, then demote them with the first
        String email = "ex-admin-" + UUID.randomUUID() + "@test.com";
        var created = read(mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Ex", "email", email, "password", "password123")))).andReturn());
        long id = created.get("user").get("id").asLong();

        mvc.perform(as(admin, patch("/api/admin/users/" + id + "/role")).content(body(Map.of("role", "ADMIN"))))
            .andExpect(status().isOk());
        // token issued *before* promotion still works as ADMIN because the role is read from the DB
        String token = created.get("token").asText();
        mvc.perform(get("/api/admin/problems").header("Authorization", "Bearer " + token)).andExpect(status().isOk());

        mvc.perform(as(admin, patch("/api/admin/users/" + id + "/role")).content(body(Map.of("role", "USER"))))
            .andExpect(status().isOk());
        // the same token is now rejected for admin routes, no re-login needed
        mvc.perform(get("/api/admin/problems").header("Authorization", "Bearer " + token)).andExpect(status().isForbidden());
    }
}
