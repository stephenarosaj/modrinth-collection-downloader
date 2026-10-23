# Milestone M3.1 Code Review Report (`03-code-review.md`)

## Code Review Results

**Scope:** `HEAD` -> working tree (12 files changed, 1,275 executable lines across `src/app/`, `src/ui/`, `tests/ui/`, and `docs/`)
**Intent:** Implement Milestone M3.1 (Read-only tables + JSON export) of `modrinth-collection-downloader`: `TargetForm` (collection URL/ID, release-only game versions, platforms, release preference), `ResolveProgressPanel` (counts, progress bar, log, cancel), `EntryTables` (per-type tables in canonical order, environment cells with version/support/fallback/unsupported/missing states, dependency footers with `required by`), `SkippedSection`, `<collectionId>-instance.json` export, UI tests, and user guide documentation.
**Mode:** markdown report-only (`apply=false`)

> [!NOTE]
> Verifying requirements against specified plan: `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` (§3 Glossary, §5 Architecture & Boundaries, §7.5 Review UI, §7.6 Flow, §8.2 `instance.json`, §12 Documentation, §13 Milestone M3.1).

**Reviewers:** `correctness`, `testing`, `maintainability`, `julik-frontend-races`
- `testing` -- new UI test suite `tests/ui/m3-1-tables.test.tsx` and new React UI components
- `maintainability` -- new UI component hierarchy, architectural boundary enforcement (§5.1), glossary (§3), and user guide alignment (§12)
- `julik-frontend-races` -- async tag loading, collection resolution lifecycle, `AbortController` cancellation, and DOM blob download flow

### Triage Groups

| Group | Findings | Context | Preferred Resolution | Why |
|-------|----------|---------|----------------------|-----|
| Resolution lifecycle & state reset (`App.tsx` / `ResolveProgressPanel.tsx`) | #1 (`F-01`), #2 (`F-02`), #3 (`F-03`) | Async resolution lifecycle transitions on abort, re-resolve, error, and cancel (`apply-queue`) | Fix #1 (`F-01`) first by guarding controller ownership on `abortControllerRef.current`, then reset stale `instance`/`resolveSkipped` on new load (#2 / `F-02`), and update `ResolveProgressPanel` terminal phase labels (#3 / `F-03`) | All three govern state transitions across `handleLoadCollection`, `handleCancelResolve`, and `ResolveProgressPanel` |
| Export & download error resilience (`download.ts` / `App.tsx`) | #4 (`F-04`), #7 (`F-07`) | Shared UI error/cleanup helpers (`apply-queue`) | Add `try / finally` DOM cleanup in `triggerTextDownload` and `try / catch` error handling in `handleExportJson` (#4 / `F-04`), and deduplicate `isAbortError` (#7 / `F-07`) | Ensures clean resource teardown and consistent error utilities across `src/ui/` |
| M3.1 UI test coverage (`tests/ui/m3-1-tables.test.tsx`) | #5 (`F-05`) | Test suite completeness for M3.1 branches (`apply-queue`) | Extend `tests/ui/m3-1-tables.test.tsx` after applying #1-#4 | Verifies both the existing M3.1 error/download/empty branches and the lifecycle fixes |
| Documentation & table markup (`docs/user-guide.md` / `EntryTables.tsx`) | #6 (`F-06`), #8 (`F-08`) | Documentation accuracy and HTML table semantics (`apply-queue`) | Update `docs/user-guide.md` (#6 / `F-06`) and adjust `Dependencies` `<tbody>`/`scope="rowgroup"` markup (#8 / `F-08`) | Independent polish items with zero runtime risk |

---

### P1 -- High

| # | ID | File | Issue | Reviewer | Confidence |
|---|----|------|-------|----------|------------|
| 1 | `F-01` | `src/ui/App.tsx:119` | Aborted or superseded resolution controller clobbers in-flight state in `handleLoadCollection` | correctness, julik-frontend-races | 100 |

