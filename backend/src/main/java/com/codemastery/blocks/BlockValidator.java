package com.codemastery.blocks;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * WRITE boundary. Validates the block array a creator is saving and rejects it (400 INVALID_BLOCKS, nothing stored) if any
 * block is wrong. It never rewrites content. It is given the page's CURRENTLY STORED blocks so that old content stays savable:
 *  - an unknown-type block is accepted only if an identical block is already stored (Steps 9-10 keep unsupported blocks
 *    byte-for-byte); a new or edited unknown block is refused. Ids on such preserved blocks are not checked at all;
 *  - a known block that is unchanged from the stored one is exempt from SIZE caps only, never from security rules;
 *  - extra fields on a known block are accepted only when the same stored block already has them with the same value.
 */
public final class BlockValidator {
    private BlockValidator() {}

    private static final int MAX_PROBLEMS = 50;

    /** Validation without uploaded assets: an image block that names an {@code assetId} is refused (no asset can be vouched for). */
    public static void validate(List<Map<String, Object>> incoming, List<Map<String, Object>> stored) {
        validate(incoming, stored, Map.of(), null);
    }

    /**
     * @param stored  the page's current blocks, or null when there are none / they are being discarded
     * @param assets  facts about every asset the incoming blocks name (pre-fetched and locked by the caller; this class does no lookups)
     * @param ownerId the collection owner: an asset must exist, be READY and belong to this owner
     */
    public static void validate(List<Map<String, Object>> incoming, List<Map<String, Object>> stored,
                                Map<java.util.UUID, AssetFacts> assets, Long ownerId) {
        List<BlockProblem> problems = new ArrayList<>();
        Map<String, Map<String, Object>> storedById = new HashMap<>();
        if (stored != null) {
            for (Map<String, Object> s : stored) if (s != null && s.get("id") instanceof String id) storedById.putIfAbsent(id, s);
        }
        Set<String> seenIds = new HashSet<>();
        for (int i = 0; i < incoming.size(); i++) {
            Map<String, Object> b = incoming.get(i);
            String label = b != null && b.get("id") instanceof String s && !s.isEmpty() ? s : "#" + (i + 1);
            if (b == null || !(b.get("type") instanceof String type) || type.isBlank()) {
                add(problems, label, "type", "Every block needs a type.");
                continue;
            }
            if (!BlockRules.isKnown(type)) {
                if (stored == null || !stored.contains(b)) add(problems, label, "type", "Blocks of type '" + clip(type) + "' aren't supported, so this block can't be added or changed.");
                continue;
            }
            Object rawId = b.get("id");
            Map<String, Object> before = rawId instanceof String id ? storedById.get(id) : null;
            boolean unchanged = before != null && before.equals(b);
            if (!(rawId instanceof String id) || id.isEmpty()) add(problems, label, "id", "Every block needs an id.");
            else {
                if (!unchanged && id.length() > BlockRules.MAX_ID) add(problems, label, "id", "Block ids are limited to " + BlockRules.MAX_ID + " characters.");
                if (hasControl(id)) add(problems, label, "id", "Block ids can't contain control characters.");
                if (!seenIds.add(id)) add(problems, label, "id", "Two blocks share this id; ids must be unique.");
            }
            Set<String> allowed = BlockRules.FIELDS.get(type);
            for (Map.Entry<String, Object> e : b.entrySet()) {
                String k = e.getKey();
                if (k.equals("id") || k.equals("type") || allowed.contains(k)) continue;
                boolean kept = before != null && before.containsKey(k) && java.util.Objects.equals(before.get(k), e.getValue());
                if (!kept) add(problems, label, k, "Unexpected field '" + clip(k) + "' for a " + type + " block.");
            }
            List<String[]> fieldProblems = BlockRules.check(type, b, !unchanged);
            for (String[] fp : fieldProblems) add(problems, label, fp[0], fp[1]);
            if (type.equals("image") && b.get("assetId") instanceof String a && BlockRules.assetId(a) != null
                    && fieldProblems.stream().noneMatch(fp -> fp[0].equals("assetId"))) {
                AssetFacts f = assets.get(BlockRules.assetId(a));
                // one answer for unknown, not-READY and somebody else's: nothing about other users' media is revealed
                if (f == null || !f.ready() || !java.util.Objects.equals(f.ownerId(), ownerId)) {
                    add(problems, label, "assetId", "This image isn't available. Upload it again.");
                }
            }
        }
        if (!problems.isEmpty()) throw new InvalidBlocksException(problems);
    }

    private static void add(List<BlockProblem> into, String id, String field, String message) {
        if (into.size() < MAX_PROBLEMS) into.add(new BlockProblem(id, field, message));
    }

    private static boolean hasControl(String s) {
        for (int i = 0; i < s.length(); i++) if (s.charAt(i) < 0x20 || s.charAt(i) == 0x7f) return true;
        return false;
    }

    private static String clip(String s) { return s.length() > 40 ? s.substring(0, 40) + "…" : s; }
}
