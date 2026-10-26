# Agent Quickstart & Task Router (`AGENTS.md`)

> **Purpose:** Single-entry-point orientation for coding agents in `modrinth-collection-downloader`. Read this file first, then load **only** the files routed in **§3** and **§4**.

---

## 1. 30-Second Mental Model ("One Data, Three Views")

`modrinth-collection-downloader` (`APP_NAME` in `src/app/config.ts`) is a **100% client-side React + TypeScript app** that resolves a Modrinth collection against a target **Game Version** and **Platform**, customizes independent `client` and `server` **Environments**, and exports the result.

Everything is a pure function of one immutable **`Instance`** (`schemaVersion: 1` in `src/core/model.ts`):
- **`meta`**: `name`, `source` (`collectionId`, `url`), `target` (`gameVersion`, `platform`, `releasePreference: 'stable'|'newest'`), `createdAt`.
- **`entries`**: Ordered `Entry` records (`origin: 'collection'|'dependency'`; `'collection'` wins on overlap).
- **`entry.environments.{client,server}`**: Independent `EnvironmentState` lanes (`support`, `candidates`, `version`, `resolution`, `dependencies`, `requiredBy`, `selection: { on, source: 'none'|'user'|'auto' }`).
- **Derived `Status`**: Computed on the fly; never stored on `Instance` or `instance.json`.

