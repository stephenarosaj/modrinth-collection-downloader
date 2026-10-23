# User Guide

This guide walks step-by-step through loading a Modrinth collection, reading the per-type review tables, inspecting transitive dependencies and skipped projects, and exporting an Instance with **Modrinth Collection Downloader** (`modrinth-collection-downloader`).

> _Terminology Note:_ Throughout the app and documentation, `client` and `server` are always referred to as **Environments**, and mod/plugin ecosystems (`Fabric`, `Quilt`, `Forge`, `NeoForge`, `Paper`, etc.) are always referred to as **Platforms**. See [Concepts & Domain Reference](concepts.md) for the complete glossary and rules.

---

## 1. Entering a Collection & Target Configuration

When you open the application, the configuration panel at the top lets you specify which Modrinth collection to load and the target parameters for version resolution:

1. **Collection URL or ID:**
   - Paste a full Modrinth collection URL (for example, `https://modrinth.com/collection/<id>`) or enter a bare collection ID directly.
   - Leading/trailing whitespace and trailing slashes or query parameters in collection URLs are stripped automatically.
2. **Game Version:**
   - Select your target Minecraft **Game Version** (e.g., `1.21.1`, `1.20.1`).
   - The list is populated automatically from Modrinth's game version tags and filtered to stable `release` versions only.
3. **Platform:**
   - Select your target **Platform** (e.g., `Fabric`, `Quilt`, `Forge`, `NeoForge`, `Paper`, `Purpur`, `Spigot`, `Bukkit`, `Folia`).
   - Platform matching applies to `mod` and `plugin` projects. Platform-agnostic project types (`datapack`, `resourcepack`, `shader`) match on **Game Version** only.
4. **Release Preference:**
   - **Prefer stable releases over newest alpha/beta (`stable`):** Checked by default. For each project and environment, the resolver prefers the newest compatible `release` version, falling back to `beta` or `alpha` only when no compatible `release` version exists.
   - **Newest (`newest`):** Uncheck the option if you want the resolver to pick the compatible version with the latest `publishedAt` timestamp regardless of release channel (`release`, `beta`, or `alpha`).
5. **Load collection:**
   - Click **Load collection** to start resolving the collection against your target configuration.

### Monitoring or Cancelling Resolution

While the collection is resolving, the **Resolution Progress** panel displays:

- **Progress Bar & Step Counts:** Shows `completed / total` resolution steps as the app fetches collection metadata, batched project details, per-project compatible versions, and transitive required dependencies.
- **Activity Log:** Streams status messages for each stage of resolution.
- **Cancel:** Click **Cancel** at any time while resolution is running to abort in-flight Modrinth API requests cleanly and return to the form.

---

## 2. Reading the Per-Type Review Tables

Once resolution completes, the resolved **Instance** is displayed as read-only review tables grouped by **Project Type** in canonical order:

1. **Mods** (`mod`)
2. **Plugins** (`plugin`)
3. **Datapacks** (`datapack`)
4. **Resource Packs** (`resourcepack`)
5. **Shaders** (`shader`)

Only project types that have at least one resolved collection entry or visible dependency entry are rendered.

### Table Columns

Each project-type table contains the following columns:

- **Name:**
  - Displays the project's title (`project.title`).
  - Includes an **Open on Modrinth ↗** link (`https://modrinth.com/<type>/<slug>`) that opens the project page in a new tab.
- **Platform:**
  - For platform-specific project types (`Mods` and `Plugins`), displays the target **Platform** (e.g., `Fabric`, `NeoForge`, `Paper`).
  - For platform-agnostic project types (`Datapacks`, `Resource Packs`, and `Shaders`), displays `—` because those formats depend only on the **Game Version**.
- **Client** and **Server** (Environment Columns):
  - Every project is evaluated independently for the `client` and `server` **environments**. Each environment column shows what will happen in that environment without assuming client vs. server intent.

### Reading Environment Cells

Each **Client** and **Server** cell reflects that environment's independent support level and version resolution outcome:

- **Resolved Version Number:**
  - When a compatible version exists for the environment, the cell displays the chosen `versionNumber` (e.g., `0.100.8+1.20.1` or `mc1.20.1-0.5.8`).
- **Support Tags (`required`, `optional`, `unknown`):**
  - Alongside a supported environment cell, a badge indicates Modrinth's declared support level for that environment:
    - `required` — The project must be present in this environment.
    - `optional` — The project can be installed in this environment optionally.
    - `unknown` — The project's metadata on Modrinth does not specify whether this environment is required or optional.
