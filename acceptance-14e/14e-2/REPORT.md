# Step 14e-2 — Scenario A/B Acceptance: Resumed Under Option (ii)

**Date:** 2026-11-20 · **Authorization:** option (ii) was approved on 2026-11-20. D1 stays a genuine open defect and is not suppressed. All other assertions are unchanged. No application fix is made.
**Baseline:** `Curio-main-step14e-1-f4.zip` (SHA-256 `7051d974…5ad4`), plus the 14e-2 stop artifact `Curio-main-step14e-2-stop.zip`.

## Verdict
**14e-2 is NOT fully passing.** D1 reproduced in every keyboard session, every time. Every other formal assertion passed in all three repetitions. All four negative controls failed as required.

| Category | Result |
|---|---|
| **Passing** | t14e: 151 of 152 checks in each of the 3 fresh-backend repetitions · contract14e: 14/14 ×3 · axe14e: 22/22 scans completed ×3 (report-only) · R4 independently verified · negative controls (a)–(d): each failed as required |
| **Known failure** | **D1**, `[H J1 keyboard] no unexpected console errors — pageerror: Canceled`. It failed in runs 1, 2 and 3 and in the R4 verification run, so 4 of 4 keyboard sessions. It also showed up in the keyboard session of negative controls (a), (b) and (d). It is not filtered: t14e counts it as a failure and exits 1. The runner only labels it "KNOWN-FAILURE D1", and only when it is the single FAIL line with exactly that message. |
| **Incomplete coverage** | No 14e-2 item is left unrun. Carried-forward limits still apply: Chrome only, H2 only, the `MediaUrlResolver` key order, and the plan §7 limitations. Accessibility findings are report-only and have no remediation step (Q-e1). |

No new genuine defect was found, so there was no stop.

## 1. R4 harness correction: independent verification
`r4-verify/` ran on a fresh backend before any formal repetition. All 7 R4 checks passed. Back (POP) to A1 and Refresh both gave `y=1200 saved=1200`, with no focusin events. t14e scored 151/152, and the only failure was D1. The R4 results in the formal runs are therefore admitted as evidence. t14e.mjs is byte-identical to the stop artifact (`9e270fc8…3124`).

## 2. Three formal repetitions (fresh backend + new seed each)
| Run | Backend pid | seed | t14e | contract14e | axe14e |
|---|---|---|---|---|---|
| run-1 | 25502 | ok | 151/152 (D1) | 14/14 | 22/22 scans |
| run-2 | 26038 | ok | 151/152 (D1) | 14/14 | 22/22 scans |
| run-3 | 26480 | ok | 151/152 (D1) | 14/14 | 22/22 scans |

Each run directory holds `runner.log`, `results.tsv`, raw outputs, `seed14e.json`, screenshots, `axe14e.json`, `scripts.sha256`, and the backend and vite logs. Servers were stopped by tracked PID only, and ports 8080 and 8081 were free after every run.

## 3. Contract check (Q-e3)
`contract14e.mjs` checks every consumed field by name, type and nullability, including nested fields, on these endpoints:
- the Discover list (`?q=java`, `?q=travel`);
- categories;
- 3 collection details (including the unlisted one);
- 6 page views.

Blocks are checked by type: text, heading, code, image (including width and height), video, svg, callout and table. All eight types were covered. The field list and its sources are in the script header. It was derived from `src/lib/types.ts`, Discover, CollectionCard, CollectionView, CollectionOutline, publicNav/PageNav, PageView, PublicBlocks and publicBlocks.

INFO (not consumed, not a failure): the categories response carries `icon` and `position`.

## 4. Accessibility scan (Q-e1), report-only; identical in all 3 runs
The scan covers 11 views × 2 viewports. All 22 views were confirmed rendered before axe ran.

**Serious and critical findings** (exact selectors per view are in `run-n/axe14e.txt`):

| Rule | Impact | Where | Nodes |
|---|---|---|---|
| `button-name` | critical | every view, both viewports | 1 per view at 1280 px. 2 at 360 px: the header icon button and the `md:hidden` menu button. |
| `button-name` | critical | A3 (code block) | +2. These are the two unlabelled code-block header buttons noted in the stop report: 3 nodes at 1280 px, 4 at 360 px. |
| `link-name` | serious | every view, both viewports | 3: the footer GitHub, Twitter and LinkedIn icon links |

**Moderate findings:** 26 nodes per run, across `heading-order`, `landmark-complementary-is-top-level` and `page-has-heading-one` (the error state has no h1). **Minor findings:** 0.

No remediation was made, as Q-e1 requires.

## 5. Negative controls (each on its own fresh backend): all failed as required
| Control | Required outcome | Observed |
|---|---|---|
| (a) A-draft published via the API (`POST /api/pages/548/publish` → 200) | R3 must fail | R3 failed, logged out and as B: the A-draft page returned 200 and showed its title, "Generics draft" appeared in the outline, and Next pointed to the draft. J1's link-set checks also failed. 140/152. |
| (b) page view stubbed to 503 | J1 must fail on the error state | `[J1] A1 opens in the page viewer` FAILED: the error state "Service unavailable / Try again" appeared. 53/67. |
| (c) `modules[].pages[].slug` renamed to `pageSlug` | contract14e must fail | 3 collection-detail checks failed (`$.modules[0].pages[0].slug: missing`). 11/14. |
| (d) B1 image held, width/height stripped | the B1 aspect check must fail | The width/height check FAILED (`null`), and the aspect check FAILED (box 2×2, ratio 1 vs 1.778). 149/152. |

## 6. Harness changes in this resumption (acceptance files only)
- **New:** `scripts/contract14e.mjs`, `scripts/axe14e.mjs`, `scripts/run-14e2.sh`.
- **axe14e correction before the formal runs:** a dry run in the scratchpad, not formal evidence, detected the not-available view by the text `/not available/i`. The real heading is "This page isn't available", so 2 of 22 scans counted as not rendered. The detector now uses `data-testid="not-available"`. No assertion was relaxed. axe findings were report-only throughout.
- **Unchanged:** seed14e.mjs and t14e.mjs, byte-identical to the stop artifact, and every original script.
- No change to `src/`, the backend, configuration or `package.json`. playwright-core 1.48.2 and axe-core 4.10.2 are installed in the scratchpad only.

**Hashes:**
```
3ad4c7a8079ed9fb80fd2b37195f175521872389dd3250b2938ca73b98acf6c0  seed14e.mjs
9e270fc82f4a06d814cf32a2b0209ac0f9df3e43d596990e51b4e94d002d3124  t14e.mjs
ad55aee3108ca898a89ccec8758d77db0a56d8d514a4c5bd6308787f82423397  contract14e.mjs
c7726304bb59fbeb9e4059b5462cf75fb399a0b3af261ebeac0cbb2e33a1aa99  axe14e.mjs
66422dea355090ac9af5aba6d13b957b415c8dff819ebc8faf5ef13a9c518ab9  run-14e2.sh
```

## 7. Open items handed to the reviewer
1. **D1** (open, genuine) needs its own correction plan.
2. The axe findings above: the `button-name` items include the code-block header buttons. No remediation step is created automatically.
3. Carried forward: `MediaUrlResolver` key order, the public image gradient, YouTube compute-pressure.

14e-3 is not started.
