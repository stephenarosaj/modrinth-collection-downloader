# Milestone M3.3 — Multi-Agent Code Review Report (`03-code-review.md`)

## Code Review Results

**Scope:** `HEAD` (`a7172dd`) -> working tree (`12` changed files, `867` executable lines across `src/ui/components/StatusSymbol.tsx`, `src/ui/components/EntryTables.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`, `tests/ui/m3-3-status.test.tsx`, `tests/ui/m3-1-tables.test.tsx`, `docs/concepts.md`, `docs/user-guide.md`)
**Intent:** Implement Milestone M3.3 (Status symbols, tooltips, highlights) for `modrinth-collection-downloader`: thin unnamed left status column, distinct symbols and keyboard-focusable tooltips for all 8 status `Reason`s and 4 `Kind`s, row-wide tint, per-cell status rings, dual dependency/dependent highlighting, accessibility (`aria-label`, `aria-describedby`, `role="tooltip"`, non-color signals, `axe-core` check), and documentation updates (`docs/concepts.md`, `docs/user-guide.md`).
**Mode:** markdown report-only (`apply=false`)

**Reviewers:** `correctness`, `maintainability`, `testing`, `adversarial`
- `maintainability` -- structural quality, plan & architectural boundary compliance (§3 glossary, §5.1 imports, §7.3.1, §7.4, §7.5, §12, §13 M3.3), and documentation consistency (`docs/concepts.md` & `docs/user-guide.md` vs `src/core/status.ts` & `StatusSymbol.tsx`)
- `testing` -- UI test coverage and assertion quality in `tests/ui/m3-3-status.test.tsx` and `tests/ui/m3-1-tables.test.tsx`
- `adversarial` -- cross-component composition, CSS/layout overflow interactions, WCAG 2.1 SC 1.4.13 behavior, and `axe-core` verification fidelity (`exec_lines: 867 >= 50`)

### Triage Groups

| Group | Findings | Context | Preferred Resolution | Why |
|-------|----------|---------|----------------------|-----|
| StatusSymbol Accessibility & WCAG 1.4.13 (`apply-queue`) | #2 (`F-02`), #3 (`F-03`), #4 (`F-04`) | `StatusSymbol.tsx` and `.status-tooltip` CSS share accessible naming/description wiring and tooltip hover/focus/overflow behavior | Fix `aria-label` / `.sr-only` duplication first (`F-03`), add `Escape` dismissal + hover bridge (`F-02`), and guard top-row tooltip overflow (`F-04`) | Resolves all screen-reader duplication and WCAG 1.4.13 tooltip issues in one component pass |
| UI Test Coverage & Isolation (`apply-queue`) | #5 (`F-05`), #6 (`F-06`), #8 (`F-08`) | `tests/ui/m3-3-status.test.tsx` tests all 8 reasons and 4 kinds but conflates two warning reasons on `dep-selectable` and omits mixed-severity row and standalone fallback assertions | Update `dep-selectable` client support to `'optional'` (`F-06`), add mixed Client-warning + Server-error assertion (`F-05`), and cover standalone `EntryTables`/`StatusSymbol` branches (`F-08`) | Achieves 100% isolated reason verification and branch coverage in a single test file update |
| Row & Cell Memoization (`apply-queue`) | #1 (`F-01`) | `EntryTableRow` and `EnvironmentCell` use default `React.memo`, which never bails out when `toTables` and `computeEntryStatus` allocate fresh wrapper objects | Add custom `arePropsEqual` comparators on `EntryTableRow` and `EnvironmentCell` (`F-01`) | Preserves §7.5 `>=500` row responsiveness during selection toggles |

### P2 -- Moderate

