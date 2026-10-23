# Architectural & Implementation Decisions

This log records technical, architectural, and implementation choices made where `IMPLEMENTATION_PLAN_v1.MD` left room for discretion.

---

## M0 — Project Scaffold & Tooling Decisions

### D-001: Package Manager — Yarn

- **Context:** The project needed a deterministic Node.js package manager for local development and GitHub Actions CI.
- **Decision:** Standardize on **Yarn** (`yarn install --frozen-lockfile`, `yarn lint`, `yarn typecheck`, `yarn test`, `yarn build`) with a tracked `yarn.lock`.
- **Rationale:** Matches developer environment preferences and provides fast, reproducible installs in CI.

### D-002: Build Tool & Test Runner — Vite + Vitest + Testing Library

- **Context:** §5 specifies Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`) + React 18+ + Vitest + Testing Library.
- **Decision:**
  - Use **Vite** with `@vitejs/plugin-react` for development and static bundle builds.
  - Use **Vitest** with `jsdom` and `@testing-library/react` / `@testing-library/jest-dom` for unit and UI component testing.
  - Enforce `strict: true` and `noUncheckedIndexedAccess: true` in `tsconfig.json`.

### D-003: Architectural Boundary Enforcement — `eslint-plugin-boundaries`

- **Context:** §5 and §5.1 require ESLint to enforce strict import rules across `core`, `ports`, `adapters`, `ui`, and `app` in CI, with an automated test proving a deliberate boundary violation fails linting.
- **Decision:** Configure ESLint flat config (`eslint.config.js`) with `eslint-plugin-boundaries` defining element types for `core`, `ports`, `adapters`, `ui`, and `app` matching §5.1 rules, plus a Vitest boundary test that runs ESLint programmatically against a fixture violation to verify enforcement.

### D-004: JSON Schema Draft — Draft 2020-12

- **Context:** §5 and §6.1 require `schema/instance.schema.json` to validate `instance.json` exports and imports.
- **Decision:** Author `schema/instance.schema.json` using **JSON Schema Draft 2020-12** (`https://json-schema.org/draft/2020-12/schema`) with `additionalProperties: false` on all objects to catch unexpected or mistyped properties early.

---

## M2 — Modrinth API Verification & Adapter Decisions

### D-005: Use `GET /v2/projects` Over `GET /v3/projects` for Batch Project Metadata

- **Context:** §9 VERIFY items 1 and 2 required comparing Modrinth's v2 and v3 project endpoints for project-type classification (`mod` vs `plugin` vs `datapack`) and environment support (`client_side`/`server_side` vs `environment`).
- **Decision:** Use `GET /v2/projects?ids=[...]` as the batch project endpoint in `src/adapters/modrinth/`.
- **Rationale:** Live verification against `https://api.modrinth.com` showed that `/v3/projects` omits `client_side` and `server_side` entirely and returns `environment: undefined` for non-mod projects (`plugin`, `datapack`, `resourcepack`, `shader`). Conversely, `/v2/projects` returns both `client_side`/`server_side` (in the exact `'required' | 'optional' | 'unsupported' | 'unknown'` vocabulary across all project types) and `loaders: string[]` on every project object.

### D-006: Deterministic Project Type Classification Rule (`mod` > `plugin` > `datapack`)

- **Context:** Modrinth's v2 `project_type` reports `"mod"` for mods, plugins, and datapacks, and `ModrinthClient.getProjects(ids)` is a target-independent batch call returning `ProjectInfo[]`.
- **Decision:** Classify projects with `project_type === "mod"` by inspecting their `loaders` array against the loader categories from `/v2/tag/loader`:
  1. If any loader is in `MOD_LOADERS` (`fabric`, `forge`, `neoforge`, `quilt`, `babric`, `bta-babric`, `java-agent`, `legacy-fabric`, `liteloader`, `modloader`, `nilloader`, `ornithe`, `rift`) → `'mod'`.
  2. Else if any loader is in `PLUGIN_LOADERS` (`bukkit`, `bungeecord`, `folia`, `geyser`, `paper`, `purpur`, `spigot`, `sponge`, `velocity`, `waterfall`) → `'plugin'`.
  3. Else if any loader is `'datapack'` → `'datapack'`.
  4. Else → `'mod'`.
