package com.codemastery.media;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read-only consistency check of everything {@link MediaReferenceService} is responsible for. It recomputes what the references
 * <i>should</i> be from the page bodies and the covers and compares that with the stored state. It never repairs anything: a
 * mismatch means some code path bypassed the single writer, and a human should look. It runs after each sweep (logged as an error)
 * and after every API test (asserted empty).
 *
 * <p>Checks: (1) every image block's {@code assetId} has its {@code media_references} row and every row has a block; (2) every cover
 * asset exists, is READY and belongs to the collection's owner; (3) no reference points at an asset that is not READY (nothing
 * referenced may be deleted); (4) the invariant "a referenced asset has no orphan stamp".
 */
@Component
public class MediaIntegrityAudit {
    private static final Logger log = LoggerFactory.getLogger(MediaIntegrityAudit.class);
    private static final int MAX_FINDINGS = 50;

    @PersistenceContext private EntityManager em;
    private final ObjectMapper json;

    public MediaIntegrityAudit(ObjectMapper json) {
        this.json = json;
    }

    @Transactional(readOnly = true)
    public List<String> audit() {
        List<String> findings = new ArrayList<>();

        // (1) page bodies <-> media_references. A body that can't be read is preserved as stored and never rewritten (Step 11), so it
        // can't be checked: the references of such a page are neither "expected" nor "extra", they are simply not judged.
        Set<String> expected = new HashSet<>();
        Set<Long> unreadable = new HashSet<>();
        for (Object[] row : em.createQuery("select l.id, l.blocks from Lesson l where l.blocks like '%assetId%' "
                + "or l.id in (select r.pageId from MediaReference r)", Object[].class).getResultList()) {
            Long pageId = (Long) row[0];
            try {
                List<Map<String, Object>> blocks = json.readValue((String) row[1], new TypeReference<>() {});
                for (UUID id : MediaReferenceService.extractAssetIds(blocks)) expected.add(pageId + ":" + id);
            } catch (Exception notReadable) {
                unreadable.add(pageId);
            }
        }
        Set<String> actual = new HashSet<>();
        for (Object[] row : em.createQuery("select r.pageId, r.assetId from MediaReference r", Object[].class).getResultList()) {
            if (!unreadable.contains((Long) row[0])) actual.add(row[0] + ":" + row[1]);
        }
        for (String e : expected) if (!actual.contains(e)) add(findings, "page:asset " + e + " is in a page body but has no media_references row");
        for (String a : actual) if (!expected.contains(a)) add(findings, "page:asset " + a + " has a media_references row but no image block");

        // (2) covers
        for (Object[] row : em.createQuery("select t.id, t.coverAssetId, t.owner.id, a.status, a.ownerId from Track t left join MediaAsset a on a.id = t.coverAssetId "
                + "where t.coverAssetId is not null", Object[].class).getResultList()) {
            if (row[3] == null) add(findings, "collection " + row[0] + " has cover " + row[1] + " which does not exist");
            else if (row[3] != MediaStatus.READY) add(findings, "collection " + row[0] + " has cover " + row[1] + " in state " + row[3]);
            else if (!row[2].equals(row[4])) add(findings, "collection " + row[0] + " has cover " + row[1] + " owned by someone else");
        }

        // (3) references to assets that are not READY
        for (Object[] row : em.createQuery("select r.pageId, r.assetId, a.status from MediaReference r, MediaAsset a where a.id = r.assetId and a.status <> com.codemastery.media.MediaStatus.READY", Object[].class).getResultList()) {
            add(findings, "page " + row[0] + " references asset " + row[1] + " in state " + row[2]);
        }

        // (4) invariant: referenced => NULL orphan stamp
        for (Object id : em.createQuery("select m.id from MediaAsset m where m.unreferencedSince is not null and "
                + "(exists (select 1 from MediaReference r where r.assetId = m.id) or exists (select 1 from Track t where t.coverAssetId = m.id))", Object.class).getResultList()) {
            add(findings, "asset " + id + " is referenced but still has an orphan stamp");
        }
        return findings;
    }

    /** Called by the sweeper: an error line per finding; nothing else happens. */
    public void logMismatches() {
        try {
            for (String f : audit()) log.error("media integrity: {}", f);
        } catch (RuntimeException e) {
            log.warn("media integrity audit could not run: {}", e.toString());
        }
    }

    private static void add(List<String> into, String finding) {
        if (into.size() < MAX_FINDINGS) into.add(finding);
    }
}
