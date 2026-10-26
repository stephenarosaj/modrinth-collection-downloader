# Milestone M5 — Polish and Release: Fixes Log

Log of fixes applied for accepted findings from `04-evaluation.md`.


---

## Fixer Batch 1: Findings 1–4

### Finding 1 (`src/core/resolver.ts`, `docs/decisions.md`)
- **Change:** Tracked collection projects whose `getProjectVersions` call failed in `failedCollectionProjectIds = new Set<string>()` inside the `catch` block (`src/core/resolver.ts:857`). After the 100%-failure check (`src/core/resolver.ts:885-887`), filtered `exportableCollectionIds` into `resolvedCollectionIds` and used `resolvedCollectionIds` for `collectionIdSet`, `computeEnvironmentClosureInMemory`, and `allEntryProjectIds` (`src/core/resolver.ts:1078`). Updated `D-008` in `docs/decisions.md` (`lines 68-72`) to document that fetch-failed collection projects are recorded in `skipped` (`Failed to fetch versions: ...`) and omitted from collection `entries` unless required as a dependency by a succeeded entry.

### Finding 2 (`src/ui/download.ts`, `src/ui/components/ExportBar.tsx`)
- **Change:** Added `env?: EnvironmentId` to `ExportEnvironmentZipResult` (`src/ui/download.ts:41`) and populated `env` in all three return statements of `exportEnvironmentZip` (`src/ui/download.ts:147, 245, 297`). Updated `retryZipEnv` in `src/ui/components/ExportBar.tsx:82-88` to read `zipResult.env` with a suffix/prefix fallback (`zipResult.filename.endsWith('-server.zip') || zipResult.filename.startsWith('server.') ? 'server' : 'client'`).

### Finding 3 (`src/ui/components/ExportBar.tsx`)
- **Change:** Updated `.zip-retry-btn` (`src/ui/components/ExportBar.tsx:215`) to use `disabled={retryZipEnv === 'server' ? serverZipDisabled : clientZipDisabled}` so the retry button respects the §7.3.1 environment toggle lock and empty-selection guards.

### Finding 4 (`src/ui/utils.ts`)
- **Change:** Extended `formatUserFacingError` (`src/ui/utils.ts:25-44`) with branches for HTTP `404` (`isNotFound`), HTTP `5xx` (`isServerError`), and network disconnect errors (`isNetworkError`) that provide actionable recovery guidance while preserving `(${rawMessage})` and avoiding double-wrapping already-clear messages (`^collection not found:` / rate-limit retry guidance).

### Verification
- `yarn lint`: Passed (`0` warnings/errors)
- `yarn typecheck`: Passed (`tsc --noEmit`)
- `yarn test --run`: Passed (19 test files, 249 tests)


---

## Fixer Batch 2: Finding 5

### Finding 5 (`tests/ui/m5-polish.test.tsx`)
- **Change:**
  1. **5a (`formatUserFacingError` unit assertions):** Added unit assertions for HTTP `404` (`HTTP 404 Not Found`, `Modrinth API error 404 (Not Found)`), HTTP `5xx` (`HTTP 502 Bad Gateway`, `HTTP 503 Service Unavailable`), network errors (`TypeError: Failed to fetch`), and passthrough of already-formatted messages (`Collection not found: xyz`, `Collection not found: 404`, and existing rate-limit guidance).
  2. **5b (Partial-result table exclusion & transitive `getProjects` failure):** Added `expect(within(modsSection).queryByText('Beta Mod')).not.toBeInTheDocument()` in the partial-result collection resolution test, and added a test case where `client.getProjects` fails on its second call (transitive dependency lookup) verifying placeholder dependency creation (`DEPENDENCY_UNAVAILABLE` / `NEEDED_BUT_UNAVAILABLE` when `client` is active), `Skipped Projects` recording (`Failed to fetch dependency project: ...`), and progress warning logging.
  3. **5c (`server.zip` retry routing & environment-toggle disabled gating):** Added a test verifying that a partial failure during `Export server.zip` on `col-m5` renders `Retry server.zip export`, disables `Retry server.zip export` while the `Server environment` toggle is turned off, and exports `col-m5-server.zip` and clears the alert when `Server environment` is re-enabled and `Retry server.zip export` is clicked.
  4. **5d (`React.memo` row-isolation check at 500 rows):** Added a deterministic 500-row `<EntryTables />` test tracking `VersionRef.versionType` property reads per row, proving that initial render evaluates all 500 rows while a single-row selection update (`proj-250`) only re-evaluates the 1 affected row (`2` reads, `0` reads on the remaining 499 rows) and a parent-row toggle (`proj-0`) only re-evaluates the parent and its auto-selected dependency (`proj-0` and `proj-450`, `4` reads total).

### Verification
- `yarn lint`: Passed (`0` warnings/errors)
- `yarn typecheck`: Passed (`tsc --noEmit`)
- `yarn test --run`: Passed (19 test files, 252 tests)
