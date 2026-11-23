# Step 14e: Public-Viewer Browser Acceptance — Close-out Report (14e-3)

**Date:** 2026-11-23
**Authorization:** 14e-3 only ("Yes. I recommend authorizing 14e-3."), under plan `Curio-step14e-plan.md` rev. 2, §4 "14e-3".
**Scope:** documentation only. This step changed `PLAN.md` (diff: `14e-3/PLAN.md.diff`) and added this report and `14e-3/`. **No `src/`, backend, migration, configuration or test change.**
**Code under report:** the accepted A11Y artifact `Curio-main-stepA11Y-r2.zip` (`b92662d8…4def`). That is the 14d-3 baseline plus the D1 and A11Y corrections.

Substep reports:
- `14e-1/REPORT.md`
- `14e-2/REPORT.md`
- `../acceptance-d1/REPORT.md`
- `../acceptance-a11y/REPORT.md`

## 1. Results per acceptance criterion (approved Step 14 plan §17)

### AC1 — The browser report covers Step 14, with all checks passing
**Status: met.** Every stage has now run on the final code. The only failures are the accepted, superseded S5 F2/F3.

*Updated 2026-11-23 after the authorized final-baseline validation of S2, S4 and S5 (see "Final code, S2/S4/S5" below).*

**Final code (after D1 and A11Y):**
| Script | Result | Evidence |
|---|---|---|
| t14e | 152/152 in each of 3 fresh-backend runs | `acceptance-a11y/outputs/run-{1,2,3}/t14e.txt` |
| contract14e | 14/14 ×3 | `acceptance-a11y/outputs/run-{1,2,3}/contract14e.txt` |
| axe14e | 22/22 scans ×3; critical and serious 0; moderate 26 (report-only) | `acceptance-a11y/outputs/run-{1,2,3}/axe14e.*` and `axe-comparison.txt` |
| S1: t14a | 26/26 | `acceptance-a11y/outputs/regression/` |
| S3: t14d3, t14d1, t14d2, t14c | 28/28, 14/14, 27/27, 76/76 | `acceptance-a11y/outputs/regression/` |
| D1: td1, td1-creator, 13e t2-editor | 15/15 ×3, 5/5, 23/23 | `acceptance-d1/outputs/post-*` |

**Final code, S2/S4/S5** (authorized final-baseline validation; `14e-3/final-baseline/`):
- Runner: `run-all.sh` v2 (`46c2df0f…e5ede1`, unchanged). The working copy was verified identical to `Curio-main-step14e-3.zip` beforehand.
- Script copies: 22/22 verified against the manifests (`copy-verification*.txt`).
- Each stage ran on a fresh H2 backend and Vite; ports were free afterwards.

| Stage | Script | Result |
|---|---|---|
| S2 | t14b | 30/30 |
| S2 | t14b-stale | 15/15 |
| S4 | t14d3c | 18/18 |
| S5 | t1-templates | 17/17 |
| S5 | t2-editor | 23/23 |
| S5 | t3-media (amended) | 12/13: **F2 only** ("Cancel keeps the previous image") |
| S5 | t4-regression (amended) | 13/14: **F3 only** ("Existing page loads… blocks=0") |
| S5 | **Total** | **65/67**, identical to the accepted 14e-1 run |

- S5 ran with `ALLOW="S5:t3-media.mjs,S5:t4-regression.mjs"`, as in the accepted 14e-1 runs.
- I compared the FAIL lines by hand with the 14e-1 `-s5f4` outputs. They are exactly F2 and F3, with the same check names and the same PASS/FAIL counts per script.
- The scripts' own `FAILED [...]` network summaries (deliberate 503s and 404s) are byte-identical to the accepted run.
- Nothing was suppressed or edited.

**14d-3 code (14e-1, before D1 and A11Y), kept for history:**
- S2: t14b and t14b-stale passed.
- S4: t14d3c passed.
- S5 (the 13e creator scripts): 65/67. The 2 failures are F2 and F3, classified as superseded assertions and accepted (`14e-1/classification.md`).

**Exceptions, all disclosed:**
1. **S5 F2/F3:** superseded and accepted. They remain FAIL lines in the original scripts' output.
2. ~~S2, S4 and S5 were not re-run on the final code.~~ **Resolved:** they were re-run on the final code with the results above.
3. **14e-2 evidence:** 151/152 at the time, with D1 failing. D1 is now closed, and t14e is 152/152 in the A11Y runs above.

### AC2 — Scenarios A and B readable end to end by a logged-out visitor
**Status: met.**

All of the following pass in each of the 3 runs on the final code:
- J1 (Scenario A, desktop and keyboard-only);
- J2 (Scenario B, 1280 px and 360 px);
- R3 isolation;
- R4 arrival and focus;
- R6 hygiene.

