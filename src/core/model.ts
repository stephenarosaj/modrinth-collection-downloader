/**
 * Authoritative domain model, status, reducer, and projection types.
 */

/** The current schema version for Instance serialization (always 1). */
export const CORE_SCHEMA_VERSION = 1 as const;

/** Target execution environment for Minecraft mods and configuration. */
export type EnvironmentId = 'client' | 'server';

/** Read-only list of all supported execution environments. */
export const ENVIRONMENTS: readonly EnvironmentId[] = ['client', 'server'] as const;

/** Environment support level declared by Modrinth for a project. */
export type Support = 'required' | 'optional' | 'unsupported' | 'unknown';

/** Read-only list of valid environment support values. */
export const SUPPORTS: readonly Support[] = [
  'required',
  'optional',
  'unsupported',
  'unknown',
] as const;

/** Modrinth project type classification. */
export type ProjectType = 'mod' | 'plugin' | 'datapack' | 'resourcepack' | 'shader' | 'modpack';

/** Read-only list of all recognized project types. */
export const PROJECT_TYPES: readonly ProjectType[] = [
  'mod',
  'plugin',
  'datapack',
  'resourcepack',
  'shader',
  'modpack',
] as const;

/** Project types eligible for review tables and zip exports (excludes modpacks). */
export type ExportableProjectType = Exclude<ProjectType, 'modpack'>;

/** Canonical display and table order for exportable project types. */
export const PROJECT_TYPE_ORDER: readonly ExportableProjectType[] = [
  'mod',
  'plugin',
  'datapack',
  'resourcepack',
  'shader',
] as const;

/** Project types that resolve on game version alone without platform filtering. */
export const PLATFORM_AGNOSTIC_TYPES: readonly ProjectType[] = [
  'resourcepack',
  'shader',
  'datapack',
] as const;

/** Root archive folder destination for each exportable project type. */
export const TYPE_FOLDER_MAP: Readonly<Record<ExportableProjectType, string>> = {
  mod: 'mods',
  plugin: 'plugins',
  datapack: 'datapacks',
  resourcepack: 'resourcepacks',
  shader: 'shaderpacks',
} as const;

/** Modrinth release channel classification. */
export type VersionType = 'release' | 'beta' | 'alpha';

/** Read-only list of all release channels. */
export const VERSION_TYPES: readonly VersionType[] = ['release', 'beta', 'alpha'] as const;

/** User preference for version selection (stable release vs newest published). */
export type ReleasePreference = 'stable' | 'newest';

/** Read-only list of valid release preferences. */
export const RELEASE_PREFERENCES: readonly ReleasePreference[] = ['stable', 'newest'] as const;

/** Declared relationship between a version and another project or version. */
export type DependencyType = 'required' | 'optional' | 'incompatible' | 'embedded';

/** Read-only list of recognized dependency types. */
export const DEPENDENCY_TYPES: readonly DependencyType[] = [
  'required',
  'optional',
  'incompatible',
  'embedded',
] as const;

/** Downloadable file attachment metadata with verification hashes. */
export interface FileRef {
  filename: string;
  url: string;
  size: number;
  sha1: string;
  sha512: string;
}

/** Declared project or version dependency requirement. */
export interface VersionDependency {
  projectId: string;
  versionId?: string;
  type: DependencyType;
}

/** @deprecated Use `VersionDependency` instead. */
export type DependencyRef = VersionDependency;

/** Resolved version candidate containing download file and dependency metadata. */
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

/** Origin of the current selection toggle state. */
export type SelectionSource = 'none' | 'user' | 'auto';

/**
 * Current selection toggle state and origin.
 * An explicit `on: false, source: 'user'` sticky state prevents subsequent auto-selection.
 */
export interface Selection {
  on: boolean;
  source: SelectionSource;
}

/** Strategy used to resolve an entry's chosen version in an environment. */
export type Resolution = 'pinned' | 'latest-compatible' | 'game-version-fallback' | 'user' | 'none';

/** Read-only list of all valid resolution strategies. */
export const RESOLUTIONS: readonly Resolution[] = [
  'pinned',
  'latest-compatible',
  'game-version-fallback',
  'user',
  'none',
] as const;

/** Resolution and selection state for a single environment lane (client or server). */
export interface EnvironmentState {
  support: Support;
  /** Compatible versions, preferred first. */
  candidates: VersionRef[];
  /** Chosen version, or null when no compatible version exists. */
  version: VersionRef | null;
  resolution: Resolution;
  /** Project IDs of required dependencies of the chosen version. */
  dependencies: string[];
  /** Project IDs of entries whose chosen version in this environment requires this entry. */
  requiredBy: string[];
  selection: Selection;
}

/** Origin of an entry in the instance workspace. */
export type EntryOrigin = 'collection' | 'dependency';

