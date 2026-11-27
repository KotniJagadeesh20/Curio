# Step 15d-1 report: attempt 2 (prompt rev. 17)

## 1. Scope and authorization
- **15d-1 only, attempt 2.** Prompt rev. 17, SHA-256 `6b9a22d1658bf465a3c390b56f649c431d422e6e61b6b208d2f60bbd14432f97` (approved 2026-11-27); Part B explicitly authorized by the user on 2026-11-27 after the reviewer confirmed Part A closed. 15d-2 to 15d-5 not started.
- Plan: `Curio-step15d-plan.md` rev. 4, SHA-256 `131bae8f31a81208331957825f217b6612ac645f62b22835fca6d51e26af4e8d`.
- Started 2026-11-27 13:37 IST (pre-flight); runs, negative control and final checks finished by 13:40 IST.
- **Why attempt 2:** attempt 1 (rev. 12, 2026-11-25) passed the 3-run matrix but stopped at the negative control: contract15 resolved the repository root from the script's location, so the scratchpad copy crashed (exit 3). Attempt 1's evidence is archived at `~/Downloads/Curio-15d-1-attempt1-archive/` (Part A; manifest SHA-256 `d0c6ba8040c4694abc6f188cdfed043c3d0c81f40f51e54722e97312651cb640`; log `9542b30f593581850df506250ca286e643df69cd853855f046cd15e3c732f65f`). No attempt-1 result is reused here.
- **Script:** installed from the reviewed file, SHA-256 `713c6b02dac0a3452409e727486ea83a8309f67582f48982634aad3590c3dbaa`, verified at install and again in the final checks. Root-check probe from a non-root working directory: exit 2, message "is not the Curio repository root (missing src/lib/types.ts)", no output created (`preflight.txt`).

## 2. Pre-flight (`preflight.txt`, `baseline-verification.txt`, `diff-rq*.txt`)
- Tools (each with exit code): node v23.10.0 (0); Maven 3.9.15 (0); Java Zulu 17.0.14 (0); npm 10.9.2 (0, recorded only); Chrome 158.0.8127.38 (0, recorded only); playwright-core not present in `$SP/node_modules` (exit 1; recorded only per ⚑Q1).
- 1a′: `acceptance-15/` absent; no assertion log; Part A log ends with `ARCHIVE RE-VERIFIED AFTER REMOVAL: PASS`; no earlier scratch paths; attempt-1 scratchpad absent; script source hash correct.
- 1b: 14e script manifest 19/19 OK; `MDIR=$R` (⚑Q2: first line `acceptance-14a/scripts/seed14a.mjs` is repo-root relative).
- 1c and §2: baseline hashes 3 originals + 3 copies all `44923ea0bdecac4cbdaabfc34a6e4dfd309f58ebae0d0bd17c9a3f58da3a3964`. Provenance limitation recorded verbatim in `baseline-verification.txt`.
- 1d: `Curio-main-step15c.zip` SHA-256 `2a7b2b4383cc64d40749c4b37bd99b984fbaff54c925e0bb0a21e999e5faeabf`; `unzip -tq` "No errors detected"; 1795 entries; single `Curio-main` top folder; `diff-rq.txt` empty (0 lines, exit 0); ⚑Q4: 1 extra excluded folder (`legacy-mock-data/data`) diffed separately, identical.

## 3. contract15 results
| ID | Run 1 | Run 2 | Run 3 | Result |
|---|---|---|---|---|
| N1.1 | PASS | PASS | PASS | 3/3 |
| N1.2 | PASS | PASS | PASS | 3/3 |
| N1.3 | PASS | PASS | PASS | 3/3 |
| N2.1 | PASS | PASS | PASS | 3/3 |
| N2.2 | PASS | PASS | PASS | 3/3 |
| N2.3 | PASS | PASS | PASS | 3/3 |
| N2.4 | PASS | PASS | PASS | 3/3 |
| N3.1 | PASS | PASS | PASS | 3/3 |
| N3.2 | PASS | PASS | PASS | 3/3 |
| N5.1 | PASS | PASS | PASS | 3/3 |
| N5.1a | PASS | PASS | PASS | 3/3 |
| N5.1b | PASS | PASS | PASS | 3/3 |
| N5.1c | PASS | PASS | PASS | 3/3 |
| N5.1d | PASS | PASS | PASS | 3/3 |
| N5.1e | PASS | PASS | PASS | 3/3 |
| N5.1f | PASS | PASS | PASS | 3/3 |
| N5.1g | PASS | PASS | PASS | 3/3 |
| N5.2 | PASS | PASS | PASS | 3/3 |
| N4.1 | PASS | PASS | PASS | 3/3 |
| N4.2 | PASS | PASS | PASS | 3/3 |
| N4.3 | PASS | PASS | PASS | 3/3 |
| N4.4 | PASS | PASS | PASS | 3/3 |
| N6.1 | PASS | PASS | PASS | 3/3 |
| N6.2 | PASS | PASS | PASS | 3/3 |
| N6.3 | PASS | PASS | PASS | 3/3 |
| N7.1 | PASS | PASS | PASS | 3/3 |
| N7.2 | PASS | PASS | PASS | 3/3 |
| N7.2a | PASS | PASS | PASS | 3/3 |
| N7.2b | PASS | PASS | PASS | 3/3 |
| N7.2c | PASS | PASS | PASS | 3/3 |
| N7.2d | PASS | PASS | PASS | 3/3 |
| N7.2e | PASS | PASS | PASS | 3/3 |
| N7.2f | PASS | PASS | PASS | 3/3 |
| N7.3 | PASS | PASS | PASS | 3/3 |
| N8 | PASS | PASS | PASS | 3/3 |
| N1.4 | PASS | PASS | PASS | 3/3 |
| S0 | PASS | PASS | PASS | 3/3 |
| S1 | PASS | PASS | PASS | 3/3 |
| S2 | PASS | PASS | PASS | 3/3 |
| S3 | PASS | PASS | PASS | 3/3 |
| S4 | PASS | PASS | PASS | 3/3 |
| N5.3 | INFO | INFO | INFO | recorded only |

