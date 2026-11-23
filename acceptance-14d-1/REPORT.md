# Step 14d-1 – Route adapters and workspace links: Implementation Report

**Date:** 2026-11-18 · **Authorized scope:** 14d-1 only (approved plan rev. 4.3, §4 / Q-d3).
**Baseline:** the approved 14c ZIP (`Curio-main-step14c.zip`, correction round 3); the working copy was verified identical to it before starting.
**Stopped after 14d-1.** No 14d-2 (sharing) or 14d-3 (arrival/scroll/focus/observers) work was done.

## 0. Results at a glance
| Gate | Result | Raw output |
|---|---|---|
| Tests (`vitest run`) | **48 files, 1038 tests, all pass** (14c: 46 files, 1019 tests; +19 new) | `vitest-output.txt` |
| Type-check (app + node) | exit 0 | `tsc-output.txt` |
| ESLint (6 changed/new files) | exit 0, no warnings | `eslint-output.txt` |
| Build | exit 0; only the existing >500 kB chunk warning | `build-output.txt` |
| Targeted 14d-1 browser checks | **14/14 pass** (fresh in-memory DB) | `browser-14d1-output.txt`, `screenshots/`, `scripts/t14d1.mjs` |
| 14c regression (`t14c.mjs`, byte-identical to the approved copy) | **76/76 pass** | `browser-14c-regression-output.txt`, `14c-regression-screenshots/` |

`act()` warnings: 6, the same pre-14c ones as before.

## 1. Changed files (vs the approved 14c ZIP)
| | File | Change |
|---|---|---|
| A | `src/pages/public/routes.tsx` (25 lines) | `PublicCollectionPage` and `PublicPageViewPage` moved here. Same code: `parseHandle` + param guards, NotFound fallbacks, same props. |
| M | `src/pages/creator/Placeholders.tsx` (+4 −20) | The two adapters and their `CollectionView`/`PageView` imports removed; header comment updated. `CreatorProfilePage` (Step 15) and the creator adapters stay. |
| M | `src/AppRoutes.tsx` (+1 −2) | Imports the two adapters from `./pages/public/routes`. Route table unchanged. |
| M | `src/pages/creator/CollectionEditor.tsx` (+11 −2) | One `viewable` condition, `!draft && c.publiclyVisible && !!user?.username` (exactly the existing collection-link condition), now shared by the collection link and the new per-page links. Each **PUBLISHED** page row gets a "View" link to `paths.page(username, c.slug, m.slug, p.slug)`. |
| A | `src/pages/public/routes.test.tsx` (11 tests) | Adapter behavior: lower-cased handle, slugs as-is, invalid handles → NotFound with no viewer, and `Placeholders.tsx` no longer exports them. |
| A | `src/pages/creator/CollectionEditor.publicLinks.test.tsx` (8 tests) | Collection link (published, unlisted; hidden for draft, not publicly visible, no username); per-page links (published only, module-qualified hrefs, unlisted included, hidden in the same three cases, navigation params, no name collision). |

Full diff of the modified files: `modified-files.diff`.

**Byte-identical:** every existing test file, including `AppRoutes.test.tsx` (it mocks the viewers by module path, so it is unaffected by the move), `CollectionEditor.test.tsx`, `CollectionView.test.tsx` and `PageView.test.tsx`. Also unchanged: all 14c source files and the backend.

## 2. Notes for review
1. **The collection-level link was already tested.** The 14d plan (§2) said it had "no test". That was wrong: `CollectionEditor.test.tsx` already asserts it (lines 169, 176, 383, 387, matching `/view public page/i`). My earlier search was case-sensitive and missed them. Those tests are unchanged. The new file adds the cases they didn't cover (unlisted, not publicly visible, no username).
2. **Per-page link name.** I first used the accessible name "View public page: <title>". It matched the existing tests' `/view public page/i` pattern, and two of them failed with "multiple elements". Rather than edit existing tests, the per-page link's name is now **"View <title> on the public site"**. It starts with its visible text "View" (label-in-name), and a new test asserts there is exactly one `/view public page/i` link.
3. **Unlisted collections show the per-page links,** like the existing collection link (same `viewable` condition). Unlisted pages are readable by link.
4. **No behavior change for readers:** the moved adapters are verified in unit tests, by the unchanged `AppRoutes.test.tsx` route and 404 suite, and in the browser (uppercase handle accepted; invalid handles are the app 404).

## 3. Browser checks (targeted)
**Environment:** backend `mvn spring-boot:run -Dspring-boot.run.profiles=h2` (:8081, fresh), Vite (:8080), Chrome via `playwright-core@1.48.2`. Seed: `scripts/seed14c.mjs`, unchanged. `t14d1.mjs` doesn't modify any data, so `t14c.mjs` ran afterwards on the same fresh seed.

`t14d1.mjs` (14 checks):
- **Signed-in creator, in the collection editor:**
  - published collection: link targets; one per-page link per published page; none for the draft page; label and visible text;
  - "View public page" → real collection viewer; per-page "View" → real page viewer (content + outline); Back → editor;
  - unlisted collection: links shown, and the per-page link opens the page;
  - draft collection: no links at all, even for its published page;
  - no `/api/media/*` requests, console errors or failed requests.
- **Anonymous, moved adapters:** uppercase handle on the collection and page routes; four invalid-handle paths → app 404; no failed API requests.

Screenshots: `01-editor-public-links.png`, `02-view-opens-page.png`, `03-draft-no-links.png`.

## 4. Scope confirmation
- No sharing, arrival, scroll, focus or observer code (14d-2 and 14d-3).
- No backend, migration, configuration, `.gitignore`, global React Query change or unrelated cleanup.
- A recursive diff against the approved 14c ZIP shows only the 6 `src/` files above plus this `acceptance-14d-1/` folder.

## 5. Re-running
Start both servers, run `node scripts/seed14c.mjs` once, then `node scripts/t14d1.mjs <dir>` and `node scripts/t14c.mjs <dir>`. Each 14c run needs a freshly seeded database.
