# Milestone M3.3 — Status Symbols, Tooltips, Highlights: Commit Log

## Commit Message (`/generate-pr-description` Format)

```markdown
# Implement Milestone M3.3 status symbols, accessible tooltips, row tints, and per-cell status rings

## Overview
✨ Implements Milestone M3.3 (Status symbols, tooltips, highlights) of `modrinth-collection-downloader`, adding the left status column, distinct accessible status symbols (`✓`, amber `⚠`, red `⚠!`, `?`) with WCAG 2.1 SC 1.4.13 tooltips, row-wide tints, per-environment cell rings, dual dependency/dependent highlighting, value-based `React.memo` comparators, and automated `axe-core` accessibility verification.

## Highlights
✨ Built `<StatusSymbol />` (`src/ui/components/StatusSymbol.tsx`) and integrated active-environment status computation (`computeEntryStatus`) into `<EntryTables />` (`src/ui/components/EntryTables.tsx`) and `<App />` (`src/ui/App.tsx`), rendering distinct shape+color symbols with `aria-label`, `aria-describedby` `role="tooltip"` explanations (`formatRowStatusTooltip`), `Escape` dismissal, and hover-bridge support.
✨ Added row-wide status tints (`.row-tint-error`, `.row-tint-warning`, `.row-tint-unknown`), per-environment cell rings (`.env-cell-ring-error`, `.env-cell-ring-warning`, `.env-cell-ring-unknown`), dual dependency/dependent highlighting (`DEPENDENCY_UNAVAILABLE` + `NEEDED_BUT_UNAVAILABLE` even on `unsupported` `✗` cells), and value-based `React.memo` comparators (`areEnvCellPropsEqual`, `areEntryRowPropsEqual`) with stable `App` callbacks.
✨ Synchronized the status and tooltip reference tables in `docs/concepts.md` and `docs/user-guide.md` word-for-word with `REASON_MESSAGES` in `src/core/status.ts` and added `tests/ui/m3-3-status.test.tsx` verifying all 8 `Reason`s, 4 `Kind`s, active-environment gating, mixed cell severities, and `0` `axe-core` accessibility violations (233 total tests passing across 17 test suites).

<details>
<summary><b>Changelog</b></summary>

### Implementation Changes
- **`src/ui/components/StatusSymbol.tsx`**: Added accessible keyboard-focusable status symbol `<button>` component with distinct shape and glyph variants (`✓` OK circle, `⚠` Warning triangle, `⚠!` Error triangle with exclamation badge, `?` Unknown circle), `aria-describedby` tooltip (`formatRowStatusTooltip`), and `Escape` dismissal.
- **`src/ui/components/EntryTables.tsx`**: Added the thin unnamed left status column (`col-status`), row-wide status tints, per-cell status rings (`formatCellStatusTooltip` on `title`), dual highlighting on `unsupported` (`✗`) cells when `NEEDED_BUT_UNAVAILABLE` applies, and value-based `areEnvCellPropsEqual` and `areEntryRowPropsEqual` `React.memo` comparators.
- **`src/ui/App.tsx` & `src/ui/styles.css`**: Wired `computeEntryStatus(instance, activeEnvironmentIds)`, stabilized selection and version callbacks via `instanceRef`, and added CSS rules for status symbols, hover/focus tooltips (`.status-tooltip::before` bridge and top/bottom row anchoring), row tints, and cell rings.
- **`docs/concepts.md` & `docs/user-guide.md`**: Documented all 8 `Reason`s, their exact in-app tooltip strings, symbols, row tints, per-cell rings, and dual dependency/dependent highlighting.

### Test Changes
- **`package.json` & `tests/ui/m3-3-status.test.tsx`**: Installed `axe-core` and added comprehensive UI + accessibility tests verifying environment-toggle status gating, all 8 `Reason`s and 4 `Kind`s (including isolated `REQUIRED_DEPENDENCY_NOT_SELECTED` and mixed Client warning + Server error severities), dual dependency highlighting, keyboard focus + `Escape` tooltip dismissal, standalone component branches, and `0` `axe-core` violations.
- **`tests/ui/m3-1-tables.test.tsx`**: Updated column index assertions for the 5-column table layout.

</details>
```
