# Step 14d-3: Review-Correction Round Report

**Date:** 2026-11-19 · **Scope:** the four review findings only. No redesign, no 14e work, no unrelated changes.
**Baseline:** the reviewed ZIP `Curio-main-step14d-3.zip`. The working copy was verified identical before starting.
**Stopped for review.**

## 0. Results at a glance
| Gate | Result | Raw output (in `acceptance-14d-3/correction/`) |
|---|---|---|
| Tests (`vitest run`) | **60 files, 1174 tests, all pass** (reviewed ZIP: 58 / 1145; +29 new, no existing assertion changed) | `vitest-output.txt` |
| Type-check (app + node) | exit 0 | `tsc-output.txt` |
| ESLint (the 5 touched files) | exit 0, no warnings | `eslint-output.txt` |
| Build | exit 0, **3 warnings, all pre-existing baseline:** (1) Browserslist/caniuse-lite data 17 months old; (2) `[vite:css] @import must precede all other statements` (Google Fonts); (3) `(!) Some chunks are larger than 500 kB after minification` | `build-output.txt` |
| `t14d3.mjs` (unchanged script) | **28/28** | `browser-14d3-output.txt`, `screenshots/` |
| `t14d3c.mjs` (new, correction checks C1–C4) | **9/9 on 3 consecutive runs** | `browser-14d3c-output.txt` |
| Regressions (scripts byte-identical to the approved copies) | 14c **76/76**, 14d-1 **14/14**, 14d-2 **27/27** | `regression-*-output.txt` |
| Correction sensitivity runs | 8 mutations, **every one caught**; every file restored and verified byte-identical | `../sensitivity-correction/` |

Test-output noise:
- The `act()` warnings are still the same 6, all from pre-14c tests.
- The new drawer test adds 5 more instances of Radix's existing "Missing `Description` … for {DialogContent}" console warning (6 before, 11 now). This comes from the existing Sheet markup, and I left the markup unchanged.

Fresh environment: in-memory H2, Vite and Chrome. Seeding order: `seed14c` → `seed14d3` → `t14d3` → `t14d1` → `t14d2` → `t14c` → `seed14d3c` → `t14d3c` ×3.

## 1. Changed files (vs the reviewed 14d-3 ZIP: exactly these 4)
| | File | Change |
|---|---|---|
| M | `src/pages/public/PageView.tsx` | `ContentsDrawer` is now **exported** (`function` → `export function`), plus one comment line saying it's exported for its focus test. No behavior change. |
| M | `src/hooks/usePublicArrival.test.tsx` | Additive only. The harness can now render an `<img>` or `<iframe>` before the anchors (`mediaBefore`, cleared in `beforeEach`). Two new `describe` blocks, 17 tests (§2, §5). No existing test or assertion changed. |
| A | `src/pages/public/ContentsDrawer.focus.test.tsx` | 4 tests (§3). |
| A | `src/components/public/PublicBlocks.frameSize.test.tsx` | 8 tests (§2). |

- **`usePublicArrival.ts` is unchanged** in this round, and so are `scrollStore`, `scrollAnchor`, the other views, all 14d-1/14d-2 code, the backend and the config.
- The rule against reading `window.scrollY` during navigation or cleanup is untouched.
- Diff: `correction.diff`. File list: `changed-files.txt`.

New acceptance files:
- `scripts/seed14d3c.mjs`: its own "Embeds" collection, seeded after all other scripts so nothing they count changes.
- `scripts/t14d3c.mjs`
- `scripts/sensitivity_correction.py`
- `scripts/probe-drawer.mjs` and `scripts/probe-drawer-warm.mjs`
- `correction/`
- `sensitivity-correction/`

## 2. Finding 1: settling readiness
**Decision: I kept the narrower condition, now documented and tested, because the proof holds for all iframe content the renderer produces.** One gap that is outside both the approved condition and the implemented one is listed at the end of this section for your decision.

**Final behavior (S2 as implemented).** Settling ends at the first of these:
- the 5 s cap;
- a user input;
- the layout has been stable for 500 ms **and** every `<img>` in the content that precedes the anchor in document order is `complete`.

Iframes are not waited on. Any resize that happens while settling is still corrected, whatever caused it.

