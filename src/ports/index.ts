// Port interfaces for external boundaries: ModrinthClient, FileFetcher, ArchiveWriter.

import type {
  EnvironmentId,
  FileRef,
  ProjectType,
  Support,
  VersionDependency,
  VersionType,
} from '../core/model';

/** Standard options for port operations supporting cancellation via AbortSignal. */
export interface RequestOptions {
  signal?: AbortSignal;
}

/** Normalized Modrinth collection metadata containing its ID, display name, and member project IDs. */
export interface CollectionInfo {
  id: string;
  name: string;
  projectIds: string[];
}

/** Normalized project metadata representing a Modrinth project and its client/server environment support. */
export interface ProjectInfo {
  id: string;
  slug: string;
  title: string;
  type: ProjectType | (string & {});
  modrinthUrl: string;
  support: Record<EnvironmentId, Support>;
}

/** Metadata describing a downloadable version file attachment, extending FileRef with primary designation. */
export interface VersionFileInfo extends FileRef {
  primary?: boolean;
}

/** Normalized version details for a project, including compatibility targets, files, and dependencies. */
export interface VersionInfo {
  id: string;
  projectId: string;
  versionNumber: string;
  versionType: VersionType;
  publishedAt: string;
  gameVersions: string[];
  platforms: string[];
  /** Primary downloadable file, or null if the version has no downloadable files. */
  file: FileRef | null;
  /** Optional full list of files on the version for primary-file inspection. */
  files?: VersionFileInfo[];
  dependencies: VersionDependency[];
}

/** Metadata for a Minecraft game version tag returned by Modrinth. */
export interface GameVersionInfo {
  version: string;
  versionType: 'release' | 'snapshot' | 'alpha' | 'beta' | (string & {});
  date: string;
  major: boolean;
}

/** Metadata for a loader or platform tag (e.g. Fabric, Forge) supported by Modrinth. */
export interface PlatformInfo {
  name: string;
  icon?: string;
  supportedProjectTypes: string[];
}

/** Query parameters filtering a project's versions by game version and platform. */
export interface ProjectVersionsQuery {
  gameVersion: string;
  platform?: string;
}

/** Primary port interface for Modrinth API operations. All methods accept an optional AbortSignal. */
export interface ModrinthClient {
  getCollection(id: string, opts?: RequestOptions): Promise<CollectionInfo>;
  getProjects(ids: string[], opts?: RequestOptions): Promise<ProjectInfo[]>;
  getProjectVersions(
    projectId: string,
    q: ProjectVersionsQuery,
    opts?: RequestOptions,
  ): Promise<VersionInfo[]>;
  getVersionsByIds(ids: string[], opts?: RequestOptions): Promise<VersionInfo[]>;
  getGameVersions(opts?: RequestOptions): Promise<GameVersionInfo[]>;
  getPlatforms(opts?: RequestOptions): Promise<PlatformInfo[]>;
}

/** In-memory representation of a zip archive under construction. */
export interface Archive {
  addFile(path: string, data: Uint8Array | string): void;
  generate(opts?: { onProgress?: (pct: number) => void }): Promise<Blob>;
}

/** Port interface for creating fresh zip archive instances. */
export interface ArchiveWriter {
  create(): Archive;
}

/** Port interface for downloading binary files over the network. */
export interface FileFetcher {
  fetchBinary(url: string, opts?: RequestOptions): Promise<Uint8Array>;
}

