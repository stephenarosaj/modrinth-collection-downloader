# Output Formats

All exports are generated from the single in-memory **Instance** model (`src/core/model.ts`) via pure projection functions (`src/core/projections.ts`, `src/core/serialize.ts`):

- `toFileTree(instance)` → `<collectionId>-client.zip` and `<collectionId>-server.zip`
- `serialize(instance)` / `deserialize(json)` → `<collectionId>-instance.json`
- `toMrpack(instance, opts)` → `<collectionId>.mrpack`

---

## 1. Environment Zip Archives (`<collectionId>-client.zip` & `<collectionId>-server.zip`)

### Archive Filenames & Environment Toggle Gating

- **Client archive:** `<collectionId>-client.zip`
- **Server archive:** `<collectionId>-server.zip`
- **Scope:** Each archive contains **only** exportable entries (`mod`, `plugin`, `datapack`, `resourcepack`, `shader`) where `environments[env].selection.on === true` (whether selected by `'user'` or `'auto'`) and `environments[env].version !== null`, using that environment's chosen `VersionRef`. Entries of type `modpack` or versions whose primary file ends with `.mrpack` are refused and excluded.
- **Environment Toggle & Selection Gating (§7.3.1, §8.1):**
  - **Export client.zip** is enabled only when the top-level **Client** environment toggle is **on** and at least one exportable entry is selected in `client`.
  - **Export server.zip** is enabled only when the top-level **Server** environment toggle is **on** and at least one exportable entry is selected in `server`.
  - If an environment's toggle is off or zero entries are selected in that environment, its zip export button is disabled.

### On-Demand Binary Fetching, Progress, Cancellation & Partial-Failure Packaging

- **Zero Upfront Binary Downloads:** Resolving a collection fetches only JSON metadata. Project binary files (`.jar`, `.zip`) are fetched on demand from Modrinth's CDN (`VersionRef.file.url`) only when you click **Export client.zip** or **Export server.zip**.
- **Progress Reporting:** While a zip export is running, the UI displays live progress covering both binary downloads (`completed / total` files and current filename) and ZIP archive generation percentage.
- **Cancellation (`AbortSignal`):** Clicking **Cancel** during a zip export aborts all in-flight binary fetches immediately and stops archive generation without triggering a browser download.
- **Partial-Failure Packaging ("Failed downloads are listed; successful ones still zip", §7.6):**
  - If one or more binary downloads fail (for example, due to a transient CDN or network error) while at least one file downloads cleanly, all successfully downloaded binaries are still packaged into `<collectionId>-<env>.zip` and downloaded by the browser.
  - Every failed download is listed in a visible warning report showing the failed file path/project and error message so you know exactly which files need attention.
  - If *all* binary downloads in the archive fail, no empty `.zip` is downloaded and the failure report is shown.

### Folder Layout by Project Type

Inside each `.zip`, files are placed into top-level directories corresponding to their `ProjectType`:

| Project Type | Target Directory in Zip |
|---|---|
| `mod` | `mods/` |
| `plugin` | `plugins/` |
| `datapack` | `datapacks/` |
| `resourcepack` | `resourcepacks/` |
| `shader` | `shaderpacks/` |

### Deterministic File Naming Convention (§8.1)

Every packaged binary is renamed deterministically by `formatEntryFilename` (`src/core/naming.ts`).

For platform-specific project types (`mod`, `plugin`):

```text
{Title}-{Platform}-{GameVersion}-{VersionNumber}.{ext}
```

Example: `BetterThirdPerson-Forge-1.20.1-1.9.0.jar`

For platform-agnostic project types (`datapack`, `resourcepack`, `shader`), `{Platform}-` is omitted:

```text
{Title}-{GameVersion}-{VersionNumber}.{ext}
```

Example: `FreshAnimations-1.20.1-1.9.2.zip`

#### Component Sanitization Rules

1. **`{Title}` (`formatTitle`):**
   - Split `project.title` on whitespace (`/\s+/`).
   - For each word, strip all non-ASCII-alphanumeric (`[^A-Za-z0-9]`) characters.
   - Upper-case the first character of each cleaned word and leave the remaining characters unchanged.
   - Join all words without separators (e.g., `"Better Third Person"` → `"BetterThirdPerson"`, `"Sodium Extra!"` → `"SodiumExtra"`).
   - If the sanitized title is empty, falls back to sanitizing `project.slug`, then `project.id`, or `"Project"`.
2. **`{Platform}` (`formatPlatformDisplayName`):**
   - Canonical display name of the Instance's target **Platform** (`Forge`, `Fabric`, `NeoForge`, `Quilt`, `Paper`, `Purpur`, `Spigot`, `Bukkit`, `Folia`, `Velocity`, `BungeeCord`, `Sponge`, etc.; unknown platforms fall back to title-case with non-alphanumeric separators removed).
   - **Omitted** for platform-agnostic project types (`datapack`, `resourcepack`, and `shader`).
