# Milestone M5 — Polish and Release: Verification Log

Verification results for each fixer batch in `05-fixes.md`.


---

## Verifier Batch 1: Findings 1–4

### Finding 1 (`src/core/resolver.ts`, `docs/decisions.md`) — `VERIFIED`
- Confirmed `const failedCollectionProjectIds = new Set<string>()` is declared at `src/core/resolver.ts:833` and populated via `failedCollectionProjectIds.add(projectId)` inside the `catch` block at `src/core/resolver.ts:858`.
- Confirmed `const resolvedCollectionIds = exportableCollectionIds.filter((id) => !failedCollectionProjectIds.has(id))` is computed after the 100%-failure check (`src/core/resolver.ts:886-888`) and used for `collectionIdSet` (`line 891`), both `computeEnvironmentClosureInMemory` calls (`lines 899, 911`), and `allEntryProjectIds` (`line 1078`).
- Confirmed `D-008` in `docs/decisions.md:69-70` documents that fetch-failed collection projects are recorded in `skipped` (`Failed to fetch versions: ...`) and omitted from collection `entries` unless required as a dependency by a succeeded entry.

### Finding 2 (`src/ui/download.ts`, `src/ui/components/ExportBar.tsx`) — `VERIFIED`
- Confirmed `ExportEnvironmentZipResult` (`src/ui/download.ts:40-47`) includes `env?: EnvironmentId;`.
- Confirmed `exportEnvironmentZip` includes `env` in all three return objects (`src/ui/download.ts:147`, `245`, and `297`).
- Confirmed `ExportBar.tsx:82-88` computes `retryZipEnv` using `zipResult.env` with fallback `(zipResult.filename.endsWith('-server.zip') || zipResult.filename.startsWith('server.') ? 'server' : 'client')`.

### Finding 3 (`src/ui/components/ExportBar.tsx`) — `VERIFIED`
- Confirmed `.zip-retry-btn` (`src/ui/components/ExportBar.tsx:215`) sets `disabled={retryZipEnv === 'server' ? serverZipDisabled : clientZipDisabled}`, enforcing §7.3.1 environment toggle lock and empty-selection guards on retry.

### Finding 4 (`src/ui/utils.ts`) — `VERIFIED`
- Confirmed `formatUserFacingError` (`src/ui/utils.ts:18-45`) handles `429` rate limits (`lines 18-23`), HTTP `404` (`lines 25-29`, skipping `^collection not found:` passthroughs), HTTP `5xx` (`lines 31-37`), and network errors (`lines 39-43`) with actionable retry/check guidance while preserving `(${rawMessage})`.


---

## Verifier Batch 2: Finding 5

### Finding 5 (`tests/ui/m5-polish.test.tsx`) — `VERIFIED`
- **5a (`formatUserFacingError` unit assertions):** Confirmed `tests/ui/m5-polish.test.tsx:228-263` tests HTTP `404` (`HTTP 404 Not Found`, `Modrinth API error 404 (Not Found)`), HTTP `5xx` (`HTTP 502 Bad Gateway`, `HTTP 503 Service Unavailable`), network errors (`TypeError: Failed to fetch`), and passthroughs (`Collection not found: xyz`, `Collection not found: 404`, and pre-formatted rate-limit guidance).
- **5b (Partial-result table exclusion & transitive `getProjects` failure):** Confirmed `tests/ui/m5-polish.test.tsx:371` asserts `expect(within(modsSection).queryByText('Beta Mod')).not.toBeInTheDocument()` when `versions:mod-beta` fails, and `tests/ui/m5-polish.test.tsx:445-499` tests `client.getProjects` failing on transitive dependency lookup (verifying placeholder dependency creation, `DEPENDENCY_UNAVAILABLE` / `NEEDED_BUT_UNAVAILABLE` status reasons, `Skipped Projects` entry `Failed to fetch dependency project: ...`, and progress warning).
- **5c (`server.zip` retry routing & environment-toggle disabled gating):** Confirmed `tests/ui/m5-polish.test.tsx:567-638` tests `Export server.zip` failure rendering `Retry server.zip export`, disabling `Retry server.zip export` when `Server environment` is toggled off (`§7.3.1`), and exporting `col-m5-server.zip` when re-enabled and clicked.
- **5d (`React.memo` row-isolation check at 500 rows):** Confirmed `tests/ui/m5-polish.test.tsx:771-845` tracks `VersionRef.versionType` property reads across all 500 rows, verifying initial render evaluates all 500 rows while toggling `proj-250` only re-renders `['proj-250']` (`2` reads) and toggling `proj-0` only re-renders `['proj-0', 'proj-450']` (`4` reads total, `< 20`).

### Validation Suite
- `yarn lint`: Passed (`0` warnings/errors)
- `yarn typecheck`: Passed (`tsc --noEmit`)
- `yarn test --run`: Passed (19 test files, 252 tests)
- `yarn build`: Passed (`tsc --noEmit && vite build`)
