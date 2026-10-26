# Milestone M3.2 — Selection and Dependency Auto-Select: Work Plan

## Goal
Implement Milestone M3.2 (`IMPLEMENTATION_PLAN_v1.MD` §7.3, §7.3.1, §7.5, §13 M3.2):
- Top-level **Client** and **Server** environment toggles (§7.3.1), both **off by default** on first load of the tables, gating column interaction (grayed out and disabled while off, while still showing underlying `Selection`/`version` state; toggling on/off never mutates `Selection`).
- Per-environment checkboxes on selectable cells (`support !== 'unsupported' && version !== null`), wired to `selectEntry` and `deselectEntry` (§7.3).
- Per-environment, per-table header **select-all** tri-state checkboxes (`checked`, `indeterminate`, `unchecked`) via `getHeaderTriState`, `selectAllInTable`, and `deselectAllInTable`, acting on collection rows only while dependencies follow via auto-select/auto-deselect (§7.3).
- Per-environment version `<select>` dropdowns populated with `envState.candidates` (tagging fallback and pre-release versions), wired to `changeEntryVersion` to recompute that environment's dependency closure (fetching any newly discovered dependencies from `ModrinthClient`) and report `changes` (§7.2, §7.3).
- Auto-select/deselect feedback (§7.5): cells in `changes` flash for ~1s (`prefers-reduced-motion: reduce` replaces animation with a static outline for 1s) and an accessible toast announces e.g. `"Auto-selected 3 client dependencies"` or `"Auto-deselected 1 server dependency"`.
- Re-resolve confirmation dialog (§7.3): changing game version, platform, or release preference (or re-resolving) when `hasSelectionChangedFromDefault(instance)` is true opens a confirmation dialog before resetting selection to the initial default state.
- Comprehensive Testing Library UI tests in `tests/ui/m3-2-selection.test.tsx` and updated documentation in `docs/user-guide.md` and `docs/concepts.md`.

## Subagent Partitioning (Disjoint File Ownership)

1. **`M3.2-UI-Engineer`**:
   - `src/ui/components/EnvironmentTogglesBar.tsx`
   - `src/ui/components/ConfirmReResolveDialog.tsx`
   - `src/ui/components/AutoSelectToast.tsx`
   - `src/ui/components/EntryTables.tsx`
   - `src/ui/components/TargetForm.tsx`
   - `src/ui/App.tsx`
   - `src/ui/styles.css`
   - `tests/ui/m3-2-selection.test.tsx`
   - `tests/ui/m3-1-tables.test.tsx`

2. **`M3.2-Docs-Author`**:
   - `docs/user-guide.md`
   - `docs/concepts.md`
