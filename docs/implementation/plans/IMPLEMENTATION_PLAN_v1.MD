# PLAN.md — Modrinth Collection Instance Builder

Authoritative implementation plan. Implementing agents: follow this document. Where it says **MUST**, deviation requires the owner's approval. Where it says **VERIFY**, check against the live Modrinth API and record the result in `docs/modrinth-api-notes.md` before coding against the assumption.

Name: `modrinth-collection-downloader` (single constant `APP_NAME` in `src/app/config.ts`).

---

## 1. Purpose

A fully client-side web app. The user enters a Modrinth collection, chooses a **game version** and **platform**, reviews every project in per-type tables, selects which **environments** (client, server) to include for each project, and exports the result as:

- `client.zip` and `server.zip` (separate, per-type folders),
- `instance.json` (full data export, re-importable),
- a Modrinth `.mrpack`.

All three outputs and the review tables are views of one data structure, the **Instance** (§6).

## 2. Provenance and licensing

- Derived from <https://github.com/DanyCDev/modrinth-collection-web-download> (MIT, live at <https://md.dkg.sk/>).
- Start as a GitHub fork so git history and attribution are preserved. This is a standalone derivative project; it is not intended to be merged upstream.
- License: **MIT**. `LICENSE` MUST keep the original license text verbatim (including the original copyright line) and add the new owner's copyright line.
- `README.md` MUST contain a "Based on" section linking the upstream repo and https://md.dkg.sk/.
- Footer of the app MUST credit and link upstream.

## 3. Glossary (use these terms in code, UI, docs)

| Term | Meaning |
|---|---|
| **Environment** | `client` or `server`. Never "side". |
| **Platform** | Mod loader / plugin platform (Fabric, Forge, NeoForge, Quilt, Paper, …). Never "loader" in UI/docs/identifiers (API field names excepted, wrapped in the adapter). |
| **Game version** | Minecraft version (e.g. `1.20.1`). |
| **Project type** | `mod`, `plugin`, `datapack`, `resourcepack`, `shader` (+ `modpack`, which is skipped). |
| **Entry** | One project in the Instance registry. |
| **Dependency entry** | An entry whose project is required by another entry's chosen version. |
| **Instance** | The full model: target + registry of entries (§6). |

Each environment is a fully independent lane: own support value, own resolved version, own selection, own dependencies, own status. Both lanes follow identical rules.

## 4. Scope

**In scope:** everything in this document.

**Out of scope (do not build):** accounts/auth, server-side backend, modpack (`.mrpack`) *import* from Modrinth projects, mod search, update checking, launcher integration, i18n, analytics.

## 5. Tech stack and conventions

- Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`) + React 18+ + Vitest + Testing Library.
- ESLint + Prettier. `eslint-plugin-boundaries` (or `dependency-cruiser`) MUST enforce the import rules in §5.1 in CI.
- Plain CSS (CSS modules OK). Reuse the dark theme tokens from the original (`--bg`, `--surface`, `--accent`, …).
- State: React `useReducer` + context driven by core reducers. No external state library.
- JSON export validated by a JSON Schema in `schema/instance.schema.json`.
- Static site; deploy to GitHub Pages (M5). No server code.
- Each milestone sub-step lands as a small PR with green CI. Conventional commit messages.

### 5.1 Layout and import rules

```
src/
  core/       pure TS. Domain types, resolver, reducers, status, naming, projections. NO react, NO DOM, NO fetch, NO adapters.
  ports/      interfaces only (§5.2). May be imported by core, adapters, app.
  adapters/   modrinth/, zip/, fetch/ — implement ports. Import ports + core types only.
  ui/         React components/hooks. Import core + ports types. NEVER import adapters.
  app/        composition root: wires adapters into core/ui; config.
