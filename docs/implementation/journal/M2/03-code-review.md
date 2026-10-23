# Milestone M2 — Multi-Agent Code Review Report

## Code Review Results

**Scope:** `HEAD` -> working tree (`git diff HEAD` across 21 changed/added M2 files, 2,256 executable lines)
**Intent:** Implement Milestone M2 (Adapters) of `modrinth-collection-downloader`: Modrinth HTTP adapter (`src/adapters/modrinth/index.ts`), binary file fetcher (`src/adapters/fetch/index.ts`), JSZip archive writer (`src/adapters/zip/index.ts`), adapter barrel (`src/adapters/index.ts`), application services composition root (`src/app/services.ts`), §9 live API verification documentation (`docs/modrinth-api-notes.md`, `docs/output-formats.md`, `docs/decisions.md`), recorded Modrinth JSON fixtures (`tests/fixtures/modrinth/*.json`), and unit/E2E adapter tests (`tests/adapters/*.test.ts`).
**Mode:** `markdown report-only` (`apply=false`)

**Reviewers:** `correctness`, `testing`, `maintainability`, `reliability`, `blast-radius`
- `testing` -- diff adds adapter unit/E2E test suites (`tests/adapters/*.test.ts`) and recorded API fixtures
- `maintainability` -- diff introduces new adapter abstractions, DTO mappings, and retry/concurrency helpers across `src/adapters/*` and `src/app/services.ts`
- `reliability` -- diff implements HTTP retry/backoff, rate-limit header parsing, `AbortSignal` cancellation, and concurrency semaphore queueing
- `blast-radius` -- diff wires external adapters into `src/app/services.ts`, adds `jszip` to `package.json`, and bridges raw Modrinth API payloads to `src/core` and `schema/instance.schema.json`

### Triage Groups

| Group | Findings | Context | Preferred Resolution | Why |
|-------|----------|---------|----------------------|-----|
| Adapter HTTP retry, body stream, and helper consolidation | `F-01`, `F-02` | `src/adapters/fetch/index.ts` and `src/adapters/modrinth/index.ts` duplicate HTTP retry/abort helpers with behavioral drift and leave `response.arrayBuffer()` / `response.json()` outside the retry `try/catch` block (`apply-queue`) | Extract shared HTTP retry/abort helpers first (`F-01`), then wrap response body reads inside the per-attempt `try/catch` block (`F-02`) | Consolidating the retry/abort logic fixes the `X-Ratelimit-Reset: 0` / blank header bug in one place and provides a single pattern for body-read error handling |
| Modrinth version DTO mapping and schema safety | `F-03`, `F-05` | `mapRawVersion` in `src/adapters/modrinth/index.ts` casts nullable `d.project_id` to `string` and coerces `primary: false` files into fallback primary files (`apply-queue`) | Fix `mapRawVersion` dependency filtering (`F-03`) and primary file selection (`F-05`) together in `src/adapters/modrinth/index.ts` | Both touch `mapRawVersion` (`src/adapters/modrinth/index.ts:433-486`) and protect `resolveCollection` / `serialize` invariants |
| Port contract surface and test completeness | `F-04`, `F-06`, `F-07` | Extra non-port alias methods/fields in `src/adapters/modrinth/index.ts`, eager `globalThis.fetch.bind` at module import time in `src/app/services.ts`, and missing `waitQueue` abort / retry-exhaustion tests (`apply-queue`) | Align `HttpModrinthClient` with `src/ports/index.ts` (`F-04`), switch default `fetchImpl` to a lazy wrapper (`F-06`), and expand `tests/adapters/modrinth.test.ts` (`F-07`) | Ensures adapter tests exercise the canonical `ModrinthClient` port contract and all concurrency/retry edge cases |

### P1 -- High

| # | File | Issue | Reviewer | Confidence |
|---|------|-------|----------|------------|
| `F-01` | `src/adapters/fetch/index.ts:89-126`, `src/adapters/modrinth/index.ts:279-385` | Duplicated HTTP retry/abort helpers have drifted, causing `HttpFileFetcher` to retry with `0ms` delay on `X-Ratelimit-Reset: 0` or blank headers and fail on negative retry options | `correctness`, `reliability`, `maintainability`, `testing` | 100 |
| `F-02` | `src/adapters/fetch/index.ts:161-165`, `src/adapters/modrinth/index.ts:591-595` | `HttpFileFetcher.fetchBinary` and `HttpModrinthClient.requestJson` read response bodies outside the retry/abort/error-wrapping `try/catch` block | `correctness`, `reliability` | 100 |
| `F-03` | `src/adapters/modrinth/index.ts:462-471` | `mapRawVersion` casts nullable `d.project_id` (`null`/`undefined`) `as string`, breaking `serialize()` and `instance.schema.json` validation | `correctness`, `blast-radius`, `maintainability` | 100 |

