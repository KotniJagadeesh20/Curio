# Step 14e-1: Combined Regression Report

**Date:** 2026-11-19 · **Authorized scope:** 14e-1 only (plan rev. 2 §4). **Result (after resumed S5, approved C1): all five stages ran on fresh backends.** S1–S4: 234/234. **Final S5 (§9, after the approved F4 correction): 65/67.** The 2 failures are the accepted F2 and F3. The previously skipped public-rendering checks executed and passed. No application defect. One unasserted observation (§9).

*Original run status (kept below):* **STOPPED at S5. Not complete.**
- The public regression (S1–S4) passes in full: **234/234 checks**.
- The creator regression (S5) stopped at `t3-media.mjs`, on a **harness precondition gap**: the original 13e scripts hardcode page 586 and collection 23, which don't exist on a fresh backend. **No application defect was found.** Your decision is needed (`classification.md`, F1).
- No 14e-2 or 14e-3 work.

## 1. Baseline (`../baseline.txt`)
| Check | Result |
|---|---|
| Approved ZIP | `~/Downloads/Curio-main-step14d-3-networkstate_2.zip` (your restored copy) |
| SHA-256 | `0828e1e2…3c44`, **matches the approved value** |
| Working copy vs ZIP | 841 files, **0 differences**, no extra files (excluding `node_modules`, `dist`, `backend/target`, `backend/data`, `*.tsbuildinfo` and `acceptance-14e/`) |
| After the run | all 841 baseline files are **still identical**: no `src/`, backend, configuration, `PLAN.md` or script change |
| Version control | not a git repository; the ZIP's SHA-256 identifies the source |

## 2. Script manifest and copy verification
- `../scripts/manifest.sha256` holds the SHA-256 of **19 original scripts, taken from the approved ZIP**:
  - 14a: `seed14a`, `t14a`;
  - 14b: `seed14b`, `t14b`, `t14b-stale`;
  - 14c/14d: `seed14c`, `seed14d3`, `seed14d3c`, `t14c`, `t14d1`, `t14d2`, `t14d3`, `t14d3c`;
  - 13e: `common`, `mkpng`, `t1-templates`, `t2-editor`, `t3-media`, `t4-regression`.
- The runner copied each script into the scratch run directory and verified it: **19/19 OK, no mismatch** (`copy-verification.txt`).

**Runtime inputs that are not scripts:**
- `tokens.json` is `seed14a`'s own stdout, as in 14a/14b.
- `red.png` and `blue.png` (120×80) were generated with 13e's own `mkpng.mjs` (SHA-256 prefixes `c7d45ead…` / `1816a71d…`). The scripts only require a decodable PNG.

## 3. Runner and stages (`../scripts/run-all.sh`)
- Each stage: a **fresh backend** (a new H2 in-memory instance, profile `h2`) and a fresh Vite on `--strictPort`; both are stopped after the stage.
- It stops at the first failing seed or script.
- Resuming after a classified failure means re-running the whole stage from a fresh backend with `ALLOW=<stage>:<script>`, so the seed state and the order are unchanged.
- Backend PIDs, seeds and outputs are in `runner.log`, `results.tsv` and `S*-*.txt`; backend logs are in `S*-backend.log`.

| Stage | Backend PID | Seeds | Script | Exit | Result |
|---|---|---|---|---|---|
| S1 | 50509 | `seed14a` | `t14a` | 0 | **26/26** |
| S2 | 50711 | `seed14a` (tokens), `seed14b` | `t14b` | 0 | **30/30** |
| | | | `t14b-stale` | 0 | **15/15** |
| S3 | 50950 | `seed14c`, `seed14d3` | `t14d3` | 0 | **28/28** |
| | | | `t14d1` | 0 | **14/14** |
| | | | `t14d2` | 0 | **27/27** |
| | | | `t14c` | 0 | **76/76** |
| S4 | 51503 | `seed14c`, `seed14d3`, `seed14d3c` | `t14d3c` | 0 | **18/18** |
| S5 | 51795 | none (the 13e scripts create their own content) | `t1-templates` | 0 | **17/17** (the listed 503 is injected on purpose) |
| | | | `t2-editor` | 0 | **23/23** |
| | | | `t3-media` | **1** | **stopped:** page 586 doesn't exist on a fresh backend, so the block editor never appears; no checks ran |
| | | | `t4-regression` | — | **not run** (stop rule; it has the same dependency) |