schema/       instance.schema.json
docs/         see §12
tests/        fixtures (recorded API JSON) and e2e if added
```

Rules: `core` → (ports types only). `adapters` → (ports, core types). `ui` → (core, ports). Only `app` imports adapters.

### 5.2 Ports

```ts
interface ModrinthClient {
  getCollection(id: string): Promise<{ id: string; name: string; projectIds: string[] }>;
  getProjects(ids: string[]): Promise<ProjectInfo[]>;                       // batched
  getProjectVersions(projectId: string, q: { gameVersion: string; platform?: string }): Promise<VersionInfo[]>;
  getVersionsByIds(ids: string[]): Promise<VersionInfo[]>;                   // batched; for pinned dependency versions
  getGameVersions(): Promise<GameVersionInfo[]>;                             // /v2/tag/game_version
  getPlatforms(): Promise<PlatformInfo[]>;                                   // /v2/tag/loader
}
interface FileFetcher {
  fetchBinary(url: string, opts?: { signal?: AbortSignal }): Promise<Uint8Array>;
}
interface ArchiveWriter {
  create(): Archive;
}
interface Archive {
  addFile(path: string, data: Uint8Array | string): void;
  generate(opts?: { onProgress?: (pct: number) => void }): Promise<Blob>;
}
```

JSZip lives only in `adapters/zip`. The Modrinth adapter MUST: batch where the API allows; cap concurrency (default 5); retry 429/5xx with backoff honoring `Retry-After` / `X-Ratelimit-*`; accept `AbortSignal`. (Browsers cannot set `User-Agent`; do not rely on it.)

## 6. Domain model (authoritative; implement in `src/core/model.ts`)

```ts
type EnvironmentId = 'client' | 'server';
type Support = 'required' | 'optional' | 'unsupported' | 'unknown';
type ProjectType = 'mod' | 'plugin' | 'datapack' | 'resourcepack' | 'shader' | 'modpack';
type VersionType = 'release' | 'beta' | 'alpha';

interface FileRef { filename: string; url: string; size: number; sha1: string; sha512: string }
interface VersionRef {
  id: string; versionNumber: string; versionType: VersionType; publishedAt: string;
  gameVersions: string[]; platforms: string[];
  file: FileRef;                                   // the primary file
  dependencies: { projectId: string; versionId?: string; type: 'required' | 'optional' | 'incompatible' | 'embedded' }[];
}

// Last actor decides the source. off+'user' means the user explicitly turned it off.
interface Selection { on: boolean; source: 'none' | 'user' | 'auto' }

type Resolution = 'pinned' | 'latest-compatible' | 'game-version-fallback' | 'user' | 'none';

interface EnvironmentState {
  support: Support;
  candidates: VersionRef[];        // compatible versions, preferred first (§7.1)
  version: VersionRef | null;      // chosen
  resolution: Resolution;
  dependencies: string[];          // projectIds of REQUIRED deps of the chosen version (static per chosen version)
  requiredBy: string[];            // projectIds of entries whose chosen version in this environment requires this entry (any selection state)
  selection: Selection;
}

interface Entry {
  project: { id: string; slug: string; title: string; type: ProjectType; modrinthUrl: string };
  origin: 'collection' | 'dependency';             // 'collection' wins if both
  environments: Record<EnvironmentId, EnvironmentState>;
}

