# Milestone M3.3 — Status Symbols, Tooltips, Highlights: Verification Log

Verification subagent reports for Milestone M3.3 fixer batches.

---

## M3.3-Verifier-1 (`M3.3-Fixer-1` Verification)

- **Overall Verdict**: `VERIFIED`
- **`F-01` (`P2`)**: `VERIFIED` — `App.tsx` stabilizes selection and version callbacks via `instanceRef`, and `EntryTables.tsx` wraps `EnvironmentCell` and `EntryTableRow` with value-based `areEnvCellPropsEqual` and `areEntryRowPropsEqual` comparators.
- **`F-02` (`P2`)**: `VERIFIED` — `StatusSymbol.tsx` and `src/ui/styles.css` implement `Escape` dismissal (`isDismissed` / `.status-tooltip-dismissed`), `.status-tooltip::before` 8px hover bridge, and `pointer-events: auto` when visible per WCAG 2.1 SC 1.4.13.
- **`F-03` (`P2`)**: `VERIFIED` — `StatusSymbol` sets `aria-label={`${projectTitle} status: ${meta.kindLabel}`}`, links the tooltip via `aria-describedby`, and removes the redundant inner `.sr-only` span.
- **`F-04` (`P2`)**: `VERIFIED` — `src/ui/styles.css` anchors `.status-tooltip` on first/last rows so multi-line tooltips do not clip or trigger vertical scrollbars inside `.table-wrapper`.
- **`F-09` (`P3`)**: `VERIFIED` — `EnvironmentCell` in `src/ui/components/EntryTables.tsx` keeps `title={cellTooltip}` on `<td>` and removes the three duplicate child `<span className="sr-only">{cellTooltip}</span>` spans.

## M3.3-Verifier-2 (`M3.3-Fixer-2` Verification)

- **Overall Verdict**: `VERIFIED`
- **`F-02` (`P2` — test coverage)**: `VERIFIED` — `tests/ui/m3-3-status.test.tsx` tests `Escape` dismissal (`status-tooltip-dismissed`) and `blur`/`focus` reset on `.status-symbol` buttons.
- **`F-05` (`P2`)**: `VERIFIED` — `tests/ui/m3-3-status.test.tsx` verifies mixed non-OK cell severities on the same row (`warning` ring on Client + `error` ring on Server + `error` row tint/symbol and multi-environment tooltip).
- **`F-06` (`P2`)**: `VERIFIED` — `dep-selectable` (`Core Lib`) has `support: { client: 'optional', server: 'required' }`, verifying `REQUIRED_DEPENDENCY_NOT_SELECTED` in isolation from `REQUIRED_NOT_SELECTED`.
- **`F-07` (`P3`)**: `VERIFIED` — `docs/user-guide.md:226` documents that status badges are native `<button type="button">` elements.
- **`F-08` (`P3`)**: `VERIFIED` — `tests/ui/m3-3-status.test.tsx` exercises standalone `<EntryTables tables={standaloneTables} instance={resolved.instance} />`, `<EntryTables tables={[]} />`, and `<StatusSymbol entryStatus={{ client: null, server: null, row: null }} />`.
- **Full Check Suite**: `yarn lint`, `yarn typecheck`, `yarn test` (17 test files, 233 tests), and `yarn build` all passed.
