# Milestone M1 — Core: Fixes Applied (Step 5)

Fixer subagent logs for accepted M1 findings are recorded below.

---


## M1 Fixer Batch 1 (Projections, Model, Skipped Contract — Findings #1, #10, #11, #19)

- **`src/core/model.ts`**: Exported `MODPACK_SKIPPED_REASON` and `extractRequiredDependencyIds`, and annotated `DependencyRef`, `SkippedItem`, and `FileTreeItem` with `@deprecated` JSDoc comments (#10, #11, #19).
- **`src/core/projections.ts`**:
  - Seeded any dependency entry with `entry.environments[env].selection.on === true` into `visible`, `visited`, and the BFS `queue` in `computeVisibleDependencyIds` so user-selected dependencies and their transitive required dependencies remain visible in `toTables(instance)` after parent version overrides (#1).
  - Reused `extractRequiredDependencyIds` in `computeVisibleDependencyIds` (#11).
  - Updated `getSkippedEntries` to use `MODPACK_SKIPPED_REASON` and to report exportable entries whose chosen version in either environment has a `.mrpack` primary filename (#10).
- **`tests/core/projections.test.ts` & `tests/core/parity.test.ts`**: Added unit tests for user-selected dependency visibility after parent version override (#1), `.mrpack` primary filename detection in `getSkippedEntries` (#10), and unified `MODPACK_SKIPPED_REASON` assertions.

## M1 Fixer Batch 2 (Status & Documentation — Findings #6, #7, #10, #11, #17)

- **`src/core/status.ts`**:
  - Guarded `hasPinConflictInEnvironment` with `entry.origin === 'dependency' && state.resolution === 'pinned'`, scoped `requiringEntries` via `state.requiredBy`, and removed the `state.candidates.length <= 1` shortcut so `compatiblePinCount > 1` is always checked against `candidateIds` (#6).
  - Guarded `evaluateCellStatus` with `isExportableProjectType(entry.project.type)` so non-exportable (`modpack`) entries return `null` (#10).
  - Delegated `getRequiredDependencyIds` to `extractRequiredDependencyIds` from `./model` (#11).
- **`tests/core/status.test.ts`**: Added table-driven negative tests for `PIN_CONFLICT` (#6), `REQUIRED_NOT_SELECTED` (`off/auto` and `off/none`), `DEPENDENCY_UNAVAILABLE` (deselected parent), `NEEDED_BUT_UNAVAILABLE` (deselected parent), and `REQUIRED_DEPENDENCY_NOT_SELECTED` (deselected parent) (#7), plus `modpack` status exclusion (#10).
- **`docs/concepts.md`**: Documented `computeEntryStatus` (`EntryStatus`) alongside `computeStatus` (`InstanceStatusMap`) in §8 (#17).

## M1 Fixer Batch 3 (Schema Validation & FakeModrinthClient — Findings #16, #20)

- **`tests/core/serialize.test.ts`**: Added recursive JSON Schema Draft 2020-12 evaluator `validateAgainstJsonSchema` over `schema/instance.schema.json` and validated both serialized multi-entry sample instances and all negative mutated drafts against `schemaJson` (#16).
- **`tests/helpers/fake-modrinth-client.ts` & `tests/core/foundation.test.ts`**: Added case-insensitive `q.platform` filtering in `FakeModrinthClient.getProjectVersions` and unit tests in `foundation.test.ts` (#20).


## M1 Fixer Batch 4 (Resolver & Reducers — Findings #2, #3, #4, #5, #10, #11, #12, #13, #14, #15, #18)

- **`src/core/resolver.ts`**:
  - Imported and re-exported `MODPACK_SKIPPED_REASON` and `extractRequiredDependencyIds` from `./model` (#10, #11).
  - Updated `applyInitialSelection` to deep-clone `EnvironmentState` arrays and track a `visited` set during BFS (#13).
  - Added `collectionIdSet` guard in `computeEnvironmentClosureInMemory` so Rule 1 (`pinned`) applies strictly to dependency entries (`origin === 'dependency'`), never to collection entries (#14).
  - Added `throwIfAborted(signal)` checks before synchronous work, progress callbacks, and zero-fetch paths in `resolveCollection` and `changeEntryVersion` (#15).
  - Refactored `recomputeDependencyClosure` and `changeEntryVersion` to run fixed-point closure resolution via `computeEnvironmentClosureInMemory`, synthesize placeholder entries via `makePlaceholderProjectInfo` for missing dependency projects (#12), revert dropped pins when entries leave the closure (#4), and discover transitive dependencies behind already-known entries without over-fetching historical unchosen versions (#5).
- **`src/core/reducers.ts`**:
  - Delegated `reduceInstance` `case 'set-version'` directly to `recomputeDependencyClosure` (#2).
  - Delegated `computeInitialSelection` to `applyInitialSelection` (#13).
  - Scoped `hasSelectionChangedFromDefault` strictly to `selection.on` and `selection.source` (#3).
- **`tests/core/resolver.test.ts` & `tests/core/reducers.test.ts`**: Added unit tests covering all fixed behaviors (44/44 passing).