| # | ID | File | Issue | Reviewer | Confidence |
|---|----|------|-------|----------|------------|
| 1 | `F-01` | `src/ui/components/EntryTables.tsx:289` | `React.memo` on `EntryTableRow` and `EnvironmentCell` never bails out on selection mutations due to newly allocated row and status objects | correctness | 100 |
| 2 | `F-02` | `src/ui/components/StatusSymbol.tsx:55` | Status tooltip cannot be dismissed with `Escape` and disappears when pointer moves over tooltip (WCAG 2.1 SC 1.4.13) | correctness, adversarial | 100 |
| 3 | `F-03` | `src/ui/components/StatusSymbol.tsx:62` | Duplicate screen-reader announcement on `StatusSymbol` button from repeating `tooltipText` in `aria-label` and `aria-describedby` | correctness, adversarial, maintainability | 100 |
| 4 | `F-04` | `src/ui/styles.css:771` | Vertically centered `.status-tooltip` can clip or trigger vertical scrollbars inside `.table-wrapper` with `overflow-x: auto` | adversarial, correctness | 100 |
| 5 | `F-05` | `tests/ui/m3-3-status.test.tsx:393` | No UI test verifies mixed non-OK cell severities on the same row (e.g., `warning` on Client + `error` on Server) | testing | 100 |
| 6 | `F-06` | `tests/ui/m3-3-status.test.tsx:505` | `REQUIRED_DEPENDENCY_NOT_SELECTED` is never tested in isolation from `REQUIRED_NOT_SELECTED` | testing | 100 |

- **#1 (`F-01`)** — **Problem:** `EntryTableRow` (`src/ui/components/EntryTables.tsx:289`) and `EnvironmentCell` (`src/ui/components/EntryTables.tsx:149`) are wrapped in `memo(...)` with default shallow prop equality (`Object.is`) to satisfy §7.5 responsiveness (`>=500` rows). However, every selection toggle in `App.tsx` calls `toTables(instance)` and `computeEntryStatus(instance, activeEnvironmentIds)`, which allocate brand-new `TableRow`, `EntryStatus`, and per-cell `Status` objects for every entry—even when an entry's `Entry` reference, `requiredByTitles`, and computed status did not change. Consequently, `React.memo` never bails out for unchanged rows or cells.
  **Proposed Fix:** Provide custom `arePropsEqual` comparators for `EntryTableRow` and `EnvironmentCell` that compare `row.entry` reference (`prev.row.entry === next.row.entry`), `requiredByTitles` arrays, `activeEnvironments.client` / `activeEnvironments.server`, `clientFlashing` / `serverFlashing`, `isRecomputing`, handler references, and value-compare `EntryStatus` / `Status` (`kind` and `reasons` elements).

- **#2 (`F-02`)** — **Problem:** In `src/ui/components/StatusSymbol.tsx:55-74` and `src/ui/styles.css:771-803`, tooltip visibility is driven purely by CSS `:hover` / `:focus-within` with `pointer-events: none` (`src/ui/styles.css:790`) and an 8px gap (`left: calc(100% + 8px)`). Pressing `Escape` while a `.status-symbol` button is focused or hovered does not dismiss the tooltip (which overlaps the adjacent Name cell), and moving the mouse cursor from the 26px button onto the tooltip loses `:hover` and hides the tooltip, violating WCAG 2.1 SC 1.4.13 (Content on Hover or Focus: Dismissible & Hoverable).
  **Proposed Fix:** Add `isDismissed` state in `StatusSymbol` that sets `true` on `Escape` `onKeyDown` and resets on `onBlur` / `onMouseLeave` / `onFocus` / `onMouseEnter`, applying a `.status-tooltip-dismissed` class (`opacity: 0; visibility: hidden`). Remove `pointer-events: none` from `.status-tooltip` and add a transparent `::before` bridge across the 8px gap (`left: -8px; width: 8px; top: 0; bottom: 0`) so pointer users can hover over the tooltip text without losing hover state.

- **#3 (`F-03`)** — **Problem:** `StatusSymbol` (`src/ui/components/StatusSymbol.tsx:62-73`) sets `aria-label={`${projectTitle} status: ${meta.kindLabel}. ${tooltipText}`}` on the `<button>`, includes `<span className="sr-only">{meta.kindLabel}</span>` inside the button, and also links `<span id={tooltipId} role="tooltip">{tooltipText}</span>` via `aria-describedby={tooltipId}`. Per W3C Accessible Name and Description Computation (AccName 1.2), screen readers announce both `aria-label` (accessible name) and `aria-describedby` (accessible description), reading `tooltipText` twice back-to-back, while the inner `.sr-only` span is dead markup shadowed by `aria-label`.
  **Proposed Fix:** Set `aria-label={`${projectTitle} status: ${meta.kindLabel}`}` on the `<button>`, remove the redundant `<span className="sr-only">{meta.kindLabel}</span>` child, and let `aria-describedby={tooltipId}` provide `tooltipText` once as the accessible description.