- **`F-01` (`P1`)** -- **Problem:** `src/adapters/fetch/index.ts` (lines 22-114) and `src/adapters/modrinth/index.ts` (lines 279-385) duplicate six helper functions (`createAbortError`, `throwIfAborted`, `isAbortError`, `defaultSleep`, `isRetryableStatus`, `parseRetryDelayMs`). The copy in `src/adapters/fetch/index.ts:90-114` drifted from `src/adapters/modrinth/index.ts:357-385`: (1) it omits `if (trimmed.length > 0)` before `Number(trimmed)` (where `Number('') === 0`), (2) it checks `seconds >= 0` instead of `seconds > 0` for `x-ratelimit-reset` (`src/adapters/fetch/index.ts:107`), and (3) `HttpFileFetcher`'s constructor (`src/adapters/fetch/index.ts:124-125`) does not clamp `maxRetries` and `baseDelayMs` with `Math.max(0, ...)`. Because Modrinth sends `x-ratelimit-reset: 0` whenever no rate-limit window is active (including on `5xx` responses, per `docs/modrinth-api-notes.md` §3), `HttpFileFetcher` returns a `0ms` delay and immediately hammers the server without exponential backoff.
  - **Proposed Fix:** Extract the shared HTTP retry/abort utilities (`createAbortError`, `throwIfAborted`, `isAbortError`, `defaultSleep`, `isRetryableStatus`, `parseRetryDelayMs` with `trimmed.length > 0` and `seconds > 0` guards) into a shared internal module under `src/adapters/`, clamp `maxRetries` and `baseDelayMs` with `Math.max(0, ...)` in `HttpFileFetcher`, and add unit tests in `tests/adapters/fetch.test.ts` covering `X-Ratelimit-Reset: 0` on `503` responses, blank headers, and HTTP-date `Retry-After`.
- **`F-02` (`P1`)** -- **Problem:** `fetch()` resolves as soon as HTTP response headers arrive; streaming the binary payload (`await response.arrayBuffer()` in `src/adapters/fetch/index.ts:162`, often 1-50 MB for mod/resourcepack archives) or JSON payload (`await response.json()` in `src/adapters/modrinth/index.ts:592`) happens afterward. Because both body reads sit outside the per-attempt `try / catch` block, a connection reset, mid-stream abort, or truncated body during payload download bypasses `isAbortError(error, signal)` normalization, skips retry/backoff (`attempt < this.maxRetries`), and leaks an unwrapped `TypeError` or `SyntaxError` instead of throwing `FileFetchError` / `ModrinthApiError`.
  - **Proposed Fix:** Move the `if (response.ok) { ... }` body read (`await response.arrayBuffer()` in `src/adapters/fetch/index.ts:161-165` and `await response.json()` in `src/adapters/modrinth/index.ts:591-595`) inside the per-attempt `try / catch` block so mid-stream errors and aborts are handled identically to header-stage fetch errors, and add unit tests in `tests/adapters/fetch.test.ts` and `tests/adapters/modrinth.test.ts`.
- **`F-03` (`P1`)** -- **Problem:** Modrinth's v2 version dependency object (`RawModrinthVersionDependency` at `src/adapters/modrinth/index.ts:98-103`) allows `project_id: null` (for example, embedded file dependencies that only specify `file_name`, or deleted projects). `mapRawVersion` (`src/adapters/modrinth/index.ts:465`) maps `projectId: (d.project_id ?? undefined) as string`, producing `{ projectId: undefined, type: ... }` at runtime. `toUsableVersionRef` in `src/core/resolver.ts:141` copies all `version.dependencies` onto `VersionRef.dependencies`, which then causes `serialize(instance)` and `validateInstanceSchema(instance)` (`src/core/serialize.ts:105-109`, `schema/instance.schema.json:103-115`) to fail validation (`missing required property "projectId"`).
  - **Proposed Fix:** In `mapRawVersion` (`src/adapters/modrinth/index.ts:462-471`), filter `(raw.dependencies ?? [])` to entries where `typeof d.project_id === 'string' && d.project_id.trim().length > 0`, and map `projectId: d.project_id.trim()` without any `as string` cast. Add a unit test verifying a raw version dependency with `project_id: null` is filtered out and `serialize()` succeeds.

### P2 -- Moderate

