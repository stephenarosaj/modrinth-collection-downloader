# Instance Format (`instance.json`)

`instance.json` (`<collectionId>-instance.json`) is the complete, lossless serialization of an **Instance** (`schemaVersion: 1`). It allows saving a resolved and customized collection workspace to disk and re-importing it later offline without making any network requests.

The authoritative JSON Schema lives in [`schema/instance.schema.json`](../schema/instance.schema.json).

---

## 1. Design Principles & Lossless Round-Trip Guarantee

- **Self-Contained Review State:** `instance.json` stores target metadata (`gameVersion`, `platform`, `releasePreference`), all resolved collection and dependency entries, candidate version pools, chosen versions, dependency links (`dependencies` and `requiredBy`), and selection states (`on` + `source`: `'none'`, `'user'`, or `'auto'`) for both `client` and `server` **environments**.
- **No Derived State:** `status` (`computeStatus(instance)`) is a pure derived projection and is **never** stored in `instance.json`.
- **No Embedded Binaries:** Binary files (`.jar`, `.zip`) are not embedded in the JSON file; instead, each `VersionRef` stores a `FileRef` containing the Modrinth CDN download `url`, original `filename`, byte `size`, and `sha1` / `sha512` hashes so binaries can be fetched on demand when exporting `client.zip` or `server.zip` (or referenced directly in `.mrpack`).
- **Deterministic Serialization:** `serialize(instance)` (`src/core/serialize.ts`) outputs pretty-printed JSON (`2` spaces) with a canonical, deterministic property order (`schemaVersion`, `meta`, `entries`, and canonical nested keys).
- **Lossless Round-Trip (`serialize` ↔ `deserialize`):** Re-importing an exported `instance.json` file via `deserialize(json)` and re-exporting it via `serialize(instance)` produces an identical `Instance` and byte-for-byte identical JSON (`serialize(deserialize(json)) === json`).

---

## 2. Offline Import Workflow & Error Handling

### Restoring a Saved Instance Offline

1. Click **Import instance.json** in the top configuration panel (or in the workspace header) and choose a previously exported `.json` file from disk.
2. The application reads the file locally in the browser and passes the text to `deserialize(json)`.
3. **Zero Network Requests:** Importing `instance.json` makes **no** requests to `api.modrinth.com` or `cdn.modrinth.com`.
   - The top configuration bar (`Collection URL or ID`, `Game Version`, `Platform`, `Release Preference`) is synced to `instance.meta.source` and `instance.meta.target`.
   - Both top-level **Environment** toggles (**Client** and **Server**) reset to **off** (locked) until you explicitly turn them on, while preserving every entry's saved `Selection` (`on` and `source`) and chosen `version` underneath.
   - All per-type review tables, dependency footers, candidate version dropdowns, and skipped project entries are immediately restored from the imported `Instance`.
4. After importing, you can freely unlock **Client** or **Server**, adjust selections or switch candidate versions from the stored `candidates` pool, re-export `<collectionId>-instance.json`, export `<collectionId>.mrpack` (zero network requests), or export `<collectionId>-client.zip` / `<collectionId>-server.zip` (which fetches binaries on demand using the stored `FileRef.url` values).

### Schema & Version Validation Error Handling

Both `serialize(instance)` (on export) and `deserialize(json)` (on import) validate the payload against [`schema/instance.schema.json`](../schema/instance.schema.json) via `validateInstanceSchema(data)` (`additionalProperties: false` on every object):

- **Malformed JSON:** If the selected file is not valid JSON, `deserialize(json)` throws a clear error (`Invalid JSON in instance payload: ...`) and the UI displays an error banner without corrupting the current workspace.
- **Unsupported Future `schemaVersion`:** If the JSON payload specifies an unknown or future `schemaVersion` (for example, `schemaVersion: 2`), `deserialize(json)` immediately rejects it with a descriptive error:
  ```text
  Unsupported schemaVersion "2": only schemaVersion 1 is supported.
  ```
- **Schema Violations:** If any required field is missing, has the wrong type/enum value, or includes unexpected additional properties, `validateInstanceSchema(data)` reports the exact JSON path(s) (e.g., `$.meta.target.platform: expected a non-empty string`, `$.entries[0].environments.client.support: expected one of required, optional, unsupported, unknown`) and surfaces the error message in the UI.

---

