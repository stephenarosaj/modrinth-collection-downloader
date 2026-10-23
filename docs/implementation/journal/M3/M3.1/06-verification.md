# Milestone M3.1 — Read-Only Tables + JSON Export: Verification Log

Verification subagent reports for Milestone M3.1 fixer batches.

---

## M3.1-Verifier-1 (`M3.1-Fixer-1` Verification)

- **Overall Verdict**: `VERIFIED`
- **`F-01` (`P1`)**: `VERIFIED` — `handleLoadCollection` guards `onProgress`, `try` completion, and `catch` with `abortControllerRef.current === controller`, and clears `abortControllerRef.current = null` on completion, error/abort, explicit cancel, and unmount.
- **`F-02` (`P2`)**: `VERIFIED` — `handleLoadCollection` resets `setInstance(null)`, `setResolveSkipped([])`, and `setExportError(null)` immediately when starting a new resolution.
- **`F-03` (`P2`)**: `VERIFIED` — `ResolveProgressPanel` computes `phaseLabel` as `'Cancelled'` when `!isResolving && wasCancelled` and `'Failed'` when `!isResolving && error`.
- **`F-04` (`P2`)**: `VERIFIED` — `triggerTextDownload` wraps DOM append and `anchor.click()` in a `try / finally` block that always removes `anchor` and calls `URL.revokeObjectURL(url)`; `handleExportJson` in `App.tsx` wraps `exportInstanceJson` in `try / catch` and renders an `exportError` alert banner.
- **`F-07` (`P3`)**: `VERIFIED` — `isAbortError` is extracted to `src/ui/utils.ts` and imported by `src/ui/App.tsx` and `src/ui/components/TargetForm.tsx`.

## M3.1-Verifier-2 (`M3.1-Fixer-2` Verification)

- **Overall Verdict**: `VERIFIED`
- **`F-05` (`P2`)**: `VERIFIED` — `tests/ui/m3-1-tables.test.tsx` now covers `signal.aborted === true` cancellation, `"Cancelled"` and `"Failed"` terminal phase labels, stale `instance`/`resolveSkipped` clearing on subsequent resolution, superseded controller isolation, non-abort resolution error alerts, `triggerTextDownload` DOM/ObjectURL cleanup (normal and throwing `.click()`), `App` export error alerts, `releasePreference: 'newest'`, and empty exportable tables state.
- **`F-06` (`P3`)**: `VERIFIED` — `docs/user-guide.md` accurately documents `https://modrinth.com/<type>/<slug>`, formatted platform display names (`Fabric`, `NeoForge`, `Paper`), and the `Export instance.json` button in the Collection summary header.
- **`F-08` (`P3`)**: `VERIFIED` — `src/ui/components/EntryTables.tsx` renders the `Dependencies` divider and dependency rows in a separate `<tbody className="dependencies-body">` with `<th colSpan={4} scope="rowgroup">Dependencies</th>`, and `tests/ui/m3-1-tables.test.tsx` queries `getByRole('rowheader', { name: 'Dependencies' })`.
- **Full Check Suite**: `yarn lint`, `yarn typecheck`, `yarn test` (15 test files, 222 tests), and `yarn build` all passed.