- **Unverified Platform Indicator (`unverified platform`):**
  - If a `mod` or `plugin` version matched the target **Game Version** via the game-version fallback rule (the version's `platforms` array on Modrinth was empty or omitted), the cell displays an `unverified platform` indicator (`resolution: 'game-version-fallback'`).
- **Unsupported Environment (`✗`):**
  - When a project's support for an environment is `unsupported` (for example, a client-only shader in the **Server** column, or a server-only plugin in the **Client** column), the cell renders `✗`.
- **No Compatible Version (`"No compatible version"`):**
  - When the environment is supported (`required`, `optional`, or `unknown`) but no version on Modrinth matches the target **Game Version** and **Platform**, the cell displays `"No compatible version"` (`version === null`, `resolution: 'none'`).

---

## 3. Reading the Dependencies Footer

During resolution, the app computes the transitive closure of all `required` dependencies for each chosen version in each environment (`optional`, `incompatible`, and `embedded` dependencies are ignored).

- **Placement:** If a project is pulled in solely as a required dependency (`origin: 'dependency'`), it appears in the **Dependencies** footer section at the bottom of its corresponding project-type table, using the same **Name**, **Platform**, **Client**, and **Server** columns as collection rows.
- **`required by` Attribution:** Each dependency row lists which entries require it and in which environment(s), formatted as:
  - `required by: <Project Title> (client)`
  - `required by: <Project A>, <Project B> (server)`
  - If a dependency is required in both environments, attributions are shown for both `client` and `server`.
- **Collection Precedence:** If a required dependency is *already* an explicit member of the Modrinth collection (`origin: 'collection'`), it remains in the main collection rows of its table rather than being duplicated in the **Dependencies** footer.

---

## 4. Skipped Projects Section

Not every item returned by Modrinth can be packaged as an individual project file inside an instance. Projects that cannot be resolved into table entries are listed in the **Skipped Projects** section below the review tables:

- **`modpack` Projects:** Modrinth collections sometimes include full modpack projects (`project_type: "modpack"`). Because modpacks are multi-project archives rather than individual mods or packs, they are skipped with the reason that modpack projects are not supported.
- **`.mrpack` Primary Files & Unsupported Types:** Any project whose resolved primary file is a `.mrpack` archive or whose project type is unrecognized is refused and listed in **Skipped Projects** along with its title, **Open on Modrinth ↗** link, and the specific skip reason.

Skipped projects are informational only and are never included in exports.

---

## 5. Exporting `instance.json`

Once a collection is loaded and resolved, you can save a complete, lossless snapshot of the resolved **Instance**:

1. Click **Export instance.json** in the Collection summary header above the review tables.
2. Before downloading, the app serializes the current `Instance` (`serialize(instance)`) and validates it against [`schema/instance.schema.json`](../schema/instance.schema.json).
3. Your browser downloads `<collectionId>-instance.json` (pretty-printed with deterministic key ordering).

What `<collectionId>-instance.json` contains:
- `schemaVersion: 1`
- `meta`: Collection name, source `collectionId` and `url`, target `gameVersion`, `platform`, and `releasePreference`, plus the `createdAt` ISO-8601 timestamp.
- `entries`: Every resolved collection and dependency entry, including both `client` and `server` environment states (`support`, `candidates`, chosen `version` with primary file CDN URL and `sha1`/`sha512` hashes, `resolution`, `dependencies`, `requiredBy`, and `selection`).

See [Instance Format (`instance.json`)](instance-format.md) for the full schema reference.

---

## 6. Upcoming Interactive Review & Export Features (Milestones M3.2–M4)

> _Note: The following capabilities build on the read-only review tables in subsequent milestones._

### Environment Toggles & Selection (M3.2)

- **Environment Toggles:** Two top-level toggles (**Client** and **Server**) start **off by default** when tables load so you make an explicit choice of active environment(s). Turning a toggle on enables checkboxes, version dropdowns, status evaluation, and environment-specific exports for that column.
- **Per-Environment Selection & Auto-Select:** Checking or unchecking a collection entry in an active environment automatically selects or deselects its transitive required dependencies (`source: 'auto'`), while respecting any dependency you explicitly turned off (`source: 'user'`). Auto-updated cells flash briefly (or show a static outline under `prefers-reduced-motion`) with a summary toast.
- **Version Override Dropdowns:** Each environment cell with multiple compatible `candidates` provides a dropdown to override the chosen version and recompute that environment's dependency closure.

### Status Symbols & Highlighting (M3.3)

| Symbol | Kind | Color | Meaning |
|---|---|---|---|
| `✓` | `ok` | Green | No issues in active environments |
| `⚠` | `warning` | Amber | Actionable warning (e.g., required entry or dependency deselected, pin conflict, or unverified platform fallback) |
| `⚠` (with `!`) | `error` | Red | Missing compatible version or unavailable required dependency |
| `?` | `unknown` | Purple | Environment support is `unknown` on Modrinth |
| `✗` | N/A | Muted | Project is `unsupported` in that environment (rendered inside the cell) |

See [Concepts — Status and Symbol Reference](concepts.md#8-status-and-symbol-reference) for all status reasons.

### Additional Outputs (M4)

- **`<collectionId>-client.zip` & `<collectionId>-server.zip`:** Downloads primary files for entries selected in the respective environment into per-type folders (`mods/`, `plugins/`, `datapacks/`, `resourcepacks/`, `shaderpacks/`).
- **`<collectionId>.mrpack`:** Generates a Modrinth modpack archive (`modrinth.index.json`) referencing CDN URLs, SHA-1/SHA-512 hashes, and per-environment support annotations.
- **Offline `instance.json` Import:** Re-imports a previously saved `instance.json` file to restore the full review state without network requests.
