# Step 14c – Public Page Viewer: Implementation Report (correction round 3)

**Date:** 2026-11-18 · **Authorized scope:** Step 14c, plan rev. 2 + rev. 3 clarifications (C1 public image URLs, C2 fixed-value validation), including the approval note on canonicalized own-origin paths.
**Baseline:** the approved 14b source (`Curio-main-final.zip`). **Stopped after 14c:** nothing from 14d or later was started.

## Correction round 3 (A → B → A reused an earlier visit's confirmation)
Only `src/hooks/useConfirmedPublicData.ts` changed, plus new tests. `PageView.tsx` is unchanged from round 2. Diff: `correction-round-3.diff`.

**Issue (confirmed):** `settledVisit` stored the URL-derived `visitKey`. In the sequence A settles → B (request still pending) → back to A, it still held "A", so the third visit was treated as confirmed before its own request settled.

**Fix:**
- Every visit gets a unique generation number, which increments whenever `visitKey` changes. A → B → A is therefore three distinct visits (1, 2, 3).
- The effect captures its visit's generation, and settling records that number. The outline counts as confirmed only when `settledVisit === current generation`.
- Unchanged: the per-effect `cancelled` flag, `cancelRefetch: true`, the handling of a request already running before the visit, and the 14b path (`revalidateOnVisit` off).

**Regression tests (4 new; all earlier round-1/round-2 tests unchanged and passing):**
| Test | Level | On round-2 code |
|---|---|---|
| A settles → B (pending) → A: hidden until the **third** visit's own request settles; B's late response doesn't confirm it; then the latest A response is shown | hook | **fail** |
| Same in `PageView` with real React Query and held requests: loading while pending, a MutationObserver sees no `<h1>` rendered from an older visit, B's late response is ignored, and the third visit's response (without "Tram 28") decides the outline | `PageView` | **fail** |
| An **older A request** (visit 1, still pending) completing during visit 3 can't confirm it | hook | passes (guard: that request's `cancelled` flag was already set) |
| A → B → A with every earlier request already settled → still a fresh confirmation | hook | passes (guard) |

Evidence: `regression-tests-round3-OLD-CODE-output.txt`. The round-2 hook was swapped in temporarily, then the fixed file was restored and checked byte-identical.

**Gate (this round):** 1019 tests pass; tsc exit 0; ESLint 0 problems on the 16 files; build exit 0 with the same single chunk-size warning; browser acceptance 76/76 on a fresh database. `act()` warnings are unchanged (6, all from pre-14c test files).

## Correction round 2 (millisecond-based outline confirmation)
Only `useConfirmedPublicData`'s `revalidateOnVisit` path changed, plus one option passed from `PageView`. Full diff of this round: `correction-round-2.diff`.

### The issue
Round 1 confirmed the outline with `dataUpdatedAt >= visit start`. That has two problems:
- **Equal timestamps:** cached data stamped in the same millisecond the visit began counted as confirmed.
- **Joined requests:** `refetch({ cancelRefetch: false })` could join a request started for an earlier visit, so a response requested before the visit could confirm it.

### The fix: visit-scoped confirmation, no timestamp comparison
- **Own request per visit.** Each visit starts its own request with `refetch({ cancelRefetch: true })`, which supersedes any request still running from an earlier visit. React Query then discards the superseded response.
- **Per-visit settlement.** The effect for each visit has a `cancelled` flag, set when the visit ends or the component unmounts. Only the current visit's request, once it settles, marks that visit confirmed (`settledVisit === visitKey`).
- **Nothing before that.** Nothing is returned until then, whatever the cache holds and whatever its `dataUpdatedAt`. Afterwards, data is returned while the query isn't in error: a retry after a failure shows the retried data, and a later failed refetch hides it.
- **Request already running when the visit began (React Query limitation).** React Query only honors `cancelRefetch` when the query already has data; with no data it always joins the running request. `PageView` therefore passes `isFetchingInCache`, which reads the query's real fetch state from the cache during the render that starts the visit, before this visit's own mount fetch can begin. If a request was already running and can't be superseded, the hook waits for it, then sends the visit's own request, and only that one confirms. Example: the collection page's request is still pending when the reader clicks "Start reading".
- **Unchanged:** with `revalidateOnVisit` off, the 14b expression is untouched. `CollectionView` doesn't use the option, and its 16 tests pass with the file byte-identical to 14b. Global React Query settings are unchanged.
- **Network cost:** when the outline is already cached and its mount refetch is in flight, the visit's own request supersedes it, so that first page visit can send 2 outline requests. With no cached outline, it's still exactly 1 (the existing test asserting this passes unchanged).

