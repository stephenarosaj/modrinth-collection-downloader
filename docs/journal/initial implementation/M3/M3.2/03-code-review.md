# Milestone M3.2 — Code Review Report

**Scope:** `HEAD` (`37a5b34`) -> working tree (`12` files changed, `1,723` insertions, `70` deletions)  
**Intent:** Implement Milestone M3.2 (Selection and dependency auto-select) of `modrinth-collection-downloader` per `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` (§3, §5, §7.2, §7.3, §7.3.1, §7.5, §12, §13 M3.2).  
**Mode:** `markdown report-only` (`apply=false`)  
**Reviewers:**
- `correctness` — always-on logic, state transitions, and plan compliance review
- `julik-frontend-races` — async UI version-override lifecycle, timers, and concurrent user interaction review
- `testing` — UI test suite completeness and edge-case coverage (`tests/ui/m3-2-selection.test.tsx`)
- `maintainability` — architecture boundaries (§5.1), domain logic placement (`src/core` vs `src/ui`), and documentation consistency (`docs/user-guide.md`, `docs/concepts.md`)

---

## Triage Groups

| Group | Findings | Context | Preferred Resolution | Why |
|-------|----------|---------|----------------------|-----|
| TargetForm & Re-resolve Lifecycle | F-01, F-02, F-06 | Target changes, `ConfirmReResolveDialog` cancellation, and in-flight version recomputation (`isRecomputing`) share state transitions between `App.tsx` and `TargetForm.tsx`. | Resolve F-01 and F-02 together in `App.tsx` + `TargetForm.tsx` first, then add Escape/focus handling in `ConfirmReResolveDialog.tsx` (F-06). | Passing active collection state and `isRecomputing` into `TargetForm` and clearing `exportError` at the start of `handleChangeEntryVersion` fixes both state races in one pass. |
| Core vs. UI Domain Helpers (`EntryTables.tsx`) | F-03, F-04 | `EntryTables.tsx` duplicates `getHeaderTriState` as `computeFallbackTriState` and defines a local `isCandidateUnverifiedPlatform` helper whose predicate differs from `src/core/resolver.ts`. | Move or align fallback-candidate detection with `src/core` (F-03) and remove `computeFallbackTriState` (F-04). | Keeps domain rules in `src/core` and prevents M3.2 badge logic from diverging from M3.3 `PLATFORM_UNVERIFIED` status rules. |
| M3.2 UI Test & Docs Polish | F-05, F-07, F-08 | `tests/ui/m3-2-selection.test.tsx` and `docs/user-guide.md` omit coverage/descriptions for error recovery in `handleChangeEntryVersion`, toast dismissal, and `auto` / `user off` cell badges. | Add the targeted test assertions in `tests/ui/m3-2-selection.test.tsx` (F-05, F-08) and document the cell badges in `docs/user-guide.md` (F-07). | Ensures 100% of new M3.2 UI branches and visible labels are verified and documented. |

---

## Findings Summary

