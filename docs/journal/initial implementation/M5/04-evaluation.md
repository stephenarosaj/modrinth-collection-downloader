# Milestone M5 — Polish and Release: Code Review Evaluation Log

Evaluation of the findings from `03-code-review.md` across two evaluator batches.


---

## Batch 1: Findings 1–3

### Finding 1 (P1 — High): Failed collection version fetches duplicate projects into review tables with false error
- **File / Line:** `src/core/resolver.ts:857-884`, `src/core/resolver.ts:1071-1075`, `docs/decisions.md:65-72`
- **1. Factually accurate?** Yes. In `src/core/resolver.ts:852-874`, when `client.getProjectVersions(projectId, ...)` throws a non-abort error for an individual collection project, the `catch` block sets `versionsByProject.set(projectId, [])` and adds the project to `skipped` (`Failed to fetch versions: ...`), but leaves `projectId` in `exportableCollectionIds`. When at least one other collection project succeeds, `computeEnvironmentClosureInMemory` and `allEntryProjectIds` (`src/core/resolver.ts:1071`) include `...exportableCollectionIds`, creating a collection `Entry` with `version: null` and `resolution: 'none'`. As a result, the fetch-failed project renders in both the `Skipped Projects` section and the per-type review table (where it displays a false `No compatible version` / `NO_COMPATIBLE_VERSION` error badge once an environment toggle is turned on).
- **2. Worthwhile fix?** Yes. A transient API/network failure when fetching a collection project's versions is distinct from a project having zero compatible versions on Modrinth (`NO_COMPATIBLE_VERSION`). Duplicating a skipped project into the review table misleads users with a false compatibility error and bloats `instance.entries`.
- **3. Not overly strict or over-engineered?** Yes. Filtering fetch-failed collection project IDs out of the active collection root list after the 100%-failure check is a minimal, localized change (~5 lines) that still allows `dependencyProjectIds` to include the project if another succeeded entry requires it as a dependency.
- **4. Verdict:** `ACCEPT`
  - **Fixer Instructions:**
    1. In `src/core/resolver.ts` around line `832`, declare `const failedCollectionProjectIds = new Set<string>();`.
    2. Inside the `catch` block (`src/core/resolver.ts:856`), call `failedCollectionProjectIds.add(projectId);`.
    3. After the 100%-failure check (`src/core/resolver.ts:877-882`), define `const resolvedCollectionIds = exportableCollectionIds.filter((id) => !failedCollectionProjectIds.has(id));` and use `resolvedCollectionIds` in place of `exportableCollectionIds` for `collectionIdSet` (`line 885`), `computeEnvironmentClosureInMemory` (`lines 893, 905`), and `allEntryProjectIds` (`line 1072`).
    4. In `docs/decisions.md` under `D-008` (`lines 68-72`), clarify that when a subset of collection projects fail `getProjectVersions`, those fetch-failed collection projects are recorded in `skipped` (`Failed to fetch versions: ...`) and omitted from collection `entries` (so they are not duplicated into per-type review tables with a false `NO_COMPATIBLE_VERSION` status unless required as a dependency by a succeeded entry).

---

### Finding 2 (P1 — High): Server zip retry button misroutes to `client.zip` export
- **File / Line:** `src/ui/components/ExportBar.tsx:82-86`, `src/ui/download.ts:40-46`, `src/ui/download.ts:141`
- **1. Factually accurate?** Yes. `exportEnvironmentZip` (`src/ui/download.ts:141`) formats archive filenames as `` `${instance.meta.source.collectionId}-${env}.zip` `` (e.g., `col-m5-server.zip`) and `ExportEnvironmentZipResult` (`src/ui/download.ts:40-46`) does not include an `env` field. In `src/ui/components/ExportBar.tsx:82-86`, `retryZipEnv` falls back to `zipResult.filename.startsWith('server') ? 'server' : 'client'`, which evaluates to `'client'` for any collection ID not starting with `'server'` (and misroutes `'client'` to `'server'` if the collection ID starts with `'server'`).
- **2. Worthwhile fix?** Yes. Without this fix, clicking the retry button after a failed `server.zip` export wrongly displays `Retry client.zip export` and triggers a `client.zip` export.
- **3. Not overly strict or over-engineered?** Yes. Adding `env?: EnvironmentId` to `ExportEnvironmentZipResult`, populating `env` in `exportEnvironmentZip`, and fixing the filename suffix fallback in `ExportBar.tsx` is simple and direct.
- **4. Verdict:** `ACCEPT`
  - **Fixer Instructions:**
    1. In `src/ui/download.ts:40-46`, add `env?: EnvironmentId;` to `ExportEnvironmentZipResult`, and include `env,` in all return objects of `exportEnvironmentZip` (`lines 145, 242, 293`).
    2. In `src/ui/components/ExportBar.tsx:82-86`, compute `retryZipEnv` as:
       ```ts
       const retryZipEnv: EnvironmentId | null =
         zipResult !== null
           ? (zipResult.env ??
             (zipResult.filename.endsWith('-server.zip') || zipResult.filename.startsWith('server.')
               ? 'server'
               : 'client'))
           : null;
       ```