interface Instance {
  schemaVersion: 1;
  meta: {
    name: string; source: { collectionId: string; url: string };
    target: { gameVersion: string; platform: string; releasePreference: 'stable' | 'newest' };
    createdAt: string;
  };
  entries: Entry[];                                // the registry
}
```

`status` (§7.4) is **derived**, never stored or serialized.

### 6.1 One data, three views (MUST be pure functions of `Instance`)

- `toTables(instance): TableModel[]` → one table per project type present, rows = collection entries, footer = dependency entries.
- `toFileTree(instance): { client: FileTree; server: FileTree }` → §8.
- `serialize(instance): string` / `deserialize(json): Instance` → `instance.json`, schema-validated.
- `toMrpack(instance, opts): MrpackIndex` → §8.3.

All selection changes are reducers `(Instance, Action) => { instance: Instance; changes: Change[] }`, where `changes` lists cells auto-selected/auto-deselected (drives the UI flash).

## 7. Behavior specification

### 7.1 Version resolution (per project, per environment, independently)

Target = `{ gameVersion, platform, releasePreference }`.

Platform matching applies to types `mod` and `plugin`. Types `resourcepack`, `shader`, `datapack` are platform-agnostic: match on game version only.

For a project in an environment, resolve in this order; the first rule that yields a version wins:

1. **Pinned** (dependencies only): if a requiring version pins a `versionId` and that version is compatible (lists the game version and, if applicable, the platform), use it.
2. **Latest compatible**: versions listing the game version **and** the platform (if applicable). Apply release preference: `stable` → newest `release`, else newest of any type; `newest` → newest overall. "Newest" = greatest `publishedAt` (never compare version-number strings).
3. **Game-version fallback** ("not possible to tell"): among versions listing the game version whose `platforms` array is **empty/missing**, pick the greatest `publishedAt`. Mark `resolution: 'game-version-fallback'` (status warning `PLATFORM_UNVERIFIED`). If versions exist for the game version but all declare *other* platforms, this is **not** a fallback case.
4. **None**: `version = null`, `resolution: 'none'`.

`candidates` = all compatible versions (rules 2 and 3 pools), preferred first; the pinned version is included. The user may override `version` from `candidates` (`resolution: 'user'`).

**Pinned conflicts:** if multiple requiring versions in the same environment pin different versions of the same dependency, choose the compatible pin with the greatest `publishedAt` and emit warning `PIN_CONFLICT`.

### 7.2 Dependency closure

- Only `dependency_type: 'required'` dependencies are followed. `optional`, `incompatible`, `embedded` are ignored.
- Closure is computed at resolve time, per environment, from each chosen version, transitively, with cycle protection (visited set). It is independent of selection.
- Every dependency project becomes an Entry (`origin: 'dependency'`, or stays `'collection'` if already in the collection). Its own support/version/closure are resolved with the same rules.
- `requiredBy` is populated for every environment where a chosen version requires the entry.
- When the user changes a chosen version (dropdown), recompute that environment's closure (may fetch new dependency data), diff, and report `changes`.

### 7.3 Selection rules (reducers)

- A cell is **selectable** iff `support !== 'unsupported'` and `version !== null`. `unknown` support is selectable and included by default (flagged purple, §7.4).
- **Initial state (on resolve or re-resolve):** every **collection** entry is selected (`on:true, source:'user'`) in every environment where it is selectable, `unknown` included. Every **dependency** entry is selected (`on:true, source:'auto'`) in exactly the environments where it is required by a selected entry's chosen version in that environment; it is not selected in environments where it isn't required, even if it would otherwise be selectable there. This is the default regardless of the environment toggles in §7.3.1 — the toggles gate interaction/activity, not the underlying selection.
- `select(entry, env)` → `on:true, source:'user'`. Then for each required dependency D of the chosen version (transitively): if D's cell is selectable and is **not** `off/user` (i.e. not explicitly turned off by the user), set `on:true, source:'auto'` and add to `changes`. A dependency the user explicitly turned off stays off (and shows amber, §7.4).
- `deselect(entry, env)` → `on:false, source:'user'`. Then any dependency with `source:'auto'` that is no longer required by any *selected* entry in this environment → `on:false, source:'auto'` and added to `changes`. Dependencies with `source:'user'` are untouched.
- Header **select-all** (per environment, per table) acts on that table's collection rows only (dependency rows follow via auto-select). Tri-state checkbox (checked / indeterminate / unchecked). Deselect-all is the inverse.
- Changing game version, platform, or release preference triggers a full re-resolve and **resets selection to the initial state above** (not cleared); show a confirm dialog first if any selection differs from default.

### 7.3.1 Environment toggles

- Two top-level toggles, **Client** and **Server**, independent, both **off by default** on first load of the tables (even though underlying selection defaults to "all selected" per §7.3). The user must explicitly turn on an environment before its column is interactive.
- While an environment's toggle is off: that environment's column (all tables) is visually grayed out and all checkboxes/version dropdowns in it are disabled (not interactable), but the underlying `Selection`/`version` state is unchanged and still shows through (grayed, not blanked) so turning the toggle on reveals the pre-existing default selection rather than an empty column.
- Turning a toggle on enables interaction with that column only; it does not change any `Selection` values.
- Turning a toggle off only disables interaction; it does not change any `Selection` values (so re-enabling restores exactly what was there).
- Status/highlighting (§7.4) is computed only for **active** (toggled-on) environments. A cell/row in an inactive environment is grayed and shows no status symbol contribution; the row's overall symbol reflects only active environments. If neither environment is active, rows show no status symbol.
- Export actions (§8) that target an environment (e.g. `client.zip`) are disabled while that environment's toggle is off, to force an explicit decision before producing output.

### 7.4 Status (pure `computeStatus(instance): Map<entryId, Record<env, Status>>`)

```ts
type Kind = 'ok' | 'warning' | 'error' | 'unknown';
interface Status { kind: Kind; reasons: Reason[] }
```

Per environment cell with `support !== 'unsupported'`:

| Reason | Kind | Condition |
|---|---|---|
| `NO_COMPATIBLE_VERSION` | error | `version === null` |
| `DEPENDENCY_UNAVAILABLE` | error | entry is selected and a required dependency has `version === null` or `support === 'unsupported'` in this environment |
| `NEEDED_BUT_UNAVAILABLE` | error | this entry is needed by a selected entry in this environment but is unsupported/has no version there |
| `REQUIRED_NOT_SELECTED` | warning | `support === 'required'` and selection is `off/user` (user explicitly turned it off) |
| `REQUIRED_DEPENDENCY_NOT_SELECTED` | warning | needed by ≥1 *selected* entry in this environment, cell is selectable, and selection is off |
| `PIN_CONFLICT` | warning | see §7.1 |
| `PLATFORM_UNVERIFIED` | warning | `resolution === 'game-version-fallback'` |
| `SUPPORT_UNKNOWN` | unknown | `support === 'unknown'` |

`kind` = worst reason by priority **error > warning > unknown > ok**. `ok` applies when no reasons. **Row status** = worst across both environments. An unsupported cell has no status and renders ✗.

Dependency visibility rule: a dependency entry is **always listed** if any collection entry requires it in any environment (regardless of selection). When it is unavailable in an environment where it is needed, **both** the dependent entry and the dependency are flagged (`DEPENDENCY_UNAVAILABLE` / `NEEDED_BUT_UNAVAILABLE`) for that environment.

### 7.5 Review UI (React)

One table per project type present (order: mods, plugins, datapacks, resource packs, shaders). Each table has:

- **Thin unnamed left column:** status symbol of the row (worst across environments). Hover/focus tooltip explains every reason for **each** environment (e.g. "Client: required mod is not selected.").
  - green ✓ = ok; amber ⚠ (triangle) = warning; red ⚠ (triangle with exclamation) = error; purple `?` (circle) = unknown. Distinct shapes plus color; tooltips keyboard-focusable; `aria-label` on every symbol. Color is never the only signal.
- Columns: **Name** (with "Open on Modrinth ↗" link), **Platform** (resolved/target; omitted/“—” for platform-agnostic types), **Client**, **Server**.
- **Environment cell:** checkbox, version dropdown (`candidates`; fallback versions tagged), support tag (`required` / `optional` / `unknown`). Unsupported → `✗` (no checkbox). No version → disabled cell reading "No compatible version".
- **Header:** per-environment select-all (tri-state).
- **Highlighting:** row-wide tint by row status; plus a **ring around each environment cell** whose own status is not `ok`, so it is clear which environment(s) have the issue. Colors: red (error), amber (warning), purple (unknown).
- **Dependency footer:** a section at the bottom of the *same* table (same columns/logic), headed "Dependencies", each row showing "required by: A, B (client)" per environment.
- **Auto-select feedback:** cells in `changes` flash (CSS animation, ~1s) and a toast reads e.g. "Auto-selected 3 client dependencies". Respect `prefers-reduced-motion` (replace the flash with a static outline for 1s).
- **Skipped section:** `modpack` projects and unknown types are listed with the reason; not selectable.
- Must stay responsive with ≥500 rows (memoize rows; virtualize only if profiling requires).

### 7.6 Flow

1. **Input:** collection URL/ID (parse `modrinth.com/collection/<id>` or bare ID — parity with the original), game version (from `getGameVersions()`, `release` types only), platform (from `getPlatforms()`), release preference. Button: **Load collection**.
2. **Resolve:** progress UI (counts + log). Cancellable.
3. **Review:** §7.5.
4. **Export:** buttons for `client.zip`, `server.zip`, `instance.json`, `.mrpack`. Zips fetch binaries only now, with progress and cancel. Failed downloads are listed; successful ones still zip.

## 8. Output specification

### 8.1 Zips

- Files: `<collectionId>-client.zip`, `<collectionId>-server.zip`. A zip contains only entries selected in that environment (explicit or auto), each using that environment's chosen version.
- Folders by type: `mods/`, `plugins/`, `datapacks/`, `resourcepacks/`, `shaderpacks/`.
- Filename: `{Title}-{Platform}-{GameVersion}-{VersionNumber}.{ext}`, e.g. `BetterThirdPerson-Forge-1.20-1.9.0.jar`.
  - `Title`: project title split on whitespace, each word capitalized (first char upper-cased, rest unchanged), all non `[A-Za-z0-9]` characters removed, words joined.
  - `Platform`: display name (`Forge`, `Fabric`, `NeoForge`, `Quilt`, …; fall back to title-case). **Omitted** for platform-agnostic types.
  - `GameVersion`: the *target* game version.
  - `VersionNumber`: version's `versionNumber` with `\ / : * ? " < > |` and whitespace replaced by `-`.
  - `ext`: from the original file's extension.
  - Collision within a folder → append `-2`, `-3`, … before the extension.
