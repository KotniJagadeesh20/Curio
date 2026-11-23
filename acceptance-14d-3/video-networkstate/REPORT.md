# Step 14d-3: Native-Video Network-State Correction Report

**Date:** 2026-11-19 · **Scope:** the review finding on network states only. **Stopped for review.** 14e not started.
**Baseline:** the video ZIP `Curio-main-step14d-3-video.zip`. The hook was verified identical to it before starting.
Raw evidence: `acceptance-14d-3/video-networkstate/` and `acceptance-14d-3/sensitivity-networkstate/`.

## 0. Results at a glance
| Gate | Result |
|---|---|
| Tests | **60 files, 1188 tests, all pass** (video ZIP: 1182; +6 new; 2 existing fixtures corrected, see §3) |
| tsc (app + node), ESLint (2 changed source files) | exit 0, no warnings |
| Build | exit 0, **the 3 baseline warnings only:** (1) Browserslist/caniuse-lite data 17 months old; (2) `[vite:css] @import must precede all other statements`; (3) `(!) Some chunks are larger than 500 kB` |
| `t14d3.mjs` | **28/28** |
| `t14d3c.mjs` (C1–C5 unchanged, new C6) | **18/18 on 3 consecutive runs** |
| Regressions | 14d-1 **14/14**, 14d-2 **27/27**, 14c **76/76 on 3 runs**, each on a freshly reseeded backend, with no `compute-pressure` message this time |
| New tests against the **previous** hook | **6 of the 6 new tests fail** (`new-tests-against-PREVIOUS-hook.txt`) |
| Sensitivity V1–V7 | **every mutation caught by the unit tests**; browser results are listed separately (§4) |

`act()` warnings: still the same 6.

## 1. A further finding, beyond the literal request: `NETWORK_NO_SOURCE` is ambiguous too
I probed Chrome's media state (`chrome-video-state-probe.txt`; scripts `probe-video-states*.mjs`) and found that the false-ready problem you raised for `NETWORK_EMPTY` also applies to `NETWORK_NO_SOURCE`:
- Resource selection sets `NETWORK_NO_SOURCE` **before** it has tried anything, and keeps it until the next task. This happens for a `src` and for `<source>` children alike, and matches the HTML spec, where resource selection sets that state and then awaits a stable state.
- A pending video therefore reports `networkState 3`, `error null`, `currentSrc ""`.
- The rule as delivered ("`NETWORK_NO_SOURCE` always ready") would count that pending video as ready.

The signal that tells the two apart is **`currentSrc`**. The load algorithm resets it to `""`, and it is set as soon as a candidate is tried. Chrome reports:

| State | networkState | error | currentSrc |
|---|---|---|---|
| `src` pending | 3 | null | `""` |
| `src` failed | 3 | 4 | the URL |
| `<source>` children pending | 3 | null | `""` |
| `<source>` children, all failed | 3 | **null** | the last candidate tried |
| No source at all | 0 | null | `""` |

So I applied your point 4 ("`NETWORK_NO_SOURCE` is ready **when all candidate sources have failed**") literally: it counts only once a candidate has been tried. **Please confirm or reject this refinement.**

## 2. Implementation (`usePublicArrival.ts`, `videoReady` only)
```ts
const declaresSource = (v) => v.hasAttribute("src") || v.querySelector("source") !== null || v.srcObject != null;
const videoReady = (v) =>
  v.readyState >= HAVE_METADATA || v.error !== null
  || (v.networkState === NETWORK_NO_SOURCE && v.currentSrc !== "")       // every candidate tried and failed
  || (v.networkState === NETWORK_EMPTY && !declaresSource(v));           // genuinely no source
```
- **Point 1:** a declared source is a `src` attribute, `<source>` children or a `srcObject`.
  - An **empty** `src=""` counts as declared. Chrome then sets `error` almost at once (probe: error 4), so the video becomes ready through `error`.
- **Points 2 and 3:** `NETWORK_EMPTY` is ready only when no source is declared.
- **Point 4:** `NETWORK_NO_SOURCE` is ready only once a candidate has been tried (§1).
- **Unchanged:**
  - `loadedmetadata` handling;
  - the document-order rule;
  - the 5 s cap, so any case these rules miss still ends at 5 s (for example, `<source>` children whose `type` makes Chrome skip every candidate without trying one);
  - images, iframes, sampling, the renderer and 14d-1/14d-2 code.

