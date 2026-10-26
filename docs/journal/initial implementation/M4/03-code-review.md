# Milestone M4 — Multi-Agent Code Review Report (`03-code-review.md`)

## Code Review Results

**Scope:** `HEAD` (`f961f64`) -> working tree (`12` changed files, `1,758` executable lines across `src/app/main.tsx`, `src/ui/App.tsx`, `src/ui/components/ExportBar.tsx`, `src/ui/components/TargetForm.tsx`, `src/ui/download.ts`, `src/ui/styles.css`, `tests/ui/m4-outputs.test.tsx`, `docs/instance-format.md`, `docs/output-formats.md`, `docs/user-guide.md`)
**Intent:** Implement Milestone M4 (Outputs) of `modrinth-collection-downloader`: `client.zip` and `server.zip` export with per-type folders, naming (§8.1), progress/cancel, and partial-failure reporting; offline `instance.json` import restoring review state without network; `.mrpack` export (§8.3) with optional platform version field and plugin exclusion warning; and updated user/format documentation and UI tests.
**Mode:** markdown report-only (`apply=false`)

**Reviewers:** `correctness`, `testing`, `maintainability`, `reliability`, `adversarial`, `blast-radius`, `julik-frontend-races`
- `testing` -- diff adds `tests/ui/m4-outputs.test.tsx` covering M4 export/import flows
- `maintainability` -- diff adds `ExportBar.tsx`, download orchestration in `download.ts`, and state transitions in `App.tsx` and `TargetForm.tsx`
- `reliability` -- diff introduces concurrent binary fetching (`exportEnvironmentZip`), archive generation, file reading, and partial-failure reporting
- `adversarial` -- diff exceeds 50 executable lines (`exec_lines: 1758`) and introduces concurrency and partial-failure semantics
- `blast-radius` -- diff touches composition root (`src/app/main.tsx`), UI components, download utilities, and documentation
- `julik-frontend-races` -- diff adds async UI flows, `AbortController` lifecycles, and concurrent state transitions across export, cancel, and import actions
- `project-standards` -- not run (no applicable `CLAUDE.md`, `AGENTS.md`, or `.agents/` files in repository)

### Triage Groups

| Group | Findings | Context | Preferred Resolution | Why |
|-------|----------|---------|----------------------|-----|
| Export & Import State Lifecycle (`apply-queue`) | #1 (`Finding 1`), #2 (`Finding 2`) | `App.tsx` manages workspace export state (`platformVersion`, `isExporting`) and async cancellation refs across collection loads, offline imports, and archive exports | Reset `platformVersion` in `executeLoadCollection` and `handleImportFile` (#1), then add immediate controller aborts and an `importAbortControllerRef` / `exportAbortControllerRef` guard across `handleImportFile` and `handleExportMrpack` (#2) | Both findings live in `src/ui/App.tsx` lifecycle handlers and together prevent stale state leakage and out-of-order async mutations |
| M4 UI Test Suite Fidelity (`apply-queue`) | #3 (`Finding 3`), #4 (`Finding 4`) | `tests/ui/m4-outputs.test.tsx` has an unconnected `zeroNetworkClient` mock in Test 3 and a missing throwing-click assertion in Test 5 | Pass `modrinthClient={zeroNetworkClient}` (with stubbed tag loaders) and test post-import version switching in Test 3 (#3), and add the throwing `clickSpy` assertion in Test 5 (#4) | Makes both tests genuinely falsifiable in a single pass over `tests/ui/m4-outputs.test.tsx` |

### P1 -- High

| # | ID | File | Issue | Reviewer | Confidence |
|---|----|------|-------|----------|------------|
| 1 | `Finding 1` | `src/ui/App.tsx:230` | Stale `platformVersion` persists across collection loads and imports | adversarial, correctness | 100 |

