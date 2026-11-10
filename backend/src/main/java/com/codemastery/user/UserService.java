package com.codemastery.user;

import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class UserService {
    private final UserRepository users;
    private final UserProfileRepository profiles;
    private final PasswordEncoder encoder;

    public UserService(UserRepository users, UserProfileRepository profiles, PasswordEncoder encoder) {
        this.users = users;
        this.profiles = profiles;
        this.encoder = encoder;
    }

    /** Self-service signup. The username is optional; without one it is derived from the email. */
    @Transactional
    public User register(String name, String email, String password, String requestedUsername) {
        String username = requestedUsername == null || requestedUsername.isBlank()
                ? UsernamePolicy.derive(email, users::existsByUsername, false)
                : requireAvailable(requestedUsername);
        return create(name, email, password, username, Role.USER, false);
    }

    /** The initial admin: may use the reserved name "admin", and can't be suspended or demoted. */
    @Transactional
    public User createSeedAdmin(String name, String email, String password) {
        String username = UsernamePolicy.derive(email, users::existsByUsername, true);
        return create(name, email, password, username, Role.ADMIN, true);
    }

    private User create(String name, String email, String password, String username, Role role, boolean prot) {
        User u = new User();
        u.setName(name);
        u.setEmail(email);
        u.setUsername(username);
        u.setPasswordHash(encoder.encode(password));
        u.setRole(role);
        u.setProtectedAccount(prot);
        users.save(u);

        UserProfile p = new UserProfile();
        p.setUserId(u.getId());
        p.setDisplayName(name);
        profiles.save(p);
        return u;
    }

    private String requireAvailable(String raw) {
        String username = UsernamePolicy.normalize(raw);
        if (!UsernamePolicy.isValidFormat(username)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, UsernamePolicy.FORMAT_HELP);
        }
        if (UsernamePolicy.isReserved(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "That username is reserved");
        }
        if (users.existsByUsername(username)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Username already taken");
        }
        return username;
    }
}