### Regression tests (10 new; 9 fail on the round-1 code)
| Test | Level | On round-1 code |
|---|---|---|
| Cached `dataUpdatedAt` exactly equals the visit start (`Date.now` frozen) → hidden until the visit's own request settles | hook + `PageView` | **fail** |
| Previous visit's outline request still in flight when the URL changes → new visit sends its own (`cancelRefetch: true`); the old request completing afterwards confirms nothing | hook + `PageView` (real React Query, held requests) | **fail** |
| Old request completes **after** the newer visit is confirmed → the old outline doesn't come back (MutationObserver), cache holds the new outline; going back to the old URL is a new visit | hook + `PageView` | **fail** |
| Only the current visit's request confirms; a failed one shows nothing until a successful retry | hook | **fail** (round 1 used timestamps, so the semantics differ) |
| A request already running before the visit, with no cached data → awaited, then the visit's own request; only that one shows the outline | hook + `PageView` | **fail** |
| Unmount ends the visit: a late response updates nothing | hook | passes (guard) |

Evidence: `regression-tests-round2-OLD-CODE-output.txt`. The round-1 `PageView.tsx` and hook were swapped in temporarily, then the fixed files were restored and checked byte-identical.

**Changes to earlier 14c tests (all in `useConfirmedPublicData.test.tsx`; no assertion was weakened):**
- One assertion changed from `cancelRefetch: false` to `cancelRefetch: true`. This is the requested behavior change.
- "Cached data that isn't being fetched is not confirmed" now uses a request the test settles by hand, and additionally asserts that a newer timestamp alone doesn't confirm.
- Two tests' `refetch` stubs now return a pending promise instead of resolving at once. Only calls and the error case are asserted there, and the change removes two `act()` warnings.

All `PageView` tests from earlier rounds are unchanged. The suite's remaining 6 `act()` warnings come from pre-14c test files.

## Correction round 1 (review of the first 14c delivery)
Only the two issues from the review were changed. Full diff of this round: `correction-round.diff`.

### Issue 1: the collection outline is now revalidated on every page visit
- **Cause (confirmed):** the outline query's key (`["public","collection",user,slug]`) is the same for every page in a collection. React Query kept the observer and didn't refetch, `isFetching` stayed false, and the 14b rule (`… || !isFetching`) treated the old outline as confirmed.
- **Fix:** `useConfirmedPublicData` takes an opt-in `{ revalidateOnVisit: true }`, and only `PageView`'s outline uses it.
  - When the visit key changes (and on mount), it calls `refetch({ cancelRefetch: false })`. That joins a fetch already in flight, so the first visit still sends one request.
  - Only data fetched since the visit began counts as confirmed (`dataUpdatedAt >= visit start`). "Not being revalidated" is no longer enough for this query.
  - While the request is pending, the view shows the loading state. If it fails, the error state is shown and the old outline never is.
- **Unchanged:** `CollectionView` doesn't pass the option, so its 14b expression is unchanged and its 16 tests still pass with the file byte-identical. Global React Query settings are unchanged.