**Why iframes can't move the anchor after settling:**
- An iframe's box never depends on its document, because iframes don't size to their content. Its box comes from our markup alone:
  - **Video embeds** (YouTube, youtu.be, Vimeo): `w-full aspect-video`, with no `height` attribute.
  - **HTML blocks**: an inline `height` from `htmlFrameHeight` (an explicit height, or 360 by default, clamped to 100–2000), with `sandbox=""`. Without `allow-scripts`, the document can't ask to be resized.
- These are the only iframe kinds the renderer produces. A video URL that can't be embedded becomes a `<video>` (see the open point below).
- Tests:
  - Unit: `PublicBlocks.frameSize.test.tsx` (8 tests) pins this markup for every kind and every height case.
  - Browser, C1: all 4 kinds are held for 2.5 s. Their boxes are already final before loading (641×360 for both videos, 641×300 and 641×360 for the HTML blocks), and they don't change when a 3000 px document arrives.
  - Browser, C2: a Back restore with all four iframes above the anchor and the embeds still held. Settling ends without waiting for them, the anchor is restored exactly (139.75 → 139.75), and it doesn't move when they load later.

**Why only images before the anchor matter.** The anchor's saved position is the top of its box. In the block flow of every anchor host, nothing that follows an element in document order can move that element's top:
- the page blocks, title and page-nav are a vertical stack;
- the collection header and outline are a vertical stack;
- Discover cards are grid rows. A later card in the same row can make the row taller but can't move its top.

The images that are left need no special handling:
- An image *inside* the anchor sits below the anchor's top.
- Card and collection covers sit in fixed `aspect-[16/9]` boxes.

Unit tests (new `describe` "settling readiness"):
- An incomplete image **before** the anchor holds settling past the stable time; its load is corrected and settling then ends.
- If that image never loads, settling ends at the 5 s cap.
- An incomplete image **after** the anchor doesn't hold settling.
- An iframe before the anchor doesn't hold settling, and a resize during settling is still corrected.

Sensitivity:
- **R1**: ignore images entirely → 2 failures.
- **R2**: wait for every image → 1 failure.
- **F1**: remove `aspect-video` → 3 unit failures, and C1 fails on all 3 browser runs (videos measured 641×152 before loading).

**Open point for your decision (not changed).** A `video` block whose URL can't be embedded renders `<video src controls class="w-full">` without dimensions. Before its metadata loads, Chrome sizes it with the default 2:1 ratio. When the metadata arrives, its height changes to the video's real ratio. If that video is above the anchor and its metadata arrives after settling ends, the anchor can move. This comes from reading the HTML spec and the markup; I haven't measured it, because that needs a decodable test video.
- **Neither condition covers this.** The approved condition ("images and iframes") doesn't include `<video>` either.
- **Possible fixes, each needing separate approval:** add "`<video>` before the anchor has `readyState ≥ 1`" to the readiness condition, or reserve the box in the renderer (e.g. `aspect-video`, which is 14c code).

## 3. Finding 2: sensitivity #9 (drawer focus)
**Root cause of the unreliable result:**
- In `PageView`, every drawer link to **another** page renders the loading state at once, because the new page isn't confirmed yet.
- That unmounts the drawer **and its "Contents" trigger** before Radix's deferred close auto-focus runs. Radix's focus call then has no attached trigger to land on.
- I recorded every `focusin` with the prevention removed: 9 of 9 runs across 3 scenarios (cold with a 0 ms API delay, cold with a 600 ms delay, warm cache) show `A:Two → H1:Two` and never "Contents" (`drawer-probe-mutated.txt`; scripts `probe-drawer*.mjs`).
- So a real browser navigation **can't** tell the correct code from the mutation. The single failure in the earlier run can't be reproduced, and it wasn't kept as evidence. I don't claim it as a detection.
- The prevention guards the case where the drawer stays mounted across the navigation. Nothing produces that case today, but any future cached or transitioned render would.

**Deterministic guard (new): `ContentsDrawer.focus.test.tsx`.**
- It uses the real Radix Sheet, with `ContentsDrawer` mounted in a router so the drawer **stays mounted** across the route change. That is the worst case for the hand-off.
- A capture-phase `focusin` recorder logs every focus transition from the link click on.
- Tests:
  1. A link to another page: "Contents" is never among the `focusin` events, and the trigger is not the active element.
  2. Control: Escape → exactly one "Contents" focus. This proves Radix's close auto-focus runs in this harness.
  3. Control: the current page's own link → "Contents" is focused (the default is kept).
  4. The flag is per close: after a navigation close, a later Escape still returns focus to "Contents".
