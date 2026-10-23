# User Guide

This guide walks step-by-step through loading a Modrinth collection (or importing a saved `instance.json` offline), enabling **Environment** columns, reviewing and customizing project selections and versions across per-type tables, inspecting transitive dependencies and skipped projects, and exporting an Instance (`instance.json`, `client.zip`, `server.zip`, and `.mrpack`) with **Modrinth Collection Downloader** (`modrinth-collection-downloader`).

> _Terminology Note:_ Throughout the app and documentation, `client` and `server` are always referred to as **Environments**, and mod/plugin ecosystems (`Fabric`, `Quilt`, `Forge`, `NeoForge`, `Paper`, etc.) are always referred to as **Platforms**. See [Concepts & Domain Reference](concepts.md) for the complete glossary and rules.

---

## 1. Entering a Collection & Target Configuration (or Importing `instance.json`)

When you open the application, the configuration panel at the top lets you specify which Modrinth collection to load and the target parameters for version resolution—or restore a previously saved `instance.json` file offline:

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
6. **Import instance.json (Offline Restore):**
   - Alternatively, click **Import instance.json** at any time to load a previously exported `<collectionId>-instance.json` file from disk and immediately restore the full review workspace without making any network requests (see [Section 11 — Exporting & Importing `instance.json`](#11-exporting--importing-instancejson-offline-restore)).

### Monitoring or Cancelling Resolution

While the collection is resolving, the **Resolution Progress** panel displays:

- **Progress Bar & Step Counts:** Shows `completed / total` resolution steps as the app fetches collection metadata, batched project details, per-project compatible versions, and transitive required dependencies.
- **Activity Log:** Streams status messages for each stage of resolution.
- **Cancel:** Click **Cancel** at any time while resolution is running to abort in-flight Modrinth API requests cleanly and return to the form.

---

## 2. Enabling Environment Columns (Client & Server Toggles)

Above the review tables, two top-level **Environment** toggles control interaction and export gating for the **Client** and **Server** columns:

- **Off by Default:** Both **Client** and **Server** environment toggles start **off by default** when a collection is loaded or an `instance.json` file is imported. The tool never assumes whether you are building a client instance, a server instance, or both.
- **Locked (Toggle Off) State:** While an environment toggle is off:
  - That environment's column across all project-type tables is visually grayed out.
  - All checkboxes (including the header **Select All** checkbox) and version dropdowns in that column are disabled (`disabled`), preventing accidental edits.
  - The underlying selections and resolved versions **still show through** (grayed out, not blanked), so you can preview what is resolved before unlocking the column.
  - Status symbols for that environment are suppressed, and that environment's zip export button (**Export client.zip** or **Export server.zip**) is disabled until the toggle is turned on.
- **Unlocked (Toggle On) State:**
  - Turning an environment toggle **on** immediately unlocks interaction for that column across all tables, activates status evaluation for that environment, and enables that environment's zip export button (when at least one entry is selected in that environment).
  - Turning an environment toggle **off** again locks interaction without discarding or resetting any of your custom selections or version overrides—re-enabling the toggle restores your exact state.

---

## 3. Reading the Per-Type Review Tables

Once resolution (or `instance.json` import) completes, the **Instance** is displayed as review tables grouped by **Project Type** in canonical order:

1. **Mods** (`mod`)
2. **Plugins** (`plugin`)
3. **Datapacks** (`datapack`)
4. **Resource Packs** (`resourcepack`)
5. **Shaders** (`shader`)

Only project types that have at least one resolved collection entry or visible dependency entry are rendered.

### Table Columns

Each project-type table contains the following columns:

- **Status Column (Thin Unnamed Left Column):**
  - Displays the row's overall status symbol (`✓`, amber `⚠`, red `⚠` with `!`, or purple `?`) representing the highest-priority status across **active** (toggled-on) environments. While both **Client** and **Server** toggles are off, this column remains blank. See [Section 9 — Status Symbols, Tooltips & Visual Highlights](#9-status-symbols-tooltips--visual-highlights) for full details.
- **Name:**
  - Displays the project's title (`project.title`).
  - Includes an **Open on Modrinth ↗** link (`https://modrinth.com/<type>/<slug>`) that opens the project page in a new tab.
- **Platform:**
  - For platform-specific project types (`Mods` and `Plugins`), displays the target **Platform** (e.g., `Fabric`, `NeoForge`, `Paper`).
  - For platform-agnostic project types (`Datapacks`, `Resource Packs`, and `Shaders`), displays `—` because those formats depend only on the **Game Version**.
- **Client** and **Server** (Environment Columns):
  - Every project is evaluated independently for the `client` and `server` **environments**. Each environment column has its own support level, resolved version, selection state, status ring, and dependency graph.

### Reading Environment Cells

Each **Client** and **Server** cell reflects that environment's independent support level and version resolution outcome:

- **Selection Checkbox:**
  - Selectable cells (`support !== 'unsupported'` and `version !== null`) display a checkbox to include or exclude the project in that environment.
- **Version Dropdown (`candidates`):**
  - Displays the currently chosen `versionNumber` (e.g., `0.100.8+1.20.1` or `mc1.20.1-0.5.8`) and allows switching to any other compatible candidate version in that environment.
  - Non-release candidates append their release channel in parentheses (`(beta)` or `(alpha)`), and game-version fallback candidates (versions whose Modrinth metadata omitted platform tags) append `[unverified platform]` in the dropdown options so you can distinguish verified versions from fallback versions.
- **Support Tags (`required`, `optional`, `unknown`):**
  - Alongside a supported environment cell, a badge indicates Modrinth's declared support level for that environment:
    - `required` — The project must be present in this environment.
    - `optional` — The project can be installed in this environment optionally.
    - `unknown` — The project's metadata on Modrinth does not specify whether this environment is required or optional. Projects with `unknown` support are selectable and included in the initial selection by default.
- **Selection-Source Badges (`auto`, `user off`):**
  - `auto` — Displayed when a cell is currently selected automatically as a required dependency (`on: true, source: 'auto'`).
  - `user off` — Displayed when a cell was explicitly unchecked by you (`on: false, source: 'user'`), indicating that automatic dependency resolution will not re-enable it.
- **Unverified Platform Indicator (`unverified platform`):**
  - If a `mod` or `plugin` version matched the target **Game Version** via the game-version fallback rule (the version's `platforms` array on Modrinth was empty or omitted), the cell displays an `unverified platform` indicator (`resolution: 'game-version-fallback'`).
- **Unsupported Environment (`✗`):**
  - When a project's support for an environment is `unsupported` (for example, a client-only shader in the **Server** column, or a server-only plugin in the **Client** column), the cell renders `✗` with no checkbox or version dropdown.
- **No Compatible Version (`"No compatible version"`):**
  - When the environment is supported (`required`, `optional`, or `unknown`) but no version on Modrinth matches the target **Game Version** and **Platform**, the cell is disabled and reads `"No compatible version"` (`version === null`, `resolution: 'none'`).

---

## 4. Selecting & Deselecting Projects & Header Select-All

Once you enable the **Client** or **Server** environment toggle, you can customize which projects are included in that environment:

### Initial Default Selection

When a collection is resolved (or re-resolved):
- Every **collection** entry is selected by default (`on: true, source: 'user'`) in every environment where it is selectable (`required`, `optional`, and `unknown` support included).
- Every **dependency** entry is automatically selected (`on: true, source: 'auto'`) in an environment if and only if it is selectable there and transitively required by at least one selected entry's chosen version in that environment. It is not selected in environments where no selected entry requires it, even if a compatible version exists there.

### Per-Cell Checkboxes

- Each selectable cell in the **Client** and **Server** columns has its own checkbox.
- Checking or unchecking a cell in **Client** affects only the `client` environment; **Server** selection is completely independent.

### Header Select-All (Tri-State Checkbox)

Each project-type table header includes a **Select All** checkbox for **Client** and **Server**:

- **Scope:** Header Select-All acts on that table's selectable **collection rows** in that environment. Dependency rows in the footer are not toggled directly by the header checkbox; instead, they follow automatically via the dependency auto-select and auto-deselect rules.
- **Tri-State Indicator:**
  - **Checked (`checked`):** Every selectable collection row in the table is currently selected for that environment. Clicking unchecks all collection rows in that table and environment (and auto-deselects any auto-selected dependencies no longer needed).
  - **Indeterminate (`indeterminate`):** Some, but not all, selectable collection rows in the table are selected for that environment. Clicking selects all selectable collection rows in that table and environment (and auto-selects their required dependencies).
  - **Unchecked (`unchecked`):** No selectable collection rows in the table are selected for that environment (or the table has no selectable collection rows). Clicking selects all selectable collection rows in that table and environment.

---

## 5. Automatic Dependency Selection & User Overrides

Required dependencies are managed automatically per environment as you select or deselect projects, while always respecting explicit user overrides.

### Automatic Selection & Deselection (`source: 'auto'`)

- **Auto-Select on Check:** When you check a project in an environment (or use **Select All**), the app traverses all transitive `required` dependencies of that project's chosen version in that environment. Any selectable dependency that is not already selected—and has **not** been explicitly unchecked by you—is automatically selected (`on: true, source: 'auto'`) and displays the `auto` badge in its cell.
- **Auto-Deselect on Uncheck:** When you uncheck a project in an environment (or use **Deselect All**), any dependency that was selected automatically (`source: 'auto'`) and is no longer transitively required by *any* remaining selected project in that environment is automatically deselected (`on: false, source: 'auto'`).

### Explicit User Overrides ("User-off Stays Off" & "User-on Stays On")

The last actor (`user` vs. `auto`) determines a cell's selection source:

- **Manual Uncheck ("User-off stays off"):** If you manually uncheck a dependency row (`on: false, source: 'user'`), its cell displays a `user off` badge and **remains unchecked** even if you subsequently select, deselect and re-select, or use **Select All** on projects that require it. The app will never force-enable a dependency you explicitly turned off (instead, when that environment is active and a selected project requires the unchecked dependency, the cell and row are highlighted with an amber `REQUIRED_DEPENDENCY_NOT_SELECTED` warning). To include it again, simply check the dependency's checkbox manually.
- **Manual Check ("User-on stays on"):** If you manually check a dependency row (`on: true, source: 'user'`), its source becomes `'user'` (clearing the `auto` badge). If you later deselect the parent project(s) that required it, your manually checked dependency **remains checked** rather than being auto-deselected.

### Visual Feedback (Cell Flash & Toast Notification)

Whenever an action causes one or more dependencies to be auto-selected or auto-deselected:

1. **Cell Flash (~1 second):** Every environment cell whose selection changed automatically (`changes`) plays a 1-second highlight flash animation so you can immediately see which dependencies were affected.
   - **Reduced Motion (`prefers-reduced-motion: reduce`):** If your operating system or browser has reduced motion enabled, the animated flash is replaced with a crisp static outline around the affected cells for 1 second.
2. **Announcement Toast:** An accessible status toast message announces the automatic change (for example, `"Auto-selected 2 client dependencies"` or `"Auto-deselected 1 server dependency"`).

---

## 6. Switching Project Versions Per Environment

When a project has multiple compatible versions in an environment (`candidates`), you can override the resolver's default choice using the cell's version dropdown:

1. Ensure the target environment toggle (**Client** or **Server**) is turned **on**.
2. Open the version dropdown in that project's **Client** or **Server** cell and choose a different version from the `candidates` list.
3. The cell's resolution state becomes `'user'` (`resolution: 'user'`), and the app immediately **recomputes the dependency closure for that environment**:
   - If the newly selected version requires additional dependencies not yet in the Instance, the app fetches their project and version metadata from Modrinth and adds them to the appropriate table's **Dependencies** footer.
   - Newly required selectable dependencies are auto-selected (`source: 'auto'`, unless explicitly turned off by you), and previously auto-selected dependencies that are no longer needed by any selected project in that environment are auto-deselected.
   - Any auto-selected or auto-deselected dependency cells flash for 1 second alongside a summary toast.
4. Because `client` and `server` are independent lanes, switching a project's version in **Client** does not alter its chosen version or dependency closure in **Server**.

---

## 7. Changing Target Settings & Re-Resolve Confirmation

After loading a collection, you may want to switch to a different **Game Version**, **Platform**, or **Release Preference** in the top configuration bar:

- **Unmodified Selections:** If you have not modified any project selections away from the initial default state, changing a target setting and re-resolving proceeds immediately.
- **Modified Selections (Confirmation Dialog):** If any project's selection in either environment differs from the initial default state (for example, you unchecked a mod, manually toggled a dependency, or used **Deselect All**), changing the **Game Version**, **Platform**, or **Release Preference** prompts a confirmation dialog before re-resolving.
  - **Confirm:** Re-runs full resolution against the new target settings and **resets all selections to the initial default state** (all selectable collection entries selected, and their required dependencies auto-selected).
  - **Cancel:** Keeps your current target settings, resolved versions, and custom selections intact.

---

## 8. Reading the Dependencies Footer

During resolution (and when switching project versions), the app computes the transitive closure of all `required` dependencies for each chosen version in each environment (`optional`, `incompatible`, and `embedded` dependencies are ignored).

- **Placement:** If a project is pulled in solely as a required dependency (`origin: 'dependency'`), it appears in the **Dependencies** footer section at the bottom of its corresponding project-type table, using the same **Name**, **Platform**, **Client**, and **Server** columns and interactive controls as collection rows.
- **`required by` Attribution:** Each dependency row lists which entries require it and in which environment(s), formatted as:
  - `required by: <Project Title> (client)`
  - `required by: <Project A>, <Project B> (server)`
  - If a dependency is required in both environments, attributions are shown for both `client` and `server`.
- **Collection Precedence:** If a required dependency is *already* an explicit member of the Modrinth collection (`origin: 'collection'`), it remains in the main collection rows of its table rather than being duplicated in the **Dependencies** footer.

---

## 9. Status Symbols, Tooltips & Visual Highlights

As you review and customize selections in active **Environment** columns, the table's left status column, row tints, and per-cell status rings provide immediate visual and accessible feedback on version compatibility, dependency availability, and selection warnings.

### Inactive Environments Are Excluded Until Toggled On

Status symbols and highlights are computed **exclusively for active (toggled-on) environments**:

- When both **Client** and **Server** top-level toggles are **off** (the initial state on load), no row status symbols, row tints, or per-cell status rings are shown.
- When only **Client** is toggled **on**, the row status symbol, tooltip, row tint, and cell rings reflect **Client** only—any potential warnings or errors in the inactive **Server** column are ignored and remain unhighlighted until **Server** is toggled on.
- When both **Client** and **Server** are toggled **on**, both environments are evaluated and aggregated.

### Reading the Left Status Column

The thin, unnamed leftmost column of every collection and dependency row displays a single status badge representing the **worst status across active environments** using the priority order `error > warning > unknown > ok`:

| Symbol | Kind | Shape & Color | Meaning |
|---|---|---|---|
| `✓` | `ok` | Green check | All active, supported environments on this row resolved cleanly with no warnings or errors |
| `⚠` | `warning` | Amber warning triangle | At least one active environment has an actionable warning (and neither has an error) |
| `⚠` | `error` | Red error triangle with exclamation (`!`) | At least one active environment has a missing version or an unavailable required dependency |
| `?` | `unknown` | Purple question circle | Environment support on Modrinth is `unknown` in at least one active environment (and no errors or warnings apply) |

- **Distinct Shapes & Accessibility:** Every status symbol pairs color with a distinct geometric shape (`✓` check, `⚠` triangle, `⚠` triangle with exclamation `!`, `?` circle) and an accessible `aria-label` so color is never the only signal.
- **Unsupported Cells (`✗`):** An `unsupported` cell renders `✗` inside the environment cell itself and contributes no status—unless a selected project in that active environment requires it (`NEEDED_BUT_UNAVAILABLE`).

### Hover & Keyboard-Focus Status Tooltips

Every status badge in the left column is keyboard-focusable (as a native `<button type="button">`) and reveals a tooltip on mouse hover or keyboard focus explaining every status reason for each **active** environment, prefixed with `Client:` or `Server:`:

| Reason | Kind | In-App Tooltip Text (`Client: <message>` / `Server: <message>`) | When It Appears |
|---|---|---|---|
| `NO_COMPATIBLE_VERSION` | `error` | `Client: No compatible version is available for this environment.` / `Server: No compatible version is available for this environment.` | The project supports this environment (`support !== 'unsupported'`), but no compatible version exists for the target **Game Version** and **Platform**. |
| `DEPENDENCY_UNAVAILABLE` | `error` | `Client: A required dependency is unavailable in this environment.` / `Server: A required dependency is unavailable in this environment.` | This entry is selected in this environment, and at least one of its required dependencies is `unsupported` or has no compatible version here. |
| `NEEDED_BUT_UNAVAILABLE` | `error` | `Client: Required by a selected entry in this environment, but unavailable here.` / `Server: Required by a selected entry in this environment, but unavailable here.` | At least one selected entry in this environment requires this entry, but this entry is `unsupported` or has no compatible version here. |
| `REQUIRED_NOT_SELECTED` | `warning` | `Client: Marked as required for this environment, but explicitly deselected.` / `Server: Marked as required for this environment, but explicitly deselected.` | Modrinth marks this project as `required` in this environment, and you explicitly unchecked it (`user off`). |
| `REQUIRED_DEPENDENCY_NOT_SELECTED` | `warning` | `Client: Required by a selected entry in this environment, but not selected.` / `Server: Required by a selected entry in this environment, but not selected.` | At least one selected entry in this environment requires this dependency, a compatible version is selectable, but the dependency is currently unchecked. |
| `PIN_CONFLICT` | `warning` | `Client: Multiple entries pin different versions of this dependency; resolved to the newest compatible pin.` / `Server: Multiple entries pin different versions of this dependency; resolved to the newest compatible pin.` | Multiple requiring entries in this environment pin different compatible versions of this dependency; the resolver automatically picked the newest compatible pin. |
| `PLATFORM_UNVERIFIED` | `warning` | `Client: Resolved via game-version fallback (version does not explicitly list a platform).` / `Server: Resolved via game-version fallback (version does not explicitly list a platform).` | The chosen `mod` or `plugin` version matched the target **Game Version** via fallback because its Modrinth metadata omitted explicit platform tags. |
| `SUPPORT_UNKNOWN` | `unknown` | `Client: Environment support is unknown on Modrinth.` / `Server: Environment support is unknown on Modrinth.` | Modrinth does not specify whether this environment is `required`, `optional`, or `unsupported`. |
| *(none — `ok`)* | `ok` | `OK` (row tooltip) / `Client: OK` or `Server: OK` (cell tooltip) | Active environment(s) have no errors, warnings, or unknown support flags. |

If an entry has multiple reasons across one or both active environments, the tooltip lists each `Client: ...` and `Server: ...` line in order.

### Row Tints vs. Per-Environment Cell Rings

To make it effortless to scan large tables and immediately identify *which* environment has an issue, the UI combines two complementary layers of highlighting:

1. **Row-Wide Background Tint:**
   - The entire row receives a subtle background tint matching the row's overall status (`red` for `error`, `amber` for `warning`, `purple` for `unknown`, or no tint for `ok`).
2. **Per-Environment Cell Rings:**
   - Within a tinted row, an outline **ring** is drawn **only around the specific active environment cell(s)** (`Client`, `Server`, or both) whose own status is not `ok`:
     - **Red cell ring (`error`):** Highlights the exact environment cell with `NO_COMPATIBLE_VERSION`, `DEPENDENCY_UNAVAILABLE`, or `NEEDED_BUT_UNAVAILABLE`.
     - **Amber cell ring (`warning`):** Highlights the exact environment cell with `REQUIRED_NOT_SELECTED`, `REQUIRED_DEPENDENCY_NOT_SELECTED`, `PIN_CONFLICT`, or `PLATFORM_UNVERIFIED`.
     - **Purple cell ring (`unknown`):** Highlights the exact environment cell with `SUPPORT_UNKNOWN`.
   - For example, if a mod resolves cleanly (`ok`) in **Client** but has no compatible version (`error`) in **Server** while both environments are active, the row receives a red tint and a red `⚠` symbol, **Server** receives a red cell ring, and **Client** has no ring—showing at a glance that only **Server** is affected.

### Dual Highlighting When a Dependency Is Unavailable

When a project selected in an active environment requires a dependency that is unavailable in that environment (`version === null` or `support === 'unsupported'`), **both** rows are highlighted with red `error` status and red cell rings in that environment so you can trace both ends of the broken dependency link:

- **On the Dependent (Parent) Row:** The selected project's cell in that environment gets a red ring and reason `DEPENDENCY_UNAVAILABLE` (`"<Env>: A required dependency is unavailable in this environment."`).
- **On the Dependency (Child) Row:** The dependency entry (always visible in the **Dependencies** footer or main table rows) gets a red ring on that same environment cell—even if the cell displays `✗` (`unsupported`) or `"No compatible version"`—and reason `NEEDED_BUT_UNAVAILABLE` (`"<Env>: Required by a selected entry in this environment, but unavailable here."`).
- Unchecking the parent project in that environment immediately clears both `DEPENDENCY_UNAVAILABLE` on the parent and `NEEDED_BUT_UNAVAILABLE` on the dependency (unless another selected project in that environment also requires it).

---

## 10. Skipped Projects Section

Not every item returned by Modrinth can be packaged as an individual project file inside an instance. Projects that cannot be resolved into table entries are listed in the **Skipped Projects** section below the review tables:

- **`modpack` Projects:** Modrinth collections sometimes include full modpack projects (`project_type: "modpack"`). Because modpacks are multi-project archives rather than individual mods or packs, they are skipped with the reason that modpack projects are not supported.
- **`.mrpack` Primary Files & Unsupported Types:** Any project whose resolved primary file is a `.mrpack` archive or whose project type is unrecognized is refused and listed in **Skipped Projects** along with its title, **Open on Modrinth ↗** link, and the specific skip reason.

Skipped projects are informational only and are never included in exports.

---

## 11. Exporting & Importing `instance.json` (Offline Restore)

You can save a complete, lossless snapshot of your current **Instance** (including all custom selections and per-environment version overrides) and reload it later without touching the network.

### Exporting `<collectionId>-instance.json`

1. Click **Export instance.json** in the export bar above the review tables.
2. Before downloading, the app serializes the current `Instance` (`serialize(instance)`) and validates it against [`schema/instance.schema.json`](../schema/instance.schema.json).
3. Your browser downloads `<collectionId>-instance.json` (pretty-printed with deterministic key ordering).

What `<collectionId>-instance.json` contains:
- `schemaVersion: 1`
- `meta`: Collection name, source `collectionId` and `url`, target `gameVersion`, `platform`, and `releasePreference`, plus the `createdAt` ISO-8601 timestamp.
- `entries`: Every resolved collection and dependency entry, including both `client` and `server` environment states (`support`, `candidates`, chosen `version` with primary file CDN URL and `sha1`/`sha512` hashes, `resolution`, `dependencies`, `requiredBy`, and `selection`). Derived `status` is never stored in `instance.json`.

### Importing `instance.json` Offline

1. Click **Import instance.json** in the top configuration panel (or in the workspace header) and choose a saved `.json` file.
2. The app validates the file against [`schema/instance.schema.json`](../schema/instance.schema.json) via `deserialize(json)`.
3. **Zero Network Requests:** If valid, the full review workspace (`meta`, per-type tables, candidate version dropdowns, dependency footers, and saved `user`/`auto` selections) is restored immediately offline.
4. Both **Client** and **Server** top-level environment toggles start **off** (locked) on import so you can choose which environment(s) to unlock and export.
5. **Validation & Version Errors:** If the file is malformed JSON, fails schema validation, or uses an unsupported future `schemaVersion` (e.g., `schemaVersion: 2`), a clear error banner explains the failure without overwriting any existing state.

See [Instance Format (`instance.json`)](instance-format.md) for the full schema reference.

---

## 12. Exporting Environment Zip Archives (`client.zip` & `server.zip`)

Each **Environment** (`client` and `server`) can be exported as a ready-to-use `.zip` archive organized into per-type folders (`mods/`, `plugins/`, `datapacks/`, `resourcepacks/`, `shaderpacks/`).

### Prerequisites & Button Gating

- **Export client.zip** is enabled when the top-level **Client** environment toggle is **on** and at least one exportable entry is selected in `client`.
- **Export server.zip** is enabled when the top-level **Server** environment toggle is **on** and at least one exportable entry is selected in `server`.
- If an environment's toggle is off or no entries are selected in that environment, its zip export button is disabled.

### Downloading Binaries, Progress, Cancellation & Partial Failures

1. Click **Export client.zip** or **Export server.zip**.
2. **On-Demand Binary Fetching:** Project binaries (`.jar`, `.zip`) are downloaded from Modrinth's CDN only now, using each selected entry's chosen version for that environment.
3. **Deterministic Naming & Folder Layout:** Every downloaded file is placed into its project-type directory (`mods/`, `plugins/`, `datapacks/`, `resourcepacks/`, `shaderpacks/`) and renamed to `{Title}-{Platform}-{GameVersion}-{VersionNumber}.{ext}` (or `{Title}-{GameVersion}-{VersionNumber}.{ext}` for platform-agnostic types), with `-2`, `-3`, … appended before `.{ext}` if a filename collision occurs in the same folder.
4. **Live Progress & Cancel:** While binaries are downloading and the `.zip` archive is being packaged, a progress panel shows the current file count (`completed / total`), status message, and a **Cancel** button. Clicking **Cancel** aborts all in-flight downloads immediately and cancels archive creation.
5. **Partial-Failure Reporting ("Failed downloads are listed; successful ones still zip"):**
   - If one or more binary downloads fail while other files succeed, the app **still packages all successful downloads** into `<collectionId>-client.zip` or `<collectionId>-server.zip` and triggers the browser download.
   - A warning banner lists every failed file and its error reason so you can retry or download the missing file(s) individually.
   - If all binary downloads fail, no empty `.zip` is produced and the failure list is displayed.

---

## 13. Exporting a Modrinth Modpack (`.mrpack`)

You can also export the Instance as a lightweight `<collectionId>.mrpack` archive (`modrinth.index.json`, `formatVersion: 1`) for direct import into launchers such as **Prism Launcher** or the **Modrinth App**:

1. **Platform version (optional):**
   - In the export controls, you may optionally enter a **Platform version** (for example, `0.16.10` for Fabric or `21.1.72` for NeoForge).
   - If provided, `modrinth.index.json` includes the corresponding platform dependency key (`fabric` → `"fabric-loader"`, `quilt` → `"quilt-loader"`, `forge` → `"forge"`, `neoforge` → `"neoforge"`) alongside `"minecraft": "<gameVersion>"`.
   - If left blank (or if the target platform has no `.mrpack` dependency key), only `"minecraft": "<gameVersion>"` is written to `dependencies`.
2. **Plugin Exclusion Warning:**
   - Because the `.mrpack` format does not support server plugins, any selected `plugin` entries are excluded from `.mrpack` exports. Whenever one or more plugins are selected, a visible warning lists the excluded plugin titles (use **Export server.zip** to package plugins into `plugins/`).
3. **Click Export .mrpack:**
   - **Export .mrpack** is enabled whenever at least one non-plugin entry (`mod`, `datapack`, `resourcepack`, `shader`) is selected in either `client` or `server`.
   - Clicking **Export .mrpack** packages `modrinth.index.json` into `<collectionId>.mrpack` **instantly with zero binary downloads**—all files reference their Modrinth CDN URLs, `sha1`/`sha512` hashes, file sizes, and per-environment support (`"required"`, `"optional"`, or `"unsupported"`).
   - If `client` and `server` selected different versions of the same project, `.mrpack` automatically includes two separate file entries scoped to their respective environments.

See [Output Formats](output-formats.md) for full details on `.zip` naming rules, `.mrpack` structure, and launcher verification notes.