| Projection / Transition | Function(s) (`src/core/`) | Output / Purpose |
| :--- | :--- | :--- |
| **State Transitions** | `reduceInstance`, `changeEntryVersion` | `(Instance, Action) => { instance, changes }` (1s flash & toast). |
| **1. Review UI Tables** | `toTables`, `computeEntryStatus` | `TableModel[]` (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`) + `Status`. |
| **2. Environment Zips** | `toFileTree`, `formatEntryFilename` | `{ client, server }` file trees (`mods/`, `plugins/`, etc.) for `{client,server}.zip`. |
| **3. `instance.json`** | `serialize`, `deserialize` | Schema-validated (`schema/instance.schema.json`) **offline** snapshot. |
| **4. Modrinth `.mrpack`** | `toMrpack`, `getMrpackWarnings` | `modrinth.index.json` (`MrpackIndex`) with CDN URLs + `sha1`/`sha512`. |

---

## 2. Toolchain & Verification Commands

- **Toolchain:** Node.js **20+**, **Yarn** (`yarn.lock` only; never `npm`), TypeScript `strict: true` + `noUncheckedIndexedAccess: true`.

```bash
yarn lint          # ESLint (--max-warnings=0) + eslint-plugin-boundaries layer checks
yarn typecheck     # tsc --noEmit (strict + noUncheckedIndexedAccess)
yarn test --run    # Vitest unit, adapter, schema, boundary, and UI suites
yarn build         # tsc --noEmit && vite build (outputs static bundle to dist/)
```

- **Git & Hygiene:** Run `git add -N .` before `git diff` or `/multi-agent-code-review`. Never stage `.DS_Store` or `package-lock.json`. Co-ship `tests/` and `docs/*.md` updates with every behavioral change.

---

## 3. Documentation Index ("What to Read When")

| Document | Contents Summary & When to Read |
| :--- | :--- |
| [`docs/concepts.md`](docs/concepts.md) | Glossary, `Instance` lanes, resolution (`1`–`4`), dependency closure, selection state machine, environment toggles, verbatim `REASON_MESSAGES`. |
| [`docs/architecture.md`](docs/architecture.md) | Layer matrix (`core`, `ports`, `adapters`, `ui`, `app`), ports, `AbortController` & 500-row `React.memo` invariants, and testing conventions. |
| [`docs/output-formats.md`](docs/output-formats.md) | `{client,server}.zip` naming & `-2`/`-3` collisions, `instance.json` (`schemaVersion: 1`) offline import/export, and `.mrpack` mapping. |
| [`docs/modrinth-api-notes.md`](docs/modrinth-api-notes.md) | Live API reference: `/v3/collection/{id}`, `/v2/projects`, `classifyProjectType` (`mod`>`plugin`>`datapack`), `429` headers, batching (`100`). |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Developer setup, agent workflow guide, and checklists for adding a **Platform** or **Project Type**. |
| [`README.md`](README.md) | Project overview and visual end-user walkthrough (`docs/screenshots/01`–`04`). |

*(Historical build plans, milestone journals, and workflow retrospectives live in `docs/journal/` and `docs/workflow/` — read-only archival context.)*

---

## 4. Task Routing Playbook

| Scenario | 1. Read First | 2. Edit Files | 3. Tests | 4. Docs to Sync |
| :--- | :--- | :--- | :--- | :--- |
| **Resolution (`1`–`4`)** | `concepts.md §4` | `core/{resolver,model}.ts` | `core/{resolver,parity}.test.ts` | `concepts.md`, `README.md` |
| **Closure / Partial Fetch** | `concepts.md §5` | `core/{resolver,projections}.ts` | `core/{resolver,projections}.test.ts`, `ui/m5-polish.test.tsx` | `concepts.md`, `architecture.md` |
| **Selection / `user-off`** | `concepts.md §6` | `core/{reducers,resolver}.ts` | `core/reducers.test.ts`, `ui/m3-2-selection.test.tsx` | `concepts.md`, `README.md` |
| **Env Toggles** | `concepts.md §7` | `EnvironmentTogglesBar`, `EntryTables`, `ExportBar`, `App.tsx`, `status.ts` | `ui/{m3-2,m3-3,m4}*.test.tsx` | `concepts.md`, `README.md` |
| **Status / Tooltips** | `concepts.md §8` | `status.ts`, `StatusSymbol.tsx`, `EntryTables.tsx`, `styles.css` | `core/status.test.ts`, `ui/m3-3-status.test.tsx` | `concepts.md`, `README.md` |
| **Zip / Naming** | `output-formats.md §1` | `naming.ts`, `projections.ts`, `download.ts`, `ExportBar.tsx` | `core/{naming,projections}.test.ts`, `ui/m4-outputs.test.tsx` | `output-formats.md`, `README.md` |
| **`instance.json` Schema** | `output-formats.md §2` | `instance.schema.json`, `model.ts`, `serialize.ts`, `App.tsx` | `core/serialize.test.ts`, `ui/m4-outputs.test.tsx` | `output-formats.md` |
| **`.mrpack` Export** | `output-formats.md §3` | `projections.ts`, `download.ts`, `ExportBar.tsx` | `core/projections.test.ts`, `ui/m4-outputs.test.tsx` | `output-formats.md`, `README.md` |
| **Modrinth API / Retry** | `modrinth-api-notes.md` | `adapters/modrinth/index.ts`, `http-retry.ts`, `ports/index.ts` | `adapters/{modrinth,e2e-collection}.test.ts` | `modrinth-api-notes.md` |
| **500-Row `React.memo`** | `architecture.md §4` | `EntryTables.tsx`, `StatusSymbol.tsx`, `App.tsx`, `styles.css` | `ui/{m3-1,m3-3,m5}*.test.tsx` | `architecture.md` |
| **Add Platform / Type** | `CONTRIBUTING.md` | Follow checklists in `CONTRIBUTING.md` | `adapters/modrinth.test.ts`, `core/*.test.ts` | `modrinth-api-notes.md`, `concepts.md`, `output-formats.md` |

---

## 5. Non-Negotiable Guardrails

1. **Ubiquitous Language ([`docs/concepts.md`](docs/concepts.md)):** Always **`Environment`** (`client`|`server`), never `"side"` (except raw `client_side`/`server_side` in `adapters/modrinth/`). Always **`Platform`** (`fabric`, `neoforge`, `paper`, …), never `"loader"` (except `/v2/tag/loader`, raw `loaders[]`, and `.mrpack` `"fabric-loader"`/`"quilt-loader"`).
2. **Zero Default Active Environment ([`docs/concepts.md`](docs/concepts.md)):** **Client** & **Server** toggles (`activeEnvironments` in `App.tsx`) **must** start **off** (`{ client: false, server: false }`) on load/import; toggling only gates interactivity, status warnings, and zip export buttons.
3. **Closure & Sticky `user-off` ([`docs/concepts.md`](docs/concepts.md)):** Rule 1 (`pinned`) applies **only** to `origin === 'dependency'`. `dependencies`/`requiredBy` are computed across **any selection state**. Auto-select **never** overrides `off/user` (`REQUIRED_DEPENDENCY_NOT_SELECTED`); auto-deselect **only** turns off `on/auto` entries with no selected dependents.
4. **Partial-Result Threshold ([`docs/architecture.md`](docs/architecture.md)):** `resolveCollection` throws only if `getCollection`, initial `getProjects`, or **100%** of exportable collection `getProjectVersions` fail; otherwise failed collection projects go to `skipped` (omitted from `entries`), and failed transitive dependencies get a `version: null` placeholder entry.
5. **Pre-`Await` Abort & Identity Guards ([`docs/architecture.md`](docs/architecture.md)):** In `App.tsx`, abort conflicting `AbortController` refs **synchronously before the first `await`** (`readFileText` included), guard post-`await` updates with `controllerRef.current === controller && !controller.signal.aborted`, and reset session state on new loads/imports.
6. **500-Row `React.memo` & `axe-core` ([`docs/architecture.md`](docs/architecture.md)):** Preserve `React.memo` comparators on `EntryTableRow`/`EnvironmentCell` and `instanceRef` callbacks in `App.tsx`, keep `StatusSymbol` tooltips `Escape`-dismissible (WCAG 2.1 SC 1.4.13), and maintain **0 `axe-core` violations**.
