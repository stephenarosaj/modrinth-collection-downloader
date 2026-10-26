# Milestone M5 — Polish and Release: Code Review Report

## Code Review Results

**Scope:** `HEAD` -> working tree (21 changed files, 871 executable lines)
**Intent:** Complete Milestone M5 (Polish and Release) by adding error and rate-limit UX formatting (`formatUserFacingError`), Retry buttons for collection resolution and zip export, partial-result resolution resilience in `resolveCollection`, empty/edge states (`Getting started` and all-skipped collection notice), 500-row performance verification, GitHub Pages deployment workflow + Vite relative base config, and full §12 documentation with SVG screenshots and manual QA checklist.
**Mode:** markdown report-only (`apply=false`)

**Reviewers:** `correctness`, `testing`, `reliability`, `adversarial`, `julik-frontend-races`, `blast-radius`
- `testing` -- diff adds `tests/ui/m5-polish.test.tsx` and modifies runtime error, retry, and partial-resolution paths
- `reliability` -- diff adds partial-failure recovery, rate-limit formatting, and retry controls in `src/core/resolver.ts` and `src/ui/`
- `adversarial` -- diff exceeds 50 executable lines (871 lines) and introduces `.github/workflows/deploy.yml`
- `julik-frontend-races` -- diff modifies async UI flows, `AbortController` lifecycles, and retry button states in `App.tsx`, `ExportBar.tsx`, and `ResolveProgressPanel.tsx`
- `blast-radius` -- diff spans `src/core/`, `src/ui/`, `vite.config.ts`, `.github/workflows/deploy.yml`, and documentation

### Triage Groups

| Group | Findings | Context | Preferred Resolution | Why |
|-------|----------|---------|----------------------|-----|
| Zip export retry routing and disabled guards (apply-queue) | #2, #3, #5 | `ExportBar.tsx` infers the failed zip environment with `startsWith('server')` and omits environment-lock/empty-selection guards on the retry button | Fix `retryZipEnv` and `disabled` in `ExportBar.tsx` (#2, #3) first, then add the `server.zip` retry test in `tests/ui/m5-polish.test.tsx` (#5) | One localized update in `ExportBar.tsx` (and optional `env` field in `ExportEnvironmentZipResult`) resolves both UI bugs before locking them in with tests |
| Partial-result collection version failure handling (apply-queue) | #1, #5 | Collection projects whose `getProjectVersions` call throws are recorded in `skipped` but also remain in `exportableCollectionIds`, duplicating them into review tables | Filter failed collection project IDs out of `exportableCollectionIds` after the 100%-failure check in `src/core/resolver.ts` (#1), then assert table exclusion and dependency `getProjects` failure in `tests/ui/m5-polish.test.tsx` (#5) | Fixing `resolver.ts` first makes the table-exclusion assertion pass cleanly |
| Error UX formatting and 500-row memoization verification (apply-queue) | #4, #5 | `formatUserFacingError` only formats `429` rate limits (omitting promised `404`, `5xx`, and network guidance), and the 500-row test only checks `< 2000ms` without verifying `React.memo` row isolation | Extend `formatUserFacingError` in `src/ui/utils.ts` (#4), then add `404`/`5xx`/network unit assertions and a `React.memo` row-isolation check in `tests/ui/m5-polish.test.tsx` (#5) | Aligns implementation and test suite with `M5/01-plan.md`, `docs/user-guide.md`, and `docs/decisions.md` |

### P1 -- High

| # | File | Issue | Reviewer | Confidence |
|---|------|-------|----------|------------|
| 1 | `src/core/resolver.ts:858` | Failed collection version fetches duplicate projects into review tables with false error | reliability, adversarial, blast-radius, correctness | 100 |
| 2 | `src/ui/components/ExportBar.tsx:85` | Server zip retry button misroutes to `client.zip` export | correctness, reliability, adversarial, julik-frontend-races, blast-radius, fast-pass | 100 |

