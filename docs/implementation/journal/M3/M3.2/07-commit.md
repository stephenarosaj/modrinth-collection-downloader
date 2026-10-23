# Milestone M3.2 — Selection and Dependency Auto-Select: Commit Log

## Commit Message (`/generate-pr-description` Format)

```markdown
# Implement Milestone M3.2 environment toggles, selection controls, version overrides, and auto-select feedback

## Overview
✨ Implements Milestone M3.2 (Selection and dependency auto-select) of `modrinth-collection-downloader`, adding top-level Client and Server environment toggles, per-cell selection checkboxes, per-table tri-state Select All headers, per-environment version dropdowns with dependency closure recomputation, cell flash and toast notifications with reduced-motion support, and target change re-resolve confirmation.

## Highlights
✨ Built `<EnvironmentTogglesBar />` (`src/ui/components/EnvironmentTogglesBar.tsx`) implementing §7.3.1: independent **Client environment** and **Server environment** toggles that start **off by default** on collection load, graying out and disabling column controls while allowing the underlying default selection and version state to show through without mutation.
✨ Upgraded `<EntryTables />` (`src/ui/components/EntryTables.tsx`) and `<App />` (`src/ui/App.tsx`) with per-environment selection checkboxes (`selectEntry` / `deselectEntry`), `auto` and `user off` selection-source badges, header tri-state Select All checkboxes (`getHeaderTriState` / `computeHeaderTriState`, `selectAllInTable` / `deselectAllInTable`), and per-cell version `<select>` dropdowns wired to `changeEntryVersion` to recompute per-environment dependency closures.
✨ Added `<AutoSelectToast />` (`src/ui/components/AutoSelectToast.tsx`) and `1000ms` `.env-cell-flash` animations (`@media (prefers-reduced-motion: reduce)` static outline), `<ConfirmReResolveDialog />` (`src/ui/components/ConfirmReResolveDialog.tsx`) with keyboard focus and `Escape` handling when `hasSelectionChangedFromDefault(instance)` is true, 8 comprehensive Testing Library UI tests in `tests/ui/m3-2-selection.test.tsx` (230 total tests passing across 16 test suites), and updated `docs/user-guide.md` and `docs/concepts.md`.

<details>
<summary><b>Changelog</b></summary>

### Implementation Changes
- **`src/core/model.ts`, `src/core/resolver.ts`, `src/core/reducers.ts`, `src/core/index.ts`**: Exported `isUnverifiedPlatformCandidate` (`!isPlatformAgnostic(projectType) && version.platforms.length === 0`) and `computeHeaderTriState` for shared core/UI use.
- **`src/ui/components/EnvironmentTogglesBar.tsx`**: Added top-level Client and Server environment toggles (off by default on load) gating interaction per column.
- **`src/ui/components/EntryTables.tsx`**: Added per-cell selection checkboxes, `auto` / `user off` selection-source badges, per-table per-environment tri-state Select All checkboxes, per-cell version `<select>` dropdowns (`candidates` with `(beta)`/`(alpha)` and `[unverified platform]` suffixes), and `env-cell-flash` highlighting for cells in `changes`.
- **`src/ui/components/AutoSelectToast.tsx`**: Added accessible `role="status"` (`aria-live="polite"`) toast summarizing auto-selected and auto-deselected dependency counts per environment with dismiss action.
- **`src/ui/components/ConfirmReResolveDialog.tsx` & `src/ui/components/TargetForm.tsx`**: Added target change detection and accessible confirmation modal (`role="dialog"`, `aria-modal="true"`, initial focus on Cancel, `Escape` key handler, and form input revert on Cancel).
- **`src/ui/App.tsx` & `src/ui/styles.css`**: Wired selection reducers, async `changeEntryVersion` closure recomputation with `AbortController` and error recovery, `1000ms` flash timer, reduced-motion static outline styles, and re-resolve confirmation workflow.
- **`docs/user-guide.md` & `docs/concepts.md`**: Documented environment toggles, selection controls, tri-state Select All, dependency auto-select/deselect and user-off overrides, version switching, flash/toast feedback, and re-resolve confirmation.

### Test Changes
- **`tests/ui/m3-2-selection.test.tsx`**: Added 8 Testing Library UI tests proving §7.3 and §7.3.1 (environment toggles off by default, auto-select/deselect, "user-off dependency stays off", header select-all tri-state, independent environments, version dropdown closure recompute + error recovery + 1000ms flash + toast + `prefers-reduced-motion`, and re-resolve confirmation dialog).

</details>
```
