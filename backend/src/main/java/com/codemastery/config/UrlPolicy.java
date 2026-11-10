package com.codemastery.config;

import java.net.URI;
import java.net.URISyntaxException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** Shared URL rules for user-supplied links (PLAN.md security checklist: only https). */
public final class UrlPolicy {
    private UrlPolicy() {}

    /** Blank/null clears the value (returns null). Anything else must be an absolute https URL with a host, no credentials, at most 500 chars. */
    public static String httpsOrNull(String field, String value) {
        if (value == null || value.isBlank()) return null;
        String v = value.trim();
        if (v.length() > 500) throw bad(field + " is too long");
        try {
            URI u = new URI(v);
            if (!"https".equalsIgnoreCase(u.getScheme()) || u.getHost() == null || u.getUserInfo() != null) {
                throw bad(field + " must be an https URL");
            }
        } catch (URISyntaxException e) {
            throw bad(field + " must be an https URL");
        }
        return v;
    }

    private static ResponseStatusException bad(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }
}
