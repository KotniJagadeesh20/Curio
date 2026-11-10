package com.codemastery.media;

/** UPLOADING (reserved, objects being written) -> READY (served) -> DELETING (unusable; the row goes once storage is clean). */
public enum MediaStatus { UPLOADING, READY, DELETING }
