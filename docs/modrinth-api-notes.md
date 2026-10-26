# Modrinth API Notes (`https://api.modrinth.com`)

Reference for the HTTP normalization, project classification, batching, and retry behavior implemented in [`src/adapters/modrinth/index.ts`](../src/adapters/modrinth/index.ts) and [`src/adapters/http-retry.ts`](../src/adapters/http-retry.ts).

---

## 1. Endpoints Used

| Method & Path | Port Method (`ModrinthClient`) | Notes |
| :--- | :--- | :--- |
| `GET /v3/collection/{id}` | `getCollection(id, opts)` | Collection `id`, `name`, and `projects: string[]` (v3-only endpoint). |
| `GET /v2/projects?ids=["…"]` | `getProjects(ids, opts)` | Batched (`≤100` IDs/call). Used over `/v3/projects` because `/v3/projects` omits `client_side`/`server_side` and returns `environment: undefined` on non-mod projects. |
| `GET /v2/project/{id}/version?game_versions=["…"]` (`&loaders=["…"]`) | `getProjectVersions(projectId, q, opts)` | Compatible versions, `files[]` (`primary === true` -> `primary === undefined` -> `files[0]` fallback), and `dependencies[]`. |
| `GET /v2/versions?ids=["…"]` | `getVersionsByIds(ids, opts)` | Batched (`≤100` IDs/call) lookup for pinned dependency `versionId`s. |
| `GET /v2/tag/game_version` | `getGameVersions(opts)` | Minecraft versions (filtered to `version_type === 'release'` in UI). |
| `GET /v2/tag/loader` | `getPlatforms(opts)` | Platform tags (`name`, `icon`, `supported_project_types`). |

---

## 2. Project Type Classification (`classifyProjectType`)

Modrinth's `/v2/projects` returns `project_type: "mod"` for mods, plugins, **and** datapacks. When `rawProject.project_type === "mod"`, `classifyProjectType` inspects `rawProject.loaders` using precedence **`mod` > `plugin` > `datapack`**:

1. **Mod (`'mod'`):** Any loader in `MOD_LOADERS` (`babric`, `bta-babric`, `fabric`, `forge`, `java-agent`, `legacy-fabric`, `liteloader`, `modloader`, `neoforge`, `nilloader`, `ornithe`, `quilt`, `rift`).
   - *Why `mod` wins on hybrids:* Hybrid projects like `Terralith` (`datapack` + `fabric`/`forge`/`neoforge`/`quilt`) and `WorldEdit` (` fabric`/`forge` + `paper`/`spigot`) ship platform-specific `.jar` files for mod platforms and must resolve into `mods/` rather than ignoring platform matching.
2. **Plugin (`'plugin'`):** Else if any loader in `PLUGIN_LOADERS` (`bukkit`, `bungeecord`, `folia`, `geyser`, `paper`, `purpur`, `spigot`, `sponge`, `velocity`, `waterfall`).
3. **Datapack (`'datapack'`):** Else if any loader in `DATAPACK_LOADERS` (`datapack`).
4. **Fallback:** Else `'mod'`.

If `rawProject.project_type` is `'resourcepack'`, `'shader'`, `'modpack'`, `'plugin'`, or `'datapack'`, it is returned directly; any unknown string is passed through so the resolver records it in `SkippedProject[]`.

---

## 3. Environment Support Normalization (`normalizeSupportValue`)

- `/v2/projects` provides `client_side` and `server_side` across all project types using `'required' | 'optional' | 'unsupported' | 'unknown'`.
- Mapped directly to `support.client` and `support.server`; missing or unrecognized values fall back to `'unknown'`.

---

## 4. Rate Limits, CORS, Batching & Retry Policy

- **Rate Limits & CORS:** Modrinth enforces `300` requests/min per IP (`x-ratelimit-limit: 300`, `x-ratelimit-reset: <seconds until window reset>`). Because Modrinth does not emit `Access-Control-Expose-Headers`, `x-ratelimit-*` headers may be hidden from browser `fetch` by CORS, so retry logic checks `Retry-After` first, then `X-Ratelimit-Reset`, then exponential backoff (`baseDelayMs * 2^attempt`, default `500ms`).
- **Concurrency & Batching:** Max `5` concurrent in-flight requests by default. `getProjects` and `getVersionsByIds` deduplicate IDs, short-circuit `[]` on empty input, and chunk into batches of `100`.
- **Retries & Cancellation:** Retries HTTP `429` and `5xx` up to `maxRetries` (`3`). `AbortSignal` aborts in-flight `fetch` calls and pending retry timers immediately. Custom `User-Agent` headers are omitted in browser `fetch`.