## 3. Tests (`usePublicArrival.test.tsx`)
**Existing fixtures corrected.** No assertion changed.
- The "`NETWORK_EMPTY` (no source)" test rendered a video **with** a `src`, which is exactly the gap you identified. It now uses a video with no `src` and no `<source>` (harness placement `before-nosrc`).
- The "every `<source>` failed" test now also sets `currentSrc` to the last candidate, as Chrome does.

**New tests (6):**
1. `NETWORK_EMPTY` with a `src` → not ready; settling is still running at 1.5 s, and the cap ends it.
2. `NETWORK_EMPTY` with `<source>` children → the same.
3. `NETWORK_NO_SOURCE` with a `src` and `currentSrc ""` (pending) → the same.
4. `NETWORK_NO_SOURCE` with `<source>` children and `currentSrc ""` → the same.
5. `<source>` children going from pending to trying a candidate (`NETWORK_LOADING`) to every candidate failed → settling ends only after the last step.
6. `NETWORK_EMPTY` with a `src` → loading → `loadedmetadata`: a 250 px shift is corrected (scroll 1100 → 1350), and settling then ends.

The "`NETWORK_EMPTY` with no source: ready" case is the corrected existing test.

**Browser C6 (`t14d3c.mjs`):**
- **C6a**, Chrome's state model as an assertion: a pending `src` and pending `<source>` children each report `3` with `currentSrc ""` and no error. Afterwards, the failed `src` has `error` set, the failed `<source>` children report `3` with `error null` and `currentSrc` set, and a video with no source reports `0`.
- **C6b**, a hook-level check: Back to a page with a failing video (404, held 2 s) before the anchor. Settling is still running at 1.2 s. It ends about 100 ms after the failure (released at about 1250 ms, ended at about 1355 ms, error 4), well before the cap, and the anchor sits at its saved position (140 → 140).

**Can the hook be made to observe the pending state in Chrome? Not reliably.** Chrome leaves the pending state at the next task, and settling's first readiness check runs at least one frame plus 100 ms after the restored view commits. So the browser checks verify the states the rule depends on (C6a) and the failure path (C6b), while the pending state itself is guarded by unit tests 1–5. That is also why V7 passes in the browser.

## 4. Sensitivity (unit and browser reported separately)
| ID | Mutation | Unit/integration | Browser `t14d3c` (3 runs) |
|---|---|---|---|
| V1 | Videos excluded from readiness | 8 failures | **fails 3/3** (C5a: anchor 329 px off; C5b: about 555 ms; C6b) |
| V2 | No `loadedmetadata` trigger | 2 failures | not detected, 18/18 ×3 (the ResizeObserver corrects) |
| V3 | No document-order check | 2 failures | not run |
| V4 | `loadeddata` instead of `loadedmetadata` | 3 failures | not detected, 18/18 ×3 (the ResizeObserver corrects) |
| V5 | Both network-state clauses removed | 3 failures | not run |
| **V6** | `NETWORK_EMPTY` ready even with a declared source (the reviewed rule) | 3 failures (new tests 1, 2, 6) | not run |
| **V7** | `NETWORK_NO_SOURCE` ready before any candidate was tried | 3 failures (new tests 3, 4, 5) | **not detected, 18/18 ×3** (the pending window is unreachable in Chrome, §3) |

Every file was restored and verified byte-identical.

## 5. Changed files (vs the video ZIP: exactly these 5)
- `src/hooks/usePublicArrival.ts`: `declaresSource` and `videoReady`.
- `src/hooks/usePublicArrival.test.tsx`: harness placement `before-nosrc`, a `currentSrc` override, the 2 corrected fixtures and 6 new tests.
- `acceptance-14d-3/scripts/seed14d3c.mjs`: a "Broken clip" page.
- `acceptance-14d-3/scripts/t14d3c.mjs`: C6.
- `acceptance-14d-3/scripts/sensitivity_correction.py`: the V5 pattern updated, V6 and V7 added.

New evidence scripts: `probe-video-states.mjs` and `probe-video-states-2.mjs`. Diff: `networkstate.diff`.

## 6. 14c note
The YouTube `compute-pressure` console error stays documented (video report §5). In this round, 14c passed 76/76 on all 3 runs. The 14c test and the iframe behavior are unchanged.

## 7. Status
| Substep | Status |
|---|---|
| 14d-1, 14d-2 | Approved |
| 14d-3 findings 1–4 | Accepted |
| Native-video correction | Network-state correction delivered; awaiting review (including the `NETWORK_NO_SOURCE` refinement, §1) |
| 14e | Not authorized, not started |
