# D1 F1 Implementation Report

**Date:** 2026-11-23
**Authorization:** F1 implementation under plan rev. 3 (`Curio-stepD1-plan.md`, SHA-256 `3b5412d6…60d4`), with two approved adjustments:
- editor identification by `getContainerDomNode()` containment plus model-text match, with exactly one match required;
- the revised O2/O3/O4 mapping, decided after the pre-flight.

**Out of scope, not touched:** F2, F3, the accessibility correction and 14e-3.

**Baseline:** the repository as it stood before this step. The accepted 14e-2 ZIP is no longer on disk, so **no repository-to-ZIP checksum match is claimed**. The pre-fix `src/components/CodeEditor.tsx` hashed `71434d8f…df026` (`outputs/scripts-at-baseline.sha256`). The new unit test was later run against a byte-identical restore of that file (same hash) to obtain its old-code result.

## 1. The change
`src/components/CodeEditor.tsx`, in the Monaco `options` object:
```tsx
...(isReadOnly ? { occurrencesHighlight: "off" as const } : {}),
```
There is also a three-line comment naming the cause.

What this does:
- Read-only editors get the documented option `occurrencesHighlight: "off"`. These are public code blocks, the creator Preview and the legacy `TopicPage`.
- Editable editors get **no key at all**, so Monaco's default stays in place. The only editable one is `/problem/:slug`.
- There is no lifecycle change, no use of Monaco internals and no error suppression.

Phase 1 identified the cause: the `WordHighlighter` `Delayer(50)` is triggered without being awaited on `onDidFocusEditorText` and `onDidChangeCursorPosition`. If the model is disposed inside that 50 ms window, its promise rejects with `Canceled` (plan §6a).

**Changed files (complete list):**
| File | Change |
|---|---|
| `src/components/CodeEditor.tsx` | F1 (4 added lines) |
| `src/components/CodeEditor.test.tsx` | new: 2 unit tests (option is `"off"` when read-only; key absent when editable) |
| `acceptance-d1/**` | new: scripts, raw outputs, this report |

## 2. Evidence classes
| Class | Where | Used as acceptance evidence? |
|---|---|---|
| Scratch probe (Phase 1) | `~/Downloads/Curio-D1-phase1-evidence/` | **No.** It motivated the fix. |
| Plan-stage td1 (the original 10 checks, old code) | `outputs/plan-stage-td1-original-on-old-code/` | Earlier record only |
| Pre-flight (old code) | `outputs/preflight/` | Gate: API available and editors identified; it found the creator-edit mismatch |
| **Formal baseline (old code)** | `outputs/baseline-*` | **Yes** |
| **Formal post-implementation (fixed code)** | `outputs/post-*`, `outputs/gates/` | **Yes** |

Every browser run used a fresh H2 in-memory backend seeded with `seed14e`, through `scripts/run-d1.sh`. That runner follows the approved 14e-1 v2 pattern: it stops only the PIDs it started and never uses pkill. The scripts were byte-identical between the formal baseline and the post-implementation runs (`scripts-at-baseline.sha256` matches `scripts/manifest.sha256` for `td1.mjs`, `td1-creator.mjs` and `run-d1.sh`).

## 3. Pre-flight (old code): 3/4 checks passed, and the run was stopped as required
| Target | API readable | Editors | Unique match | readOnly | occurrencesHighlight |
|---|---|---|---|---|---|
| Public A3 | yes | 1 | 1 | true | singleFile |
| Creator edit mode | n/a | **0** (code is edited in a `<textarea aria-label="Code">`) | – | – | – |
| Creator Preview | yes | 1 | 1 | true | singleFile |
| `/problem/two-sum` | yes | 1 | 1 | false | singleFile |

The reviewer then approved the revised mapping:
- O2 and O3 check `/problem/two-sum`;
- O4 (new) checks the creator Preview;
- creator editing is covered by 13e t2-editor.

## 4. Scripts
| Script | SHA-256 | Notes |
|---|---|---|
| `td1.mjs` | `c478cdc5…8965f` | **Amended (disclosed).** The original 10 checks (T1 ×4, T3 ×2, T4 ×2, T2 ×2) are unchanged. Added: T5 fast mouse with zero dwell ×4, and O1. 15 checks in total. |
| `td1-creator.mjs` | `359a4c42…ec7b1` | New. Five checks: O2; O3; no errors on `/problem`; O4; no errors on the creator editor and Preview. |
| `run-d1.sh` | `4665bcb1…d2669` | Runner modes: preflight, td1, td1-creator, t2-editor, t14e. |
| `preflight-d1.mjs` | `184585e4…9dfb8` | Pre-flight only. |
| `t14e.mjs` (from `acceptance-14e/scripts`, unmodified) | `9e270fc8…acf6c0` | Same hash as the 14e-2 record (`acceptance-14e/14e-2/new-scripts.sha256`). |
| 13e `t2-editor.mjs` / `common.mjs` (unmodified) | `3dfa44ca…5a225` / `5c0ab419…0d8f8` | |

**Two assertions beyond the approved list (disclosed):** `td1-creator` also checks for no uncaught or console errors on `/problem/two-sum` and on the creator Preview. They serve the stop condition "any new error appears". They passed on both the old and the new code.

