# Milestone M3.3 — Status Symbols, Tooltips, Highlights: Fixes Log

Fixer subagent updates for Milestone M3.3 accepted findings (`F-01` through `F-09`).

---

## M3.3-Fixer-1 (`F-01`, `F-02`, `F-03`, `F-04`, `F-09`)

- **`src/ui/App.tsx` & `src/ui/components/EntryTables.tsx` (`F-01`, `F-09`)**:
  - Stabilized `handleToggleEntrySelection`, `handleToggleSelectAll`, and `handleChangeEntryVersion` in `src/ui/App.tsx` via `instanceRef` and added value-based `areEnvCellPropsEqual` and `areEntryRowPropsEqual` comparators to `memo(EnvironmentCell)` and `memo(EntryTableRow)` in `src/ui/components/EntryTables.tsx` (`F-01`).
  - Removed the three redundant child `<span className="sr-only">{cellTooltip}</span>` elements in `EnvironmentCell` while keeping `title={cellTooltip}` on `<td>` (`F-09`).
- **`src/ui/components/StatusSymbol.tsx` & `src/ui/styles.css` (`F-02`, `F-03`, `F-04`)**:
  - Added `isDismissed` state (`Escape` key dismissal and reset on focus/blur/mouseEnter/mouseLeave), `.status-tooltip-dismissed` class, `.status-tooltip::before` 8px hover bridge, and `pointer-events: auto` when visible (`F-02`).
  - Shortened button `aria-label` to `${projectTitle} status: ${meta.kindLabel}` and removed the redundant inner `.sr-only` span so `aria-describedby` announces `tooltipText` once (`F-03`).
  - Anchored `.status-tooltip` on top/bottom rows so multi-line tooltips do not clip or trigger vertical scrollbars inside `.table-wrapper` (`F-04`).

## M3.3-Fixer-2 (`F-02`, `F-05`, `F-06`, `F-07`, `F-08`)

- **`docs/user-guide.md` (`F-07`)**: Updated line 226 to document that status badges are native `<button type="button">` elements rather than referencing `tabIndex={0}`.
- **`tests/ui/m3-3-status.test.tsx` (`F-02`, `F-05`, `F-06`, `F-08`)**:
  - Updated `dep-selectable` (`Core Lib`) client support to `'optional'` so `REQUIRED_DEPENDENCY_NOT_SELECTED` is tested in isolation (`F-06`).
  - Added mixed non-OK cell severity assertions (`warning` ring on Client + `error` ring on Server + `error` worst-status row tint/symbol) (`F-05`).
  - Added `Escape` tooltip dismissal and blur/focus reset assertions (`F-02`).
  - Extended standalone `<EntryTables />` and `<StatusSymbol />` branch coverage (`if (instance)`, `if (tables.length === 0)`, and `if (!rowStatus) return null;`) (`F-08`).