- An unselected/unavailable environment produces no zip content; if nothing is selected, the button is disabled.

### 8.2 instance.json

`serialize(instance)` (pretty-printed, stable key order). Validated against `schema/instance.schema.json` on export and import. Import restores the review state **without network**; binaries are fetched at export time via stored URLs. Derived `status` is not stored. Unknown future `schemaVersion` → clear error.

### 8.3 .mrpack

- File `<collectionId>.mrpack` (a zip) containing `modrinth.index.json` (`formatVersion: 1`, `game: "minecraft"`, `versionId`, `name`, `files[]`, `dependencies`). **No binaries are downloaded**: `files[].downloads` use the version's CDN URL; `hashes` use `sha1` + `sha512` from version metadata; `fileSize` from metadata.
- `files[].path` per type: `mods/…`, `resourcepacks/…`, `shaderpacks/…`, `datapacks/…` (VERIFY datapack handling in Prism and the official launcher; document). Plugins are **excluded** with a visible warning at export.
- `files[].env.client` / `.server`: if the entry is selected in that environment, the project's support value (`required`/`optional`; `unknown` → `optional`); if not selected, `unsupported`.
- If client and server chose **different versions** of a project, emit **two** file entries (one per version), each with `env` set only for its own environment (the other `unsupported`). If both chose the same version id, emit one entry.
- `dependencies`: `minecraft: <gameVersion>`. Optional "platform version" text field at export (e.g. a Fabric loader version): if provided, add the platform key (`fabric-loader`, `quilt-loader`, `forge`, `neoforge`); if blank, omit it and note this in docs. VERIFY key names and launcher behavior.
- Include `docs`-linked attribution is not required in the file itself.

