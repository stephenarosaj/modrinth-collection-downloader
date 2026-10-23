# Modrinth API Notes & Verification Log

This document records the live API verification findings required by **§9** of the implementation plan before coding the Modrinth adapter (`src/adapters/modrinth/`) in Milestone M2.

Base URL: `https://api.modrinth.com`

---

## Anticipated Endpoints

- `GET /v3/collection/{id}` — Fetch collection metadata and `projects` (project IDs).
- `GET /v2/projects?ids=["…"]` — Batch fetch project metadata (`title`, `slug`, `project_type`, `client_side`, `server_side`).
- `GET /v2/project/{id}/version?game_versions=["…"]&loaders=["…"]` — Fetch compatible versions for a project (`version_number`, `version_type`, `date_published`, `game_versions`, `loaders`, `files[]`, `dependencies[]`).
- `GET /v2/versions?ids=["…"]` — Batch fetch pinned dependency versions by ID.
- `GET /v2/tag/game_version` — Fetch available Minecraft game versions (`{ version, version_type, date, major }`).
- `GET /v2/tag/loader` — Fetch available platforms (`name`, `icon`, `supported_project_types`).

---

## §9 VERIFY Items (To Be Completed in M2)

### 1. Project Type Classification (`mod` vs `plugin` vs `datapack`)

- **Context:** Modrinth's v2 `project_type` field reports `"mod"` for mods, plugins, and data packs alike.
- **What to Verify in M2:**
  - Inspect `/v3/project/{id}` / `/v3/projects` `project_types` array vs. `/v2/projects` `project_type` + `loaders` / version `loaders` (such as `datapack`, `paper`, `spigot`, `bukkit`, `folia`, `purpur`, `sponge`, `bungeecord`, `velocity`, `waterfall`).
  - Define the exact deterministic classification rule mapping Modrinth API responses to our domain `ProjectType` (`'mod' | 'plugin' | 'datapack' | 'resourcepack' | 'shader' | 'modpack'`).
- **Status:** `TODO (M2)`
- **Recorded Findings & Final Rule:**
  - _Pending M2 live API verification and fixture capture._

---

### 2. Environment Support Fields

- **Context:** Determine where environment support (`client` and `server`) is read from in the chosen API version and the exact set of possible values.
- **What to Verify in M2:**
  - Compare v2 `client_side` / `server_side` (`"required" | "optional" | "unsupported" | "unknown"`) vs. v3 `environment` fields.
  - Document the exact mapping to our domain `Support` type (`'required' | 'optional' | 'unsupported' | 'unknown'`).
- **Status:** `TODO (M2)`
- **Recorded Findings & Final Mapping:**
  - _Pending M2 live API verification._

---

### 3. Rate-Limit Headers and Behavior

- **Context:** The Modrinth adapter must cap concurrency (default 5) and retry `429` / `5xx` responses with backoff.
- **What to Verify in M2:**
  - Verify exact response header names (`X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset`, `Retry-After`) and CORS exposure (`Access-Control-Expose-Headers`) in browser `fetch` responses from `https://api.modrinth.com`.
  - Document batch size limits for `GET /v2/projects?ids=[...]` and `GET /v2/versions?ids=[...]`.
- **Status:** `TODO (M2)`
- **Recorded Findings & Adapter Policy:**
  - _Pending M2 live API verification._

---

### 4. `.mrpack` Dependency Key Names & Datapack Path Handling

- **Context:** `.mrpack` (`modrinth.index.json`) defines `dependencies` at the root and file destination paths in `files[].path`.
- **What to Verify in M2:**
  - Confirm valid `dependencies` keys in `modrinth.index.json` (`minecraft`, `fabric-loader`, `quilt-loader`, `forge`, `neoforge`) and how launchers (Modrinth App, Prism Launcher) behave when platform loader version is omitted vs. provided.
  - Confirm how Prism Launcher and the official Modrinth App handle `datapacks/<filename>` paths inside `modrinth.index.json`.
- **Status:** `TODO (M2)`
- **Recorded Findings & Export Behavior:**
  - _Pending M2 verification._
