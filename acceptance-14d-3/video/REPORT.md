# Step 14d-3: Native-Video Correction Report (plan rev. 2)

**Date:** 2026-11-19 · **Authorized scope:** native-video correction plan rev. 2 only. **Stopped for review.** 14e not started.
**Baseline:** the correction ZIP `Curio-main-step14d-3-correction.zip`. The hook was verified identical to it before starting.

## 0. Results at a glance
| Gate | Result | Raw output (in `acceptance-14d-3/video/`) |
|---|---|---|
| Tests (`vitest run`) | **60 files, 1182 tests, all pass** (correction ZIP: 1174; +8 new, no existing assertion changed) | `vitest-output.txt` |
| Type-check (app + node) | exit 0 | `tsc-output.txt` |
| ESLint (the 2 changed source files) | exit 0, no warnings | `eslint-output.txt` |
| Build | exit 0, **3 warnings, all pre-existing baseline:** (1) Browserslist/caniuse-lite data 17 months old; (2) `[vite:css] @import must precede all other statements` (Google Fonts); (3) `(!) Some chunks are larger than 500 kB after minification` | `build-output.txt` |
| `t14d3.mjs` | **28/28** | `browser-14d3-output.txt` |
| `t14d3c.mjs` (C1–C4 + new C5) | **14/14 on 3 consecutive runs** | `browser-14d3c-output.txt` |
| Regressions (scripts byte-identical to the approved copies) | 14d-1 **14/14**, 14d-2 **27/27**, 14c **75/76 in the main run, see §5** | `regression-*-output*.txt` |
| Sensitivity V1–V5 (+ R1/R2 re-run on the renamed function) | every mutation caught by the unit tests; browser results are reported separately (§4) | `../sensitivity-video/` |

`act()` warnings: still the same 6.

## 1. Changed files (vs the correction ZIP: exactly these 5)
| | File | Change |
|---|---|---|
| M | `src/hooks/usePublicArrival.ts` | `imagesBeforeLoaded` → `mediaBeforeReady` (images unchanged, plus native videos) and a new `videoReady`. A capture-phase `loadedmetadata` listener is added while settling and removed in `finish()`. |
| M | `src/hooks/usePublicArrival.test.tsx` | Additive only. A `videoAt` harness option (before / before with `<source>` children / inside the anchor / after) and one new `describe` with 8 tests. |
| M | `acceptance-14d-3/scripts/seed14d3c.mjs` | A module "Media" with the pages "Clip" (a native video block above 30 paragraphs) and "Clip end". |
| M | `acceptance-14d-3/scripts/t14d3c.mjs` | The C5 fixture and checks. C1–C4 are unchanged. |
| M | `acceptance-14d-3/scripts/sensitivity_correction.py` | V1–V5 added. The R1/R2 patterns now point at the renamed function and keep the same meaning. |

Diff: `video.diff`. The renderer, the other views, 14d-1/14d-2 code, the backend and the config are unchanged, and so is the rule against reading `scrollY` during navigation or cleanup.

## 2. Implementation (plan §2 / §2a)
- **Readiness.** Settling ends when the layout has been stable for 500 ms **and** two conditions hold:
  - every `<img>` strictly before the anchor is `complete` (as before);
  - every `<video>` strictly before the anchor is ready.

  A video is ready when any one of these holds:
  - `readyState ≥ HAVE_METADATA`;
  - `error !== null`;
  - `networkState` is `NETWORK_EMPTY` or `NETWORK_NO_SOURCE`.

  "Strictly before" means `DOCUMENT_POSITION_PRECEDING`, the same rule as for images. A video inside the anchor or after it never holds settling.
- **Event.** Only `loadedmetadata` is used, never `loadeddata`. It doesn't bubble, so it is caught in the capture phase on `document`. It goes through the existing `onLoad` handler, which only acts on targets inside the settling view's content. The listener exists only while settling and is removed on every exit path.
- **Cap.** The 5 s cap is unchanged and authoritative.
- **Unchanged.** Images, iframes, tracking, arming and sampling all work as before.
- **Limitation, as documented:** metadata that arrives after the cap, or after user input has ended settling, is not corrected.

## 3. Tests
**Unit:** 8 new tests in "settling readiness: native videos".
1. A video before the anchor without metadata holds settling past the stable time. `loadedmetadata` plus a 120 px shift is corrected (scroll 1100 → 980), and settling then ends.
2. `loadeddata` alone triggers no correction and doesn't end settling.
3. Metadata that never arrives → settling ends at the 5 s cap (not yet at 4.8 s, ended by 5.2 s).
4. These three cases don't hold settling:
   - errored (`src` failed);
   - `NETWORK_NO_SOURCE` with child `<source>` elements and `video.error` still `null`;
   - `NETWORK_EMPTY`.
