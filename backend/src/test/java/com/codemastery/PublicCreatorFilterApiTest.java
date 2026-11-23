package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.codemastery.content.CollectionStatus;
import com.codemastery.content.ModerationStatus;
import com.codemastery.content.PageStatus;
import com.codemastery.content.Visibility;
import com.codemastery.user.UserRepository;
import com.codemastery.user.UserStatus;
import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * Step 15a: {@code GET /api/public/collections?creator=<username>} (plan rev. 2.1 §3.1, Q15-1 (a)).
 * The filter narrows the existing LISTED query to one owner. It never looks at profile visibility (a PRIVATE
 * profile's listed collections are still returned), and an unknown, invalid or suspended creator is an empty page.
 */
class PublicCreatorFilterApiTest extends ApiTestSupport {
    @Autowired JdbcTemplate jdbc;
    @Autowired UserRepository users;

    record Creator(long id, String username, String token) {}
    record Fx(Creator owner, long id, String slug, String title, long hello) {}

    private Creator newCreator() throws Exception {
        String email = "creator-" + UUID.randomUUID() + "@test.com";
        String token = read(mvc.perform(post("/api/auth/signup").contentType(MediaType.APPLICATION_JSON)
                .content(body(Map.of("name", "Creator Name", "email", email, "password", "password123")))).andReturn()).get("token").asText();
        var u = users.findByEmailIgnoreCase(email).orElseThrow();
        return new Creator(u.getId(), u.getUsername(), token);
    }

    private JsonNode send(Creator c, String url, Object body, int status) throws Exception {
        var r = mvc.perform(as(c.token, post(url)).content(body == null ? "{}" : body(body)))
                .andExpect(status().is(status)).andReturn();
        String s = r.getResponse().getContentAsString();
        return s.isBlank() ? null : json.readTree(s);
    }

    /** A collection with one published page in module "Basics", published. */
    private Fx fixture(Creator c, String title) throws Exception {
        JsonNode col = send(c, "/api/collections", Map.of("title", title), 201);
        long cid = col.get("id").asLong();
        long basics = send(c, "/api/collections/" + cid + "/modules", Map.of("title", "Basics"), 201).get("id").asLong();
        long hello = send(c, "/api/modules/" + basics + "/pages", Map.of("title", "Hello",
                "blocks", List.of(Map.of("id", "h0", "type", "text", "text", "Hello world"))), 201).get("id").asLong();
        send(c, "/api/pages/" + hello + "/publish", null, 200);
        send(c, "/api/collections/" + cid + "/publish", null, 200);
        return new Fx(c, cid, col.get("slug").asText(), title, hello);
    }

    private JsonNode getOk(String url) throws Exception {
        return json.readTree(mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse()
                .getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    /** "username/slug" of every item on one response page. */
    private static List<String> refs(JsonNode page) {
        List<String> out = new ArrayList<>();
        for (JsonNode i : page.get("items")) out.add(i.get("creator").get("username").asText() + "/" + i.get("slug").asText());
        return out;
    }

    private static String ref(Fx f) { return f.owner.username + "/" + f.slug; }

    private List<String> byCreator(String creator) throws Exception {
        return refs(getOk("/api/public/collections?size=50&creator=" + creator));
    }

    // =====================================================================================================
    @Test
    void returnsOnlyThatCreatorsListedCollectionsNewestFirst() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        Fx a1 = fixture(a, uniq("a1"));
        Fx a2 = fixture(a, uniq("a2"));
        Fx b1 = fixture(b, uniq("b1"));

        JsonNode page = getOk("/api/public/collections?creator=" + a.username);
        assertThat(refs(page)).containsExactly(ref(a2), ref(a1));
        assertThat(page.get("totalItems").asInt()).isEqualTo(2);
        assertThat(byCreator(b.username)).containsExactly(ref(b1));
        // same response shape as the unfiltered list (no new DTO)
        JsonNode item = page.get("items").get(0);
        JsonNode unfiltered = null;
        for (JsonNode i : getOk("/api/public/collections?size=50&q=" + a2.title).get("items"))
            if (ref(a2).equals(i.get("creator").get("username").asText() + "/" + i.get("slug").asText())) unfiltered = i;
        assertThat(unfiltered).as("a2 is in the unfiltered list").isNotNull();
        assertThat(item).isEqualTo(unfiltered);
    }

    @Test
    void unlistedDraftHiddenDeletedAndEmptyCollectionsAreNeverReturned() throws Exception {
        Creator a = newCreator();
        Fx listed = fixture(a, uniq("ok"));
        Fx unlisted = fixture(a, uniq("unl"));
        send(a, "/api/collections/" + unlisted.id + "/publish", Map.of("status", "UNLISTED"), 200);
        Fx draft = fixture(a, uniq("dr"));
        send(a, "/api/collections/" + draft.id + "/unpublish", null, 200);
        Fx hidden = fixture(a, uniq("hid"));
        jdbc.update("update tracks set moderation_status = 'HIDDEN' where id = ?", hidden.id);
        Fx deleted = fixture(a, uniq("del"));
        jdbc.update("update tracks set deleted_at = ? where id = ?", java.sql.Timestamp.from(java.time.Instant.now()), deleted.id);
        Fx empty = fixture(a, uniq("emp"));
        jdbc.update("update lessons set status = 'DRAFT', published = false where id = ?", empty.hello);

        assertThat(byCreator(a.username)).containsExactly(ref(listed));
    }

    @Test
    void theFilterAgreesWithTheVisibilityRuleInEveryState() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a, uniq("mx"));
        int combos = 0;
        for (CollectionStatus s : CollectionStatus.values())
            for (ModerationStatus m : ModerationStatus.values())
                for (boolean deleted : new boolean[]{false, true})
                    for (UserStatus owner : UserStatus.values())
                        for (PageStatus page : PageStatus.values()) {
                            jdbc.update("update tracks set status = ?, published = ?, moderation_status = ?, deleted_at = ? where id = ?",
                                    s.name(), s == CollectionStatus.PUBLISHED, m.name(),
                                    deleted ? java.sql.Timestamp.from(java.time.Instant.now()) : null, f.id);
                            jdbc.update("update users set status = ? where id = ?", owner.name(), a.id);
                            jdbc.update("update lessons set status = ?, published = ? where id = ?", page.name(), page == PageStatus.PUBLISHED, f.hello);
                            boolean expected = Visibility.collectionListed(s, m, deleted, owner) && page == PageStatus.PUBLISHED;
                            assertThat(byCreator(a.username).contains(ref(f)))
                                    .as(s + "/" + m + "/deleted=" + deleted + "/" + owner + "/page " + page).isEqualTo(expected);
                            combos++;
                        }
        assertThat(combos).isEqualTo(48);
    }

    @Test
    void pagingReturnsEveryCollectionExactlyOnce() throws Exception {
        Creator a = newCreator();
        Set<String> expected = new HashSet<>();
        for (int i = 0; i < 7; i++) expected.add(ref(fixture(a, uniq("pg" + i))));

        JsonNode p0 = getOk("/api/public/collections?size=3&page=0&creator=" + a.username);
        assertThat(p0.get("totalItems").asInt()).isEqualTo(7);
        assertThat(p0.get("totalPages").asInt()).isEqualTo(3);
        List<String> all = new ArrayList<>();
        for (int p = 0; p < 3; p++) all.addAll(refs(getOk("/api/public/collections?size=3&page=" + p + "&creator=" + a.username)));
        assertThat(all).hasSize(7).doesNotHaveDuplicates();
        assertThat(new HashSet<>(all)).isEqualTo(expected);
        assertThat(getOk("/api/public/collections?size=3&page=3&creator=" + a.username).get("items")).isEmpty();
        // the existing clamps still apply
        assertThat(getOk("/api/public/collections?size=1000&creator=" + a.username).get("size").asInt()).isEqualTo(50);
    }

    @Test
    void usernameIsCaseInsensitiveAndTrimmed() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a, uniq("case"));
        assertThat(byCreator(a.username.toUpperCase())).containsExactly(ref(f));
        // padded with spaces (passed as a real parameter: MockMvc's URL template would encode a literal "%20")
        JsonNode padded = json.readTree(mvc.perform(get("/api/public/collections").param("creator", "  " + a.username + " "))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(refs(padded)).containsExactly(ref(f));
    }

    @Test
    void unknownInvalidAndSuspendedCreatorsGiveAnEmptyPage() throws Exception {
        Creator a = newCreator();
        fixture(a, uniq("sus"));
        for (String who : List.of("no_such_user_" + UUID.randomUUID().toString().substring(0, 8), "!!bad!!", "%25", "a")) {
            JsonNode page = getOk("/api/public/collections?creator=" + who);
            assertThat(page.get("items")).as(who).isEmpty();
            assertThat(page.get("totalItems").asInt()).as(who).isZero();
        }
        jdbc.update("update users set status = 'SUSPENDED' where id = ?", a.id);
        JsonNode page = getOk("/api/public/collections?creator=" + a.username);
        assertThat(page.get("items")).isEmpty();
        assertThat(page.get("totalItems").asInt()).isZero();
    }

    @Test
    void aPrivateProfileDoesNotAffectTheCreatorFilter() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a, uniq("priv"));
        jdbc.update("update user_profiles set visibility = 'PRIVATE' where user_id = ?", a.id);
        mvc.perform(get("/api/public/creators/" + a.username)).andExpect(status().isNotFound());
        assertThat(byCreator(a.username)).as("profile privacy is independent of collection listing").containsExactly(ref(f));
    }

    @Test
    void combinesWithCategoryAndSearchAndBlankMeansUnfiltered() throws Exception {
        Creator a = newCreator();
        Creator b = newCreator();
        String tag = uniq("cmb");
        Fx a1 = fixture(a, "Alpha " + tag);
        Fx a2 = fixture(a, "Beta " + tag);
        Fx b1 = fixture(b, "Alpha " + tag);
        long prog = jdbc.queryForObject("select id from categories where slug = 'programming'", Long.class);
        jdbc.update("update tracks set category_id = ? where id in (?, ?)", prog, a1.id, b1.id);

        assertThat(refs(getOk("/api/public/collections?category=programming&creator=" + a.username))).containsExactly(ref(a1));
        assertThat(refs(getOk("/api/public/collections?q=beta " + tag + "&creator=" + a.username))).containsExactly(ref(a2));
        assertThat(refs(getOk("/api/public/collections?q=alpha " + tag + "&creator=" + b.username))).containsExactly(ref(b1));
        assertThat(getOk("/api/public/collections?category=no-such-category&creator=" + a.username).get("items")).isEmpty();
        // a blank creator behaves exactly like no creator
        assertThat(refs(getOk("/api/public/collections?q=" + tag + "&creator=")))
                .containsExactlyInAnyOrderElementsOf(refs(getOk("/api/public/collections?q=" + tag)));
        assertThat(refs(getOk("/api/public/collections?q=" + tag))).hasSize(3);
    }

    @Test
    void theFilterNeedsNoTokenAndIgnoresTheCaller() throws Exception {
        Creator a = newCreator();
        Fx f = fixture(a, uniq("anon"));
        Creator other = newCreator();
        String url = "/api/public/collections?creator=" + a.username;
        String anon = mvc.perform(get(url)).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String asOwner = mvc.perform(as(a.token, get(url))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        String asOther = mvc.perform(as(other.token, get(url))).andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        assertThat(asOwner).isEqualTo(anon);
        assertThat(asOther).isEqualTo(anon);
        assertThat(refs(json.readTree(anon))).containsExactly(ref(f));
    }
}