- **#1 (`F-01`)** — **Problem:** In `src/ui/App.tsx:83-127`, when an in-flight collection resolution is aborted (via `handleCancelResolve`, a subsequent `handleLoadCollection` call, or component unmount), `resolveCollection` rejects asynchronously on a microtask. In the `catch` block (`src/ui/App.tsx:119-123`), `if (controller.signal.aborted || isAbortError(err))` unconditionally calls `setIsResolving(false)` and `setWasCancelled(true)` without checking `abortControllerRef.current === controller`. If a second resolution has already started (`abortControllerRef.current` points to the new controller), the first controller's delayed abort rejection flips `isResolving` to `false` (re-enabling the form and hiding the Cancel button) and displays `"Resolution cancelled."` while the second resolution is still running. On unmount, it also invokes state setters on an unmounted component.
  - **Proposed Fix:** Guard all callbacks and post-`await` branches in `handleLoadCollection` (`onProgress`, the `try` completion path, and the `catch` path) with `if (abortControllerRef.current !== controller) { return; }`, clear `abortControllerRef.current = null` when the active controller finishes or unmounts, and only set `setIsResolving(false)` / `setWasCancelled(true)` when `abortControllerRef.current === controller`.

---

### P2 -- Moderate

| # | ID | File | Issue | Reviewer | Confidence |
|---|----|------|-------|----------|------------|
| 2 | `F-02` | `src/ui/App.tsx:87` | Stale resolved `instance` and `resolveSkipped` remain rendered when a new collection load starts, fails, or is cancelled | julik-frontend-races | 100 |
| 3 | `F-03` | `src/ui/components/ResolveProgressPanel.tsx:37` | `ResolveProgressPanel` displays active phase label after resolution fails or is cancelled | correctness | 100 |
| 4 | `F-04` | `src/ui/download.ts:17` | Unguarded `exportInstanceJson` errors and missing `try / finally` cleanup in `triggerTextDownload` | correctness, julik-frontend-races | 100 |
| 5 | `F-05` | `tests/ui/m3-1-tables.test.tsx:213` | Missing UI test coverage for resolution error alert, `triggerTextDownload` DOM helper, `AbortSignal` propagation, and empty/`newest` branches | testing | 100 |

- **#2 (`F-02`)** — **Problem:** In `src/ui/App.tsx:87-91`, `handleLoadCollection` resets `wasCancelled`, `resolveError`, `progress`, and `logs`, but leaves `instance` and `resolveSkipped` populated from the previous run. If a user resolves Collection A and then submits Collection B, Collection A's review header, tables, skipped section, and `Export instance.json` button remain rendered beneath Collection B's progress bar—and stay on screen if Collection B fails with an error or is cancelled.
  - **Proposed Fix:** Reset `setInstance(null)` and `setResolveSkipped([])` at the start of `handleLoadCollection` (`src/ui/App.tsx:87-91`) when beginning a new collection resolution in M3.1.
- **#3 (`F-03`)** — **Problem:** In `src/ui/components/ResolveProgressPanel.tsx:37`, `phaseLabel` is computed solely as `progress ? PHASE_LABELS[progress.phase] : 'Initializing'`. When a resolution fails (`error !== null`) or is cancelled (`wasCancelled === true`) while `!isResolving`, the panel header still displays an active in-progress label such as `"Fetching collection"`, `"Resolving versions"`, or `"Initializing"` above the error/cancelled alert.
  - **Proposed Fix:** Compute terminal labels when `!isResolving`: if `wasCancelled` is true, display `"Cancelled"`; if `error` is non-null, display `"Failed"`; otherwise use `progress ? PHASE_LABELS[progress.phase] : 'Initializing'`.
- **#4 (`F-04`)** — **Problem:** In `src/ui/download.ts:17-20`, `triggerTextDownload` appends a temporary `<a download>` element to `document.body`, calls `anchor.click()`, removes the element, and calls `URL.revokeObjectURL(url)` without a `try / finally` block. If `anchor.click()` throws, the hidden anchor remains in `document.body` and the object URL leaks. Furthermore, in `src/ui/App.tsx:132-137`, `handleExportJson` calls `exportInstanceJson(instance, onExportJson)` without a `try / catch`, so any schema validation error thrown by `serialize(instance)` (§8.2) results in an uncaught exception with no user-facing error feedback.
  - **Proposed Fix:** Wrap the DOM append/click in `triggerTextDownload` (`src/ui/download.ts:17-20`) in a `try / finally` block that always removes `anchor` (if attached) and revokes `url`, and wrap `exportInstanceJson(instance, onExportJson)` in `src/ui/App.tsx:132-137` in a `try / catch` that surfaces any export error via an alert banner.