## 3. TypeScript Schema Definition (`schemaVersion: 1`)

```ts
type EnvironmentId = 'client' | 'server';
type Support = 'required' | 'optional' | 'unsupported' | 'unknown';
type ProjectType = 'mod' | 'plugin' | 'datapack' | 'resourcepack' | 'shader' | 'modpack';
type VersionType = 'release' | 'beta' | 'alpha';

interface FileRef {
  filename: string;
  url: string;
  size: number;
  sha1: string;
  sha512: string;
}

interface VersionRef {
  id: string;
  versionNumber: string;
  versionType: VersionType;
  publishedAt: string;
  gameVersions: string[];
  platforms: string[];
  file: FileRef; // primary file
  dependencies: {
    projectId: string;
    versionId?: string;
    type: 'required' | 'optional' | 'incompatible' | 'embedded';
  }[];
}

// Last actor decides the source. off + 'user' means the user explicitly turned it off.
interface Selection {
  on: boolean;
  source: 'none' | 'user' | 'auto';
}

type Resolution =
  | 'pinned'
  | 'latest-compatible'
  | 'game-version-fallback'
  | 'user'
  | 'none';

interface EnvironmentState {
  support: Support;
  candidates: VersionRef[];   // compatible versions, preferred first
  version: VersionRef | null; // chosen version
  resolution: Resolution;
  dependencies: string[];     // projectIds of REQUIRED deps of chosen version
  requiredBy: string[];       // projectIds of entries requiring this entry in this environment
  selection: Selection;
}

interface Entry {
  project: {
    id: string;
    slug: string;
    title: string;
    type: ProjectType;
    modrinthUrl: string;
  };
  origin: 'collection' | 'dependency'; // 'collection' wins if both
  environments: Record<EnvironmentId, EnvironmentState>;
}

interface Instance {
  schemaVersion: 1;
  meta: {
    name: string;
    source: {
      collectionId: string;
      url: string;
    };
    target: {
      gameVersion: string;
      platform: string;
      releasePreference: 'stable' | 'newest';
    };
    createdAt: string; // ISO-8601 date-time
  };
  entries: Entry[];
}
```

---

## 4. Field Reference

### Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1` | Format version constant. Must be `1`. |
| `meta.name` | `string` | Collection name retrieved from Modrinth. |
| `meta.source.collectionId` | `string` | Modrinth collection ID. |
| `meta.source.url` | `string` | Canonical URL to the Modrinth collection. |
| `meta.target.gameVersion` | `string` | Target Minecraft game version (e.g., `"1.20.1"`). |
| `meta.target.platform` | `string` | Target platform identifier (e.g., `"fabric"`, `"neoforge"`). |
| `meta.target.releasePreference` | `'stable' \| 'newest'` | Release channel preference used during resolution. |
| `meta.createdAt` | `string` | ISO-8601 timestamp when the Instance was created/resolved. |
| `entries` | `Entry[]` | Registry of collection and dependency entries. |

### Entry & Environment Fields

| Field | Type | Description |
|---|---|---|
| `project` | `object` | Modrinth project metadata (`id`, `slug`, `title`, `type`, `modrinthUrl`). |
| `origin` | `'collection' \| 'dependency'` | Whether the entry came directly from the collection or was pulled in as a required dependency (`'collection'` takes precedence if both). |
| `environments.client` | `EnvironmentState` | Independent state for the `client` environment. |
| `environments.server` | `EnvironmentState` | Independent state for the `server` environment. |
| `EnvironmentState.support` | `Support` | Project support level in this environment (`required`, `optional`, `unsupported`, `unknown`). |
| `EnvironmentState.candidates` | `VersionRef[]` | Ordered pool of compatible versions available for selection. |
| `EnvironmentState.version` | `VersionRef \| null` | Currently chosen version for this environment (`null` if none compatible). |
| `EnvironmentState.resolution` | `Resolution` | How `version` was selected (`pinned`, `latest-compatible`, `game-version-fallback`, `user`, `none`). |
| `EnvironmentState.dependencies` | `string[]` | Project IDs of required dependencies of `version` in this environment. |
| `EnvironmentState.requiredBy` | `string[]` | Project IDs of entries whose chosen version in this environment requires this project. |
| `EnvironmentState.selection` | `Selection` | Selection toggle state (`on`) and actor (`source`: `'none'`, `'user'`, or `'auto'`). |
