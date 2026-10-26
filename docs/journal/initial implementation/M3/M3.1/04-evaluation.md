# Milestone M3.1 — Read-Only Tables + JSON Export: Finding Evaluations

Independent subagent evaluations of the 8 code review findings (`F-01` through `F-08`) from `03-code-review.md`.

---

## Batch 1 Evaluations (`F-01` – `F-04`) — `M3.1-Evaluator-1`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-01` | `P1` | **ACCEPT** | Guard `onProgress`, `try` completion, and `catch` in `handleLoadCollection` with `abortControllerRef.current === controller`, and clear `abortControllerRef.current = null` on completion and unmount. |
| `F-02` | `P2` | **ACCEPT** | Reset `setInstance(null)` and `setResolveSkipped([])` when starting a new resolution in `handleLoadCollection`. |
| `F-03` | `P2` | **ACCEPT** | Compute `phaseLabel` in `ResolveProgressPanel` as `'Cancelled'` when `!isResolving && wasCancelled` and `'Failed'` when `!isResolving && error`. |
| `F-04` | `P2` | **ACCEPT** | Wrap `triggerTextDownload` DOM/ObjectURL lifecycle in `try / finally` in `src/ui/download.ts` and guard `exportInstanceJson` in `src/ui/App.tsx` with `try / catch` and an `exportError` alert. |

---

## Batch 2 Evaluations (`F-05` – `F-08`) — `M3.1-Evaluator-2`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-05` | `P2` | **ACCEPT** | Add UI tests in `tests/ui/m3-1-tables.test.tsx` covering non-abort resolution error alerts, `triggerTextDownload` DOM/ObjectURL lifecycle, `AbortSignal` cancellation + superseded controller isolation + stale state reset, `releasePreference: 'newest'`, and empty tables state. |
| `F-06` | `P3` | **ACCEPT** | Update `docs/user-guide.md` lines 56, 58, and 110 to match `row.project.modrinthUrl` (`https://modrinth.com/<type>/<slug>`), formatted platform display names (`Fabric`, `NeoForge`, `Paper`), and the Collection summary header export button placement. |
| `F-07` | `P3` | **ACCEPT** | Extract `isAbortError(err: unknown): boolean` into `src/ui/utils.ts` and import it in `src/ui/App.tsx` and `src/ui/components/TargetForm.tsx`. |
| `F-08` | `P3` | **ACCEPT** | Render the Dependencies divider and rows in a separate `<tbody className="dependencies-body">` with `<th colSpan={4} scope="rowgroup">Dependencies</th>` in `src/ui/components/EntryTables.tsx`, and update the corresponding role query in `tests/ui/m3-1-tables.test.tsx`. |
