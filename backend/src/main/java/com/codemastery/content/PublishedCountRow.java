package com.codemastery.content;

/** Per collection: modules that hold at least one published page, and the number of published pages. */
public record PublishedCountRow(Long collectionId, long moduleCount, long pageCount) {}
