package com.codemastery.user;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/**
 * Rules that user-management operations must respect. Any operation that demotes, suspends or
 * deletes a user (role change today; suspend/delete in a later step) goes through here, so the
 * seeded admin can't be locked out by accident.
 */
public final class UserGuard {
    private UserGuard() {}

    public static void requireNotProtected(User target, String action) {
        if (target.isProtectedAccount()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "This is the protected platform admin account and cannot " + action);
        }
    }
}