| # | File | Issue | Reviewer | Confidence |
|---|------|-------|----------|------------|
| `F-04` | `src/adapters/modrinth/index.ts:137-171,787-805`, `tests/adapters/modrinth.test.ts:277-299` | Unrequested alias methods (`listGameVersions`, `listPlatforms`), duplicate DTO properties (`projectType`, `hashes`, `dependencyType`), and widened parameter unions in Modrinth adapter | `maintainability`, `testing` | 100 |
| `F-05` | `src/adapters/modrinth/index.ts:434-460` | `mapRawVersion` selects `files[0]` as primary even when all files on a version explicitly have `primary: false` | `correctness` | 100 |
| `F-06` | `src/app/services.ts:29`, `src/adapters/modrinth/index.ts:505`, `src/adapters/fetch/index.ts:123` | Eager singleton instantiation in `src/app/services.ts` binds `globalThis.fetch` at module import time | `blast-radius` | 100 |
| `F-07` | `tests/adapters/modrinth.test.ts:394-494`, `tests/adapters/fetch.test.ts:227-253` | Incomplete concurrency-queue abort, retry exhaustion, and deterministic timer coverage in adapter tests | `testing` | 100 |

- **`F-04` (`P2`)** -- **Problem:** `HttpModrinthClient` adds parallel surface area not specified in `ModrinthClient` (`src/ports/index.ts`) or `IMPLEMENTATION_PLAN_v1.MD` §5.2: (1) `listGameVersions` (`src/adapters/modrinth/index.ts:787`) and `listPlatforms` (`src/adapters/modrinth/index.ts:803`) duplicate `getGameVersions` and `getPlatforms`, and `tests/adapters/modrinth.test.ts:285,294` only invokes those non-port aliases; (2) `ModrinthProjectDetails`, `ModrinthVersionFileDetails`, and `ModrinthVersionDependencyDetails` populate duplicate properties (`type` + `projectType`, `sha1`/`sha512` + `hashes`, `type` + `dependencyType`); and (3) `ModrinthProjectVersionsFilter` and `extractSignal` widen the port's `ProjectVersionsQuery` and `RequestOptions` signatures.
  - **Proposed Fix:** Remove `listGameVersions` and `listPlatforms` (updating `tests/adapters/modrinth.test.ts` to call `getGameVersions` and `getPlatforms`), remove the redundant duplicate DTO fields (`projectType`, `hashes`, `dependencyType`), and align method signatures with `src/ports/index.ts`.
- **`F-05` (`P2`)** -- **Problem:** Both the upstream reference (`index.html:715`) and M1's `pickPrimaryFile` (`src/core/resolver.ts:92-107`) reject versions whose files are all explicitly marked `primary: false`, falling back to the first file only when `primary` is omitted (`undefined`). Because `mapRawVersion` (`src/adapters/modrinth/index.ts:441,451`) coerces `primary: Boolean(f.primary)` on every file and then evaluates `const primaryCandidate = files.find((f) => f.primary) ?? files[0] ?? null`, it populates `version.file` with `files[0]` even when every file in `raw.files` explicitly set `primary: false`.
  - **Proposed Fix:** In `mapRawVersion` (`src/adapters/modrinth/index.ts:434-460`), preserve `primary: typeof f.primary === 'boolean' ? f.primary : undefined` on mapped `VersionFileInfo` entries and select `files.find((f) => f.primary === true) ?? files.find((f) => f.primary === undefined) ?? null` as `primaryCandidate` (matching `src/core/resolver.ts:pickPrimaryFile`), and add a unit test in `tests/adapters/modrinth.test.ts`.
- **`F-06` (`P2`)** -- **Problem:** `export const services: AppServices = createAppServices()` (`src/app/services.ts:29`) executes at module import time, which calls `globalThis.fetch.bind(globalThis)` in both `HttpModrinthClient` (`src/adapters/modrinth/index.ts:505`) and `HttpFileFetcher` (`src/adapters/fetch/index.ts:123`). If `globalThis.fetch` is stubbed or spied on in test `beforeEach` hooks (e.g. M3 UI tests) after module import, `services.modrinthClient` and `services.fileFetcher` bypass the stub and invoke the original `fetch` captured at import time; and if `globalThis.fetch` is absent at import time, importing `src/app/services.ts` throws.
  - **Proposed Fix:** Default `fetchImpl` in `HttpModrinthClient` and `HttpFileFetcher` to a lazy wrapper `(input, init) => globalThis.fetch(input, init)` instead of `globalThis.fetch.bind(globalThis)` at construction time.
