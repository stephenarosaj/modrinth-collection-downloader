# Milestone M3.1 — Read-Only Tables + JSON Export: Implementation Log

Subagent implementation updates for Milestone M3.1 are recorded below.

---

## M3.1-Docs-Author

- **`docs/user-guide.md`**: Documented the Milestone M3.1 workflow covering collection URL/ID entry, release game version & platform selection, release preference ("Prefer stable releases over newest alpha/beta"), cancellable resolution progress & log, reading per-project-type tables (`Mods`, `Plugins`, `Datapacks`, `Resource Packs`, `Shaders`), environment cells (version numbers, `required`/`optional`/`unknown` support tags, `unverified platform`, `✗`, `"No compatible version"`), the **Dependencies** footer (`"required by: <Project> (client/server)"`), the **Skipped Projects** section, and **Export instance.json** (`<collectionId>-instance.json`), adhering strictly to §3 Glossary (`Environment` and `Platform`).

## M3.1-UI-Engineer

- **`src/app/main.tsx` & `src/ui/App.tsx` & `src/ui/download.ts`**: Wired `services.modrinthClient` into `<App />`, added collection metadata header and **Export instance.json** button (`exportInstanceJson` / `triggerTextDownload` validating via `serialize(instance)` and downloading `<collectionId>-instance.json`).
- **`src/ui/components/TargetForm.tsx`**: Implemented collection URL/ID input (`parseCollectionInput`), release-only game version dropdown (`getGameVersions`), mod/plugin platform dropdown (`getPlatforms` + `formatPlatformDisplayName`), release preference checkbox (`stable` vs `newest`), `AbortController` cleanup, and **Retry** button on tag load failure.
- **`src/ui/components/ResolveProgressPanel.tsx`**: Implemented resolve progress panel showing phase, `loaded / total` counter, `role="progressbar"`, scrollable log lines, error/cancelled banners, and **Cancel** button.
- **`src/ui/components/EntryTables.tsx` & `src/ui/components/SkippedSection.tsx` & `src/ui/styles.css`**: Implemented per-type read-only tables (`Mods`, `Plugins`, `Datapacks`, `Resource Packs`, `Shaders`) with memoized rows/cells, **Open on Modrinth ↗** links, platform display (`—` for platform-agnostic types), `Client` and `Server` cells (`✗`, `"No compatible version"`, or `versionNumber` + pre-release/unverified-platform/support badges), **Dependencies** footer (`required by: ... (client/server)`), and **Skipped Projects** section.
- **`tests/ui/m3-1-tables.test.tsx`**: Added 4 comprehensive Testing Library tests covering release-only game versions, platform filtering/formatting, tag load retry, input validation, full collection resolution across all 5 project types, dependency footers, skipped projects, `instance.json` schema validation + `deserialize` round-trip, and cancellation.
- **Verification**: `yarn lint`, `yarn typecheck`, `yarn test` (15 test files, 219 tests), and `yarn build` all passed.
