package com.codemastery.blocks;

/**
 * What {@link BlockValidator} may know about an uploaded asset, supplied by the caller (it never looks anything up itself):
 * whether it is READY and who owns it. The caller fills this from rows it has locked, so the answer cannot change before commit.
 */
public record AssetFacts(boolean ready, Long ownerId) {}
