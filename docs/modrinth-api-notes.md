# Modrinth API Notes & Verification Log

This document records the live API verification findings required by **§9** of the implementation plan against `https://api.modrinth.com` for the Modrinth adapter (`src/adapters/modrinth/`) in Milestone M2.

Base URL: `https://api.modrinth.com`

---

## Verified Endpoints

| Method & Path | Purpose | Port Method |
|---|---|---|
| `GET /v3/collection/{id}` | Fetch collection metadata (`id`, `name`) and `projects` (array of project IDs) | `getCollection(id, opts)` |
| `GET /v2/projects?ids=["…"]` | Batch fetch project metadata (`id`, `slug`, `title`, `project_type`, `loaders`, `client_side`, `server_side`) | `getProjects(ids, opts)` |
| `GET /v2/project/{id}/version?game_versions=["…"]` (`&loaders=["…"]` when `platform` is specified) | Fetch versions for a project (`id`, `project_id`, `version_number`, `version_type`, `date_published`, `game_versions`, `loaders`, `files[]`, `dependencies[]`) | `getProjectVersions(projectId, q, opts)` |
| `GET /v2/versions?ids=["…"]` | Batch fetch pinned dependency versions by version ID | `getVersionsByIds(ids, opts)` |
| `GET /v2/tag/game_version` | Fetch available Minecraft game versions (`{ version, version_type, date, major }`) | `getGameVersions(opts)` |
| `GET /v2/tag/loader` | Fetch available platforms (`{ name, icon, supported_project_types }`) | `getPlatforms(opts)` |

---

## §9 VERIFY Items (Completed in M2)

### 1. Project Type Classification (`mod` vs `plugin` vs `datapack`)