- **#4 (`F-04`)** — **Problem:** `.table-wrapper` sets `overflow-x: auto` (`src/ui/styles.css:347`), which per CSS Overflow Level 3 causes `overflow-y` to compute to `auto`. Because `.status-tooltip` uses `position: absolute; top: 50%; transform: translateY(-50%)` (`src/ui/styles.css:771-775`), a multi-line tooltip on the first or last row of a compact table can extend above or below `.table-wrapper`, clipping the top of the tooltip or triggering a vertical scrollbar on the table wrapper.
  **Proposed Fix:** Anchor `.status-tooltip` on top rows so it does not extend above the header/wrapper boundary (e.g., `top: 0; transform: none;` on `tbody tr:first-child .status-tooltip` or add sufficient vertical padding/headroom inside `.table-wrapper`).

- **#5 (`F-05`)** — **Problem:** In `tests/ui/m3-3-status.test.tsx`, every tested row with a non-`ok` cell status either has the other environment `ok`/`unsupported` or has the exact same `Kind` in both environments. No test verifies a row where active Client and Server cells simultaneously have *different* non-`ok` status kinds (e.g., `warning` on Client and `error` on Server), so a bug where `EnvironmentCell` used `rowStatus.kind` instead of `cellStatus.kind` for its ring class would go undetected.
  **Proposed Fix:** In `tests/ui/m3-3-status.test.tsx`, add a test step (e.g., deselecting `Server Bridged Mod` on Client while Server remains selected) verifying that the row has `data-row-status="error"` and `row-tint-error`, the Client cell has `data-cell-status="warning"` and `env-cell-ring-warning` (`REQUIRED_NOT_SELECTED`), the Server cell has `data-cell-status="error"` and `env-cell-ring-error` (`DEPENDENCY_UNAVAILABLE`), and the row tooltip lists both the Client warning and Server error lines.

- **#6 (`F-06`)** — **Problem:** In `tests/ui/m3-3-status.test.tsx:98-104`, `dep-selectable` (`Core Lib`) is configured with `support: { client: 'required', server: 'required' }`. When the test unchecks `Core Lib` on Client (`tests/ui/m3-3-status.test.tsx:497`), it triggers both `REQUIRED_NOT_SELECTED` and `REQUIRED_DEPENDENCY_NOT_SELECTED` simultaneously (`data-status-reasons="REQUIRED_NOT_SELECTED,REQUIRED_DEPENDENCY_NOT_SELECTED"`). Because `REQUIRED_NOT_SELECTED` is also a `warning`, `REQUIRED_DEPENDENCY_NOT_SELECTED` is never verified in isolation in the UI test suite.
  **Proposed Fix:** Configure `dep-selectable` in `tests/ui/m3-3-status.test.tsx` with `support: { client: 'optional', server: 'required' }` so unchecking `Core Lib` on Client triggers only `REQUIRED_DEPENDENCY_NOT_SELECTED`, and assert `data-status-reasons="REQUIRED_DEPENDENCY_NOT_SELECTED"` and its isolated tooltip text.

### P3 -- Low

| # | ID | File | Issue | Reviewer | Confidence |
|---|----|------|-------|----------|------------|
| 7 | `F-07` | `docs/user-guide.md:226` | User guide documents `tabIndex={0}` instead of native `<button type="button">` for status badges | maintainability | 100 |
| 8 | `F-08` | `src/ui/components/EntryTables.tsx:410` | Fallback status computation branches in `EntryTables` and null-row guard in `StatusSymbol` are untested | testing | 100 |
| 9 | `F-09` | `src/ui/components/EntryTables.tsx:186` | `EnvironmentCell` sets both `title={cellTooltip}` on `<td>` and an inline `.sr-only` span with identical text | adversarial | 75 |