- **#5 (`F-05`)** — **Problem:** `tests/ui/m3-1-tables.test.tsx` covers tag loading, input validation, happy-path resolution, table rendering, schema-valid export via custom `onExportJson`, and clicking Cancel, but leaves four M3.1 UI paths untested: (1) non-abort `resolveCollection` failure rendering the error alert in `ResolveProgressPanel` (`src/ui/App.tsx:124-127`), (2) the default browser download implementation `triggerTextDownload` (`src/ui/download.ts:6-21`), (3) verifying that clicking Cancel actually aborts the `AbortSignal` passed to `ModrinthClient.getCollection` (`tests/ui/m3-1-tables.test.tsx:417-453`), and (4) the `EntryTables` empty state (`tables.length === 0`, `src/ui/components/EntryTables.tsx:121-126`) and `releasePreference: 'newest'` checkbox toggle (`src/ui/components/TargetForm.tsx:138`).
  - **Proposed Fix:** Add test cases in `tests/ui/m3-1-tables.test.tsx` exercising non-abort resolution errors, `triggerTextDownload` DOM/ObjectURL lifecycle, `AbortSignal.aborted === true` on cancel (plus superseded resolution race isolation), empty exportable tables fallback, and `releasePreference: 'newest'`.

---

### P3 -- Low

| # | ID | File | Issue | Reviewer | Confidence |
|---|----|------|-------|----------|------------|
| 6 | `F-06` | `docs/user-guide.md:58` | User guide mismatches actual UI platform formatting and export button placement | maintainability | 100 |
| 7 | `F-07` | `src/ui/components/TargetForm.tsx:34` | Duplicate `isAbortError` helper across `App.tsx` and `TargetForm.tsx` | maintainability | 100 |
| 8 | `F-08` | `src/ui/components/EntryTables.tsx:171` | Dependencies divider uses `scope="colgroup"` inside a single `<tbody>` without `<colgroup>` | maintainability | 75 |

- **#6 (`F-06`)** — **Problem:** `docs/user-guide.md:58` states that the **Platform** column displays lowercase slugs (`e.g., fabric, neoforge, paper`), whereas `EntryTables.tsx:75` formats them via `formatPlatformDisplayName` (`Fabric`, `NeoForge`, `Paper`). Additionally, `docs/user-guide.md:56` gives `https://modrinth.com/project/<slug>` whereas project links use `project.modrinthUrl` (`https://modrinth.com/<type>/<slug>`), and `docs/user-guide.md:110` says `"in the export bar above/below the review tables"` whereas the `Export instance.json` button is rendered in the Collection summary header above the review tables (`src/ui/App.tsx:202-206`).
  - **Proposed Fix:** Update `docs/user-guide.md` lines 56, 58, and 110 to match the rendered UI (`Fabric`, `NeoForge`, `Paper` display names and the Collection summary header above the review tables).
- **#7 (`F-07`)** — **Problem:** `isAbortError(err: unknown): boolean` is duplicated verbatim in `src/ui/App.tsx:25-30` and `src/ui/components/TargetForm.tsx:34-39`.
  - **Proposed Fix:** Extract `isAbortError` into a shared helper (e.g., `src/ui/utils.ts` or `src/core`) and import it in both `App.tsx` and `TargetForm.tsx`.
- **#8 (`F-08`)** — **Problem:** In `src/ui/components/EntryTables.tsx:170-179`, the `Dependencies` footer header row `<tr className="dependencies-divider"><th colSpan={4} scope="colgroup">Dependencies</th></tr>` is placed inside the same `<tbody>` as the collection rows and the table has no `<colgroup>` element. In HTML table semantics, a section header spanning rows belongs in its own `<tbody>` with `scope="rowgroup"`.
  - **Proposed Fix:** Render the dependency divider and dependency rows inside a second `<tbody className="dependencies-body">` with `<th colSpan={4} scope="rowgroup">Dependencies</th>`.

---

### Requirements Completeness (`IMPLEMENTATION_PLAN_v1.MD` — Milestone M3.1)