## 9. Modrinth API usage (VERIFY all in M2; record in `docs/modrinth-api-notes.md`)

Base `https://api.modrinth.com`. Anticipated endpoints:

- `GET /v3/collection/{id}` → project ids (as the original).
- `GET /v2/projects?ids=["…"]` (batch) → `title`, `slug`, `project_type`, `client_side`, `server_side`.
- `GET /v2/project/{id}/version?game_versions=["…"]&loaders=["…"]` → versions (`version_number`, `version_type`, `date_published`, `game_versions`, `loaders`, `files[]` with `primary`/`hashes`/`size`/`url`, `dependencies[]`).
- `GET /v2/versions?ids=["…"]` → pinned dependency versions.
- `GET /v2/tag/game_version` → `{ version, version_type, date, major }`.
- `GET /v2/tag/loader` → platform names.

VERIFY specifically:
1. How to distinguish `plugin` and `datapack` from `mod` (v2 reports `mod` for both; check v3 `project_types` and version `loaders` such as `datapack`, `paper`, `spigot`, `bukkit`, `folia`, `purpur`). Document the final classification rule and unit-test it with fixtures.
2. Where environment support lives in the chosen API version (`client_side`/`server_side` vs v3 `environment`) and the exact value set; map to `Support`.
3. Rate-limit headers and behavior.
4. Mrpack dependency key names and datapack path handling.

