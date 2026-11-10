package com.codemastery.content;

/** Lightweight projection of a PUBLISHED page and its module (no blocks), for the public collection outline. */
public record PublishedPageRow(Long moduleId, String moduleSlug, String moduleTitle, int modulePosition,
                               String pageSlug, String pageTitle, String pageSummary, int pagePosition) {}
