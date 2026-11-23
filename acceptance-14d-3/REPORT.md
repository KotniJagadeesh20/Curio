# Step 14d-3 – Arrival, Scroll and Focus: Implementation Report

> **Superseded in part (2026-11-19 correction round):** see `correction/REPORT.md`. Sensitivity #9 is now guarded by `ContentsDrawer.focus.test.tsx` (fails 10/10 under the mutation). B6 verifies `pointerdown` sampling only; the unmount flush is verified by unit tests. The readiness condition and the `overflow-anchor` exit paths are now documented and tested.

**Date:** 2026-11-18 · **Authorized scope:** 14d-3 only, per approved plan rev. 4.3 and implementation brief rev. 2 (O1–O8 accepted; C1–C4).
**Baseline:** the approved 14d-2 ZIP (the working copy was verified identical before starting). The 14d-1 and 14d-2 code is unchanged.
**Stopped after 14d-3.** No 14e work.

## 0. Results at a glance
| Gate | Result | Raw output |
|---|---|---|
| Tests (`vitest run`) | **58 files, 1145 tests, all pass** (14d-2: 51 files, 1066; +79 new) | `vitest-output.txt` |
| Type-check (app + node) | exit 0 | `tsc-output.txt` |
| ESLint (16 changed/new files) | exit 0, no warnings | `eslint-output.txt` |
| Build | exit 0, with **3 warnings, all pre-existing baseline (none new):** (1) Browserslist/caniuse-lite data is 17 months old; (2) `[vite:css] @import must precede all other statements` (the Google Fonts `@import`); (3) `(!) Some chunks are larger than 500 kB after minification` | `build-output.txt` |
| Targeted browser checks `t14d3.mjs` (B1–B17) | **28/28 pass**, on 3 consecutive clean runs after the B8 fix (§5.3) | `browser-14d3-output.txt`, `screenshots/` |
| Regressions (scripts byte-identical to the approved copies) | 14c **76/76**, 14d-1 **14/14**, 14d-2 **27/27** | `regression-*-output.txt` |
| Sensitivity runs (§4) | 10 mutations; every file restored and verified byte-identical | `sensitivity/sensitivity-1…10.txt` |

`act()` warnings: 6, the same pre-14c ones. No jsdom "Not implemented" noise.

## 1. Changed files (vs the approved 14d-2 ZIP: exactly these 16)
| | File | Change |
|---|---|---|
| A | `src/lib/scrollStore.ts` (118) | The position store. Entries `{ y, anchor, seq }`; a lower `seq` is ignored. **C1:** `nextSeq()` lazily starts above `max(persisted counter, highest persisted seq)`, and the counter is persisted with writes. **C4:** the newest 200 entries (by `seq`) are kept, in memory and storage; a rewrite refreshes an entry's age. **Storage fallback:** any storage failure turns persistence off for the rest of the page lifetime; memory keeps working with the same cap; nothing throws. |
| A | `src/lib/scrollAnchor.ts` (46) | `pickAnchor` (the first `[data-scroll-anchor]` whose bottom is below the viewport top), `findAnchor`, `residual`. **Scroll helper:** `setScrollY` uses `scrollingElement.scrollTo({ behavior: "instant" })`, because `index.css` sets `html { scroll-behavior: smooth }`, which would animate plain assignments. In jsdom it falls back to `scrollTop`. |
| A | `src/hooks/usePublicArrival.ts` (293) | The hook, as an engine object created once per mount. It contains: arrival detection (R1/C2, O2/O3); the S3 state machine (ARRIVING / ERROR / RECOVERING / DONE); sampling under the captured entry id (S1/T1); arming (T3, rev. 4.1 POP cases); two separate `ResizeObserver`s (T4); anchor restoration with residual correction and settling (S2/T2); and the `history.scrollRestoration` save and restore. |
| M | `src/pages/public/PageView.tsx` (+44 −13) | Arrival key `page:<user>/<collection>/<module>/<page>`. The state is derived from the existing values; a failed query that is being retried counts as `pending`. `contentRef` on the article; heading ref + `tabIndex=-1` (no programmatic ring, O5). Error-region wrapper ("Couldn't load this page"), whose Retry calls `arrival.retry()`. Anchors `title` and `page-nav`. Drawer: `onCloseAutoFocus` is prevented only when a link to **another** page closed it (O3). |
| M | `src/pages/public/CollectionView.tsx` (+23 −7) | Arrival key `collection:<user>/<slug>`; the same wiring; anchor `header`; the outline with `anchors`. |
| M | `src/pages/public/Discover.tsx` (+19 −6) | Arrival key `"discover"`; `contentRef` on the results region; anchors `card-<user>/<slug>` (on the existing `<li>`) and `pager`; error-region wrapper. |
| M | `src/components/public/NotAvailable.tsx` (+5 −3) | `forwardRef` to the `<h1>`, `tabIndex=-1`; wording unchanged. |
| M | `src/components/public/PublicBlocks.tsx` (+2 −1) | Each block wrapped in `<div data-scroll-anchor="block-<id>">`. |
| M | `src/components/public/CollectionOutline.tsx` (+4 −2) | An optional `anchors` prop (O8); default off. |
| A | 7 test files | `scrollStore.test.ts` (14), `scrollAnchor.test.ts` (7), `usePublicArrival.test.tsx` (41), `PageView.navigation.test.tsx` (8), `CollectionView.arrival.test.tsx` (4), `Discover.arrival.test.tsx` (3), `NotAvailable.focus.test.tsx` (2). |

