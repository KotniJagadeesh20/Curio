# Step 14e-2: Scenario A/B Acceptance — STOPPED (genuine defect found)

**Date:** 2026-11-19 · **Authorized scope:** 14e-2 only (plan rev. 2 §4) · **Baseline:** `Curio-main-step14e-1-f4.zip`, SHA-256 `7051d97491ee33320e495fd7fbd93b4a9b16829b05eaa05ff23d3d677d165ad4`

**Result: STOPPED before the three formal repetitions.** A development dry run of the new `t14e.mjs` found a deterministic, uncaught application error in the public reading view on the keyboard-only path (D1 below). Under the stop rule, no formal repetition, contract run, axe run or negative control was executed. **Your decision is needed.**

## 1. Baseline
- The working copy matched the closed 14e-1 ZIP exactly before work started: 1,047 files, 0 differences, no extra files.
- After the stop, every baseline file is still identical. The only additions are under `acceptance-14e/` (§5).
- No `src/`, backend, migration, configuration or original-script change.

## 2. D1 — genuine defect: `Uncaught (in promise) Canceled` after keyboard focus passes through a code block
**Observed** (`stop-evidence/t14e-dry-run-2-output.txt`, check `[H J1 keyboard] no unexpected console errors — pageerror: Canceled`):
- A logged-out reader on A3 ("Collections", which has a code block) presses **Tab**. Focus enters the read-only Monaco editor ("Editor content"), and the next Tab leaves it.
- When the reader then leaves the page (Enter on "Previous: The JVM"), Monaco is disposed and the page throws an **uncaught promise rejection**:
  ```
  Uncaught (in promise) Canceled: Canceled
    at cancel   (https://cdn.jsdelivr.net/npm/monaco-editor@0.55.1/min/vs/editor.api-CalNCsUg.js:6:10340)
    at dispose  (…/editor.api-CalNCsUg.js:6:10452)
    at ht       (…/editor.api-CalNCsUg.js:4:24681)
    at clear    (…/editor.api-CalNCsUg.js:4:25418)
    at dispose  (…)
  ```

**Reproduction** (separate fresh backend, `stop-evidence/`):

| Probe | Path | Result |
|---|---|---|
| `probe-canceled2` | Tab into the editor, Tab out to "Previous", Enter | **error 4/4 runs** (Tab trail: Share → 2 unlabelled buttons → "Editor content" → "Previous: The JVM") |
| `probe-canceled3` | mouse click into the editor (focused), then click Previous / a sidebar link | no error (2/2) |
| `probe-canceled3` | no editor focus, click Previous | no error |
| `probe-canceled` | leave A3 by click or keyboard after 300–5000 ms, without Tab through the editor | no error (6/6) |

**Why I classify it as a genuine defect:**
- It is the application's runtime, not the harness: the only input is Tab and Enter. It's deterministic (4/4) and reproduced on a separate fresh backend.
- It's not a superseded assertion: no later approved behaviour allows uncaught errors in public sessions.
- It's not an external flake: it's deterministic and not network-dependent. The code comes from the Monaco bundle the app loads from `cdn.jsdelivr.net`, but the app chooses to mount and unmount it.
- It breaks the approved R6 criterion "no unexpected console errors" in a public reading session.

**Impact as observed:** nothing visible. Navigation still works, and the keyboard pass reached every page (6/6 steps passed). The defect is the uncaught error itself, which only keyboard users trigger.

**Not done:** no fix and no investigation of the app code. Any correction needs its own plan and authorization. Monaco lazy-loading (Q9) is explicitly excluded from 14e.

## 3. Harness bug found and fixed in my new script (not a defect)
- **Dry-run failures:** "[R4] Back (POP) to A1: position restored ±5 px" and "[R4] Refresh … restored ±5 px", with `y=3493 saved=1200`.
- **Cause, from `probe-r4` and `probe-r4b`:** the app restored exactly what it saved. Playwright's `click()` on "Next: The JVM", at the bottom of A1, scrolls the link into view first, so the reader's last position really was 3493, the page bottom. The trace shows the only scroll during the Back arrival is `setScrollY(3493)` from `restore`, with the stored entry `y:3493`.
- **Fix in `t14e.mjs`:** leave A1 through the sticky sidebar link, which is visible at y=1200, so no scroll happens before navigation.
- The fix is **not yet verified by a run**, because the stop came first.

## 4. State of 14e-2 deliverables
| Item | State |
|---|---|
| `scripts/seed14e.mjs` | written; works (seed output in `stop-evidence/`) |
| `scripts/t14e.mjs` | written; dry run 2: **149/152** (D1 + the 2 R4 harness failures above, now fixed but unverified) |
| `scripts/contract14e.mjs` | **not written** (stopped) |
| `scripts/axe14e.mjs` | **not written** (stopped) |
| 3 formal repetitions | **not run** |
| 4 negative controls | **not run** |
| Gates | not rerun: no file outside `acceptance-14e/` changed |

**Dry-run results worth recording (informational, not formal evidence):**
- J1 and J2 (1280 and 360 px), R3 (logged out and as B) and the per-page/key-block assertions all passed. That includes the held-image aspect boxes, the iframe 16:9 box before and after loading, and the not-available 404s on network and DOM.
- The drawer hand-off and the keyboard navigation steps passed.
- Hygiene passed in every session except the keyboard one (D1).

**Observations, not classified:**
- **Two unlabelled buttons:** the keyboard Tab trail on A3 passes through two buttons with no accessible name, in the code block's header. The axe scan would report them; it hasn't been run.
- **Deviation from plan wording:** creators' usernames are set through the signup request's `username` field. `PUT /api/users/me/profile` has no username field, so it sets only the display name. That's recorded in `seed14e.mjs`.

## 5. Files added (all under `acceptance-14e/`)
- `scripts/seed14e.mjs`, `scripts/t14e.mjs`
- `14e-2/REPORT.md` (this file)
- `14e-2/stop-evidence/`:
  - probe scripts and their raw outputs;
  - the seed output and server PIDs;
  - the dry-run output and dry-run screenshots.

## 6. Decision needed
1. Do you accept D1 as a genuine defect? Its fix would be outside 14e: a separate correction plan.
2. How should 14e-2 continue? Options:
   - **(i)** pause 14e-2 until D1 is fixed under its own plan, then run the full 14e-2;
   - **(ii)** record D1 as a known open defect, and continue 14e-2 with the keyboard session's console-error check reported as a known failure rather than suppressed. All other assertions stay unchanged.

Until then, nothing further runs. 14e-3 is not started.