| ID | Severity | File & Line | Title | Reviewers | Confidence | Route |
|----|----------|-------------|-------|-----------|------------|-------|
| **F-01** | **P2** | `src/ui/components/TargetForm.tsx:131` | `TargetForm` uses unsubmitted `collectionInput` on target changes and leaves `collectionInput` un-reverted on Cancel | `correctness`, `julik-frontend-races` | 100 | `manual -> downstream-resolver` |
| **F-02** | **P2** | `src/ui/App.tsx:288` | `handleChangeEntryVersion` does not clear stale `exportError` or gate `TargetForm` / `Export instance.json` while `isRecomputing` is active | `correctness`, `julik-frontend-races`, `maintainability` | 100 | `gated_auto -> downstream-resolver` |
| **F-03** | **P2** | `src/ui/components/EntryTables.tsx:50` | `isCandidateUnverifiedPlatform` in UI diverges from `src/core/resolver.ts` fallback rule (`platforms.length === 0`) | `maintainability` | 100 | `gated_auto -> downstream-resolver` |
| **F-04** | **P2** | `src/ui/components/EntryTables.tsx:87` | Duplicate header tri-state calculation (`computeFallbackTriState`) in `EntryTables.tsx` duplicates `getHeaderTriState` from `src/core` | `maintainability` | 100 | `gated_auto -> downstream-resolver` |
| **F-05** | **P2** | `src/ui/App.tsx:307` | Untested error and abort-superseding paths in `handleChangeEntryVersion` | `testing` | 100 | `gated_auto -> downstream-resolver` |
| **F-06** | **P3** | `src/ui/components/ConfirmReResolveDialog.tsx:18` | `ConfirmReResolveDialog` lacks `Escape` key handler and initial focus management when opened | `julik-frontend-races` | 100 | `manual -> downstream-resolver` |
| **F-07** | **P3** | `docs/user-guide.md:83` | `docs/user-guide.md` omits the visible `auto` and `user off` selection-source badges rendered in environment cells | `maintainability` | 100 | `gated_auto -> downstream-resolver` |
| **F-08** | **P3** | `tests/ui/m3-2-selection.test.tsx:449` | `AutoSelectToast` dismiss button and `preferStable` revert on `ConfirmReResolveDialog` Cancel are untested | `testing` | 100 | `gated_auto -> downstream-resolver` |

*(No P0 or P1 findings.)*

---

## Detailed Findings

### `F-01` (P2) — `TargetForm` uses unsubmitted `collectionInput` on target changes and leaves `collectionInput` un-reverted on Cancel

