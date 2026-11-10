package com.codemastery;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;

import com.codemastery.media.MediaStatus;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;

/**
 * Step 12b: nothing may bypass reference management. (1) A source scan fails if any class other than the approved ones writes page
 * bodies, covers or reference rows. (2) The integrity audit, which recomputes the expected references from the content, really
 * detects each kind of mismatch it claims to.
 */
class MediaReferenceGuardTest extends MediaRefSupport {
    private static final Path MAIN = Path.of("src/main/java");

    private static List<String[]> sources() throws IOException {
        try (Stream<Path> s = Files.walk(MAIN)) {
            List<String[]> out = new ArrayList<>();
            for (Path p : s.filter(f -> f.toString().endsWith(".java")).collect(Collectors.toList())) {
                out.add(new String[] {MAIN.relativize(p).toString(), Files.readString(p)});
            }
            return out;
        }
    }

    /** Files (relative to src/main/java) whose source contains {@code needle}, ignoring lines that are comments. */
    private static List<String> filesContaining(String needle) throws IOException {
        List<String> out = new ArrayList<>();
        for (String[] f : sources()) {
            boolean hit = f[1].lines().map(String::strip).filter(l -> !l.startsWith("*") && !l.startsWith("//") && !l.startsWith("/*")).anyMatch(l -> l.contains(needle));
            if (hit) out.add(f[0]);
        }
        return out;
    }

    private static int occurrences(String file, String needle) throws IOException {
        String src = Files.readString(MAIN.resolve(file));
        return (int) src.lines().map(String::strip).filter(l -> !l.startsWith("*") && !l.startsWith("//")).filter(l -> l.contains(needle)).count();
    }

    @Test
    void onlyCollectionServiceWritesPageBodiesAndAlwaysThroughTheReferenceService() throws Exception {
        assertThat(filesContaining(".setBlocks(")).containsExactly("com/codemastery/collection/CollectionService.java");
        // the two body writes (create and update) each lock the assets first and apply the diff afterwards
        assertThat(occurrences("com/codemastery/collection/CollectionService.java", ".setBlocks(")).isEqualTo(2);
        assertThat(occurrences("com/codemastery/collection/CollectionService.java", "media.lockForBody(")).isEqualTo(2);
        assertThat(occurrences("com/codemastery/collection/CollectionService.java", "media.applyBody(")).isEqualTo(2);
    }

    @Test
    void onlyTheReferenceServiceWritesCoversAndReferenceRows() throws Exception {
        assertThat(filesContaining(".setCoverAssetId(")).containsExactly("com/codemastery/media/MediaReferenceService.java");
        assertThat(filesContaining("new MediaReference(")).containsExactly("com/codemastery/media/MediaReferenceService.java");
        assertThat(filesContaining(".deleteByPageAndAssets(")).containsExactly("com/codemastery/media/MediaReferenceService.java");
        assertThat(filesContaining("MediaReferenceRepository ")).as("the reference repository is injected only where it is used")
                .containsExactlyInAnyOrder("com/codemastery/media/MediaReferenceService.java", "com/codemastery/media/MediaReferenceRepository.java");
        assertThat(filesContaining("cover_asset_id")).as("no hand-written SQL against the cover column").containsExactly("com/codemastery/content/Track.java");
        assertThat(filesContaining("media_references")).as("the table is named only by its entity and in the audit's (read-only) messages")
                .containsExactlyInAnyOrder("com/codemastery/media/MediaReference.java", "com/codemastery/media/MediaIntegrityAudit.java");
        for (String write : List.of("insert into media_references", "delete from media_references", "update media_references")) {
            assertThat(filesContaining(write)).as("no hand-written " + write).isEmpty();
        }
        assertThat(filesContaining("em.persist(")).as("only the reference service persists references").containsExactly("com/codemastery/media/MediaReferenceService.java");
    }

    @Test
    void theCollectionLockIsTakenBeforeEveryMediaTouchingWrite() throws Exception {
        String src = Files.readString(MAIN.resolve("com/codemastery/collection/CollectionService.java"));
        for (String method : List.of("update", "delete", "restore", "publish", "unpublish", "createModule", "updateModule", "deleteModule", "createPage", "updatePage", "deletePage")) {
            int start = src.indexOf(" " + method + "(");
            assertThat(start).as(method).isPositive();
            String body = src.substring(start, Math.min(src.length(), start + 400));
            assertThat(body).as(method + " must take the collection lock first").containsPattern("lockCollection(IfOwner|OfModule|OfPage)\\(");
            // ... and before any entity of the collection is loaded through ContentAccess
            assertThat(body.indexOf("lockCollection")).as(method).isLessThan(body.indexOf("access."));
        }
    }

