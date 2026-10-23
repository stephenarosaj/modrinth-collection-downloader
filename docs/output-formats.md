# Output Formats

All exports are generated from the single in-memory **Instance** model (`src/core/model.ts`) via pure projection functions:

- `toFileTree(instance)` → `<collectionId>-client.zip` and `<collectionId>-server.zip`
- `serialize(instance)` → `instance.json`
- `toMrpack(instance, opts)` → `<collectionId>.mrpack`

---

## 1. Environment Zip Archives (`client.zip` & `server.zip`)

### Archive Filenames & Scope

- **Client archive:** `<collectionId>-client.zip`
- **Server archive:** `<collectionId>-server.zip`
- Each archive includes **only** entries where `environments[env].selection.on === true` and `environments[env].version !== null`, using that environment's chosen `VersionRef`.
- Exporting an environment's zip requires that environment's top-level toggle to be **on** and at least one entry to be selected in that environment.
- Binaries are fetched only at export time, with progress reporting, cancellation support (`AbortSignal`), and partial-failure reporting (failed downloads are reported to the user while successful downloads are still packaged).

### Folder Layout by Project Type

Inside each `.zip`, files are placed in directories corresponding to their `ProjectType`:

| Project Type | Target Directory in Zip |
|---|---|
| `mod` | `mods/` |
| `plugin` | `plugins/` |
| `datapack` | `datapacks/` |
| `resourcepack` | `resourcepacks/` |
| `shader` | `shaderpacks/` |

### File Naming Convention

Every packaged binary is renamed deterministically to:

```text
{Title}-{Platform}-{GameVersion}-{VersionNumber}.{ext}
```

For platform-agnostic project types (`datapack`, `resourcepack`, `shader`), `{Platform}-` is omitted:

```text
{Title}-{GameVersion}-{VersionNumber}.{ext}
```

#### Component Rules

1. **`{Title}`:**
   - Split `project.title` on whitespace.
   - Capitalize the first character of each word (leaving remaining characters unchanged).
   - Strip all non-alphanumeric (`[^A-Za-z0-9]`) characters.
   - Join the words without separators (e.g., `"Better Third Person"` → `"BetterThirdPerson"`).
2. **`{Platform}`:**
   - Display name of the target platform (`Forge`, `Fabric`, `NeoForge`, `Quilt`, `Paper`, etc.; falls back to title-case).
   - **Omitted** for `datapack`, `resourcepack`, and `shader`.
3. **`{GameVersion}`:**
   - The Instance's target game version (`instance.meta.target.gameVersion`, e.g., `1.20.1`).
4. **`{VersionNumber}`:**
   - The chosen version's `versionNumber` with characters `\ / : * ? " < > |` and whitespace replaced by `-`.
5. **`{ext}`:**
   - Extracted from the primary file's original `filename` (e.g., `jar`, `zip`).
6. **Collision Handling:**
   - If two entries in the same folder produce the same filename, append `-2`, `-3`, etc. immediately before `.{ext}` (e.g., `ExampleMod-Fabric-1.20.1-1.0.0-2.jar`).

---

## 2. Instance JSON (`instance.json`)

- **Filename:** `instance.json` (or `<collectionId>-instance.json`).
- **Contents:** Pretty-printed JSON produced by `serialize(instance)` with stable key ordering, validated against [`schema/instance.schema.json`](../schema/instance.schema.json).
- **Offline Restore:** Importing `instance.json` via `deserialize(json)` validates the payload against the schema and restores the full review UI state without making any network requests.
- See [Instance Format (`instance.json`)](instance-format.md) for full field documentation.

---

## 3. Modrinth Modpack (`.mrpack`)

### Archive Structure

- **Filename:** `<collectionId>.mrpack` (a ZIP archive).
- **Contents:** Contains `modrinth.index.json` (`formatVersion: 1`, `game: "minecraft"`, `versionId`, `name`, `files[]`, `dependencies`).
- **Zero Binary Downloads:** Exporting `.mrpack` does **not** download project binaries. Instead, each entry in `files[]` references the Modrinth CDN URL in `downloads[]`, along with `hashes.sha1`, `hashes.sha512`, and `fileSize` from `VersionRef.file`.

### File Paths & Project Types

| Project Type | `files[].path` in `modrinth.index.json` | Notes |
|---|---|---|
| `mod` | `mods/<filename>` | Uses `toFileTree` naming convention |
| `resourcepack` | `resourcepacks/<filename>` | Uses `toFileTree` naming convention |
| `shader` | `shaderpacks/<filename>` | Uses `toFileTree` naming convention |
| `datapack` | `datapacks/<filename>` | Subject to §9 VERIFY item 4 (launcher behavior documented in `docs/modrinth-api-notes.md`) |
| `plugin` | _Excluded_ | Excluded from `.mrpack` with a visible warning at export time |

### Environment Mapping (`files[].env`)

For each exported project:
- For `env` in `['client', 'server']`:
  - If the entry is **selected** (`selection.on === true`) in `env`: `files[].env[env]` is set to the project's support value (`'required'` or `'optional'`; if support is `'unknown'`, it maps to `'optional'`).
  - If the entry is **not selected** in `env`: `files[].env[env]` is set to `'unsupported'`.
- **Same vs. Different Chosen Versions Across Environments:**
  - If `client` and `server` selected the **same** `version.id` (or only one environment is selected), emit **one** entry in `files[]`.
  - If `client` and `server` are both selected and resolved to **different** `version.id`s, emit **two** entries in `files[]` — one for the client version (`env: { client: ..., server: 'unsupported' }`) and one for the server version (`env: { client: 'unsupported', server: ... }`).

### Root Dependencies (`modrinth.index.json` `dependencies`)

- Always includes `"minecraft": "<gameVersion>"`.
- **Optional Platform Version:** The UI provides an optional "Platform version" input field at export time (e.g., a specific Fabric loader version).
  - If provided, the corresponding platform dependency key (`fabric-loader`, `quilt-loader`, `forge`, `neoforge`) is added to `dependencies`.
  - If left blank, only `"minecraft"` is written to `dependencies` (see `docs/modrinth-api-notes.md` §4 for launcher verification details).