41 unique checks (N1.1 … N8, S0 … S4), 123 executions: **123 passed, 0 failed**. N5.3 is recorded as INFO in each run. SUMMARY lines per run: part N pass=36 fail=0; part S setup pass=1 fail=0; part S assert pass=4 fail=0. Ordering used (all runs): `setup > N1 > N5-before > N2 > N3.1 > reset-PUBLIC > N3.2 > N5-after > N4 > N6 > N7` (INFO ORDER line). No assertion FAIL was recorded; the §5 matrix gate passed.

## 4. Process evidence per run
| Run | Backend | Maven PID | Listener PID | Relationship (verified with ps) | TERM sent | Possible misdirected | Not signalled | All recorded PIDs gone, 8081 free |
|---|---|---|---|---|---|---|---|---|
| 1 | normal | 82288 | 82328 | listener is a descendant of mvn (forked JVM) | 1 | 0 | 0 | yes |
| 1 | suspended | 82531 | 82575 | listener is a descendant of mvn (forked JVM) | 1 | 0 | 0 | yes |
| 2 | normal | 82857 | 82898 | listener is a descendant of mvn (forked JVM) | 1 | 0 | 0 | yes |
| 2 | suspended | 83093 | 83139 | listener is a descendant of mvn (forked JVM) | 1 | 0 | 0 | yes |
| 3 | normal | 83410 | 83452 | listener is a descendant of mvn (forked JVM) | 1 | 0 | 0 | yes |
| 3 | suspended | 83651 | 83695 | listener is a descendant of mvn (forked JVM) | 1 | 0 | 0 | yes |

Identities (start time + command) for every recorded PID are in `run-k/<backend>.identity`; the full ps lines, TERM records and final process states are in `run-k/<backend>.pids.txt`. Only TERM was sent; no KILL. The negative-control backend (`nc/normal.*`) was stopped and verified the same way.

## 5. Part S isolation evidence per run (`run-k/sql.txt`, `run-k/h2-listing.txt`, `run-k/backend-suspended.log`)
- Effective URL (Hikari line): `jdbc:h2:file:$SP/h2-15d/run-k/c15` for k = 1, 2, 3; no `mem:`; `c15.mv.db` existed after start.
- Schema check PASS (status and username columns); pre-check: exactly one `c15_sus`, ACTIVE; update count 1; post-check: `c15_sus` SUSPENDED; SUSPENDED count 1 — all five CHECK lines PASS in each run.
- Cleanup: no `org.h2.tools.Shell` process; database folder listed before and after deletion via `safe_rm`; port 8081 free.

## 6. Nullability (`nullability.txt`; per-run files kept, ⚑Q12)
The three per-run files are byte-identical (SHA-256 `b821f901…b977b`). **0 mismatches.**