- **#7 (`F-07`)** — **Problem:** `docs/user-guide.md:226` states that status badges in the left column are keyboard-focusable via `tabIndex={0}`, whereas `StatusSymbol.tsx:56` renders a native `<button type="button">` element without a `tabIndex` attribute.
  **Proposed Fix:** Update `docs/user-guide.md:226` to state that each status badge is a native keyboard-focusable button (`<button type="button">`) rather than referencing `tabIndex={0}`.

- **#8 (`F-08`)** — **Problem:** In `src/ui/components/EntryTables.tsx:410-415` and `src/ui/components/StatusSymbol.tsx:45-47`, the standalone `if (instance)` branch, the `if (tables.length === 0)` status map branch, and `StatusSymbol`'s `if (!rowStatus) return null;` guard are not executed by existing UI tests.
  **Proposed Fix:** Extend the standalone component test in `tests/ui/m3-3-status.test.tsx` to also render `<EntryTables tables={standaloneTables} instance={resolved.instance} activeEnvironments={{ client: true, server: false }} />`, `<EntryTables tables={[]} />`, and `<StatusSymbol projectId="p1" projectTitle="P1" entryStatus={{ client: null, server: null, row: null }} />`.

- **#9 (`F-09`)** — **Problem:** In `src/ui/components/EntryTables.tsx:186,191,204,210,227,271`, `EnvironmentCell` sets `title={cellTooltip}` on the `<td>` element AND renders `<span className="sr-only">{cellTooltip}</span>` inside the cell, causing screen readers that expose table cell `title` attributes to announce the cell status reason twice.
  **Proposed Fix:** Either keep `title={cellTooltip}` on the `<td>` without duplicating it in a child `.sr-only` span, or keep `.sr-only` for assistive tech and avoid redundant `title` announcement.

### Requirements Completeness

Verified against `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` (§3 Glossary, §5.1 Import Rules, §7.3.1 Environment Toggles, §7.4 Status, §7.5 Review UI, §12 Documentation, §13 M3.3 Acceptance Criteria):

- **§3 Glossary ("environment" never "side", "platform" never "loader"):** Met across all M3.3 UI components, tests, and documentation.
- **§5.1 Import boundaries (`ui` imports `core` and `ports` only):** Met (`StatusSymbol.tsx`, `EntryTables.tsx`, `App.tsx` import only `core` and `ports`).
- **§7.3.1 Environment toggles gate status & highlighting:** Met (`activeEnvironmentIds` passed to `computeEntryStatus`; inactive environments render no symbols, tints, or cell rings).
- **§7.4 & §7.5 Left status column, symbols/shapes/colors, tooltips, row tints, per-cell rings, dual dependency highlighting:** Met (with minor accessibility/test polish noted in `F-01`..`F-09`).
- **§12 & §13 M3.3 `docs/concepts.md` and `docs/user-guide.md` match in-app tooltips & `axe-core` passes:** Met (`docs/concepts.md` matches `REASON_MESSAGES` in `src/core/status.ts` verbatim; one minor `tabIndex={0}` wording mismatch in `docs/user-guide.md` flagged as `F-07`).

### Actionable Findings

