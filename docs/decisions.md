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