---

### Finding 3 (P2 — Moderate): Zip retry button ignores environment toggle and empty-selection guards
- **File / Line:** `src/ui/components/ExportBar.tsx:208-217`
- **1. Factually accurate?** Yes. In `src/ui/components/ExportBar.tsx:213`, the `.zip-retry-btn` button sets `disabled={isExporting || isRecomputing}` instead of using `clientZipDisabled` / `serverZipDisabled` (`lines 64-76`). If the user turns off the target environment toggle or deselects all rows in that environment after a failed export, the retry button remains enabled, bypassing §7.3.1 ("Export actions (§8) that target an environment (e.g. `client.zip`) are disabled while that environment's toggle is off").
- **2. Worthwhile fix?** Yes. It enforces the §7.3.1 environment lock invariant consistently across both primary and retry export buttons and prevents empty/locked exports.
- **3. Not overly strict or over-engineered?** Yes. It reuses the already-computed `serverZipDisabled` and `clientZipDisabled` booleans in `ExportBar.tsx`.
- **4. Verdict:** `ACCEPT`
  - **Fixer Instructions:**
    1. In `src/ui/components/ExportBar.tsx:213`, replace `disabled={isExporting || isRecomputing}` with `disabled={retryZipEnv === 'server' ? serverZipDisabled : clientZipDisabled}`.

---

## Batch 2: Findings 4–5

### Finding 4 (P2 — Moderate): `formatUserFacingError` omits promised `404`, `5xx`, and network error guidance
- **File / Line:** `src/ui/utils.ts:8-25`, `docs/implementation/journal/M5/01-plan.md:8`, `docs/user-guide.md:41`, `docs/decisions.md:89`
- **1. Factually accurate?** Yes. `formatUserFacingError` in `src/ui/utils.ts:18-24` currently only checks for `429` / rate-limit strings and returns `rawMessage` verbatim for HTTP `404`, HTTP `5xx`, and network disconnect errors (`Failed to fetch`, `NetworkError`), whereas `M5/01-plan.md` (§1), `docs/user-guide.md:41`, and `docs/decisions.md:89` specify that `formatUserFacingError` translates `429`, `404`, `5xx`, and network errors into clear, actionable guidance while preserving technical details.
- **2. Worthwhile fix?** Yes. Formatting HTTP `404`, `5xx`, and network errors with actionable guidance while preserving `(${rawMessage})` aligns the UI error banner with the documented UX and keeps existing tests passing (including `tests/ui/m3-1-tables.test.tsx:537` which checks `toHaveTextContent('Collection 404: not found on Modrinth')` and `tests/ui/m5-polish.test.tsx:235` which checks `Collection not found: xyz` passthrough).
- **3. Not overly strict or over-engineered?** Yes. It requires only three concise regex branches in `src/ui/utils.ts`.
- **4. Verdict:** `ACCEPT`
  - **Fixer Instructions:**
    1. In `src/ui/utils.ts:18-24`, extend `formatUserFacingError` after the `429` rate-limit branch with branches for `404`, `5xx`, and network errors that preserve `(${rawMessage})` and avoid double-wrapping already-clear messages:
       ```ts
       const isNotFound = /\b404\b/i.test(rawMessage);
       const alreadyHasNotFoundGuidance = /^collection not found:/i.test(rawMessage);
       if (isNotFound && !alreadyHasNotFoundGuidance) {
         return `Requested Modrinth resource was not found (${rawMessage}). Verify the collection ID or URL is public and valid.`;
       }

       const isServerError =
         /\b50[0234]\b|bad gateway|service unavailable|gateway timeout|internal server error/i.test(
           rawMessage,
         );
       if (isServerError) {
         return `Modrinth server error (${rawMessage}). Please wait a moment and retry.`;
       }

       const isNetworkError =
         /failed to fetch|network\s*error|load failed|network request failed/i.test(rawMessage);
       if (isNetworkError) {
         return `Network connection error (${rawMessage}). Check your internet connection and retry.`;
       }
       ```

---