### Issue 2: noindex follows the last confirmed page
- **Before:** `useNoIndex(ready?.page.collection.unlisted === true)` sent `false` whenever `ready` was null: during navigation, or while only the outline was failing.
- **Now:** the value is kept in component state and updated with React's "adjust state during render" pattern:
  - set or cleared when a page is **confirmed**;
  - cleared on a **definitive 404** (page or outline);
  - otherwise kept as it was.
- So it stays on during unlisted → unlisted navigation and while the outline returns a 5xx. It still never comes from unconfirmed cached data (a fresh visit starts with no tag). The reference-counted `useNoIndex` hook is unchanged.

### New regression tests (all pass; the 6 bug-specific ones fail on the first delivery's code)
| Test | On the old code |
|---|---|
| Page unpublished between two visits in the same collection, outline response **held**: loading while pending, old outline not rendered; after the new outline arrives, a MutationObserver confirms the unpublished page's link never appeared; Previous skips it | **fails** |
| Same with an immediate response | **fails** |
| Outline fails (503) on the next visit → error state, never the old outline | **fails** |
| First visit sends exactly one outline request | passes (guard) |
| Unlisted → unlisted with the next page and the outline **held**: a MutationObserver on `<head>` records **zero removals** of the managed tag | **fails** |
| Page confirmed unlisted + outline 503 → error state, noindex kept | **fails** |
| Unlisted page, then the outline fails on the next visit → tag never removed | **fails** |
| Unlisted → 404 by navigation → tag removed | passes (guard) |
| Cached unlisted page never confirmed in this visit (both queries fail) → no tag | passes (guard) |
| Hook unit tests: refetch on mount and visit change with `cancelRefetch: false`; not-fetching cached data not confirmed; errors; no refetch without the option | – |

Evidence of the old code failing: `regression-tests-OLD-CODE-output.txt`. The first delivery's `PageView.tsx` and hook were temporarily swapped in, the new tests run, and the fixed files restored and verified byte-identical.

**Browser (new section 5 of `t14c.mjs`):**
- **Fix 1:** a page is unpublished through the API, then the reader navigates client-side within the collection. The outline is re-requested, a MutationObserver sees the unpublished page linked in no view after the old one, and Previous skips it.
- **Fix 2:** unlisted → unlisted with the next page response delayed 1.5 s. The tag is present while pending and a `<head>` MutationObserver saw 0 removals. The confirmed-unlisted + outline-503 case (injected) keeps the tag, and unlisted → 404 removes it.

**Also in this round (test hygiene only):** two earlier 14c `PageView` tests waited with a bare `setTimeout`, which produced React `act()` warnings. Those waits are now wrapped in `act`; no assertion changed. The suite's remaining 6 `act()` warnings come from pre-14c test files.

**Unchanged in this round:** `publicBlocks.ts`, `BlockRenderer`, `PublicBlocks`, `PageNav`, `CollectionOutline`, `CollectionView`, `Placeholders`, `AppRoutes.test`. Also no backend, migration, config, `.gitignore` or 14d work.

## 0. Results at a glance
| Gate | Result | Raw output |
|---|---|---|
| Unit/component tests (`vitest run`) | **46 files, 1019 tests, all pass** (baseline: 40 files, 822 tests; first 14c delivery: 992; round 1: 1005; round 2: 1015) | `vitest-output.txt` |
| Type-check (`tsc --noEmit`, app + node configs) | exit 0 | `tsc-output.txt` |
| ESLint (all 16 changed/new files) | exit 0, no warnings | `eslint-output.txt` |
| Production build (`vite build`) | exit 0; **1 warning**: the same >500 kB chunk-size warning 14b already had (no new warning) | `build-output.txt` |
| Browser acceptance (H2 + Vite + Chrome) | **76/76 checks pass** (67 earlier + 9 for the round-1 fixes), rerun after round 3 on a freshly seeded in-memory database. The round-2 timing races are deterministic only with held requests, so they are covered by the integration tests. | `browser-acceptance-output.txt`, `screenshots/`, `scripts/` |

