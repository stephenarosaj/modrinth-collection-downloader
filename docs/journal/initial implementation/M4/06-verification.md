# Milestone M4 — Outputs: Verification Log

Verification results for each fixer batch in `05-fixes.md`.

## Verifier Batch 1: Findings 1–2

### Finding 1 (`src/ui/App.tsx` — Stale `platformVersion` persists across collection loads and imports): **VERIFIED**
- **`executeLoadCollection` (`src/ui/App.tsx:235-236`):** Confirmed `setPlatformVersion('')` is invoked immediately alongside `setZipResult(null)` when loading or re-resolving a collection.
- **`handleImportFile` (`src/ui/App.tsx:365-366`):** Confirmed `setPlatformVersion('')` is invoked immediately alongside `setZipResult(null)` when restoring an `instance.json` file.

### Finding 2 (`src/ui/App.tsx`, `src/ui/download.ts` — `handleImportFile` and `handleExportMrpack` async cancellation and concurrency guards): **VERIFIED**
- **`importAbortControllerRef` lifecycle (`src/ui/App.tsx:147, 176-188, 220-221, 325-386`):**
  - Declared at `src/ui/App.tsx:147` (`const importAbortControllerRef = useRef<AbortController | null>(null)`).
  - Aborted and cleared in the unmount `useEffect` (`src/ui/App.tsx:184-185`) and at the start of `executeLoadCollection` (`src/ui/App.tsx:220-221`).
  - On entry to `handleImportFile` (`src/ui/App.tsx:327-345`), any prior `importAbortControllerRef.current` is aborted, a fresh `importController` is assigned, `abortControllerRef.current`, `versionAbortControllerRef.current`, and `exportAbortControllerRef.current` are aborted and nulled out alongside `clearFlashTimer()`, and in-flight state flags (`isResolving`, `isRecomputing`, `isExporting`, `exportingEnv`, `zipProgress`, `importError`, `exportError`) are reset.
  - After `await readFileText(file)` (`src/ui/App.tsx:348-356`), `if (importAbortControllerRef.current !== importController || importController.signal.aborted) { return; }` guards `deserialize(text)` and all subsequent state mutations; `catch` (`src/ui/App.tsx:372-383`) similarly ignores aborted/superseded controllers and `isAbortError(err)`.
- **`exportMrpackArchive` cancellation (`src/ui/download.ts:48-56, 306-332`):**
  - `ExportMrpackArchiveOptions` (and `ExportMrpackOptions`) accepts `signal?: AbortSignal` (`src/ui/download.ts:52`).
  - `exportMrpackArchive` checks `if (signal?.aborted) { throw createAbortError(); }` before building the archive (`src/ui/download.ts:313-315`) and again immediately after `const blob = await archive.generate();` (`src/ui/download.ts:320-323`), throwing an `AbortError` before `onExportBlob(filename, blob)` (`src/ui/download.ts:325`) can run.
- **`handleExportMrpack` concurrency and cleanup (`src/ui/App.tsx:560-597`):**
  - Aborts any prior `exportAbortControllerRef.current`, registers a new `controller` (`src/ui/App.tsx:566-568`), and passes `signal: controller.signal` to `exportMrpackArchive` (`src/ui/App.tsx:578`).
  - Ignores superseded/aborted controllers and `isAbortError(err)` in `catch` (`src/ui/App.tsx:581-588`).
  - Cleans up `exportAbortControllerRef.current = null` and `setIsExporting(false)` in `finally` only when `exportAbortControllerRef.current === controller` (`src/ui/App.tsx:591-596`).


## Verifier Batch 2: Findings 1 (test), 3, 4

### Finding 1 Test Assertion (`tests/ui/m4-outputs.test.tsx:887-911` — Reset `Platform version (optional)` on import and collection load): **VERIFIED**
- Confirmed that after setting `Platform version (optional)` to `'0.16.9'` and exporting `.mrpack`, importing `col-m4-instance.json` via `Import instance.json file` resets `(screen.getByLabelText('Platform version (optional)') as HTMLInputElement).value` to `''` (`tests/ui/m4-outputs.test.tsx:888-898`).
- Confirmed that setting `Platform version (optional)` to `'0.16.10'` and clicking `Load collection` also resets `(screen.getByLabelText('Platform version (optional)') as HTMLInputElement).value` to `''` (`tests/ui/m4-outputs.test.tsx:900-911`).

### Finding 3 (`tests/ui/m4-outputs.test.tsx:642-738` — Offline import test connects `zeroNetworkClient` and exercises offline version switch): **VERIFIED**
- Confirmed `zeroNetworkClient` stubs `getGameVersions: vi.fn(async () => [])` and `getPlatforms: vi.fn(async () => [])` (`tests/ui/m4-outputs.test.tsx:647-648`) and is passed via `modrinthClient={zeroNetworkClient}` to `<App />` (`tests/ui/m4-outputs.test.tsx:655`).
- Confirmed that after importing `col-m4-instance.json` and verifying the lossless `Export instance.json` round-trip (`tests/ui/m4-outputs.test.tsx:687-720`), the test enables `Client environment`, changes `Sodium! Client version` to `'v-sodium-1'`, waits for its value to become `'v-sodium-1'`, and asserts `zeroNetworkClient.getCollection`, `getProjects`, `getProjectVersions`, and `getVersionsByIds` are never called (`tests/ui/m4-outputs.test.tsx:723-737`).

### Finding 4 (`tests/ui/m4-outputs.test.tsx:940-945` — `triggerBlobDownload` throwing `click()` cleanup path): **VERIFIED**
- Confirmed `clickSpy.mockImplementationOnce(() => { throw new Error('Blocked download'); })` is configured (`tests/ui/m4-outputs.test.tsx:940-942`), `expect(() => triggerBlobDownload('throwing.zip', sampleBlob)).toThrow('Blocked download')` is asserted (`tests/ui/m4-outputs.test.tsx:943`), and `expect(revokeObjectURLMock).toHaveBeenCalledTimes(2)` alongside `expect(document.body.querySelector('a[download="throwing.zip"]')).toBeNull()` verifies cleanup in the `finally` block (`tests/ui/m4-outputs.test.tsx:944-945`).

### Verification Suite
- `yarn lint`: Passed (`eslint . --max-warnings=0`, 0 errors, 0 warnings).
- `yarn typecheck`: Passed (`tsc --noEmit`).
- `yarn test --run`: Passed (18 test files, 238 tests).
- `yarn build`: Passed (`tsc --noEmit && vite build`).
