# A11Y Correction Report: Accessible Names for Seven Controls

**Date:** 2026-11-23
**Plan:** `Curio-stepA11Y-plan.md` rev. 2, SHA-256 `850261a72b95602bff285b039b29a26ca882e414fb511f789646ce92ddf4e272`
**Authorization:** "check the Curio-stepA11Y-plan.md and continue", given after the D1 close. It was taken as authorization for this correction only.
**Code baseline:** the accepted D1 artifact `Curio-main-stepD1-r2.zip` (`66e1869d…8d21`). The three source files were extracted from that ZIP, and their hashes match the pre-change working copy (`outputs/gates/source-at-baseline.sha256`):
- `CodeEditor.tsx` `1af2f9bc…`
- `Navbar.tsx` `445c0471…`
- `Footer.tsx` `058216b2…`

**Axe baseline:** `acceptance-14e/14e-2/run-{1,2,3}/axe14e.json`, as specified in plan §4.

**Not touched:**
- 14e-3, D1 F2 and F3;
- the Reset behaviour, which still blanks read-only code;
- the carried-forward observations;
- the moderate axe findings.

## 1. Changes
The full diff is in `outputs/source.diff`: 40 changed lines in 3 files.

| # | Control | File | Change |
|---|---|---|---|
| 1 | Code block Copy | `CodeEditor.tsx` | `aria-label={copied ? "Copied" : "Copy code"}` |
| 2 | Code block Reset | `CodeEditor.tsx` | `aria-label="Reset code"`. Still visible; its behaviour is unchanged. |
| 3 | Theme toggle | `Navbar.tsx` | `aria-label`: "Switch to light theme" in dark mode, "Switch to dark theme" in light mode |
| 4 | Mobile menu button | `Navbar.tsx` | `aria-label` "Open menu" / "Close menu", plus `aria-expanded={isOpen}` and `aria-controls="mobile-nav-panel"` |
| 5–7 | Footer GitHub / Twitter / LinkedIn | `Footer.tsx` | `aria-label` "GitHub", "Twitter", "LinkedIn" |
| all | The icons inside these controls | all three files | `aria-hidden="true"` |

**Stable panel (plan §2):** `Navbar.tsx` wraps the existing `AnimatePresence` panel in `<div id="mobile-nav-panel" className="md:hidden" hidden={!isOpen && !panelMounted}>`.
- `panelMounted` becomes true when the menu opens (in a `useEffect` on `isOpen`).
- It becomes false in `AnimatePresence`'s `onExitComplete`.
- As a result, the wrapper is hidden only **after** the closing animation finishes, so the visible collapse is unchanged.

**Deviation from the plan text (disclosed):** plan §1 says lucide icons "already render `aria-hidden="true"`". In lucide-react **0.462.0** they do not; the first unit run showed it. The plan also says "the icons themselves get `aria-hidden`", so the attribute is now set explicitly on the 11 icons inside the seven controls. No other icons were changed.

**Changed files (complete list):**
| File | Kind |
|---|---|
| `src/components/CodeEditor.tsx` | source |
| `src/components/Navbar.tsx` | source |
| `src/components/Footer.tsx` | source |
| `src/components/CodeEditor.test.tsx` | test, extended: 1 new test. The D1 tests are unchanged. |
| `src/components/Navbar.test.tsx` | test, extended: 3 new tests. **Existing setup changed (disclosed):** the fixed `useTheme` mock became a stateful one, with the initial theme defaulting to `"light"` as before, so the toggle's name can flip. The 3 existing tests and their assertions are unchanged and pass. |
| `src/components/Footer.test.tsx` | test, new: 3 tests |
| `acceptance-a11y/**` | evidence |

**Pre-change search (plan §5):** no existing unit test or acceptance script finds these controls by an empty name or by index.
- The only `name: 'Copy'` lookup is in t14d2 (`getByRole('button', { name: 'Copy' })`, a substring match). It runs on `/@admin/lisbon/day-one/arrival`, which has no code block, so it cannot also match "Copy code".
- t14d2 passed in the regression run below.

## 2. Unit evidence (old code vs new code)
| Run | Result |
|---|---|
| New and extended test files against the **D1-r2 sources** (`outputs/gates/unit-new-tests-on-OLD-code.txt`) | **7 failed**, 5 passed. All 7 new tests fail on missing names, `aria-expanded`/panel or `aria-hidden`. The 5 passes are the pre-existing Navbar ×3 and D1 CodeEditor ×2 tests. |
| Same files, **fixed code** (`unit-new-tests-on-NEW-code.txt`) | **12/12 passed** |

## 3. Gates
### Static
| Gate | Result |
|---|---|
| vitest, full suite | **62 files / 1197 tests passed**. The D1 baseline was 61 / 1190; the difference is +1 file and +7 tests. |
| `tsc --noEmit -p tsconfig.app.json` | clean |
| ESLint on the changed files | clean |
| ESLint, whole repository | 5 errors and 9 warnings, **identical to the D1 baseline list**, none in changed files (`outputs/gates/eslint.txt`) |
| `vite build` | OK; 3 warnings, all on the baseline list: Browserslist out of date, CSS `@import` order, chunks over 500 kB |

