package com.codemastery.security;

import com.codemastery.user.Role;
import com.codemastery.user.User;
import com.codemastery.user.UserRepository;
import com.codemastery.user.UserStatus;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * The authenticated caller, re-read from the database on every call. {@link JwtAuthFilter} already refuses to
 * authenticate a suspended user; this repeats the check where writes are authorised, so a status change after the
 * request was authenticated, or a code path that sets the security context some other way, still can't write.
 */
@Component
public class CurrentUser {
    private final UserRepository users;

    public CurrentUser(UserRepository users) {
        this.users = users;
    }

    /** The authenticated, ACTIVE user, or 401 (anonymous, unknown id, or suspended: the reason is not revealed). */
    public User require() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth == null || !(auth.getPrincipal() instanceof Long id)) throw unauthorized();
        User user = users.findById(id).orElseThrow(CurrentUser::unauthorized);
        if (user.getStatus() != UserStatus.ACTIVE) throw unauthorized();
        return user;
    }

    public static boolean isAdmin(User user) {
        return user.getRole() == Role.ADMIN;
    }

    private static ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required");
    }
}
