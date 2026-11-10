package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.codemastery.content.CollectionStatus;
import com.codemastery.content.Lesson;
import com.codemastery.content.ModerationStatus;
import com.codemastery.content.PageStatus;
import com.codemastery.content.Visibility;
import com.codemastery.user.UserRepository;
import com.codemastery.user.UserStatus;
import com.fasterxml.jackson.databind.JsonNode;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;
import java.util.UUID;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/** Step 6: the anonymous public read API over real HTTP (MockMvc through the full security filter chain). */
class PublicApiTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;
    @Autowired EntityManagerFactory emf;

    record Creator(long id, String username, String email, String token) {}

    /** A creator-built collection: module "Basics" (page "Hello" published, page "Secret draft"), module "Drafts only" (one draft page). */
    record Fx(Creator owner, long id, String slug, String title, long basics, long draftsOnly, long hello, long secretDraft, long onlyDraft) {
        String detailUrl() { return "/api/public/collections/" + owner.username + "/" + slug; }
        String pageUrl() { return "/api/public/pages/" + owner.username + "/" + slug + "/basics/hello"; }
        String pageUrlNoModule() { return "/api/public/pages/" + owner.username + "/" + slug + "/hello"; }
    }

    private Creator newCreator() throws Exception {
        String email = "creator-" + UUID.randomUUID() + "@test.com";
        String token = read(mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Creator Name", "email", email, "password", "password123")))).andReturn()).get("token").asText();
        var u = users.findByEmailIgnoreCase(email).orElseThrow();
        return new Creator(u.getId(), u.getUsername(), email, token);
    }

    private JsonNode send(Creator c, String url, Object body, int status) throws Exception {
        var r = mvc.perform(as(c.token, post(url))
                .content(body == null ? "{}" : body(body))).andExpect(status().is(status)).andReturn();
        String s = r.getResponse().getContentAsString();
        return s.isBlank() ? null : json.readTree(s);
    }

    private long id(JsonNode n) { return n.get("id").asLong(); }

    private Fx fixture(Creator c, String title) throws Exception {
        JsonNode col = send(c, "/api/collections", Map.of("title", title), 201);
        long cid = id(col);
        long basics = id(send(c, "/api/collections/" + cid + "/modules", Map.of("title", "Basics"), 201));
        long drafts = id(send(c, "/api/collections/" + cid + "/modules", Map.of("title", "Drafts only"), 201));
        long hello = id(send(c, "/api/modules/" + basics + "/pages", Map.of("title", "Hello", "summary", "Say hi",
                "blocks", List.of(Map.of("id", "h0", "type", "text", "text", "Hello world"))), 201));
        send(c, "/api/pages/" + hello + "/publish", null, 200);
        long secret = id(send(c, "/api/modules/" + basics + "/pages", Map.of("title", "Secret draft"), 201));
        long onlyDraft = id(send(c, "/api/modules/" + drafts + "/pages", Map.of("title", "Unfinished"), 201));
        send(c, "/api/collections/" + cid + "/publish", null, 200);
        return new Fx(c, cid, col.get("slug").asText(), title, basics, drafts, hello, secret, onlyDraft);
    }

    private Fx fixture(Creator c) throws Exception { return fixture(c, uniq("pub")); }

    private int code(String url) throws Exception { return mvc.perform(get(url)).andReturn().getResponse().getStatus(); }

    private JsonNode getOk(String url) throws Exception {
        return json.readTree(raw(url));
    }

    private String raw(String url) throws Exception {
        // MockMvc decodes a charset-less JSON body as ISO-8859-1: read the bytes as UTF-8 like a real client
        return mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }

    /** True if a collection with this title is in the public listing (found through the title search). */
    private boolean listed(Fx f) throws Exception {
        for (JsonNode i : getOk("/api/public/collections?size=50&q=" + f.title).get("items"))
            if (i.get("slug").asText().equals(f.slug) && i.get("creator").get("username").asText().equals(f.owner.username)) return true;
        return false;
    }

    private void setState(Fx f, CollectionStatus s, ModerationStatus m, boolean deleted, UserStatus owner, PageStatus page) {
        jdbc.update("update tracks set status = ?, published = ?, moderation_status = ?, deleted_at = ? where id = ?",
                s.name(), s == CollectionStatus.PUBLISHED, m.name(), deleted ? java.sql.Timestamp.from(java.time.Instant.now()) : null, f.id);
        jdbc.update("update users set status = ? where id = ?", owner.name(), f.owner.id);
        jdbc.update("update lessons set status = ?, published = ? where id = ?", page.name(), page == PageStatus.PUBLISHED, f.hello);
    }

    private static List<String> keys(JsonNode n) {
        List<String> k = new ArrayList<>();
        n.fieldNames().forEachRemaining(k::add);
        return new TreeSet<>(k).stream().toList();
    }

    // =====================================================================================================
    @Test
    void anonymousVisitorsCanListReadACollectionAndItsPage() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        assertThat(listed(f)).isTrue();

        JsonNode d = getOk(f.detailUrl());
        assertThat(d.get("collection").get("title").asText()).isEqualTo(f.title);
        assertThat(d.get("unlisted").asBoolean()).isFalse();
        assertThat(d.get("collection").get("creator").get("username").asText()).isEqualTo(a.username);
        assertThat(d.get("collection").get("creator").get("displayName").asText()).isEqualTo("Creator Name");
        assertThat(d.get("modules")).hasSize(1);
        assertThat(d.get("modules").get(0).get("slug").asText()).isEqualTo("basics");
        assertThat(d.get("modules").get(0).get("pages")).hasSize(1);
        assertThat(d.get("collection").get("moduleCount").asInt()).isEqualTo(1);
        assertThat(d.get("collection").get("pageCount").asInt()).isEqualTo(1);

        for (String url : List.of(f.pageUrl(), f.pageUrlNoModule())) {
            JsonNode p = getOk(url);
            assertThat(p.get("page").get("title").asText()).isEqualTo("Hello");
            assertThat(p.get("page").get("blocks").get(0).get("text").asText()).isEqualTo("Hello world");
            assertThat(p.get("module").get("slug").asText()).isEqualTo("basics");
            assertThat(p.get("collection").get("slug").asText()).isEqualTo(f.slug);
            assertThat(p.get("page").get("legacy").isNull()).isTrue();
        }
        // usernames are case-insensitive, slugs are exact
        assertThat(code("/api/public/collections/" + a.username.toUpperCase() + "/" + f.slug)).isEqualTo(200);
        assertThat(code("/api/public/collections/" + a.username + "/" + f.slug.toUpperCase())).isEqualTo(404);
    }

    /** Every combination of the five inputs, through the real endpoints, checked against the pure Visibility rule. */
    @Test
    void everyPublishingAndModerationStateOverHttp() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        int combos = 0;
        for (CollectionStatus s : CollectionStatus.values())
            for (ModerationStatus m : ModerationStatus.values())
                for (boolean deleted : new boolean[]{false, true})
                    for (UserStatus owner : UserStatus.values())
                        for (PageStatus page : PageStatus.values()) {
                            setState(f, s, m, deleted, owner, page);
                            boolean hasPublished = page == PageStatus.PUBLISHED;
                            boolean listed = Visibility.collectionListed(s, m, deleted, owner) && hasPublished;
                            boolean readable = Visibility.collectionReadable(s, m, deleted, owner) && hasPublished;
                            boolean pageReadable = Visibility.pageReadable(page, s, m, deleted, owner);
                            String why = s + "/" + m + "/deleted=" + deleted + "/" + owner + "/page " + page;
                            assertThat(listed(f)).as("listed: " + why).isEqualTo(listed);
                            assertThat(code(f.detailUrl())).as("detail: " + why).isEqualTo(readable ? 200 : 404);
                            assertThat(code(f.pageUrl())).as("page: " + why).isEqualTo(pageReadable ? 200 : 404);
                            assertThat(code(f.pageUrlNoModule())).as("page (no module): " + why).isEqualTo(pageReadable ? 200 : 404);
                            combos++;
                        }
        assertThat(combos).isEqualTo(48);
    }

    @Test
    void unlistedIsReachableByLinkButNeverListed() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        send(a, "/api/collections/" + f.id + "/publish", Map.of("status", "UNLISTED"), 200);
        assertThat(listed(f)).isFalse();
        JsonNode d = getOk(f.detailUrl());
        assertThat(d.get("unlisted").asBoolean()).isTrue();
        assertThat(getOk(f.pageUrl()).get("collection").get("unlisted").asBoolean()).isTrue();
        // and it never turns up through category filters or search either
        assertThat(getOk("/api/public/collections?size=50&q=" + f.title).get("totalItems").asInt()).isZero();
    }

    @Test
    void draftHiddenDeletedAndSuspendedAreAll404WithTheSameBodyAsAMissingOne() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        String missing = mvc.perform(get("/api/public/collections/" + a.username + "/no-such")).andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();
        String missingPage = mvc.perform(get("/api/public/pages/" + a.username + "/no-such/x")).andExpect(status().isNotFound())
                .andReturn().getResponse().getContentAsString();

        for (String how : List.of("draft", "hidden", "deleted", "suspended")) {
            switch (how) {
                case "draft" -> send(a, "/api/collections/" + f.id + "/unpublish", null, 200);
                case "hidden" -> jdbc.update("update tracks set moderation_status='HIDDEN' where id=?", f.id);
                case "deleted" -> jdbc.update("update tracks set deleted_at=CURRENT_TIMESTAMP where id=?", f.id);
                default -> jdbc.update("update users set status='SUSPENDED' where id=?", a.id);
            }
            assertThat(mvc.perform(get(f.detailUrl())).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString())
                    .as(how).isEqualTo(missing);
            assertThat(mvc.perform(get(f.pageUrl())).andExpect(status().isNotFound()).andReturn().getResponse().getContentAsString())
                    .as(how).isEqualTo(missingPage);
            assertThat(listed(f)).as(how).isFalse();
            // restore for the next round
            jdbc.update("update tracks set moderation_status='OK', deleted_at=null, status='PUBLISHED', published=true where id=?", f.id);
            jdbc.update("update users set status='ACTIVE' where id=?", a.id);
            assertThat(code(f.detailUrl())).as("restored after " + how).isEqualTo(200);
        }
    }

    @Test
    void theCallerNeverChangesTheAnswerOwnerAdminOrGarbageTokensIncluded() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        send(a, "/api/collections/" + f.id + "/unpublish", null, 200); // a draft: the owner can see it in the workspace only
        for (String token : List.of(a.token, adminToken(), "garbage.token.value")) {
            assertThat(mvc.perform(get(f.detailUrl()).header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus()).isEqualTo(404);
            assertThat(mvc.perform(get(f.pageUrl()).header("Authorization", "Bearer " + token)).andReturn().getResponse().getStatus()).isEqualTo(404);
        }
        jdbc.update("update tracks set status='PUBLISHED', published=true, moderation_status='HIDDEN' where id=?", f.id);
        assertThat(mvc.perform(get(f.detailUrl()).header("Authorization", "Bearer " + a.token)).andReturn().getResponse().getStatus())
                .as("hidden: not even the owner sees it through the public API").isEqualTo(404);
        // ...but the owner still sees the moderation state in the workspace
        mvc.perform(as(a.token, get("/api/collections/" + f.id))).andExpect(status().isOk())
                .andExpect(jsonPath("$.collection.hiddenByModeration").value(true));
    }

    @Test
    void aPrivateProfileDoesNotHideItsPublishedCollections() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        assertThat(code("/api/public/creators/" + a.username)).isEqualTo(200);
        jdbc.update("update user_profiles set visibility = 'PRIVATE' where user_id = ?", a.id);

        assertThat(code("/api/public/creators/" + a.username)).as("the profile is hidden").isEqualTo(404);
        assertThat(listed(f)).as("the collection is still listed").isTrue();
        assertThat(code(f.detailUrl())).isEqualTo(200);
        assertThat(code(f.pageUrl())).isEqualTo(200);
        JsonNode creator = getOk(f.detailUrl()).get("collection").get("creator");
        assertThat(creator.get("username").asText()).isEqualTo(a.username);
        assertThat(creator.get("displayName").asText()).isEqualTo("Creator Name");
        assertThat(keys(creator)).containsExactly("displayName", "username");

        // and the other direction: a PUBLIC profile with only a draft collection exposes nothing
        jdbc.update("update user_profiles set visibility = 'PUBLIC' where user_id = ?", a.id);
        send(a, "/api/collections/" + f.id + "/unpublish", null, 200);
        assertThat(code("/api/public/creators/" + a.username)).isEqualTo(200);
        assertThat(code(f.detailUrl())).isEqualTo(404);
        assertThat(listed(f)).isFalse();
    }

    @Test
    void suspendedCreatorsContentVanishesAndComesBack() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        Fx fa = fixture(a);
        Fx fb = fixture(b);
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.id);
        assertThat(listed(fa)).isFalse();
        assertThat(code(fa.detailUrl())).isEqualTo(404);
        assertThat(code(fa.pageUrl())).isEqualTo(404);
        assertThat(code(fa.pageUrlNoModule())).isEqualTo(404);
        assertThat(listed(fb)).as("other creators are unaffected").isTrue();
        assertThat(code(fb.detailUrl())).isEqualTo(200);
        jdbc.update("update users set status = 'ACTIVE' where id = ?", a.id);
        assertThat(listed(fa)).isTrue();
        assertThat(code(fa.pageUrl())).isEqualTo(200);
    }

    @Test
    void emptyCollectionsAndEmptyModulesNeverAppear() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);

        // modules: "Drafts only" (one draft page) is omitted, as is a module with no page at all
        send(a, "/api/collections/" + f.id + "/modules", Map.of("title", "Totally empty"), 201);
        JsonNode d = getOk(f.detailUrl());
        assertThat(d.get("modules")).hasSize(1);
        assertThat(raw(f.detailUrl())).doesNotContain("drafts-only").doesNotContain("totally-empty").doesNotContain("Unfinished");
        // a module becomes visible as soon as it holds a published page
        send(a, "/api/pages/" + f.onlyDraft + "/publish", null, 200);
        assertThat(getOk(f.detailUrl()).get("modules")).hasSize(2);
        assertThat(getOk(f.detailUrl()).get("collection").get("moduleCount").asInt()).isEqualTo(2);
        send(a, "/api/pages/" + f.onlyDraft + "/unpublish", null, 200);
        assertThat(getOk(f.detailUrl()).get("modules")).hasSize(1);

        // collection: PUBLISHED but with its last published page back in draft -> not listed, 404, status unchanged
        send(a, "/api/pages/" + f.hello + "/unpublish", null, 200);
        assertThat(jdbc.queryForObject("select status from tracks where id = ?", String.class, f.id)).isEqualTo("PUBLISHED");
        assertThat(listed(f)).isFalse();
        assertThat(code(f.detailUrl())).isEqualTo(404);
        assertThat(code(f.pageUrl())).isEqualTo(404);
        send(a, "/api/pages/" + f.hello + "/publish", null, 200);
        assertThat(listed(f)).isTrue();

        // a published collection with no modules at all (rows inserted behind the API's back) is never public either
        long bare = jdbc.queryForObject("select id from tracks where id = ?", Long.class, f.id);
        jdbc.update("delete from lessons where section_id in (select id from sections where track_id = ?)", bare);
        assertThat(listed(f)).isFalse();
        assertThat(code(f.detailUrl())).isEqualTo(404);
    }

    @Test
    void publicCountsOnlyCountPublishedContent() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a); // 3 pages, 2 modules; 1 published page in 1 module
        JsonNode item = getOk("/api/public/collections?q=" + f.title).get("items").get(0);
        assertThat(item.get("moduleCount").asInt()).isEqualTo(1);
        assertThat(item.get("pageCount").asInt()).isEqualTo(1);
        send(a, "/api/pages/" + f.secretDraft + "/publish", null, 200);
        send(a, "/api/pages/" + f.onlyDraft + "/publish", null, 200);
        item = getOk("/api/public/collections?q=" + f.title).get("items").get(0);
        assertThat(item.get("moduleCount").asInt()).isEqualTo(2);
        assertThat(item.get("pageCount").asInt()).isEqualTo(3);
    }

    @Test
    void nothingPrivateLeaksThroughAnyResponseShape() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        jdbc.update("update tracks set category_id = (select id from categories where slug = 'programming') where id = ?", f.id);
        String all = raw("/api/public/collections?q=" + f.title) + raw(f.detailUrl()) + raw(f.pageUrl());

        // exact key sets: a new field can't appear unnoticed
        JsonNode list = getOk("/api/public/collections?q=" + f.title);
        assertThat(keys(list)).containsExactly("items", "page", "size", "totalItems", "totalPages");
        JsonNode item = list.get("items").get(0);
        assertThat(keys(item)).containsExactly("category", "coverThumbUrl", "coverUrl", "creator", "description", "moduleCount", "pageCount", "slug", "title");
        assertThat(keys(item.get("category"))).containsExactly("name", "slug");
        JsonNode d = getOk(f.detailUrl());
        assertThat(keys(d)).containsExactly("collection", "modules", "unlisted");
        assertThat(keys(d.get("modules").get(0))).containsExactly("pages", "position", "slug", "title");
        assertThat(keys(d.get("modules").get(0).get("pages").get(0))).containsExactly("position", "slug", "summary", "title");
        JsonNode p = getOk(f.pageUrl());
        assertThat(keys(p)).containsExactly("collection", "module", "page");
        assertThat(keys(p.get("collection"))).containsExactly("creator", "slug", "title", "unlisted");
        assertThat(keys(p.get("page"))).containsExactly("blocks", "legacy", "slug", "summary", "title");

        // and the values: no email, no draft content, no ids
        assertThat(all).doesNotContain(a.email).doesNotContain("@test.com")
                .doesNotContain("Secret draft").doesNotContain("secret-draft")
                .doesNotContain("Unfinished").doesNotContain("drafts-only")
                .doesNotContainIgnoringCase("moderation").doesNotContainIgnoringCase("ownerId")
                .doesNotContainIgnoringCase("deletedAt").doesNotContain("\"status\"")     // entity ids: pinned by the exact key sets above (block ids live inside "blocks" and are fine)
                
                .doesNotContainIgnoringCase("password");
    }

    @Test
    void hiddenContentCannotLeakThroughNestedRoutesOrOtherCreators() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        Fx fa = fixture(a, uniq("shared-title"));
        Fx fb = fixture(b, fa.title); // same title -> same slug under another creator
        assertThat(fb.slug).isEqualTo(fa.slug);
        jdbc.update("update tracks set moderation_status = 'HIDDEN' where id = ?", fa.id);

        assertThat(code(fa.detailUrl())).isEqualTo(404);
        assertThat(code(fa.pageUrl())).isEqualTo(404);
        assertThat(code(fa.pageUrlNoModule())).isEqualTo(404);
        // B's collection with the same slug is untouched and shows only B's content
        assertThat(getOk(fb.detailUrl()).get("collection").get("creator").get("username").asText()).isEqualTo(b.username);
        assertThat(code(fb.pageUrl())).isEqualTo(200);
        // A's slugs under B's username, and B's under A's, are 404 (lookups are owner-scoped)
        assertThat(code("/api/public/collections/" + b.username + "/" + fa.slug + "-x")).isEqualTo(404);
        // the listing has exactly one entry for the shared title, and it is B's
        JsonNode items = getOk("/api/public/collections?size=50&q=" + fa.title).get("items");
        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("creator").get("username").asText()).isEqualTo(b.username);
        // an unknown or malformed owner is the same 404
        assertThat(code("/api/public/collections/nobody-here/" + fa.slug)).isEqualTo(404);
        assertThat(code("/api/public/pages/nobody-here/" + fa.slug + "/hello")).isEqualTo(404);
    }

    @Test
    void aPageUnderADraftOrSoftDeletedCollectionIs404ForRealDeletesToo() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        mvc.perform(as(a.token, delete("/api/collections/" + f.id))).andExpect(status().isNoContent());
        assertThat(code(f.detailUrl())).isEqualTo(404);
        assertThat(code(f.pageUrl())).isEqualTo(404);
        assertThat(listed(f)).isFalse();
        send(a, "/api/collections/" + f.id + "/restore", null, 200); // comes back as a DRAFT
        assertThat(code(f.detailUrl())).isEqualTo(404);
        assertThat(code(f.pageUrl())).isEqualTo(404);
        send(a, "/api/collections/" + f.id + "/publish", null, 200);
        assertThat(code(f.detailUrl())).isEqualTo(200);
        assertThat(code(f.pageUrl())).isEqualTo(200);
    }

    @Test
    void pageSlugsRepeatedAcrossModulesAreResolvedByModuleOrInReadingOrder() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        long second = id(send(a, "/api/collections/" + f.id + "/modules", Map.of("title", "Advanced"), 201));
        long other = id(send(a, "/api/modules/" + second + "/pages", Map.of("title", "Hello", "summary", "second hello"), 201));
        send(a, "/api/pages/" + other + "/publish", null, 200);
        String base = "/api/public/pages/" + a.username + "/" + f.slug;
        assertThat(getOk(base + "/basics/hello").get("page").get("summary").asText()).isEqualTo("Say hi");
        assertThat(getOk(base + "/advanced/hello").get("page").get("summary").asText()).isEqualTo("second hello");
        assertThat(getOk(base + "/hello").get("module").get("slug").asText()).as("first in reading order").isEqualTo("basics");
        assertThat(code(base + "/advanced/secret-draft")).isEqualTo(404);
        assertThat(code(base + "/basics/secret-draft")).isEqualTo(404);
        assertThat(code(base + "/secret-draft")).isEqualTo(404);
        assertThat(code(base + "/drafts-only/unfinished")).isEqualTo(404);
        assertThat(code(base + "/nope/hello")).isEqualTo(404);
    }

    @Test
    void searchCategoryAndPaging() throws Exception {
        Creator a = newCreator();
        String tag = uniq("zq");
        Fx f1 = fixture(a, "A_B " + tag);
        Fx f2 = fixture(a, "AxB " + tag);
        Fx f3 = fixture(a, "Third " + tag);
        long prog = jdbc.queryForObject("select id from categories where slug = 'programming'", Long.class);
        jdbc.update("update tracks set category_id = ? where id in (?, ?)", prog, f1.id, f2.id);

        // LIKE wildcards in the search are literals; case-insensitive; matches description too
        assertThat(getOk("/api/public/collections?q=a_b " + tag).get("items")).hasSize(1);
        assertThat(getOk("/api/public/collections?q=A_B " + tag).get("items").get(0).get("slug").asText()).isEqualTo(f1.slug);
        assertThat(getOk("/api/public/collections?q=%25").get("totalItems").asInt())
                .as("a lone % is not a wildcard").isLessThan(getOk("/api/public/collections").get("totalItems").asInt());
        jdbc.update("update tracks set description = ? where id = ?", "about quokkas " + tag, f3.id);
        assertThat(getOk("/api/public/collections?q=quokkas " + tag).get("items")).hasSize(1);

        // category filter
        JsonNode inCat = getOk("/api/public/collections?category=programming&q=" + tag);
        assertThat(inCat.get("totalItems").asInt()).isEqualTo(2);
        assertThat(inCat.get("items").get(0).get("category").get("slug").asText()).isEqualTo("programming");
        assertThat(getOk("/api/public/collections?category=no-such-category&q=" + tag).get("items")).isEmpty();

        // paging: newest first, stable, clamped
        JsonNode p0 = getOk("/api/public/collections?size=2&page=0&q=" + tag);
        JsonNode p1 = getOk("/api/public/collections?size=2&page=1&q=" + tag);
        assertThat(p0.get("totalItems").asInt()).isEqualTo(3);
        assertThat(p0.get("totalPages").asInt()).isEqualTo(2);
        assertThat(p0.get("items")).hasSize(2);
        assertThat(p1.get("items")).hasSize(1);
        assertThat(p0.get("items").get(0).get("slug").asText()).isEqualTo(f3.slug);
        assertThat(p1.get("items").get(0).get("slug").asText()).isEqualTo(f1.slug);
        assertThat(getOk("/api/public/collections?size=1000").get("size").asInt()).isEqualTo(50);
        assertThat(getOk("/api/public/collections?size=0").get("size").asInt()).isEqualTo(1);
        assertThat(getOk("/api/public/collections?page=-5").get("page").asInt()).isZero();
        assertThat(getOk("/api/public/collections?page=9999&q=" + tag).get("items")).isEmpty();
    }

    @Test
    void listingQueriesDoNotLoadPagesAndDoNotGrowWithTheNumberOfCollections() throws Exception {
        Creator a = newCreator();
        String tag = uniq("perf");
        for (int i = 0; i < 12; i++) fixture(a, "Perf " + i + " " + tag);

        Statistics stats = emf.unwrap(SessionFactory.class).getStatistics();
        stats.setStatisticsEnabled(true);
        try {
            stats.clear();
            JsonNode list = getOk("/api/public/collections?size=50&q=" + tag);
            assertThat(list.get("items")).hasSize(12);
            long statements = stats.getPrepareStatementCount();
            assertThat(statements).as("list: page + count + counts + display names").isLessThanOrEqualTo(5);
            assertThat(stats.getEntityStatistics(Lesson.class.getName()).getLoadCount()).as("no page entity is loaded for a list").isZero();

            stats.clear();
            getOk("/api/public/collections?size=2&q=" + tag);
            assertThat(stats.getPrepareStatementCount()).as("2 rows (a full page: one extra count query) vs 12 rows: constant, not per row")
                    .isBetween(statements, statements + 1);

            stats.clear();
            String slug = list.get("items").get(0).get("slug").asText();
            getOk("/api/public/collections/" + a.username + "/" + slug);
            assertThat(stats.getEntityStatistics(Lesson.class.getName()).getLoadCount()).as("detail reads a projection, not page entities").isZero();
            assertThat(stats.getPrepareStatementCount()).isLessThanOrEqualTo(4);
        } finally {
            stats.setStatisticsEnabled(false);
        }
    }

    @Test
    void theListingQueryAgreesWithTheVisibilityRuleForSeededContentToo() throws Exception {
        // the seeded (admin-owned) collections are reachable through the new API and carry their legacy content
        JsonNode list = getOk("/api/public/collections?size=50&q=");
        assertThat(list.get("totalItems").asInt()).isGreaterThan(0);
        Map<String, Object> row = jdbc.queryForMap("select u.username as u, t.slug as c, s.slug as m, l.slug as p, l.concept as concept "
                + "from lessons l join sections s on s.id = l.section_id join tracks t on t.id = s.track_id join users u on u.id = t.owner_id "
                + "where l.concept <> '' and l.blocks is null and l.status = 'PUBLISHED' and t.status = 'PUBLISHED' and u.role = 'ADMIN' limit 1");
        JsonNode view = getOk("/api/public/pages/" + row.get("u") + "/" + row.get("c") + "/" + row.get("m") + "/" + row.get("p"));
        assertThat(view.get("page").get("blocks").isNull()).isTrue();
        assertThat(keys(view.get("page").get("legacy"))).containsExactly("bestPractices", "codeExample", "codeLanguage", "commonMistakes",
                "concept", "interviewRelevance", "realWorld");
        assertThat(view.get("page").get("legacy").get("concept").asText()).isEqualTo(row.get("concept"));
        // every listed item is readable, and every readable item's outline is not empty
        for (JsonNode i : list.get("items")) {
            JsonNode det = getOk("/api/public/collections/" + i.get("creator").get("username").asText() + "/" + i.get("slug").asText());
            assertThat(det.get("modules")).isNotEmpty();
            assertThat(det.get("unlisted").asBoolean()).isFalse();
            assertThat(det.get("collection").get("pageCount").asInt()).isEqualTo(i.get("pageCount").asInt());
        }
    }

    @Test
    void publicEndpointsAreReadOnlyAndNeedNoToken() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a);
        for (var req : List.of(post("/api/public/collections"), put(f.detailUrl()), delete(f.detailUrl()), patch(f.pageUrl()))) {
            int s = mvc.perform(req.contentType(MediaType.APPLICATION_JSON).content("{}")).andReturn().getResponse().getStatus();
            assertThat(s).as(req.toString()).isIn(401, 403, 405);
        }
        assertThat(jdbc.queryForObject("select status from tracks where id = ?", String.class, f.id)).isEqualTo("PUBLISHED");
    }
}