## 10. Testing

- **core:** unit tests, no mocks beyond in-memory fake `ModrinthClient`. Table-driven tests for: version resolution rules 1–4, release preference, pin conflicts, closure with cycles, reducers (select/deselect/auto/user-off), status table (§7.4), naming (incl. collisions), `toFileTree`, `toMrpack`, serialize/deserialize round-trip.
- **adapters:** tests against recorded JSON fixtures in `tests/fixtures/` (use `msw` or a fetch stub); cover batching, retry/backoff, abort.
- **ui:** Testing Library tests for table states (each status/reason, tooltips, select-all tri-state, flash/toast, ✗ cells, dependency footer).
- **Schema:** tests validate sample instances against `schema/instance.schema.json`.
- CI MUST run lint, typecheck, test, build on every PR.

## 11. Parity requirements from the original (M1 acceptance)

- Collection ID/URL parsing; `release`-only game version list; prefer-stable semantics; platform-agnostic handling for resourcepack/datapack/shader; modpacks and `.mrpack` primary files are refused; duplicate avoidance; error handling for missing versions/files.

## 12. Documentation (part of every milestone's definition of done)

- `README.md`: what it is, quickstart, features, **Based on** attribution, license.
- `docs/user-guide.md`: step-by-step walkthrough of every feature, with screenshots (added in M3.x/M4/M5 as features land).
- `docs/concepts.md`: Instance, environments, platforms, dependency rules, version-resolution order, selection rules, status/symbol reference (the symbol tooltips are the in-app legend; the doc mirrors them).
- `docs/instance-format.md` + `schema/instance.schema.json`.
- `docs/output-formats.md`: zip layout, naming, `.mrpack` mapping.
- `docs/modrinth-api-notes.md`: results of VERIFY items.
- `docs/architecture.md`: layers, import rules, ports, data flow.
- `docs/decisions.md`: any decision made during implementation that this plan did not specify.
- `CONTRIBUTING.md`: setup, scripts, conventions, how to add a platform/type.
- Each PR that changes behavior updates the relevant doc in the same PR.

## 13. Milestones and acceptance criteria

Do not start a milestone until the previous one's acceptance criteria pass.

### M0 — Project scaffold
Tasks: fork + clone; Vite/TS/React/Vitest/ESLint/Prettier setup; boundaries lint rule; GitHub Actions CI; `LICENSE` (original + new line); README with attribution; docs skeleton; `APP_NAME` config.
Accept: `npm run lint && npm run typecheck && npm test && npm run build` pass in CI; boundaries rule fails a deliberate violation (add a test/fixture proving it); LICENSE and attribution present.

