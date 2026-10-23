# Milestone M3.3 — Status Symbols, Tooltips, Highlights: Implementation Log

Subagent implementation updates for Milestone M3.3 are recorded below.

---

## M3.3-Docs-Author

- **`docs/concepts.md`**: Updated §8 (Status and Symbol Reference) with the exact in-app tooltip strings from `REASON_MESSAGES` (`src/core/status.ts`) for all 8 `Reason`s plus `ok`, their `Kind` (`error`, `warning`, `unknown`, `ok`), distinct visual symbols (`✓`, amber `⚠`, red `⚠!`, `?`), trigger conditions, active-environment priority aggregation, row tints, per-cell status rings, and dual dependency/dependent highlighting (`DEPENDENCY_UNAVAILABLE` + `NEEDED_BUT_UNAVAILABLE`).
- **`docs/user-guide.md`**: Added §9 ("Status Symbols, Tooltips & Visual Highlights") and updated §3 and §5 to explain the left status column, hover/keyboard-focus tooltips, row tints, per-environment cell rings (Client, Server, or both), dual dependency highlighting, and inactive environment exclusion while strictly enforcing §3 Glossary (`Environment` and `Platform`).

## M3.3-UI-Engineer

- **`src/ui/components/StatusSymbol.tsx` & `src/ui/components/EntryTables.tsx` & `src/ui/App.tsx` & `src/ui/styles.css`**:
  - Wired active-environment status computation (`computeEntryStatus(instance, activeEnvironmentIds)`), suppressing status symbols, row tints, and cell rings when neither environment is active and scoping status to active environments only (§7.3.1).
  - Added the thin unnamed left status column (`col-status`) and `<StatusSymbol />` rendering keyboard-focusable `<button>` symbols with distinct shapes, glyphs, non-color labels, `aria-label`, and `aria-describedby` linked to `role="tooltip"` (`formatRowStatusTooltip(entryStatus)`): `ok` (green `✓`), `warning` (amber `⚠`), `error` (red `⚠!`), and `unknown` (purple `?`).
  - Applied row-wide tints (`row-tint-error`, `row-tint-warning`, `row-tint-unknown`) and per-environment cell rings (`env-cell-ring-error`, `env-cell-ring-warning`, `env-cell-ring-unknown`) including on `unsupported` (`✗`) cells flagged with `NEEDED_BUT_UNAVAILABLE` for dual dependency/dependent highlighting (§7.4, §7.5).
- **`tests/ui/m3-3-status.test.tsx` & `tests/ui/m3-1-tables.test.tsx`**:
  - Added comprehensive Testing Library + `axe-core` tests asserting environment toggle gating, single-environment vs multi-environment ring/tooltip behavior, all 8 `Reason`s and 4 `Kind`s, dual dependency highlighting, keyboard focus + `aria-describedby` tooltip linkage, and `0` `axe-core` accessibility violations.
- **Verification**: `yarn lint`, `yarn typecheck`, `yarn test` (17 test files, 233 tests), and `yarn build` all passed.
