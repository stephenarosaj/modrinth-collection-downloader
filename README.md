# Modrinth Collection Downloader (`modrinth-collection-downloader`)

A fully client-side web application for building, reviewing, and exporting Minecraft instances from a Modrinth collection.

Enter a Modrinth collection URL or ID, choose a target **game version** and **platform**, review every project across per-type tables (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`), configure independent `client` and `server` **environments**, and export the result as archives or portable definitions.

![Modrinth Collection Downloader — Per-Type Review Tables and Statuses](docs/screenshots/02-review-tables-and-statuses.svg)

---

## Features

- **Collection & Dependency Resolution:** Accepts any Modrinth collection URL (`https://modrinth.com/collection/<id>`) or bare ID, resolves compatible versions per environment, and computes transitive required dependencies with cycle protection and partial-result resilience.
- **Independent Client & Server Environments:** Each environment (`client`, `server`) is a fully independent lane with its own support status, resolved version, candidate version dropdown, selection state, required dependencies, and status validation.
- **Per-Type Review Tables:** Organizes projects into separate tables by project type (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`) with dedicated dependency footers and accessible status indicators (`✓`, `⚠`, `!`, `?`).
- **One Data, Three Views (Multiple Export Formats):**
  - `<collectionId>-client.zip` and `<collectionId>-server.zip` — separate archives organized into per-type folders (`mods/`, `plugins/`, `datapacks/`, `resourcepacks/`, `shaderpacks/`).
  - `<collectionId>-instance.json` — full, schema-validated Instance data export that can be re-imported offline with zero network requests.
  - `<collectionId>.mrpack` — Modrinth modpack package (`modrinth.index.json`) referencing CDN download URLs and cryptographic hashes without downloading binaries upfront.
- **Rate-Limit & Failure Resilience:** Automatic HTTP `429` / `5xx` retry with backoff (`Retry-After` / `X-Ratelimit-*`), partial-result collection resolution, partial-failure zip packaging, and one-click **Retry** / **Retry export** recovery.

---

## Quickstart

Prerequisites: Node.js (v20+) and [Yarn](https://yarnpkg.com/).

```bash
# Install dependencies
yarn install

# Start development server
yarn dev

# Run test suite
yarn test

# Build production bundle
yarn build
```

Additional checks:

```bash
yarn lint
yarn typecheck
```

---

## Deployment (GitHub Pages)

The application is a static single-page bundle built by Vite (`dist/`) with relative asset URLs (`base: './'`) by default, so it works out of the box on root domains and GitHub Pages repository subpaths (`https://<owner>.github.io/<repo>/`).

- **Automated CI/CD:** Pushing to `main` (or triggering the workflow manually via `workflow_dispatch`) runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml), which executes `yarn lint`, `yarn typecheck`, `yarn test`, and `yarn build` before publishing `./dist` to GitHub Pages.
- **Custom Base Path Override:** Set `VITE_BASE_PATH=/custom-subpath/` at build time if your host requires an explicit absolute base path.

---

## Documentation

- [User Guide](docs/user-guide.md) — Step-by-step walkthrough with screenshots covering loading collections, reviewing environments, handling rate limits/retries, and exporting.
- [Concepts & Glossary](docs/concepts.md) — Domain model, environments, platforms, version resolution order, selection rules, and status symbol reference.
- [Instance Format (`instance.json`)](docs/instance-format.md) — Schema v1 specification and serialization rules (validated by [`schema/instance.schema.json`](schema/instance.schema.json)).
- [Output Formats](docs/output-formats.md) — Archive layout, file naming convention, `instance.json`, and `.mrpack` mapping.
- [Architecture](docs/architecture.md) — Clean architecture layers (`core`, `ports`, `adapters`, `ui`, `app`), boundary import rules, and data flow.
- [Modrinth API Notes](docs/modrinth-api-notes.md) — API endpoints, rate limits, and verification records.
- [Architectural Decisions & M5 QA Checklist](docs/decisions.md) — Log of implementation decisions and release verification checklist.
- [Contributing Guide](CONTRIBUTING.md) — Development workflow, scripts, glossary rules, and extension guides.

---

## Based on

This project is a standalone derivative based on [**DanyCDev/modrinth-collection-web-download**](https://github.com/DanyCDev/modrinth-collection-web-download) by Daniel (live at [https://md.dkg.sk/](https://md.dkg.sk/)).

---

## License

Released under the [MIT License](LICENSE).
