package com.codemastery;

import static org.junit.jupiter.api.Assertions.*;

import com.codemastery.content.CollectionStatus;
import com.codemastery.content.ModerationStatus;
import com.codemastery.content.PageStatus;
import com.codemastery.content.Visibility;
import com.codemastery.user.UserStatus;
import org.junit.jupiter.api.Test;

/** Pure unit test of the visibility rule (PLAN.md 3a): every combination of page x collection x moderation x deleted x owner. */
class VisibilityRuleTest {
    private static final UserStatus[] OWNERS = {UserStatus.ACTIVE, UserStatus.SUSPENDED, null};

    @Test
    void everyCombinationMatchesTheWrittenRule() {
        int n = 0;
        for (PageStatus page : PageStatus.values())
            for (CollectionStatus col : CollectionStatus.values())
                for (ModerationStatus mod : ModerationStatus.values())
                    for (boolean deleted : new boolean[]{false, true})
                        for (UserStatus owner : OWNERS) {
                            boolean ownerOk = owner != UserStatus.SUSPENDED;
                            boolean colReadable = col != CollectionStatus.DRAFT && mod == ModerationStatus.OK && !deleted && ownerOk;
                            boolean colListed = col == CollectionStatus.PUBLISHED && colReadable;
                            boolean pageReadable = page == PageStatus.PUBLISHED && colReadable;
                            String ctx = page + "/" + col + "/" + mod + "/deleted=" + deleted + "/owner=" + owner;
                            assertEquals(colReadable, Visibility.collectionReadable(col, mod, deleted, owner), "readable " + ctx);
                            assertEquals(colListed, Visibility.collectionListed(col, mod, deleted, owner), "listed " + ctx);
                            assertEquals(pageReadable, Visibility.pageReadable(page, col, mod, deleted, owner), "page " + ctx);
                            n++;
                        }
        assertEquals(2 * 3 * 2 * 2 * 3, n);
    }

    @Test
    void namedCases() {
        var A = UserStatus.ACTIVE;
        var OK = ModerationStatus.OK;
        // published + published + ok + active: visible everywhere
        assertTrue(Visibility.collectionListed(CollectionStatus.PUBLISHED, OK, false, A));
        assertTrue(Visibility.pageReadable(PageStatus.PUBLISHED, CollectionStatus.PUBLISHED, OK, false, A));
        // unlisted: readable by link, never listed; its published page is readable
        assertTrue(Visibility.collectionReadable(CollectionStatus.UNLISTED, OK, false, A));
        assertFalse(Visibility.collectionListed(CollectionStatus.UNLISTED, OK, false, A));
        assertTrue(Visibility.pageReadable(PageStatus.PUBLISHED, CollectionStatus.UNLISTED, OK, false, A));
        // a draft page is hidden even in a published collection (publishing a collection doesn't publish its drafts)
        assertFalse(Visibility.pageReadable(PageStatus.DRAFT, CollectionStatus.PUBLISHED, OK, false, A));
        // a published page under a draft collection is hidden
        assertFalse(Visibility.pageReadable(PageStatus.PUBLISHED, CollectionStatus.DRAFT, OK, false, A));
        // moderation, soft delete and suspension each hide it on their own
        assertFalse(Visibility.collectionReadable(CollectionStatus.PUBLISHED, ModerationStatus.HIDDEN, false, A));
        assertFalse(Visibility.collectionReadable(CollectionStatus.PUBLISHED, OK, true, A));
        assertFalse(Visibility.collectionReadable(CollectionStatus.PUBLISHED, OK, false, UserStatus.SUSPENDED));
        // no owner yet (legacy row before AdminSeeder): treated as not suspended
        assertTrue(Visibility.collectionListed(CollectionStatus.PUBLISHED, OK, false, null));
    }

    @Test
    void aModuleIsVisibleIffItHasAPubliclyReadablePage() {
        var track = new com.codemastery.content.Track();
        track.setStatus(CollectionStatus.PUBLISHED);
        var module = new com.codemastery.content.Section();
        module.setTrack(track);
        assertFalse(Visibility.moduleVisible(module), "no pages");
        var draft = new com.codemastery.content.Lesson();
        draft.setSection(module);
        draft.setStatus(PageStatus.DRAFT);
        module.getLessons().add(draft);
        assertFalse(Visibility.moduleVisible(module), "only a draft page");
        var live = new com.codemastery.content.Lesson();
        live.setSection(module);
        live.setStatus(PageStatus.PUBLISHED);
        module.getLessons().add(live);
        assertTrue(Visibility.moduleVisible(module));
        track.setModerationStatus(ModerationStatus.HIDDEN);
        assertFalse(Visibility.moduleVisible(module), "the collection is hidden");
        track.setModerationStatus(ModerationStatus.OK);
        track.setStatus(CollectionStatus.UNLISTED);
        assertTrue(Visibility.moduleVisible(module), "unlisted collections are readable by link");
        track.setStatus(CollectionStatus.DRAFT);
        assertFalse(Visibility.moduleVisible(module));
    }

    @Test
    void aCollectionNeedsAtLeastOnePublishedPageToBePubliclyReadableOrListed() {
        var track = new com.codemastery.content.Track();
        track.setStatus(CollectionStatus.PUBLISHED);
        var module = new com.codemastery.content.Section();
        module.setTrack(track);
        track.getSections().add(module);
        assertFalse(Visibility.hasPublishedPage(track));
        assertFalse(Visibility.collectionReadable(track), "published but empty");
        assertFalse(Visibility.collectionListed(track));
        assertTrue(Visibility.listedByStatus(track), "the status part alone says yes: callers must add the page check");

        var page = new com.codemastery.content.Lesson();
        page.setSection(module);
        page.setStatus(PageStatus.DRAFT);
        module.getLessons().add(page);
        assertFalse(Visibility.collectionReadable(track), "only a draft page");

        page.setStatus(PageStatus.PUBLISHED);
        assertTrue(Visibility.collectionReadable(track));
        assertTrue(Visibility.collectionListed(track));
        track.setStatus(CollectionStatus.UNLISTED);
        assertTrue(Visibility.collectionReadable(track));
        assertFalse(Visibility.collectionListed(track), "unlisted is never listed");
        page.setStatus(PageStatus.DRAFT);
        assertFalse(Visibility.collectionReadable(track), "unlisted but empty");
    }
}
