# Step 15b — Public Creator Profile: Implementation Report

**Date:** 2026-11-23
**Authorization:** "15b authorized". 15b only, under plan `Curio-step15-plan.md` rev. 2.1 (`30298ee8…04e4`): §3.2, §3.3, §4, §5 (frontend) and §11.
**Baseline:** the accepted `Curio-main-step15a.zip` (`41d71c82…deea`). For the old-code run, the 10 changed source files were extracted from that ZIP (hashes in `baseline-source.sha256`) and `CreatorProfile.tsx` was removed.

**Not done:**
- no backend change and no migration;
- no settings page, `/settings/profile` or Navbar item (those are 15c);
- no browser acceptance, `contract15` or axe (those are 15d).

## 1. What was built
| File | Change |
|---|---|
| `src/pages/public/CreatorProfile.tsx` (new) | The `/@username` page. Details below. |
| `src/pages/public/routes.tsx` | `PublicCreatorProfilePage` adapter (same `parseHandle` guard as the viewers), moved from `Placeholders.tsx` |
| `src/AppRoutes.tsx` | `/:handle` → `PublicCreatorProfilePage` |
| `src/pages/creator/Placeholders.tsx` | Step 15 profile placeholder removed, along with its now-unused imports. The settings placeholder stays for 15c. |
| `src/lib/types.ts` | `PublicCreator`, mirrored from `PublicCreatorDto` (no email, id or visibility) |
| `src/lib/paths.ts` | `apiPaths.publicCollections` gains `creator`; new `apiPaths.publicCreator` |
| `src/hooks/useContent.ts` | `usePublicCreator`; `usePublicCreatorCollections`, an infinite query with `size=50` and next page = `page + 1 < totalPages`. A 4xx is not retried (the existing rule). |
| `src/components/public/CollectionCard.tsx` | Creator line is now a link to `/@username`. Details below. |
| `src/pages/public/CollectionView.tsx` | The byline links to `/@username` |
| `src/components/public/ShareButton.tsx` | `what: "profile"`: `aria-label` "Share this profile" and fallback label "Link to this profile" |
| `src/components/public/NotAvailable.tsx` | `what: "profile"` → "This profile isn't available" (same neutral text otherwise) |

**`CreatorProfile.tsx` details:**
- **Header:**
  - banner and avatar as `<img>` with `referrerPolicy="no-referrer"`, https only, never CSS `url()`;
  - name (`displayName || username`) as the focusable `<h1>`;
  - `@username`, bio, "Joined Month YYYY";
  - social links as **text labels** with `target="_blank" rel="noopener noreferrer nofollow"`;
  - a Share button.
- **Title:** `<name> (@username) · AlgoQuest`, or `Not available · AlgoQuest`.
- **404:** the neutral `NotAvailable` screen, and **no collections request** (the collections query is only enabled once the profile is confirmed).
- **Collections:**
  - grouped by category, in order of first appearance, with "Other" last;
  - "No published collections yet" when empty;
  - an error on the first page keeps the header and offers Try again.
- **Same patterns as the other public views:** `useConfirmedPublicData`, so cached data is shown only once confirmed during this visit, and `usePublicArrival`, for arrival focus and scroll restore.
- **Load more (§3.3):**
  - shown while `page + 1 < totalPages`, with "Showing N of M";
  - merged and de-duplicated by `username/slug`;
  - groups recomputed after each page;
  - a next-page error shows an alert, "Couldn't load more collections", with Retry, and everything already loaded stays;
  - focus stays on the button, or moves to the first new card when the button disappears;
  - while loading, the button uses `aria-disabled` rather than `disabled`, so it keeps focus.
- **The consistency limit is documented in the code:** offset paging is not a snapshot.

**`CollectionCard.tsx` details:**
- The creator line is now a **separate link** to `/@username`, using `paths.creatorProfile(username)`; the visible text is still `displayName || username`.
- It sits **after** the card's collection link, inside a wrapper, and is never nested in it.
- The card link keeps `data-testid="collection-card"` and its `href`, which the existing browser scripts rely on.
- `showCreator={false}` on the creator's own profile.

**Plan wording note:** the plan calls the path helper `paths.creator`; the existing helper is `paths.creatorProfile`, which is what's used.

**Visible change on cards:** the "By …" line moved below the module and page counts, outside the card link. The card border and hover now sit on the wrapper.

## 2. Tests
**New:**
- `CreatorProfile.test.tsx`: 14 tests covering:
  - the header;
  - social links rendered safely;
  - missing fields and a non-https avatar not rendered;
  - the username fallback;
  - the title;
  - grouping;
  - the empty state;
  - PRIVATE, unknown and suspended → not-available with no collections request;
  - a profile error with retry;
  - a first-page error with retry;
  - Share;
  - opening a card.
