# Milestone M5 — Polish and Release: Commit & Push Log

## Commit Message (`/generate-pr-description` format)

```markdown
# feat(m5): add error/rate-limit recovery, partial-result resilience, 500-row perf verification, docs screenshots, and GitHub Pages deploy

## Overview
✨ Completes Milestone M5 (Polish and Release), adding actionable HTTP 429/404/5xx and network error formatting, one-click retry buttons for collection resolution and zip exports, partial-result collection resolution resilience, initial and all-skipped empty states, a 500-row performance and `React.memo` isolation test suite, annotated SVG UI screenshots across the documentation, and an automated GitHub Pages deployment workflow.

## Highlights
✨ Enhanced `resolveCollection` (`src/core/resolver.ts`) to degrade gracefully to partial results when individual project version lookups or transitive dependency fetches fail, recording failed projects in `skipped` and progress logs while only failing the entire run if `getCollection`, initial `getProjects`, or 100% of collection version fetches fail.
✨ Added `formatUserFacingError` (`src/ui/utils.ts`), one-click `Retry` in `<ResolveProgressPanel />` and `Retry <env>.zip export` in `<ExportBar />`, and the initial `Getting started` card and all-skipped empty-state note in `<App />` and `<EntryTables />`.
✨ Added `.github/workflows/deploy.yml` and relative `base: './'` support in `vite.config.ts` for GitHub Pages deployment, created 4 annotated SVG screenshots in `docs/screenshots/`, and completed the §12 documentation pass and M5 Manual QA & Release Verification Checklist in `docs/decisions.md`.

<details>
<summary><b>Changelog</b></summary>

### Implementation Changes
- `src/core/resolver.ts`: Added partial-result resilience for per-project `getProjectVersions` and transitive dependency lookups (`getProjects`, `getProjectVersions`, `getVersionsByIds`), filtering fetch-failed collection projects out of `resolvedCollectionIds` and recording clear reasons in `skipped` and progress warnings.
- `src/ui/utils.ts`: Added `formatUserFacingError` to format HTTP `429` rate limits, `404` missing resources, `5xx` server errors, and network failures while preserving technical details.
- `src/ui/components/ResolveProgressPanel.tsx`: Added optional `onRetry` prop and `Retry` button when resolution fails or is cancelled.
- `src/ui/components/ExportBar.tsx`, `src/ui/download.ts`: Added `env` to `ExportEnvironmentZipResult` and rendered a `Retry <env>.zip export` button inside `.zip-partial-failure-alert` gated by active environment and selection state.
- `src/ui/components/EntryTables.tsx`: Added `skippedCount` prop to display an informative note when all projects in a collection were skipped.
- `src/ui/App.tsx`, `src/ui/styles.css`: Wired `lastSubmittedTarget` retry handler, `formatUserFacingError`, and the accessible `Getting started` empty-state card before a collection is loaded or imported.
- `vite.config.ts`, `.github/workflows/deploy.yml`: Configured portable relative asset base path (`process.env.VITE_BASE_PATH ?? './'`) and added the GitHub Pages CI/CD deployment workflow.
- `docs/screenshots/*.svg`, `README.md`, `CONTRIBUTING.md`, `docs/user-guide.md`, `docs/architecture.md`, `docs/decisions.md`: Added 4 UI screenshots, completed the §12 documentation pass, and recorded decisions `D-008`, `D-009`, and the M5 Manual QA & Release Verification Checklist.

### Test Changes
- `tests/ui/m5-polish.test.tsx`: Added 14 tests covering `formatUserFacingError` (`429`, `404`, `5xx`, network errors), collection resolution `Retry` after `429` failure and cancellation, partial-result resolution and transitive dependency failure degradation, `client.zip` and `server.zip` export retry routing and disabled gating, empty/all-skipped states, `axe-core` accessibility, and 500-row performance and `React.memo` row isolation.

</details>
```