| # | ID | File | Issue | Route | Notes |
|---|----|------|-------|-------|-------|
| 1 | `F-01` | `src/ui/components/EntryTables.tsx:289` | `React.memo` on `EntryTableRow` and `EnvironmentCell` never bails out on selection mutations | `manual -> downstream-resolver` | Add `arePropsEqual` comparators for row and cell memoization |
| 2 | `F-02` | `src/ui/components/StatusSymbol.tsx:55` | Status tooltip cannot be dismissed with `Escape` and disappears when hovered (WCAG 1.4.13) | `manual -> downstream-resolver` | Add `Escape` key handler and hover bridge across 8px gap |
| 3 | `F-03` | `src/ui/components/StatusSymbol.tsx:62` | Duplicate screen-reader announcement on `StatusSymbol` button (`aria-label` + `aria-describedby` + `.sr-only`) | `gated_auto -> downstream-resolver` | Keep `aria-label` concise and remove redundant `.sr-only` span |
| 4 | `F-04` | `src/ui/styles.css:771` | Vertically centered `.status-tooltip` can clip or trigger vertical scrollbars inside `.table-wrapper` | `gated_auto -> downstream-resolver` | Anchor top-row tooltips downward or add vertical headroom |
| 5 | `F-05` | `tests/ui/m3-3-status.test.tsx:393` | No UI test verifies mixed non-OK cell severities on the same row (`warning` + `error`) | `gated_auto -> downstream-resolver` | Add mixed Client-warning + Server-error assertion |
| 6 | `F-06` | `tests/ui/m3-3-status.test.tsx:505` | `REQUIRED_DEPENDENCY_NOT_SELECTED` is never tested in isolation from `REQUIRED_NOT_SELECTED` | `gated_auto -> downstream-resolver` | Set `dep-selectable` client support to `'optional'` in test fixture |
| 7 | `F-07` | `docs/user-guide.md:226` | User guide documents `tabIndex={0}` instead of native `<button type="button">` | `gated_auto -> downstream-resolver` | Update `docs/user-guide.md` line 226 |
| 8 | `F-08` | `src/ui/components/EntryTables.tsx:410` | Fallback status computation branches in `EntryTables` and null-row guard in `StatusSymbol` are untested | `gated_auto -> downstream-resolver` | Extend standalone component test in `tests/ui/m3-3-status.test.tsx` |
| 9 | `F-09` | `src/ui/components/EntryTables.tsx:186` | `EnvironmentCell` sets both `title={cellTooltip}` on `<td>` and an inline `.sr-only` span | `gated_auto -> downstream-resolver` | Avoid duplicate accessible cell description |

### Coverage

- **Suppressed:** 0 findings below anchor 75
- **Multi-reviewer corroboration:** 3 findings (`F-02`, `F-03`, `F-04`) independently corroborated across 2-3 specialist reviewers (`correctness`, `adversarial`, `maintainability`) with verbatim quote-the-line evidence
- **Settlement suppression:** Honored authoritatively against `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` (0 settlement conflicts)
- **Residual risks:**
  - `tests/ui/m3-3-status.test.tsx` runs `axe.run` in `jsdom` with `color-contrast` disabled because `jsdom` does not compute layout or painted backgrounds; actual color contrast and CSS visibility states are verified by stylesheet inspection rather than browser rendering.
- **Testing gaps:**
  - Covered by actionable findings `F-05`, `F-06`, and `F-08` (plus `Escape` tooltip dismissal and memoization bailout tests once `F-01` and `F-02` are applied).
- **Failed/timed-out reviewers:** 0 (all 4 specialist subagents completed cleanly)

---

> **Verdict:** Ready with fixes
>
> **Reasoning:** Milestone M3.3 meets all core architectural and behavioral specifications in `IMPLEMENTATION_PLAN_v1.MD` (§3, §5.1, §7.3.1, §7.4, §7.5, §12, §13 M3.3) with zero P0 or P1 blockers. Addressing the P2 accessibility (`F-02`, `F-03`, `F-04`), memoization (`F-01`), and isolated test coverage (`F-05`, `F-06`) findings along with the P3 polish items (`F-07`, `F-08`, `F-09`) will make the M3.3 implementation airtight.
>
> **Fix order:** `F-03` (`StatusSymbol` accessible name/description dedup) -> `F-02` (WCAG 1.4.13 `Escape` dismissal & hoverable tooltip) -> `F-04` (`.status-tooltip` overflow alignment) -> `F-01` (`EntryTableRow`/`EnvironmentCell` `React.memo` comparators) -> `F-06`, `F-05`, `F-08` (`tests/ui/m3-3-status.test.tsx` coverage) -> `F-09` (`EnvironmentCell` tooltip dedup) -> `F-07` (`docs/user-guide.md` `tabIndex` wording)
