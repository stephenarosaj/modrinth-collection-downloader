# Concepts & Domain Reference

This document defines the terminology, domain model, resolution rules, selection mechanics, and status system used throughout `modrinth-collection-downloader`.

---

## 1. Glossary

Use these exact terms across code, UI, and documentation:

| Term | Meaning |
|---|---|
| **Environment** | `client` or `server`. Never called "side". |
| **Platform** | Mod or plugin platform (`Fabric`, `Forge`, `NeoForge`, `Quilt`, `Paper`, etc.). Never called "loader" in UI, docs, or domain identifiers (raw API fields are wrapped in the Modrinth adapter). |
| **Game version** | Minecraft version (e.g., `1.20.1`). |
| **Project type** | `mod`, `plugin`, `datapack`, `resourcepack`, `shader` (+ `modpack`, which is skipped). |
| **Entry** | One project in the Instance registry (`origin: 'collection' | 'dependency'`). |
| **Dependency entry** | An entry whose project is required by another entry's chosen version. |
| **Instance** | The complete domain state: target metadata (`meta`) + registry of entries (`entries`). |

---

## 2. The Instance Model & Independent Environments

All three export formats (`client.zip`/`server.zip`, `instance.json`, `.mrpack`) and the review UI tables are pure projections of a single data structure: the **Instance** (`src/core/model.ts`):

