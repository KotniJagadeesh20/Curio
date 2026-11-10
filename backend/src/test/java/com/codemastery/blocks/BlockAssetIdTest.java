package com.codemastery.blocks;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/** Step 12b block rules: {@code assetId} on image blocks (the validator stays pure: facts are handed in). */
class BlockAssetIdTest {
    static final UUID A = UUID.fromString("123e4567-e89b-12d3-a456-426614174000");
    static final Long OWNER = 7L;

    private static Map<String, Object> img(Object assetId, Object url) {
        Map<String, Object> m = new java.util.LinkedHashMap<>(Map.of("id", "b1", "type", "image"));
        if (assetId != null) m.put("assetId", assetId);
        if (url != null) m.put("url", url);
        return m;
    }

    private static void validate(Map<String, Object> block, Map<UUID, AssetFacts> facts) {
        BlockValidator.validate(List.of(block), null, facts, OWNER);
    }

    @Test void aReadyAssetOfTheOwnerIsAccepted() {
        validate(img(A.toString(), null), Map.of(A, new AssetFacts(true, OWNER)));
    }

    @Test void unknownNotReadyAndForeignAssetsAreRefusedWithTheSameMessage() {
        for (Map<UUID, AssetFacts> facts : List.of(Map.<UUID, AssetFacts>of(), Map.of(A, new AssetFacts(false, OWNER)), Map.of(A, new AssetFacts(true, 8L)))) {
            assertThatThrownBy(() -> validate(img(A.toString(), null), facts)).isInstanceOf(InvalidBlocksException.class)
                    .satisfies(e -> assertThat(((InvalidBlocksException) e).problems()).singleElement()
                            .matches(p -> p.field().equals("assetId") && p.message().equals("This image isn't available. Upload it again.")));
        }
    }

    @Test void bothSourcesAndMalformedIdsAreRefused() {
        Map<UUID, AssetFacts> ok = Map.of(A, new AssetFacts(true, OWNER));
        assertThatThrownBy(() -> validate(img(A.toString(), "https://x.example/a.png"), ok)).isInstanceOf(InvalidBlocksException.class);
        for (Object bad : new Object[] {"", "nope", A.toString().toUpperCase(), "1-1-1-1-1", 5, true}) {
            assertThatThrownBy(() -> validate(img(bad, null), ok)).as(String.valueOf(bad)).isInstanceOf(InvalidBlocksException.class);
        }
    }

    @Test void anEmptyUrlNextToAnAssetIdIsFine() {
        validate(img(A.toString(), ""), Map.of(A, new AssetFacts(true, OWNER)));
    }

    @Test void theTwoArgumentValidateKnowsNoAssets() {
        assertThatThrownBy(() -> BlockValidator.validate(List.of(img(A.toString(), null)), null)).isInstanceOf(InvalidBlocksException.class);
    }

    @Test void onlyImageBlocksMayCarryAnAssetId() {
        Map<UUID, AssetFacts> ok = Map.of(A, new AssetFacts(true, OWNER));
        Map<String, Object> video = Map.of("id", "v", "type", "video", "url", "https://x.example/v.mp4", "assetId", A.toString());
        assertThatThrownBy(() -> validate(video, ok)).isInstanceOf(InvalidBlocksException.class);
    }

    @Test void theReadProjectionKeepsAValidAssetIdAndOmitsAmbiguousOrMalformedBlocks() {
        List<Map<String, Object>> out = BlockSanitizer.project(List.of(
                img(A.toString(), null),
                img(A.toString(), "https://x.example/a.png"),    // both: ambiguous, omitted
                img("nope", null)));                              // malformed id: omitted
        assertThat(out).hasSize(1);
        assertThat(out.get(0).get("assetId")).isEqualTo(A.toString());
        assertThat(BlockSanitizer.project(out)).as("idempotent").isEqualTo(out);
    }
}
