# Milestone M3.2 — Selection and Dependency Auto-Select: Implementation Log

Subagent implementation updates for Milestone M3.2 are recorded below.

---

## M3.2-Docs-Author

- **`docs/user-guide.md`**: Added step-by-step documentation for Milestone M3.2 covering Client & Server environment toggles (§7.3.1), per-cell selection checkboxes and header Select All tri-state checkboxes (§7.3), automatic dependency selection/deselection and explicit user overrides ("user-off stays off", "user-on stays on"), ~1s cell flash (`prefers-reduced-motion` static outline) and toast announcements (§7.5), per-environment version switching with dependency closure recomputation (§7.2), and target change re-resolve confirmation (§7.3).
- **`docs/concepts.md`**: Aligned selection, version override, and environment toggle documentation with M3.2 mechanics while strictly enforcing §3 Glossary (`Environment` and `Platform`).

## M3.2-UI-Engineer

- **`src/ui/components/EnvironmentTogglesBar.tsx` & `src/ui/App.tsx`**: Implemented top-level **Client environment** and **Server environment** toggles (§7.3.1), both **off by default** on collection resolution, gating column interaction (`env-col-inactive` and `disabled` controls) while preserving and displaying underlying `Selection` and `version` state.
- **`src/ui/components/EntryTables.tsx`**: Added per-cell selection checkboxes (`selectEntry` / `deselectEntry`) with `auto` and `user off` source badges, per-table per-environment header select-all tri-state checkboxes (`getHeaderTriState`, `selectAllInTable`, `deselectAllInTable`), and per-cell version `<select>` dropdowns (`envState.candidates` with non-release and `[unverified platform]` labels) wired to `changeEntryVersion` / `setEntryVersion`.
- **`src/ui/components/AutoSelectToast.tsx` & `src/ui/styles.css`**: Implemented `1000ms` cell flash (`env-cell-flash` / `data-flashing="true"`) with `@media (prefers-reduced-motion: reduce)` static outline and accessible toast (`role="status"`, `aria-live="polite"`) summarizing auto-selected/auto-deselected dependency counts per environment.
- **`src/ui/components/ConfirmReResolveDialog.tsx` & `src/ui/components/TargetForm.tsx`**: Implemented target change detection and confirmation modal (`role="dialog"`, `aria-modal="true"`) when `hasSelectionChangedFromDefault(instance)` is `true`, supporting **Cancel** (reverting form inputs without re-resolving) and **Confirm Re-resolve** (re-resolving and resetting selections to initial defaults).
- **`tests/ui/m3-2-selection.test.tsx`**: Added 7 comprehensive Testing Library UI tests proving §7.3 and §7.3.1 (environment toggles, auto-select/deselect, "user-off dependency stays off", header select-all tri-state, independent environments, version dropdown closure recompute + flash + toast + `prefers-reduced-motion`, and re-resolve confirmation dialog).
- **Verification**: `yarn lint`, `yarn typecheck`, `yarn test` (16 test files, 229 tests), and `yarn build` all passed.
