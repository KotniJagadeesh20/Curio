package com.codemastery.config;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** A 409 the client can tell apart from other 409s by {@link #code()} (returned as {@code code} in the error body). */
public class CodedConflictException extends ResponseStatusException {
    private final String code;

    public CodedConflictException(String code, String message) {
        super(HttpStatus.CONFLICT, message);
        this.code = code;
    }

    public String code() { return code; }
}
