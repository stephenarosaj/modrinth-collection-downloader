# Milestone M2 — Adapters: Commit Log

## Commit Message (`/generate-pr-description` Format)

```markdown
# Implement Milestone M2 Modrinth, file fetch, and JSZip adapters with live-API verified fixtures

## Overview
✨ Implements Milestone M2 (Adapters) of `modrinth-collection-downloader`, delivering the live-API verified `HttpModrinthClient`, `HttpFileFetcher`, `JsZipArchiveWriter`, shared HTTP retry/abort utilities, the `src/app/services.ts` composition root, recorded Modrinth v2/v3 fixtures, and end-to-end collection resolution and serialization tests.

## Highlights
✨ Verified all §9 VERIFY items against the live Modrinth API (`https://api.modrinth.com`), recording 5 real JSON fixtures under `tests/fixtures/modrinth/` and documenting the deterministic project classification (`mod` > `plugin` > `datapack` loader precedence), `client_side`/`server_side` support mapping, rate-limit headers, and `.mrpack` `datapacks/` path handling in `docs/modrinth-api-notes.md`, `docs/output-formats.md`, and `docs/decisions.md`.
✨ Implemented `HttpModrinthClient` (`src/adapters/modrinth/index.ts`), `HttpFileFetcher` (`src/adapters/fetch/index.ts`), and shared retry/abort helpers (`src/adapters/http-retry.ts`) with ID deduplication, batch chunking (`batchSize = 100`), semaphore concurrency limiting (`maxConcurrency = 5`), `429`/`5xx`/network error retries honoring `Retry-After` and `X-Ratelimit-Reset`, and full `AbortSignal` propagation.
✨ Implemented `JsZipArchiveWriter` (`src/adapters/zip/index.ts`) wrapping `jszip` (`DEFLATE` level 6) and wired the `src/app/services.ts` composition root, backed by 37 new unit and end-to-end adapter tests (215 total tests passing across 14 test suites).

<details>
<summary><b>Changelog</b></summary>

### Implementation Changes
- **`src/adapters/http-retry.ts`**: Added shared HTTP retry, backoff header parsing (`Retry-After` seconds/HTTP-date and `X-Ratelimit-Reset > 0`), `AbortSignal` normalization, and lazy `defaultFetch` helpers.
- **`src/adapters/modrinth/index.ts`**: Implemented `HttpModrinthClient`, `createModrinthClient`, `ModrinthApiError`, `classifyProjectType`, and `normalizeSupportValue` implementing all 6 `ModrinthClient` port methods with batching (`100` IDs), concurrency limiting (`5` in-flight), retry/backoff, and `AbortSignal` support.
- **`src/adapters/fetch/index.ts`**: Implemented `HttpFileFetcher`, `createFileFetcher`, and `FileFetchError` implementing the `FileFetcher` port for binary file downloads with retry/backoff and `AbortSignal` support.
- **`src/adapters/zip/index.ts`**: Installed `jszip` and implemented `JsZipArchive`, `JsZipArchiveWriter`, and `createArchiveWriter` implementing the `ArchiveWriter` and `Archive` ports (`DEFLATE` level 6, path normalization, `onProgress` reporting, and `Blob.arrayBuffer()` support).
- **`src/adapters/index.ts` & `src/app/services.ts`**: Re-exported all adapters and created the `AppServices` composition root.
- **`docs/modrinth-api-notes.md`, `docs/output-formats.md`, `docs/decisions.md`**: Documented live Modrinth API verification findings (§9 VERIFY 1–4) and recorded ADR-0007 (`classifyProjectType` precedence).

### Test Changes
- **`tests/fixtures/modrinth/*.json`**: Added recorded Modrinth API fixtures (`collection.json`, `projects.json`, `versions.json`, `game-versions.json`, `loaders.json`).
- **`tests/adapters/modrinth.test.ts`**: Added 18 unit tests covering all 6 `ModrinthClient` methods, project classification, support normalization, nullable dependency filtering, `primary: false` file handling, batching, concurrency queue abort/release, and retry/backoff exhaustion.
- **`tests/adapters/fetch.test.ts`**: Added 14 unit tests covering binary downloads, `Retry-After` / `X-Ratelimit-Reset` parsing, mid-body stream failures, retry exhaustion, and `AbortSignal` cancellation.
- **`tests/adapters/zip.test.ts`**: Added 3 round-trip zip creation and progress tests inspected via `JSZip.loadAsync`.
- **`tests/adapters/e2e-collection.test.ts`**: Added 2 end-to-end collection resolution (`resolveCollection`) and serialization (`serialize`/`deserialize`) acceptance tests against the recorded collection fixtures for `fabric` and `paper` targets.

</details>
```