The 16 existing `CollectionView` tests pass **with the test file byte-identical to 14b**. `BlockRenderer.test.tsx` and `src/lib/blocks.ts` (`normalizeBlocks`) are also byte-identical.

## 1. Changed files
**New (source):**
| File | Lines | Purpose |
|---|---|---|
| `src/lib/publicBlocks.ts` | 168 | `isPublicImageUrl`, `publicImageSrc`, `ownOrigins`, `sanitizePublicBlocks`, `sanitizeLegacy`: the public-only validation layer |
| `src/hooks/useConfirmedPublicData.ts` | 66 | The 14b stale-cache rule, moved out of `CollectionView` unchanged, plus the opt-in, visit-scoped `revalidateOnVisit` (correction rounds 1–3) |
| `src/components/public/PublicBlocks.tsx` | 43 | Validation → `BlockRenderer mode="public"`, with a per-block error boundary; neutral message when nothing is renderable |
| `src/components/public/PageNav.tsx` | 40 | Previous/Next in published reading order |
| `src/pages/public/PageView.tsx` | 131 | The page viewer: both queries coordinated, breadcrumbs, sidebar, Contents drawer, states, title, noindex |

**New (tests):** `src/lib/publicBlocks.test.ts` (87 tests), `src/components/editor/BlockRenderer.public.test.tsx` (27), `src/pages/public/PageView.test.tsx` (46), `src/components/public/PublicBlocks.test.tsx` (12), `src/hooks/useConfirmedPublicData.test.tsx` (19), `src/components/public/PageNav.test.tsx` (5).

**Modified** (full unified diff in `modified-files.diff`):
| File | Change |
|---|---|
| `src/components/editor/BlockRenderer.tsx` (+29 −3) | Optional `mode?: "owner" \| "public"`, **default `"owner"`**. Only the image case differs in public mode (`PublicImage`). The owner path is untouched. |
| `src/pages/public/CollectionView.tsx` (+5 −11) | Uses `useConfirmedPublicData`. The rule is identical (same expressions, moved). |
| `src/pages/creator/Placeholders.tsx` (+3 −9) | `PublicPageViewPage` keeps its guard and renders `PageView`. |
| `src/AppRoutes.test.tsx` (+11 −2) | As planned: the page-route test now asserts the stubbed `PageView` receives the four params (it asserted the placeholder's `param-*` ids before). One test added for the lower-cased handle. Every 404 and shadowing test is unchanged. |
| `src/components/public/CollectionOutline.tsx` (+5 −3) | **Not in the plan's file list; see §5.1.** Optional `idPrefix` (default `"module"`, so the collection page's output is unchanged). |

**Acceptance artifacts:** `acceptance-14c/` (this report, the raw outputs, `scripts/seed14c.mjs`, `scripts/t14c.mjs`, 12 screenshots, `modified-files.diff` vs 14b, `correction-round.diff`, `correction-round-2.diff`, `correction-round-3.diff`, and the old-code test outputs for rounds 1–3).

## 2. Rev. 3 requirements: how each one is met
### C1. Public image URLs
- **Allow-list, one predicate:** `isPublicImageUrl()` is used by both `sanitizePublicBlocks()` and `BlockRenderer`'s public image path (`publicImageSrc()`), so the two checks can't drift. It lives in the public module, and `urlRules.ts` is unchanged.
  - **Relative URL:** accepted only if it matches `^/api/public/media/[A-Za-z0-9_-]+(/thumb)?$` exactly (backend ids are UUIDs).
  - **Absolute URL:** must pass `isSafeUrl`. On a foreign origin it's allowed. On **this app's origins** (`window.location.origin` and the origin of `VITE_API_URL`, compared after URL parsing, so case and the default `:443` port are normalized) it must be the same exact public-media path.
  - **Raw path comparison (approval note):** the path is compared on the **raw text after the host, before any URL normalization**. `%61pi/media/…`, `foo/../api/media/…`, `api%2Fmedia/…`, query strings and any other spelling therefore never match, and are rejected.