Full diff of the modified files: `modified-files.diff`. **Byte-identical:** every existing test file, `ShareButton`, `share.ts`, `routes.tsx`, `useConfirmedPublicData.ts`, `ErrorState`, `BlockRenderer`, `PageNav`, `CollectionCard`, the router, the backend and configuration.

## 2. Implementation notes for review
1. **No `window.scrollTo`.** As described in §1: smooth scrolling in `index.css` → `scrollTo({ behavior: "instant" })`. jsdom has no `scrollingElement`, so it uses the `scrollTop` fallback, which is also why the existing tests stay free of "Not implemented" noise.
2. **Native scroll anchoring during settling.** While the restoration observer settles, the hook sets `overflow-anchor: none` on `<html>` and puts the previous value back when settling ends. Otherwise Chrome's native anchoring would move the page, our "scroll we didn't cause" detector would read that as user input, and settling would cancel. **This is an implementation detail not spelled out in the plan; flagged for your review.**
3. **Settling's "all loaded" condition** considers only images **before the anchor**, the only ones that can shift it. Lazy images further down never load and would otherwise always run to the 5 s cap. Iframes in our renderer reserve their height. **A narrowing of rev. 3 S2 ("every image and iframe in the view"); flagged.**
4. **Tracking observer's first notification.** A browser `ResizeObserver` reports once immediately on `observe()`. That isn't a layout change, so the tracking observer ignores its first callback.
5. **Retry and React Query.** After a failure, React Query keeps `isError` true while a retry is fetching. The views map "failed and fetching" to `pending`, so S3's RECOVERING → error/content transitions are observable. The rendered screens are unchanged.

## 3. Requirement coverage
Every row of brief rev. 1 §3 and rev. 2 C1–C4 is implemented with the named tests (test names in the files match the requirement wording).
- One test was **added beyond the brief** for sensitivity #5: "a superseded arrival's pending frame does nothing (generation guard)".
- **Drawer test strengthened:** "Contents" must never receive focus, not even briefly, after a drawer link to another page.

## 4. Sensitivity runs
Method: one mutation in the working file; run the 7 new test files (and, where listed, `t14d3.mjs`); save the output; restore; verify byte-identical. All 10 restored files were verified (`Restored … True` in each file).

| # | Mutation | Unit/integration failures | Browser failures (final script) | Caught by |
|---|---|---|---|---|
| 1 | Captured sample written under the **new** entry id (no `scrollY` read) | 3 | 4 (B2, B7 ×2, B14) | both |
| 2 | No anchor correction (restoration observer and load triggers no-ops) | 1 | 2 (B3, B8) | both |
| 3 | Root-only observation (`documentElement`) | 1 (observe targets) | 0 | unit only † |
| 4 | Tracking armed during POP restoration | 9 | 0 | unit only † |
| 5 | No per-arrival generation checks | 1 (generation guard) | 0 | unit only |
| 6 | Unmount cleanup doesn't flush | 3 | 0 | unit only ‡ |
| 7 | One shared `ResizeObserver` for both jobs | 7 | not run | unit |
| 8 | Retry success restarts the arrival | 2 | not run | unit |
| 9 | Drawer: no `onCloseAutoFocus` prevention | 0 | 0 in the final run (1 in the first run) | **not reliably detected** § |
| 10 | `seq` check removed | 2 | not run | unit |

† **Browser for #3/#4:** in the first sensitivity pass these also showed a B8 failure. That came from the old, timing-flaky B8 check (§5.3), not from a real detection, so it isn't claimed. With #3, the capture-phase `load` trigger still corrects in a real browser, so the browser outcome is genuinely the same.

