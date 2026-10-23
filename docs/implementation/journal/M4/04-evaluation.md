# Milestone M4 — Outputs: Code Review Evaluation Log

Evaluation of the findings from `03-code-review.md` across two evaluator batches.

## Batch 2: Findings 3–4

### Evaluation of `Finding 3` (P2 — `tests/ui/m4-outputs.test.tsx:655`: Offline import test asserts against unconnected `ModrinthClient` spy and omits offline version switch)

1. **Factually accurate?** **Yes.** In `tests/ui/m4-outputs.test.tsx:642-660`, `zeroNetworkClient` is constructed with `vi.fn()` spies, and lines `696-699` assert `expect(zeroNetworkClient.getCollection).not.toHaveBeenCalled()` (plus `getProjects`, `getProjectVersions`, `getVersionsByIds`). However, `<App />` at line `655` is rendered without passing `modrinthClient={zeroNetworkClient}`. As a result, those four spy assertions are tautological—they would pass even if `App` made network calls on `modrinthClient` during import. Additionally, line `653` comments `// Render without modrinthClient to prove 100% offline import & version switching`, but the test never exercises switching a candidate version in the restored tables.
2. **Worthwhile fix?** **Yes.** Connecting `zeroNetworkClient` makes the zero-network-call assertions genuinely falsifiable (proving `handleImportFile` does not call `getCollection`, `getProjects`, `getProjectVersions`, or `getVersionsByIds` even when `modrinthClient` is wired in), and exercising a post-import version switch verifies that the restored candidate list works offline without triggering unexpected network fetches.
3. **Not overly strict or over-engineered?** **Yes.** It requires only wiring the already-defined `zeroNetworkClient` (with `getGameVersions` and `getPlatforms` returning `[]`) into `<App />` and adding a candidate version `fireEvent.change` assertion after the round-trip export check.
4. **Verdict:** **`ACCEPT`**
   - **Exact Fixer Instructions (`tests/ui/m4-outputs.test.tsx`):**
     1. In the third test (`it('restores full review state from instance.json offline with zero ModrinthClient calls...')`, around lines `642-660`), stub `getGameVersions: vi.fn(async () => [])` and `getPlatforms: vi.fn(async () => [])` on `zeroNetworkClient` and pass `modrinthClient={zeroNetworkClient}` to `<App />`.
     2. Wait for the initial tag load effect to settle (or let the invalid/future-schema import steps flush it) and keep the assertions after valid import that `zeroNetworkClient.getCollection`, `zeroNetworkClient.getProjects`, `zeroNetworkClient.getProjectVersions`, and `zeroNetworkClient.getVersionsByIds` have not been called.
     3. After verifying the lossless `Export instance.json` round-trip (`expect(reExportedJsonPayloads[0]!.json).toBe(exportedJson)`), exercise post-import version switching by enabling `Client environment` (`fireEvent.click(screen.getByLabelText('Client environment'))`), changing `Sodium! Client version` back to `'v-sodium-1'`, waiting for `(screen.getByLabelText('Sodium! Client version') as HTMLSelectElement).value` to be `'v-sodium-1'`, and asserting that `zeroNetworkClient.getCollection`, `getProjects`, `getProjectVersions`, and `getVersionsByIds` were still never called.

---

### Evaluation of `Finding 4` (P2 — `tests/ui/m4-outputs.test.tsx:871`: `triggerBlobDownload` test omits throwing `click()` scenario despite test description)

