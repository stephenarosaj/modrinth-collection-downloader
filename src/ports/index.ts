// Port interfaces for external boundaries: ModrinthClient, FileFetcher, ArchiveWriter (§5.2).

import type {
  EnvironmentId,
  FileRef,
  ProjectType,
  Support,
  VersionDependency,
  VersionType,
} from '../core/model';

export interface RequestOptions {
  signal?: AbortSignal;
}

export interface CollectionInfo {
  id: string;
  name: string;
  projectIds: string[];
}

export interface ProjectInfo {
  id: string;
  slug: string;
  title: string;
  type: ProjectType | (string & {});
  modrinthUrl: string;
  support: Record<EnvironmentId, Support>;
}

export interface VersionFileInfo extends FileRef {
  primary?: boolean;
}

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

export interface GameVersionInfo {
  version: string;
  versionType: 'release' | 'snapshot' | 'alpha' | 'beta' | (string & {});
  date: string;
  major: boolean;
}

export interface PlatformInfo {
  name: string;
  icon?: string;
  supportedProjectTypes: string[];
}

export interface ProjectVersionsQuery {
  gameVersion: string;
  platform?: string;
}

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

export interface Archive {
  addFile(path: string, data: Uint8Array | string): void;
  generate(opts?: { onProgress?: (pct: number) => void }): Promise<Blob>;
}

export interface ArchiveWriter {
  create(): Archive;
}

export interface FileFetcher {
  fetchBinary(url: string, opts?: RequestOptions): Promise<Uint8Array>;
}
