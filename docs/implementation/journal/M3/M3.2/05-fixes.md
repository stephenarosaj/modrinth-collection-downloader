# Milestone M3.2 — Selection and Dependency Auto-Select: Fixes Log

Fixer subagent updates for Milestone M3.2 accepted findings (`F-01` through `F-08`).

---

## M3.2-Fixer-1 (`F-01`, `F-02`, `F-03`, `F-04`)

- **`src/ui/components/TargetForm.tsx` & `src/ui/App.tsx` (`F-01`, `F-02`)**:
  - Added `activeCollectionId` prop to `TargetForm`, restored `collectionInput` on `revertToken`, and used `activeCollectionId` in `notifyTargetChangeIfLoaded` so target changes on a loaded instance always re-resolve the loaded collection (`F-01`).
  - Cleared `setExportError(null)` at the start of `handleChangeEntryVersion`, aborted any active `versionAbortControllerRef` in `handleRequestLoadOrReResolve`, and disabled `TargetForm` controls (`isDisabled={isRecomputing}`) and `Export instance.json` while `isRecomputing` is `true` (`F-02`).
- **`src/core/model.ts`, `src/core/resolver.ts`, `src/core/index.ts`, `src/ui/components/EntryTables.tsx` (`F-03`)**: Exported `isUnverifiedPlatformCandidate(version, projectType)` from `src/core` (`!isPlatformAgnostic(projectType) && version.platforms.length === 0`) and used it in `src/core/resolver.ts` and `src/ui/components/EntryTables.tsx`.
- **`src/core/reducers.ts`, `src/core/index.ts`, `src/ui/components/EntryTables.tsx` (`F-04`)**: Extracted and exported `computeHeaderTriState(states)` in `src/core/reducers.ts` (delegated to by `getHeaderTriState`) and removed the duplicate `computeFallbackTriState` from `src/ui/components/EntryTables.tsx`.

## M3.2-Fixer-2 (`F-05`, `F-06`, `F-07`, `F-08`)

- **`src/ui/components/ConfirmReResolveDialog.tsx` (`F-06`)**: Added initial focus on the **Cancel** button when `open` transitions to `true` and a `window` `keydown` listener calling `onCancel()` on `Escape`.
- **`docs/user-guide.md` (`F-07`)**: Documented the `(beta)` / `(alpha)` and `[unverified platform]` suffixes in version dropdown options and the visible `auto` and `user off` selection-source badges in §3 and §5.
- **`tests/ui/m3-2-selection.test.tsx` (`F-05`, `F-06`, `F-08` + `F-01`/`F-02`/`F-03`)**: Added tests for `handleChangeEntryVersion` error recovery + `exportError` clearing on retry, `AutoSelectToast` dismiss button, `ConfirmReResolveDialog` initial focus on **Cancel** + `Escape` dismissal, `Prefer stable` revert on Cancel, and unsubmitted `collectionInput` isolation/revert on Cancel.
