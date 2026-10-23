# Instance Format (`instance.json`)

`instance.json` is the complete, lossless serialization of an **Instance** (`schemaVersion: 1`). It allows saving a resolved and reviewed collection state to disk and re-importing it later without making network requests.

The authoritative JSON Schema lives in [`schema/instance.schema.json`](../schema/instance.schema.json).

---

## 1. Design Principles

- **Self-Contained Review State:** `instance.json` stores target metadata, all resolved collection and dependency entries, candidate version pools, chosen versions, dependency links, and user/auto selections for both `client` and `server` environments.
- **No Derived State:** `status` (`computeStatus(instance)`) is a pure derived projection and is **never** stored in `instance.json`.
- **No Embedded Binaries:** Binary files (`.jar`, `.zip`) are not embedded; instead, each `VersionRef` stores a `FileRef` containing the CDN download `url`, `filename`, `size`, `sha1`, and `sha512` hashes so binaries can be fetched on demand when exporting archives.
- **Deterministic Serialization:** `serialize(instance)` outputs pretty-printed JSON with a stable key order.
- **Strict Validation:** Both `serialize(instance)` (on export) and `deserialize(json)` (on import) validate against `schema/instance.schema.json`. Unknown future `schemaVersion` values produce a clear validation error.

---

## 2. TypeScript Schema Definition (`schemaVersion: 1`)

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

## 3. Field Reference

### Top-Level Fields

| Field | Type | Description |
|---|---|---|
| `schemaVersion` | `1` | Format version constant. Must be `1`. |
| `meta.name` | `string` | Collection name retrieved from Modrinth. |
| `meta.source.collectionId` | `string` | Modrinth collection ID. |
| `meta.source.url` | `string` | Canonical URL to the Modrinth collection. |
| `meta.target.gameVersion` | `string` | Target Minecraft version (e.g., `"1.20.1"`). |
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