1. **Factually accurate?** **Yes.** The fifth test in `tests/ui/m4-outputs.test.tsx:871-909` is titled `it('cleans up temporary anchor and revokes object URL in triggerBlobDownload even if click throws', ...)`, and `triggerBlobDownload` in `src/ui/download.ts:81-89` uses a `try ... finally` block specifically to clean up the temporary `<a download>` element and call `URL.revokeObjectURL(url)` even when `anchor.click()` throws. However, `clickSpy` at line `886` is only mocked with a no-op `() => {}` and is never mocked to throw.
2. **Worthwhile fix?** **Yes.** Adding the throwing `clickSpy` assertion exercises the `finally` exception cleanup path promised by the test title and matches the existing pattern in `tests/ui/m3-1-tables.test.tsx:567-572`.
3. **Not overly strict or over-engineered?** **Yes.** It is a 6-line addition to an existing unit test.
4. **Verdict:** **`ACCEPT`**
   - **Exact Fixer Instructions (`tests/ui/m4-outputs.test.tsx`):**
     1. In `tests/ui/m4-outputs.test.tsx` (inside the `try` block of `it('cleans up temporary anchor and revokes object URL in triggerBlobDownload even if click throws')`, right after line `895`), mock `clickSpy.mockImplementationOnce(() => { throw new Error('Blocked download'); })`.
     2. Assert `expect(() => triggerBlobDownload('throwing.zip', sampleBlob)).toThrow('Blocked download')`.
     3. Assert `expect(revokeObjectURLMock).toHaveBeenCalledTimes(2)` and `expect(document.body.querySelector('a[download="throwing.zip"]')).toBeNull()`.

---

## Batch 1: Findings 1–2

### Evaluation of `Finding 1` (P1 — `src/ui/App.tsx:230`: Stale `platformVersion` persists across collection loads and imports)

1. **Factually accurate?** **Yes.** In `src/ui/App.tsx:132`, `const [platformVersion, setPlatformVersion] = useState('')` stores the optional platform loader version passed into `toMrpack(instance, { platformVersion })` (`src/ui/App.tsx:565`) and `exportMrpackArchive({ ..., platformVersion })` (`src/ui/App.tsx:546`). Neither `executeLoadCollection` (`src/ui/App.tsx:206-241`) nor `handleImportFile` (`src/ui/App.tsx:319-358`) resets `platformVersion` when loading/re-resolving a collection or importing an `instance.json` file. If a user types a loader version (e.g., `0.16.9` for Fabric) and then resolves for another platform (e.g., NeoForge) or imports a different `instance.json`, `platformVersion` remains `'0.16.9'` and silently pollutes the new `.mrpack` `modrinth.index.json` `dependencies` object.
2. **Worthwhile fix?** **Yes.** Prevents cross-instance/cross-platform state leakage that produces invalid `modrinth.index.json` loader dependency versions (`§8.3`).
3. **Not overly strict or over-engineered?** **Yes.** It requires only adding `setPlatformVersion('')` in `executeLoadCollection` and `handleImportFile`, plus a test assertion verifying the input resets.
4. **Verdict:** **`ACCEPT`**
   - **Exact Fixer Instructions (`src/ui/App.tsx` and `tests/ui/m4-outputs.test.tsx`):**
     1. In `src/ui/App.tsx` inside `executeLoadCollection` (around line `230`, alongside `setZipResult(null)`), add `setPlatformVersion('');`.
     2. In `src/ui/App.tsx` inside `handleImportFile` (around line `347`, alongside `setZipResult(null)`), add `setPlatformVersion('');`.
     3. In `tests/ui/m4-outputs.test.tsx` (in the `.mrpack` test after setting `Platform version (optional)` to `'0.16.9'` and exporting, around line `856`), trigger a new collection load or `instance.json` import (or re-resolve) and assert that `(screen.getByLabelText('Platform version (optional)') as HTMLInputElement).value` resets to `''`.

---

### Evaluation of `Finding 2` (P2 — `src/ui/App.tsx:324`: `handleImportFile` and `handleExportMrpack` lack async cancellation and concurrency guards)

