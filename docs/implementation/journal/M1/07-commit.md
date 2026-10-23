# Milestone M1 — Core: Commit & Push Log (Step 7)

## Commit Title

`feat(core): implement M1 domain model, resolver, reducers, status, projections, and schema`

## Commit / PR Description

# Implement M1 Core Domain Model, Resolver, Reducers, Status, Projections, and Schema

## Overview
✨ Implements the pure TypeScript `core/` domain layer and `ports/` contracts for Milestone M1, including independent per-environment version resolution, transitive dependency closure, selection reducers, status computation, view projections (`toTables`, `toFileTree`, `toMrpack`), and schema-validated `instance.json` serialization.

## Highlights
✨ Key changes:
* Defined authoritative §6 domain types in `src/core/model.ts` and §5.2 port interfaces (`ModrinthClient`, `FileFetcher`, `ArchiveWriter`) in `src/ports/index.ts`.
* Implemented collection input parsing, release-only game version filtering, §7.1 version resolution rules 1–4 (`pinned`, `latest-compatible`, `game-version-fallback`, `none`), and §7.2 fixed-point transitive required dependency closure with cycle protection in `src/core/collection.ts` and `src/core/resolver.ts`.
* Implemented §7.3 selection reducers (`select`, `deselect`, `select-all`, `deselect-all`, `set-version`, `reset-selection`) with sticky `off/user` dependency immunity and §7.4 / §7.3.1 status computation (`computeStatus`, `computeEntryStatus`) across all 8 `Reason` codes.
* Built §8.1 deterministic zip file naming (`src/core/naming.ts`), §6.1 / §8 view projections (`toTables`, `getSkippedEntries`, `toFileTree`, `toMrpack` in `src/core/projections.ts`), and §8.2 canonical `serialize` / `deserialize` with `schema/instance.schema.json` validation (`src/core/serialize.ts`).
* Added `FakeModrinthClient` and 173 core unit and table-driven tests covering 100% of §7.1–§7.4, §8, and §11 parity rules, and updated `docs/concepts.md` and `docs/instance-format.md`.

<details>

<summary><b>Changelog</b></summary>

### Implementation Changes
* **src/ports/index.ts**
  * Defined `ModrinthClient`, `FileFetcher`, `ArchiveWriter`, and `Archive` port interfaces
* **src/core/model.ts**
  * Defined `Instance`, `Entry`, `EnvironmentState`, `VersionRef`, `Status`, `Action`, and projection types
* **src/core/collection.ts**
  * Added `parseCollectionInput`, `extractCollectionId`, and `filterReleaseGameVersions`
* **src/core/resolver.ts**
  * Implemented `resolveVersionForEnvironment`, `resolveCollection`, `recomputeDependencyClosure`, and `changeEntryVersion`
* **src/core/reducers.ts**
  * Implemented `reduceInstance`, `computeInitialSelection`, `getHeaderTriState`, and `hasSelectionChangedFromDefault`
* **src/core/status.ts**
  * Implemented `computeStatus`, `computeEntryStatus`, and status tooltip formatters
* **src/core/naming.ts**
  * Implemented deterministic `{Title}-{Platform}-{GameVersion}-{VersionNumber}.{ext}` formatting and collision suffixing
* **src/core/projections.ts**
  * Implemented `toTables`, `getSkippedEntries`, `toFileTree`, `toMrpack`, and `getMrpackWarnings`
* **src/core/serialize.ts**
  * Implemented `validateInstanceSchema`, `serialize`, and `deserialize`
* **src/core/index.ts**
  * Re-exported all `core` modules
* **docs/concepts.md**
  * Documented M1 domain model, resolution order, selection rules, and `computeEntryStatus` / `computeStatus`
* **docs/instance-format.md**
  * Documented `instance.json` schema v1 validation and round-trip guarantees
* **docs/implementation/journal/M1/*.md**
  * Recorded M1 execution plan, implementation log, code review report, evaluations, fixes, verification, and commit log

### Test Changes
* **fake-modrinth-client.ts**
  * Added in-memory `FakeModrinthClient` test double with seed builders and call tracking
* **foundation.test.ts**
  * Tested model helpers and `FakeModrinthClient` query filtering
* **resolver.test.ts**
  * Added 26 table-driven tests for version resolution rules 1–4, release preference, pin conflicts, cycles, and closure recomputation
* **parity.test.ts**
  * Added 21 tests verifying §11 upstream parity requirements
* **reducers.test.ts**
  * Added 18 tests verifying §7.3 selection reducers, auto-select/deselect, sticky `off/user`, and tri-state headers
* **status.test.ts**
  * Added 23 table-driven positive and negative tests for all 8 §7.4 status reasons and active environment filtering
* **naming.test.ts**
  * Added 49 tests for deterministic filename formatting and collision handling
* **projections.test.ts**
  * Added 19 tests for `toTables`, `getSkippedEntries`, `toFileTree`, and `toMrpack`
* **serialize.test.ts**
  * Added 13 tests validating `serialize` / `deserialize` round-trips and full Draft 2020-12 compliance against `schema/instance.schema.json`

</details>