- **No `OwnerImage` in public mode:** an assetId-only block, or assetId with an owner URL, renders nothing.
- **API-base prefixing is kept** (via the existing `publicMediaSrc`).
- **Tests:** owner URLs (relative, own-origin absolute, the three encoded/normalized variants from the approval, case variants, dot-segments, `//host`, backslash) are rejected by the validator and not rendered by `BlockRenderer`. `fetchOwnerMedia` is a spy and is never called in public mode. A control test proves the spy works: owner mode does call it. No `fetch` to `/api/media/*`, and no `img[src*="/api/media/"]` in the DOM. A valid public media URL renders (with and without the API base), and a valid external image renders.
- **Browser proof:** the test intercepts the real public page response and **injects** 6 owner-media / assetId-only image blocks. None renders, and the whole session makes **zero requests to `/api/media/*`**, while the valid uploaded image beside them loads. The same zero-request check passes for the anonymous, valid-token, expired-token, mobile and stale sessions.

### C2. Fixed-value fields
| Field | Implemented | Tests |
|---|---|---|
| Heading `level` | only the numbers `2` or `3`; anything else (`1`, `4`, `"3"`, `2.5`, `NaN`, null, missing…) → `2`; invalid `text` → block dropped | unit, plus browser (injected `level: 9` → `<h2>`) |
| Callout `variant` | only `info`/`tip`/`warning`; anything else (`"danger"`, `"INFO"`, `"__proto__"`, …) → `info` | unit, plus browser (injected `"danger"` → info style) |
| Table | `isWellFormedTable` (unchanged helper) | unit |
| Image `width`/`height` | used only when **both** are positive finite numbers; otherwise both are omitted and the image still renders | unit, renderer, browser (640×400 attributes) |

Every other field the renderer reads is type-checked as specified in rev. 2 (required wrong type → block dropped; optional missing → documented default). Only known fields are copied into fresh objects: the input is never mutated, and extra fields never reach the renderer.

## 3. Rev. 2 requirements (unchanged), verified
- **Coordinated queries:** the view renders only when both page and outline are confirmed. Either 404 → `NotAvailable`. Any other error → `ErrorState`, whose retry refetches the failed queries. Loading or revalidating → loading state. Unit-tested in every combination; the browser test covers draft, draft-collection, deleted-collection and mistyped cases.
- **Stale cache:** both queries go through `useConfirmedPublicData`, keyed on all four params. Covered:
  - Unit: unpublished, deleted, unavailable while pending, a stale outline while the page is confirmed, successful revalidation, 5xx, and switching pages **within the same collection** and across collections.
  - Browser: a MutationObserver saw **no** stale content or title when going Back to an unpublished page.
- **Title from confirmed data only:** `AlgoQuest` / `<page> · AlgoQuest` / `Not available · AlgoQuest`.
- **noindex:** follows the last confirmed page (see the correction round). All six cases are unit-tested (including another consumer keeping the tag after unmount), plus the new transition cases; the browser covers unlisted, unlisted→unlisted (with no removal during the transition), leaving, unlisted→published, outline 503 and unlisted→404.
- **Sidebar and drawer use the same outline:** asserted in unit and browser tests. The drawer closes on navigation.
- **Error boundary:** a secondary fallback only. If every block throws, the neutral message is shown.
- **Scroll/focus:** not implemented (14d), as decided.

## 4. Out-of-scope confirmation
A full recursive diff against the 14b baseline (excluding `node_modules`, `dist`, `backend/target`, `*.tsbuildinfo`) shows **only the 16 `src/` files listed in §1** plus the new `acceptance-14c/` folder.
- **No changes** to the backend, migrations, stored block schemas, `shared/`, configuration (`package.json`, `vite`, `tsconfig`, `eslint`, `tailwind`), `.gitignore`, the editor, `TopicPage`, `normalizeBlocks`, `api.ts`, `AuthContext`, the hooks other than the new one, or the types.
- **No 14d+ work:** no share button, scroll-to-top, focus management, or adapter move.
- **Runtime-only files:** the browser runs uploaded test PNGs to the dev server's local media store (`backend/data/media/`). That folder is runtime data, and like the approved ZIP, the 14c ZIP excludes it.

