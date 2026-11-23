# Step 14d-2 – Sharing: Implementation Report

**Date:** 2026-11-18 · **Authorized scope:** 14d-2 only (approved plan rev. 4.3: rev. 1 §4–§5.2, Q-d2, Q-d5, rev. 2 R6).
**Baseline:** the approved 14d-1 ZIP (`Curio-main-step14d-1.zip`); the working copy was verified identical to it before starting.
**Stopped after 14d-2.** No 14d-3 work: no arrival, scroll, focus, anchor or observer code.

## 0. Results at a glance
| Gate | Result | Raw output |
|---|---|---|
| Tests (`vitest run`) | **51 files, 1066 tests, all pass** (14d-1: 48 files, 1038; +28 new) | `vitest-output.txt` |
| Type-check (app + node) | exit 0 | `tsc-output.txt` |
| ESLint (7 changed/new files) | exit 0, no warnings | `eslint-output.txt` |
| Build | exit 0, with **3 warnings, all pre-existing baseline (none new):** (1) Browserslist/caniuse-lite data is 17 months old; (2) `[vite:css] @import must precede all other statements` (the Google Fonts `@import`); (3) `(!) Some chunks are larger than 500 kB after minification` | `build-output.txt` |
| Targeted 14d-2 browser checks | **27/27 pass** (fresh in-memory DB) | `browser-14d2-output.txt`, `screenshots/`, `scripts/t14d2.mjs` |
| 14c regression (`t14c.mjs`, byte-identical to the approved copy) | **76/76 pass** | `browser-14c-regression-output.txt`, `14c-regression-screenshots/` |

`act()` warnings: 6, the same pre-14c ones (none from the new tests).

## 1. Changed files (vs the approved 14d-1 ZIP)
| | File | Change |
|---|---|---|
| A | `src/lib/share.ts` (42 lines) | `canonicalUrl(path)` = page origin + a `paths.*` path. `copyToClipboard(url)` → true/false. `sharePublicLink({ title, url })` → `"shared" \| "copied" \| "cancelled" \| "unavailable"`: native sheet (unless `canShare` says no); `AbortError` → cancelled, with no fallback; any other failure → clipboard; no clipboard or refused → unavailable. Never throws. |
| A | `src/components/public/ShareButton.tsx` (82 lines) | An outline "Share" button (`aria-label` "Share this page"/"Share this collection"). See §2. |
| M | `src/pages/public/PageView.tsx` (+5 −1) | Share next to the `<h1>` in the confirmed reading view. Title `"<page> · <collection>"`; path `paths.page(username, collection.slug, module.slug, page.slug)` from the confirmed API data. |
| M | `src/pages/public/CollectionView.tsx` (+9 −5) | Share next to "Start reading" (also shown when the outline is empty). Title = collection title; path `paths.collection(username, c.slug)`. |
| A | `src/lib/share.test.ts` (9 tests) | Every outcome: native success, cancel, other error → clipboard, `canShare` false, no share API, clipboard refused, neither API, synchronous throws; `canonicalUrl`; `copyToClipboard`. |
| A | `src/components/public/ShareButton.test.tsx` (11 tests) | Labels, native, cancelled, clipboard + toast, popover (focused, fully selected, read-only, description), no clipboard, Copy retry success and failure, Escape + focus return + reset hint, double click → one share, click again after a copy. |
| A | `src/pages/public/PublicShare.test.tsx` (8 tests) | In the viewers: payload title and canonical URL; API slugs used, not the URL as typed (page and collection); unlisted; empty outline; **no Share while loading, on 404 or on an error** (both viewers). |

Full diff of the modified files: `modified-files.diff`. **Byte-identical:** every existing test file, including `PageView.test.tsx`, `CollectionView.test.tsx` (16), `AppRoutes.test.tsx` and the 14d-1 tests. No other source file changed.

