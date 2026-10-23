# Architectural & Implementation Decisions

This log records technical, architectural, and implementation choices made where `IMPLEMENTATION_PLAN_v1.MD` left room for discretion.

---

## M0 — Project Scaffold & Tooling Decisions

### D-001: Package Manager — Yarn

- **Context:** The project needed a deterministic Node.js package manager for local development and GitHub Actions CI.
- **Decision:** Standardize on **Yarn** (`yarn install --frozen-lockfile`, `yarn lint`, `yarn typecheck`, `yarn test`, `yarn build`) with a tracked `yarn.lock`.
- **Rationale:** Matches developer environment preferences and provides fast, reproducible installs in CI.

### D-002: Build Tool & Test Runner — Vite + Vitest + Testing Library

- **Context:** §5 specifies Vite + TypeScript (`strict`, `noUncheckedIndexedAccess`) + React 18+ + Vitest + Testing Library.
- **Decision:**
  - Use **Vite** with `@vitejs/plugin-react` for development and static bundle builds.
  - Use **Vitest** with `jsdom` and `@testing-library/react` / `@testing-library/jest-dom` for unit and UI component testing.
  - Enforce `strict: true` and `noUncheckedIndexedAccess: true` in `tsconfig.json`.

### D-003: Architectural Boundary Enforcement — `eslint-plugin-boundaries`

- **Context:** §5 and §5.1 require ESLint to enforce strict import rules across `core`, `ports`, `adapters`, `ui`, and `app` in CI, with an automated test proving a deliberate boundary violation fails linting.
- **Decision:** Configure ESLint flat config (`eslint.config.js`) with `eslint-plugin-boundaries` defining element types for `core`, `ports`, `adapters`, `ui`, and `app` matching §5.1 rules, plus a Vitest boundary test that runs ESLint programmatically against a fixture violation to verify enforcement.

### D-004: JSON Schema Draft — Draft 2020-12

- **Context:** §5 and §6.1 require `schema/instance.schema.json` to validate `instance.json` exports and imports.
- **Decision:** Author `schema/instance.schema.json` using **JSON Schema Draft 2020-12** (`https://json-schema.org/draft/2020-12/schema`) with `additionalProperties: false` on all objects to catch unexpected or mistyped properties early.
