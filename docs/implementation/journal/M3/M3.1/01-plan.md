# Milestone M3.1 — Read-Only Tables + JSON Export: Work Plan

## Goal
Implement Milestone M3.1 (`IMPLEMENTATION_PLAN_v1.MD` §7.5, §7.6, §8.2, §13 M3.1):
- Input form: collection URL/ID (`parseCollectionInput`), game version dropdown (`getGameVersions()`, `release` types only), platform dropdown (`getPlatforms()`), release preference (`Prefer stable releases over newest alpha/beta`), and **Load collection** button.
- Cancellable resolve progress panel (phase, `loaded / total` progress bar, and log lines).
- Per-project-type read-only tables (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`) with **Name** ("Open on Modrinth ↗" link), **Platform** (formatted display name or `—` for platform-agnostic types), **Client**, and **Server** columns showing resolved version numbers, support tags (`required`, `optional`, `unknown`), `✗` for unsupported cells, `"No compatible version"` when `version === null`, and a **Dependencies** footer section showing `"required by: ..."` per environment.
- **Skipped Projects** section listing `modpack` and unsupported/unresolvable projects with their skip reasons.
- **`instance.json` export** button validating and serializing the resolved `Instance` via `serialize(instance)`.
- Comprehensive Testing Library UI tests and updated `docs/user-guide.md`.

## Subagent Partitioning (Disjoint File Ownership)

1. **`M3.1-UI-Engineer`**:
   - `src/ui/components/TargetForm.tsx`
   - `src/ui/components/ResolveProgressPanel.tsx`
   - `src/ui/components/EntryTables.tsx`
   - `src/ui/components/SkippedSection.tsx`
   - `src/ui/download.ts`
   - `src/ui/App.tsx`
   - `src/ui/styles.css`
   - `src/app/main.tsx`
   - `tests/app.test.tsx`
   - `tests/ui/m3-1-tables.test.tsx`

2. **`M3.1-Docs-Author`**:
   - `docs/user-guide.md`
