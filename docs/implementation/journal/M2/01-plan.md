# Milestone M2 — Adapters: Execution Plan

## Work Breakdown

Milestone M2 (`src/adapters/`, `src/app/`, `tests/fixtures/`, `tests/adapters/`, `docs/modrinth-api-notes.md`) is broken up across three subagents:

1. **M2-API-Verifier (`docs/modrinth-api-notes.md`, `docs/decisions.md`, `docs/output-formats.md`, `tests/fixtures/modrinth/*.json`)**
   - Probe the live Modrinth API (`https://api.modrinth.com`) and upstream reference (`../modrinth-collection-web-download/index.html`) to verify all four §9 VERIFY items before coding the Modrinth adapter:
     1. Distinguishing `plugin` and `datapack` from `mod` (v2 `/v2/projects` `project_type` + `loaders` vs v3 `/v3/projects`, and version `loaders`).
     2. Environment support representation (`client_side`/`server_side` value set `'required' | 'optional' | 'unsupported' | 'unknown'` vs v3 `environment`) and mapping to `Support`.
     3. Rate-limit headers (`X-Ratelimit-Limit`, `X-Ratelimit-Remaining`, `X-Ratelimit-Reset`, `Retry-After`) and 429/5xx behavior.
     4. `.mrpack` dependency key names (`minecraft`, `fabric-loader`, `quilt-loader`, `forge`, `neoforge`) and datapack path handling in `modrinth.index.json`.
   - Record real API response fixtures in `tests/fixtures/modrinth/` (including a real collection, projects of each type, versions, game versions, and loaders).

2. **M2-Fetch-Zip (`src/adapters/fetch/index.ts`, `src/adapters/zip/index.ts`, `tests/adapters/fetch.test.ts`, `tests/adapters/zip.test.ts`)**
   - Implement `HttpFileFetcher` (`FileFetcher` port) in `src/adapters/fetch/` with `AbortSignal` support, HTTP status validation, and `Uint8Array` binary response conversion.
   - Implement `JsZipArchiveWriter` (`ArchiveWriter` / `Archive` ports) in `src/adapters/zip/` wrapping `jszip` (the only place `jszip` is imported per §5.2) with `addFile` and `generate({ onProgress })`.
   - Write comprehensive unit tests in `tests/adapters/fetch.test.ts` and `tests/adapters/zip.test.ts`.

3. **M2-Modrinth-Adapter-And-Composition (`src/adapters/modrinth/index.ts`, `src/adapters/index.ts`, `src/app/services.ts`, `tests/adapters/modrinth.test.ts`, `tests/adapters/e2e-collection.test.ts`)**
   - Implement `HttpModrinthClient` (`ModrinthClient` port) in `src/adapters/modrinth/`:
     - All 6 port methods (`getCollection`, `getProjects`, `getProjectVersions`, `getVersionsByIds`, `getGameVersions`, `getPlatforms`).
     - Batching for `getProjects` and `getVersionsByIds`.
     - Concurrency cap (default `5`).
     - Retry with exponential backoff on `429` and `5xx`, honoring `Retry-After` and `X-Ratelimit-Reset` headers.
     - `AbortSignal` propagation across queued, in-flight, and backoff-sleeping requests.
     - Project type classification (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`, `modpack`) and `Support` mapping per verified rules in `docs/modrinth-api-notes.md`.
   - Implement composition root service wiring in `src/app/services.ts`.
   - Write fixture-backed adapter unit tests (`tests/adapters/modrinth.test.ts`) and end-to-end collection resolution + `serialize(instance)` verification (`tests/adapters/e2e-collection.test.ts`).