- **#1** (`Finding 1`) — When a collection project's `getProjectVersions` call fails with a non-abort error during partial-result resolution, the project is recorded in `skipped` (`Failed to fetch versions: ...`) at `src/core/resolver.ts:860`, but its ID remains in `exportableCollectionIds` with `versionsByProject.set(projectId, [])`. Consequently, lines `1071-1135` still construct a collection `Entry` with `version: null` and `resolution: 'none'`, causing the failed project to appear in **both** the `Skipped Projects` section and the per-type review table (with a false `NO_COMPATIBLE_VERSION` error badge once an environment is unlocked). Track failed collection project IDs in a `Set<string>` inside the `catch` block and filter them out of `exportableCollectionIds` after the 100%-failure check at lines `879-884`.
- **#2** (`Finding 2`) — When a `server.zip` export encounters partial or total binary download failures, the `.zip-partial-failure-alert` banner in `src/ui/components/ExportBar.tsx:82-86` renders `Retry client.zip export` and clicking it invokes `onExportEnvironmentZip('client')` instead of retrying `server.zip`. `exportEnvironmentZip` (`src/ui/download.ts:141`) formats archive filenames as `${instance.meta.source.collectionId}-${env}.zip` and `ExportEnvironmentZipResult` does not carry an `env` property, so `zipResult.filename.startsWith('server')` evaluates to `false` unless the collection ID itself begins with `'server'` (and conversely misroutes a `client.zip` retry to `'server'` if the collection ID starts with `'server'`). Add `env: EnvironmentId` to `ExportEnvironmentZipResult` in `src/ui/download.ts` and update the fallback in `src/ui/components/ExportBar.tsx:85` to check `zipResult.filename.endsWith('-server.zip') || zipResult.filename.startsWith('server') ? 'server' : 'client'`.

### P2 -- Moderate

| # | File | Issue | Reviewer | Confidence |
|---|------|-------|----------|------------|
| 3 | `src/ui/components/ExportBar.tsx:213` | Zip retry button ignores environment toggle and empty-selection guards | julik-frontend-races, adversarial | 100 |
| 4 | `src/ui/utils.ts:18` | `formatUserFacingError` omits promised `404`, `5xx`, and network error guidance | reliability, adversarial, testing, fast-pass | 100 |
| 5 | `tests/ui/m5-polish.test.tsx:344` | M5 test suite misses `server.zip` retry, partial-fetch table exclusion, dependency `getProjects` failure, and `React.memo` row-isolation assertions | testing, correctness, reliability, adversarial, julik-frontend-races, blast-radius | 100 |

- **#3** (`Finding 3`) — In `src/ui/components/ExportBar.tsx:213`, the `.zip-retry-btn` button only sets `disabled={isExporting || isRecomputing}`, ignoring whether the target environment's toggle is active (`activeEnvironments[retryZipEnv]`), whether any files remain selected (`clientFileCount === 0` / `serverFileCount === 0`), or `canExportZip`. If a user locks the environment toggle or deselects all rows after a failed export, clicking `Retry <env>.zip export` bypasses §7.3.1 ("Export actions (§8) that target an environment (e.g. `client.zip`) are disabled while that environment's toggle is off"). Use `disabled={retryZipEnv === 'server' ? serverZipDisabled : clientZipDisabled}`.
- **#4** (`Finding 4`) — `src/ui/utils.ts:18-24` (`formatUserFacingError`) only checks for HTTP `429` / rate-limit messages and returns all other errors verbatim, even though `docs/implementation/journal/M5/01-plan.md:8`, `docs/user-guide.md:829`, and `docs/decisions.md:265` state that it formats HTTP `429` rate limits, `404` missing collections/projects, `5xx` server errors, and network disconnects into clear, actionable guidance while preserving technical details. Add pattern branches for `404`, `5xx`, and network errors (`Failed to fetch` / `NetworkError`) when the raw message does not already contain user-facing guidance.
- **#5** (`Finding 5`) — `tests/ui/m5-polish.test.tsx` has four verification gaps that allowed Findings #1-#4 to pass unnoticed: (a) `3. Zip Export Retry UX` (line 422) only tests `client.zip` retry and never tests `server.zip` retry (`col-m5-server.zip`) or retry button disabled states when the environment toggle is turned off; (b) `2. Partial-Result Resolution Resilience` (line 344) asserts `Beta Mod` is in `Skipped Projects` when `versions:mod-beta` fails, but does not assert `expect(within(modsSection).queryByText('Beta Mod')).not.toBeInTheDocument()`, and does not test `client.getProjects(missingProjects)` failing during transitive dependency resolution (`src/core/resolver.ts:952-992`); (c) `1. formatUserFacingError` (line 223) does not test `404`, `5xx`, or `Failed to fetch` inputs; and (d) `5. Performance Pass at 500 Rows` (line 570) only asserts `elapsedMs < 2000` without verifying that `EntryTableRow`'s `React.memo` comparator (`areEntryRowPropsEqual`) actually skips re-rendering unaffected rows when a single row is toggled.

