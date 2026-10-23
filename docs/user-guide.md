# User Guide

This guide walks through each stage of building, reviewing, and exporting a Minecraft instance with **Modrinth Collection Downloader** (`modrinth-collection-downloader`).

> _Note: Detailed UI walkthroughs and screenshots will be expanded as Milestones M3.1–M5 land._

---

## 1. Input

Configure the collection source and target instance parameters:

- **Collection URL or ID:** Enter a full Modrinth collection URL (`https://modrinth.com/collection/<id>`) or a bare collection ID.
- **Game Version:** Choose a target Minecraft release version (populated from Modrinth's game version tag list, `release` types only).
- **Platform:** Choose a target platform (e.g., `Fabric`, `Forge`, `NeoForge`, `Quilt`, `Paper`).
- **Release Preference:**
  - `stable` — Prefer newest `release` version; fall back to `beta`/`alpha` only if no release version exists.
  - `newest` — Always pick the version with the latest `publishedAt` timestamp regardless of release channel.
- Click **Load collection** to begin resolution.

---

## 2. Resolve

During resolution, the app queries Modrinth for the collection's projects, resolves compatible versions independently for `client` and `server` **environments**, and computes transitive required dependencies:

- **Progress UI:** Displays resolved project counts and a live activity log.
- **Cancellation:** Click **Cancel** at any time to abort in-flight requests cleanly.

---

## 3. Review Tables

Once resolved, projects are organized into separate tables by **project type** (in order: `mod`, `plugin`, `datapack`, `resourcepack`, `shader`):

- **Left Status Column:** Displays the overall row status symbol across active environments (`✓` ok, amber `⚠` warning, red `⚠` error, purple `?` unknown). Hovering or focusing the symbol shows a tooltip explaining every status reason per environment.
- **Name:** Project title with an **Open on Modrinth ↗** link.
- **Platform:** Resolved or target platform (shown as `—` for platform-agnostic project types: `datapack`, `resourcepack`, `shader`).
- **Client & Server Columns:** Independent environment cells containing:
  - Selection checkbox (or `✗` when `unsupported`, or disabled `"No compatible version"` when `version === null`).
  - Candidate version dropdown (allowing manual version overrides; game-version fallback candidates are tagged).
  - Environment support badge (`required`, `optional`, `unknown`).
- **Dependencies Footer:** Appears at the bottom of each table, listing required dependency entries and which entries require them in each environment (e.g., `required by: Mod A, Mod B (client)`).
- **Skipped Section:** Lists `modpack` projects or unrecognized project types that cannot be included, along with the reason.

---

## 4. Environment Toggles

Two top-level toggles — **Client** and **Server** — control which environments are active during review and export:

- Both toggles start **off by default** when tables first load so you make an explicit choice of target environment(s).
- While an environment toggle is **off**:
  - Its table column is visually grayed out and its checkboxes and version dropdowns are disabled.
  - The underlying default selections and resolved versions remain intact and visible through the grayed state.
  - Inactive environments do not contribute to row status symbols or cell warning/error rings.
  - Environment-specific export buttons (e.g., `client.zip` when **Client** is off) are disabled.
- Turning an environment toggle **on** enables interaction, status evaluation, and export for that environment without mutating existing selections.

---

## 5. Selection & Dependencies

Each environment column manages selection state independently:

- **Initial Selection:** On resolve, every selectable collection entry is selected (`user`), and every required dependency entry is automatically selected (`auto`) in the environments where a selected entry requires it.
- **Auto-Select & Auto-Deselect:**
  - Selecting an entry automatically selects its required transitive dependencies (`auto`), unless you previously turned a dependency off explicitly (`user`).
  - Deselecting an entry automatically deselects any `auto`-selected dependencies that are no longer needed by any remaining selected entry in that environment.
  - Auto-updated cells flash briefly (or show a static outline when `prefers-reduced-motion` is enabled) accompanied by a summary toast.
- **Header Select-All:** Tri-state checkbox (`checked`, `indeterminate`, `unchecked`) per environment column that selects or deselects all collection rows in that table.
- **Target Change Confirmation:** Changing the target game version, platform, or release preference prompts for confirmation if any selection differs from the initial default before re-resolving.

---

## 6. Status Symbols

Status indicators use both distinct shapes and colors, with keyboard-focusable tooltips and `aria-label` descriptions:

| Symbol | Kind | Color | Meaning |
|---|---|---|---|
| `✓` | `ok` | Green | No issues in active environments |
| `⚠` | `warning` | Amber | Actionable warning (e.g., required entry or dependency deselected, pin conflict, or unverified platform fallback) |
| `⚠` (with `!`) | `error` | Red | Missing compatible version or unavailable required dependency |
| `?` | `unknown` | Purple | Environment support is `unknown` on Modrinth |
| `✗` | N/A | Muted | Project is `unsupported` in that environment (rendered inside the cell) |

See [Concepts — Status Reference](concepts.md#status-and-symbol-reference) for the complete table of status reasons.

---

## 7. Exporting

From the export bar, generate any of the four outputs from the current Instance:

1. **`<collectionId>-client.zip`** — Downloads binaries for entries selected in the `client` environment, organized into per-type folders (`mods/`, `plugins/`, `datapacks/`, `resourcepacks/`, `shaderpacks/`). Requires the **Client** environment toggle to be on.
2. **`<collectionId>-server.zip`** — Downloads binaries for entries selected in the `server` environment, organized into per-type folders. Requires the **Server** environment toggle to be on.
3. **`instance.json`** — Exports the complete, schema-validated Instance JSON. Can be re-imported later to restore the exact review state offline without network calls.
4. **`<collectionId>.mrpack`** — Exports a Modrinth modpack archive containing `modrinth.index.json` with CDN download URLs, hashes, and per-environment annotations (`client`/`server`). Includes an optional platform version input and warns if `plugin` entries are excluded.