### M1 — Core
Tasks: model (§6), resolver (§7.1–7.2) against the `ModrinthClient` port, reducers (§7.3), status (§7.4), projections `toTables` / `toFileTree` / `serialize` / `deserialize`, naming (§8.1), JSON Schema, in-memory fake client for tests. Parity checklist (§11) as tests.
Accept: all §10 core tests pass; 100% of rules in §7.1, §7.3, §7.4 covered by table-driven tests; `core/` has zero imports of react/DOM/adapters (lint-enforced); docs `concepts.md` and `instance-format.md` written.

### M2 — Adapters
Tasks: Modrinth adapter (all `ModrinthClient` methods, batching, concurrency cap, retry/backoff, abort); `fetch` file fetcher; JSZip archive adapter; composition root; complete the VERIFY list (§9) and record it.
Accept: adapter tests pass against fixtures; VERIFY items 1–4 documented with the decisions applied; a script (or test) resolves a real collection end-to-end into an `Instance` and serializes it.

### M3.1 — Read-only tables + JSON export
Tasks: input form (collection, game version from `/v2/tag/game_version`, platform from `/v2/tag/loader`, release preference); resolve progress; per-type tables with dependency footers; "Open on Modrinth" links; every available environment displayed (no selection UI, no defaults); skipped section; `instance.json` export.
Accept: loading a real collection shows one table per present type with correct support tags per environment, version, and dependency footer with "required by"; unsupported cells show ✗; exported JSON validates against the schema; UI tests pass; user-guide section for loading and reading the tables.

### M3.2 — Selection and dependency auto-select
Tasks: per-environment checkboxes, header select-all (tri-state), per-environment version dropdowns with closure recompute, auto-select/deselect rules (§7.3), flash + toast with reduced-motion handling, re-resolve-with-confirm on target change.
Accept: reducer and UI tests prove §7.3 (including "user-off dependency stays off", auto-deselect when no longer needed, independent environments, version change recomputes dependencies); flashes appear exactly for `changes`; docs updated.

### M3.3 — Status symbols, tooltips, highlights
Tasks: left status column, symbols/tooltips for every `Reason`, row tint, per-cell ring, dependency/dependent dual highlighting, accessibility (keyboard focus, aria-labels, non-color signals).
Accept: UI tests assert each reason's symbol, tooltip text, tint, and ring placement (single environment vs both); the status table in `concepts.md` matches the in-app tooltips; axe (or equivalent) check passes on the review screen.

### M4 — Outputs
Tasks: `client.zip` / `server.zip` with per-type folders and naming (§8.1), binary download with progress/cancel and partial-failure reporting, `instance.json` import (offline restore), `.mrpack` export (§8.3) with optional platform version field and plugin warning.
Accept: zip contents and filenames match `toFileTree` exactly (tested with fake fetcher/archive); import→export round-trips losslessly; `.mrpack` index validates against the structure in §8.3 and imports into a launcher (manual check documented in `docs/output-formats.md`); docs updated.

### M5 — Polish and release
Tasks: error and rate-limit UX (clear messages, retry, partial results), empty/edge states, performance pass at 500 rows, full docs pass with screenshots, GitHub Pages deploy workflow, `CONTRIBUTING.md`.
Accept: deployed site works end-to-end; docs complete per §12; CI green; manual QA checklist recorded in `docs/decisions.md` or the PR.

## 14. Rules for implementing agents

1. Implement milestone by milestone, in order; one small PR per sub-step.
2. Keep `core/` pure. If a feature seems to need `fetch` or DOM in core, add a port instead.
3. Do not add features, dependencies, or UI not specified here. If something is ambiguous, record your choice in `docs/decisions.md` and keep it minimal.
4. Tests and docs ship with the code that needs them.
5. Never assume client vs server intent: no default selection, ever.
6. Never mark an API assumption as fact without checking the live API (§9 VERIFY).