- **§3 Glossary (`Environment`, `Platform`, `Game version`, `Project type`, `Entry`, `Dependency entry`, `Instance`):** Met. No forbidden `"side"` or `"loader"` terms appear in UI labels, component identifiers, or `docs/user-guide.md`.
- **§5.1 Architectural Boundaries (`ui` imports `core` + `ports` only; `app` wires adapters):** Met. `npm run lint` (`eslint-plugin-boundaries`) passes with zero violations.
- **§7.5 & §13 M3.1 Input Form (`TargetForm`):** Met. Parses collection URL/ID, filters `getGameVersions()` to `release` only, loads platforms from `getPlatforms()`, supports `stable`/`newest` release preference, and provides `"Load collection"` button.
- **§7.6 & §13 M3.1 Resolve Progress (`ResolveProgressPanel`):** Met (with minor terminal label polish in `F-03` and abort ownership fix in `F-01`).
- **§7.5 & §13 M3.1 Per-Type Review Tables (`EntryTables`):** Met. Renders one table per present type in canonical order (`Mods`, `Plugins`, `Datapacks`, `Resource Packs`, `Shaders`), `"Open on Modrinth ↗"` links, formatted platform or `—` for platform-agnostic types, independent `Client` and `Server` columns with version, support badges (`required`/`optional`/`unknown`), `unverified platform` fallback badge, `✗` for unsupported cells, `"No compatible version"` for missing versions, and `Dependencies` footer with `required by: ... (client/server)` attribution. No premature M3.2 selection checkboxes or defaults in the UI.
- **§7.5 & §13 M3.1 Skipped Section (`SkippedSection`):** Met. Displays `modpack`, `.mrpack`, and unsupported project types with reasons.
- **§8.2 & §13 M3.1 `instance.json` Export (`download.ts`):** Met. Serializes and validates against `schema/instance.schema.json` and downloads `<collectionId>-instance.json`.
- **§12 & §13 M3.1 Documentation (`docs/user-guide.md`):** Met (with minor text alignment in `F-06`).

### Actionable Findings

| # | ID | File | Issue | Route | Notes |
|---|----|------|-------|-------|-------|
| 1 | `F-01` | `src/ui/App.tsx:119` | Aborted or superseded resolution controller clobbers in-flight state in `handleLoadCollection` | `gated_auto -> downstream-resolver` | `suggested_fix` present — guard with `abortControllerRef.current === controller` |
| 2 | `F-02` | `src/ui/App.tsx:87` | Stale resolved `instance` and `resolveSkipped` remain rendered when a new collection load starts, fails, or is cancelled | `gated_auto -> downstream-resolver` | `suggested_fix` present — reset `instance` and `resolveSkipped` on load start |
| 3 | `F-03` | `src/ui/components/ResolveProgressPanel.tsx:37` | `ResolveProgressPanel` displays active phase label after resolution fails or is cancelled | `gated_auto -> downstream-resolver` | `suggested_fix` present — show `'Cancelled'` / `'Failed'` when `!isResolving` |
| 4 | `F-04` | `src/ui/download.ts:17` | Unguarded `exportInstanceJson` errors and missing `try / finally` cleanup in `triggerTextDownload` | `gated_auto -> downstream-resolver` | `suggested_fix` present — add `try / finally` in `triggerTextDownload` and `try / catch` in `App.tsx` |
| 5 | `F-05` | `tests/ui/m3-1-tables.test.tsx:213` | Missing UI test coverage for resolution error alert, `triggerTextDownload` DOM helper, `AbortSignal` propagation, and empty/`newest` branches | `gated_auto -> downstream-resolver` | `suggested_fix` present — add targeted UI tests in `tests/ui/m3-1-tables.test.tsx` |
| 6 | `F-06` | `docs/user-guide.md:58` | User guide mismatches actual UI platform formatting and export button placement | `gated_auto -> downstream-resolver` | `suggested_fix` present — align `docs/user-guide.md` with rendered UI |
| 7 | `F-07` | `src/ui/components/TargetForm.tsx:34` | Duplicate `isAbortError` helper across `App.tsx` and `TargetForm.tsx` | `gated_auto -> downstream-resolver` | `suggested_fix` present — extract shared `isAbortError` utility |
| 8 | `F-08` | `src/ui/components/EntryTables.tsx:171` | Dependencies divider uses `scope="colgroup"` inside a single `<tbody>` without `<colgroup>` | `manual -> downstream-resolver` | `suggested_fix` present — wrap dependency rows in separate `<tbody>` with `scope="rowgroup"` |

### Pre-existing Issues

None.

### Coverage

