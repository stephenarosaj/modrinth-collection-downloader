// Authoritative domain model, status, reducer, and projection types (§6, §7, §8).

export const CORE_SCHEMA_VERSION = 1 as const;

export type EnvironmentId = 'client' | 'server';

export const ENVIRONMENTS: readonly EnvironmentId[] = ['client', 'server'] as const;

export type Support = 'required' | 'optional' | 'unsupported' | 'unknown';

export const SUPPORTS: readonly Support[] = [
  'required',
  'optional',
  'unsupported',
  'unknown',
] as const;

export type ProjectType = 'mod' | 'plugin' | 'datapack' | 'resourcepack' | 'shader' | 'modpack';

export const PROJECT_TYPES: readonly ProjectType[] = [
  'mod',
  'plugin',
  'datapack',
  'resourcepack',
  'shader',
  'modpack',
] as const;

export type ExportableProjectType = Exclude<ProjectType, 'modpack'>;

/** Display and table order for exportable project types (§7.5). */
export const PROJECT_TYPE_ORDER: readonly ExportableProjectType[] = [
  'mod',
  'plugin',
  'datapack',
  'resourcepack',
  'shader',
] as const;

/** Project types that match on game version only, ignoring target platform (§7.1). */
export const PLATFORM_AGNOSTIC_TYPES: readonly ProjectType[] = [
  'resourcepack',
  'shader',
  'datapack',
] as const;

/** Output folder names per exportable project type (§8.1, §8.3). */
export const TYPE_FOLDER_MAP: Readonly<Record<ExportableProjectType, string>> = {
  mod: 'mods',
  plugin: 'plugins',
  datapack: 'datapacks',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
} as const;

export type VersionType = 'release' | 'beta' | 'alpha';

export const VERSION_TYPES: readonly VersionType[] = ['release', 'beta', 'alpha'] as const;

export type ReleasePreference = 'stable' | 'newest';

export const RELEASE_PREFERENCES: readonly ReleasePreference[] = ['stable', 'newest'] as const;

export type DependencyType = 'required' | 'optional' | 'incompatible' | 'embedded';

export const DEPENDENCY_TYPES: readonly DependencyType[] = [
  'required',
  'optional',
  'incompatible',
  'embedded',
] as const;

export interface FileRef {
  filename: string;
  url: string;
  size: number;
  sha1: string;
  sha512: string;
}

export interface VersionDependency {
  projectId: string;
  versionId?: string;
  type: DependencyType;
}

/** @deprecated Use `VersionDependency` instead. */
export type DependencyRef = VersionDependency;

export interface VersionRef {
  id: string;
  versionNumber: string;
  versionType: VersionType;
  publishedAt: string;
  gameVersions: string[];
  platforms: string[];
  /** The primary downloadable file for this version. */
  file: FileRef;
  dependencies: VersionDependency[];
}

export type SelectionSource = 'none' | 'user' | 'auto';

/**
 * Last actor decides the source. `on: false, source: 'user'` means the user explicitly turned it off (§6, §7.3).
 */
export interface Selection {
  on: boolean;
  source: SelectionSource;
}

export type Resolution = 'pinned' | 'latest-compatible' | 'game-version-fallback' | 'user' | 'none';

export const RESOLUTIONS: readonly Resolution[] = [
  'pinned',
  'latest-compatible',
  'game-version-fallback',
  'user',
  'none',
] as const;

export interface EnvironmentState {
  support: Support;
  /** Compatible versions, preferred first (§7.1). */
  candidates: VersionRef[];
  /** Chosen version, or null when no compatible version exists. */
  version: VersionRef | null;
  resolution: Resolution;
  /** Project IDs of REQUIRED dependencies of the chosen version (static per chosen version). */
  dependencies: string[];
  /** Project IDs of entries whose chosen version in this environment requires this entry (any selection state). */
  requiredBy: string[];
  selection: Selection;
}

