# Curio Step 15c: Profile Settings, final report (15c-6)

**Plan:** `~/Downloads/Curio-step15c-plan.md` rev. 3 (233dbeda…e284), under Step 15 plan rev. 2.1 (30298ee8…04e4).
**Baseline:** the accepted Step 15b package `Curio-main-step15b-r2.zip`, SHA-256 `dfc5ab9b83a916666f3bd605063663723156acb2a44fd09354b473ccb2d74c75`, and its evidence, `acceptance-15b/`, which was not modified.
- *Checksum reconciliation (r2 of this report):* that full value is the `shasum -a 256` output recorded when the 15b-r2 package was built (1756 entries, integrity check passed). The variant `dfc5ab9b83a916666f3bd7f31026aa66a9db0628be27618643ec2b567c15e284`, quoted in the 15c final review, shares only the first 17 hex characters, and its last four (`e284`) match the 15c plan's checksum (233dbeda…e284). It appears to be a transcription error. The ZIP is no longer on disk, so it couldn't be re-hashed now.
**Scope:** `/settings/profile` lets a signed-in user edit their own profile: display name, bio, avatar and banner URLs, up to 10 social links, and visibility.
- Explicit Save, with client checks that mirror the server.
- A known server 400 is shown under its field.
- Only the six editable keys are sent.
- Public caches are invalidated after a save.
- Desktop and mobile menus link to the page.

The work was frontend only: no backend, migration or configuration changes.

## 1. Substeps
| Substep | Content | Old code | New code | Review |
|---|---|---|---|---|
| 15c-1 | `Profile`, `MeResponse`, `UpdateProfileRequest`; `apiPaths.me/myProfile` | 1 failed / 16 passed (17) | 17/17 | Closed (5a357d71…6ee4) |
| 15c-2 | export `isHttpsUrl`; `profile-validation.ts` | file unloadable ("no tests") | 49/49; regression 64/64 | Closed (f018819d…97c7cd) |
| 15c-3 | `useMyProfile`, `useUpdateProfile` (correction A, 5 public prefixes) | 8 failed / 45 passed (53) | run 1: 1 failed / 52 passed (test bug); final 53/53 | Closed (0add2231…7bb6) |
| 15c-4 | `ProfileSettings` page (correction B), route swap, placeholder removed | page test unloadable; AppRoutes 45/45 | run 1: 2 failed / 66 passed; run 2: 1 failed / 67 passed (test bugs); final 170/170 | Closed (3d8c4be9…93e0) |
| 15c-5 | Navbar "Profile settings" (desktop + mobile) | 2 failed / 7 passed (9) | 9/9 | Closed (5a9bd126…779d) |
| 15c-6 | Full gates, evidence, package | n/a | see §2 | This report |

**Tests:**
- **Unique new tests: 84.** paths +1, profile-validation +49, useContent +3, useCreatorMutations +5, ProfileSettings +23, Navbar +3.
- **Full suite:** 1226 → 1310 (+84); files 64 → 66 (+2).
- **Executions:** 1985 test executions across the 15 recorded runs (sum of the "Tests" totals in every output file under `acceptance-15c/`; the unloadable runs count 0).

**Changed assertions:** none. The one change to an existing test file's setup:
- `AppRoutes.test.tsx` gained a `vi.mock` stub for the new page. That test has no QueryClient, and it stubs every other page the same way.
- This was disclosed in 15c-4.

## 2. Full gates (15c-6, raw outputs in `acceptance-15c/15c-6/`)
| Gate | Command | Exit | Result |
|---|---|---|---|
| Vitest, full suite | `npx vitest run` | 0 | **66 files / 1310 tests passed** (`vitest-output.txt`) |
| TypeScript (app) | `npx tsc -p tsconfig.app.json --noEmit` | 0 | no output (`tsc-app.txt`, 0 bytes) |
| TypeScript (node) | `npx tsc -p tsconfig.node.json --noEmit` | 0 | no output (`tsc-node.txt`, 0 bytes) |
| ESLint, 17 changed files | `npx eslint <the 17 files in changed-files.txt>` | 0 | 0 errors, 0 warnings (`eslint-changed.txt`, empty) |
| Production build | `npx vite build` | 0 | built (`build-output.txt`); 3 warnings, see §3 |

Exit codes as recorded: `exit-codes.txt`.

## 3. Warnings
**Build:** 3 warnings, all pre-existing (on the baseline list since Step 14) and the same as in the 15b build:
1. Browserslist: caniuse-lite data is 17 months old.
2. `[vite:css] @import must precede all other statements` (Google Fonts import order).
3. Some chunks are larger than 500 kB after minification.

There are no new build warnings.

**Vitest stderr:** compared with `acceptance-15b/vitest-output.txt`:
- **15b:** 62 stderr blocks.
- **15c:** 63 stderr blocks.
- **The one extra block** is `ProfileSettings.test.tsx` (test 1), with two React Router future-flag warnings: v7_startTransition and v7_relativeSplatPath. This is the same pre-existing warning type that other router tests print.
- **Other warnings** are unchanged in count: "not wrapped in act" 6, "Missing …" 11, update-in-test warnings 4 + 2.
- **New categories:** none. None of the new or changed test files prints an `act()` warning.

