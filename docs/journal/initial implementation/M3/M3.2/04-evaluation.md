# Milestone M3.2 — Selection and Dependency Auto-Select: Finding Evaluations

Independent subagent evaluations of the 8 code review findings (`F-01` through `F-08`) from `03-code-review.md`.

---

## Batch 1 Evaluations (`F-01` – `F-04`) — `M3.2-Evaluator-1`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-01` | `P2` | **ACCEPT** | Pass `activeCollectionId={instance?.meta.source.collectionId ?? null}` to `TargetForm`, restore `collectionInput` on `revertToken`, and use `activeCollectionId` in `notifyTargetChangeIfLoaded` so target changes on a loaded instance always re-resolve the loaded collection. |
| `F-02` | `P2` | **ACCEPT** | Clear `setExportError(null)` at the start of `handleChangeEntryVersion`, abort any in-flight `versionAbortControllerRef` in `handleRequestLoadOrReResolve`, and disable `TargetForm` controls and `Export instance.json` while `isRecomputing` is `true`. |
| `F-03` | `P2` | **ACCEPT** | Export `isUnverifiedPlatformCandidate(version, projectType)` from `src/core/model.ts` (`!isPlatformAgnostic(projectType) && version.platforms.length === 0`) and use it in `src/core/resolver.ts` and `src/ui/components/EntryTables.tsx`. |
| `F-04` | `P2` | **ACCEPT** | Export `computeHeaderTriState(states)` from `src/core/reducers.ts` (used by `getHeaderTriState`) and remove the duplicate `computeFallbackTriState` from `src/ui/components/EntryTables.tsx`. |

---

## Batch 2 Evaluations (`F-05` – `F-08`) — `M3.2-Evaluator-2`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-05` | `P2` | **ACCEPT** | Add UI test coverage in `tests/ui/m3-2-selection.test.tsx` for `changeEntryVersion` error recovery (`exportError` alert, `isRecomputing` reset, and clearing error on subsequent successful version override). |
| `F-06` | `P3` | **ACCEPT** | Add initial focus management (focusing Cancel button on open) and `Escape` key handler (`onCancel()`) to `ConfirmReResolveDialog.tsx`, verified in `tests/ui/m3-2-selection.test.tsx`. |
| `F-07` | `P3` | **ACCEPT** | Update `docs/user-guide.md` §3 and §5 to document the visible `auto` and `user off` selection-source badges and `(<versionType>)` / `[unverified platform]` dropdown option suffixes. |
| `F-08` | `P3` | **ACCEPT** | Add assertions in `tests/ui/m3-2-selection.test.tsx` for the `AutoSelectToast` dismiss button (`Dismiss notification`) and `preferStable` checkbox revert on `ConfirmReResolveDialog` Cancel. |