export type EntryOrigin = 'collection' | 'dependency';

export interface ProjectMeta {
  id: string;
  slug: string;
  title: string;
  type: ProjectType;
  modrinthUrl: string;
}

export interface Entry {
  project: ProjectMeta;
  /** `'collection'` wins if a project is both in the collection and a dependency (§6). */
  origin: EntryOrigin;
  environments: Record<EnvironmentId, EnvironmentState>;
}

export interface InstanceSource {
  collectionId: string;
  url: string;
}

export interface InstanceTarget {
  gameVersion: string;
  platform: string;
  releasePreference: ReleasePreference;
}

export interface InstanceMeta {
  name: string;
  source: InstanceSource;
  target: InstanceTarget;
  createdAt: string;
}

export interface Instance {
  schemaVersion: 1;
  meta: InstanceMeta;
  /** The registry of collection and dependency entries. */
  entries: Entry[];
}

/** Skipped project record for modpacks and unknown project types (§7.5, §11). */
export interface SkippedProject {
  id: string;
  slug?: string;
  title: string;
  type: string;
  modrinthUrl?: string;
  reason: string;
}

export const MODPACK_SKIPPED_REASON =
  'Modpacks (.mrpack) cannot be downloaded as individual projects.';

/** @deprecated Use `SkippedProject` instead. */
export type SkippedItem = SkippedProject;

// ---------------------------------------------------------------------------
// Derived Status Types (§7.4) — never stored or serialized on Instance
// ---------------------------------------------------------------------------

export type Kind = 'ok' | 'warning' | 'error' | 'unknown';

export const KINDS: readonly Kind[] = ['ok', 'warning', 'error', 'unknown'] as const;

export type Reason =
  | 'NO_COMPATIBLE_VERSION'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'NEEDED_BUT_UNAVAILABLE'
  | 'REQUIRED_NOT_SELECTED'
  | 'REQUIRED_DEPENDENCY_NOT_SELECTED'
  | 'PIN_CONFLICT'
  | 'PLATFORM_UNVERIFIED'
  | 'SUPPORT_UNKNOWN';

export const REASONS: readonly Reason[] = [
  'NO_COMPATIBLE_VERSION',
  'DEPENDENCY_UNAVAILABLE',
  'NEEDED_BUT_UNAVAILABLE',
  'REQUIRED_NOT_SELECTED',
  'REQUIRED_DEPENDENCY_NOT_SELECTED',
  'PIN_CONFLICT',
  'PLATFORM_UNVERIFIED',
  'SUPPORT_UNKNOWN',
] as const;

export interface Status {
  kind: Kind;
  reasons: Reason[];
}

export interface EntryStatus {
  client: Status | null;
  server: Status | null;
  row: Status | null;
}

export type InstanceStatusMap = Map<string, Record<EnvironmentId, Status>>;

// ---------------------------------------------------------------------------
// Reducer Types (§6.1, §7.3)
// ---------------------------------------------------------------------------

export type ChangeReason = 'auto-selected' | 'auto-deselected';

export interface Change {
  projectId: string;
  env: EnvironmentId;
  on: boolean;
  reason: ChangeReason;
}

export type Action =
  | { type: 'select'; projectId: string; env: EnvironmentId }
  | { type: 'deselect'; projectId: string; env: EnvironmentId }
  | { type: 'select-all'; projectType: ProjectType; env: EnvironmentId }
  | { type: 'deselect-all'; projectType: ProjectType; env: EnvironmentId }
  | { type: 'set-version'; projectId: string; env: EnvironmentId; versionId: string }
  | { type: 'reset-selection' };

export interface ReducerResult {
  instance: Instance;
  changes: Change[];
}

// ---------------------------------------------------------------------------
// Projection Types (§6.1, §7.5, §8)
// ---------------------------------------------------------------------------