## 5. Results
### Browser gates
| Gate | Formal baseline (old code) | Expected | Post-implementation (fixed code) |
|---|---|---|---|
| td1 T1 keyboard, zero dwell ×4 | FAIL 4/4 (`Canceled`) | fail | **PASS 4/4** in each of 3 runs |
| td1 T3 direct load ×2 | FAIL 2/2 | fail | **PASS 2/2** ×3 |
| td1 T5 fast mouse, zero dwell ×4 | FAIL 4/4 (`Canceled`) | fail | **PASS 4/4** ×3 |
| td1 O1 public option | FAIL (`"singleFile"`) | fail | **PASS** (`"off"`) ×3 |
| td1 T4 dwell ×2 + T2 mouse ×2 (controls) | PASS 4/4 | pass | PASS 4/4 ×3 |
| **td1 total** | **4/15** (11 failures, exactly as expected) | 4/15 | **15/15, 15/15, 15/15** (3 fresh backends) |
| td1-creator O2 `/problem/two-sum` option | PASS; recorded `"singleFile"` (`o2-baseline.json`), readOnly false | pass, record | **PASS**: still `"singleFile"`, readOnly false |
| td1-creator O3 typing changes the model | PASS | pass | **PASS** |
| td1-creator, no errors on `/problem` | PASS | pass | PASS |
| td1-creator O4 creator Preview `"off"` | FAIL (`"singleFile"`, readOnly true) | fail | **PASS** (`"off"`, readOnly true) |
| td1-creator, no errors on the creator editor and Preview | PASS | pass | PASS |
| **td1-creator total** | **4/5** (1 failure, O4, as expected) | 4/5 | **5/5** |
| **Combined** | **8/20 passed, 12 failed, all as expected** | | **20/20 unique checks passed; 50/50 total executions passed** (td1 15/15 ×3 plus td1-creator 5/5) |
| 13e t2-editor (creator regression, textarea editor) | 23 PASS, `FAILED []`, `ERRORS []` | green | **23 PASS, `FAILED []`, `ERRORS []`** |
| t14e (byte-identical) | 151/152; the only failure is `[H J1 keyboard] no unexpected console errors — pageerror: Canceled` (known D1) | 151/152 | **152/152**; the J1 keyboard console check **passes**, with no allowlist or filter |

No post-implementation output contains `Canceled`.

### Static gates (fixed code)
| Gate | Result |
|---|---|
| Unit, new test file only, against the **old** `CodeEditor.tsx` | 1 failed, 1 passed: the read-only `"off"` test fails as required (`outputs/gates/unit-new-test-on-OLD-code.txt`) |
| Unit, full suite | **61 files / 1190 tests passed**. The baseline was 60 / 1188; the difference is the new 1 file / 2 tests. |
| `tsc --noEmit -p tsconfig.app.json` | clean, exit 0 |
| ESLint on the two changed files | clean |
| ESLint, whole repository | 5 errors and 9 warnings, **all pre-existing and none in changed files** (listed below) |
| `vite build` | OK; three warnings, all on the pre-existing baseline list (listed below) |

**ESLint errors (pre-existing):**
- `legacy-mock-data/scripts/generate-seed.ts` 10:22 and 62:12: `no-explicit-any`
- `src/components/ui/command.tsx` 24:11: `no-empty-object-type`
- `src/components/ui/textarea.tsx` 5:18: `no-empty-object-type`
- `tailwind.config.ts` 131:13: `no-require-imports`

**ESLint warnings (pre-existing; all are `react-refresh/only-export-components`):**
- `ThemeProvider.tsx` 39:14
- `ui/badge.tsx` 29:17
- `ui/button.tsx` 47:18
- `ui/form.tsx` 129:10
- `ui/navigation-menu.tsx` 111:3
- `ui/sidebar.tsx` 636:3
- `ui/sonner.tsx` 27:19
- `ui/toggle.tsx` 37:18
- `context/AuthContext.tsx` 66:17

**Build warnings (each on the baseline list):**
1. Browserslist: caniuse-lite is 17 months old.
2. `[vite:css] @import must precede all other statements` (the Google Fonts import).
3. Some chunks are larger than 500 kB after minification.

## 6. Acceptance criteria (rev. 3 §6, with the approved mapping)
| # | Criterion | Status |
|---|---|---|
| 1 | Formal baseline fails exactly T1, T3, T5 and O1 in td1, and O4 in td1-creator; O2's value is recorded | **Met** (11/15 and 1/5 failures; O2 = `"singleFile"`) |
| 2 | td1 15/15 on 3 fresh backends; O2 equals the baseline; O3 and O4 pass | **Met** |
| 3 | t14e 152/152 with no harness change, allowlist or filter | **Met** |
| 4 | Unit (including the new test), tsc, lint and build gates pass; 13e t2-editor green | **Met.** Lint is at the pre-existing baseline, with no new findings. |
| 5 | Only `CodeEditor.tsx`, its unit test and `acceptance-d1/` change | **Met** |
| 6 | The owner and the option are quoted, and every result is labelled by evidence class | **Met** (§1, §2, §5) |

## 7. Notes and residuals
- **Visible change for readers:** read-only code blocks no longer highlight other occurrences of the word at the caret. This affects public pages, the creator Preview and the legacy `TopicPage`.
- **Latent window in editable editors:** the same un-awaited `Delayer` window still exists in editable editors (`/problem/:slug`), which keep Monaco's default. That is out of D1's public scope and was not observed in O2 or O3.
- **Not addressed, carried forward unchanged:**
  - axe `button-name` / `link-name` findings (A11Y plan, not authorized);
  - the YouTube compute-pressure console message;
  - the `MediaUrlResolver` key-order bug;
  - the public image gradient observation;
  - the read-only `CodeEditor` Reset button blanking the code.
- **Next step:** stopped here for review. The accessibility correction, F2, F3 and 14e-3 are not started.