- Reviewers run: `correctness`, `testing`, `maintainability`, `julik-frontend-races` (all 4 completed; `project-standards` not run: no `CLAUDE.md`/`AGENTS.md`/`.agents` rules files in repo)
- Suppressed: 0 findings below anchor 75
- Mode-aware demotions: 3 narrower `testing` findings consolidated into umbrella finding #5 (`F-05`) and `testing_gaps`
- Validator pass: 1 P1 finding (#1 / `F-01`) skipped validator because it carries `first_evidence` and is independently corroborated by two distinct reviewers (`correctness` and `julik-frontend-races`); 0 degraded blockers
- Settlement suppression: evaluated authoritatively against `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` (0 conflicts)
- Residual risks:
  - In `TargetForm`, if `modrinthClient` transitions from a defined client to `undefined`, `gameVersions` and `platforms` are cleared to `[]` while `gameVersion` and `platform` state strings remain cached until another client loads (form submission is already disabled via `tagsReady === false`).
  - `jsdom` does not model CSS layout or scroll containers, so visual scrolling of `.resolve-log` and `.table-wrapper` will be verified in browser QA (M5).
- Testing gaps:
  - Non-abort error handling during collection resolution (`App.tsx` catch block and `ResolveProgressPanel` error alert)
  - Default browser download path via `triggerTextDownload` (`src/ui/download.ts`)
  - Verification that `AbortSignal.aborted` is triggered on `ModrinthClient` requests when clicking Cancel and that superseded resolutions do not clobber active resolution state
  - Empty exportable tables fallback (`EntryTables.tsx` when `tables.length === 0`) and `releasePreference: 'newest'` checkbox toggle (`TargetForm.tsx`)

---

> **Verdict:** Ready with fixes
>
> **Reasoning:** Milestone M3.1 satisfies all functional and architectural requirements in `IMPLEMENTATION_PLAN_v1.MD` (§3, §5.1, §7.5, §7.6, §8.2, §12, §13 M3.1). One P1 async race condition in `handleLoadCollection` (`F-01`, corroborated by `correctness` and `julik-frontend-races`) and several P2/P3 state, error-handling, test-coverage, and documentation polish items (`F-02`–`F-08`) should be addressed before finalizing M3.1.
>
> **Fix order:** `#1 (F-01)` P1 `AbortController` ownership guard -> `#2 (F-02)` & `#3 (F-03)` P2 resolution state reset and terminal phase labels -> `#4 (F-04)` P2 export/download `try / catch` & `try / finally` -> `#7 (F-07)` & `#8 (F-08)` P3 shared `isAbortError` and `<tbody>`/`scope="rowgroup"` -> `#5 (F-05)` P2 UI tests -> `#6 (F-06)` P3 user guide text alignment.

### Actionable Findings Summary

1. **#1 (`F-01`)** | `P1` | `src/ui/App.tsx:119` | Aborted or superseded resolution controller clobbers in-flight state in `handleLoadCollection` | `gated_auto` | `suggested_fix`: yes | confidence: `100`
2. **#2 (`F-02`)** | `P2` | `src/ui/App.tsx:87` | Stale resolved `instance` and `resolveSkipped` remain rendered when a new collection load starts, fails, or is cancelled | `gated_auto` | `suggested_fix`: yes | confidence: `100`
3. **#3 (`F-03`)** | `P2` | `src/ui/components/ResolveProgressPanel.tsx:37` | `ResolveProgressPanel` displays active phase label after resolution fails or is cancelled | `gated_auto` | `suggested_fix`: yes | confidence: `100`
4. **#4 (`F-04`)** | `P2` | `src/ui/download.ts:17` | Unguarded `exportInstanceJson` errors and missing `try / finally` cleanup in `triggerTextDownload` | `gated_auto` | `suggested_fix`: yes | confidence: `100`
5. **#5 (`F-05`)** | `P2` | `tests/ui/m3-1-tables.test.tsx:213` | Missing UI test coverage for resolution error alert, `triggerTextDownload` DOM helper, `AbortSignal` propagation, and empty/`newest` branches | `gated_auto` | `suggested_fix`: yes | confidence: `100`
6. **#6 (`F-06`)** | `P3` | `docs/user-guide.md:58` | User guide mismatches actual UI platform formatting and export button placement | `gated_auto` | `suggested_fix`: yes | confidence: `100`
7. **#7 (`F-07`)** | `P3` | `src/ui/components/TargetForm.tsx:34` | Duplicate `isAbortError` helper across `App.tsx` and `TargetForm.tsx` | `gated_auto` | `suggested_fix`: yes | confidence: `100`
8. **#8 (`F-08`)** | `P3` | `src/ui/components/EntryTables.tsx:171` | Dependencies divider uses `scope="colgroup"` inside a single `<tbody>` without `<colgroup>` | `manual` | `suggested_fix`: yes | confidence: `75`