| Field | Observed | types.ts | Contexts | Result |
|---|---|---|---|---|
| Profile.displayName | string | string | new user; round-trip; cleared | match |
| Profile.bio | string | string | new user; round-trip; cleared | match |
| Profile.avatarUrl | null,string | string | null | new user; round-trip; cleared | match |
| Profile.bannerUrl | null,string | string | null | new user; round-trip; cleared | match |
| Profile.socialLinks | object | Record<string, string> | new user; round-trip; cleared | match |
| Profile.visibility | string | "PUBLIC" | "PRIVATE" | new user; round-trip; cleared | match |
| PublicCreator.username | string | string | N5 before; N5 after | match |
| PublicCreator.displayName | string | string | N5 before; N5 after | match |
| PublicCreator.bio | string | string | N5 before; N5 after | match |
| PublicCreator.avatarUrl | null,string | string | null | N5 before; N5 after | match |
| PublicCreator.bannerUrl | null,string | string | null | N5 before; N5 after | match |
| PublicCreator.socialLinks | object | Record<string, string> | N5 before; N5 after | match |
| PublicCreator.joinedAt | string | string | N5 before; N5 after | match |
| PublicCollectionSummary.slug | string | string | N7 | match |
| PublicCollectionSummary.title | string | string | N7 | match |
| PublicCollectionSummary.description | string | string | N7 | match |
| PublicCollectionSummary.coverUrl | null | string | null | N7 | match |
| PublicCollectionSummary.coverThumbUrl | null | string | null | N7 | match |
| PublicCollectionSummary.category | object | PublicCategoryRef | null | N7 | match |
| PublicCollectionSummary.creator | object | PublicCreatorRef | N7 | match |
| PublicCollectionSummary.moduleCount | number | number | N7 | match |
| PublicCollectionSummary.pageCount | number | number | N7 | match |
| PublicCategoryRef.slug | string | string | N7 | match |
| PublicCategoryRef.name | string | string | N7 | match |
| PublicCreatorRef.username | string | string | N7 | match |
| PublicCreatorRef.displayName | string | string | N7 | match |
| Paged.items | array | T[] | N7 | match |
| Paged.page | number | number | N7 | match |
| Paged.size | number | number | N7 | match |
| Paged.totalItems | number | number | N7 | match |
| Paged.totalPages | number | number | N7 | match |
| N7.2c note: types.ts declares category as "PublicCategoryRef | null"; for the seeded collection (created with a category) null does not pass. |

Note recorded by the script: types.ts declares `category` as `PublicCategoryRef | null`; for the seeded collection (created with a category) null does not pass (N7.2c passed 3/3 with a non-null object).

## 7. Negative control (`negative-control.txt`, `nc/`)
- Diff: exactly one line, `const N51G_TYPE = 'string';` → `'number';` (checked by the prompt's one-line diff gate).
- The copy ran from `$SP/nc` with working directory `$R` on a fresh in-memory backend: **exit 1**, `SUMMARY part=N phase=- pass=35 fail=1`, the only FAIL is **N5.1g** (`expectedType=number`, observed ISO-8601 string).
- Every other ID (37 PASS/INFO lines) has the same status as run 1. Scratch copy removed via `safe_rm`.
- This closes the attempt-1 failure: the copy found `src/lib/types.ts` through its working directory.

## 8. Deviations and ⚑ resolutions applied
- ⚑Q1–Q16 applied as decided in §12. ⚑Q2: `MDIR=$R`. ⚑Q10: no assertion FAIL, so the negative control ran.
- **How the prompt was executed:** the code blocks were extracted programmatically from the approved file and sourced unchanged, with two substitutions the prompt asks for: `SP=` in §0 and the ⚑Q2 `MDIR` line. Variables a later block uses from an earlier block in the same shell (`P`, `ZIP15C`) were re-set to the identical values when blocks ran in separate shells. Prose-only steps were implemented as `STOP` conditions exactly as worded: the part N `jdbc:h2:mem:` log check; the part S Hikari/Flyway `jdbc:h2:file:…/run-k/c15` check, the "still shows mem:" check and the `c15.mv.db` existence check; the §6 step 3 per-ID comparison; the §6 step 4 `safe_rm "$SP/nc"`; §7.1 and §7.2.
- 1a′ prose says the only pre-existing `$SP` file allowed is `15d1-env.sh`. The executable check (which lists every Part B scratch path) passed; `$SP` also held Part A's files (`15d1-A-env.sh`, `15d1-A-run.sh`, the empty A2 stderr capture), the earlier rev.13 draft folder and test folders, none of which Part B reads or writes. Recorded, not changed.
- §10 item 9 asks for the manifest's SHA-256 inside this report, but §7.4 writes the manifest after the report and it covers this report, so its hash can't appear here without circularity. It is reported in chat instead.

## 9. Files added
- All files under `acceptance-15/` (scripts, baseline, 15d-1 evidence). `manifest.sha256` lists every file except itself; the file count = manifest lines + 1 is checked when it is written (§7.4). Its SHA-256 and count are reported in chat.
- `final-checks.txt`: 14e manifest 19/19 unchanged; axe14e 3/3 unchanged; `contract15.mjs` unchanged (`713c6b02…dbaa`); `diff -rq` against the 15c package shows only `Only in /Users/newuser/Downloads/Curio-main: acceptance-15`. All PASS.

## 10. Stop point
15d-1 complete. 15d-2 not started; awaiting review.
