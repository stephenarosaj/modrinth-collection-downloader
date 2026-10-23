# Milestone M4 — Outputs: Work Plan

## Goal
Implement Milestone M4 (`IMPLEMENTATION_PLAN_v1.MD` §7.3.1, §7.6, §8.1, §8.2, §8.3, §13 M4):
- **`client.zip` & `server.zip` Export (§7.3.1, §7.6, §8.1)**:
  - Enabled per environment only when that environment's toggle is active (`activeEnvironments[env] === true`) and `toFileTree(instance)[env].files.length > 0`.
  - Fetches binaries only at export time via `FileFetcher.fetchBinary` with progress (`completed / total`), `AbortController` cancellation, and partial-failure reporting ("Failed downloads are listed; successful ones still zip").
  - Packages files into `<collectionId>-client.zip` / `<collectionId>-server.zip` via `ArchiveWriter` using exact paths and collision-resolved filenames from `toFileTree(instance)`.
- **`instance.json` Offline Import (§8.2, §13 M4)**:
  - File import control (**Import instance.json**) that parses and validates a local JSON file via `deserialize(jsonText)` (`schema/instance.schema.json`), restoring the full review state offline without any network calls and round-tripping `import -> export` losslessly.
  - Clear user-facing error alert for invalid JSON, schema violations, or unsupported future `schemaVersion`.
- **`.mrpack` Export (§8.3, §13 M4)**:
  - Packages `modrinth.index.json` (`toMrpack(instance, { platformVersion })`) into `<collectionId>.mrpack` via `ArchiveWriter` without downloading binary mod files.
  - Includes an optional **Platform version** text input (e.g. `0.16.9` -> `fabric-loader: "0.16.9"`) and displays a visible warning when selected `plugin` entries are excluded (`getMrpackWarnings(instance)`).
- **Tests & Documentation**:
  - Comprehensive unit and Testing Library UI tests in `tests/ui/m4-outputs.test.tsx`.
  - Updated `docs/output-formats.md`, `docs/user-guide.md`, and `docs/instance-format.md`.

## Subagent Partitioning (Disjoint File Ownership)

1. **`M4-UI-And-Export-Engineer`**:
   - `src/app/main.tsx`
   - `src/ui/download.ts`
   - `src/ui/components/ExportBar.tsx` (new)
   - `src/ui/components/TargetForm.tsx`
   - `src/ui/App.tsx`
   - `src/ui/styles.css`
   - `tests/ui/m4-outputs.test.tsx` (new)

2. **`M4-Docs-Author`**:
   - `docs/output-formats.md`
   - `docs/user-guide.md`
   - `docs/instance-format.md`
