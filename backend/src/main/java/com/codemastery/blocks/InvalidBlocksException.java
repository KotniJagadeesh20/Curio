package com.codemastery.blocks;

import java.util.List;

/** Thrown at the write boundary; becomes 400 {code: INVALID_BLOCKS, problems: [...]}. Nothing was saved. */
public class InvalidBlocksException extends RuntimeException {
    private final transient List<BlockProblem> problems;

    public InvalidBlocksException(List<BlockProblem> problems) {
        super("Some blocks need fixing before this page can be saved.");
        this.problems = List.copyOf(problems);
    }

    public List<BlockProblem> problems() { return problems; }
}