## 5. Decisions and findings worth your review
1. **`CollectionOutline` `idPrefix` (small addition outside the plan's file list).** The page shows the outline twice (sidebar and drawer). Both copies rendered `id="module-<slug>"`, which produced **duplicate ids and ambiguous `aria-labelledby`** while the drawer is open. A new unit test caught it. The fix is an optional prop that defaults to the old value, so `CollectionView`'s output and its tests are unchanged. If you prefer, I can revert it and accept the duplicate ids until 14d.
2. **Image dimensions need both values.** A width without a height (or the reverse) can't reserve space correctly, so both must be valid or neither is used.
3. **Public renderer tests are in a new file** (`BlockRenderer.public.test.tsx`) rather than appended to `BlockRenderer.test.tsx`. They need to mock the owner-media module, and keeping them separate leaves the existing file byte-identical.
4. **Pre-existing backend behavior, not changed (outside scope):** `MediaUrlResolver.resolveBlocks` writes the public `url` at the position of `assetId` in the block. If a stored block has `assetId` **before** a `url: ""` key, the later key overwrites it, and the public API returns `url: ""` (with width/height).
   - The editor always sends `url` first (`withImageAsset` keeps the key's position), and Postgres `jsonb` also orders `url` first, so normal content is unaffected. I found it only because my first seed script used the opposite key order.
   - With 14c, such a block is dropped safely: nothing is rendered or requested.
   - Recommend a one-line backend fix (skip/remove `url` when `assetId` is present) in a later step.
5. **One empty legacy page.** The seeded `kubernetes/welcome/course-intro` page has every legacy field empty, so it correctly shows "No content is available to display." (checked in the browser). The legacy-rendering check uses `docker/images/images`, which has content.

## 6. Browser acceptance details
**Environment:** backend `mvn spring-boot:run -Dspring-boot.run.profiles=h2` (:8081, in-memory, fresh), Vite (:8080), Chrome via `playwright-core@1.48.2`. Content was created through the creator API by `scripts/seed14c.mjs`:
- Scenario A (technical): rich text with bold, italic, a link and a list; code; SVG; a table with header and caption; sandboxed HTML.
- Scenario B (travel): two uploaded images, a YouTube video, info/tip/warning callouts.
- Two modules with a draft page; unlisted, draft and deleted collections; a stale-cache target.

**Sessions:** anonymous desktop (1280), mobile (360 × 780), a valid token, and an **expired token** (correctly signed with the dev secret, `exp` in the past).

**Allowed noise, by exact value only:**
- 404s for the deliberately unavailable URLs, and 401 `/api/auth/me` for the expired token.
- The injected 503 for the secret-recipe outline (fix 2 check) and its browser console line.
- The existing `NotFound` page's own `console.error` for the deliberately visited 3-segment URL.

Nothing else is ignored. The external YouTube load is not asserted (network-dependent).

**Screenshots:**
- `01` travel page, desktop
- `02` technical page
- `03` table + HTML
- `04` legacy page
- `05` unlisted page
- `06` not available
- `07` mobile table
- `08` mobile page
- `09` mobile drawer
- `10` stale → not available
- `11` outline after revalidation (unpublished page gone)
- `12` unlisted page + outline 503 (error state, noindex kept)

**Re-running:** start both servers, run `node scripts/seed14c.mjs` once, then run `node scripts/t14c.mjs <screenshot dir>` (needs `playwright-core` and Chrome). The stale-cache check unpublishes a page, so each run needs a freshly seeded database.