- **#1 (`Finding 1`)** — **Problem:** When a user enters an optional `.mrpack` platform version (`src/ui/App.tsx:132`, e.g. `0.16.9` for a Fabric instance) and then loads another collection (`executeLoadCollection` at `src/ui/App.tsx:223-235`), re-resolves for a different platform (such as NeoForge or Forge), or imports an `instance.json` file (`handleImportFile` at `src/ui/App.tsx:335-352`), `platformVersion` is never reset. Subsequent `.mrpack` exports silently write the stale loader version under the new platform's dependency key in `modrinth.index.json` (e.g. `"neoforge": "0.16.9"`), producing an invalid modpack archive that fails launcher installation.
  **Recommended Fix:** Call `setPlatformVersion('');` in `executeLoadCollection` (around `src/ui/App.tsx:230`) and in `handleImportFile` (around `src/ui/App.tsx:347`) alongside `setZipResult(null)`, and add a test assertion in `tests/ui/m4-outputs.test.tsx` verifying that `Platform version (optional)` resets on collection load/import.

### P2 -- Moderate

| # | ID | File | Issue | Reviewer | Confidence |
|---|----|------|-------|----------|------------|
| 2 | `Finding 2` | `src/ui/App.tsx:324` | `handleImportFile` and `handleExportMrpack` lack async cancellation and concurrency guards | adversarial, julik-frontend-races | 100 |
| 3 | `Finding 3` | `tests/ui/m4-outputs.test.tsx:655` | Offline import test asserts against unconnected `ModrinthClient` spy and omits offline version switch | adversarial, testing | 100 |
| 4 | `Finding 4` | `tests/ui/m4-outputs.test.tsx:871` | `triggerBlobDownload` test omits throwing `click()` scenario despite test description | testing | 100 |

- **#2 (`Finding 2`)** — **Problem:** In `handleImportFile` (`src/ui/App.tsx:319-358`), `await readFileText(file)` runs *before* aborting in-flight controllers (`abortControllerRef`, `versionAbortControllerRef`, `exportAbortControllerRef`) and without tracking an `AbortController` or request token for the file read itself. If a user starts a collection load, selects another file, or unmounts while `readFileText` is pending, the stale import finishes later and overwrites `instance`. Similarly, `handleExportMrpack` (`src/ui/App.tsx:533-555`) does not register an `AbortController` on `exportAbortControllerRef` (or guard against double-clicks/unmount), so importing or loading a new collection while `archive.generate()` is pending still triggers `onExportBlob` for the superseded instance and unconditionally runs `setIsExporting(false)` in `finally`.
  **Recommended Fix:** In `src/ui/App.tsx`, abort active controllers immediately at the start of `handleImportFile`, track in-flight imports with an `importAbortControllerRef` (aborted in `executeLoadCollection`, `handleImportFile`, and unmount cleanup) before mutating state, and guard `handleExportMrpack` with `exportAbortControllerRef` (checking `exportAbortControllerRef.current === controller && !controller.signal.aborted` before calling `onExportBlob` or clearing `isExporting`).

- **#3 (`Finding 3`)** — **Problem:** In `tests/ui/m4-outputs.test.tsx:642-699`, `zeroNetworkClient` is created with `vi.fn()` spies and asserted not to have been called (`expect(zeroNetworkClient.getCollection).not.toHaveBeenCalled()`, etc.), but `<App />` at line 655 is rendered without `modrinthClient={zeroNetworkClient}`. Because `zeroNetworkClient` is never passed to `<App />`, those four assertions are tautological and cannot catch accidental network calls during import. Furthermore, the comment at line 653 states `// Render without modrinthClient to prove 100% offline import & version switching`, but the test never exercises switching a candidate version in the restored tables.
  **Recommended Fix:** In `tests/ui/m4-outputs.test.tsx:642-721`, stub `getGameVersions: vi.fn(async () => [])` and `getPlatforms: vi.fn(async () => [])` on `zeroNetworkClient`, pass `modrinthClient={zeroNetworkClient}` to `<App />` (or test both with `modrinthClient={zeroNetworkClient}` for import and offline candidate switching via `setEntryVersion`), and verify that `getCollection`, `getProjects`, `getProjectVersions`, and `getVersionsByIds` are never called.

