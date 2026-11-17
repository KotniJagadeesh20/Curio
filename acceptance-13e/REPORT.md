# Step 13e – Browser Acceptance Report

**Date:** 2026-11-17 · **Result: PASS. No defects found in Steps 13a–13d. No source, backend or migration changes.**

## Environment
- Backend: `mvn spring-boot:run -Dspring-boot.run.profiles=h2` (H2, local disk media storage), port 8081
- Frontend: Vite dev server, port 8080 (proxies `/api`)
- Browser: Google Chrome (installed), headless, driven by `playwright-core@1.48.2` (installed in a scratch directory, **not** added to the project)
- Viewports: 1280×900 desktop; 360×780 for the narrow-screen checks
- Scripts: `acceptance-13e/scripts/` (`t1`–`t4` are the suites; the `x-*` files are the focused re-checks described below). Screenshots: `acceptance-13e/screenshots/`.

## 1. Template workflow: PASS
| Check | Result |
|---|---|
| Picker shows 5 templates (Blank, Programming Tutorial, Travel Guide, Recipe, Personal Experience) | Pass |
| Real **Tab** lands on the selected radio; one more Tab leaves the group; **Shift+Tab** returns to the selected radio | Pass |
| Exactly one radio has `tabIndex=0`, and it follows the selection | Pass |
| **ArrowRight/ArrowDown** move focus *and* selection through all options; the last option wraps to the first | Pass |
| **Space** selects the focused radio | Pass |
| Each template creates its collection with the right category (Personal Experience, Programming, Food & Recipes, Travel) and the right page count (4/6/4/6) | Pass (screens 02-*) |
| Double-clicking "Create from template" makes no duplicate collection | Pass |
| Blank template: one request, then an empty collection | Pass |
| Injected 503 mid-run: alert names the failed step, progress is kept ("3 of 9 created"), picker hidden | Pass (03) |
| **Retry remaining** finishes the run with exactly the template structure (6 pages, no duplicates) and opens the editor | Pass (12) |

**Note on keyboard testing (test artifact, not an app defect):** Playwright's `keyboard.press` releases a key in 0 ms. Radix moves roving focus inside a `setTimeout` and selects only while the arrow key is still held. With `press`, focus moved but selection did not. With a 60 ms hold (`keyboard.down` → wait → `up`), which is realistic for a person, selection follows focus. Event trace: `scripts/x-radix-key-hold.mjs`. This is stock Radix behavior, and real key presses work.

**Observation (not changed):** after a partial failure, Escape or the close button dismisses the dialog. The partially created collection stays as a draft in the list, as the alert text says, but the in-dialog "Retry remaining" is gone.

## 2. Rich-text editor: PASS
| Check | Result |
|---|---|
| Cmd+B on a selection → `**world**`; the selection stays on the formatted text | Pass |
| The Italic toolbar button keeps the textarea selection (`_and_`) | Pass |
| Combined bold and italic → `**_more_**` | Pass |
| Cmd+K with no selection inserts `[link text](https://)` with the address selected; typing replaces it | Pass |
| Empty bold inserts `**bold text**` with the placeholder selected; typing replaces it | Pass |
| Special characters `* _ [ ] < > & " ' \` ~ é 中文 😀` across a multiline selection: bolded line by line, markers escaped | Pass (05) |
| Stored `doc`: runs and the href `https://example.com/a_(b)` are exact; the `text` projection is correct | Pass (checked through the API) |

Re-serialization differences after reload, both by design: (a) a single line break inside a paragraph comes back as a space. This is the documented 13c rule (`src/lib/richText.ts:192`; the editor hint says "Blank line = new paragraph"). (b) `(`/`)` inside a link URL come back backslash-escaped in the source, but the stored href is unchanged.

## 3. Table editor: PASS
New tables start with the header row on. Add row, add column, remove row and remove column all work. The header toggle works. The caption takes `✓ <b>` literally. At 360 px the table scrolls inside its own container (scrollWidth 440 > clientWidth 302) and the page has no horizontal overflow (07).