‡ **#6:** in a real browser, the click's `pointerdown` intent sample is written before navigation, so B6 still passes. The unit tests, which navigate with no pointer event, catch it.

§ **#9 (drawer), honest result:** the final focus is identical with or without the prevention, because the arrival focuses the new heading after Radix returns focus to "Contents". The prevention only avoids a brief, announced stop on "Contents". jsdom doesn't reproduce Radix's close autofocus, so the unit test can't see it. The strengthened browser check B15 ("Contents never focused") caught it once and missed it once, which looks timing-dependent. **I recommend treating #9 as not reliably guarded by tests;** the behavior itself passes B15 on every clean run.

## 5. Browser checks (`t14d3.mjs`, 28 checks)
**Environment:** fresh H2 + Vite + Chrome. Content from `seed14c.mjs` + `seed14d3.mjs` ("Long read": page one with an uploaded hero image, page two with an external image without dimensions at `https://images.example.org/late.png` served by the test, page three plain). Native scroll anchoring is disabled by an injected `* { overflow-anchor: none }`, so restoration must come from the hook. Programmatic scrolls are logged by wrapping `Element.prototype.scrollTo`.

**Covered:**
- **B1** PUSH: card → collection, Start reading, Next, sidebar, Previous: top + heading focus.
- **B2** Back/Forward restore, focus not moved.
- **B3** Refresh.
- **B4** A → B → A history.
- **B5** Discover query changes: no scroll, no focus.
- **B6** `pointerdown` intent sampling before navigation (corrected wording: it does not verify the unmount flush; unit tests do).
- **B7** Delayed uploaded image + stored entry unchanged during settling.
- **B8** Delayed external image without dimensions.
- **B9** PUSH → 404 / 5xx.
- **B10** Retry success, and fail-then-success.
- **B11** Wheel and PageDown interruption.
- **B12** `scrollRestoration` → workspace.
- **B13** POP with no entry.
- **B14** Numeric-only restore with a missing anchor.
- **B15** Drawer hand-off and Escape.
- **B16** Mobile 360 px.
- **B17** Hygiene.

**Corrections to my own checks during this run** (none changed the implementation):
1. **B6:** "scroll and a synthetic `.click()` in one JS task" can't be sampled under the approved design. That combination fires no scroll event and no pointer event, and the design forbids reading `scrollY` during cleanup. **B6 now uses a real pointer click immediately after the scroll** (passes). **Open point for your decision:** programmatic navigation in the same task as a programmatic scroll isn't saved. No public UI path does that today. Allowing a `scrollY` read in the **unmount** cleanup (the old DOM is still attached there) would close it, but that changes an approved rule.
2. **B7:** the stored-entry check compared the wrong anchor. It now compares against the entry saved at departure: identical after settling.
3. **B8:** on return, Chrome's in-memory image cache served the external image instantly, so nothing shifted. The return visit now gets a fresh `?v=` URL. Then the "correction after the `load` event" criterion proved **timing-flaky** (layout can precede `load`). It's now "the image has height > 0 **and** at least one correction followed the numeric placement". The final runs log `[1458 numeric, 1058 anchor before the image, 1458 after the image grew by 402 px]`, stable 3/3.
4. **B7 note:** uploaded images reserve their size (14c `width`/`height`), so B7 verifies "no wrong position", not a correction.

Screenshots:
- `01-push-heading-focused.png`
- `02-refresh-restored.png`
- `03-delayed-image-restored.png`
- `04-error-region-focused.png`
- `05-mobile-drawer-focus.png`

## 6. Scope confirmation
- Only the 16 `src/` files in §1 changed, plus this `acceptance-14d-3/` folder. Recursive diff against the approved 14d-2 ZIP: 16 entries.
- No backend, migration, configuration, `.gitignore`, global React Query, editor, 14d-1/14d-2 or 14e change.
- Scroll handling exists only in the three public views; creator, admin and legacy screens are untouched (B12 verifies `scrollRestoration` is put back).

## 7. Re-running
1. Start both servers.
2. `node scripts/seed14c.mjs && node scripts/seed14d3.mjs`.
3. `node scripts/t14d3.mjs <dir>`.
4. Regressions: `t14d1.mjs`, `t14d2.mjs`, then `t14c.mjs` (which mutates data, so run it last).
5. Sensitivity: `python3 scripts/sensitivity.py <repo> <scripts dir> <out dir> [numbers]`. It needs a verified source copy (see the path in the script).