- **Location:** [`src/ui/components/TargetForm.tsx:59-65`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/TargetForm.tsx#L59-L65), [`src/ui/components/TargetForm.tsx:131-151`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/TargetForm.tsx#L131-L151), [`src/ui/components/TargetForm.tsx:230-234`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/TargetForm.tsx#L230-L234)
- **Reviewers:** `correctness`, `julik-frontend-races` (Confidence: `100`)
- **Problem:**
  1. When an `Instance` is already loaded (`activeTarget !== null`) and the user edits or clears the `Collection URL or ID` field without clicking **Load collection**:
     - If `collectionInput` is currently empty or invalid and the user changes **Game Version**, **Platform**, or **Prefer stable**, the `onChange` handler mutates local state (`setGameVersion`, `setPlatform`, `setPreferStable`) before `notifyTargetChangeIfLoaded` silently catches the `parseCollectionInput(collectionInput)` error and returns (`lines 139-143`). The form controls now display the new target values while the loaded `Instance` remains on the old target with no re-resolve and no validation feedback.
     - If `collectionInput` was edited to a *different* collection ID that has not been submitted yet, changing **Game Version**, **Platform**, or **Prefer stable** passes the unsubmitted `collectionInput` to `onTargetChange`, silently switching collections without the user clicking **Load collection**.
  2. If the user edits `collectionInput` to a new collection, clicks **Load collection** while `hasSelectionChangedFromDefault(instance)` is `true`, and clicks **Cancel** in `ConfirmReResolveDialog`, the `revertToken` effect (`lines 59-65`) restores `gameVersion`, `platform`, and `preferStable` from `activeTarget` but does not restore `collectionInput` to the loaded instance's collection.
- **Proposed Fix:**
  - Pass `activeCollectionId?: string | null` (e.g. `instance?.meta.source.collectionId ?? null`) alongside `activeTarget` into `TargetForm`.
  - In `notifyTargetChangeIfLoaded`, use `activeCollectionId` (or verify `collectionInput` matches the loaded collection) when firing `onTargetChange` for a loaded instance, and restore `collectionInput` in the `revertToken` effect when `ConfirmReResolveDialog` is cancelled.

---

### `F-02` (P2) — `handleChangeEntryVersion` does not clear stale `exportError` or gate `TargetForm` / `Export instance.json` while `isRecomputing` is active

- **Location:** [`src/ui/App.tsx:272-320`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/App.tsx#L272-L320), [`src/ui/App.tsx:358-365`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/App.tsx#L358-L365), [`src/ui/App.tsx:402-404`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/App.tsx#L402-L404)
- **Reviewers:** `correctness`, `julik-frontend-races`, `maintainability` (Confidence: `100`)
- **Problem:**
  1. When `changeEntryVersion` throws an error (`line 316`), `handleChangeEntryVersion` sets `setExportError(message || 'Failed to recompute dependency closure.')`. However, `handleChangeEntryVersion` never calls `setExportError(null)` when starting or completing a subsequent version change (`lines 273-305`), leaving the error banner permanently displayed until the user clicks **Export instance.json** or reloads the collection.
  2. While `isRecomputing` is `true` (an async `changeEntryVersion` request is in flight), `EnvironmentTogglesBar` and `EntryTables` are disabled, but `TargetForm` (`line 360`) and the **Export instance.json** button (`line 402`) remain enabled. Clicking **Export instance.json** during recomputation exports the pre-override `Instance`, and changing a `TargetForm` setting when `hasSelectionChangedFromDefault(instance)` is `true` opens `ConfirmReResolveDialog` (`setPendingReResolve(values)`) without aborting `versionAbortControllerRef`, allowing the in-flight version recompute to settle behind the open modal.
- **Proposed Fix:**
  - Call `setExportError(null)` at the beginning of `handleChangeEntryVersion`.
  - Disable the **Export instance.json** button while `isRecomputing` is `true` (`disabled={isRecomputing}`), and either pass `isResolving={isResolving || isRecomputing}` to `TargetForm` or abort `versionAbortControllerRef` when `handleRequestLoadOrReResolve` is invoked.

---

### `F-03` (P2) — `isCandidateUnverifiedPlatform` in UI diverges from `src/core/resolver.ts` fallback rule (`platforms.length === 0`)

- **Location:** [`src/ui/components/EntryTables.tsx:50-60`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/EntryTables.tsx#L50-L60), [`src/ui/components/EntryTables.tsx:225-227`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/EntryTables.tsx#L225-L227)
- **Reviewers:** `maintainability` (Confidence: `100`)
- **Problem:**
  - `IMPLEMENTATION_PLAN_v1.MD` §7.1 rule 3 and `src/core/resolver.ts:255-256` define a game-version fallback candidate as a version for a platform-specific project type whose `platforms` array is empty (`!isPlatformAgnostic(projectType) && candidate.platforms.length === 0`).
  - `EntryTables.tsx` defines `isCandidateUnverifiedPlatform` in the UI layer as `!candidate.platforms.some((p) => p.toLowerCase() === targetLower)`. If a pinned dependency version declares a different platform array or if `targetPlatform` is omitted in standalone component tests, the UI predicate differs from the core fallback rule.
  - Additionally, `src/core/status.ts:318` only emits `PLATFORM_UNVERIFIED` when `state.resolution === 'game-version-fallback'`, whereas `EntryTables.tsx:225-227` also shows the `unverified platform` badge when a user manually overrides a version (`state.resolution === 'user'`) to a fallback candidate.
- **Proposed Fix:**
  - Define and export a pure helper in `src/core` (e.g. `isUnverifiedPlatformCandidate(version: VersionRef, projectType: ProjectType): boolean` checking `!isPlatformAgnostic(projectType) && version.platforms.length === 0`) and use it in `EntryTables.tsx` (and in `src/core/status.ts` if user-selected fallback candidates should also carry `PLATFORM_UNVERIFIED`).

---

### `F-04` (P2) — Duplicate header tri-state calculation (`computeFallbackTriState`) in `EntryTables.tsx` duplicates `getHeaderTriState` from `src/core`

- **Location:** [`src/ui/components/EntryTables.tsx:87-100`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/EntryTables.tsx#L87-L100), [`src/ui/components/EntryTables.tsx:399-404`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/EntryTables.tsx#L399-L404)
- **Reviewers:** `maintainability` (Confidence: `100`)
- **Problem:**
  - `EntryTables.tsx` re-implements `getHeaderTriState` (`src/core/reducers.ts:394-424`) inside `computeFallbackTriState(rows, env)` for when `instance` is not passed to `EntryTables`.
  - In `App.tsx`, `instance` is always passed (`line 427`), and if standalone table tests omit `instance`, `computeFallbackTriState` duplicates core selection logic in `src/ui/`.
- **Proposed Fix:**
  - Either export a row-level helper from `src/core/reducers.ts` that `getHeaderTriState` delegates to, or pass `instance` in callers and remove `computeFallbackTriState` from `src/ui/components/EntryTables.tsx`.

---

### `F-05` (P2) — Untested error and abort-superseding paths in `handleChangeEntryVersion`

- **Location:** [`src/ui/App.tsx:285-318`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/App.tsx#L285-L318), [`tests/ui/m3-2-selection.test.tsx:406-482`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/tests/ui/m3-2-selection.test.tsx#L406-L482)
- **Reviewers:** `testing` (Confidence: `100`)
- **Problem:**
  - `handleChangeEntryVersion` in `src/ui/App.tsx` contains asynchronous error handling (`catch (err: unknown)` setting the error alert and resetting `isRecomputing`), `AbortController` cancellation of superseded version changes (`versionAbortControllerRef.current?.abort()`), and a synchronous fallback when `modrinthClient` is omitted.
  - `tests/ui/m3-2-selection.test.tsx` only tests the happy path of `handleChangeEntryVersion` (`lines 406-482`); none of the error recovery or abort-superseding paths are exercised by tests.
- **Proposed Fix:**
  - Add a test in `tests/ui/m3-2-selection.test.tsx` where `changeEntryVersion` rejects (e.g. `vi.spyOn(client, 'getProjects').mockRejectedValueOnce(new Error('API failure'))`), asserting that `role="alert"` displays the error, controls re-enable (`isRecomputing` resets to `false`), and a subsequent successful version override clears the error.

---

### `F-06` (P3) — `ConfirmReResolveDialog` lacks `Escape` key handler and initial focus management when opened

- **Location:** [`src/ui/components/ConfirmReResolveDialog.tsx:16-40`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/ConfirmReResolveDialog.tsx#L16-L40)
- **Reviewers:** `julik-frontend-races` (Confidence: `100`)
- **Problem:**
  - `ConfirmReResolveDialog` renders a `div` with `role="dialog"` and `aria-modal="true"`, but does not move focus into the dialog when opened or listen for the `Escape` key to trigger `onCancel()`. Keyboard users who trigger a target change remain focused on the underlying `<select>` outside the modal.
- **Proposed Fix:**
  - Focus the **Cancel** button via a `ref` when `open` becomes `true`, and attach a `keydown` listener that calls `onCancel()` on `Escape` (with cleanup in `useEffect`).

---

### `F-07` (P3) — `docs/user-guide.md` omits the visible `auto` and `user off` selection-source badges rendered in environment cells

- **Location:** [`docs/user-guide.md:83-99`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/docs/user-guide.md#L83-L99), [`docs/user-guide.md:133-144`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/docs/user-guide.md#L133-L144), [`src/ui/components/EntryTables.tsx:267-276`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/src/ui/components/EntryTables.tsx#L267-L276)
- **Reviewers:** `maintainability` (Confidence: `100`)
- **Problem:**
  - `EntryTables.tsx` renders an `auto` badge (`data-selection-source="auto"`) when `selection.on && selection.source === 'auto'` and a `user off` badge (`data-selection-source="user-off"`) when `!selection.on && selection.source === 'user'`, plus `(<versionType>)` and `[unverified platform]` option suffixes in the version dropdown.
  - `docs/user-guide.md` §3 ("Reading Environment Cells") and §5 ("Automatic Dependency Selection & User Overrides") describe the internal `source: 'auto'` and `on: false, source: 'user'` states, but do not mention the visible `auto` and `user off` badges or exact `[unverified platform]` dropdown suffix shown in the UI.
- **Proposed Fix:**
  - Update `docs/user-guide.md` §3 and §5 to mention the `auto` and `user off` cell badges and `[unverified platform]` / `(beta)` / `(alpha)` dropdown option labels.

---

### `F-08` (P3) — `AutoSelectToast` dismiss button and `preferStable` revert on `ConfirmReResolveDialog` Cancel are untested

- **Location:** [`tests/ui/m3-2-selection.test.tsx:449-453`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/tests/ui/m3-2-selection.test.tsx#L449-L453), [`tests/ui/m3-2-selection.test.tsx:524-540`](file:///Users/roda/jd/00-09%20-%20Personal/00%20-%20Code/00.03%20-%20Random%20Software/modrinth-collection-downloader/tests/ui/m3-2-selection.test.tsx#L524-L540)
- **Reviewers:** `testing` (Confidence: `100`)
- **Problem:**
  - `AutoSelectToast.tsx` renders a `Dismiss notification` button (`onClick={onDismiss}` -> `setToastMessage(null)` in `App.tsx:416`), which is never clicked in `tests/ui/m3-2-selection.test.tsx`.
  - Similarly, `TargetForm.tsx` supports triggering `onTargetChange` and reverting via `revertToken` for the **Prefer stable releases over newest alpha/beta** checkbox (`lines 63, 285-288`), but the test only exercises `Game Version` and `Platform` `<select>` controls.
- **Proposed Fix:**
  - In `tests/ui/m3-2-selection.test.tsx`, click the `Dismiss notification` button after verifying the toast text and assert the toast disappears; in the `ConfirmReResolveDialog` test, also toggle the **Prefer stable releases over newest alpha/beta** checkbox and verify **Cancel** restores its checked state.

---

## Requirements & Plan Compliance (`IMPLEMENTATION_PLAN_v1.MD` §13 M3.2)

- **§3 Glossary (`Environment`, `Platform`):** Met — verified across `src/ui/**`, `docs/user-guide.md`, and `docs/concepts.md` (zero occurrences of forbidden terms "side" or "loader" in UI labels, identifiers, or docs).
- **§5.1 Architecture & Import Boundaries:** Met — `src/ui/**` imports only from `src/core` and `src/ports`; zero adapter imports.
- **§7.2 Version Dropdowns & Closure Recompute:** Met — `EntryTables.tsx` renders `<select>` per selectable cell with `candidates` and triggers `changeEntryVersion` per environment.
- **§7.3 Selection & Auto-Select/Deselect Rules:** Met — initial selection defaults, `selectEntry`, `deselectEntry`, "user-off dependency stays off", "user-on dependency stays on", header tri-state `Select All` on collection rows, and re-resolve confirmation on target change when `hasSelectionChangedFromDefault(instance)` is `true`.
- **§7.3.1 Environment Toggles:** Met — top-level **Client environment** and **Server environment** toggles default to off, gray out and disable column controls when off while preserving and showing underlying `Selection` and `version` state, and never mutate `Selection` when toggled.
- **§7.5 Auto-Select Flash & Toast + `prefers-reduced-motion`:** Met — `changes` cells receive `env-cell-flash` (`1000ms` animation, replaced by static outline under `@media (prefers-reduced-motion: reduce)`) and `AutoSelectToast` announces counts per environment.

---

## Actionable Findings

| # | Severity | File & Line | Title | Route | Suggested Fix | Confidence |
|---|----------|-------------|-------|-------|---------------|------------|
| **F-01** | P2 | `src/ui/components/TargetForm.tsx:131` | `TargetForm` uses unsubmitted `collectionInput` on target changes and leaves `collectionInput` un-reverted on Cancel | `manual -> downstream-resolver` | Yes | 100 |
| **F-02** | P2 | `src/ui/App.tsx:288` | `handleChangeEntryVersion` does not clear stale `exportError` or gate `TargetForm` / `Export instance.json` while `isRecomputing` is active | `gated_auto -> downstream-resolver` | Yes | 100 |
| **F-03** | P2 | `src/ui/components/EntryTables.tsx:50` | `isCandidateUnverifiedPlatform` in UI diverges from `src/core/resolver.ts` fallback rule (`platforms.length === 0`) | `gated_auto -> downstream-resolver` | Yes | 100 |
| **F-04** | P2 | `src/ui/components/EntryTables.tsx:87` | Duplicate header tri-state calculation (`computeFallbackTriState`) in `EntryTables.tsx` duplicates `getHeaderTriState` from `src/core` | `gated_auto -> downstream-resolver` | Yes | 100 |
| **F-05** | P2 | `src/ui/App.tsx:307` | Untested error and abort-superseding paths in `handleChangeEntryVersion` | `gated_auto -> downstream-resolver` | Yes | 100 |
| **F-06** | P3 | `src/ui/components/ConfirmReResolveDialog.tsx:18` | `ConfirmReResolveDialog` lacks `Escape` key handler and initial focus management when opened | `manual -> downstream-resolver` | Yes | 100 |
| **F-07** | P3 | `docs/user-guide.md:83` | `docs/user-guide.md` omits the visible `auto` and `user off` selection-source badges rendered in environment cells | `gated_auto -> downstream-resolver` | Yes | 100 |
| **F-08** | P3 | `tests/ui/m3-2-selection.test.tsx:449` | `AutoSelectToast` dismiss button and `preferStable` revert on `ConfirmReResolveDialog` Cancel are untested | `gated_auto -> downstream-resolver` | Yes | 100 |

---

## Coverage

- **Reviewers dispatched:** `correctness`, `julik-frontend-races`, `testing`, `maintainability` (4/4 completed, 0 failed/timed out).
- **Suppressed findings:** 0 findings suppressed below anchor 75.
- **Deduplication:** 11 raw reviewer findings merged into 8 unique numbered findings (`F-01` through `F-08`); `F-01` and `F-02` corroborated across multiple independent reviewers.
- **Plan verification:** Verified against explicit plan `docs/implementation/plans/IMPLEMENTATION_PLAN_v1.MD` (`plan_source: explicit`).
- **Removable surface:** ~15 lines in `src/ui/components/EntryTables.tsx` (`computeFallbackTriState`, `F-04`).
- **Residual risks:**
  - `src/core/status.ts:318` currently emits `PLATFORM_UNVERIFIED` only when `state.resolution === 'game-version-fallback'`; when M3.3 wires status symbols into the UI, verify whether manually overriding a version (`state.resolution === 'user'`) to an unverified-platform fallback candidate should also emit `PLATFORM_UNVERIFIED`.
  - `hasSelectionChangedFromDefault` in `src/core/reducers.ts` checks `Selection` states (`on` and `source`) per §7.3; if a user only changes a version dropdown to a candidate with identical dependencies and makes no selection changes, target change re-resolves without prompting `ConfirmReResolveDialog`.
- **Testing gaps:** Covered by `F-05` and `F-08`.

---

> **Verdict:** Ready with fixes
>
> **Reasoning:** Milestone M3.2 meets all core architectural boundaries, glossary rules, and §7.2/§7.3/§7.3.1/§7.5 functional specifications with zero P0 or P1 defects. Five P2 issues (`F-01` through `F-05`) and three P3 polish items (`F-06` through `F-08`) were identified for evaluation in Step 4.
>
> **Fix order:** `F-01` & `F-02` (`TargetForm` / `App.tsx` state sync and `isRecomputing` error/control gating) -> `F-03` & `F-04` (`EntryTables.tsx` core helper alignment) -> `F-06` (`ConfirmReResolveDialog` keyboard/focus handling) -> `F-05`, `F-08` (UI tests) -> `F-07` (`docs/user-guide.md`).
