# Milestone M3.2 — Selection and Dependency Auto-Select: Verification Log

Verification subagent reports for Milestone M3.2 fixer batches.

---

## M3.2-Verifier-1 (`M3.2-Fixer-1` Verification)

- **Overall Verdict**: `VERIFIED`
- **`F-01` (`P2`)**: `VERIFIED` — `App.tsx` passes `activeCollectionId={instance?.meta.source.collectionId ?? null}` to `TargetForm`, which restores `collectionInput` on `revertToken` and uses `activeCollectionId` in `notifyTargetChangeIfLoaded`.
- **`F-02` (`P2`)**: `VERIFIED` — `App.tsx` clears `setExportError(null)` at the start of `handleChangeEntryVersion`, aborts any active `versionAbortControllerRef` in `handleRequestLoadOrReResolve`, and disables `TargetForm` (`isDisabled={isRecomputing}`) and `Export instance.json` while `isRecomputing` is active.
- **`F-03` (`P2`)**: `VERIFIED` — `src/core/model.ts` exports `isUnverifiedPlatformCandidate(version, projectType)`, used by both `src/core/resolver.ts` and `src/ui/components/EntryTables.tsx`.
- **`F-04` (`P2`)**: `VERIFIED` — `src/core/reducers.ts` exports `computeHeaderTriState(states)` (delegated to by `getHeaderTriState`), and `src/ui/components/EntryTables.tsx` removes `computeFallbackTriState`.

## M3.2-Verifier-2 (`M3.2-Fixer-2` Verification)

- **Overall Verdict**: `VERIFIED`
- **`F-05` (`P2`)**: `VERIFIED` — `tests/ui/m3-2-selection.test.tsx` tests `handleChangeEntryVersion` error recovery, `isRecomputing` reset, and clearing `exportError` on a subsequent successful version override.
- **`F-06` (`P3`)**: `VERIFIED` — `ConfirmReResolveDialog.tsx` focuses the **Cancel** button on open and closes/reverts on `Escape` keydown, verified in `tests/ui/m3-2-selection.test.tsx`.
- **`F-07` (`P3`)**: `VERIFIED` — `docs/user-guide.md` §3 and §5 document the `auto` and `user off` selection-source badges and `(<versionType>)` / `[unverified platform]` dropdown option suffixes.
- **`F-08` (`P3`)**: `VERIFIED` — `tests/ui/m3-2-selection.test.tsx` tests the `AutoSelectToast` dismiss button, `Prefer stable` checkbox revert on `ConfirmReResolveDialog` Cancel, and unsubmitted `collectionInput` isolation/revert (`F-01`).
- **Full Check Suite**: `yarn lint`, `yarn typecheck`, `yarn test` (16 test files, 230 tests), and `yarn build` all passed.