- **Rationale:** Pure datapacks (`loaders: ["datapack"]`, e.g., `BlazeandCave's Advancements Pack`) are classified as `'datapack'` so they resolve platform-agnostically into `datapacks/`. Pure plugins (`loaders` exclusively in `PLUGIN_LOADERS`, e.g., `WorldGuard`, `EssentialsX`) are classified as `'plugin'` so they match plugin platforms and export to `plugins/`. Hybrid mod+datapack (`Terralith`) and mod+plugin (`WorldEdit`) projects are classified as `'mod'` so that on mod platforms (Fabric/Forge/NeoForge/Quilt) they resolve their platform-matched `.jar` into `mods/` rather than ignoring platform matching.

### D-007: Modrinth Adapter Batch Size (100) and Rate-Limit Backoff

- **Context:** §5.2 and §9 VERIFY item 3 require batching, a concurrency cap of 5, and retry/backoff honoring `Retry-After` and `X-Ratelimit-*`.
- **Decision:**
  - Chunk `getProjects(ids)` and `getVersionsByIds(ids)` into batches of at most **100 IDs** per HTTP request.
  - Retry HTTP `429` and `5xx` responses up to 3 times, computing delay from `Retry-After` (seconds or HTTP-date), else `X-Ratelimit-Reset` (seconds), else exponential backoff (`baseDelayMs * 2^attempt`).
- **Rationale:** Keeps query URLs well within HTTP length limits and handles both exposed rate-limit headers (in Node/test environments) and unexposed CORS headers (in browser `fetch`).

---

## M5 — Polish, Resilience & Release Decisions

### D-008: Partial-Result Resolution vs. Total Failure Threshold in `resolveCollection`

- **Context:** §13 M5 requires graceful handling of rate limits and partial results during collection resolution so that a transient error on a single project or dependency does not discard an entire multi-project collection.
- **Decision:**
  - Treat `getCollection` failure, initial `getProjects` failure, or **100% failure** of all resolvable collection projects' `getProjectVersions` calls as a total resolution failure (throwing the error to `<ResolveProgressPanel />`, which formats it via `formatUserFacingError` and offers a **Retry** button).
  - When at least one collection project's `getProjectVersions` call succeeds (or when the collection contains only skipped project types such as `modpack`), catch non-abort errors on individual `getProjectVersions` calls and transitive dependency batch lookups (`getProjects`, `getVersionsByIds`), record each failed project in `skipped` with a descriptive reason (`Failed to fetch versions: ...` or `Failed to fetch dependency project: ...`), omit fetch-failed collection projects from collection `entries` (so they are not duplicated into per-type review tables with a false `NO_COMPATIBLE_VERSION` status unless required as a dependency by a succeeded entry), log the warning in the resolution progress panel, and return the resolved `Instance`.
- **Rationale:** Preserves maximum user progress when Modrinth returns an isolated error on one project in a large collection while still surfacing clear error states and retry controls when the entire request fails (e.g., offline or sustained HTTP `429` rate limit).

### D-009: Relative `base: './'` Configuration for Portable GitHub Pages Deployment

- **Context:** §5 and §13 M5 specify deploying the static Vite build to GitHub Pages via `.github/workflows/deploy.yml`. GitHub Pages may host a repository under `https://<owner>.github.io/<repo>/` or at a custom root domain.
- **Decision:** Configure `vite.config.ts` with `base: process.env.VITE_BASE_PATH ?? './'`.
- **Rationale:** Using `./` emits relative asset URLs in `dist/index.html`, allowing the same built artifact to run under any repository subpath, root domain, or local static preview server without hardcoding the repository name, while still supporting an explicit `VITE_BASE_PATH` override if needed.

---

## Milestone M5 — Manual QA & Release Verification Checklist

The checklist below covers all requirements from §7 (Resolution, Selection, Status), §8 (Output Formats), §11 (Parity & Deliberate Improvements), §12 (Documentation), and §13 (M5 Polish & Release):

### 1. §11 Parity & Core Workflow Verification
- [x] **Collection URL & Bare ID Input:** Accepts `https://modrinth.com/collection/<id>`, URLs with trailing slashes/query params, and bare IDs; rejects malformed inputs with an inline validation message.
- [x] **Target Game Version & Platform Selection:** Populates stable release game versions from `/v2/tag/game_version` and platforms from `/v2/tag/loader`; supports both `stable` (default) and `newest` release preferences.
- [x] **Real-Time Resolution Progress & Cancel:** Displays `completed / total` progress bar, streaming log entries, and an active **Cancel** button wired to `AbortController`.
- [x] **Error & Rate-Limit Recovery:** Displays human-friendly explanations for HTTP `429` rate limits, `404` missing collections, `5xx` errors, and network failures, with one-click **Retry** for collection resolution and **Retry export** for zip exports.
- [x] **Partial-Result Resolution:** Resolves succeeded projects into the workspace and records individual failed project fetches in **Skipped Projects** when a subset of requests fail.