3. **`{GameVersion}`:**
   - The Instance's target **Game Version** (`instance.meta.target.gameVersion`, e.g., `1.20.1`), with characters `\ / : * ? " < > |` and whitespace replaced by `-`.
4. **`{VersionNumber}` (`sanitizeVersionNumber`):**
   - The chosen version's `versionNumber` with reserved filesystem characters `\ / : * ? " < > |` and whitespace replaced by `-` (e.g., `"1.0.0+1.20.1"` → `"1.0.0+1.20.1"`, `"v1.2 / beta"` → `"v1.2---beta"`).
5. **`{ext}` (`extractExtension`):**
   - Extracted from the primary file's original `filename` after the final `.` (e.g., `jar`, `zip`).
6. **Collision Suffixing (`resolveUniqueFilename`):**
   - Collisions are tracked independently per folder (`mods/`, `plugins/`, `datapacks/`, `resourcepacks/`, `shaderpacks/`).
   - If two or more selected entries in the same folder produce the same base filename, the second and subsequent files append `-2`, `-3`, etc. immediately before `.{ext}`:
     - 1st file: `ExampleMod-Fabric-1.20.1-1.0.0.jar`
     - 2nd file: `ExampleMod-Fabric-1.20.1-1.0.0-2.jar`
     - 3rd file: `ExampleMod-Fabric-1.20.1-1.0.0-3.jar`

---

## 2. Instance JSON (`<collectionId>-instance.json`)

- **Filename:** `<collectionId>-instance.json`
- **Export (`serialize(instance)`):** Validates the in-memory `Instance` against [`schema/instance.schema.json`](../schema/instance.schema.json) and produces pretty-printed JSON (`2`-space indentation) with a canonical, deterministic property order.
- **Offline Import (`deserialize(json)`):** Parses and validates an uploaded `instance.json` file against [`schema/instance.schema.json`](../schema/instance.schema.json) and restores the full review workspace (`meta`, `entries`, per-environment candidate pools, chosen versions, dependency graphs, and `user`/`auto` selections) **without making any network requests**.
- **Lossless Round-Trip:** Exporting an imported (or newly resolved) Instance produces byte-for-byte identical JSON (`serialize(deserialize(json)) === json`). Derived `status` is computed on the fly and is never stored in `instance.json`.
- See [Instance Format (`instance.json`)](instance-format.md) for the complete schema specification and import error handling rules.

---

## 3. Modrinth Modpack (`<collectionId>.mrpack`)

### Archive Structure & Metadata-Only Packaging

- **Filename:** `<collectionId>.mrpack` (a standard ZIP archive containing `modrinth.index.json` at its root).
- **Index Format (`modrinth.index.json`):**
  ```json
  {
    "formatVersion": 1,
    "game": "minecraft",
    "versionId": "1.0.0",
    "name": "<instance.meta.name>",
    "files": [
      {
        "path": "mods/Sodium-Fabric-1.20.1-mc1.20.1-0.5.8.jar",
        "hashes": {
          "sha1": "<40-char sha1>",
          "sha512": "<128-char sha512>"
        },
        "env": {
          "client": "required",
          "server": "unsupported"
        },
        "downloads": [
          "https://cdn.modrinth.com/data/..."
        ],
        "fileSize": 954321
      }
    ],
    "dependencies": {
      "minecraft": "1.20.1",
      "fabric-loader": "0.16.10"
    }
  }
  ```
- **Zero Binary Downloads:** Exporting `.mrpack` does **not** fetch any project binaries. Each entry in `files[]` records the primary file's Modrinth CDN URL in `downloads[]`, cryptographic digests in `hashes.sha1` and `hashes.sha512`, and byte length in `fileSize` directly from `VersionRef.file`.

### File Paths & Project Types in `.mrpack`

| Project Type | `files[].path` in `modrinth.index.json` | Packaging Behavior |
|---|---|---|
| `mod` | `mods/<filename>` | Included using the §8.1 deterministic naming convention |
| `resourcepack` | `resourcepacks/<filename>` | Included using the §8.1 deterministic naming convention |
| `shader` | `shaderpacks/<filename>` | Included using the §8.1 deterministic naming convention |
| `datapack` | `datapacks/<filename>` | Included using the §8.1 deterministic naming convention; extracted to `<instance_root>/datapacks/<filename>` by launchers (see launcher verification below) |
| `plugin` | _Excluded_ | Excluded from `.mrpack`; triggers a visible warning listing the excluded plugins |
| `modpack` | _Excluded_ | Always skipped during resolution and excluded from all exports |

#### Plugin Exclusion Warning

Because the Modrinth `.mrpack` specification does not support server plugin platforms (`Paper`, `Purpur`, `Spigot`, `Bukkit`, `Folia`, `Velocity`, `BungeeCord`, `Sponge`), `toMrpack` excludes all `plugin` entries. Whenever one or more `plugin` entries are selected in `client` or `server`, `getMrpackWarnings(instance)` surfaces a visible warning in the export bar and upon `.mrpack` export:

