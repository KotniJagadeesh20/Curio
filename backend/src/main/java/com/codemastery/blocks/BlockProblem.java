package com.codemastery.blocks;

/** One thing wrong with one block: which block (its id, or "#3" when it has none), which field, and what to do. */
public record BlockProblem(String id, String field, String message) {}
