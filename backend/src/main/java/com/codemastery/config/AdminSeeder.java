package com.codemastery.config;

import com.codemastery.content.TrackRepository;
import com.codemastery.user.Role;
import com.codemastery.user.User;
import com.codemastery.user.UserRepository;
import com.codemastery.user.UserService;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class AdminSeeder implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AdminSeeder.class);

    private final UserRepository users;
    private final UserService userService;
    private final TrackRepository tracks;
    private final String email;
    private final String password;

    public AdminSeeder(UserRepository users, UserService userService, TrackRepository tracks,
                       @Value("${app.admin.email}") String email,
                       @Value("${app.admin.password}") String password) {
        this.users = users;
        this.userService = userService;
        this.tracks = tracks;
        this.email = email;
        this.password = password;
    }

    @Override
    public void run(ApplicationArguments args) {
        Optional<User> existing = users.findByEmailIgnoreCase(email);
        if (existing.isPresent()) {
            // Databases created before the protected flag existed: mark the seeded admin now.
            User admin = existing.get();
            if (admin.getRole() == Role.ADMIN && !admin.isProtectedAccount()) {
                admin.setProtectedAccount(true);
                users.save(admin);
                log.info("Marked existing admin {} as a protected account", email);
            }
            adoptOrphanContent(admin);
            return;
        }
        User admin = userService.createSeedAdmin("Admin", email.toLowerCase(), password);
        log.info("Created initial admin user {}", email);
        adoptOrphanContent(admin);
    }

    /** Seeded content has no owner when migrations run (the admin doesn't exist yet): give it to the admin. */
    private void adoptOrphanContent(User admin) {
        if (admin.getRole() == Role.ADMIN) {
            int n = tracks.assignOrphansTo(admin);
            if (n > 0) log.info("Assigned {} ownerless collection(s) to admin {}", n, admin.getEmail());
        }
        long left = tracks.countByOwnerIsNull();
        if (left > 0) log.error("{} collection(s) still have no owner: {} is not an ADMIN account", left, email);
    }
}