**Failures:** none in the final runs. The intermediate failures were bugs in the new tests, fixed in the tests and kept as evidence:
- 15c-3 run 1: read state before re-render; fixed with `waitFor`.
- 15c-4 run 1: retry delay timeout; fixed with `retryDelay: 1`. Second lookup by `/save/i` didn't match "Saving…"; fixed by reusing the same element.
- 15c-4 run 2: expected request count ignored the 2 designed retries.

## 4. Scope and regression checks
| Area | Evidence |
|---|---|
| Types and API paths | `paths.test.ts` 17/17 |
| Validation and payload builder (six keys only, protected fields can't be sent) | `profile-validation.test.ts` 49/49 |
| Read/update hooks, `MeResponse.user` kept, 5 public prefixes invalidated, `categories`/`mine` not, nothing invalidated on failure | `useContent.test.tsx` 12, `useCreatorMutations.test.tsx` 41 |
| Page and route (protected), visibility, field and form errors, disabled while saving | `ProfileSettings.test.tsx` 23, `AppRoutes.test.tsx` 45 |
| Desktop and mobile navigation; `/profile` link unchanged; visitors see neither | `Navbar.test.tsx` 9 |
| Existing `/profile` page | `src/pages/Profile.tsx` not modified; route unchanged |
| Public creator profile and Discover | `CreatorProfile.test.tsx` 14, `CreatorProfile.pagination.test.tsx` 8, `Discover.test.tsx` 13, `Discover.arrival.test.tsx` 3; source not modified |
| `isHttpsUrl` export | `creator-validation.test.ts` 27 |

All the counts above are copied from `15c-6/vitest-output.txt`.

## 5. Changed files (17; `15c-6/changed-files.txt`)
**New (4):**
- `src/lib/profile-validation.ts`
- `src/lib/profile-validation.test.ts`
- `src/pages/settings/ProfileSettings.tsx`
- `src/pages/settings/ProfileSettings.test.tsx`

**Modified (13):**
- `src/lib/types.ts`
- `src/lib/paths.ts`
- `src/lib/paths.test.ts`
- `src/lib/creator-validation.ts`
- `src/hooks/useContent.ts`
- `src/hooks/useContent.test.tsx`
- `src/hooks/useCreatorMutations.ts`
- `src/hooks/useCreatorMutations.test.tsx`
- `src/AppRoutes.tsx`
- `src/AppRoutes.test.tsx`
- `src/pages/creator/Placeholders.tsx`
- `src/components/Navbar.tsx`
- `src/components/Navbar.test.tsx`

**Evidence:** `acceptance-15c/` (new).

How the list was produced:
- It is every file outside `node_modules`, `dist`, `backend/target`, `backend/data` and `acceptance-15c` that is newer than `acceptance-15b/REPORT.md`, excluding `*.tsbuildinfo`.
- It is identical to the union of the per-substep `changes.diff` files.
- Nothing under `backend/` changed.

## 6. Evidence directory
- `15c-1/`: changes.diff, old-code-paths.test.txt, new-code-paths.test.txt
- `15c-2/`: changes.diff, old-code-profile-validation.test.txt, new-code-profile-validation.test.txt, regression-creator-validation-collectioneditor.txt
- `15c-3/`: changes.diff, old-code-hooks.test.txt, new-code-hooks.run1-test-timing-bug.txt, new-code-hooks.test.txt
- `15c-4/`: changes.diff, old-code-tests.txt, new-code-tests.run1.txt, new-code-tests.run2.txt, new-code-tests.txt
- `15c-5/`: changes.diff, old-code-tests.txt, new-code-tests.txt
- `15c-6/`: vitest-output.txt, tsc-app.txt, tsc-node.txt, eslint-changed.txt, build-output.txt, exit-codes.txt, changed-files.txt
- `REPORT.md`: this report, also at `~/Downloads/Curio-step15c-report.md`

## 7. Limitations and outstanding items
- **No byte-level diff against the 15b ZIP:** that ZIP is no longer in `~/Downloads`, so the changed-file list comes from file times plus the per-substep diffs (§5).
- **15c-5 test-file diff:** the "before" side of the 15c-5 diff for `Navbar.test.tsx` was rebuilt by removing the added block, since that file was edited before a copy was saved. The `Navbar.tsx` diff uses a real pre-edit copy.
- **Accepted client/server differences:**
  - `https:///nohost` passes the client URL check and is rejected only by the server.
  - Integer-like link labels (for example "2024") enumerate first, so their order isn't guaranteed.
  - Field error messages are not `role="alert"` (the form-level message is the page's single alert).
- **Not run in 15c, deferred to 15d as planned:** browser regressions, axe, contract15.
- **Carried forward unchanged from earlier steps:** MediaUrlResolver key order, YouTube compute-pressure message, D1 F2/F3, Reset bug, moderate axe findings.