---

## Detailed Numbered Findings Reference

### Finding 1 (P1 — High)
- **File / Line:** `src/core/resolver.ts:857-884`, `src/core/resolver.ts:1071-1075`
- **Problem Description:**
  When `client.getProjectVersions` throws a non-abort error for an individual collection project during partial-result resolution, the `catch` block at `src/core/resolver.ts:852-874` sets `versionsByProject.set(projectId, [])` and calls `recordSkipped(...)`, but leaves `projectId` in `exportableCollectionIds`. As a result, when at least one other collection project succeeds:
  1. `computeEnvironmentClosureInMemory` treats the failed project as an active collection project with `0` compatible versions.
  2. `allEntryProjectIds` (`src/core/resolver.ts:1071`) includes `...exportableCollectionIds`, building a collection `Entry` with `version: null` and `resolution: 'none'` in both environments.
  3. In the UI, the project is rendered **twice**: once in the `Skipped Projects` section (`Failed to fetch versions: ...`) and again in the main per-type review table showing `No compatible version` and a red `!` (`NO_COMPATIBLE_VERSION`) error status when an environment toggle is turned on.
- **Recommended Fix:**
  Track failed collection project IDs in a `Set<string>` (e.g. `const failedCollectionProjectIds = new Set<string>()`), add `projectId` to that set inside the `catch` block at `src/core/resolver.ts:856`, and after the 100%-failure check at lines `879-884`, remove failed project IDs from `exportableCollectionIds` (or construct `const resolvedCollectionIds = exportableCollectionIds.filter((id) => !failedCollectionProjectIds.has(id))`) so that unreferenced fetch-failed collection projects appear only in `skipped` (while still allowing `dependencyProjectIds` to include them if a succeeded project requires them as a dependency).

### Finding 2 (P1 — High)
- **File / Line:** `src/ui/components/ExportBar.tsx:82-86`, `src/ui/download.ts:40-46`, `src/ui/download.ts:141`
- **Problem Description:**
  In `src/ui/components/ExportBar.tsx:82-86`, `retryZipEnv` is computed as:
  ```ts
  const retryZipEnv: EnvironmentId | null =
    zipResult !== null
      ? ((zipResult as { env?: EnvironmentId }).env ??
        (zipResult.filename.startsWith('server') ? 'server' : 'client'))
      : null;
  ```
  However, `ExportEnvironmentZipResult` (`src/ui/download.ts:40-46`) does not define an `env` field, and `exportEnvironmentZip` (`src/ui/download.ts:141`) constructs `filename` as `` `${instance.meta.source.collectionId}-${env}.zip` `` (for example, `col-m5-server.zip` or `5OBQuutT-server.zip`). Because `zipResult.filename` starts with the collection ID and **ends** with `-server.zip`, `zipResult.filename.startsWith('server')` evaluates to `false` for all normal collection IDs, causing a failed `server.zip` export to display `Retry client.zip export` and trigger a `client.zip` export when clicked. Conversely, if a collection ID starts with `'server'`, a failed `client.zip` export (`server-pack-client.zip`) misroutes to `Retry server.zip export`.
- **Recommended Fix:**
  1. Add `env: EnvironmentId` to `ExportEnvironmentZipResult` in `src/ui/download.ts` and include `env` in all return objects of `exportEnvironmentZip`.
  2. Update the fallback in `src/ui/components/ExportBar.tsx:82-86` to inspect the `-server.zip` suffix before checking the prefix:
     ```ts
     const retryZipEnv: EnvironmentId | null =
       zipResult !== null
         ? (zipResult.env ??
           (zipResult.filename.endsWith('-server.zip') || zipResult.filename.startsWith('server')
             ? 'server'
             : 'client'))
         : null;
     ```