- `CreatorProfile.pagination.test.tsx`: 8 tests covering:
  - Load more visibility and "Showing N of M", with the exact requests;
  - a single page shows no Load more;
  - **a next-page error keeps the loaded collections and offers Retry**;
  - **a duplicate across pages renders once**;
  - **a group grows and a new group appears**;
  - **focus stays on Load more**;
  - **focus moves to the first new card**;
  - no collections request after a 404.
- `src/test/creatorProfileFixtures.ts`: shared data only, as a `.ts` file. Each test file has its own mount, because a `.tsx` helper exporting both data and components triggered `react-refresh` lint warnings.
- `ShareButton.test.tsx`: +1 test, "Share this profile".
- `routes.test.tsx`: +6 tests for the `PublicCreatorProfilePage` adapter (lower-cased username; 5 non-handles → NotFound).

**Existing assertions changed (disclosed):**
| File | Before | After | Why |
|---|---|---|---|
| `Discover.test.tsx` | `first.getByText("Alice")` inside the card | the link named "Alice" has `href="/@alice"` **and is not inside** `[data-testid=collection-card]` | the creator moved out of the card link (Q15-5) |
| `Discover.test.tsx` | `within(cards[1]).getByText("bob")` | the link "bob" has `href="/@bob"` | same |
| `Discover.test.tsx` l. 68 | comment "the creator is plain text…" | comment updated. **The assertion itself (`cards[0]` contains 0 `<a>`) is unchanged** and still passes. | the plan named this line; the guarantee still holds |
| `CollectionView.test.tsx` | `getByText("Alice").closest("a")` is null (plain-text byline) | the link "Alice" has `href="/@alice"`; the test is renamed "…byline link…" | the byline is now a link |
| `AppRoutes.test.tsx` | `/@Alice` renders the placeholder heading "@alice" plus `param("username")` | a stub of `CreatorProfile` (as the other viewers are stubbed) shows "creator-profile alice" | the placeholder was replaced. The now-unused `param` helper was removed. |
| `routes.test.tsx` "the move" | `Placeholders` **contains** `CreatorProfilePage` | it contains neither `CreatorProfilePage` nor `PublicCreatorProfilePage` | the adapter moved, as 14d did for the viewers |

**Old code** (`new-and-changed-tests-on-OLD-code.txt`, the 15a sources plus the final test files):
- `CreatorProfile.test.tsx` and `CreatorProfile.pagination.test.tsx` **can't load** because the module doesn't exist.
- **11 tests fail:** Discover ×1, CollectionView ×1, ShareButton ×1, AppRoutes ×1, routes ×7 (6 new adapter tests plus the changed "move" test).
- The other 92 pass.

**New code** (`new-and-changed-tests-on-NEW-code.txt`): the same 7 files, **125/125**.

## 3. Gates
| Gate | Result |
|---|---|
| vitest, full suite (`vitest-output.txt`) | **64 files / 1226 tests passed**. The 15a baseline was 62 / 1197; the difference is +2 files and +29 tests. |
| tsc app / node | clean / clean |
| ESLint on all 19 changed or new files (`eslint-changed.txt`) | **0 errors, 0 warnings** |
| vite build | OK; 3 warnings, all on the baseline list: Browserslist, CSS `@import` order, chunks over 500 kB |
| Backend | unchanged; not re-run (no backend file touched) |

## 4. Changed files (`source.diff`, compared with the 15a ZIP)
**Modified (15):**
- `AppRoutes.tsx` and `AppRoutes.test.tsx`
- `components/public/CollectionCard.tsx`, `NotAvailable.tsx`, `ShareButton.tsx` and `ShareButton.test.tsx`
- `hooks/useContent.ts`
- `lib/paths.ts` and `lib/types.ts`
- `pages/creator/Placeholders.tsx`
- `pages/public/CollectionView.tsx` and `CollectionView.test.tsx`
- `pages/public/Discover.test.tsx`
- `pages/public/routes.tsx` and `routes.test.tsx`

**New (4):** `pages/public/CreatorProfile.tsx`, `CreatorProfile.test.tsx`, `CreatorProfile.pagination.test.tsx`, `test/creatorProfileFixtures.ts`.

**Plus** `acceptance-15b/`. No backend, migration, configuration or `package.json` change.

## 5. Risks handed to 15d
- **Browser regressions not run in 15b**, as planned; they belong to 15d. Before 15b, the browser scripts used the card link as the whole card. They select `a[data-testid="collection-card"]`, which is kept, and t14a reads `[data-testid=collection-card] h2`, which is unchanged. But the card's DOM changed: there is a wrapper now, and the byline is outside the link. t14a, t14b, t14d3 and t14e, axe14e, and the A11Y baseline comparison must confirm this in 15d.
- **Arrival and scroll restoration** with Load more: after Back, React Query restores the loaded pages from cache, and the restore uses the existing `usePublicArrival`. It is only unit-tested indirectly; 15d should check it in the browser.
- **Consistency limit (plan §3.3):** offset paging; documented, not addressed.