**Totals:** public S1–S4 **234/234**; creator S5 so far **40/40** (t1 + t2). t3/t4 are blocked.

## 4. Failure classification (`classification.md`)
- **F1 (`t3-media`):** none of the three approved categories applies.
  - It is not superseded, because no assertion ran.
  - It is not a flake: it is deterministic, and `diagnosis-t3/` reproduces it on a separate fresh backend (ids 1–544 seeded, 1–565 after t1/t2; `GET /api/pages/586` → 404; the app shows its correct "Page not found").
  - It is not an application defect: it's a precondition the original 13e scripts don't create.
- **Options for your decision:**
  - (a) a documented precondition seed in the runner, with the scripts unchanged;
  - (b) accept 13e's original t3/t4 evidence for AC3;
  - (c) amended copies that create their page/collection at runtime, as an approved exception to Q-e4.

  I recommend (c) or (a).
- **No superseded assertions and no external flakes occurred.**
  - The 14b check "'Start reading' opens the first page URL (14c placeholder expected)" **passed** on URL equality.
  - `t14c` showed no YouTube `compute-pressure` message in this run. That issue stays open and wasn't hidden.

## 5. Gates (`vitest-output.txt`, `tsc-output.txt`, `build-output.txt`)
| Gate | Result | Baseline |
|---|---|---|
| Vitest | **60 files, 1188 tests, all pass** · `act()` warnings: 6 | identical (approved ZIP's raw output: 60 / 1188) |
| TypeScript (app + node) | exit 0 | identical |
| Build | exit 0; **3 warnings, all baseline:** (1) Browserslist/caniuse-lite data 17 months old; (2) `[vite:css] @import must precede all other statements`; (3) `(!) Some chunks are larger than 500 kB after minification` | identical |
| ESLint | not run: no `src/` file changed | n/a |

## 6. Files added (only under `acceptance-14e/`)
- `baseline.txt`
- `scripts/manifest.sha256`
- `scripts/run-all.sh`
- `14e-1/`:
  - `REPORT.md`, `classification.md`
  - `runner.log`, `results.tsv`, `copy-verification.txt`
  - `S*-*.txt` (raw outputs) and `S*-backend.log` / `S*-vite.log`
  - `screenshots/`
  - `diagnosis-t3/` (separate-backend reproduction, the `/create/pages/586` screenshot, t1/t2 outputs)
  - `vitest-output.txt`, `tsc-output.txt`, `build-output.txt`

## 7. Status
| Item | Status |
|---|---|
| 14e-1 | S1–S4 pass; resumed S5 complete (see §8). **Awaiting your review.** |
| 14e-2, 14e-3 | Not authorized, not started |
| Open items | The YouTube `compute-pressure` error and the `MediaUrlResolver` key-order bug: both still open, both untouched |

## 8. Resumed S5 (approved: C1 + runner process-safety correction)
**Runner v2** (`scripts/run-all.sh`, SHA-256 `46c2df0f…e5ede1`; v1 kept as `run-all.v1.sh.bak` `efc74ecd…c3e1b`; diff in `runner-v1-to-v2.diff`):
- **Process safety.** There's no `pkill` and no killing by port. The runner tracks each launcher PID it starts, plus that launcher's descendants, and stops only those. It checks that the listener on 8080/8081 descends from its own launcher.
- **Port checks.** If 8080 or 8081 is occupied before a stage, the runner aborts (exit 4) and leaves the port alone. Stopped PIDs are logged, and ports 8080/8081 are confirmed free after every stage ("free: yes" in all runs).
- **Amended copies.** They are verified against `14e-1/amended/manifest.sha256` (3 files, OK), and the 19 originals against the original manifest (19/19 OK).
- **Failed checks count.** A `FAIL  ` line now marks a step as failed, because the 13e scripts exit 0 even when a check fails.

**Amended scripts** (`14e-1/amended/`, `CHANGES.md` has the full diffs and checksums):
- The only change is the id lookup. The scripts use the "Editor accept <n>" collection and "Page One" page that t2 created **in the same run**, read through `GET /api/collections/mine` and `GET /api/collections/{id}`. They fail loudly if there isn't exactly one match. No content is created.
- All `check(...)` lines are byte-identical to the originals (t3: 13, t4: 10).

**Final complete S5 run** (`-s5r3`, fresh backend pid 71467, order t1 → t2 → amended t3 → amended t4):
| Script | Result |
|---|---|
| t1-templates | **17/17** |
| t2-editor | **23/23** |
| t3-media (amended) | **12/13** — F2 superseded: blob-URL identity; the current pixel check **PASS** (`diagnosis-t3-cancel/`) |
| t4-regression (amended) | **11/13** — F3 superseded: legacy page, `blocks=0` by design, status Saved, screenshot `13-existing-page.png`. F4 superseded: the original script calls the wrong endpoint `/api/me/collections` (documented in 13e) |

**Coverage gap (F4), to be decided:** t4's public rich-text/table check (lines 76–90) is skipped because of that endpoint. So S5 does **not** verify that t2's editor-made content renders publicly. The public rendering of these block types is covered by S3 (t14c, t14d) with seeded content. Closing the gap would mean a further amendment to t4's endpoint, which needs approval.

**Gates:** not rerun. No file outside `acceptance-14e/` changed: the working copy still matches all 841 files of the approved ZIP, with 0 differences, after the resumed runs. The 19 originals still match their manifest.

Earlier failed attempt: `aborted-s5r-attempt1/`, caused by a relative-path bug in my runner v2 (no backend started). Fixed and documented in `classification.md`.

## 9. F4 correction and final S5 (`-s5f4`)
**Change:** the amended `t4-regression.mjs` line 58 calls `/api/me/collections` → `/api/collections/mine`. Nothing else changed: the `/api/creator/collections/{id}` calls are untouched, and `check(...)` lines are identical to the original. The original t4 still has SHA-256 `09a1c555…9454`, matching the manifest. The amended t4 has SHA-256 `205baa37…00ad`; `amended/manifest.sha256` and `CHANGES.md` are updated.

**Run:** one fresh backend (pid 77839), order t1 → t2 → amended t3 → amended t4. 19/19 original copies and 3/3 amended copies were verified, and ports were free after the run.

| Script | Result |
|---|---|
| t1-templates | 17/17 |
| t2-editor | 23/23 |
| t3-media (amended) | 12/13 (F2, accepted) |
| t4-regression (amended) | **13/14** (F3, accepted). **Public test collection: PASS. Public page bold/italic/link/table header+caption: PASS** (`strong=1 em=1 a=1 th=1 caption=1 images=1`) |
| **Total** | **65/67 executed; the 2 failures are the accepted F2/F3** |

*Count note:* t4 now prints 14 check lines instead of 13, because the previously skipped public-page check now executes. S5 total: 17+23+13+14 = 67 checks, 65 PASS.

**Evidence:** `S5-*-s5f4.txt`, `runner-s5f4.log`, `results-s5f4.tsv`, `copy-verification-s5f4.txt`, and `screenshots-s5f4/S5-13e/15-public-page.png` (logged-out public page showing t2's content and t3's image).

**Observation, unasserted:** the public page shows t3's image as a red-to-orange gradient, though the uploaded PNG is solid red. No check covers this. I did not investigate (out of scope), and I'm not classifying it.

**Baseline after the run:** 841/841 files identical to the approved ZIP. No change outside `acceptance-14e/`, so the gates were not rerun.
