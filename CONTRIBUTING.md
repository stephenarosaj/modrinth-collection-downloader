# Contributing to Modrinth Collection Downloader

## Verification Gates

Every change must pass all four checks (enforced in CI by [`.github/workflows/ci.yml`](.github/workflows/ci.yml)):

```bash
yarn lint          # ESLint (--max-warnings=0) + eslint-plugin-boundaries
yarn typecheck     # tsc --noEmit (strict + noUncheckedIndexedAccess)
yarn test --run    # Vitest unit, adapter, boundary, schema, and UI suites
yarn build         # Production static build (dist/)
```

---

## Developing with Coding Agents

This repository is structured for fast, low-context agentic development:

- **[`AGENTS.md`](AGENTS.md) (Auto-Loaded Agent Router):** Automatically injected into coding agents' system prompts. It contains the 30-second mental model, a **"What to Read / Edit / Test / Sync" task routing playbook**, and the 6 non-negotiable domain/UI guardrails. Point your agent at `AGENTS.md` (or let it load automatically) instead of pasting multiple docs into chat.
- **Focused Reference Docs (`docs/`):**
  - [`docs/concepts.md`](docs/concepts.md) — Domain rules (glossary, resolution `1`–`4`, closure, sticky `user-off` selection, status reasons).
  - [`docs/architecture.md`](docs/architecture.md) — Layer boundaries (`core`, `ports`, `adapters`, `ui`, `app`), ports, UI async/memo invariants, and testing conventions.
  - [`docs/output-formats.md`](docs/output-formats.md) — `.zip` file naming, `instance.json` schema, and `.mrpack` generation rules.
  - [`docs/modrinth-api-notes.md`](docs/modrinth-api-notes.md) — Modrinth `/v2` vs `/v3` quirks, loader classification sets, and rate-limit headers.
- **Historical Archive (Read-Only Context):**
  - [`docs/journal/`](docs/journal/) and [`docs/workflow/`](docs/workflow/) contain the original build plan, milestone logs, and multi-agent code review retrospective. Do not maintain or update these during normal feature work.

---

## How to Add a Platform

1. **Modrinth Adapter (`src/adapters/modrinth/index.ts`):**
   - Check how the platform is returned by `GET /v2/tag/loader` and on version `loaders[]`.
   - Add the identifier to `MOD_LOADERS` or `PLUGIN_LOADERS` so `classifyProjectType` maps it to `'mod'` or `'plugin'`, and record it in [`docs/modrinth-api-notes.md`](docs/modrinth-api-notes.md).
2. **Display Name (`src/core/naming.ts`):**
   - Add custom capitalization in `PLATFORM_DISPLAY_NAMES` (e.g., `NeoForge`, `BungeeCord`) if title-case fallback is insufficient.
3. **`.mrpack` Export (`src/core/projections.ts`):**
   - If the Modrinth `.mrpack` format supports a root `dependencies` key for the platform, add it to `MRPACK_PLATFORM_DEPENDENCY_KEYS`.
4. **Tests & Docs:**
   - Add unit tests in `tests/adapters/modrinth.test.ts` and `tests/core/`.
   - Sync [`docs/modrinth-api-notes.md`](docs/modrinth-api-notes.md) and [`docs/output-formats.md`](docs/output-formats.md).

---

## How to Add or Update a Project Type

1. **Model & Schema (`src/core/model.ts`, `schema/instance.schema.json`):**
   - Update `ProjectType`, `ExportableProjectType`, `PROJECT_TYPE_ORDER`, `PLATFORM_AGNOSTIC_TYPES`, `TYPE_FOLDER_MAP`, and `schema/instance.schema.json`.
2. **Resolution (`src/core/resolver.ts`):**
   - Confirm whether the type matches `gameVersion` + `platform` or `gameVersion` only (`isPlatformAgnostic`).
3. **Projections (`src/core/projections.ts`, `src/ui/components/EntryTables.tsx`):**
   - Verify table ordering in `toTables`, folder mapping in `toFileTree`, and `.mrpack` inclusion/warning behavior in `toMrpack` / `getMrpackWarnings`.
4. **Tests & Docs:**
   - Add tests across `tests/core/` and `tests/ui/`.
   - Sync [`docs/concepts.md`](docs/concepts.md) and [`docs/output-formats.md`](docs/output-formats.md).
