# Step 15a — Backend Creator Filter: Implementation Report

**Date:** 2026-11-23
**Authorization:** Step 15a only, under plan `Curio-step15-plan.md` rev. 2.1 (SHA-256 `30298ee8…04e4`), §3.1 and §11.
**Baseline:** `Curio-main-step14e-3-r2.zip` (SHA-256 `453d7ec2…f4b7`). The three changed source files were extracted from that ZIP for the old-code run; their hashes are in `baseline-source.sha256`.

**Not done:**
- no migration (V14 stays reserved for Step 18);
- no profile visibility or profile-update change;
- no frontend change;
- 15b, 15c and 15d not started.

## 1. Change
`GET /api/public/collections` takes an optional `creator=<username>`. The full diff is in `source.diff`.

| File | Change |
|---|---|
| `content/TrackRepository.java` | Two new queries, `listPublicByOwner` and `listPublicByOwnerInCategory`. They are the existing `listPublic` / `listPublicInCategory` queries, with the **same `LISTED` predicate**, plus `o.username = :username`. The existing queries are untouched. |
| `collection/PublicCollectionService.java` | `list(category, q, creator, page, size)`: <ul><li>a blank `creator` takes the old code paths;</li><li>otherwise the value is normalized with `UsernamePolicy.normalize` (trim and lowercase, as in every other public username lookup);</li><li>a value that fails `UsernamePolicy.isValidFormat` returns an empty page;</li><li>paging, clamps, `q` escaping, the category handling (an unknown category gives an empty page) and the response building are unchanged.</li></ul> The old 4-argument `list` had no other caller and was replaced, not kept as dead code. |
| `collection/PublicCollectionController.java` | `@RequestParam(required = false) String creator`, passed through |

**Behaviour:**
- **Same response:** the shape (`PagedResult<PublicCollectionSummary>`) and the ordering (newest first, `id desc`) are unchanged.
- **Unknown, invalid or suspended creator:** an empty page (200, `totalItems` 0). A suspended owner fails `LISTED`'s `o.status = ACTIVE`.
- **Profile visibility is never consulted:** a PRIVATE profile's listed collections are still returned. `GET /api/public/creators/{u}` stays the only place a PRIVATE, unknown or suspended creator is 404, and it is unchanged.
- **Usernames:** case-insensitive, because the stored usernames are normalized lowercase and the parameter is normalized the same way.

## 2. Tests (`backend/src/test/java/com/codemastery/PublicCreatorFilterApiTest.java`, 9 tests, new)
| Test | Covers |
|---|---|
| `returnsOnlyThatCreatorsListedCollectionsNewestFirst` | Only that creator's collections, newest first; another creator's are excluded; the item JSON equals the unfiltered list's item |
| `unlistedDraftHiddenDeletedAndEmptyCollectionsAreNeverReturned` | UNLISTED, DRAFT, HIDDEN, soft-deleted and empty (no published page) are excluded |
| `theFilterAgreesWithTheVisibilityRuleInEveryState` | The 48-combination matrix (status × moderation × deleted × owner × page) compared with `Visibility.collectionListed` |
| `pagingReturnsEveryCollectionExactlyOnce` | 7 collections at `size=3`: `totalItems` 7, `totalPages` 3, the union of the pages is exactly the 7 with no duplicates; the page past the end is empty; the size clamp still applies |
| `usernameIsCaseInsensitiveAndTrimmed` | Upper case, and a value padded with spaces |
| `unknownInvalidAndSuspendedCreatorsGiveAnEmptyPage` | Unknown, `!!bad!!`, `%`, a one-letter value, and a suspended creator: each an empty page |
| `aPrivateProfileDoesNotAffectTheCreatorFilter` | The profile returns 404 while the collections are still returned |
| `combinesWithCategoryAndSearchAndBlankMeansUnfiltered` | `creator` combined with `category` and with `q`; an unknown category; `creator=` blank behaves the same as no parameter |
| `theFilterNeedsNoTokenAndIgnoresTheCaller` | Anonymous, owner and other user get byte-identical responses |

**Old code** (`new-tests-on-OLD-code.txt`): run against the baseline sources, which ignore `creator`. **8 failed, 1 passed.**
- The 8 failures are every test listed above except the matrix.
- The matrix test passes on the old code. It asserts that the collection is present exactly when the visibility rule says it should be, and the unfiltered list also satisfies that. It guards the filter's rule; the other 8 prove the filtering.

**New code** (`new-tests-on-NEW-code.txt`): **9/9 passed.**

**Disclosed harness correction while writing the tests:**
- The first version of the trimming check passed `%20` inside the URL string. MockMvc's `get(String)` treats that as a URL template and encodes `%` again, so the app received the literal text `%20name%20`.
- The check now sends the padded value with `.param()`.
- This happened before any evidence was recorded. Both evidence files come from the final test file (`3a9dd768…f4b`).

## 3. Gates
| Gate | Result |
|---|---|
| `mvn test` (H2), full suite (`mvn-test-full.txt`) | **625 run, 0 failures, 0 errors, 18 skipped**, BUILD SUCCESS. The skipped tests are the Postgres and MinIO suites, skipped without their environment variables, as before. 625 = the previous 616 plus the 9 new; I didn't separately re-run the old suite to measure 616. |
| vitest | 62 files / 1197 tests, unchanged (no frontend change) |
| tsc app / node | clean / clean |
| vite build | OK, with the 3 baseline warnings only |
| ESLint | No changed frontend files |

## 4. Changed files (`changed-files.sha256`)
| File | Kind |
|---|---|
| `backend/src/main/java/com/codemastery/content/TrackRepository.java` | modified |
| `backend/src/main/java/com/codemastery/collection/PublicCollectionService.java` | modified |
| `backend/src/main/java/com/codemastery/collection/PublicCollectionController.java` | modified |
| `backend/src/test/java/com/codemastery/PublicCreatorFilterApiTest.java` | new |
| `acceptance-15a/**` | evidence |

No migration, no other test changed, and no frontend file touched.

## 5. Notes for 15b
- The parameter is `creator`. Use `size=50` for the profile's Load more (plan §3.3).
- The response carries `totalItems` and `totalPages`, as the plan expects.