The evidence is the t14e outputs listed under AC1. Negative controls (a)–(d) each failed as required (14e-2, `14e-2/neg-*`).

**Excluded:** Scenario B's "shares their profile" belongs to Step 15.

### AC3 — The creator regression passes
**Status: met, with accepted classifications.**
- 14e-1 S5: 65/67; F2 and F3 are superseded and accepted, and the F4 coverage gap was closed by the approved amendment.
- 13e t2-editor: 23/23 on the D1 code (`acceptance-d1/outputs/post-t2-editor-1`).
- Final code (`14e-3/final-baseline/`): S5 65/67, with only F2/F3, identical to 14e-1.
- t14d1, which covers the workspace "View" links: 14/14 on the final code.

### AC4 — The final ZIP excludes `backend/data/`, `node_modules`, `dist` and `target`
**Status: met.** It was verified by listing the 14e-3 ZIP: `unzip -l` with a grep for each excluded path, each returning 0 entries.
- The output is saved as `~/Downloads/Curio-step14e-3-ac4-zip-listing.txt`.
- That file lives outside the ZIP, because a ZIP cannot contain its own listing.
- Its hash is given in the delivery message.

## 2. Results per requirement (plan §2)
| R | Serves | Result | Evidence |
|---|---|---|---|
| R1 Scenario A end to end | AC2 | pass ×3 (final code) | t14e J1 |
| R2 Scenario B end to end, 1280 and 360 px | AC2 | pass ×3 | t14e J2 |
| R3 Draft/unlisted isolation | AC2 | pass ×3; negative control (a) failed as required | t14e R3, `14e-2/neg-a` |
| R4 Arrival, scroll, focus, keyboard-only | AC1 | pass ×3. The keyboard pass is clean since D1. | t14e R4 and `[H J1 keyboard]` |
| R5 Combined regression and creator regression | AC1, AC3 | **All of S1–S5 on the final code:** S1–S4 pass; S5 65/67 (F2 and F3 accepted) | `14e-1/`, `acceptance-a11y/outputs/regression` |
| R6 Hygiene of public sessions | AC1 | pass ×3: no unexpected console errors or failed requests, no Authorization header on public calls, 0 `/api/media/*` requests, no 360 px overflow | t14e `[H …]` checks |
| Q-e3 Contract | AC1 | 14/14 ×3 | contract14e |
| Q-e1 axe (report-only) | AC1 | critical and serious went from 103 nodes to 0 after A11Y; moderate unchanged at 26 | `acceptance-a11y/outputs/axe-comparison.txt` |

## 3. 14e-3 gates (plan §6; outputs in `14e-3/`)
| Gate | Result |
|---|---|
| vitest | **62 files / 1197 tests passed** |
| tsc `-p tsconfig.app.json` | clean |
| tsc `-p tsconfig.node.json` | clean |
| vite build | OK, with 3 warnings, all on the baseline list: Browserslist/caniuse-lite out of date, CSS `@import` order, chunks over 500 kB |
| ESLint on changed `src/` files | none changed |

The plan's §0 baseline was 60 / 1188. The difference is explained by the accepted D1 tests (+1 file, +2 tests) and A11Y tests (+1 file, +7 tests). 14e-3 itself added no tests.

## 4. `PLAN.md` changes (`14e-3/PLAN.md.diff`)
- **Step 14 entry:**
  - marked done;
  - substep table with closure dates and accepted artifacts;
  - AC1–AC4 with evidence and the exceptions above;
  - the decisions recorded during Step 14;
  - the open items carried forward.
- **Notes closed:**
  - the contract-test candidate (two notes, Step 7 area), closed by `contract14e`;
  - the malformed-content decision (two notes, Steps 9 and 10 area), decided in 14c: per-block validation in `src/lib/publicBlocks.ts` and no 404.
- **Limitation:** the 14a, 14b and 14c reports and the Step 14 plan document are not in the repository. Decisions recorded only there are not reproduced; the entry says so.

## 5. Open items carried forward (from plan §8 and later)
- `MediaUrlResolver.resolveBlocks` key-order bug: needs a backend plan.
- YouTube `compute-pressure` console message: intermittent, third-party.
- Public image gradient observation: unasserted.
- Read-only `CodeEditor` Reset button blanks the code.
- Moderate axe findings: 26 nodes.
- D1 F2/F3 (not authorized). Editable Monaco editors keep the `Delayer` window; it has not been observed.
- 14d-3 open point: programmatic navigation in the same task as a programmatic scroll.
- Limits: Chrome only, H2 only (PostgreSQL is a Step 20 gate), native-video metadata after the 5 s cap.
- Out of Step 14: Steps 15–20.