    // ------------------------------------------------------------------------------------------------------------------
    // the audit detects what it claims to
    // ------------------------------------------------------------------------------------------------------------------
    @Test
    void theAuditFindsABodyWithoutAReferenceAReferenceWithoutABodyAndTheOtherInconsistencies() throws Exception {
        Account a = signup(), b = signup();
        Coll c = collection(a);
        long p = page(a, module(a, c), null);
        UUID x = uploadReal(a), y = uploadReal(a), theirs = uploadReal(b);
        assertThat(mediaAudit.audit()).isEmpty();

        // 1. an image block whose reference row is missing (someone wrote the body without MediaReferenceService)
        jdbc.update("update lessons set blocks = ? where id = ?", "[{\"id\":\"i1\",\"type\":\"image\",\"assetId\":\"" + x + "\"}]", p);
        assertThat(mediaAudit.audit()).anyMatch(f -> f.contains("is in a page body but has no media_references row"));
        jdbc.update("update lessons set blocks = ? where id = ?", "[]", p);
        assertThat(mediaAudit.audit()).isEmpty();

        // 2. a reference row without a block
        jdbc.update("insert into media_references (asset_id, page_id) values (?, ?)", x, p);
        jdbc.update("update media_assets set unreferenced_since = null where id = ?", x);
        assertThat(mediaAudit.audit()).anyMatch(f -> f.contains("has a media_references row but no image block"));
        jdbc.update("delete from media_references where asset_id = ?", x);
        jdbc.update("update media_assets set unreferenced_since = now() where id = ?", x);
        assertThat(mediaAudit.audit()).isEmpty();

        // 3. a cover that belongs to someone else, or is not READY
        jdbc.update("update tracks set cover_asset_id = ? where id = ?", theirs, c.id());
        jdbc.update("update media_assets set unreferenced_since = null where id = ?", theirs);
        assertThat(mediaAudit.audit()).anyMatch(f -> f.contains("owned by someone else"));
        jdbc.update("update media_assets set status = 'DELETING' where id = ?", theirs);
        assertThat(mediaAudit.audit()).anyMatch(f -> f.contains("in state DELETING"));
        jdbc.update("update tracks set cover_asset_id = null where id = ?", c.id());
        jdbc.update("update media_assets set status = 'READY', unreferenced_since = now() where id = ?", theirs);
        assertThat(mediaAudit.audit()).isEmpty();

        // 4. a reference to an asset that is being deleted, and a referenced asset that still has an orphan stamp
        ok(savePage(a, p, List.of(image("i1", y))), 200);
        jdbc.update("update media_assets set status = 'DELETING' where id = ?", y);
        assertThat(mediaAudit.audit()).anyMatch(f -> f.contains("references asset " + y + " in state DELETING"));
        jdbc.update("update media_assets set status = 'READY', unreferenced_since = now() where id = ?", y);
        assertThat(mediaAudit.audit()).anyMatch(f -> f.contains("is referenced but still has an orphan stamp"));
        jdbc.update("update media_assets set unreferenced_since = null where id = ?", y);
        assertThat(mediaAudit.audit()).isEmpty();
    }

    @Test
    void anUnreadableBodyIsNotJudgedSoItsReferencesAreNeitherMissingNorExtra() throws Exception {
        Account a = signup();
        long p = page(a, module(a, collection(a)), null);
        UUID x = uploadReal(a);
        ok(savePage(a, p, List.of(image("i1", x))), 200);
        String good = jdbc.queryForObject("select blocks from lessons where id = ?", String.class, p);
        try {
            // a legacy/corrupt body (kept exactly as stored, Step 11) that still has its reference rows, with and without the word assetId
            for (String unreadable : new String[] {"this is not json assetId", "garbage", "{\"not\":\"an array\"}"}) {
                jdbc.update("update lessons set blocks = ? where id = ?", unreadable, p);
                assertThat(mediaAudit.audit()).as(unreadable).isEmpty();
            }
        } finally {
            jdbc.update("update lessons set blocks = ? where id = ?", good, p);
        }
        assertThat(mediaAudit.audit()).isEmpty();
        // a readable body is still judged
        jdbc.update("update lessons set blocks = '[]' where id = ?", p);
        assertThat(mediaAudit.audit()).anyMatch(f -> f.contains("has a media_references row but no image block"));
        jdbc.update("update lessons set blocks = ? where id = ?", good, p);
    }
}