## 4. Autosave: PASS
Autosave reaches "Saved" in about 2 s. After a browser refresh, the block order (heading moved above text and table), the rich text and its formatting, the table cells, header and caption, and the image block all persist. Status shows "Saved" after reload, with no false "unsaved changes".

## 5. Media: PASS
| Check | Result |
|---|---|
| Upload → authenticated blob preview | Pass |
| Replace → new preview; button reads "Replace image" | Pass |
| The link field is locked during upload and unlocked after cancel | Pass (08) |
| Cancel keeps the previous image, also after the held server request completes (pixel check, `x-cancel-pixel-check.mjs`) | Pass |
| Injected 503 → alert plus "Try again"; retry succeeds | Pass (09) |
| Authenticated preview renders after refresh | Pass (10) |
| Draft media without auth → 401 | Pass |
| Collection cover: upload, replace, save, refresh → renders; typing a cover link drops the uploaded cover | Pass (11) |
| After publishing, `/api/public/media/{id}` and `/thumb` are served anonymously (200, image/jpeg) | Pass |

## 6. Regression: PASS
- The existing seeded collection (Kubernetes, 46 pages) opens. Its legacy page shows the existing "Start writing with blocks" conversion prompt, unchanged from Step 12 (13).
- Page publish and collection publish work. The public API (`/api/public/pages/...`) returns the published blocks with `doc`, the table and public media URLs.
- Public routes render while logged out: `/`, `/discover`, `/@admin`, `/tracks`. Unknown paths go to NotFound. `/@admin/<collection>` is still the **"Coming in Step 14" placeholder**, so the public viewer's rendering of rich text and tables can't be accepted in the browser yet. That belongs to Step 14; until then it is covered by the BlockRenderer unit tests and the API payload check above.
- Logged out, `/create` and `/create/pages/:id` redirect to `/login`.
- **Browser console and network:** the only errors were the 503s I injected on purpose, the expected `ERR_ABORTED` from the cancelled upload, the NotFound console log for the deliberate unknown route, and 404s from API paths my own regression script guessed wrongly (`/api/creator/...`, `/api/me/collections`; the app uses `/api/collections/...`). The app made no failing requests of its own.

## Defects found / fixed
None. Every first-run failure came from the test harness and was re-checked: the 0 ms key release, macOS `End` not moving the textarea caret, the link shortcut selecting the URL by design, my click turning off a header that starts on, and the blob URL changing when the preview remounts for the same asset.

## Test results (unchanged tree)
- `npx vitest run`: **30 files, 756 passed**
- `npx tsc -p tsconfig.app.json --noEmit`: clean
- `npx vite build`: success (existing chunk-size warning only)
- Backend tests not rerun: no backend changes.

## Known limitations carried forward
1. **Template retry:** after a partial failure, closing the dialog loses the in-dialog "Retry remaining". The partial collection stays as a draft. This is a candidate for a future UX improvement.
2. **Public viewer:** rich-text and table rendering in the public collection and page views is untested in the browser, because those routes are Step 14 placeholders. It belongs to Step 14.
3. **Line breaks:** a single line break inside a paragraph becomes a space after saving. This is documented 13c behavior.

## Revision (review feedback, 2026-11-17)
- `t2-editor.mjs` **table persistence** used to pass on the cell *count* alone. It now asserts the exact grid after refresh: `[["H1","H2","H3"],["r2c1","r2c2","r2c3"],["","",""]]`. The empty third row is the row added after the removals.
- `t2-editor.mjs` **rich-text persistence:** the delivered script compared the source before and after reload, so it reported FAIL on the documented re-serialization (section 2). That was not visible in the summary. It now asserts the exact canonical source after reload and also checks the stored `doc` runs and href through the API.
- Rerun of `t2-editor.mjs` against the same running stack: **23/23 PASS**, no console errors, no failed requests (`acceptance-13e/t2-editor-final-run.txt`).
- Application source, backend and migrations: still unchanged.

## Recommendation
Step 13 can be closed. Step 14 was not started.
