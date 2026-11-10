package com.codemastery.config;

/** 409 VERSION_CONFLICT: the page was changed by someone else since the client loaded it. Rolls the request back. */
public class VersionConflictException extends CodedConflictException {
    public VersionConflictException() {
        super("VERSION_CONFLICT", "This page was changed somewhere else since you opened it, so your changes were not saved.");
    }
}