## 2. Behavior
- **Order:** native share sheet → clipboard (toast "Link copied") → manual-copy popover (Q-d2).
- **Shared data:** `{ title, url }` only. No `text` field, and no tracking parameters.
- **URLs:** always canonical (`window.location.origin` + `paths.*` from confirmed data). A visit typed as `/@ADMIN/Lisbon/...` shares `/@admin/lisbon/...`.
- **Cancelled share sheet:** silent. No toast, no popover.
- **Manual-copy popover** (R6):
  - the URL is in a read-only input, **focused and fully selected on open**;
  - the instructions, linked with `aria-describedby`, read "Your browser didn't allow copying automatically. The link is selected: press Ctrl+C (⌘C on Mac) to copy it.";
  - **Copy** retries the clipboard. On success: the "Link copied" toast and the popover closes. On failure: the URL is re-focused and re-selected, and the hint changes to the emphasised "Copy wasn't allowed. Press Ctrl+C (⌘C on Mac) now." (`aria-live="polite"`);
  - Escape or an outside click closes it, and focus returns to Share (it's the popover's trigger). Reopening starts with the first hint.
  - No deprecated `execCommand("copy")` is used.
- **Repeated clicks:** a synchronous in-progress guard means a double click, or a third click while a share is pending, starts **one** share (`aria-busy` meanwhile). Once it completes, the next click shares again. Clicking Share while the popover is open keeps exactly one popover.
- **Only for confirmed content:** the viewers render Share only in their confirmed reading views, never while loading, on the not-available screen or on an error (unit- and browser-tested).

## 3. Browser checks (targeted)
**Environment:** backend `mvn spring-boot:run -Dspring-boot.run.profiles=h2` (:8081, fresh), Vite (:8080), Chrome via `playwright-core@1.48.2`, clipboard permissions granted to the context. Seed: `scripts/seed14c.mjs`, unchanged.

**How each mode is set up:**
- **Native:** an init-script stub of `navigator.share` that records calls, with an optional delay or AbortError.
- **Clipboard:** `navigator.share` removed; the real clipboard is read back with `readText()`.
- **Blocked:** `navigator.share` removed and `clipboard.writeText` rejecting until a flag allows it; the real clipboard is still used for read-back.

**`t14d2.mjs`, 27 checks**, with emphasis on the four areas requested at authorization:
- **Native:** page payload (title, canonical URL from an uppercase visit, exactly `{title,url}`); no toast or popover; collection payload; a clean session.
- **Cancelled sheet:** silent, no errors.
- **Repeated clicks:** a double click plus a third click during an 800 ms pending share → exactly 1 share and `aria-busy` set; not busy afterwards; a later click shares again.
- **Clipboard:** the canonical URL actually on the clipboard; the toast; clicking again copies again; a clean session.
- **Clipboard failure / manual selection:**
  - the popover shows the canonical URL, read-only, **focused and selected 0…51 (the full URL)**, with the instructions and no toast;
  - **a real ⌘C/Ctrl+C copies the selected full URL** (the copy event carries it);
  - **Copy retry failure:** the popover stays, the URL is re-focused and fully re-selected, the emphasised hint shows, and the clipboard really was retried (2 attempts);
  - Escape → closed and focus on Share; reopening → the first hint;
  - **Copy retry success:** the URL on the clipboard, the toast, the popover closed;
  - Share clicked with the popover open → one popover; a clean session.
- **Collection** fallback shows the canonical collection URL.
- **Mobile 360 px:** Share inside the viewport, no horizontal overflow, the tap uses the native sheet, and the manual-copy popover fits on screen.
- **Not-available screen:** no Share.

Screenshots: `01-link-copied-toast`, `02-manual-copy-popover`, `03-copy-retry-failed`, `04-mobile-share`, `05-mobile-manual-copy`.

**Note:** the first run's popover screenshots caught the popover mid fade-in (translucent). The script now waits 400 ms before those screenshots and was rerun, with the same 27/27. No assertion changed.

## 4. Scope confirmation
- No 14d-3 code (arrival, scroll restoration, focus, anchors, observers).
- No backend, migration, configuration, `.gitignore`, global React Query, editor or unrelated change.
- A recursive diff against the approved 14d-1 ZIP shows only the 7 `src/` files above plus this `acceptance-14d-2/` folder.

## 5. Re-running
Start both servers, run `node scripts/seed14c.mjs` once, then `node scripts/t14d2.mjs <dir>` (it doesn't change any data) and `node scripts/t14c.mjs <dir>`. A fresh seed is needed for each 14c run.
