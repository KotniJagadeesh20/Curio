# 14e-1 Failure Classification

## F1: S5 `13e/t3-media.mjs`, exit 1 (stopped the run)
**Observed:** `locator.waitFor: Timeout 30000ms exceeded … waiting for getByTestId('block-editor')` at `t3-media.mjs:6`, right after `page.goto(BASE + '/create/pages/586')` (`S5-t3-media.txt`). No checks ran.

**Diagnosis** (`diagnosis-t3/`, a separate fresh backend):

| State | Pages (ids) | `GET /api/pages/586` |
|---|---|---|
| Fresh backend, before any 13e script | 544 seeded pages, ids 1–544 | 404 |
| After `t1-templates` (17 PASS) and `t2-editor` (23 PASS), as in S5 | 565 pages, ids 1–565 | 404 |

- `/create/pages/586`, signed in as the admin, shows the app's **"404 Oops! Page not found"** (`create-pages-586.png` / `.txt`). That is the correct behavior for a page that doesn't exist.
- **The cause is a hardcoded id.** `t3-media.mjs` (lines 5 and 57) and `t4-regression.mjs` (lines 43, 49 and 94) hardcode **page 586**. Both also hardcode **collection 23** (`t3` line 66; `t4` lines 50 and 53).
- These ids existed only in the database of the original 13e session, where more content had been created before the scripts ran. **No 13e seed or script creates them**, and `acceptance-13e/REPORT.md` doesn't record the precondition.

**Classification: none of the three approved categories applies.**
1. *Superseded assertion?* No: no assertion was evaluated.
2. *External flake?* No: it is deterministic, and the same 404 appears on every fresh backend.
3. *Genuine defect?* No **application** defect was found. The app correctly reports a page that doesn't exist.

This is a **harness precondition gap in the original 13e scripts**: they can't run on a fresh backend. Following the stop rule, the run was stopped and nothing was changed:
- no script edited;
- no seed invented to reach id 586;
- `t4-regression.mjs` not run (it has the same dependency).

**Decision needed (not taken by me).** Options for the creator regression (AC3):
- **(a) Precondition seed in the runner; scripts unchanged.** Before S5, a documented 14e step creates admin-owned content until an editable block page has id 586 and a collection has id 23, reproducing the 13e environment. *Risk:* the ids' original content and kind are unknown. If t3/t4 assume specific content, failures there would be unclassifiable.
- **(b) Accept 13e's original evidence for t3/t4.** Record t3/t4 as not runnable on a fresh backend, and count S5 = t1 + t2 (40 checks, all passing) plus the original 13e results for media and regression. AC3 would then be partly historical evidence.
- **(c) Amended copies** of t3/t4 in `acceptance-14e/` that create their page and collection at runtime. This conflicts with Q-e4 (originals byte-identical) unless you approve it as an exception; the originals would stay unchanged next to the copies.

My recommendation is **(c) or (a)**, because they keep AC3 a live check rather than historical evidence. (c) is the more deterministic of the two. Either needs your approval.

## Observations (not failures)
- `S5-t1-templates.txt` ends with `FAILED ["503 POST …/api/modules/92/pages"]`. That is the script's failed-request **summary**, not a failed check. The 503 is the one t1 **injects on purpose** ("Injected 503 mid-run", 13e §1). All 17 checks pass, and the script exits 0.
- `S5-t2-editor.txt` ends with `FAILED []` (no failed requests). All 23 checks pass, and the script exits 0.
- **No superseded assertion and no external flake occurred in S1–S4.** In particular, the 14b check "'Start reading' opens the first page URL (14c placeholder expected)" **passed**. It checks the URL, which the real 14c viewer also satisfies. `t14c` passed 76/76, with no YouTube `compute-pressure` message in this run.

---
# Resumed S5 (approved C1 + runner process-safety correction)

**F1 resolved by C1.** The amended t3 and t4 resolve the collection and page that `t2-editor` created in the same fresh-backend run. They resolved collection 16 "Editor accept <n>" and page 565 "Page One" in runs s5r, s5r2 and s5r3, and collection 10 / page 545 in the separate diagnostic. The block editor opens, and every check runs.

**The runner now counts `FAIL  ` lines.** The 13e scripts print `FAIL  <check>` but always exit 0, so runner v1 would have reported a failed check as a pass. In v2 any `FAIL  ` line makes the step a failure. t1 and t2 had no `FAIL  ` lines in the earlier S5 run either: their only `FAIL`-prefixed lines are the `FAILED [...]` request summaries.

