# Milestone M5 — Polish and Release: Implementation Log

Subagent implementation updates for Milestone M5 are recorded below.

## M5-Deploy-And-Docs-Author

- **Vite Base Path (`vite.config.ts`)**: Configured `base: process.env.VITE_BASE_PATH ?? './'` so the production bundle uses portable relative asset URLs by default while supporting explicit base path overrides.
- **GitHub Pages Deployment Workflow (`.github/workflows/deploy.yml`)**: Created `.github/workflows/deploy.yml` triggered on `push` to `main` and `workflow_dispatch`, executing `yarn install --frozen-lockfile`, `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn build`, then publishing `./dist` via `actions/configure-pages@v5`, `actions/upload-pages-artifact@v3`, and `actions/deploy-pages@v4`.
- **UI Screenshots (`docs/screenshots/*.svg`)**: Authored four self-contained dark-theme SVG screenshots depicting the actual application workflows:
  - `docs/screenshots/01-target-form-and-empty-state.svg`
  - `docs/screenshots/02-review-tables-and-statuses.svg`
  - `docs/screenshots/03-selection-and-auto-select-toast.svg`
  - `docs/screenshots/04-export-bar-and-outputs.svg`
- **§12 Documentation Pass & M5 QA Checklist (`README.md`, `CONTRIBUTING.md`, `docs/user-guide.md`, `docs/architecture.md`, `docs/decisions.md`)**: Embedded screenshots into `README.md` and `docs/user-guide.md`, documented rate-limit/retry UX, partial-result resolution, and GitHub Pages deployment, updated `docs/architecture.md`, and recorded decisions `D-008` and `D-009` plus the full Milestone M5 Manual QA & Release Verification Checklist in `docs/decisions.md`.


## M5-Core-And-UI-Polish-Engineer

### Files Updated
- `src/core/resolver.ts`
- `src/ui/utils.ts`
- `src/ui/components/ResolveProgressPanel.tsx`
- `src/ui/components/ExportBar.tsx`
- `src/ui/components/EntryTables.tsx`
- `src/ui/App.tsx`
- `src/ui/styles.css`

### Summary of Changes
1. **Partial-Result Resolution Resilience (`src/core/resolver.ts`)**:
   - Wrapped collection project version fetches (`client.getProjectVersions`) in `try / catch`, immediately rethrowing on `AbortError` (`isAbortError(err, opts.signal)`) and otherwise recording a `SkippedProject` warning, emitting a warning progress log, and falling back to an empty version list for that project.
   - If 100% of exportable collection project version fetches fail (`failedCollectionVersionErrors.length === exportableCollectionIds.length`), rethrows the first error so a total outage or global rate limit surfaces in the top-level error banner with the Retry action; if at least one project succeeds, returns the partial `Instance` + `skipped` list.
   - Wrapped dependency closure calls (`client.getProjects`, `client.getProjectVersions`, `client.getVersionsByIds`) in `try / catch` with abort propagation and graceful degradation to placeholder projects, skipped entries, and progress log warnings.
2. **User-Facing Error & Rate-Limit Formatting (`src/ui/utils.ts`, `src/ui/App.tsx`)**:
   - Added `formatUserFacingError(err, fallback)` in `src/ui/utils.ts` to format HTTP 429 / rate-limit errors with clear retry guidance while preserving original error message substrings.
   - Wired `formatUserFacingError` into `App.tsx` for `resolveError`, `exportError`, and `importError`.
3. **One-Click Retry UX (`src/ui/components/ResolveProgressPanel.tsx`, `src/ui/components/ExportBar.tsx`, `src/ui/App.tsx`)**:
   - Added optional `onRetry` prop and `Retry` button to `ResolveProgressPanel` when resolution fails or is cancelled, wired to `lastSubmittedTarget` in `App.tsx`.
   - Added `Retry <env>.zip export` button inside `.zip-partial-failure-alert` in `ExportBar.tsx` when binary downloads fail.
4. **Empty & Edge States (`src/ui/App.tsx`, `src/ui/components/EntryTables.tsx`, `src/ui/styles.css`)**:
   - Added the `<section className="card empty-workspace-card" aria-label="Getting started">` empty-state card in `App.tsx` when no instance is loaded and no resolution is active/failed/cancelled.
   - Added optional `skippedCount` prop to `EntryTables.tsx` to display a contextual skipped-projects note beneath the empty exportable tables message.
   - Added styles for `.empty-workspace-card`, `.empty-steps`, `.empty-tables-note`, and `.zip-retry-btn` in `src/ui/styles.css`.
5. **Verification**:
   - `yarn lint`, `yarn typecheck`, `yarn test --run` (18 test files, 238 tests), and `yarn build` all passed with 0 errors.


## M5-Tests-And-Perf-Engineer

### Files Created
- `tests/ui/m5-polish.test.tsx`

### Summary of Test Coverage & Verification
1. **Error & Rate-Limit Formatting (`formatUserFacingError`) and Collection Resolution Retry UX**:
   - Unit tested `formatUserFacingError` for HTTP `429` / rate-limit messages, already-guided rate-limit errors, standard errors, and empty/fallback errors.
   - Integration tested `<App />` when `client.getCollection` fails with `HTTP 429 Too Many Requests`, verifying the rate-limit banner and **Retry** button in `ResolveProgressPanel`, then clearing the error trigger and clicking **Retry** to resolve and render the review workspace without re-submitting the form.
   - Verified clicking **Retry** after cancelling an in-flight collection resolution (`wasCancelled`).
2. **Partial-Result Resolution Resilience**:
   - Verified multi-project collection resolution when one project's `getProjectVersions` throws a network/API error while other projects succeed: `<App />` renders the resolved project and its dependencies in the review table while surfacing the failed project in `Skipped Projects` and logging a warning in the resolution log.
   - Verified that when 100% of exportable collection projects fail `getProjectVersions`, `<App />` surfaces the top-level resolution error alert and **Retry** button rather than rendering an empty instance.
   - Verified graceful degradation when dependency `getProjectVersions` or `getVersionsByIds` fails during closure calculation.
3. **Zip Export Retry UX**:
   - Verified `<App />` renders the `.zip-partial-failure-alert` with the **Retry client.zip export** button when `fileFetcher.fetchBinary` fails, and that clicking **Retry client.zip export** after recovery exports `col-m5-client.zip` and clears the alert.
4. **Empty & Edge States + `axe-core` Accessibility**:
   - Verified the initial **Getting started** card (`aria-label="Getting started"`, heading `Ready to build an instance`) renders before any collection is loaded and disappears once a collection is loaded.
   - Verified empty collection (`0` projects) renders `No exportable projects found in this collection.` without a skipped note, and all-skipped collection (only a `modpack`) renders `No exportable projects found in this collection.` alongside `1 skipped project is listed below.`
   - Confirmed 0 `axe-core` accessibility violations on both the Getting Started empty state and the error/retry state.
5. **Performance Pass at 500 Rows**:
   - Constructed and imported a 500-entry `Instance` spanning all 5 exportable project tables (`mod`, `resourcepack`, `shader`, `datapack`, `plugin`, including 50 dependency rows) and verified that rendering all 500 `tr.entry-row` elements, toggling an individual entry checkbox, and toggling **Select All** complete accurately and well within `< 2000ms` in JSDOM.
6. **Verification**:
   - `yarn lint`, `yarn typecheck`, `yarn test --run` (19 test files, 249 tests), and `yarn build` all passed with 0 errors.