/** Basic project metadata from Modrinth. */
export interface ProjectMeta {
  id: string;
  slug: string;
  title: string;
  type: ProjectType;
  modrinthUrl: string;
}

/**
 * Single project tracked in the workspace, containing project metadata,
 * origin ('collection' takes priority), and independent client/server environment states.
 */
export interface Entry {
  project: ProjectMeta;
  /** 'collection' wins if a project is both in the collection and a dependency. */
  origin: EntryOrigin;
  environments: Record<EnvironmentId, EnvironmentState>;
}

/** Collection origin identifier and URL. */
export interface InstanceSource {
  collectionId: string;
  url: string;
}

/** Target game version, platform, and release channel parameters. */
export interface InstanceTarget {
  gameVersion: string;
  platform: string;
  releasePreference: ReleasePreference;
}

/** Metadata describing an instance and its resolution target. */
export interface InstanceMeta {
  name: string;
  source: InstanceSource;
  target: InstanceTarget;
  createdAt: string;
}

/** Root immutable domain object representing the resolved collection state. */
export interface Instance {
  schemaVersion: 1;
  meta: InstanceMeta;
  /** The registry of collection and dependency entries. */
  entries: Entry[];
}

/** Record of a collection project that cannot be exported (e.g. modpacks). */
export interface SkippedProject {
  id: string;
  slug?: string;
  title: string;
  type: string;
  modrinthUrl?: string;
  reason: string;
}

/** Default explanation for skipped modpack entries. */
export const MODPACK_SKIPPED_REASON =
  'Modpacks (.mrpack) cannot be downloaded as individual projects.';

/** @deprecated Use `SkippedProject` instead. */
export type SkippedItem = SkippedProject;

// ---------------------------------------------------------------------------
// Derived Status Types — never stored or serialized on Instance
// ---------------------------------------------------------------------------

/** Severity level for entry and cell status indications. */
export type Kind = 'ok' | 'warning' | 'error' | 'unknown';

/** Read-only list of all status severity kinds. */
export const KINDS: readonly Kind[] = ['ok', 'warning', 'error', 'unknown'] as const;

/** Specific status condition identifier. */
export type Reason =
  | 'NO_COMPATIBLE_VERSION'
  | 'DEPENDENCY_UNAVAILABLE'
  | 'NEEDED_BUT_UNAVAILABLE'
  | 'DEPENDENCY_NOT_SELECTED'
  | 'REQUIRED_NOT_SELECTED'
  | 'REQUIRED_DEPENDENCY_NOT_SELECTED'
  | 'PIN_CONFLICT'
  | 'PLATFORM_UNVERIFIED'
  | 'SUPPORT_UNKNOWN';

/** Read-only list of all status reasons. */
export const REASONS: readonly Reason[] = [
  'NO_COMPATIBLE_VERSION',
  'DEPENDENCY_UNAVAILABLE',
  'NEEDED_BUT_UNAVAILABLE',
  'DEPENDENCY_NOT_SELECTED',
  'REQUIRED_NOT_SELECTED',
  'REQUIRED_DEPENDENCY_NOT_SELECTED',
  'PIN_CONFLICT',
  'PLATFORM_UNVERIFIED',
  'SUPPORT_UNKNOWN',
] as const;

/** Computed status severity and associated reasons for an entry or cell. */
export interface Status {
  kind: Kind;
  reasons: Reason[];
}

/** Composite status for an entry across environments and row summary. */
export interface EntryStatus {
  client: Status | null;
  server: Status | null;
  row: Status | null;
}

/** Map of entry project IDs to their computed client/server status. */
export type InstanceStatusMap = Map<string, Record<EnvironmentId, Status>>;

// ---------------------------------------------------------------------------
// Reducer Types
// ---------------------------------------------------------------------------

/** Reason an entry was automatically selected or deselected. */
export type ChangeReason = 'auto-selected' | 'auto-deselected';

/** Record of an automatic selection transition for user feedback. */
export interface Change {
  projectId: string;
  env: EnvironmentId;
  on: boolean;
  reason: ChangeReason;
}

/** Actions that transition the selection or version state of an Instance. */
export type Action =
  | { type: 'select'; projectId: string; env: EnvironmentId }
  | { type: 'deselect'; projectId: string; env: EnvironmentId }
  | { type: 'select-all'; projectType: ProjectType; env: EnvironmentId }
  | { type: 'deselect-all'; projectType: ProjectType; env: EnvironmentId }
  | { type: 'set-version'; projectId: string; env: EnvironmentId; versionId: string }
  | { type: 'reset-selection' };

/** Result of an instance state transition, including any automatic selection changes. */
export interface ReducerResult {
  instance: Instance;
  changes: Change[];
}

// ---------------------------------------------------------------------------
// Projection Types
// ---------------------------------------------------------------------------

