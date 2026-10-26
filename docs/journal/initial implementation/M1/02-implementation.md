# Milestone M1 — Core: Implementation Log

Subagent implementation updates for Milestone M1 are recorded below.

---

## M1-Foundation

- **`src/core/model.ts`**: Implemented authoritative §6 domain types (`EnvironmentId`, `Support`, `ProjectType`, `ExportableProjectType`, `VersionType`, `ReleasePreference`, `DependencyType`, `FileRef`, `VersionDependency`/`DependencyRef`, `VersionRef`, `Selection`, `Resolution`, `EnvironmentState`, `Entry`, `Instance`, `SkippedProject`/`SkippedItem`), §7.4 status types (`Kind`, `Reason`, `Status`, `EntryStatus`, `InstanceStatusMap`), §7.3 reducer types (`Change`, `Action`, `ReducerResult`), §6.1/§8 projection types (`TableRow`, `TableModel`, `FileTreeEntry`/`FileTreeItem`, `FileTree`, `MrpackFile`, `MrpackIndex`, `MrpackOptions`), constants (`ENVIRONMENTS`, `PROJECT_TYPE_ORDER`, `PLATFORM_AGNOSTIC_TYPES`, `TYPE_FOLDER_MAP`), and helpers (`isSelectable`, `isPlatformAgnostic`, `isExportableProjectType`).
- **`src/ports/index.ts`**: Defined §5.2 port interfaces (`ModrinthClient`, `CollectionInfo`, `ProjectInfo`, `VersionInfo`, `VersionFileInfo`, `GameVersionInfo`, `PlatformInfo`, `ProjectVersionsQuery`, `RequestOptions`, `FileFetcher`, `ArchiveWriter`, `Archive`) with optional `{ signal?: AbortSignal }` support.
- **`tests/helpers/fake-modrinth-client.ts`**: Implemented `FakeModrinthClient` with chainable seed builders, default file/metadata synthesis, `AbortSignal` handling, error injection (`failOn`), and call tracking (`calls`).
- **`tests/core/foundation.test.ts`**: Added unit tests verifying domain helpers, constants, and `FakeModrinthClient` behavior.


## M1-Resolver

- **`src/core/collection.ts`**: Implemented `parseCollectionInput` / `extractCollectionId` (handling full Modrinth collection URLs with query/hash/trailing slash, scheme-less URLs, and bare IDs) and `filterReleaseGameVersions` (`versionType === 'release'`).
- **`src/core/resolver.ts`**: Implemented `toUsableVersionRef`, `filterUsableVersions` (refusing missing files and `.mrpack` primary files), `resolveVersionForEnvironment` (§7.1 rules 1–4: Pinned with `pinConflict` detection, Latest compatible with `stable`/`newest` release preference by `publishedAt`, Game-version fallback when `platforms` is empty, and None), `resolveCollection` (deduplicating collection IDs, skipping `modpack`/unknown/missing projects, computing independent per-environment transitive required dependency closures with cycle protection, preserving `origin: 'collection'`, and applying initial selections), and `recomputeDependencyClosure` / `changeEntryVersion` (recomputing closure and reporting `changes` on user version override).
- **`tests/core/resolver.test.ts` & `tests/core/parity.test.ts`**: Added 41 table-driven and parity tests covering all §7.1, §7.2, and §11 requirements.

## M1-Reducers-Status

- **`src/core/reducers.ts`**: Implemented `reduceInstance`, `computeInitialSelection`, `selectEntry`, `deselectEntry`, `selectAllInTable`, `deselectAllInTable`, `setEntryVersion`, `resetInstanceSelection`, `getHeaderTriState`, and `hasSelectionChangedFromDefault` per §7.3 (including sticky `off/user` dependency immunity, transitive `auto-selected` / `auto-deselected` propagation, and collection-only header select-all).
- **`src/core/status.ts`**: Implemented `computeStatus`, `computeEntryStatus`, `getReasonKind`, `compareKindPriority`, `getWorstKind`, `formatReason`, `formatCellStatusTooltip`, and `formatRowStatusTooltip` covering all 8 §7.4 `Reason` codes, `error > warning > unknown > ok` priority, dual dependent/dependency unavailable flagging, and §7.3.1 `activeEnvironments` filtering.
- **`tests/core/reducers.test.ts` & `tests/core/status.test.ts`**: Added 31 unit and table-driven tests covering 100% of §7.3, §7.3.1, and §7.4 rules.

## M1-Projections-Schema-Docs

- **`src/core/naming.ts`**: Implemented `formatTitle`, `formatPlatformDisplayName`, `sanitizeVersionNumber`, `extractExtension`, `formatFilename`, `formatEntryFilename`, and `resolveUniqueFilename` (`-2`, `-3`, … collision suffixing) per §8.1.
- **`src/core/projections.ts`**: Implemented `toTables`, `getSkippedEntries`, `toFileTree`, `toMrpack`, and `getMrpackWarnings` per §6.1, §7.4, §7.5, §8.1, and §8.3.
- **`src/core/serialize.ts`**: Implemented `validateInstanceSchema`, `serialize` (canonical key ordering, 2-space pretty-print, no derived status), and `deserialize` (explicit `schemaVersion` error and full structural validation against `schema/instance.schema.json`) per §6.1 and §8.2.
- **`tests/core/naming.test.ts`, `tests/core/projections.test.ts`, `tests/core/serialize.test.ts`**: Added 79 table-driven tests.
- **`docs/concepts.md` & `docs/instance-format.md`**: Updated documentation to reflect the M1 Core implementation.