- **#4 (`Finding 4`)** — **Problem:** In `tests/ui/m4-outputs.test.tsx:871-909`, the test is titled `it('cleans up temporary anchor and revokes object URL in triggerBlobDownload even if click throws', ...)`, but `clickSpy` at line 886 is only mocked with a no-op `() => {}` and never mocked to throw. As a result, the `try ... finally` exception cleanup path in `triggerBlobDownload` is not exercised when `anchor.click()` throws.
  **Recommended Fix:** In `tests/ui/m4-outputs.test.tsx:896`, add a throwing click assertion matching `tests/ui/m3-1-tables.test.tsx:567-572`: mock `clickSpy.mockImplementationOnce(() => { throw new Error('Blocked download'); })`, assert `expect(() => triggerBlobDownload('throwing.zip', sampleBlob)).toThrow('Blocked download')`, and verify `revokeObjectURLMock` was called a second time and `document.body.querySelector('a[download="throwing.zip"]')` is `null`.

### Requirements Completeness

Verified against `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` (§5.1 Import Rules, §8 Output Specification, §10 Testing, §11 Parity, §12 Documentation, §13 M4 Acceptance Criteria):

- **§5.1 Import boundaries (`ui` imports `core` and `ports` only; `app` wires adapters):** Met (`src/app/main.tsx` injects `services.fileFetcher` and `services.archiveWriter`; `src/ui/` imports only `core` and `ports`).
- **§8.1 Zips (`<collectionId>-client.zip`, `<collectionId>-server.zip`, per-type folders, naming, collision suffixing, disabled when toggle off or 0 selected, progress + cancel, partial-failure reporting):** Met.
- **§8.2 `instance.json` (`serialize`/`deserialize`, schema validation on export and import, offline restore without network, clear error on unknown future `schemaVersion`):** Met.
- **§8.3 `.mrpack` (`<collectionId>.mrpack` with `modrinth.index.json`, no binaries downloaded, plugins excluded with visible warning, split file entries when client/server versions differ, optional platform version input):** Met.
- **§12 & §13 M4 Documentation (`docs/instance-format.md`, `docs/output-formats.md`, `docs/user-guide.md` updated with launcher verification notes):** Met.

### Actionable Findings

| # | ID | File | Issue | Route | Notes |
|---|----|------|-------|-------|-------|
| 1 | `Finding 1` | `src/ui/App.tsx:230` | Stale `platformVersion` persists across collection loads and imports | `gated_auto -> downstream-resolver` | Reset `setPlatformVersion('')` in `executeLoadCollection` and `handleImportFile` |
| 2 | `Finding 2` | `src/ui/App.tsx:324` | `handleImportFile` and `handleExportMrpack` lack async cancellation and concurrency guards | `gated_auto -> downstream-resolver` | Track `importAbortControllerRef` and reuse `exportAbortControllerRef` in `handleExportMrpack` |
| 3 | `Finding 3` | `tests/ui/m4-outputs.test.tsx:655` | Offline import test asserts against unconnected `ModrinthClient` spy and omits offline version switch | `gated_auto -> downstream-resolver` | Connect `zeroNetworkClient` and exercise post-import version change |
| 4 | `Finding 4` | `tests/ui/m4-outputs.test.tsx:871` | `triggerBlobDownload` test omits throwing `click()` scenario despite test description | `gated_auto -> downstream-resolver` | Add throwing `clickSpy` assertion in Test 5 |

### Pre-existing Issues

| # | File | Issue | Reviewer |
|---|------|-------|----------|
| 1 | `src/ui/download.ts:88` | Synchronous `URL.revokeObjectURL(url)` in `finally` block (established in M3.1 `37a5b34` / `F-04` and enforced by `tests/ui/m3-1-tables.test.tsx:563,571`) | reliability, julik-frontend-races |

### Coverage

