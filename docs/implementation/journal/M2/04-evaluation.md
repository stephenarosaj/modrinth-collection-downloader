# Milestone M2 — Adapters: Finding Evaluations

Independent subagent evaluations of the 7 code review findings (`F-01` through `F-07`) from `03-code-review.md`.

---

## Batch 1 Evaluations (`F-01` – `F-03`) — `M2-Evaluator-1`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-01` | `P1` | **ACCEPT** | Extract shared HTTP retry/abort helpers into `src/adapters/http-retry.ts` with `trimmed.length > 0` and `seconds > 0` guards; clamp `maxRetries` and `baseDelayMs` in `HttpFileFetcher`. |
| `F-02` | `P1` | **ACCEPT** | Move `if (response.ok)` body reads (`response.arrayBuffer()` and `response.json()`) inside the per-attempt `try / catch` block in `HttpFileFetcher` and `HttpModrinthClient`. |
| `F-03` | `P1` | **ACCEPT** | Filter `raw.dependencies ?? []` in `mapRawVersion` to entries with non-empty string `d.project_id` and remove `as string` cast so `serialize()` and schema validation never fail on `project_id: null`. |

---

## Batch 2 Evaluations (`F-04` – `F-07`) — `M2-Evaluator-2`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-04` | `P2` | **ACCEPT** | Remove non-port alias methods (`listGameVersions`, `listPlatforms`), redundant duplicate DTO properties (`projectType`, `hashes`, `dependencyType`), and widened parameter unions in `src/adapters/modrinth/index.ts`; update `tests/adapters/modrinth.test.ts` to call the canonical port methods and signatures. |
| `F-05` | `P2` | **ACCEPT** | Preserve `primary: typeof f.primary === 'boolean' ? f.primary : undefined` in `mapRawVersion` and select `files.find(f => f.primary === true) ?? files.find(f => f.primary === undefined) ?? null` so versions with all `primary: false` files map to `file: null`. |
| `F-06` | `P2` | **ACCEPT** | Use a lazy default `fetchImpl` wrapper `(input, init) => globalThis.fetch(input, init)` in `HttpModrinthClient` and `HttpFileFetcher` instead of binding `globalThis.fetch` eagerly at module import time. |
| `F-07` | `P2` | **ACCEPT** | Add unit tests for `waitQueue` concurrency abort + slot release, `429`/`5xx` retry exhaustion, and transient network error retries in `tests/adapters/modrinth.test.ts`, and replace wall-clock `setTimeout(..., 15)` delays with deterministic abort triggers in `tests/adapters/modrinth.test.ts` and `tests/adapters/fetch.test.ts`. |
