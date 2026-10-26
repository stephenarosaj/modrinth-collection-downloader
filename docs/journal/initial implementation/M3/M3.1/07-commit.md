# Milestone M3.1 — Read-Only Tables + JSON Export: Commit Log

## Commit Message (`/generate-pr-description` Format)

```markdown
# Implement Milestone M3.1 read-only review tables, resolution progress UI, and instance.json export

## Overview
✨ Implements Milestone M3.1 (Read-only tables + JSON export) of `modrinth-collection-downloader`, adding the collection target input form, cancellable resolution progress panel, per-project-type read-only review tables with dependency footers, skipped projects section, schema-validated `instance.json` export, Testing Library UI test suite, and user guide documentation.

## Highlights
✨ Built `<TargetForm />` (`src/ui/components/TargetForm.tsx`) and `<ResolveProgressPanel />` (`src/ui/components/ResolveProgressPanel.tsx`) supporting Modrinth collection URL/ID validation (`parseCollectionInput`), release-only game version selection (`getGameVersions`), platform selection (`getPlatforms`), release preference toggle (`stable` vs `newest`), progress tracking (`role="progressbar"` + scrollable log), and `AbortController` cancellation with race-safe controller isolation.
✨ Built `<EntryTables />` (`src/ui/components/EntryTables.tsx`) and `<SkippedSection />` (`src/ui/components/SkippedSection.tsx`) rendering memoized per-type tables (`Mods`, `Plugins`, `Datapacks`, `Resource Packs`, `Shaders`) with **Open on Modrinth ↗** links, formatted platform labels (`—` for platform-agnostic types), read-only **Client** and **Server** environment cells (`✗` for unsupported, `"No compatible version"`, or resolved version + support/fallback badges), semantic **Dependencies** footers (`required by: ... (client/server)`), and skipped project reporting.
✨ Wired schema-validated `<collectionId>-instance.json` export (`src/ui/download.ts`, `src/ui/App.tsx`), added 7 comprehensive Testing Library UI tests in `tests/ui/m3-1-tables.test.tsx` (222 total tests passing across 15 test suites), and documented the M3.1 workflow in `docs/user-guide.md`.

<details>
<summary><b>Changelog</b></summary>

### Implementation Changes
- **`src/app/main.tsx` & `src/ui/App.tsx`**: Injected `services.modrinthClient` into `<App />` and implemented collection resolution state management, race-safe `AbortController` cancellation, collection summary header, and `Export instance.json` action with error reporting.
- **`src/ui/components/TargetForm.tsx`**: Implemented target configuration form loading release-only game versions and mod/plugin platforms with retry support, collection URL/ID validation, and release preference selection.
- **`src/ui/components/ResolveProgressPanel.tsx`**: Implemented resolution progress panel displaying phase status (`Initializing`, active phases, `Cancelled`, `Failed`), progress bar, scrollable log lines, and cancel button.
- **`src/ui/components/EntryTables.tsx`**: Implemented memoized per-project-type review tables with read-only Client/Server environment cells and semantic `<tbody className="dependencies-body">` dependency footers showing per-environment `required by` attribution.
- **`src/ui/components/SkippedSection.tsx`**: Implemented skipped projects list displaying `modpack` and unsupported/unresolvable projects with skip reasons and Modrinth links.
- **`src/ui/download.ts` & `src/ui/utils.ts` & `src/ui/styles.css`**: Added `exportInstanceJson` / `triggerTextDownload` with `try / finally` DOM and ObjectURL cleanup, shared `isAbortError` helper, and dark-theme styling for forms, progress bars, tables, badges, and alerts.
- **`docs/user-guide.md`**: Documented loading a collection, reading per-type tables and environment cells, dependency footers, skipped projects, and exporting `instance.json`.

### Test Changes
- **`tests/ui/m3-1-tables.test.tsx`**: Added 7 Testing Library UI tests covering release-only game version filtering, platform filtering/formatting, tag load retry, input validation, end-to-end collection resolution across all 5 project types, dependency footers, skipped projects, `instance.json` schema validation + `deserialize` round-trip, `triggerTextDownload` cleanup, error alerts, and `AbortSignal` cancellation/race isolation.

</details>
```