- **Suppressed:** 1 finding at anchor 50 (`src/ui/components/TargetForm.tsx:106` — advisory P3 note on tag-load completion after importing non-standard tag values)
- **Validator gate (Stage 5b):**
  - 3 primary findings (`Finding 1`, `Finding 2`, `Finding 3`) skipped Stage 5b validation due to quote-anchored independent multi-reviewer corroboration (`adversarial` + `correctness`, `adversarial` + `julik-frontend-races`, `adversarial` + `testing`).
  - 2 single-source findings entered the Stage 5b validator batch: `Finding 4` (`tests/ui/m4-outputs.test.tsx:871`) was `validated: true`; a `maintainability` candidate on `src/ui/styles.css:1000` (1,031 lines) was dropped with `validated: false` ("The project has no configured or documented 1,000-line limit and intentionally maintains a single stylesheet in `src/ui/styles.css`, making this an unsupported preference").
- **Settlement suppression:** Honored authoritatively against `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` and prior milestone verification logs.
- **Residual risks:**
  - `exportEnvironmentZip` buffers downloaded `Uint8Array` payloads in memory before `archive.generate()` builds the zip `Blob`; very large collections (e.g., 500MB+ of resource packs/shaders) may experience high browser tab memory usage.
  - JSZip's `generateAsync` does not natively accept an `AbortSignal`; while `exportEnvironmentZip` checks `signal?.aborted` before and after `archive.generate` and suppresses progress/download callbacks once aborted, CPU-bound compression of already-downloaded buffers runs to completion in the background if cancelled during the archiving phase.
- **Testing gaps:**
  - Addressed by `Finding 1`, `Finding 3`, and `Finding 4` (resetting `platformVersion` on load/import, connected `zeroNetworkClient` + offline version dropdown switch, and throwing `click()` cleanup in `triggerBlobDownload`).
- **Failed/timed-out reviewers:** 0 (all 7 specialist reviewers and 1 validator completed cleanly).

---

> **Verdict:** Ready with fixes
>
> **Reasoning:** Milestone M4 satisfies all functional, architectural, and documentation requirements in `IMPLEMENTATION_PLAN_v1.MD` (§8, §10, §11, §12, §13 M4). One P1 state-leakage bug (`Finding 1`: `platformVersion` persisting across collection loads and imports) and three P2 issues (`Finding 2`: async cancellation/concurrency guards in `handleImportFile` and `handleExportMrpack`; `Finding 3` and `Finding 4`: test assertions in `tests/ui/m4-outputs.test.tsx`) should be fixed before closing Milestone M4.
>
> **Fix order:** `Finding 1` (P1 `platformVersion` reset in `src/ui/App.tsx`) -> `Finding 2` (P2 async cancellation/concurrency guards in `src/ui/App.tsx`) -> `Finding 3` & `Finding 4` (P2 test improvements in `tests/ui/m4-outputs.test.tsx`)

### Actionable Findings Summary

1. **`#1` (`Finding 1`)** | `P1` | `src/ui/App.tsx:230` | Stale `platformVersion` persists across collection loads and imports | `gated_auto` | `suggested_fix`: yes | `confidence`: `100`
2. **`#2` (`Finding 2`)** | `P2` | `src/ui/App.tsx:324` | `handleImportFile` and `handleExportMrpack` lack async cancellation and concurrency guards | `gated_auto` | `suggested_fix`: yes | `confidence`: `100`
3. **`#3` (`Finding 3`)** | `P2` | `tests/ui/m4-outputs.test.tsx:655` | Offline import test asserts against unconnected `ModrinthClient` spy and omits offline version switch | `gated_auto` | `suggested_fix`: yes | `confidence`: `100`
4. **`#4` (`Finding 4`)** | `P2` | `tests/ui/m4-outputs.test.tsx:871` | `triggerBlobDownload` test omits throwing `click()` scenario despite test description | `gated_auto` | `suggested_fix`: yes | `confidence`: `100`
