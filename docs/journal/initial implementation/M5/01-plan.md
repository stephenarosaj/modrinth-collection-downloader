# Milestone M5 — Polish and Release: Implementation Plan

## Scope (§13 M5)

Milestone M5 completes the project with error & rate-limit UX, retry workflows, partial-result resolution resilience, empty/edge states, a 500-row performance verification pass, GitHub Pages deployment, and a full §12 documentation pass with screenshots and manual QA checklist:

1. **Error & Rate-Limit UX (Clear Messages, Retry, Partial Results)**:
   - Format Modrinth API and network errors into clear, actionable messages (`formatUserFacingError` in `src/ui/utils.ts`), explicitly highlighting HTTP `429` rate limits, `404` missing collections/projects, and `5xx` server errors while preserving technical details.
   - Add a **Retry** button in `<ResolveProgressPanel />` (`src/ui/components/ResolveProgressPanel.tsx`) when collection resolution fails or is cancelled so users can immediately retry the last attempted target configuration.
   - Add a **Retry export** button in `<ExportBar />` (`src/ui/components/ExportBar.tsx`) when a zip export encounters partial or total binary download failures.
   - Enhance `resolveCollection` (`src/core/resolver.ts`) to support partial results when a subset of project version fetches (`getProjectVersions`) or dependency lookups (`getProjects`, `getVersionsByIds`) fail with non-abort errors: record a clear reason in `skipped` and progress logs, resolve the remaining projects into a valid `Instance`, and only fail the entire resolution if `getCollection`, initial `getProjects`, or 100% of collection version fetches fail.
2. **Empty & Edge States**:
   - Add an accessible **Getting started** empty-state card in `<App />` (`src/ui/App.tsx`) when no collection is loaded or resolving, walking through the 3-step workflow.
   - Enhance `<EntryTables />` (`src/ui/components/EntryTables.tsx`) empty states to distinguish between an empty collection (`0` projects) and a collection where all projects were skipped (e.g., modpacks or unsupported project types), guiding the user to the Skipped Projects section.
3. **Performance Pass at 500 Rows**:
   - Audit and verify `<App />` and `<EntryTables />` rendering and interaction performance with a 500-entry `Instance`, proving fast initial render, responsive single-cell selection and header select-all toggles, and `React.memo` row isolation in `tests/ui/m5-polish.test.tsx`.
4. **GitHub Pages Deploy Workflow & Vite Base Config**:
   - Configure `vite.config.ts` with `base: process.env.VITE_BASE_PATH ?? './'` so built static bundles work both at root (`/`) and under a GitHub Pages repository subpath.
   - Add `.github/workflows/deploy.yml` to run lint, typecheck, test, and build and deploy `./dist` to GitHub Pages on push to `main` and `workflow_dispatch`.
5. **Full §12 Documentation Pass with Screenshots & QA Checklist**:
   - Create annotated SVG screenshots in `docs/screenshots/` covering the target form & empty state, per-type review tables & status symbols, environment selection & auto-select toast, and export bar & outputs.
   - Complete the final documentation pass across `README.md`, `CONTRIBUTING.md`, `docs/user-guide.md`, `docs/architecture.md`, and `docs/decisions.md` (including the M5 Manual QA & Release Verification Checklist).

---

## Subagent Work Breakdown & Disjoint File Ownership

| Subagent Role | Owned Files | Responsibilities |
|---|---|---|
| **M5-Core-And-UI-Polish-Engineer** | `src/core/resolver.ts`, `src/ui/utils.ts`, `src/ui/components/ResolveProgressPanel.tsx`, `src/ui/components/ExportBar.tsx`, `src/ui/components/EntryTables.tsx`, `src/ui/App.tsx`, `src/ui/styles.css` | Partial-result resolution resilience, `formatUserFacingError` (rate-limit/404/5xx formatting), Retry buttons for resolution and zip export, Getting Started and all-skipped empty states, and CSS polish. |
| **M5-Deploy-And-Docs-Author** | `vite.config.ts`, `.github/workflows/deploy.yml`, `docs/screenshots/*.svg`, `README.md`, `CONTRIBUTING.md`, `docs/user-guide.md`, `docs/architecture.md`, `docs/decisions.md` | GitHub Pages workflow, Vite relative base path, SVG screenshots, full §12 documentation pass, and M5 Manual QA checklist. |
| **M5-Tests-And-Perf-Engineer** | `tests/ui/m5-polish.test.tsx` | Automated tests for rate-limit/error formatting, Retry collection resolution, partial-result resolution, Retry zip export, empty/edge states, `axe-core` accessibility, and 500-row performance & memoization verification. |
