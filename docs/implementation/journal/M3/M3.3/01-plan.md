# Milestone M3.3 — Status Symbols, Tooltips, Highlights: Work Plan

## Goal
Implement Milestone M3.3 (`IMPLEMENTATION_PLAN_v1.MD` §7.3.1, §7.4, §7.5, §12, §13 M3.3):
- Thin unnamed left status column (`col-status`, visually unnamed header with screen-reader label) displaying the row's status symbol across active environments (`computeEntryStatus(instance, activeEnvironmentIds)`).
- Inactive environment gating (§7.3.1): when neither environment is active, rows show no status symbol, no row tint, and no cell ring; when only one environment is active, only that environment's cell status contributes to the row status, tooltip, row tint, and cell ring.
- Distinct shapes + colors + non-color signals for every status `Kind`:
  - `ok`: green `✓`
  - `warning`: amber `⚠` (triangle)
  - `error`: red `⚠` (triangle with exclamation / distinct error badge shape)
  - `unknown`: purple `?` (circle)
- Keyboard-focusable status symbols (`tabIndex={0}` / button, `aria-label`, `aria-describedby` tooltip) explaining every active-environment `Reason` via `formatRowStatusTooltip(entryStatus)` (and per-cell status explanation).
- Row-wide tint (`row-status-error`, `row-status-warning`, `row-status-unknown`) and per-cell ring (`env-cell-ring-error`, `env-cell-ring-warning`, `env-cell-ring-unknown`) around each active environment cell whose own status is not `ok`.
- Dependency/dependent dual highlighting (`DEPENDENCY_UNAVAILABLE` on the selected dependent entry + `NEEDED_BUT_UNAVAILABLE` on the unavailable dependency entry, even when the dependency cell is `unsupported` or `version === null`).
- Documentation synchronization: ensure the status/symbol/reason reference table in `docs/concepts.md` and `docs/user-guide.md` matches the in-app tooltip strings word-for-word.
- Automated `axe-core` accessibility audit on the rendered review screen in `tests/ui/m3-3-status.test.tsx`.

## Subagent Partitioning (Disjoint File Ownership)

1. **`M3.3-UI-Engineer`**:
   - `src/ui/components/StatusSymbol.tsx` (new)
   - `src/ui/components/EntryTables.tsx`
   - `src/ui/App.tsx`
   - `src/ui/styles.css`
   - `tests/ui/m3-3-status.test.tsx` (new)
   - `tests/ui/m3-1-tables.test.tsx`
   - `tests/ui/m3-2-selection.test.tsx`

2. **`M3.3-Docs-Author`**:
   - `docs/concepts.md`
   - `docs/user-guide.md`