- **Status:** **VERIFIED** (2026-10-23 against live `https://api.modrinth.com`)
- **Live API Evidence:**
  - `GET /v2/projects?ids=[...]` returns `project_type` (`"mod" | "modpack" | "resourcepack" | "shader"`) and `loaders: string[]` (the union of loader tags across the project's versions) on every project object.
  - `GET /v3/projects?ids=[...]` returns `project_types: string[]` (derived from `loaders`), where pure plugins have `["plugin"]`, pure datapacks have `["datapack"]`, and hybrids have `["datapack", "mod"]` or `["mod", "plugin"]`. However, `/v3/projects` omits `client_side`/`server_side` (`undefined`) and returns `environment: undefined` for plugins (`DKY9btbd` WorldGuard, `hXiIvTyT` EssentialsX), datapacks (`VoVJ47kN` BlazeandCave's Advancements Pack), resourcepacks (`50dA9Sha` Fresh Animations), and shaders (`R6NEzAwj` Complementary Shaders).
  - Consequently, **`GET /v2/projects?ids=[...]` is used** for batch project metadata, because it provides both `client_side`/`server_side` across all project types and `loaders: string[]` for deterministic project-type classification.
  - From `GET /v2/tag/loader`, Modrinth's loader tags partition by `supported_project_types`:
    - **Mod Loaders (`MOD_LOADERS`):** `babric`, `bta-babric`, `fabric`, `forge`, `java-agent`, `legacy-fabric`, `liteloader`, `modloader`, `neoforge`, `nilloader`, `ornithe`, `quilt`, `rift` (`supported_project_types` includes `"mod"` and neither `"plugin"` nor `"datapack"`).
    - **Plugin Loaders (`PLUGIN_LOADERS`):** `bukkit`, `bungeecord`, `folia`, `geyser`, `paper`, `purpur`, `spigot`, `sponge`, `velocity`, `waterfall` (`supported_project_types` includes `"plugin"`).
    - **Datapack Loaders (`DATAPACK_LOADERS`):** `datapack` (`supported_project_types` includes `"datapack"`).
  - Live project examples recorded in [`tests/fixtures/modrinth/projects.json`](../tests/fixtures/modrinth/projects.json):
    - Pure mod: `AANobbMI` (`Sodium`) → `project_type: "mod"`, `loaders: ["fabric", "neoforge", "quilt"]` → `'mod'`
    - Pure plugin: `DKY9btbd` (`WorldGuard`) → `project_type: "mod"`, `loaders: ["bukkit", "folia", "paper", "spigot"]` → `'plugin'`
    - Pure plugin: `hXiIvTyT` (`EssentialsX`) → `project_type: "mod"`, `loaders: ["bukkit", "paper", "spigot"]` → `'plugin'`
    - Pure datapack: `VoVJ47kN` (`BlazeandCave's Advancements Pack`) → `project_type: "mod"`, `loaders: ["datapack"]` → `'datapack'`
    - Hybrid mod + datapack: `8oi3bsk5` (`Terralith`) → `project_type: "mod"`, `loaders: ["datapack", "fabric", "forge", "neoforge", "quilt"]` → `'mod'` (ships `.jar` mod versions for Fabric/Forge/NeoForge/Quilt alongside `.zip` datapack versions; classifying as `'mod'` ensures platform-matched `.jar` resolution into `mods/` rather than platform-agnostic resolution)
    - Hybrid mod + plugin: `1u6JkXh5` (`WorldEdit`) → `project_type: "mod"`, `loaders: ["bukkit", "fabric", "folia", "forge", "neoforge", "paper", "quilt", "spigot"]` → `'mod'`
    - Resourcepack: `50dA9Sha` (`Fresh Animations`) → `project_type: "resourcepack"`, `loaders: ["minecraft"]` → `'resourcepack'`
    - Shader: `R6NEzAwj` (`Complementary Shaders - Unbound`) → `project_type: "shader"`, `loaders: ["iris", "optifine"]` → `'shader'`
    - Modpack: `1KVo5zza` (`Fabulously Optimized`) → `project_type: "modpack"`, `loaders: ["fabric"]` → `'modpack'`
- **Final Deterministic Classification Rule (`classifyProjectType`):**
  1. Normalize `rawProject.project_type` to lowercase (`rawType`).
  2. If `rawType` is `'resourcepack'`, `'shader'`, `'modpack'`, `'plugin'`, or `'datapack'`, return `rawType`.
  3. If `rawType === 'mod'`:
     - Normalize `rawProject.loaders` (array of strings) to lowercase.
     - Let:
       - `hasModLoader = loaders.some(l => MOD_LOADERS.has(l))`
       - `hasPluginLoader = loaders.some(l => PLUGIN_LOADERS.has(l))`
       - `hasDatapackLoader = loaders.some(l => DATAPACK_LOADERS.has(l))`
     - Apply precedence:
       1. If `hasModLoader` is `true` → return `'mod'`.
       2. Else if `hasPluginLoader` is `true` → return `'plugin'`.
       3. Else if `hasDatapackLoader` is `true` → return `'datapack'`.
       4. Else → return `'mod'` (fallback when `loaders` is empty or contains an unlisted mod loader).
  4. Otherwise (any unrecognized `project_type`), return `rawType` unchanged so the resolver records it in `SkippedProject[]` (`Unsupported project type: <rawType>`).

---

### 2. Environment Support Fields

- **Status:** **VERIFIED** (2026-10-23 against live `https://api.modrinth.com`)
- **Live API Evidence:**
  - In `GET /v2/projects?ids=[...]`, every project object contains `client_side` and `server_side` string fields.
  - Across all project types (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`, `modpack`), the API returns values from the exact 4-value set matching our domain `Support` type:
    `"required" | "optional" | "unsupported" | "unknown"`
  - Verified combinations in [`tests/fixtures/modrinth/projects.json`](../tests/fixtures/modrinth/projects.json):
    - `required` / `unsupported`: `AANobbMI` (`Sodium`), `Orvt0mRa` (`Indium`), `50dA9Sha` (`Fresh Animations`), `R6NEzAwj` (`Complementary Shaders - Unbound`), `1KVo5zza` (`Fabulously Optimized`)
    - `required` / `required`: `HIuqnQpi` (`Common Network`)
    - `required` / `optional`: `pZ2wrerK` (`Emotecraft`)
    - `optional` / `optional`: `P7dR8mSH` (`Fabric API`), `EsAfCjCV` (`AppleSkin`)
    - `optional` / `required`: `VoVJ47kN` (`BlazeandCave's Advancements Pack`), `8oi3bsk5` (`Terralith`)
    - `unsupported` / `required`: `DKY9btbd` (`WorldGuard`), `hXiIvTyT` (`EssentialsX`)
    - `unknown` / `unknown`: `1u6JkXh5` (`WorldEdit`)
- **Final Mapping to `Support`:**
  - Map `rawProject.client_side` → `support.client` and `rawProject.server_side` → `support.server`.
  - Normalize the string to lowercase; if it is in `{'required', 'optional', 'unsupported', 'unknown'}`, use it directly.
  - If missing, null, or outside the 4 known values, fall back to `'unknown'`.

---

### 3. Rate-Limit Headers and Behavior

- **Status:** **VERIFIED** (2026-10-23 against live `https://api.modrinth.com`)
- **Live API Evidence:**
  - Inspected via `curl -i -H "Origin: https://example.com" https://api.modrinth.com/v2/tag/loader`:
    ```http
    HTTP/2 200
    access-control-allow-origin: *
    access-control-allow-headers: *
    access-control-max-age: 86400
    x-ratelimit-limit: 300
    x-ratelimit-remaining: 299
    x-ratelimit-reset: 0
    ```
  - **Rate Limit Quota:** `300` requests per minute per IP (`x-ratelimit-limit: 300`).
  - **Reset Semantics:** `x-ratelimit-reset` is an integer number of **seconds** until the current rate-limit window resets (not a Unix epoch timestamp). On `429 Too Many Requests`, `retry-after` (seconds) or `x-ratelimit-reset` (seconds) indicates how long to wait before retrying.
  - **CORS Note:** Modrinth's API sends `access-control-allow-origin: *` and `access-control-allow-headers: *` but does not currently emit `Access-Control-Expose-Headers`. In standard browser `fetch`, non-CORS-safelisted headers (`x-ratelimit-*`) may not be readable by JavaScript unless exposed, whereas `Retry-After` or fallback exponential backoff works universally.
  - **Batch Size Limits:**
    - `GET /v2/projects?ids=[...]` and `GET /v2/versions?ids=[...]` accept JSON-encoded arrays of IDs in the query string. Chunking batches to **100 IDs per request** keeps URLs well within HTTP query length limits and Modrinth's per-request batch cap.
- **Adapter Concurrency & Retry/Backoff Policy:**
  - **Concurrency Cap:** Default `5` maximum in-flight requests (configurable in adapter options).
  - **Batching:** Deduplicate IDs and chunk `getProjects(ids)` and `getVersionsByIds(ids)` into batches of at most `100` IDs per request. Empty input arrays return `[]` immediately without making network requests.
  - **Retry Eligible Statuses:** HTTP `429` (Too Many Requests) and `5xx` (`500`–`599`), up to `maxRetries` (default `3`).
  - **Delay Calculation:**
    1. Check `Retry-After` header (parsed as seconds → `seconds * 1000` ms, or HTTP-date delta).
    2. Else check `X-Ratelimit-Reset` header (parsed as seconds → `seconds * 1000` ms when `> 0`).
    3. Else use exponential backoff: `baseDelayMs * 2^attempt` (default `baseDelayMs = 500` ms).
  - **Abort Handling:** Honor `AbortSignal` before starting a request, during in-flight `fetch`, and while waiting on a retry timer (immediately clearing the timer and rejecting with `AbortError`).
  - **Browser Headers:** Do not set a custom `User-Agent` header in browser `fetch` (per §5.2).

---

### 4. `.mrpack` Dependency Key Names & Datapack Path Handling

- **Status:** **VERIFIED** (2026-10-23 against Modrinth `.mrpack` `formatVersion: 1` specification, official Modrinth App / Theseus, and Prism Launcher)
- **Findings & Specification:**
  1. **`dependencies` Keys in `modrinth.index.json`:**
     - The Modrinth `.mrpack` specification (`formatVersion: 1`) recognizes only the following keys in root `dependencies`:
       - `"minecraft"`: `<gameVersion>` (always required, e.g., `"1.20.1"`)
       - `"fabric-loader"`: Fabric loader version (mapped from target platform `fabric`)
       - `"quilt-loader"`: Quilt loader version (mapped from target platform `quilt`)
       - `"forge"`: Forge version (mapped from target platform `forge`)
       - `"neoforge"`: NeoForge version (mapped from target platform `neoforge`)
     - **Launcher Behavior When Platform Version Is Provided vs. Omitted:**
       - When the optional `platformVersion` is provided at export time and the target platform maps to one of the 4 loader keys above, `toMrpack` writes both `"minecraft"` and `<loaderKey>: "<platformVersion>"` into `dependencies`. Both Prism Launcher and the Modrinth App automatically configure the instance with that exact Minecraft version and mod loader version.
       - When `platformVersion` is omitted (or when the target platform does not have a `.mrpack` dependency key), `toMrpack` writes only `"minecraft": "<gameVersion>"`. Both Prism Launcher and the Modrinth App import the `.mrpack` cleanly as a Minecraft `<gameVersion>` instance, allowing the user to select or attach a mod loader version in the launcher's instance settings if desired.
  2. **`datapacks/<filename>` Path Handling in `modrinth.index.json`:**
     - Each entry in `files[]` specifies a relative instance path (`files[].path`).
     - Both the official Modrinth App (Theseus) and Prism Launcher accept `"datapacks/<filename>"` in `files[].path` and download the file into `<instance_root>/datapacks/<filename>` (the Modrinth App also lists `"datapacks/"` entries under the instance's Content management tab).
     - **Important User Note (Vanilla vs. Global Datapack Loaders):** Vanilla Minecraft loads data packs per-world from `saves/<world>/datapacks/` (or `<world>/datapacks/` on a dedicated server) rather than `<instance_root>/datapacks/`. For singleplayer/modpack instances imported from `.mrpack`, files downloaded to `datapacks/<filename>` are either loaded automatically by a global datapack loader mod (such as Paxi, Global Packs, or Open Loader) or copied into the target world's `datapacks/` folder. This behavior is documented in [`docs/output-formats.md`](output-formats.md).
  3. **Plugins in `.mrpack`:**
     - The `.mrpack` format has no plugin loader dependency keys and does not support Bukkit/Paper/Spigot/Velocity plugins. `toMrpack` excludes `plugin` entries and `getMrpackWarnings(instance)` emits a user-visible warning listing any selected plugins that were excluded.
