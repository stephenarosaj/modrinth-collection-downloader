# Milestone M2 — Adapters: Fixes Log

Fixer subagent updates for Milestone M2 accepted findings (`F-01` through `F-07`).

---

## M2-Fixer-1 (`F-01`, `F-02`, `F-06`, `F-07` — Shared HTTP Retry & Fetch Adapter)

- **`src/adapters/http-retry.ts`**: Extracted shared HTTP retry/abort helpers (`defaultFetch`, `createAbortError`, `throwIfAborted`, `isAbortError`, `defaultSleep`, `isRetryableStatus`, `parseRetryDelayMs`) with `trimmed.length > 0` and `seconds > 0` guards (`F-01`, `F-06`).
- **`src/adapters/fetch/index.ts`**: Imported shared helpers from `../http-retry`, used lazy `defaultFetch`, clamped `maxRetries` and `baseDelayMs` with `Math.max(0, ...)`, and moved `if (response.ok) { await response.arrayBuffer() ... }` inside the per-attempt `try / catch` block (`F-01`, `F-02`, `F-06`).
- **`tests/adapters/fetch.test.ts`**: Added unit tests for `X-Ratelimit-Reset: 0` and blank headers on `503`, `Retry-After` HTTP-date header parsing, negative `maxRetries`/`baseDelayMs` clamping, mid-body `response.arrayBuffer()` error retry/wrapping/abort, lazy `globalThis.fetch` delegation, and deterministic microtask backoff abort (`F-01`, `F-02`, `F-06`, `F-07`).

## M2-Fixer-2 (`F-01` through `F-07` — Modrinth Adapter & Port Alignment)

- **`src/adapters/modrinth/index.ts`**:
  - Imported shared HTTP retry/abort helpers and lazy `defaultFetch` from `../http-retry` (`F-01`, `F-06`).
  - Moved `if (response.ok) { await response.json() ... }` inside the per-attempt `try / catch` block in `HttpModrinthClient.requestJson` (`F-02`).
  - Filtered `raw.dependencies ?? []` in `mapRawVersion` to entries with non-empty string `d.project_id` and removed `as string` cast (`F-03`).
  - Removed non-port alias methods (`listGameVersions`, `listPlatforms`), removed redundant duplicate DTO properties (`projectType`, `hashes`, `dependencyType`), and aligned method parameter types with `ProjectVersionsQuery` and `RequestOptions` (`F-04`).
  - Preserved `primary: typeof f.primary === 'boolean' ? f.primary : undefined` in `mapRawVersion` and selected `files.find(f => f.primary === true) ?? files.find(f => f.primary === undefined) ?? null` (`F-05`).
- **`tests/adapters/modrinth.test.ts`**:
  - Updated existing assertions to match canonical port methods and DTO fields (`F-04`).
  - Added unit tests for mid-body `response.json()` retry/exhaustion and abort (`F-02`), nullable/blank `project_id` dependency filtering through `resolveCollection` + `serialize()` (`F-03`), `primary: false` vs `primary: undefined` file mapping (`F-05`), lazy `services.modrinthClient` `globalThis.fetch` spy delegation (`F-06`), `waitQueue` concurrency abort + slot release, `503` retry exhaustion + transient `TypeError('Failed to fetch')` recovery, and deterministic mid-backoff abort coordination (`F-07`).
