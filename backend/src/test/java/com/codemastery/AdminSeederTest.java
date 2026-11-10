package com.codemastery;

import static org.junit.jupiter.api.Assertions.*;

import com.codemastery.config.AdminSeeder;
import com.codemastery.user.Role;
import com.codemastery.user.User;
import com.codemastery.user.UserProfileRepository;
import com.codemastery.user.UserRepository;
import com.codemastery.user.UserService;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

class AdminSeederTest extends ApiTestSupport {
    @Autowired UserRepository users;
    @Autowired UserProfileRepository profiles;
    @Autowired UserService userService;
    @Autowired com.codemastery.content.TrackRepository tracks;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;

    @Test
    void existingUnprotectedAdminGetsMarkedProtected() {
        String email = "legacy-admin-" + UUID.randomUUID() + "@test.com";
        // an admin that predates the protected flag: created without it
        User legacy = userService.register("Legacy", email, "password123", null);
        legacy.setRole(Role.ADMIN);
        users.save(legacy);
        assertFalse(users.findById(legacy.getId()).orElseThrow().isProtectedAccount());

        new AdminSeeder(users, userService, tracks, email, "irrelevant").run(null);

        User after = users.findById(legacy.getId()).orElseThrow();
        assertTrue(after.isProtectedAccount());
        assertEquals(Role.ADMIN, after.getRole());
        assertEquals(legacy.getUsername(), after.getUsername(), "username untouched");
    }

    @Test
    void runningTheSeederTwiceChangesNothing() {
        String email = "seed-twice-" + UUID.randomUUID() + "@test.com";
        AdminSeeder seeder = new AdminSeeder(users, userService, tracks, email, "password123");
        seeder.run(null);
        long usersBefore = users.count();
        long profilesBefore = profiles.count();
        seeder.run(null);
        assertEquals(usersBefore, users.count());
        assertEquals(profilesBefore, profiles.count());
    }

    @Test
    void newSeedAdminGoesThroughTheServiceSoUsernameAndProfileExist() {
        String email = "brand-new-admin-" + UUID.randomUUID() + "@test.com";
        new AdminSeeder(users, userService, tracks, email, "password123").run(null);

        User admin = users.findByEmailIgnoreCase(email).orElseThrow();
        assertEquals(Role.ADMIN, admin.getRole());
        assertTrue(admin.isProtectedAccount());
        assertNotNull(admin.getUsername());
        assertTrue(admin.getUsername().startsWith("brand_new_admin_"));
        var profile = profiles.findById(admin.getId()).orElseThrow();
        assertEquals("Admin", profile.getDisplayName());
        assertEquals("PUBLIC", profile.getVisibility().name());
    }

    @Test
    void anOrdinaryUserWithTheAdminEmailIsNeitherPromotedNorProtected() {
        String email = "not-an-admin-" + UUID.randomUUID() + "@test.com";
        User u = userService.register("Regular", email, "password123", null);

        new AdminSeeder(users, userService, tracks, email, "irrelevant").run(null);

        User after = users.findById(u.getId()).orElseThrow();
        assertEquals(Role.USER, after.getRole());
        assertFalse(after.isProtectedAccount());
    }

    private long insertTrack(String slug, Long ownerId) {
        jdbc.update("insert into tracks (slug, name, owner_id, status, published) values (?, ?, ?, 'PUBLISHED', true)",
                slug, slug, ownerId);
        return jdbc.queryForObject("select id from tracks where slug = ? and owner_id " + (ownerId == null ? "is null" : "= " + ownerId),
                Long.class, slug);
    }

    private Long ownerOf(long trackId) {
        return jdbc.queryForObject("select owner_id from tracks where id = ?", Long.class, trackId);
    }

    @Test
    void adoptsOnlyOwnerlessTracksNeverOverwritesAnOwnerAndIsIdempotent() {
        User admin = users.findByEmailIgnoreCase("admin@codemastery.local").orElseThrow();
        User creator = userService.register("Creator", "creator-" + UUID.randomUUID() + "@test.com", "password123", null);
        String s1 = "orphan-" + UUID.randomUUID().toString().substring(0, 8);
        String s2 = "owned-" + UUID.randomUUID().toString().substring(0, 8);
        long orphan = insertTrack(s1, null);
        long owned = insertTrack(s2, creator.getId());
        try {
            AdminSeeder seeder = new AdminSeeder(users, userService, tracks, "admin@codemastery.local", "irrelevant");
            seeder.run(null);
            assertEquals(admin.getId(), ownerOf(orphan), "ownerless track goes to the admin");
            assertEquals(creator.getId(), ownerOf(owned), "an existing owner is never overwritten");

            long adminOwned = jdbc.queryForObject("select count(*) from tracks where owner_id = ?", Long.class, admin.getId());
            seeder.run(null);
            seeder.run(null);
            assertEquals(admin.getId(), ownerOf(orphan));
            assertEquals(creator.getId(), ownerOf(owned));
            assertEquals(adminOwned, jdbc.queryForObject("select count(*) from tracks where owner_id = ?", Long.class, admin.getId()),
                    "re-running changes nothing");
            assertEquals(0, tracks.assignOrphansTo(admin), "nothing left to assign");
            assertEquals(0, tracks.countByOwnerIsNull());

            // even a different ADMIN running the seeder later cannot take over content that already has an owner
            User other = userService.register("Other admin", "other-admin-" + UUID.randomUUID() + "@test.com", "password123", null);
            other.setRole(Role.ADMIN);
            users.save(other);
            assertEquals(0, tracks.assignOrphansTo(other));
            assertEquals(admin.getId(), ownerOf(orphan));
        } finally {
            jdbc.update("delete from tracks where id in (?, ?)", orphan, owned);
        }
    }

    @Test
    void anAccountThatIsNotAnAdminDoesNotAdoptOrphans() {
        String email = "not-admin-" + UUID.randomUUID() + "@test.com";
        User u = userService.register("Regular", email, "password123", null);
        long orphan = insertTrack("orphan-" + UUID.randomUUID().toString().substring(0, 8), null);
        try {
            new AdminSeeder(users, userService, tracks, email, "irrelevant").run(null);
            assertNull(ownerOf(orphan), "a USER holding the admin email must not receive the seeded content");
            assertEquals(1, tracks.countByOwnerIsNull());
        } finally {
            jdbc.update("delete from tracks where id = ?", orphan);
        }
        assertEquals(Role.USER, users.findById(u.getId()).orElseThrow().getRole());
    }
}
