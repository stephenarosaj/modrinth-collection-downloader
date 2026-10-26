# Milestone M2 — Adapters: Verification Log

Verification subagent reports for Milestone M2 fixer batches.

---

## M2-Verifier-1 (`M2-Fixer-1` Verification)

- **Overall Verdict**: `VERIFIED`
- **`F-01` (`P1`)**: `VERIFIED` — `src/adapters/http-retry.ts` exports shared HTTP retry/abort helpers with `trimmed.length > 0` and `seconds > 0` guards; `HttpFileFetcher` clamps `maxRetries` and `baseDelayMs` with `Math.max(0, ...)`; unit tests verify `X-Ratelimit-Reset: 0`, blank headers, HTTP-date `Retry-After`, and negative option clamping.
- **`F-02` (`P1` — fetch adapter)**: `VERIFIED` — `response.arrayBuffer()` is now read inside the per-attempt `try / catch` block in `src/adapters/fetch/index.ts`, with unit tests verifying retry recovery, `FileFetchError` wrapping on exhaustion, and mid-stream `AbortSignal` normalization.
- **`F-06` (`P2` — fetch adapter)**: `VERIFIED` — `defaultFetch` lazily invokes `globalThis.fetch(input, init)` at call time rather than binding at construction time, verified via post-construction `vi.spyOn(globalThis, 'fetch')`.
- **`F-07` (`P2` — fetch adapter)**: `VERIFIED` — Replaced wall-clock `setTimeout(..., 15)` in `tests/adapters/fetch.test.ts` with deterministic microtask abort coordination.

## M2-Verifier-2 (`M2-Fixer-2` Verification)

- **Overall Verdict**: `VERIFIED`
- **`F-01` (`P1`)**: `VERIFIED` — `src/adapters/modrinth/index.ts` imports shared HTTP retry/abort helpers from `src/adapters/http-retry.ts` and preserves `trimmed.length > 0` and `seconds > 0` guards.
- **`F-02` (`P1` — Modrinth adapter)**: `VERIFIED` — `response.json()` is read inside the per-attempt `try / catch` block in `HttpModrinthClient.requestJson`, with unit tests verifying retry recovery, `ModrinthApiError` wrapping on exhaustion, and mid-body abort normalization.
- **`F-03` (`P1`)**: `VERIFIED` — `mapRawVersion` filters `(raw.dependencies ?? [])` to entries with non-empty string `d.project_id` using a type guard and maps `projectId: d.project_id.trim()` without `as string`, verified through `resolveCollection`, `serialize`, and `validateInstanceSchema`.
- **`F-04` (`P2`)**: `VERIFIED` — Removed non-port aliases (`listGameVersions`, `listPlatforms`), removed duplicate DTO properties (`projectType`, `hashes`, `dependencyType`), aligned method signatures with `ProjectVersionsQuery` and `RequestOptions`, and updated unit tests in `tests/adapters/modrinth.test.ts`.
- **`F-05` (`P2`)**: `VERIFIED` — `mapRawVersion` preserves `primary: typeof f.primary === 'boolean' ? f.primary : undefined` and selects `files.find(f => f.primary === true) ?? files.find(f => f.primary === undefined) ?? null`, verified by unit tests for `primary: false` vs `primary: undefined`.
- **`F-06` (`P2` — Modrinth adapter)**: `VERIFIED` — `HttpModrinthClient` defaults `fetchImpl` to lazy `defaultFetch`, verified by post-import `vi.spyOn(globalThis, 'fetch')` on `services.modrinthClient`.
- **`F-07` (`P2` — Modrinth adapter)**: `VERIFIED` — Added unit tests for `waitQueue` concurrency abort + slot release, `503` retry exhaustion, transient `TypeError('Failed to fetch')` recovery, and deterministic mid-backoff abort coordination.
- **Full Check Suite**: `yarn lint`, `yarn typecheck`, `yarn test` (14 test files, 215 tests), and `yarn build` all passed.