- `toTables(instance)` (`src/core/projections.ts`) → ordered `TableModel[]` (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`) with collection `rows` and visible `dependencies` footers.
- `toFileTree(instance)` (`src/core/projections.ts`) → deterministic `{ client: FileTree; server: FileTree }` archive layouts using `formatFilename` and per-folder collision deduplication (`src/core/naming.ts`).
- `serialize(instance)` / `deserialize(json)` (`src/core/serialize.ts`) → schema-validated `instance.json` with deterministic key ordering.
- `toMrpack(instance, opts)` (`src/core/projections.ts`) → Modrinth `modrinth.index.json` (`MrpackIndex`) with per-environment support mapping, split entries when client and server choose different versions, plugin exclusion warnings (`getMrpackWarnings`), and optional platform version dependency mapping.

Each **Environment** (`client` and `server`) is a **fully independent lane**:
- Its own `support` value (`required`, `optional`, `unsupported`, `unknown`)
- Its own `candidates` list and chosen `version` (`VersionRef | null`)
- Its own `resolution` kind (`pinned`, `latest-compatible`, `game-version-fallback`, `user`, `none`)
- Its own `dependencies` (`projectId[]` required by the chosen version in that environment)
- Its own `requiredBy` (`projectId[]` of entries whose chosen version in that environment requires this entry)
- Its own `selection` (`{ on: boolean; source: 'none' | 'user' | 'auto' }`)
- Its own derived `Status` (`{ kind, reasons }`)

Both `client` and `server` lanes follow identical resolution, dependency, selection, and status rules.

---

## 3. Platforms & Project Types

Project types fall into two platform-matching categories during version resolution:

1. **Platform-specific types (`mod`, `plugin`):** Must match the target `gameVersion` and `platform` (with a game-version fallback rule when a version declares no platforms).
2. **Platform-agnostic types (`datapack`, `resourcepack`, `shader`):** Match on `gameVersion` only; platform is ignored and displayed as `—`.
3. **Skipped types (`modpack` and `.mrpack` primary files):** Refused during resolution and listed in the Skipped section.

---

## 4. Version Resolution Order

For each project and each environment independently, given target `{ gameVersion, platform, releasePreference }`, versions are resolved in the following priority order (the first rule yielding a version wins):

1. **Pinned (`resolution: 'pinned'`, dependencies only):**
   - If a requiring entry's chosen version in the same environment pins a specific `versionId`, and that version is compatible with the target `gameVersion` (and `platform`, if applicable), select that pinned version.
   - **Pinned conflicts:** If multiple requiring versions in the same environment pin different compatible versions of the same dependency, pick the compatible pinned version with the greatest `publishedAt` timestamp and attach the `PIN_CONFLICT` warning.
2. **Latest compatible (`resolution: 'latest-compatible'`):**
   - Filter versions that list the target `gameVersion` **and** the target `platform` (for `mod`/`plugin`).
   - Apply `releasePreference`:
     - `stable`: Pick the newest `release` version; if none exists, pick the newest version of any `versionType` (`beta`/`alpha`).
     - `newest`: Pick the newest version overall regardless of `versionType`.
   - "Newest" is always determined by greatest `publishedAt` timestamp (never by comparing version number strings).
3. **Game-version fallback (`resolution: 'game-version-fallback'`):**
   - For platform-specific types (`mod`/`plugin`), among versions matching `gameVersion` whose `platforms` array is **empty or missing**, pick the version with the greatest `publishedAt`.
   - Emits status warning `PLATFORM_UNVERIFIED`.
   - _Note:_ If versions exist for the target `gameVersion` but all declare *other* platforms, it is **not** a fallback case.
4. **None (`resolution: 'none'`):**
   - `version = null`. Emits status error `NO_COMPATIBLE_VERSION`.

### Candidate Pool & User Override

- `candidates` contains all compatible versions from rules 2 and 3 (ordered preferred-first), plus any pinned version from rule 1.
- When a user manually selects a version from a cell's version dropdown, `version` updates to that candidate (`resolution: 'user'`), and the dependency closure for that environment is recomputed (`changeEntryVersion` / `recomputeDependencyClosure`).

---

## 5. Dependency Rules (Closure)

- **Required Only:** Only dependencies with `type: 'required'` are followed. `optional`, `incompatible`, and `embedded` dependencies are ignored.
- **Per-Environment Transitive Closure:** Computed at resolve time independently for `client` and `server` starting from each entry's chosen version, using a visited set to prevent cycles.
- **Origin Precedence:** Every discovered dependency project becomes an `Entry` with `origin: 'dependency'`, unless the project is already part of the collection (in which case `origin: 'collection'` wins).
- **Closure Independence from Selection:** Dependency closure and `requiredBy` are determined by each entry's **chosen version** in that environment, regardless of whether entries are currently selected.
- **Version Override Recompute:** Changing an entry's chosen version in an environment (`set-version` / `changeEntryVersion` / `recomputeDependencyClosure`) recomputes that environment's dependency closure, fetches any newly referenced dependency projects or pinned versions from `ModrinthClient`, updates `requiredBy` edges, auto-selects newly required selectable dependencies (unless explicitly turned off by the user), auto-deselects orphaned `auto` dependencies, and returns `changes`.
- **Dependency Visibility Rule:** A dependency entry is always listed in the table's Dependencies footer if any entry requires it in any environment (regardless of selection).

---

## 6. Selection Rules

All selection mutations are pure reducers (`reduceInstance(instance, action) => { instance, changes }` in `src/core/reducers.ts`), where `changes` lists cells that were automatically selected or deselected (`reason: 'auto-selected' | 'auto-deselected'`).

- **Selectability (`isSelectable`):** An environment cell is selectable if and only if `support !== 'unsupported'` and `version !== null`. Cells with `support === 'unknown'` (and a valid `version`) are selectable.
- **Initial State (on Resolve / Re-resolve — `computeInitialSelection`):**
  - Every **collection** entry (`origin: 'collection'`) is selected (`{ on: true, source: 'user' }`) in every environment where it is selectable (`unknown` support included).
  - Every **dependency** entry (`origin: 'dependency'`) is selected (`{ on: true, source: 'auto' }`) in an environment if and only if it is selectable there **and** transitively required by at least one selected entry's chosen version in that environment; otherwise `{ on: false, source: 'none' }`.
- **Selecting an Entry (`select(entry, env)`):**
  - Sets the entry's cell to `{ on: true, source: 'user' }`.
  - For each transitive required dependency `D` in `env`: if `D` is selectable and its selection is **not** `{ on: false, source: 'user' }` (explicitly turned off by the user), set `D` to `{ on: true, source: 'auto' }` and record `D` in `changes`.
  - **User-off stays off:** A dependency explicitly turned off by the user (`{ on: false, source: 'user' }`) remains off across subsequent `select`, `select-all`, and version-override operations, and triggers `REQUIRED_DEPENDENCY_NOT_SELECTED`.
- **Deselecting an Entry (`deselect(entry, env)`):**
  - Sets the entry's cell to `{ on: false, source: 'user' }`.
  - Any dependency in `env` with `source: 'auto'` that is no longer transitively required by any *selected* entry in `env` is set to `{ on: false, source: 'auto' }` and recorded in `changes`.
  - **User-on stays on:** Dependencies manually checked by the user (`{ on: true, source: 'user' }`) are never auto-deselected.
- **Header Select-All / Deselect-All (`select-all` / `deselect-all` & `getHeaderTriState`):**
  - Operates per table, per environment on selectable **collection rows only** (dependency rows update automatically via the auto-select and auto-deselect rules).
  - Header checkbox state (`HeaderTriState`) is derived from selectable collection rows in that table and environment: `'checked'` when all are selected, `'unchecked'` when none are selected (or none are selectable), and `'indeterminate'` when a subset is selected.
- **Auto-Select UI Feedback:**
  - Every cell listed in `changes` flashes for ~1 second (or displays a static 1-second outline when `prefers-reduced-motion: reduce` is active), accompanied by a summary toast message (e.g., `"Auto-selected 3 client dependencies"`).
- **Target Change & Re-Resolve Confirmation (`hasSelectionChangedFromDefault`):**
  - Changing `gameVersion`, `platform`, or `releasePreference` triggers a full re-resolve and resets selections to the initial default state above. If `hasSelectionChangedFromDefault(instance)` is `true`, the UI prompts a confirmation dialog before discarding custom selections.

---

## 7. Environment Toggles

- Two top-level toggles (**Client** and **Server**) default to **off** when review tables first load, even though the underlying `Selection` state starts populated per §6.
- While an environment's toggle is **off**:
  - The column is visually grayed out and non-interactive (header Select-All, row checkboxes, and version dropdowns are disabled), while still displaying the underlying resolved versions and selections.
  - Status computation and visual highlights ignore inactive environments.
  - Environment-targeted export buttons (`client.zip` / `server.zip`) are disabled while their respective environment toggle is off.
- Toggling an environment **on** or **off** only enables or disables interaction for that column; it never alters `Selection` or `version` state.

---

## 8. Status and Symbol Reference

Status is derived purely from `Instance` (and optional active environment toggles) and is never stored in `Instance` or serialized to `instance.json`:

- `computeEntryStatus(instance, activeEnvironments?): Map<string, EntryStatus>` returns `{ client: Status | null, server: Status | null, row: Status | null }` per entry. Inactive environments, non-exportable (`modpack`) entries, and `unsupported` cells (when `NEEDED_BUT_UNAVAILABLE` does not apply) return `null`; `row` aggregates the worst active cell `Status` (or `null` if all active cells are `null`).
- `computeStatus(instance, activeEnvironments?): InstanceStatusMap` (`Map<string, Record<EnvironmentId, Status>>`) returns per-environment `Status` (`{ kind, reasons }`) for every entry, coalescing `null` cells from `computeEntryStatus` to `{ kind: 'ok', reasons: [] }`.

### Status Reasons (Per Environment Cell)

| Reason | Kind | Condition |
|---|---|---|
| `NO_COMPATIBLE_VERSION` | `error` | `version === null` (while `support !== 'unsupported'`) |
| `DEPENDENCY_UNAVAILABLE` | `error` | Entry is selected and at least one required dependency has `version === null` or `support === 'unsupported'` in this environment |
| `NEEDED_BUT_UNAVAILABLE` | `error` | This entry is required by at least one selected entry in this environment, but has `version === null` or `support === 'unsupported'` here |
| `REQUIRED_NOT_SELECTED` | `warning` | `support === 'required'` and selection is `{ on: false, source: 'user' }` (explicitly deselected by user) |
| `REQUIRED_DEPENDENCY_NOT_SELECTED` | `warning` | Entry is required by ≥1 *selected* entry in this environment, cell is selectable, and selection is `on: false` |
| `PIN_CONFLICT` | `warning` | Multiple requiring entries in this environment pin different compatible versions of this dependency (resolved to newest `publishedAt`) |
| `PLATFORM_UNVERIFIED` | `warning` | `resolution === 'game-version-fallback'` (version matched game version with empty/missing `platforms`) |
| `SUPPORT_UNKNOWN` | `unknown` | `support === 'unknown'` |

### Priority & Aggregation

- **Priority order:** `error` > `warning` > `unknown` > `ok`.
- A cell with no reasons has `kind: 'ok'`.
- An `unsupported` cell has no status and renders `✗`.
- **Row status:** Worst `kind` across **active** (toggled-on) environments. If neither environment toggle is active, no row status symbol is shown.

### Visual Symbols

| Kind | Symbol | Color | Visual Ring / Row Tint |
|---|---|---|---|
| `ok` | `✓` | Green | No tint / no cell ring |
| `warning` | `⚠` (triangle) | Amber | Amber row tint (if worst) + amber ring on affected environment cell |
| `error` | `⚠` (triangle with `!`) | Red | Red row tint (if worst) + red ring on affected environment cell |
| `unknown` | `?` (circle) | Purple | Purple row tint (if worst) + purple ring on affected environment cell |