/** Resolved project reference for dependency badges and tooltips. */
export interface LinkedProjectRef {
  id: string;
  title: string;
}

/** UI projection of an Entry combining metadata, environment state, and dependency links. */
export interface TableRow {
  entry: Entry;
  project: ProjectMeta;
  origin: EntryOrigin;
  /** Target platform for platform-specific types (`mod`, `plugin`), or `null` for platform-agnostic types. */
  platform: string | null;
  environments: Record<EnvironmentId, EnvironmentState>;
  /** Titles of entries requiring this entry per environment (for the dependency footer). */
  requiredByTitles: Record<EnvironmentId, string[]>;
  /** Structured references (`{ id, title }`) of entries requiring this entry per environment. */
  requiredByRefs?: Record<EnvironmentId, LinkedProjectRef[]>;
  /** Structured references (`{ id, title }`) of direct required dependencies per environment. */
  requiredDependencies?: Record<EnvironmentId, LinkedProjectRef[]>;
  /** Structured references (`{ id, title }`) of entries listing this entry as an optional dependency per environment. */
  optionalByRefs?: Record<EnvironmentId, LinkedProjectRef[]>;
  /** Structured references (`{ id, title }`) of direct optional dependencies per environment. */
  optionalDependencies?: Record<EnvironmentId, LinkedProjectRef[]>;
}

/** UI projection of an exportable project type table. */
export interface TableModel {
  type: ExportableProjectType;
  /** Collection entries (`origin === 'collection'`). */
  rows: TableRow[];
  /** Dependency entries (`origin === 'dependency'`). */
  dependencies: TableRow[];
}

/** File entry in an archive tree projection. */
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

/** Deterministic archive file tree projection for a target environment. */
export interface FileTree {
  environment: EnvironmentId;
  files: FileTreeEntry[];
}

/** Modrinth mrpack environment support declaration. */
export type MrpackEnvSupport = 'required' | 'optional' | 'unsupported';

/** Single file entry in modrinth.index.json. */
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

/** Modrinth modpack index structure (modrinth.index.json). */
export interface MrpackIndex {
  formatVersion: 1;
  game: 'minecraft';
  versionId: string;
  name: string;
  summary?: string;
  files: MrpackFile[];
  dependencies: Record<string, string>;
}

/** Options for generating a Modrinth mrpack index. */
export interface MrpackOptions {
  versionId?: string;
  name?: string;
  summary?: string;
  /** Optional loader/platform version (e.g. Fabric loader version) to include in dependencies. */
  platformVersion?: string;
}

// ---------------------------------------------------------------------------
// Pure Domain Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if an environment cell can be selected (supported and has a resolved version).
 */
export function isSelectable(state: Pick<EnvironmentState, 'support' | 'version'>): boolean {
  return state.support !== 'unsupported' && state.version !== null;
}

/**
 * Returns true if the project type matches on game version only (resourcepack, shader, datapack).
 */
export function isPlatformAgnostic(type: ProjectType | string): boolean {
  return (PLATFORM_AGNOSTIC_TYPES as readonly string[]).includes(type);
}

/**
 * Returns true if a version is a fallback candidate with an unverified platform
 * (platform-specific type with empty platforms list).
 */
export function isUnverifiedPlatformCandidate(
  version: { platforms: readonly string[] },
  projectType: ProjectType | string,
): boolean {
  return !isPlatformAgnostic(projectType) && version.platforms.length === 0;
}

/**
 * Type guard checking if a project type is an exportable table type (excludes modpacks).
 */
export function isExportableProjectType(type: ProjectType | string): type is ExportableProjectType {
  return (PROJECT_TYPE_ORDER as readonly string[]).includes(type);
}

/**
 * Extracts unique project IDs of required dependencies from a version.
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

/**
 * Extracts unique project IDs of optional dependencies from a version.
 */
export function extractOptionalDependencyIds(
  version: Pick<VersionRef, 'dependencies'> | null | undefined,
): string[] {
  if (!version) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const dep of version.dependencies) {
    if (dep.type === 'optional' && dep.projectId && !seen.has(dep.projectId)) {
      seen.add(dep.projectId);
      result.push(dep.projectId);
    }
  }
  return result;
}

const KNOWN_PROJECT_TITLES = new Map<string, string>();

/**
 * Registers known Modrinth project titles by project ID so optional or out-of-closure
 * dependency references can display human-readable project names.
 */
export function registerKnownProjectTitles(
  projects: readonly { id: string; title: string }[],
): void {
  for (const proj of projects) {
    if (proj.id && proj.title && proj.title !== proj.id) {
      KNOWN_PROJECT_TITLES.set(proj.id, proj.title);
    }
  }
}

/**
 * Looks up a previously registered human-readable project title for `projectId`.
 */
export function getKnownProjectTitle(projectId: string): string | undefined {
  return KNOWN_PROJECT_TITLES.get(projectId);
}