- **Sensitivity #9 re-run, 10 times: the new test failed on all 10 runs** (`Tests 1 failed | 107 passed` each time). The existing PageView drawer tests passed on all 10.

**Browser (C4, `t14d3c.mjs`):** every `focusin` from the click on is recorded. A drawer link to another page gives `["A:Two","H1:Two"]`. The positive control (the current page's link) gives `["A:Two","BUTTON:Contents"]`, so the recorder does see Radix's auto-focus. Under mutation #9, C4 still passes on 3 of 3 runs. That is expected from the root cause above, and the browser check is **not** claimed as the regression guard for #9; the component test is.

**Intended behavior unchanged:** "Contents" must never receive focus after a drawer link to another page.

## 4. Finding 3: B6 reporting (corrected wording)
The original report's B6 line ("Unmount flush") overstated what B6 proves. Corrected:
- **B6 (browser) verifies `pointerdown` intent sampling.** A real pointer click right after a scroll writes the position before navigation, so Back restores it. B6 does **not** independently verify the unmount cleanup flush: with the flush removed (original sensitivity #6), B6 still passes, because the `pointerdown` sample already wrote the position.
- **The unmount cleanup flush is verified by unit tests only:**
  - "unmount (a different public view) flushes under the outgoing entry …";
  - "unmount refreshes the anchor offset while the outgoing DOM is attached";
  - "…but not when the anchor element is already detached".
  These navigate with no pointer event. Original sensitivity #6 (no unmount flush) makes 3 of them fail. The tests and that mutation are kept unchanged.
- Known limitation, kept as approved: a programmatic scroll followed by programmatic navigation in the same task isn't saved, because no scroll or pointer event fires and cleanup never reads `scrollY`.

## 5. Finding 4: native scroll anchoring cleanup
How it works:
- `settle()` saves `document.documentElement.style.overflowAnchor` (the inline value) and sets `none`.
- Settling has one exit function, `finish()`. It always puts the saved value back, then clears `stopSettling`.
- The exit paths:
  - completion (stable time or cap) → `finish(true)`;
  - user input → `finish(true)`;
  - a new arrival → `navigate()` calls `stopSettling()` → `finish(false)`;
  - unmount → `unmount()` calls `stopSettling()` → `finish(false)`.

Unit tests (new `describe` "overflow-anchor"):
- Each exit path is tested with a previous inline value of `"auto"` and of `""`, giving 12 cases. Each asserts `none` while settling and the previous value afterwards. The exit paths:
  - normal completion;
  - the 5 s cap;
  - wheel cancellation;
  - cancellation by a scroll the hook didn't cause;
  - a new arrival;
  - unmount (leaving to a non-public screen).
- One more test: a query-only change while settling is **not** an exit. The value stays `none` and is restored on completion.

Browser checks (C3, using a real inline `auto` on `<html>`):
- `none` during settling, then `auto` after completion.
- `none`, then `auto` after a wheel cancellation.

Sensitivity:
- **O1**: never put back → 13 failures.
- **O2**: put back as `""` → 7 failures.
- **O3**: a new arrival doesn't stop settling → 2 failures.
- **O4**: unmount doesn't stop settling → 2 failures.

## 6. Correction sensitivity runs (`sensitivity_correction.py`, outputs in `sensitivity-correction/`)
| ID | Mutation | Unit/integration | Browser `t14d3c` |
|---|---|---|---|
| 9 | Drawer: no `onCloseAutoFocus` prevention | **fails 10/10 runs** (1 test each) | passes 3/3 (expected, §3) |
| R1 | Readiness ignores images | 2 failures | not run |
| R2 | Readiness waits for every image | 1 failure | not run |
| O1 | `overflow-anchor` never put back | 13 failures | not run |
| O2 | Put back as `""` | 7 failures | not run |
| O3 | A new arrival doesn't stop settling | 2 failures | not run |
| O4 | Unmount doesn't stop settling | 2 failures | not run |
| F1 | Video embed loses `aspect-video` (14c file, mutated only for the run) | 3 failures | **C1 fails 3/3** |

Every file was restored, and each output file contains the line `Restored and byte-identical to the verified copy: True`.

## 7. Status
| Substep | Status |
|---|---|
| 14d-1 | Approved |
| 14d-2 | Approved |
| 14d-3 | Correction round delivered; awaiting review |
| 14e | Not authorized, not started |

Decisions requested:
1. Is the documented, narrower readiness condition (§2) acceptable?
2. Should the unsized `<video>` open point (§2) be handled separately?