export interface TableRow {
  entry: Entry;
  project: ProjectMeta;
  origin: EntryOrigin;
  /** Target platform for platform-specific types (`mod`, `plugin`), or `null` for platform-agnostic types. */
  platform: string | null;
  environments: Record<EnvironmentId, EnvironmentState>;
  /** Titles of entries requiring this entry per environment (for the dependency footer). */
  requiredByTitles: Record<EnvironmentId, string[]>;
}

export interface TableModel {
  type: ExportableProjectType;
  /** Collection entries (`origin === 'collection'`). */
  rows: TableRow[];
  /** Dependency entries (`origin === 'dependency'`). */
  dependencies: TableRow[];
}

export interface FileTreeEntry {
  /** Full archive path, e.g. `"mods/Sodium-Fabric-1.20.1-0.5.8.jar"`. */
  path: string;
  /** Type folder, e.g. `"mods"`. */
  folder: string;
  /** Formatted file name, e.g. `"Sodium-Fabric-1.20.1-0.5.8.jar"`. */
  filename: string;
  projectId: string;
  versionId: string;
  type: ExportableProjectType;
  file: FileRef;
}

/** @deprecated Use `FileTreeEntry` instead. */
export type FileTreeItem = FileTreeEntry;

export interface FileTree {
  environment: EnvironmentId;
  files: FileTreeEntry[];
}

export type MrpackEnvSupport = 'required' | 'optional' | 'unsupported';

export interface MrpackFile {
  path: string;
  hashes: {
    sha1: string;
    sha512: string;
  };
  env: Record<EnvironmentId, MrpackEnvSupport>;
  downloads: string[];
  fileSize: number;
}

export interface MrpackIndex {
  formatVersion: 1;
  game: 'minecraft';
  versionId: string;
  name: string;
  summary?: string;
  files: MrpackFile[];
  dependencies: Record<string, string>;
}

export interface MrpackOptions {
  versionId?: string;
  name?: string;
  summary?: string;
  /** Optional loader/platform version (e.g. Fabric loader version) to include in `dependencies` (§8.3). */
  platformVersion?: string;
}

// ---------------------------------------------------------------------------
// Pure Domain Helpers
// ---------------------------------------------------------------------------

/**
 * A cell is selectable iff `support !== 'unsupported'` and `version !== null` (§7.3).
 */
export function isSelectable(state: Pick<EnvironmentState, 'support' | 'version'>): boolean {
  return state.support !== 'unsupported' && state.version !== null;
}

/**
 * Returns true if the project type matches on game version only (`resourcepack`, `shader`, `datapack`) (§7.1).
 */
export function isPlatformAgnostic(type: ProjectType | string): boolean {
  return (PLATFORM_AGNOSTIC_TYPES as readonly string[]).includes(type);
}

/**
 * Returns true if a version is a game-version fallback candidate with an unverified platform
 * (`!isPlatformAgnostic(projectType) && version.platforms.length === 0`) (§7.1).
 */
export function isUnverifiedPlatformCandidate(
  version: { platforms: readonly string[] },
  projectType: ProjectType | string,
): boolean {
  return !isPlatformAgnostic(projectType) && version.platforms.length === 0;
}

/**
 * Type guard checking if a project type is an exportable table type (excludes `'modpack'`).
 */
export function isExportableProjectType(type: ProjectType | string): type is ExportableProjectType {
  return (PROJECT_TYPE_ORDER as readonly string[]).includes(type);
}

/**
 * Extracts unique `projectId`s of `type === 'required'` dependencies from a version (§6, §7.2).
 */
export function extractRequiredDependencyIds(
  version: Pick<VersionRef, 'dependencies'> | null | undefined,
): string[] {
  if (!version) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const dep of version.dependencies) {
    if (dep.type === 'required' && dep.projectId && !seen.has(dep.projectId)) {
      seen.add(dep.projectId);
      result.push(dep.projectId);
    }
  }
  return result;
}