1. **Factually accurate?** **Yes.**
   - In `src/ui/App.tsx:319-358` (`handleImportFile`), `await readFileText(file)` runs before aborting `abortControllerRef`, `versionAbortControllerRef`, and `exportAbortControllerRef`, and there is no `importAbortControllerRef` guarding `handleImportFile` itself. If `executeLoadCollection` starts, another file is imported, or `App` unmounts while `readFileText(file)` is pending, the stale `handleImportFile` resolves later and overwrites `instance` (or sets `importError`).
   - In `src/ui/App.tsx:533-555` (`handleExportMrpack`) and `src/ui/download.ts:303-322` (`exportMrpackArchive`), `.mrpack` generation does not register an `AbortController` on `exportAbortControllerRef` or check an `AbortSignal` around `await archive.generate()`. If a user imports an `instance.json`, loads a collection, or unmounts while `archive.generate()` is pending, `exportMrpackArchive` still invokes `onExportBlob` for the superseded instance and `handleExportMrpack`'s `finally` block unconditionally calls `setIsExporting(false)`.
2. **Worthwhile fix?** **Yes.** Eliminates async race conditions between file reading, `.mrpack` archive generation, collection loading, and component unmount, aligning `handleImportFile` and `handleExportMrpack` with the `AbortController` lifecycle already used by `executeLoadCollection`, `handleChangeEntryVersion`, and `handleExportEnvironmentZip`.
3. **Not overly strict or over-engineered?** **Yes.** It reuses the existing `AbortController` ref pattern in `src/ui/App.tsx` and `src/ui/download.ts` without introducing external dependencies or complex abstractions.
4. **Verdict:** **`ACCEPT`**
   - **Exact Fixer Instructions (`src/ui/download.ts` and `src/ui/App.tsx`):**
     1. In `src/ui/download.ts`:
        - Add `signal?: AbortSignal;` to `ExportMrpackArchiveOptions`.
        - In `exportMrpackArchive`, check `if (signal?.aborted) { throw createAbortError(); }` at the start of the function and again immediately after `const blob = await archive.generate();` (before calling `onExportBlob(filename, blob)`).
     2. In `src/ui/App.tsx`:
        - Add `const importAbortControllerRef = useRef<AbortController | null>(null);` next to `exportAbortControllerRef`.
        - In the unmount `useEffect` (`src/ui/App.tsx:175-185`) and in `executeLoadCollection` (`src/ui/App.tsx:212-217`), abort and null out `importAbortControllerRef.current`.
        - In `handleImportFile`:
          - Immediately abort `importAbortControllerRef.current` and create `const controller = new AbortController(); importAbortControllerRef.current = controller;`.
          - Immediately abort and null out `abortControllerRef.current`, `versionAbortControllerRef.current`, and `exportAbortControllerRef.current`, call `clearFlashTimer()`, and reset in-flight flags (`setIsResolving(false)`, `setIsRecomputing(false)`, `setIsExporting(false)`, `setExportingEnv(null)`, `setZipProgress(null)`, `setImportError(null)`, `setExportError(null)`).
          - After `const text = await readFileText(file);`, check `if (importAbortControllerRef.current !== controller || controller.signal.aborted) { return; }` before calling `deserialize(text)` and mutating state, and clear `importAbortControllerRef.current = null;` once finished.
          - In `catch (err: unknown)`, check `if (importAbortControllerRef.current !== controller || controller.signal.aborted || isAbortError(err)) { return; }` and clear `importAbortControllerRef.current = null;` before calling `setImportError(...)`.
        - In `handleExportMrpack`:
          - Abort any prior `exportAbortControllerRef.current`, create `const controller = new AbortController(); exportAbortControllerRef.current = controller;`, and pass `signal: controller.signal` to `exportMrpackArchive`.
          - After `await exportMrpackArchive(...)`, check `if (exportAbortControllerRef.current !== controller || controller.signal.aborted) { return; }`, then set `exportAbortControllerRef.current = null;` and `setIsExporting(false);`.
          - In `catch (err: unknown)`, check `if (exportAbortControllerRef.current !== controller) { return; }`, set `exportAbortControllerRef.current = null;` and `setIsExporting(false);`, return early if `controller.signal.aborted || isAbortError(err)`, and otherwise set `setExportError(...)`.
