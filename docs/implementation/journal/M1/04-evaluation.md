# Milestone M1 — Core: Finding Evaluations (Step 4)

Seven specialist evaluation batches assessed the 20 findings from `03-code-review.md` against `IMPLEMENTATION_PLAN_v1.MD` and the actual M1 codebase.

## Summary Table

| Finding | Severity | File | Verdict | Summary |
|---|---|---|---|---|
| #1 | P1 | `src/core/projections.ts` | **ACCEPT** | Seed `computeVisibleDependencyIds` with selected (`selection.on === true`) dependency entries so user-selected dependencies remain visible in `toTables` after parent version override. |
| #2 | P1 | `src/core/reducers.ts` | **ACCEPT** | Delegate `reduceInstance` `case 'set-version'` to `recomputeDependencyClosure` so synchronous version overrides recompute pins and closures identically. |
| #3 | P1 | `src/core/reducers.ts` | **ACCEPT** | Scope `hasSelectionChangedFromDefault` strictly to `selection` (`on` and `source`) so `resetInstanceSelection` restores `hasSelectionChangedFromDefault === false`. |
| #4 | P1 | `src/core/resolver.ts` | **ACCEPT** | Reuse fixed-point `computeEnvironmentClosureInMemory` inside `recomputeDependencyClosure` so late pin discoveries and dropped pins resolve accurately. |
| #5 | P1 | `src/core/resolver.ts` | **ACCEPT** | Use `computeEnvironmentClosureInMemory` in `changeEntryVersion` so transitive dependencies behind already-known entries are discovered and only chosen-version dependencies of new projects are fetched. |
| #6 | P1 | `src/core/status.ts` | **ACCEPT** | In `hasPinConflictInEnvironment`, require `entry.origin === 'dependency' && state.resolution === 'pinned'`, inspect `state.requiredBy`, and always filter pins against compatible `candidateIds` even when `candidates.length <= 1`. |
| #7 | P1 | `tests/core/status.test.ts` | **ACCEPT** | Add negative table-driven tests for `REQUIRED_NOT_SELECTED` (`off/none` and `off/auto`) and deselected parent entries (`DEPENDENCY_UNAVAILABLE`, `NEEDED_BUT_UNAVAILABLE`, `REQUIRED_DEPENDENCY_NOT_SELECTED`). |
| #8 | P1 | `src/core/resolver.ts` | **REJECT** | Contradicts `IMPLEMENTATION_PLAN_v1.MD` §7.2 ("Every dependency project becomes an Entry... Its own support/version/closure are resolved with the same rules"), §7.3, and §7.4. |
| #9 | P2 | `src/core/projections.ts` | **REJECT** | Contradicts `IMPLEMENTATION_PLAN_v1.MD` §6 (`requiredBy`: "projectIds of entries whose chosen version in this environment requires this entry (any selection state)"), §7.2, and §7.4. |
| #10 | P2 | `src/core/projections.ts`, `src/core/resolver.ts`, `src/core/status.ts`, `src/core/model.ts` | **ACCEPT** | Share `MODPACK_SKIPPED_REASON`, guard `evaluateCellStatus` for `!isExportableProjectType`, and include `.mrpack` primary-file entries in `getSkippedEntries`. |
| #11 | P2 | `src/core/model.ts`, `src/core/resolver.ts`, `src/core/reducers.ts`, `src/core/status.ts`, `src/core/projections.ts` | **ACCEPT** | Consolidate `extractRequiredDependencyIds` in `src/core/model.ts` and reuse across all 4 modules. |
| #12 | P2 | `src/core/resolver.ts` | **ACCEPT** | Create placeholder entries via `makePlaceholderProjectInfo` for missing dependency projects in `changeEntryVersion` and `recomputeDependencyClosure`. |
| #13 | P2 | `src/core/resolver.ts`, `src/core/reducers.ts` | **ACCEPT** | Consolidate initial selection logic by having `computeInitialSelection` delegate to `applyInitialSelection`. |
| #14 | P2 | `src/core/resolver.ts` | **ACCEPT** | Apply Rule 1 (`pinned`) only to dependency entries (`origin === 'dependency'`), never to collection entries (`origin === 'collection'`), per §7.1. |
| #15 | P2 | `src/core/resolver.ts` | **ACCEPT** | Check `throwIfAborted(opts.signal)` before synchronous work, progress callbacks, and zero-fetch paths in `resolveCollection` and `changeEntryVersion`. |
| #16 | P2 | `tests/core/serialize.test.ts` | **ACCEPT** | Validate sample serialized instances and negative mutations against the full `schema/instance.schema.json` specification (§10). |
| #17 | P2 | `docs/concepts.md` | **ACCEPT** | Document `computeEntryStatus` and `EntryStatus` alongside `computeStatus` in `docs/concepts.md` §8. |
| #18 | P2 | `tests/core/resolver.test.ts` | **ACCEPT** | Add unit tests for `getVersionsByIds` pin fetching, missing/non-exportable dependencies, and multi-hop `changeEntryVersion`. |
| #19 | P3 | `src/core/model.ts` | **ACCEPT** | Add `@deprecated` JSDoc annotations to secondary type aliases (`DependencyRef`, `SkippedItem`, `FileTreeItem`). |
| #20 | P3 | `tests/helpers/fake-modrinth-client.ts` | **ACCEPT** | Filter by `q.platform` when provided in `FakeModrinthClient.getProjectVersions`. |