- **`F-07` (`P2`)** -- **Problem:** (1) The test `'honors AbortSignal when pre-aborted, queued for concurrency, or sleeping in retry backoff'` in `tests/adapters/modrinth.test.ts:466` never saturates `maxConcurrency` or aborts a request queued in `this.waitQueue` (`src/adapters/modrinth/index.ts:521-543`), leaving queue removal on abort and subsequent slot release untested; (2) `tests/adapters/modrinth.test.ts` lacks unit tests for `429`/`5xx` retry exhaustion and transient network error (`TypeError('Failed to fetch')`) retries; and (3) backoff abort tests in `tests/adapters/modrinth.test.ts:492` and `tests/adapters/fetch.test.ts:247` rely on real wall-clock `setTimeout(..., 15)` delays instead of deterministic abort coordination.
  - **Proposed Fix:** In `tests/adapters/modrinth.test.ts`, add tests for aborting a queued request in `waitQueue` (verifying slot release for subsequent requests), `429`/`5xx` retry exhaustion, and transient network error retries; and replace wall-clock `setTimeout(..., 15)` in backoff abort tests (`tests/adapters/modrinth.test.ts:492`, `tests/adapters/fetch.test.ts:247`) with deterministic abort coordination.

### Requirements Completeness

Checked against `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` (§5.1, §5.2, §9, §12, §13 Milestone M2):

- **Modrinth adapter (`src/adapters/modrinth/index.ts`):** All `ModrinthClient` port methods implemented (`getCollection`, `getProjects`, `getProjectVersions`, `getVersionsByIds`, `getGameVersions`, `getPlatforms`), batching (100 IDs/chunk), concurrency cap (default 5), retry/backoff on 429/5xx honoring `Retry-After` and `X-Ratelimit-Reset`, `AbortSignal` support, no custom `User-Agent` -- **Met** (with edge cases in `F-02`, `F-03`, `F-04`, `F-05` to address).
- **FileFetcher adapter (`src/adapters/fetch/index.ts`):** Implements `fetchBinary(url, opts)` returning `Uint8Array` with retry/backoff and `AbortSignal` -- **Partially addressed** (`F-01` and `F-02` identify retry header drift and unwrapped `response.arrayBuffer()`).
- **ArchiveWriter adapter (`src/adapters/zip/index.ts`):** Implements `create()` / `addFile()` / `generate({ onProgress })` using `JSZip` confined to `src/adapters/zip` -- **Met**.
- **Composition root (`src/app/services.ts`):** Wires `modrinthClient`, `fileFetcher`, and `archiveWriter` -- **Met** (`F-06` improves lazy `globalThis.fetch` resolution).
- **§9 VERIFY items 1-4 (`docs/modrinth-api-notes.md`, `docs/output-formats.md`, `docs/decisions.md`):** All 4 VERIFY items verified against live `https://api.modrinth.com` and documented -- **Met**.
- **End-to-end collection resolution & serialization test (`tests/adapters/e2e-collection.test.ts`):** Resolves recorded collection `YV97U1kk` end-to-end into an `Instance`, validates against `schema/instance.schema.json`, and round-trips `serialize`/`deserialize` -- **Met**.

### Actionable Findings

| # | File | Issue | Route | Notes |
|---|------|-------|-------|-------|
| `F-01` | `src/adapters/fetch/index.ts:89-126` | Duplicated HTTP retry/abort helpers drifted (`X-Ratelimit-Reset: 0` / blank headers return `0ms` delay in `HttpFileFetcher`) | `gated_auto -> downstream-resolver` | Concrete `suggested_fix` present (confidence 100) |
| `F-02` | `src/adapters/fetch/index.ts:161-165` | `response.arrayBuffer()` and `response.json()` sit outside per-attempt `try/catch` retry/error wrapper | `gated_auto -> downstream-resolver` | Concrete `suggested_fix` present (confidence 100) |
| `F-03` | `src/adapters/modrinth/index.ts:465` | Nullable `d.project_id` cast `as string` to `undefined`, breaking `serialize()` and schema validation | `gated_auto -> downstream-resolver` | Concrete `suggested_fix` present (confidence 100) |
| `F-04` | `src/adapters/modrinth/index.ts:137-171,787-805` | Unrequested alias methods (`listGameVersions`, `listPlatforms`), duplicate DTO fields, and widened parameter unions | `gated_auto -> downstream-resolver` | Concrete `suggested_fix` present (confidence 100) |
| `F-05` | `src/adapters/modrinth/index.ts:451` | `mapRawVersion` falls back to `files[0]` even when all files explicitly have `primary: false` | `gated_auto -> downstream-resolver` | Concrete `suggested_fix` present (confidence 100) |
| `F-06` | `src/app/services.ts:29` | Eager singleton binds `globalThis.fetch` at module import time | `gated_auto -> downstream-resolver` | Concrete `suggested_fix` present (confidence 100) |
| `F-07` | `tests/adapters/modrinth.test.ts:466` | Missing `waitQueue` abort test, retry-exhaustion/network-error tests, and deterministic backoff abort timers | `gated_auto -> downstream-resolver` | Concrete `suggested_fix` present (confidence 100) |

