# Milestone M4 — Outputs: Commit & Push Log

## Commit Message (`/generate-pr-description` format)

```markdown
# feat(m4): implement client/server zip archives, offline instance.json import, and .mrpack export

## Overview
✨ Implements Milestone M4 (Outputs), adding browser-side `client.zip` and `server.zip` archive generation with bounded concurrency, live progress/cancel, and partial-failure reporting, offline `instance.json` import with lossless round-trip restoration, and `.mrpack` modpack export (`modrinth.index.json`) with optional platform version overrides and plugin exclusion warnings.

## Highlights
✨ Added `exportEnvironmentZip`, `exportMrpackArchive`, and `triggerBlobDownload` orchestration in `src/ui/download.ts` and wired `fileFetcher` and `archiveWriter` services from `src/app/main.tsx` into `<App />`.
✨ Created `<ExportBar />` (`src/ui/components/ExportBar.tsx`) with environment-gated `Export client.zip` / `Export server.zip` buttons, `Export instance.json`, `Platform version (optional)` input, `Export .mrpack`, plugin exclusion warnings (`role="note"`), live progress bar (`role="progressbar"`), and partial-failure alert (`role="alert"`).
✨ Added offline `Import instance.json` support in `src/ui/components/TargetForm.tsx` and `src/ui/App.tsx` with async cancellation guards (`importAbortControllerRef`, `exportAbortControllerRef`) and automatic platform version reset on load/import.

<details>
<summary><b>Changelog</b></summary>

### Implementation Changes
- `src/app/main.tsx`: Passed `services.fileFetcher` and `services.archiveWriter` alongside `services.modrinthClient` to `<App />`.
- `src/ui/download.ts`: Added `triggerBlobDownload`, `exportEnvironmentZip` (bounded concurrency binary fetching via `FileFetcher.fetchBinary`, `AbortSignal` support, progress callbacks, partial-failure tracking, and deterministic `toFileTree(instance)[env]` zip packaging), and `exportMrpackArchive` (`toMrpack` + `getMrpackWarnings` packaged as `modrinth.index.json`).
- `src/ui/components/ExportBar.tsx`: Created the Milestone M4 export action bar with environment-gated zip buttons, `instance.json` export, `.mrpack` export with optional platform version input, plugin warning banner, live zip download/archive progress bar with cancel button, and partial-failure alert.
- `src/ui/components/TargetForm.tsx`: Added offline `Import instance.json` button and hidden `.json` file input alongside `Load collection`.
- `src/ui/App.tsx`: Integrated `<ExportBar />`, offline `instance.json` import restoration (`deserializeInstance`), zip and `.mrpack` export handlers, `importAbortControllerRef` and `exportAbortControllerRef` cancellation guards, and `platformVersion` state reset across collection loads and imports.
- `src/ui/styles.css`: Added responsive layout and visual styling for `<ExportBar />`, progress bar, plugin warning note, and partial-failure alert.
- `docs/output-formats.md`, `docs/user-guide.md`, `docs/instance-format.md`: Updated documentation for Milestone M4 outputs, offline import workflow, and launcher verification matrix.

### Test Changes
- `tests/ui/m4-outputs.test.tsx`: Added 5 comprehensive integration tests covering `client.zip` and `server.zip` 100% parity with `toFileTree(instance)` (including per-type folders and `-2` collision suffixes), partial/total download failures, in-flight zip export cancellation, offline `instance.json` import + lossless re-export round-trip + offline version switching + schema error handling, `.mrpack` export with optional `platformVersion` and plugin exclusion warning, and `triggerBlobDownload` anchor/URL cleanup on throwing `click()`.

</details>
```