## F2: amended `t3-media`, "Cancel keeps the previous image" (FAIL, 12/13 pass)
- **Observed:** after the cancel, the preview `src` is a different `blob:` URL from the one before (`S5-t3-media-s5r*.txt`). It reproduced in s5r, s5r2 and s5r3.
- **Classification: superseded assertion.** The assertion compares blob-URL identity, but the preview remounts and creates a new object URL for the **same** asset. 13e named exactly this as a harness false failure (`acceptance-13e/REPORT.md` "Defects found": "the blob URL changing when the preview remounts for the same asset"). 13e decided the behavior with `x-cancel-pixel-check.mjs` and reported "Pass (pixel check)".
- **Current evidence** (`diagnosis-t3-cancel/`, a separate fresh backend with tracked PIDs; t2 23/23 there first):
  - I ran the 13e pixel check with the same C1 id resolution (`diff.txt`: only the id line changes; the original's SHA-256 is in `original-sha256.txt`).
  - **PASS:** the pixel color is `39,81,219` (blue) before the cancel, right after it, and after the held server request would have finished.
  - The app keeps the previous image.

## F3: amended `t4-regression`, "Existing page loads in block editor without spurious dirty state" (FAIL)
- **Observed:** `blocks=0, unsupported=0, status=Saved`. It reproduced in s5r2 and s5r3.
- **Classification: superseded assertion.** The first page of the seeded Kubernetes collection is a **legacy page** (it has never had blocks). The screenshot `screenshots-s5r3/S5-13e/13-existing-page.png` shows:
  - the legacy notice ("This is an older page…");
  - the "Start writing with blocks" button;
  - status **Saved**, with no spurious dirty state.
- 13e §6 reports exactly this ("Its legacy page shows the existing 'Start writing with blocks' conversion prompt, unchanged from Step 12"). The `blocks > 0` part of the assertion can't be true on a legacy page. The part of the check that matters, no spurious dirty state, holds (`status=Saved`).

## F4: amended `t4-regression`, "Public test collection — collection slug unknown" (FAIL)
- **Observed:** t4 gets the collection slug from `GET /api/me/collections`, which doesn't exist (404). The app's endpoint is `/api/collections/mine`. With no slug, the check fails (`S5-t4-regression-s5r*.txt`, `FAILED [... "404 GET …/api/me/collections"]`). The same wrong guess causes the 404s on `/api/creator/collections/{id}`; those are a response discarded by the script, not a check.
- **Classification: superseded assertion.** It's a harness defect in the original t4, documented in 13e §6: "404s from API paths my own regression script guessed wrongly (`/api/creator/...`, `/api/me/collections`; the app uses `/api/collections/...`)". It is not an app failure.
- **Coverage consequence, stated plainly:**
  - Because the slug is unknown, t4's block "Public page renders bold/italic/link/table header+caption" (lines 76–90) is **skipped, so no check line is printed**. The public rendering of t2's editor-made content therefore **was not verified by S5**.
  - In 13e it couldn't run either: `/@admin/<collection>` was then still the Step 14 placeholder.
  - Fixing the endpoint in the amended copy would go beyond the approved C1 change, so I didn't do it. The public rendering of rich text, tables and captions is covered by S3 (t14c 76/76 and t14d-series), on 14c/14d seed content.
  - Covering it with this t2→t4 chain needs a further decision.
- Page publish works: "Page publishes — PUBLISHED" passed.

## Not a failure
- The 503s and `ERR_ABORTED` in the `FAILED [...]` request summaries are the injected 503s and the deliberately cancelled upload.
- The `/admin-no-at/x` console 404 is the script's deliberate unknown route.

**No genuine application defect was found in resumed S5.**

## Run record
| Run (tag) | What happened |
|---|---|
| `aborted-s5r-attempt1/` | **My runner v2 bug:** the output dir was relative, so the backend log path broke after `cd`. The backend didn't start, and t1 ran against no API. Fixed: the dirs are now absolute, and an empty listener PID now aborts. Kept for the record. |
| `-s5r` | t1 17/17, t2 23/23, t3 12/13 (F2) → stopped and classified |
| `-s5r2` (`ALLOW=S5:t3-media.mjs`) | t1, t2 and t3 as before; t4 11/13 (F3, F4) → stopped and classified |
| `-s5r3` (`ALLOW=S5:t3-media.mjs,S5:t4-regression.mjs`) | the **complete fresh-backend S5**: t1 17/17, t2 23/23, t3 12/13, t4 11/13; same failures as before, nothing new |

---
# F4 correction run (`-s5f4`, approved: endpoint fix + one fresh S5)
- **F4 resolved.** The amended t4 now reads `/api/collections/mine`. Collection 16 resolved as `PUBLISHED editor-accept-14699`.
- **The two previously unverified checks executed and PASSED** (`S5-t4-regression-s5f4.txt`):
  - `PASS  Public route Public test collection renders (/@admin/editor-accept-14699)`
  - `PASS  Public page renders bold/italic/link/table header+caption — strong=1 em=1 a=1 th=1 caption=1 images=1`
- Screenshots `screenshots-s5f4/S5-13e/14-public-Public-test-collection.png` and `15-public-page.png`, taken logged out, show t2's editor-made content on the public page: "Moved heading"; **world**, *and*, ***more***; the link; the specials line; the H1–H3 table with the caption "Caption ✓ <b>"; and t3's image, captioned "Red square".
- **The remaining failures are the accepted F2 and F3, unchanged:**
  - t3 "Cancel keeps the previous image" (blob URL);
  - t4 "Existing page loads … " (`blocks=0`, legacy page, status Saved).

  No new failure. The `FAILED [...]` request lists contain only the injected 503s, the cancelled upload, and the two untouched `/api/creator/collections/{id}` 404s, whose responses are discarded, as approved.
- **Observation, not asserted by any check and not classified:** on the public page, t3's image shows as a **red-to-orange gradient**, while the uploaded `red.png` is solid red (220,40,40). No `src/components/public` file contains gradient styling. I didn't investigate further, because that's outside the authorized scope. I'm recording it for your review, not claiming it as a defect or dismissing it.
