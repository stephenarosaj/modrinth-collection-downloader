# Milestone M4 — Outputs: Implementation Log

Subagent implementation updates for Milestone M4 are recorded below.

---

## M4-Docs-Author

- **`docs/output-formats.md`**: Documented `<collectionId>-client.zip` and `<collectionId>-server.zip` (§8.1), `<collectionId>-instance.json` (§8.2), and `<collectionId>.mrpack` (§8.3), including environment toggle gating, on-demand binary fetching with progress/cancel, partial-failure packaging, optional **Platform version** mapping (`fabric-loader`, `quilt-loader`, `forge`, `neoforge`), plugin exclusion warning, and the Prism Launcher & Modrinth App verification table.
- **`docs/user-guide.md`**: Documented active Milestone M4 workflows for offline **Import instance.json**, **Export client.zip** / **Export server.zip** with progress/cancel and partial-failure reporting, and **Export .mrpack** with optional **Platform version** and plugin exclusion warnings.
- **`docs/instance-format.md`**: Added §2 detailing the offline **Import instance.json** workflow, lossless round-trip guarantee (`serialize(deserialize(json)) === json`), and strict schema/version error handling.


---

## M4-UI-And-Export-Engineer

- **Composition Root & `<App />` Props** (`src/app/main.tsx`, `src/ui/App.tsx`):
  - Wired `services.fileFetcher` and `services.archiveWriter` alongside `services.modrinthClient` into `<App />` in `src/app/main.tsx`.
  - Extended `AppProps` in `src/ui/App.tsx` with `fileFetcher?: FileFetcher`, `archiveWriter?: ArchiveWriter`, and `onExportBlob?: (filename: string, blob: Blob) => void`.
- **Export Orchestration Helpers** (`src/ui/download.ts`):
  - Added `triggerBlobDownload(filename, blob)` with `try / finally` DOM anchor removal and `URL.revokeObjectURL(url)` cleanup.
  - Added `exportEnvironmentZip(options)` to download all selected `toFileTree(instance)[env]` entries via `FileFetcher.fetchBinary` with bounded concurrency (`default = 5`), `AbortSignal` support, progress callbacks (`downloading`, `archiving`, `complete`), partial-failure tracking (`failedFiles: FailedDownload[]`), deterministic `tree.files` archive entry ordering, and `<collectionId>-<env>.zip` export.
  - Added `exportMrpackArchive(options)` to generate `<collectionId>.mrpack` containing `modrinth.index.json` via `toMrpack(instance, { platformVersion })` and `getMrpackWarnings(instance)` without downloading project binaries.
- **Offline `instance.json` Import** (`src/ui/components/TargetForm.tsx`, `src/ui/App.tsx`):
  - Added **Import instance.json** button and hidden `<input type="file" accept=".json,application/json" aria-label="Import instance.json file" />` in `TargetForm.tsx`.
  - Restores `Instance`, tables, custom selections, version overrides, and skipped projects offline with zero network calls, syncing `TargetForm` inputs (`collectionInput`, `gameVersion`, `platform`, `preferStable`) and surfacing schema/version validation errors in a `role="alert"` banner.
- **Export Bar & Progress / Partial-Failure UI** (`src/ui/components/ExportBar.tsx`, `src/ui/styles.css`):
  - Created `<ExportBar />` with **Export client.zip** (gated by `activeEnvironments.client` and file count), **Export server.zip** (gated by `activeEnvironments.server` and file count), **Export instance.json**, **Platform version (optional)** text input, and **Export .mrpack`.
  - Added plugin exclusion warning (`role="note"`), live zip download/archive progress bar (`role="progressbar"`) with **Cancel export**, and partial-failure alert (`role="alert"`) listing failed downloads and packaged counts.
- **Milestone M4 Test Suite** (`tests/ui/m4-outputs.test.tsx`):
  - Added 5 comprehensive tests covering `client.zip` and `server.zip` 100% parity with `toFileTree(instance)` (including per-type folders and `-2` collision suffixes), partial/total download failures, in-flight zip export cancellation, offline `instance.json` import + lossless re-export round-trip + invalid/future schema error alerts, and `.mrpack` export with optional `platformVersion` and plugin exclusion warning.
- **Verification**:
  - `yarn lint`: Passed (0 warnings, 0 errors)
  - `yarn typecheck`: Passed (`tsc --noEmit`)
  - `yarn test --run`: Passed (18 test files, 238 tests passing)
  - `yarn build`: Passed (`vite build` succeeded)