### 2. §7 Environment Independence, Selection & Status Rules
- [x] **Environment Toggles (`Client` & `Server`):** Both toggles start **off** (locked) on collection load and `instance.json` import; locked columns show resolved versions and selections grayed out with controls and zip export buttons disabled; toggling off preserves state without resetting selections.
- [x] **Per-Type Tables & Canonical Ordering:** Renders `Mods`, `Plugins`, `Datapacks`, `Resource Packs`, and `Shaders` in canonical order (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`), showing `—` in the `Platform` column for platform-agnostic types.
- [x] **Game-Version Fallback (`unverified platform`):** When a `mod` or `plugin` has no platform-tagged version for the target game version, falls back to versions with an empty `platforms` list, tags `resolution: 'game-version-fallback'`, and displays the `unverified platform` warning indicator.
- [x] **Transitive Required Dependencies & Attribution:** Resolves transitive `required` dependencies per environment with cycle protection; renders `origin: 'dependency'` rows in the **Dependencies** footer with `Required by: <Title> (<env>)` attribution.
- [x] **Auto-Select, Auto-Deselect & User Overrides:** Auto-selects (`source: 'auto'`) required dependencies when a parent entry is checked; auto-deselects when no selected parent requires them; respects `"user-off stays off"` (`source: 'user', on: false`) and `"user-on stays on"` (`source: 'user', on: true`); flashes auto-changed cells for ~1s (`prefers-reduced-motion` aware) and announces changes via toast.
- [x] **Per-Environment Version Switching:** Switching a candidate version in `Client` or `Server` sets `resolution: 'user'` and recomputes the dependency closure for that environment only.
- [x] **Re-Resolve Confirmation Dialog:** Changing target settings (`gameVersion`, `platform`, `releasePreference`) after modifying selections prompts for confirmation before resetting selections to initial defaults.
- [x] **Status Symbols, Tooltips, Row Tints & Cell Rings:** Computes status across active environments only (`error > warning > unknown > ok`); renders distinct geometric shapes (`✓`, amber `⚠`, red `!`, purple `?`), keyboard-focusable tooltips (`Client: ...` / `Server: ...`), row background tints, and per-environment cell rings (including dual highlighting for `DEPENDENCY_UNAVAILABLE` and `NEEDED_BUT_UNAVAILABLE`).

### 3. §8 Output Formats & Offline Restore
- [x] **Environment Zip Archives (`<collectionId>-client.zip`, `<collectionId>-server.zip`):** Packages selected files into `mods/`, `plugins/`, `datapacks/`, `resourcepacks/`, and `shaderpacks/` with deterministic `{Title}-{Platform}-{GameVersion}-{VersionNumber}.{ext}` naming, `-2`/`-3` collision suffixes, live progress bar, **Cancel export**, and partial-failure packaging.
- [x] **Portable `instance.json` Export & Offline Import:** Validates against `schema/instance.schema.json` (Draft 2020-12); round-trips `serialize` / `deserialize` losslessly; restores the full review workspace offline with **zero network requests**.
- [x] **Modrinth `.mrpack` Export (`<collectionId>.mrpack`):** Generates `modrinth.index.json` (`formatVersion: 1`) with CDN `downloads`, `sha1`/`sha512` hashes, `fileSize`, `env` mapping, optional platform version dependency key, split file entries when `client` and `server` select different versions, and visible warning when selected `plugin` entries are excluded.

### 4. Accessibility, Performance & CI/CD Readiness
- [x] **Accessibility (`axe-core` & Keyboard Navigation):** Zero `axe-core` violations across empty, resolved, active-environment, and error states; all controls, status tooltip buttons, and dialogs are keyboard-operable.
- [x] **500-Row Performance:** 500-entry `Instance` renders and processes single-cell selection and header Select-All toggles smoothly with `React.memo` row isolation.
- [x] **CI & GitHub Pages Deployment:** `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn build` pass cleanly; `.github/workflows/ci.yml` and `.github/workflows/deploy.yml` are configured with relative Vite base path (`./`).