### Coverage

- **Suppressed:** 0 findings suppressed below anchor 75.
- **Mode-aware demotions:** 0 findings demoted.
- **Validator gate:** 4 of 7 findings (`F-01`, `F-02`, `F-03`, `F-04`) carried `first_evidence` and independent multi-reviewer corroboration (2 to 4 reviewers each); all 7 findings will be independently evaluated by dedicated evaluator subagents in Step 4 of the M2 coordinator workflow.
- **Settlement suppression:** Evaluated against `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` and `docs/decisions.md` (`D-001` through `D-007`).
- **Removable surface:** ~110 lines across `src/adapters/fetch/index.ts` and `src/adapters/modrinth/index.ts` by consolidating duplicated HTTP retry/abort helpers (`F-01`) and removing unrequested alias methods/fields (`F-04`).
- **Residual risks:**
  - Target-independent project classification (`D-006`): Because `ModrinthClient.getProjects(ids)` is target-independent, hybrid mod+plugin projects (such as WorldEdit) are classified as `'mod'` even when the target platform is `'paper'`.
  - In browser environments where Modrinth does not send `Access-Control-Expose-Headers`, `X-Ratelimit-Reset` may not be readable by JS, so browser requests rely on `Retry-After` or exponential backoff.
  - `HttpModrinthClient` holds its concurrency slot during retry backoff sleeps (`429`/`5xx`).
- **Testing gaps:**
  - `Retry-After` HTTP-date parsing (`Date.parse(trimmed)`) and backslash path normalization (`path.replace(/\\/g, '/')` in `src/adapters/zip/index.ts`) are not yet directly asserted in unit tests.

---

> **Verdict:** Ready with fixes
>
> **Reasoning:** Milestone M2 fulfills the architecture, port implementations, live API verification (`§9`), and E2E collection resolution criteria, but 3 `P1` correctness/reliability defects (`F-01`, `F-02`, `F-03`) and 4 `P2` contract/test-completeness issues (`F-04` through `F-07`) should be resolved before completing the milestone.
>
> **Fix order:** `F-01` (shared HTTP retry/abort helper & header parsing fix) -> `F-02` (wrap `response.arrayBuffer()` / `response.json()` in retry `try/catch`) -> `F-03` & `F-05` (`mapRawVersion` nullable `project_id` filtering & `primary: false` handling) -> `F-04` & `F-06` (port surface alignment & lazy `globalThis.fetch` wrapper) -> `F-07` (adapter unit test coverage for `waitQueue` abort, retry exhaustion, and deterministic timers).

### Actionable Findings Summary

- `F-01` | `P1` | `src/adapters/fetch/index.ts:89-126` | Duplicated HTTP retry/abort helpers drifted (`X-Ratelimit-Reset: 0` / blank headers return `0ms` delay in `HttpFileFetcher`) | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
- `F-02` | `P1` | `src/adapters/fetch/index.ts:161-165` | `HttpFileFetcher.fetchBinary` and `HttpModrinthClient.requestJson` read response bodies outside the retry/abort/error-wrapping `try/catch` block | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
- `F-03` | `P1` | `src/adapters/modrinth/index.ts:462-471` | `mapRawVersion` casts nullable `d.project_id` `as string`, breaking `serialize()` and schema validation | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
- `F-04` | `P2` | `src/adapters/modrinth/index.ts:137-171,787-805` | Unrequested alias methods (`listGameVersions`, `listPlatforms`), duplicate DTO properties, and widened parameter unions in Modrinth adapter | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
- `F-05` | `P2` | `src/adapters/modrinth/index.ts:434-460` | `mapRawVersion` selects `files[0]` even when all files explicitly have `primary: false` | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
- `F-06` | `P2` | `src/app/services.ts:29` | Eager singleton instantiation in `src/app/services.ts` binds `globalThis.fetch` at module import time | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
- `F-07` | `P2` | `tests/adapters/modrinth.test.ts:394-494` | Incomplete concurrency-queue abort, retry exhaustion, and deterministic timer coverage in adapter tests | `autofix_class: gated_auto` | `suggested_fix: yes` | `confidence: 100`
