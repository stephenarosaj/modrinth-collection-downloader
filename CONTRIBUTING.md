# Contributing to Modrinth Collection Downloader

Thank you for contributing to `modrinth-collection-downloader`. Please follow the guidelines below to keep the architecture clean, deterministic, and well-tested.

---

## Development Setup

Prerequisites:
- **Node.js** 20+
- **Yarn** (`yarn --version`)

Install dependencies:

```bash
yarn install
```

---

## Scripts

Every Pull Request must pass all four verification gates in CI:

| Command | Description |
|---|---|
| `yarn dev` | Start the local Vite development server |
| `yarn lint` | Run ESLint (including architectural boundary checks via `eslint-plugin-boundaries`) |
| `yarn typecheck` | Run `tsc --noEmit` with `strict` and `noUncheckedIndexedAccess` |
| `yarn test` | Run the Vitest unit and component test suite |
| `yarn build` | Build the production static bundle |

---

## Glossary Rules (Strict)

Use these exact domain terms across **code identifiers, UI labels, comments, and documentation**:

| Term | Rule |
|---|---|
| **Environment** | `client` or `server`. **Never** use "side" (except inside the Modrinth API adapter when unwrapping raw API fields like `client_side` / `server_side`). |
| **Platform** | Mod or plugin platform (`fabric`, `forge`, `neoforge`, `quilt`, `paper`, etc.). **Never** use "loader" in UI, docs, or domain identifiers (raw API `/v2/tag/loader` or `loaders` fields are wrapped inside `src/adapters/modrinth/`). |
| **Game version** | Minecraft version (e.g., `1.20.1`). |
| **Project type** | `mod`, `plugin`, `datapack`, `resourcepack`, `shader`, or `modpack` (skipped). |
| **Entry** | One project record in the Instance registry. |
| **Dependency entry** | An entry required by another entry's chosen version. |
| **Instance** | The root model containing `meta` and `entries`. |

---

## Architecture Boundaries

The codebase is organized into five strict layers under `src/`. Architectural boundaries are enforced by ESLint (`eslint-plugin-boundaries`):

```
src/
  core/       Pure TypeScript domain logic. May ONLY import from core/ and ports/ (types).
              NO React, NO DOM, NO fetch, NO adapters.
  ports/      Interfaces only (ModrinthClient, FileFetcher, ArchiveWriter).
  adapters/   Implementations of ports (modrinth/, zip/, fetch/).
              May ONLY import from ports/ and core/ types.
  ui/         React components and hooks. May ONLY import from core/ and ports/ types.
              NEVER import from adapters/.
  app/        Composition root and configuration. Wires adapters into core and ui.
```

If a feature in `core/` appears to need network I/O or browser APIs, define an interface in `src/ports/` instead.

---

## How to Add a Platform

1. **Modrinth Adapter Mapping (`src/adapters/modrinth/`):**
   - Verify how the platform is returned by `GET /v2/tag/loader` and on version `loaders[]` in the Modrinth API (record findings in `docs/modrinth-api-notes.md`).
   - Ensure the classification logic maps the platform to the appropriate `ProjectType` (`mod` vs `plugin`).
2. **Display Name & Naming (`src/core/naming.ts`):**
   - Add the canonical display capitalization (e.g., `NeoForge`, `Fabric`, `Paper`) if it differs from standard title-case fallback.
3. **Mrpack Export (`src/core/mrpack.ts`):**
   - If `.mrpack` `dependencies` supports a platform key (e.g., `fabric-loader`, `quilt-loader`, `forge`, `neoforge`), update the platform key mapping and document it in `docs/output-formats.md`.
4. **Tests & Docs:**
   - Add unit tests in `core` and fixture tests in `adapters`.
   - Update `docs/concepts.md` and `docs/output-formats.md`.

---

## How to Add or Update a Project Type

1. **Domain Model (`src/core/model.ts` & `schema/instance.schema.json`):**
   - Update `ProjectType` union and `schema/instance.schema.json`.
2. **Resolution Rules (`src/core/resolver.ts`):**
   - Specify whether the project type matches on both `gameVersion` and `platform` (like `mod` and `plugin`) or is platform-agnostic and matches on `gameVersion` only (like `datapack`, `resourcepack`, `shader`).
3. **Projections (`src/core/`):**
   - Update table ordering in `toTables(instance)`.
   - Update target directory mapping in `toFileTree(instance)` and `toMrpack(instance, opts)`.
4. **Tests & Docs:**
   - Add table-driven tests for resolution, file tree generation, and `.mrpack` export.
   - Update `docs/concepts.md`, `docs/instance-format.md`, and `docs/output-formats.md` in the same PR.
