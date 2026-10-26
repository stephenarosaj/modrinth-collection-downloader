# Milestone M1 — Core: Fix Verification (Step 6)

Verification subagent logs for each M1 fixer batch are recorded below.

---


## M1 Verifier Batch 1 (Projections & Model — Findings #1, #10, #11, #19)

- **Status**: **VERIFIED**
- Verified `computeVisibleDependencyIds` seeds selected (`selection.on === true`) dependency entries and traverses their transitive required dependencies (`tests/core/projections.test.ts` 19/19 passing).
- Verified `MODPACK_SKIPPED_REASON`, `extractRequiredDependencyIds`, and `@deprecated` annotations in `src/core/model.ts`, and `.mrpack` primary filename handling in `getSkippedEntries`.

## M1 Verifier Batch 2 (Status & Documentation — Findings #6, #7, #10, #11, #17)

- **Status**: **VERIFIED**
- Verified `hasPinConflictInEnvironment` requires `origin === 'dependency' && resolution === 'pinned'`, scopes via `state.requiredBy`, and checks `compatiblePinCount > 1` against `candidateIds`.
- Verified `evaluateCellStatus` guards `isExportableProjectType(entry.project.type)` and `tests/core/status.test.ts` (23/23 passing) covers all new negative cases for `#6` and `#7`.
- Verified `docs/concepts.md` §8 documents both `computeEntryStatus` and `computeStatus`.

## M1 Verifier Batch 3 (Schema Validation & FakeModrinthClient — Findings #16, #20)

- **Status**: **VERIFIED**
- Verified `validateAgainstJsonSchema` in `tests/core/serialize.test.ts` validates comprehensive positive and negative `Instance` payloads directly against `schema/instance.schema.json`.
- Verified `FakeModrinthClient.getProjectVersions` filters by `q.platform` case-insensitively and passes `tests/core/foundation.test.ts`.


## M1 Verifier Batch 4 (Resolver & Reducers — Findings #2, #3, #4, #5, #10, #11, #12, #13, #14, #15, #18)

- **Status**: **VERIFIED**
- Verified `reduceInstance` `case 'set-version'` delegates directly to `recomputeDependencyClosure` (#2).
- Verified `hasSelectionChangedFromDefault` compares strictly `selection.on` and `selection.source` (#3).
- Verified `recomputeDependencyClosure` and `changeEntryVersion` use fixed-point `computeEnvironmentClosureInMemory`, synthesize placeholder entries via `makePlaceholderProjectInfo` for missing dependency projects (#12), revert dropped pins (#4), and only traverse/fetch dependencies of each project's resolved `chosen` version (#5).
- Verified `computeInitialSelection` delegates to `applyInitialSelection` (#13) and both `resolver.ts` and `reducers.ts` share `MODPACK_SKIPPED_REASON` and `extractRequiredDependencyIds` (#10, #11).
- Verified `computeEnvironmentClosureInMemory` applies Rule 1 (`pinned`) only to dependency entries (#14) and `throwIfAborted(signal)` guards entry, progress callbacks, loop iterations, and zero-fetch paths (#15).
- Verified all 65 unit tests across `tests/core/{resolver,reducers,parity}.test.ts` pass (#18).