5. A video inside the anchor or after it doesn't hold settling (2 cases).

The existing image and iframe readiness tests are unchanged and pass.

**Browser C5 (`t14d3c.mjs`):**
- **Fixture:** Chrome itself records a real, decodable 640×480 WebM from a canvas with `MediaRecorder`. The script serves it at `https://videos.example.org/clip.webm`, holding the response as each check needs. No binary file is committed.
- **Correction to the plan's description:** before its metadata loads, Chrome gives an unsized `<video>` a fixed 150 px height (152 px with the border), not a 2:1 box. A 640×200 clip, as planned, would have changed the height by only 50 px, right at the threshold. I used 640×480 instead, which gives a 329 px change.

Results, the same on all 3 runs:
- **C5a precondition:** the video's box goes from 152 px (`readyState 0`) to 481 px (`readyState 4`).
- **C5a:** with the metadata held, the inline `overflow-anchor` is still `none` at 1.5 s, so settling is waiting. After the release, the anchor's final top equals the saved top exactly (140.02 → 140.02), and settling then ends.
- **C5b:** with the metadata held for 7 s, settling ends after about 5.05 s (5064, 5047 and 5057 ms) while `readyState` is still 0. The cap holds.

**One fix to my own check during the run:** C5b first waited only for the inline value to become `""`. That value is already `""` before the restored view's settling starts, so one V2 browser run reported "ended after 47 ms". C5b now waits until settling has started (`none`) before timing its end. That first V2 output is kept as `sensitivity-V2-first-run-racy-C5b.txt`, and every C5 result reported here comes from the fixed script.

## 4. Sensitivity (unit and browser reported separately)
| ID | Mutation | Unit/integration | Browser `t14d3c` (3 runs) |
|---|---|---|---|
| V1 | Native videos excluded from readiness | **2 failures** (tests 1, 3) | **fails 3/3**: C5a (anchor ends at 469 instead of 140, a 329 px shift), and C5b (settling ends after about 550 ms) |
| V2 | No `loadedmetadata` correction trigger | **1 failure** (test 1) | **not detected, passes 3/3.** The restoration `ResizeObserver` corrects the same resize while settling is still running, as the plan anticipated. Correct behavior in a real browser relies on both mechanisms; only the unit test guards the listener. |
| V3 | Document-order check removed for videos | **2 failures** (inside / after) | not run |
| V4 | `loadeddata` instead of `loadedmetadata` | **2 failures** (tests 1, 2) | **not detected, passes 3/3**, for the same reason as V2 |
| V5 | `networkState` clause removed | **2 failures** (`NETWORK_NO_SOURCE`, `NETWORK_EMPTY`) | not run |
| R1 | Readiness ignores media (re-run, renamed function) | 4 failures (2 image + 2 video) | not run |
| R2 | Every image holds settling, regardless of position (re-run) | 1 failure | not run |

Every file was restored and verified byte-identical (`Restored … True` in each output).

## 5. 14c regression: one intermittent third-party console error
The main run showed **75/76**. The failing check was "Mobile: no unexpected console errors", and the error was `Permissions policy violation: compute-pressure is not allowed in this document.` That message comes from the real YouTube player inside its cross-origin iframe in the 14c content.

Re-runs, each on a freshly reseeded backend:

| Run | Code | Result | Output |
|---|---|---|---|
| Rerun 1 | current | 75/76 (same message) | `regression-t14c-output-rerun.txt` |
| Rerun 2 | current | 76/76 | `regression-t14c-output-rerun2.txt` |
| Rerun 3 | current | 76/76 | `regression-t14c-output-rerun3.txt` |
| Control | previous hook (correction ZIP) | 76/76 | `regression-t14c-output-PREVIOUS-HOOK.txt` |

The hook was restored afterwards and verified byte-identical.

**My assessment:** this is intermittent and comes from YouTube, not from this change.
- The new code only affects native `<video>` elements in our own DOM.
- The 14c content has no native video.
- Events inside a cross-origin iframe never reach our document listeners.

I can't prove this with a single control run, so the result is reported as observed: the current code passed 2 of 4 runs and the previous hook passed 1 of 1. I didn't change the 14c script.

## 6. Status
| Substep | Status |
|---|---|
| 14d-1, 14d-2 | Approved |
| 14d-3 | Findings 1–4 accepted; native-video correction delivered, awaiting review |
| 14e | Not authorized, not started |