### Browser (each on a fresh H2 backend and Vite, approved runners, scripts unchanged)
| Gate | Runner | Result |
|---|---|---|
| t14e ×3 | `run-14e2.sh rep` | **152/152, 152/152, 152/152** |
| contract14e ×3 | same | **14/14 ×3** |
| axe14e ×3 | same | **22/22 scans performed ×3** (all rendered) |
| 14a (S1: t14a) | `run-all.sh S1` | 26/26 (`S1-t14a.txt`: `TOTAL 26/26 passed`) |
| 14c / 14d-3 (S3: t14d3, t14d1, t14d2, t14c) | `run-all.sh S3` | t14d3 28/28, t14d1 14/14, t14d2 27/27, t14c 76/76 (`outputs/regression/S3-*.txt`). *Corrected in r2: r1 listed these totals in the wrong order.* t14c passed; the YouTube compute-pressure flake did not occur this time. |

### Axe comparison with 14e-2 (`outputs/axe-comparison.txt`, `scripts/compare-axe.py`; axe-core 4.10.2 on both sides)
| | 14e-2 baseline, each of 3 runs | A11Y, each of 3 runs |
|---|---|---|
| Scans | 22 | 22 |
| `button-name` (critical) | 37 nodes | **0** |
| `link-name` (serious) | 66 nodes | **0** |
| Moderate | 26 nodes: `heading-order`, `landmark-complementary-is-top-level`, `page-has-heading-one` | **26 nodes. The (view, viewport, rule) node counts are identical to the baseline.** |
| Minor | 0 | 0 |
| New rules | — | **none** |

There was no change to any other finding, neither a regression nor an improvement.

## 4. Mobile menu wrapper verification (reviewer's points; `scripts/tmenu.mjs`, 360 px, logged out, `/discover` and `/`)
**New code** (`outputs/tmenu-new/tmenu.txt`): **10/10 passed**.

| Point | Result on both routes |
|---|---|
| Hidden after closing | Closed at load: `#mobile-nav-panel` exists, has `[hidden]`, height 0. After a close, once the animation finishes, it again has `[hidden]` and height 0, and it is the **same element** throughout. |
| Not exposed to assistive tech when closed | The accessibility snapshot rooted at the panel contains **0 links**, both at load and after closing |
| `aria-expanded` changes at once | Read straight after the click: `"true"` on open and `"false"` on close. The label also flips to "Close menu" / "Open menu". |
| Animation kept | 80 ms into closing, the panel is still visible: not hidden, height about 333 px, shrinking from 515 px. |
| Overflow and layout at 360 px | `scrollWidth` = `clientWidth` = 360 when closed, open and after closing. After a full open/close cycle, the header height (82 px) and content position are the same as before. |
| No errors | No uncaught errors |

**Closed-state geometry, old vs new:** the three D1-r2 source files were swapped in temporarily, measured with `tmenu.mjs --geometry-only`, then restored. The hashes were re-checked afterwards: `db59c9b6…`, `1e989c52…`, `39d25534…`. Old and new both give `{"scrollW":360,"clientW":360,"headerH":82,"contentTop":0}` on `/discover` and `/` (`outputs/tmenu-old-geometry/`), so the closed wrapper adds **no layout shift**.

## 5. Acceptance criteria (plan §4)
| # | Criterion | Status |
|---|---|---|
| 1 | `button-name` and `link-name` at 0 nodes in every view at 1280 and 360 px, in all 3 runs | **Met** |
| 2 | Every other axe finding unchanged: moderate 26, minor 0, no new rule | **Met**: identical per view, viewport and rule |
| 3 | All 22 scans performed in each run | **Met** |
| 4 | Unit baseline plus new tests pass; tsc, lint and build pass with every warning listed | **Met** |
| 5 | t14e, t14c and 14a Discover green | **Met**: t14e is 152/152 with D1 already fixed, and the rest of S3 also passed |
| 6 | Only the 3 source files, their tests and `acceptance-a11y/` change | **Met** |

## 6. Evidence layout and residuals
**Evidence layout:**
- `outputs/run-{1,2,3}/`: t14e, contract14e and axe14e outputs (txt and json), with screenshots and logs
- `outputs/regression/`: S1 and S3
- `outputs/tmenu-*`: the mobile menu checks
- `outputs/gates/`: static gates
- `outputs/source.diff`
- `outputs/changed-files.sha256`
- `scripts/` with `manifest.sha256`

**Two new verification scripts (disclosed):**
- `tmenu.mjs` and `compare-axe.py` are new.
- `run-a11y.sh` is derived from `acceptance-d1/scripts/run-d1.sh`, with only the modes changed.
- `axe14e.mjs`, `t14e.mjs`, `contract14e.mjs`, `run-14e2.sh` and `run-all.sh` were used unchanged.

**Residuals, untouched:**
- the read-only Reset blanks the code;
- the moderate axe findings;
- the `MediaUrlResolver` key-order bug;
- the YouTube compute-pressure message (not seen in this run);
- the public image gradient.

**Next step:** stopped here for review.
