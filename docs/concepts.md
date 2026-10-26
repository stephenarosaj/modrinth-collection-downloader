# Concepts & Domain Rules

Authoritative specification for terminology, the `Instance` model, version resolution, dependency closure, selection reducers, environment toggles, and status computation.

---

## 1. Glossary (Strict Ubiquitous Language)

Use these exact terms across code identifiers, UI labels, comments, and docs:

| Term | Meaning |
| :--- | :--- |
| **Environment** | `client` or `server`. **Never** use `"side"` (except raw `client_side`/`server_side` fields inside `src/adapters/modrinth/`). |
| **Platform** | Mod or plugin platform (`fabric`, `forge`, `neoforge`, `quilt`, `paper`, etc.). **Never** use `"loader"` (except raw `/v2/tag/loader`, `loaders[]`, and `.mrpack` `"fabric-loader"`/`"quilt-loader"` keys). |
| **Game version** | Minecraft version (e.g., `1.20.1`). |
| **Project type** | `mod`, `plugin`, `datapack`, `resourcepack`, `shader` (+ `modpack`, which is skipped). |
| **Entry** | A project record in `instance.entries` (`origin: 'collection' | 'dependency'`). |
| **Instance** | Root state (`meta` + `entries`) defined in [`src/core/model.ts`](../src/core/model.ts). |

---

## 2. Independent Environment Environments

Every `Entry` contains two independent `EnvironmentState` environments (`environments.client` and `environments.server`). Each environment has its own:
- `support`: `'required' | 'optional' | 'unsupported' | 'unknown'`
- `candidates`: `VersionRef[]` (compatible versions, preferred-first)
- `version`: `VersionRef | null` (chosen version)
- `resolution`: `'pinned' | 'latest-compatible' | 'game-version-fallback' | 'user' | 'none'`
- `dependencies`: `string[]` (`projectId`s of `required` dependencies of `version` in this environment)
- `requiredBy`: `string[]` (`projectId`s of entries whose chosen `version` in this environment requires this entry)
- `selection`: `{ on: boolean; source: 'none' | 'user' | 'auto' }`

---

## 3. Project Types & Platform Matching

1. **Platform-specific (`mod`, `plugin`):** Match target `gameVersion` **and** `platform` (with game-version fallback if a version declares no platforms).
2. **Platform-agnostic (`datapack`, `resourcepack`, `shader`):** Match `gameVersion` only (`isPlatformAgnostic`); platform is displayed as `—`.
3. **Skipped (`modpack` and `.mrpack` primary files):** Refused during resolution and recorded in `SkippedProject[]`.

---

## 4. Version Resolution Priority (`src/core/resolver.ts`)

Evaluated independently per project and per environment (if `support === 'unsupported'`, `version` is `null` and `resolution` is `'none'`). First matching rule wins:

1. **`pinned` (`origin: 'dependency'` only):**
   - If a requiring entry's chosen version in the same environment pins `versionId` and that version matches target `gameVersion` (and `platform`, if applicable), pick it.
   - If multiple requiring entries in the same environment pin different compatible versions, pick the one with the greatest `publishedAt` timestamp and emit `PIN_CONFLICT`.
2. **`latest-compatible`:**
   - Filter versions matching `gameVersion` (and `platform` for `mod`/`plugin`).
   - `releasePreference === 'stable'`: newest `release` version, else newest `beta`/`alpha`.
   - `releasePreference === 'newest'`: newest version overall.
   - "Newest" is always determined by `publishedAt` timestamp (with `version.id` tie-breaker), never by comparing version strings.
3. **`game-version-fallback` (`mod` and `plugin` only):**
   - Among versions matching `gameVersion` whose `platforms` array is **empty**, pick the newest by `publishedAt`. Emits `PLATFORM_UNVERIFIED`.
   - *(Versions that list other platforms do not qualify for fallback.)*
4. **`none`:**
   - `version = null`. Emits `NO_COMPATIBLE_VERSION`.

**Candidates & User Override:** `candidates` holds all versions from rules 2 and 3 (preferred-first), plus any pinned version from rule 1. Selecting a candidate from the UI dropdown sets `resolution: 'user'` and recomputes that environment's dependency closure (`changeEntryVersion`).

---

## 5. Dependency Closure Rules (`src/core/resolver.ts`)

- **Required Only:** Only `type === 'required'` dependencies are traversed (`optional`, `incompatible`, and `embedded` are ignored).
- **Per-Environment & Cycle-Safe:** Computed independently for `client` and `server` using a visited set.
- **Origin Precedence:** Discovered dependencies have `origin: 'dependency'` unless already in the collection (`origin: 'collection'` wins).
- **Selection-Independent Graph:** `dependencies` and `requiredBy` depend only on each entry's **chosen `version`** in that environment, regardless of `selection.on`.
- **Footer Visibility:** A dependency entry is shown in its table's **Dependencies** footer whenever `requiredBy.length > 0` in either `client` or `server`.
- **Partial-Result Resilience:** `resolveCollection` throws only if `getCollection`, initial `getProjects`, or 100% of exportable collection `getProjectVersions` fail. Otherwise, failed collection projects are placed in `skipped` (omitted from `entries`), and failed transitive dependency fetches receive a placeholder entry with `version: null` so `DEPENDENCY_UNAVAILABLE` / `NEEDED_BUT_UNAVAILABLE` surface accurately.

