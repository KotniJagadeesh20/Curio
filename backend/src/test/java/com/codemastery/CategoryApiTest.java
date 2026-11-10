package com.codemastery;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CategoryApiTest extends ApiTestSupport {

    private JsonNode list() throws Exception {
        return read(mvc.perform(get("/api/public/categories")).andExpect(status().isOk()).andReturn());
    }

    private JsonNode create(String admin, Map<String, Object> body) throws Exception {
        return read(mvc.perform(as(admin, post("/api/admin/categories")).content(body(body)))
                .andExpect(status().isCreated()).andReturn());
    }

    private List<String> slugs(JsonNode arr) {
        List<String> out = new ArrayList<>();
        arr.forEach(n -> out.add(n.get("slug").asText()));
        return out;
    }

    @Test
    void publicListNeedsNoTokenAndHasTheSixSeededCategoriesInOrder() throws Exception {
        List<String> slugs = slugs(list());
        assertThat(slugs).containsSubsequence(
                "programming", "travel", "food", "personal-experience", "creative", "other");
        mvc.perform(get("/api/public/categories"))
            .andExpect(jsonPath("$[?(@.slug=='programming')].name").value("Programming"))
            .andExpect(jsonPath("$[?(@.slug=='programming')].icon").value("code"))
            .andExpect(jsonPath("$[?(@.slug=='programming')].id").isNotEmpty());
    }

    @Test
    void adminCanCreateUpdateAndDelete() throws Exception {
        String admin = adminToken();
        String slug = uniq("cat");
        JsonNode created = create(admin, Map.of("slug", slug, "name", "  Gardening  ", "icon", "flower"));
        long id = created.get("id").asLong();
        assertThat(created.get("name").asText()).isEqualTo("Gardening");          // trimmed
        assertThat(slugs(list())).contains(slug);

        mvc.perform(as(admin, put("/api/admin/categories/" + id))
                .content(body(Map.of("slug", slug, "name", "Gardening & Plants", "icon", "leaf", "position", 99))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Gardening & Plants"))
            .andExpect(jsonPath("$.icon").value("leaf"))
            .andExpect(jsonPath("$.position").value(99));

        mvc.perform(as(admin, delete("/api/admin/categories/" + id))).andExpect(status().isNoContent());
        assertThat(slugs(list())).doesNotContain(slug);
        mvc.perform(as(admin, delete("/api/admin/categories/" + id))).andExpect(status().isNotFound());
    }

    @Test
    void defaultsApplyAndNewCategoriesAreAppendedLast() throws Exception {
        String admin = adminToken();
        JsonNode a = create(admin, Map.of("slug", uniq("last-a"), "name", "A"));
        JsonNode b = create(admin, Map.of("slug", uniq("last-b"), "name", "B"));
        assertThat(a.get("icon").asText()).isEqualTo("folder");
        assertThat(b.get("position").asInt()).isGreaterThan(a.get("position").asInt());
        JsonNode all = list();
        assertThat(all.get(all.size() - 1).get("id").asLong()).isEqualTo(b.get("id").asLong());
    }

    @Test
    void updatingPositionReordersThePublicList() throws Exception {
        String admin = adminToken();
        String slug = uniq("first");
        JsonNode c = create(admin, Map.of("slug", slug, "name", "Should be first"));
        mvc.perform(as(admin, put("/api/admin/categories/" + c.get("id").asLong()))
                .content(body(Map.of("slug", slug, "name", "Should be first", "position", -1))))
            .andExpect(status().isOk());
        List<String> order = slugs(list());
        assertThat(order.indexOf(slug)).isLessThan(order.indexOf("programming"));
        mvc.perform(as(admin, delete("/api/admin/categories/" + c.get("id").asLong()))).andExpect(status().isNoContent());
    }

    @Test
    void nonAdminsAndAnonymousCannotWrite() throws Exception {
        String user = newUserToken();
        String payload = body(Map.of("slug", uniq("nope"), "name", "Nope"));
        mvc.perform(post("/api/admin/categories").contentType(MediaType.APPLICATION_JSON).content(payload))
            .andExpect(status().isUnauthorized());
        mvc.perform(as(user, post("/api/admin/categories")).content(payload)).andExpect(status().isForbidden());
        mvc.perform(as(user, put("/api/admin/categories/1")).content(payload)).andExpect(status().isForbidden());
        mvc.perform(as(user, delete("/api/admin/categories/1"))).andExpect(status().isForbidden());
        mvc.perform(delete("/api/admin/categories/1")).andExpect(status().isUnauthorized());
        assertThat(slugs(list())).contains("programming");        // untouched
    }

    @Test
    void duplicateSlugIsRejectedOnCreateAndUpdate() throws Exception {
        String admin = adminToken();
        mvc.perform(as(admin, post("/api/admin/categories")).content(body(Map.of("slug", "travel", "name", "Dup"))))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("Slug already in use"));

        // (duplicate-on-update can no longer happen: slugs are immutable, see slugIsImmutableOnUpdate)
    }

    @Test
    void slugIsImmutableOnUpdate() throws Exception {
        String admin = adminToken();
        String slug = uniq("fixed");
        JsonNode c = create(admin, Map.of("slug", slug, "name", "Fixed", "icon", "lock"));
        String url = "/api/admin/categories/" + c.get("id").asLong();

        // changing to a free slug, to another category's slug, or only the case/format -> 400 with a clear message
        for (String attempt : List.of(uniq("other"), "food", slug + "-2", "Bad Slug")) {
            mvc.perform(as(admin, put(url)).content(body(Map.of("slug", attempt, "name", "Hacked", "position", 50))))
                .andExpect(status().isBadRequest());
        }
        mvc.perform(as(admin, put(url)).content(body(Map.of("slug", uniq("other"), "name", "Hacked"))))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.error").value("Category slug cannot be changed"));

        // nothing was applied by the rejected requests
        JsonNode after = list();
        JsonNode mine = null;
        for (JsonNode n : after) if (n.get("id").asLong() == c.get("id").asLong()) mine = n;
        assertThat(mine.get("slug").asText()).isEqualTo(slug);
        assertThat(mine.get("name").asText()).isEqualTo("Fixed");
        assertThat(mine.get("position").asInt()).isNotEqualTo(50);

        // echoing the current slug back, or omitting it, is fine; name/icon/position change
        mvc.perform(as(admin, put(url)).content(body(Map.of("slug", slug, "name", "Renamed", "icon", "key", "position", 77))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.slug").value(slug))
            .andExpect(jsonPath("$.name").value("Renamed"))
            .andExpect(jsonPath("$.icon").value("key"))
            .andExpect(jsonPath("$.position").value(77));
        mvc.perform(as(admin, put(url)).content(body(Map.of("name", "No slug sent"))))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.slug").value(slug))
            .andExpect(jsonPath("$.name").value("No slug sent"))
            .andExpect(jsonPath("$.icon").value("key"))          // omitted = unchanged
            .andExpect(jsonPath("$.position").value(77));
        mvc.perform(as(admin, delete(url))).andExpect(status().isNoContent());
    }

    @Test
    void invalidInputIsRejected() throws Exception {
        String admin = adminToken();
        for (Map<String, Object> bad : List.<Map<String, Object>>of(
                Map.of("slug", "Has Space", "name", "X"),
                Map.of("slug", "UPPER", "name", "X"),
                Map.of("slug", "trailing-", "name", "X"),
                Map.of("slug", "", "name", "X"),
                Map.of("slug", "ok-slug", "name", "   "),
                Map.of("slug", "ok-slug", "name", "n".repeat(81)),
                Map.of("slug", "s".repeat(61), "name", "X"),
                Map.of("slug", "ok-slug", "name", "X", "icon", "i".repeat(61)))) {
            mvc.perform(as(admin, post("/api/admin/categories")).content(body(bad))).andExpect(status().isBadRequest());
        }
    }

    @Test
    void updateOrDeleteOfMissingCategoryIs404() throws Exception {
        String admin = adminToken();
        mvc.perform(as(admin, put("/api/admin/categories/999999"))
                .content(body(Map.of("slug", uniq("ghost"), "name", "Ghost"))))
            .andExpect(status().isNotFound());
        mvc.perform(as(admin, delete("/api/admin/categories/999999"))).andExpect(status().isNotFound());
    }
}
