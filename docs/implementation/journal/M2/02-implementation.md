# Milestone M2 — Adapters: Implementation Log

Subagent implementation updates for Milestone M2 are recorded below.

---


## M2-Fetch-Zip

- **`src/adapters/fetch/index.ts`**: Implemented `HttpFileFetcher`, `createFileFetcher`, and `FileFetchError` implementing the `FileFetcher` port with `AbortSignal` support, `429`/`5xx`/network error retry with `Retry-After` and `X-Ratelimit-Reset` parsing and exponential backoff, and `Uint8Array` binary response conversion.
- **`src/adapters/zip/index.ts`**: Installed `jszip` and implemented `JsZipArchive`, `JsZipArchiveWriter`, and `createArchiveWriter` implementing the `ArchiveWriter` and `Archive` ports (`DEFLATE` level 6 compression, path normalization, `onProgress` reporting through `100%`, and `Blob.arrayBuffer()` support).
- **`tests/adapters/fetch.test.ts` & `tests/adapters/zip.test.ts`**: Added 12 unit tests covering binary fetching, retry/backoff, `Retry-After`/`X-Ratelimit-Reset`, non-retryable `404`, retry exhaustion, `AbortSignal` cancellation, and round-trip zip inspection with `JSZip.loadAsync`.


## M2-API-Verifier

- **Verified §9 VERIFY items 1–4 against live `https://api.modrinth.com`**:
  - **VERIFY 1 (Project Classification)**: Confirmed `/v2/projects` returns `project_type` (`mod`, `modpack`, `resourcepack`, `shader`) and `loaders: string[]`. Established deterministic classification rule `classifyProjectType(rawProject)` using Modrinth's loader sets (`MOD_LOADERS`, `PLUGIN_LOADERS`, `DATAPACK_LOADERS`) with precedence `mod` > `plugin` > `datapack` when `project_type === 'mod'`.
  - **VERIFY 2 (Support Mapping)**: Confirmed `/v2/projects` returns `client_side` and `server_side` (`required | optional | unsupported | unknown`), mapping directly to `support.client` and `support.server`.
  - **VERIFY 3 (Rate Limits & CORS)**: Verified `x-ratelimit-limit: 300`, `x-ratelimit-remaining`, `x-ratelimit-reset`, and `access-control-allow-origin: *`.
  - **VERIFY 4 (`.mrpack` Dependencies & `datapacks/`)**: Verified `modrinth.index.json` dependency keys and confirmed `datapacks/<filename>` support in Modrinth App and Prism Launcher.
- **Recorded Fixtures (`tests/fixtures/modrinth/`)**: Created `collection.json`, `projects.json` (15 projects across all types and support pairs), `versions.json` (23 versions covering dependencies, pins, multi-file, and game-version fallback), `game-versions.json`, and `loaders.json`.
- **Documentation**: Updated `docs/modrinth-api-notes.md`, `docs/output-formats.md`, and `docs/decisions.md`.


## M2-Modrinth-Adapter-And-Composition

- **`src/adapters/modrinth/index.ts`**: Implemented `HttpModrinthClient`, `createModrinthClient`, `ModrinthApiError`, `classifyProjectType`, `normalizeSupportValue`, `MOD_LOADERS`, `PLUGIN_LOADERS`, and `DATAPACK_LOADERS` covering all 6 `ModrinthClient` methods (`getCollection`, `getProjects`, `getProjectVersions`, `getVersionsByIds`, `getGameVersions`/`listGameVersions`, `getPlatforms`/`listPlatforms`), ID deduplication and batch chunking (`batchSize = 100`), semaphore concurrency limiting (`maxConcurrency = 5`), retry on `429`/`5xx`/network errors with `Retry-After` / `X-Ratelimit-Reset` / exponential backoff, clean browser-compatible headers, and `AbortSignal` propagation.
- **`src/adapters/index.ts`**: Created barrel file re-exporting `./modrinth`, `./fetch`, `./zip`, and port types.
- **`src/app/services.ts`**: Created composition root exporting `AppServices`, `createAppServices(options?)`, and default `services` instance.
- **`tests/adapters/modrinth.test.ts`**: Added 13 unit tests covering all 6 endpoints against recorded fixtures, project classification, support value normalization, batch chunking (`> 100` IDs and `0` IDs), concurrency limiting, `429`/`503` retry with `Retry-After` and `X-Ratelimit-Reset`, `404` non-retryable error, and `AbortSignal` cancellation.
- **`tests/adapters/e2e-collection.test.ts`**: Added 2 end-to-end M2 acceptance tests resolving recorded collection `YV97U1kk` through `HttpModrinthClient` + `resolveCollection` for `fabric` and `paper` targets, verifying project types, `skippedProjects`, transitive and pinned dependencies, projections, schema validation, and `serialize`/`deserialize` round-trip.
- **Verification**: `yarn lint`, `yarn typecheck`, `yarn test` (14 test files, 205 tests), and `yarn build` all passed.