### Finding 5 (P2 — Moderate): M5 test suite misses `server.zip` retry, partial-fetch table exclusion, dependency `getProjects` failure, and `React.memo` row-isolation assertions
- **File / Line:** `tests/ui/m5-polish.test.tsx:223-240`, `tests/ui/m5-polish.test.tsx:327-420`, `tests/ui/m5-polish.test.tsx:422-486`, `tests/ui/m5-polish.test.tsx:570-616`
- **1. Factually accurate?** Yes. In `tests/ui/m5-polish.test.tsx`:
  - `1. formatUserFacingError` (`lines 223-240`) only tests `429`, passthrough, and empty fallbacks, omitting `404`, `5xx`, and network error assertions.
  - `2. Partial-Result Resolution Resilience` (`lines 326-419`) asserts that `Beta Mod` is in `Skipped Projects` when `versions:mod-beta` fails, but does not assert `expect(within(modsSection).queryByText('Beta Mod')).not.toBeInTheDocument()` (allowing Finding 1 to slip through), nor does it test `client.getProjects` failing on transitive dependency lookups (`src/core/resolver.ts:942-982`).
  - `3. Zip Export Retry UX` (`lines 421-485`) only tests `Export client.zip` -> `Retry client.zip export` and never tests `Export server.zip` -> `Retry server.zip export` or the disabled state when the environment toggle is turned off (allowing Findings 2 and 3 to slip through).
  - `5. Performance Pass at 500 Rows` (`lines 569-616`) only checks `elapsedMs < 2000` without verifying that `EntryTableRow`'s `React.memo` comparator (`areEntryRowPropsEqual`) actually skips re-rendering unaffected rows on a single-row selection toggle.
- **2. Worthwhile fix?** Yes. Directly closes the test gaps for Findings 1–4 and verifies the `React.memo` row isolation required by `M5/01-plan.md` (§3).
- **3. Not overly strict or over-engineered?** Yes. Note that for the `React.memo` row-isolation assertion, instead of `vi.spyOn(core, 'formatPlatformDisplayName')` (which cannot intercept direct ESM named imports inside `EntryTables.tsx`), the test can count property reads on a render-only `VersionRef` getter (such as `versionType`, which is read inside `EnvironmentCell` during render but not read by `deselectEntry`, `toTables`, `computeEntryStatus`, or `areEntryRowPropsEqual`) when `<EntryTables />` re-renders after toggling one row in the 500-entry instance.
- **4. Verdict:** `ACCEPT`
  - **Fixer Instructions:**
    1. In `tests/ui/m5-polish.test.tsx` (`describe('1. formatUserFacingError...')`, around `line 235`), add unit assertions covering HTTP `404` (`new Error('Modrinth API error 404 (Not Found)')`), HTTP `5xx` (`new Error('HTTP 502 Bad Gateway')` / `503`), and network errors (`new Error('TypeError: Failed to fetch')`), while keeping the existing `'Collection not found: xyz'` passthrough assertion.
    2. In `tests/ui/m5-polish.test.tsx` (`describe('2. Partial-Result Resolution Resilience')`):
       - At `line 347`, assert `expect(within(modsSection).queryByText('Beta Mod')).not.toBeInTheDocument();`.
       - In the dependency degradation test (`lines 384-418`) or a companion test, also test `client.getProjects` throwing a non-abort error during the dependency fetch phase (while initial collection `getProjects` succeeds) and assert that `result.skipped` records `id: 'dep-gamma'` with `reason: expect.stringContaining('Failed to fetch dependency project:')` and `progressMessages` includes `'Warning: Failed to fetch dependency projects'`.
    3. In `tests/ui/m5-polish.test.tsx` (`describe('3. Zip Export Retry UX')`, after `line 484`), add a test that enables the `Server environment` toggle, triggers `Export server.zip` with a simulated fetch failure, verifies the retry button is labeled `Retry server.zip export`, verifies turning off `Server environment` disables `Retry server.zip export` and turning it back on re-enables it, and verifies clicking `Retry server.zip export` produces `col-m5-server.zip`.
    4. In `tests/ui/m5-polish.test.tsx` (`describe('5. Performance Pass at 500 Rows')`), verify `React.memo` row isolation on `EntryTableRow` / `EnvironmentCell` by rendering `<EntryTables />` with the 500-entry instance where each entry's `version` tracks reads of `versionType` via `Object.defineProperty` (or equivalent render counter), resetting the counter after initial render (`>= 500` reads), re-rendering with `deselectEntry(instance500, 'proj-0', 'client').instance`, and asserting that `versionType` is read only for the 2 affected rows (`proj-0` and `proj-450`, i.e. `< 20` reads rather than `>= 500`).
