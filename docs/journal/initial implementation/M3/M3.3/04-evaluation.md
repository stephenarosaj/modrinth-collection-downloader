# Milestone M3.3 — Status Symbols, Tooltips, Highlights: Finding Evaluations

Independent subagent evaluations of the 9 code review findings (`F-01` through `F-09`) from `03-code-review.md`.

---

## Batch 1 Evaluations (`F-01` – `F-03`) — `M3.3-Evaluator-1`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-01` | `P2` | **ACCEPT** | Stabilize selection/version callbacks in `src/ui/App.tsx` via `instanceRef` and add value-based `arePropsEqual` comparators to `EnvironmentCell` and `EntryTableRow` in `src/ui/components/EntryTables.tsx`. |
| `F-02` | `P2` | **ACCEPT** | Add `Escape` dismissal (`isDismissed` / `.status-tooltip-dismissed`) and hoverable `::before` gap bridge to `StatusSymbol.tsx` and `src/ui/styles.css` per WCAG 2.1 SC 1.4.13. |
| `F-03` | `P2` | **ACCEPT** | Shorten `StatusSymbol` button `aria-label` to `${projectTitle} status: ${meta.kindLabel}` and remove the redundant inner `.sr-only` span so `aria-describedby` announces `tooltipText` once. |

---

## Batch 2 Evaluations (`F-04` – `F-06`) — `M3.3-Evaluator-2`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-04` | `P2` | **ACCEPT** | Anchor `.status-tooltip` on top/bottom rows in `src/ui/styles.css` so multi-line tooltips do not clip or trigger vertical scrollbars inside `.table-wrapper`. |
| `F-05` | `P2` | **ACCEPT** | Add UI test assertion in `tests/ui/m3-3-status.test.tsx` verifying a row where Client has `warning` (`env-cell-ring-warning`) and Server has `error` (`env-cell-ring-error`) simultaneously. |
| `F-06` | `P2` | **ACCEPT** | Set `dep-selectable` (`Core Lib`) client support to `'optional'` in `tests/ui/m3-3-status.test.tsx` so `REQUIRED_DEPENDENCY_NOT_SELECTED` is tested in isolation from `REQUIRED_NOT_SELECTED`. |

---

## Batch 3 Evaluations (`F-07` – `F-09`) — `M3.3-Evaluator-3`

| Finding | Priority | Verdict | Summary |
|---|---|---|---|
| `F-07` | `P3` | **ACCEPT** | Update `docs/user-guide.md:226` to state that each status badge is a native `<button type="button">` rather than referencing `tabIndex={0}`. |
| `F-08` | `P3` | **ACCEPT** | Extend standalone tests in `tests/ui/m3-3-status.test.tsx` to cover `<EntryTables tables={standaloneTables} instance={resolved.instance} />`, `<EntryTables tables={[]} />`, and `<StatusSymbol entryStatus={{ client: null, server: null, row: null }} />`. |
| `F-09` | `P3` | **ACCEPT** | Remove the three redundant child `<span className="sr-only">{cellTooltip}</span>` elements in `EnvironmentCell` (`src/ui/components/EntryTables.tsx`) while keeping `title={cellTooltip}` on the `<td>`. |