### Finding 3 (P2 — Moderate)
- **File / Line:** `src/ui/components/ExportBar.tsx:208-217`
- **Problem Description:**
  The `Retry {retryZipEnv}.zip export` button inside `.zip-partial-failure-alert` sets `disabled={isExporting || isRecomputing}` (`src/ui/components/ExportBar.tsx:213`). Unlike the primary `Export client.zip` and `Export server.zip` buttons (`clientZipDisabled` / `serverZipDisabled` at lines `64-76`), it does not check whether `activeEnvironments[retryZipEnv]` is still enabled, whether at least one file is selected in that environment (`clientFileCount === 0` / `serverFileCount === 0`), or `canExportZip`. If a user turns off the `Client` or `Server` environment toggle after a failed export, the retry button remains enabled in violation of §7.3.1 ("Export actions (§8) that target an environment (e.g. `client.zip`) are disabled while that environment's toggle is off").
- **Recommended Fix:**
  In `src/ui/components/ExportBar.tsx:213`, set `disabled={retryZipEnv === 'server' ? serverZipDisabled : clientZipDisabled}` on the `.zip-retry-btn` button.

### Finding 4 (P2 — Moderate)
- **File / Line:** `src/ui/utils.ts:8-25`
- **Problem Description:**
  `docs/implementation/journal/M5/01-plan.md` (§1), `docs/user-guide.md:829`, and `docs/decisions.md:265` state that `formatUserFacingError` translates HTTP `429` rate limits, `404` missing collections/projects, `5xx` server errors, and network disconnects into clear, actionable guidance while preserving technical details. Currently, `formatUserFacingError` in `src/ui/utils.ts:18-24` only matches `429` / rate-limit errors and returns `rawMessage` unchanged for `404`, `5xx`, and network errors (`Failed to fetch`, `NetworkError`).
- **Recommended Fix:**
  Extend `formatUserFacingError` in `src/ui/utils.ts` to also format raw HTTP `404` errors (when not already prefixed with human-readable context like `Collection not found:`), HTTP `5xx` server errors (`/\b50[0234]\b|bad gateway|service unavailable|gateway timeout|internal server error/i`), and network errors (`/failed to fetch|network\s*error|load failed/i`) into clear guidance with `(${rawMessage})` preserved.

### Finding 5 (P2 — Moderate)
- **File / Line:** `tests/ui/m5-polish.test.tsx:223-240`, `tests/ui/m5-polish.test.tsx:327-420`, `tests/ui/m5-polish.test.tsx:422-486`, `tests/ui/m5-polish.test.tsx:570-616`
- **Problem Description:**
  `tests/ui/m5-polish.test.tsx` leaves four testing gaps across the new M5 features:
  1. **Missing `server.zip` retry test:** Only `Retry client.zip export` is tested (`lines 422-486`), which passed by coincidence because `'client'` was the hardcoded fallback in `ExportBar.tsx`. Neither `Retry server.zip export` nor the disabled state when the environment toggle is turned off is tested.
  2. **Missing partial-result table exclusion and dependency `getProjects` error test:** `lines 327-359` verify that failed `Beta Mod` appears in `Skipped Projects`, but never assert `expect(within(modsSection).queryByText('Beta Mod')).not.toBeInTheDocument()`. In addition, the new `try / catch` block for `client.getProjects(missingProjects)` during transitive dependency resolution (`src/core/resolver.ts:952-992`) has no test coverage.
  3. **Missing `404` / `5xx` / network error formatting unit assertions:** `lines 223-240` only test `429` rate-limit strings, a passthrough string, and empty fallbacks.
  4. **Missing `React.memo` row-isolation assertion at 500 rows:** `lines 570-616` only assert `elapsedMs < 2000` (which passes in JSDOM even without memoization) and do not verify that toggling one entry in a 500-row instance skips re-rendering unaffected rows.
