package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpMethod;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.RequestMethod;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Step 8a: the legacy /api/admin track/section/lesson endpoints had no ownership check (any admin could edit or delete
 * any creator's content). They are gone; this is the proof, plus proof that the replacement (creator) API denies an
 * admin who is not the owner, with the database unchanged.
 */
class LegacyAdminContentRemovalTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired @Qualifier("requestMappingHandlerMapping") RequestMappingHandlerMapping mappings;

    record Built(long collectionId, long moduleId, long pageId, String slug) {}

    private long id(String token, String url, Map<String, Object> req) throws Exception {
        return read(mvc.perform(as(token, post(url)).content(body(req))).andExpect(status().isCreated()).andReturn()).get("id").asLong();
    }

    /** A creator's collection with one module and one page; published (page and collection) or all-draft. */
    private Built build(String token, boolean published) throws Exception {
        String slug = uniq("victim");
        long c = id(token, "/api/collections", Map.of("title", "Victim", "slug", slug));
        long m = id(token, "/api/collections/" + c + "/modules", Map.of("title", "Mod", "slug", "mod"));
        long p = id(token, "/api/modules/" + m + "/pages", Map.of("title", "Page", "slug", "page"));
        if (published) {
            mvc.perform(as(token, post("/api/pages/" + p + "/publish"))).andExpect(status().isOk());
            mvc.perform(as(token, post("/api/collections/" + c + "/publish"))).andExpect(status().isOk());
        }
        return new Built(c, m, p, slug);
    }

    /** Everything that belongs to the collection, as stored. */
    private List<Map<String, Object>> snapshot(Built b) {
        List<Map<String, Object>> rows = new ArrayList<>();
        rows.addAll(jdbc.queryForList("select * from tracks where id = ?", b.collectionId));
        rows.addAll(jdbc.queryForList("select * from sections where track_id = ? order by id", b.collectionId));
        rows.addAll(jdbc.queryForList("select * from lessons where section_id in (select id from sections where track_id = ?) order by id", b.collectionId));
        return rows;
    }

    // ---------- the legacy routes no longer exist ----------
    private List<Object[]> legacyRoutes(Built b) {
        String t = "/api/admin/tracks", s = "/api/admin/sections", l = "/api/admin/lessons";
        return List.of(
                new Object[]{HttpMethod.GET, t},
                new Object[]{HttpMethod.GET, t + "/" + b.collectionId},
                new Object[]{HttpMethod.POST, t},
                new Object[]{HttpMethod.PUT, t + "/" + b.collectionId},
                new Object[]{HttpMethod.DELETE, t + "/" + b.collectionId},
                new Object[]{HttpMethod.POST, t + "/" + b.collectionId + "/sections"},
                new Object[]{HttpMethod.PUT, s + "/" + b.moduleId},
                new Object[]{HttpMethod.DELETE, s + "/" + b.moduleId},
                new Object[]{HttpMethod.POST, s + "/" + b.moduleId + "/lessons"},
                new Object[]{HttpMethod.GET, l + "/" + b.pageId},
                new Object[]{HttpMethod.PUT, l + "/" + b.pageId},
                new Object[]{HttpMethod.DELETE, l + "/" + b.pageId});
    }

    @Test
    void legacyAdminTrackSectionAndLessonRoutesAreGoneEvenForAnAdmin() throws Exception {
        String owner = newUserToken();
        Built b = build(owner, true);
        var before = snapshot(b);
        String admin = adminToken();

        for (Object[] r : legacyRoutes(b)) {
            var req = request((HttpMethod) r[0], (String) r[1]);
            int status = mvc.perform(as(admin, req).content("{\"slug\":\"hacked\",\"name\":\"Hacked\",\"title\":\"Hacked\"}"))
                    .andReturn().getResponse().getStatus();
            assertThat(status).as(r[0] + " " + r[1] + " as ADMIN").isIn(404, 405);
        }
        assertThat(snapshot(b)).as("nothing changed").isEqualTo(before);
    }

    @Test
    void legacyRoutesStayClosedToUsersAndAnonymous() throws Exception {
        Built b = build(newUserToken(), true);
        String user = newUserToken();
        for (Object[] r : legacyRoutes(b)) {
            assertThat(mvc.perform(request((HttpMethod) r[0], (String) r[1])).andReturn().getResponse().getStatus())
                    .as("anonymous " + r[0] + " " + r[1]).isEqualTo(401);
            assertThat(mvc.perform(as(user, request((HttpMethod) r[0], (String) r[1]))).andReturn().getResponse().getStatus())
                    .as("user " + r[0] + " " + r[1]).isEqualTo(403);
        }
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request(HttpMethod m, String url) {
        return org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request(m, url);
    }

    @Test
    void adminProblemManagementIsUntouched() throws Exception {
        String admin = adminToken();
        String slug = uniq("prob");
        JsonNode p = read(mvc.perform(as(admin, post("/api/admin/problems"))
                .content(body(Map.of("slug", slug, "title", "P", "difficulty", "easy")))).andExpect(status().isCreated()).andReturn());
        long pid = p.get("id").asLong();
        mvc.perform(as(admin, get("/api/admin/problems"))).andExpect(status().isOk());
        mvc.perform(as(admin, get("/api/admin/problems/" + pid))).andExpect(status().isOk());
        mvc.perform(as(admin, put("/api/admin/problems/" + pid))
                .content(body(Map.of("slug", slug, "title", "P2", "difficulty", "easy")))).andExpect(status().isOk());
        mvc.perform(as(admin, delete("/api/admin/problems/" + pid))).andExpect(status().isNoContent());
    }

    // ---------- the replacement API denies a non-owner admin, and nothing changes ----------
    private void denyAll(String admin, Built b, int collectionStatus) throws Exception {
        var before = snapshot(b);
        String c = "/api/collections/" + b.collectionId, m = "/api/modules/" + b.moduleId, p = "/api/pages/" + b.pageId;
        String upd = body(Map.of("title", "Hijacked"));
        List<Object[]> attempts = List.of(
                new Object[]{"PUT", c, upd}, new Object[]{"DELETE", c, null},
                new Object[]{"POST", c + "/publish", null}, new Object[]{"POST", c + "/unpublish", null},
                new Object[]{"POST", c + "/restore", null},
                new Object[]{"POST", c + "/modules", upd},
                new Object[]{"PUT", m, upd}, new Object[]{"DELETE", m, null},
                new Object[]{"PATCH", m + "/reorder", "{\"position\":0}"}, new Object[]{"POST", m + "/pages", upd},
                new Object[]{"PUT", p, upd}, new Object[]{"DELETE", p, null},
                new Object[]{"POST", p + "/publish", null}, new Object[]{"POST", p + "/unpublish", null},
                new Object[]{"PATCH", p + "/reorder", "{\"position\":0}"});
        for (Object[] a : attempts) {
            var req = request(HttpMethod.valueOf((String) a[0]), (String) a[1]);
            req = as(admin, req);
            if (a[2] != null) req = req.content((String) a[2]);
            int status = mvc.perform(req).andReturn().getResponse().getStatus();
            // restore of a non-deleted collection is a 404/409 for the owner too; for a stranger it must still be a denial
            assertThat(status).as("admin (non-owner) " + a[0] + " " + a[1]).isIn(collectionStatus, 404);
            assertThat(status).as(a[0] + " " + a[1] + " must not succeed").isGreaterThanOrEqualTo(400);
        }
        assertThat(snapshot(b)).as("database unchanged").isEqualTo(before);
    }

    @Test
    void anAdminCannotModifyAnotherCreatorsPublishedCollectionModulePageOrStatus() throws Exception {
        Built b = build(newUserToken(), true);
        denyAll(adminToken(), b, 403);
        // and the owner can still read it publicly, untouched
        mvc.perform(get("/api/public/collections/" + owner(b) + "/" + b.slug)).andExpect(status().isOk());
    }

    @Test
    void anAdminCannotEvenSeeAnotherCreatorsDraftsTheyGetNotFound() throws Exception {
        String admin = adminToken();
        Built b = build(newUserToken(), false);
        mvc.perform(as(admin, get("/api/collections/" + b.collectionId))).andExpect(status().isNotFound());
        mvc.perform(as(admin, get("/api/pages/" + b.pageId))).andExpect(status().isNotFound());
        assertThat(read(mvc.perform(as(admin, get("/api/collections/mine"))).andReturn()).findValuesAsText("slug"))
                .as("not in the admin's own list").doesNotContain(b.slug);
        var before = snapshot(b);
        denyAll(admin, b, 404);
        assertThat(snapshot(b)).isEqualTo(before);
    }

    @Test
    void theOwnerCanStillEditSoTheDenialsAboveAreAboutOwnershipNotBrokenRoutes() throws Exception {
        String owner = newUserToken();
        Built b = build(owner, true);
        mvc.perform(as(owner, put("/api/collections/" + b.collectionId)).content(body(Map.of("title", "Renamed"))))
            .andExpect(status().isOk());
        mvc.perform(as(owner, put("/api/pages/" + b.pageId)).content(body(Map.of("title", "Renamed page"))))
            .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select name from tracks where id = ?", String.class, b.collectionId)).isEqualTo("Renamed");
    }

    @Test
    void theSeededAdminOwnsSeededContentAndEditsItAsItsOwner() throws Exception {
        String admin = adminToken();
        long dsa = jdbc.queryForObject("select t.id from tracks t join users u on u.id = t.owner_id where t.slug = 'dsa' and u.email = 'admin@codemastery.local'", Long.class);
        mvc.perform(as(admin, get("/api/collections/" + dsa))).andExpect(status().isOk());
        // another admin-role user who is not the owner is denied
        String otherAdmin = newUserToken();
        String email = jdbc.queryForObject("select email from users order by id desc limit 1", String.class);
        jdbc.update("update users set role = 'ADMIN' where email = ?", email);
        try {
            mvc.perform(as(otherAdmin, put("/api/collections/" + dsa)).content(body(Map.of("title", "Taken over"))))
                .andExpect(status().isForbidden());
        } finally {
            jdbc.update("update users set role = 'USER' where email = ?", email);
        }
        assertThat(jdbc.queryForObject("select name from tracks where id = ?", String.class, dsa)).isNotEqualTo("Taken over");
    }

    private String owner(Built b) {
        return jdbc.queryForObject("select u.username from users u join tracks t on t.owner_id = u.id where t.id = ?", String.class, b.collectionId);
    }

    // ---------- structural sweep: no other write route reaches content ----------
    @Test
    void noMappingOutsideTheOwnerCheckedCreatorControllersWritesCollectionsModulesOrPages() {
        Set<String> offenders = new TreeSet<>();
        Set<String> writes = Set.of("POST", "PUT", "PATCH", "DELETE");
        Set<String> creatorControllers = Set.of("CollectionController", "ModuleController", "PageController");
        for (Map.Entry<RequestMappingInfo, org.springframework.web.method.HandlerMethod> e : mappings.getHandlerMethods().entrySet()) {
            var info = e.getKey();
            String controller = e.getValue().getBeanType().getSimpleName();
            Set<String> methods = new TreeSet<>();
            info.getMethodsCondition().getMethods().forEach((RequestMethod rm) -> methods.add(rm.name()));
            boolean mutates = methods.isEmpty() || methods.stream().anyMatch(writes::contains);
            if (!mutates) continue;
            for (String pattern : info.getPathPatternsCondition().getPatternValues()) {
                boolean contentPath = pattern.matches(".*/(tracks|sections|lessons|collections|modules|pages)(/.*)?");
                if (contentPath && !creatorControllers.contains(controller)) offenders.add(methods + " " + pattern + " -> " + controller);
                if (pattern.startsWith("/api/admin") && controller.equals("AdminContentController")
                        && !pattern.startsWith("/api/admin/problems")) offenders.add(methods + " " + pattern + " -> " + controller);
            }
        }
        assertThat(offenders).as("write routes that could reach content without the creator controllers' ContentAccess checks").isEmpty();
    }

    @Test
    void theSweepActuallySeesTheCreatorRoutes() {
        long creatorWrites = mappings.getHandlerMethods().entrySet().stream()
                .filter(e -> Set.of("CollectionController", "ModuleController", "PageController").contains(e.getValue().getBeanType().getSimpleName()))
                .count();
        assertThat(creatorWrites).as("sanity: the sweep inspects real mappings").isGreaterThan(15);
    }
}
