# Milestone M3.1 — Read-Only Tables + JSON Export: Fixes Log

Fixer subagent updates for Milestone M3.1 accepted findings (`F-01` through `F-08`).

---

## M3.1-Fixer-1 (`F-01`, `F-02`, `F-03`, `F-04`, `F-07`)

- **`src/ui/utils.ts`, `src/ui/App.tsx`, `src/ui/components/TargetForm.tsx` (`F-07`)**: Extracted shared `isAbortError` into `src/ui/utils.ts` and removed duplicate definitions in `App.tsx` and `TargetForm.tsx`.
- **`src/ui/App.tsx` (`F-01`, `F-02`, `F-04`)**:
  - Guarded `onProgress`, `try` completion, and `catch` in `handleLoadCollection` with `abortControllerRef.current === controller`, and cleared `abortControllerRef.current = null` on completion and unmount (`F-01`).
  - Reset `setInstance(null)`, `setResolveSkipped([])`, and `setExportError(null)` at the start of `handleLoadCollection` (`F-02`).
  - Wrapped `exportInstanceJson(instance, onExportJson)` in `try / catch` inside `handleExportJson` and rendered `<div className="alert alert-error" role="alert">{exportError}</div>` when `exportError` is non-null (`F-04`).
- **`src/ui/components/ResolveProgressPanel.tsx` (`F-03`)**: Updated `phaseLabel` to evaluate to `'Cancelled'` when `!isResolving && wasCancelled` and `'Failed'` when `!isResolving && error`.
- **`src/ui/download.ts` (`F-04`)**: Wrapped DOM append and `anchor.click()` in `triggerTextDownload` in a `try / finally` block so `document.body.removeChild(anchor)` and `URL.revokeObjectURL(url)` always execute.

## M3.1-Fixer-2 (`F-05`, `F-06`, `F-08`)

- **`src/ui/components/EntryTables.tsx` (`F-08`)**: Closed the primary `<tbody>` after collection rows and rendered the `Dependencies` divider and dependency rows inside a dedicated `<tbody className="dependencies-body">` with `<th colSpan={4} scope="rowgroup">Dependencies</th>`.
- **`docs/user-guide.md` (`F-06`)**: Updated project link pattern (`https://modrinth.com/<type>/<slug>`), formatted platform display examples (`Fabric`, `NeoForge`, `Paper`), and `Export instance.json` placement description (`in the Collection summary header above the review tables`).
- **`tests/ui/m3-1-tables.test.tsx` (`F-05`, `F-08`)**: Updated `Dependencies` header query to `rowheader` and added tests for non-abort resolution error alerts + `"Failed"` terminal phase label, `triggerTextDownload` DOM/ObjectURL lifecycle + export error alert handling, `signal.aborted === true` + `"Cancelled"` phase label + stale state reset + superseded controller isolation, `releasePreference: 'newest'`, and empty tables state.