- **Recommended Fix:**
  Update `tests/ui/m5-polish.test.tsx` to:
  1. Add a test for `Export server.zip` partial/total failure recovery via `Retry server.zip export` (and verify the retry button is disabled when the `Server` environment toggle is turned off).
  2. Assert `expect(within(modsSection).queryByText('Beta Mod')).not.toBeInTheDocument()` in the partial-result collection test, and add a test where `client.getProjects` fails on transitive dependencies (`missingProjects`).
  3. Add unit assertions for `formatUserFacingError` covering `HTTP 404`, `HTTP 502`/`503`, and `Failed to fetch` network errors.
  4. Verify `React.memo` row isolation in the 500-row test (e.g., by spying on `core.formatPlatformDisplayName`, which is called inside `EntryTableRow` on render, and asserting that toggling `Select Project 000 for Client` invokes `formatPlatformDisplayName` only for the affected rows rather than all 500 rows).

---

### Requirements Completeness

Verified against [IMPLEMENTATION_PLAN_v1.MD](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD) (§10, §11, §12, §13 M5, §14) and [01-plan.md](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/docs/implementation/journal/M5/01-plan.md) (`plan_source: explicit`):

- [x] **§13 M5 — Error and rate-limit UX (clear messages, retry, partial results):** Partially addressed — collection retry, partial-result resolution, and `429` formatting are implemented, but `server.zip` retry misroutes to `client.zip` (Finding #2), retry button disabled state ignores environment lock (Finding #3), failed collection version fetches duplicate into review tables (Finding #1), and `404`/`5xx`/network error formatting is missing in `formatUserFacingError` (Finding #4).
- [x] **§13 M5 — Empty and edge states:** Met — `Getting started` empty workspace card (`App.tsx`) and empty vs. all-skipped collection messaging (`EntryTables.tsx`) are implemented and accessible (`0` axe-core violations).
- [x] **§13 M5 — Performance pass at 500 rows:** Partially addressed — `EntryTableRow` uses `React.memo` with `areEntryRowPropsEqual` and 500 rows render quickly, but the test in `tests/ui/m5-polish.test.tsx` only asserts `< 2000ms` without asserting `React.memo` row isolation (Finding #5).
- [x] **§13 M5 — Full §12 documentation pass with screenshots & QA checklist:** Met — `README.md`, `CONTRIBUTING.md`, `docs/user-guide.md`, `docs/architecture.md`, `docs/decisions.md` (including D-008, D-009, and the M5 Manual QA checklist), and `docs/screenshots/01..04-*.svg` are complete and adhere to §3 glossary rules.
- [x] **§13 M5 — GitHub Pages deploy workflow & Vite base config:** Met — `.github/workflows/deploy.yml` and `vite.config.ts` (`base: process.env.VITE_BASE_PATH ?? './'`) are cleanly configured.
- [x] **§14 — Clean architecture & pure `core/`:** Met — `src/core/` has zero React/DOM/fetch/adapter imports and passes ESLint boundary checks.

### Actionable Findings

| # | File | Issue | Route | Notes |
|---|------|-------|-------|-------|
| 1 | `src/core/resolver.ts:858` | Failed collection version fetches duplicate projects into review tables with false error | `gated_auto -> downstream-resolver` | `suggested_fix` present — filter failed IDs out of `exportableCollectionIds` after 100%-failure check |
| 2 | `src/ui/components/ExportBar.tsx:85` | Server zip retry button misroutes to `client.zip` export | `gated_auto -> downstream-resolver` | `suggested_fix` present — add `env` to `ExportEnvironmentZipResult` and check `endsWith('-server.zip')` |
| 3 | `src/ui/components/ExportBar.tsx:213` | Zip retry button ignores environment toggle and empty-selection guards | `gated_auto -> downstream-resolver` | `suggested_fix` present — use `retryZipEnv === 'server' ? serverZipDisabled : clientZipDisabled` |
| 4 | `src/ui/utils.ts:18` | `formatUserFacingError` omits promised `404`, `5xx`, and network error guidance | `gated_auto -> downstream-resolver` | `suggested_fix` present — add `404`, `5xx`, and network error branches |
| 5 | `tests/ui/m5-polish.test.tsx:344` | M5 test suite misses `server.zip` retry, partial-fetch table exclusion, dependency `getProjects` failure, and `React.memo` row-isolation assertions | `gated_auto -> downstream-resolver` | `suggested_fix` present — add targeted assertions and tests in `tests/ui/m5-polish.test.tsx` |

### Coverage

- **Suppressed:** 0 findings suppressed by confidence gate (`0` at anchor 50, `0` at anchor 25); 0 malformed findings.
- **Mode-aware demotions:** 0 findings demoted.
- **Quote-the-line gate:** 0 findings demoted for missing `first_evidence`.
- **Stage 5b Validator pass:** Skipped for all 5 findings because every finding carries `first_evidence` and is independently corroborated by >=2 distinct persona reviewers (#1 by 4 reviewers, #2 by 5 reviewers, #3 by 2 reviewers, #4 by 3 reviewers, #5 by 6 reviewers).
- **Settlement suppression:** Evaluated authoritatively against `IMPLEMENTATION_PLAN_v1.MD` and `docs/implementation/journal/M5/01-plan.md` (`plan_source: explicit`); 0 settlement conflicts.
- **Preliminary fast-pass reconciliation:** Both fast-pass items (`ExportBar.tsx:85` P1 and `utils.ts:18` P2) were independently corroborated by multiple persona reviewers and merged into Findings #2 and #4 (0 fast-pass items withdrawn; 0 survived from fast-pass alone).
- **Residual risks:**
  - Partial-result skip reasons recorded in `resolveSkipped` for transient fetch failures are in-memory session state and are not persisted in `instance.json` (`Instance` schema v1 stores `entries`), so exporting and re-importing a partial-result `Instance` offline does not restore transient fetch-failure entries in `Skipped Projects`.
  - Retrying a partially failed zip export via `Retry <env>.zip export` re-downloads all selected files for that environment rather than caching binaries from the prior attempt.
  - When `getVersionsByIds` fails for pinned dependency versions during partial-result resolution (`src/core/resolver.ts:1046-1056`), the resolver logs a progress warning and falls back to `latest-compatible` / `game-version-fallback` without attaching a pin-specific status warning on the entry.
- **Testing gaps:**
  - `AbortError` propagation inside the new `catch` blocks in `resolveCollection` (`src/core/resolver.ts:853, 955, 1011, 1047`) is only tested at the initial `getCollection` stage, not mid-phase during dependency fetches.

---

> **Verdict:** Ready with fixes
>
> **Reasoning:** Milestone M5's architecture, GitHub Pages deployment workflow, empty/edge states, accessibility, and §12 documentation with screenshots are well-structured, but two high-priority behavioral bugs in the new retry/partial-resolution paths (#1 duplicate review-table rows for fetch-failed collection projects, #2 `server.zip` retry button misrouting to `client.zip`) and three moderate polish/test gaps (#3 retry button disabled guard, #4 `404`/`5xx`/network error formatting, #5 test assertions) should be fixed before completion.
>
> **Fix order:** #1 (`src/core/resolver.ts:858` P1) -> #2 & #3 (`src/ui/components/ExportBar.tsx:85, 213` P1/P2) -> #4 (`src/ui/utils.ts:18` P2) -> #5 (`tests/ui/m5-polish.test.tsx:344` P2)

### Actionable Findings Summary

1. **#1** | **P1** | `src/core/resolver.ts:858` | Failed collection version fetches duplicate projects into review tables | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
2. **#2** | **P1** | `src/ui/components/ExportBar.tsx:85` | Server zip retry button misroutes to `client.zip` export | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
3. **#3** | **P2** | `src/ui/components/ExportBar.tsx:213` | Zip retry button ignores environment toggle and empty-selection guards | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
4. **#4** | **P2** | `src/ui/utils.ts:18` | `formatUserFacingError` omits promised `404`, `5xx`, and network error guidance | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
5. **#5** | **P2** | `tests/ui/m5-polish.test.tsx:344` | M5 test suite misses `server.zip` retry, partial-fetch table exclusion, dependency `getProjects` failure, and `React.memo` row-isolation assertions | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