---

## 6. Selection State Machine (`src/core/reducers.ts`)

All selection transitions are pure: `reduceInstance(instance, action) => { instance, changes }`.

- **Selectability (`isSelectable`):** `support !== 'unsupported' && version !== null` (`unknown` support is selectable).
- **Initial Default (`computeInitialSelection`):**
  - `origin === 'collection'`: `{ on: true, source: 'user' }` where selectable, else `{ on: false, source: 'none' }`.
  - `origin === 'dependency'`: `{ on: true, source: 'auto' }` where selectable **and** transitively required by ≥1 selected entry in that environment, else `{ on: false, source: 'none' }`.
- **`select(entry, env)`:**
  - Sets cell to `{ on: true, source: 'user' }`.
  - Traverses transitive required dependencies in `env`: any selectable dependency not already selected **and not `{ on: false, source: 'user' }`** becomes `{ on: true, source: 'auto' }` and is added to `changes`.
  - **Sticky `user-off`:** `{ on: false, source: 'user' }` is never overridden by auto-select, `select-all`, or version changes.
- **`deselect(entry, env)`:**
  - Sets cell to `{ on: false, source: 'user' }`.
  - Any dependency in `env` with `source === 'auto'` no longer transitively required by any selected entry in `env` becomes `{ on: false, source: 'auto' }` and is added to `changes`.
  - **Sticky `user-on`:** `{ on: true, source: 'user' }` is never auto-deselected.
- **Header `select-all` / `deselect-all` (`getHeaderTriState`):**
  - Operates per table, per environment on selectable **collection rows only**; dependency rows follow via auto-select/auto-deselect.
- **Re-Resolve Confirmation (`hasSelectionChangedFromDefault`):**
  - True whenever any entry's selection differs from `computeInitialSelection(instance)`.

---

## 7. Environment Toggles

- Top-level **Client** and **Server** toggles default to **off** (`{ client: false, server: false }`) on collection load and `instance.json` import.
- While an environment toggle is **off**:
  - Its table column is disabled and grayed out (while still showing resolved versions and selections).
  - Status calculation and visual highlights ignore that environment.
  - Its `.zip` export button (`Export client.zip` / `Export server.zip`) is disabled.
- Toggling an environment on/off never mutates `Instance`.

---

## 8. Status & Tooltip Reference (`src/core/status.ts`)

Status is derived purely from `Instance` and `activeEnvironments`. Priority order: **`error` (`!`) > `warning` (`⚠`) > `unknown` (`?`) > `ok` (`✓`)**.

- Inactive environments and `unsupported` cells (unless `NEEDED_BUT_UNAVAILABLE` applies) yield `null` cell status.
- Row status is the worst `Kind` across active cells; row tooltip joins active cell reasons (`Client: <msg>` / `Server: <msg>`) with newlines.
- Row background tint reflects row `Kind`; per-cell outline rings appear only on active cells where `kind !== 'ok'`.

| Reason | Kind | Condition | Verbatim `REASON_MESSAGES` (prefixed with `Client: ` / `Server: ` in tooltips) |
| :--- | :--- | :--- | :--- |
| `NO_COMPATIBLE_VERSION` | `error` (`!`) | `support !== 'unsupported'` and `version === null` | `"No compatible version is available for this environment."` |
| `DEPENDENCY_UNAVAILABLE` | `error` (`!`) | `selection.on` and ≥1 required dep has `version === null` or `support === 'unsupported'` | `"A required dependency is unavailable in this environment."` |
| `NEEDED_BUT_UNAVAILABLE` | `error` (`!`) | Required by ≥1 selected entry in this env, but `version === null` or `support === 'unsupported'` here | `"Required by a selected entry in this environment, but unavailable here."` |
| `DEPENDENCY_NOT_SELECTED` | `warning` (`⚠`) | `selection.on` and ≥1 selectable required dep has `selection.on === false` | `"A required dependency is not selected in this environment."` |
| `REQUIRED_NOT_SELECTED` | `warning` (`⚠`) | `support === 'required'` and `selection` is `{ on: false, source: 'user' }` | `"Marked as required for this environment, but explicitly deselected."` |
| `REQUIRED_DEPENDENCY_NOT_SELECTED` | `warning` (`⚠`) | Required by ≥1 selected entry in this env, selectable, and `selection.on === false` | `"Required by a selected entry in this environment, but not selected."` |
| `PIN_CONFLICT` | `warning` (`⚠`) | ≥2 requiring entries in this env pin different compatible versions of this dep | `"Multiple entries pin different versions of this dependency; resolved to the newest compatible pin."` |
| `PLATFORM_UNVERIFIED` | `warning` (`⚠`) | `resolution === 'game-version-fallback'` | `"Resolved via game-version fallback (version does not explicitly list a platform)."` |
| `SUPPORT_UNKNOWN` | `unknown` (`?`) | `support === 'unknown'` | `"Environment support is unknown on Modrinth."` |
| *(none)* | `ok` (`✓`) | Active supported cell with zero reasons | `"OK"` |
