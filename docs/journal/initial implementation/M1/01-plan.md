# Milestone M1 — Core: Execution Plan

## Work Breakdown

To preserve orchestrator context and prevent cross-agent type or file conflicts, Milestone M1 (`src/core/`, `src/ports/`, `schema/`, `tests/core/`, and M1 docs) is split into a shared contract stage followed by three parallel implementation streams:

1. **M1-Foundation (`src/ports/index.ts`, `src/core/model.ts`, `tests/helpers/fake-modrinth-client.ts`)**
   - Authoritative domain types from §6 (`Instance`, `Entry`, `EnvironmentState`, `VersionRef`, `FileRef`, `Selection`, `Resolution`, `Support`, `ProjectType`, `VersionType`, `EnvironmentId`).
   - Derived status types from §7.4 (`Kind`, `Reason`, `Status`, `EntryStatus`).
   - Reducer action and change types from §6.1 & §7.3 (`Action`, `Change`, `ReducerResult`).
   - Projection return types from §6.1 & §8 (`TableModel`, `TableRow`, `SkippedItem`, `FileTree`, `FileTreeItem`, `MrpackIndex`, `MrpackFile`, `MrpackOptions`).
   - Port interfaces from §5.2 (`ModrinthClient`, `ProjectInfo`, `VersionInfo`, `GameVersionInfo`, `PlatformInfo`, `FileFetcher`, `ArchiveWriter`, `Archive`).
   - In-memory `FakeModrinthClient` for deterministic unit testing (§10).

2. **M1-Resolver (`src/core/collection.ts`, `src/core/resolver.ts`, `tests/core/resolver.test.ts`, `tests/core/parity.test.ts`)**
   - Collection URL/ID parsing and `release`-only game version filtering (§7.6, §11).
   - Per-project, per-environment version resolution (§7.1: Pinned → Latest compatible → Game-version fallback → None; `stable` vs `newest` release preference by `publishedAt`; platform-agnostic handling for `resourcepack`, `shader`, `datapack`; `.mrpack` primary file rejection; `PIN_CONFLICT` detection).
   - Transitive required-only dependency closure with cycle protection (§7.2) and version-override closure recomputation.
   - Table-driven tests covering 100% of §7.1, §7.2, and §11 parity requirements.

3. **M1-Reducers-Status (`src/core/reducers.ts`, `src/core/status.ts`, `tests/core/reducers.test.ts`, `tests/core/status.test.ts`)**
   - Selection reducers (§7.3: initial selection state, `select`, `deselect`, `select-all` / `deselect-all` tri-state for collection entries, `user-off` dependency immunity, auto-deselect when no longer required by any selected entry, version change handling, target change reset check).
   - Pure status computation (§7.4 & §7.3.1: `computeStatus(instance, activeEnvs?)` covering all 8 `Reason` codes, priority ordering `error > warning > unknown > ok`, per-cell and worst-of-active-environments row status, and dual dependent/dependency unavailable flagging).
   - Table-driven unit tests covering 100% of §7.3 and §7.4 rules.

4. **M1-Projections-Schema-Docs (`src/core/naming.ts`, `src/core/projections.ts`, `src/core/serialize.ts`, `src/core/index.ts`, `schema/instance.schema.json`, `tests/core/naming.test.ts`, `tests/core/projections.test.ts`, `tests/core/serialize.test.ts`, `docs/concepts.md`, `docs/instance-format.md`)**
   - Deterministic zip file naming (`{Title}-{Platform}-{GameVersion}-{VersionNumber}.{ext}`) and folder collision suffixing (`-2`, `-3`, …) (§8.1).
   - Pure projections: `toTables(instance)`, `toFileTree(instance)`, and `toMrpack(instance, opts)` (§6.1, §8.1, §8.3).
   - Schema-validated `serialize(instance)` (stable key order) and `deserialize(json)` (with clear error on unknown future `schemaVersion` or invalid structure) (§8.2, §10).
   - Documentation updates to `docs/concepts.md` and `docs/instance-format.md`.