> `<N> plugin(s) were excluded from .mrpack export (<Plugin Titles>): the Modrinth .mrpack format does not support plugins.`

To package selected plugins, use **Export server.zip** (or **Export client.zip**), which places them in `plugins/`.

### Environment Mapping (`files[].env`)

For each exported entry (`mod`, `datapack`, `resourcepack`, `shader`):

1. **Per-Environment Support Mapping (`toMrpackEnvSupport`):**
   - If the entry is **selected** (`selection.on === true`, `support !== 'unsupported'`, `version !== null`) in that environment:
     - `support === 'required'` → `"required"`
     - `support === 'optional'` or `support === 'unknown'` → `"optional"`
   - If the entry is **not selected** (or `support === 'unsupported'` / `version === null`) in that environment:
     - Maps to `"unsupported"`.
2. **Same vs. Split Versions Across `client` and `server` (§8.3):**
   - **Same Version (Single Entry):** If `client` and `server` selected the **same** `version.id` (or if only one environment is selected), `toMrpack` emits **one** entry in `files[]` with `env: { client: <clientEnv>, server: <serverEnv> }`.
   - **Different Versions (Split Entries):** If `client` and `server` are both selected and resolved or were overridden to **different** `version.id`s of the same project, `toMrpack` emits **two** separate entries in `files[]`:
     1. Client version entry with `env: { client: <clientEnv>, server: "unsupported" }`.
     2. Server version entry with `env: { client: "unsupported", server: <serverEnv> }` (if both versions format to the same filename in the same folder, collision suffixing appends `-2` before the extension on the second entry).

### Root Dependencies & Optional Platform Version (`modrinth.index.json` `dependencies`)

- `"minecraft"` is **always** set to `instance.meta.target.gameVersion` (e.g., `"1.20.1"`).
- **Optional Platform Version Input:** The export panel provides an optional **Platform version** text field (for example, `0.16.10` for Fabric or `21.1.72` for NeoForge).
  - When a non-empty **Platform version** is entered and the Instance's target **Platform** maps to a Modrinth `.mrpack` dependency key, `toMrpack` adds that key to `dependencies`:

    | Target Platform (`instance.meta.target.platform`) | `modrinth.index.json` `dependencies` Key |
    |---|---|
    | `fabric` | `"fabric-loader"` |
    | `quilt` | `"quilt-loader"` |
    | `forge` | `"forge"` |
    | `neoforge` | `"neoforge"` |
    | Other platforms (`paper`, `purpur`, `spigot`, etc.) | _None (only `"minecraft"` is written)_ |

  - When **Platform version** is left blank, `toMrpack` omits the platform dependency key and writes only `"minecraft": "<gameVersion>"` in `dependencies`.

### Launcher Verification Check (Prism Launcher & Modrinth App)

Per **§8.3** and **§13 (Milestone M4 acceptance criteria)**, `.mrpack` archives produced by `toMrpack` were verified against the Modrinth `.mrpack` `formatVersion: 1` specification and tested against **Prism Launcher** and the official **Modrinth App (Theseus)**:

| Verification Scenario | `modrinth.index.json` Structure | Prism Launcher Behavior | Modrinth App Behavior |
|---|---|---|---|
| **1. With Platform Version Provided** (e.g., `platform: "fabric"`, `platformVersion: "0.16.10"`) | `dependencies: { "minecraft": "1.20.1", "fabric-loader": "0.16.10" }` | Imports archive, automatically configures Minecraft `1.20.1` + Fabric `0.16.10`, verifies `sha1`/`sha512` hashes, and downloads all `files[]` from `downloads[]`. | Imports archive, creates a Minecraft `1.20.1` + Fabric `0.16.10` profile, verifies hashes, and downloads all `files[]`. |
| **2. With Platform Version Left Blank** (e.g., `platformVersion: ""`) | `dependencies: { "minecraft": "1.20.1" }` | Imports archive cleanly as a Minecraft `1.20.1` instance and downloads all `files[]`; user can attach or change the platform version in **Edit Instance → Version**. | Imports archive as a Minecraft `1.20.1` profile and downloads all `files[]`; user can select a platform version in profile settings. |
| **3. With `datapacks/<filename>` Entries** | `files[].path: "datapacks/<filename>.zip"` | Extracts/downloads the file to `<instance_root>/datapacks/<filename>.zip`. Requires either a global datapack mod (e.g., Paxi, Global Packs) or copying into `saves/<world>/datapacks/` for vanilla per-world loading. | Downloads the file to `<instance_root>/datapacks/<filename>.zip` and displays it under the profile's **Content → Data Packs** tab. Requires a global datapack mod or per-world copy for vanilla loading. |
| **4. Split `client` / `server` File Entries** | Two `files[]` entries with `{ client: "required", server: "unsupported" }` and `{ client: "unsupported", server: "required" }` | Client launcher installs only entries where `env.client !== "unsupported"`; server export/installers install entries where `env.server !== "unsupported"`. | Client profile installs entries where `env.client !== "unsupported"`; server deployments use `env.server`. |
