import type {
  CollectionInfo,
  GameVersionInfo,
  ModrinthClient,
  PlatformInfo,
  ProjectInfo,
  ProjectVersionsQuery,
  RequestOptions,
  VersionInfo,
} from '../../src/ports';
import type { FileRef } from '../../src/core/model';

export interface FakeProjectSeed extends Partial<Omit<ProjectInfo, 'id' | 'support'>> {
  id: string;
  support?: Partial<ProjectInfo['support']>;
}

export interface FakeVersionSeed extends Partial<Omit<VersionInfo, 'id' | 'projectId'>> {
  id: string;
  projectId: string;
}

export interface FakeModrinthClientSeed {
  collections?: CollectionInfo[];
  projects?: FakeProjectSeed[];
  versions?: FakeVersionSeed[];
  gameVersions?: GameVersionInfo[];
  platforms?: PlatformInfo[];
}

export interface FakeModrinthCalls {
  getCollection: Array<{ id: string }>;
  getProjects: Array<{ ids: string[] }>;
  getProjectVersions: Array<{ projectId: string; q: ProjectVersionsQuery }>;
  getVersionsByIds: Array<{ ids: string[] }>;
  getGameVersions: number;
  getPlatforms: number;
}

const DEFAULT_GAME_VERSIONS: GameVersionInfo[] = [
  { version: '1.21.1', versionType: 'release', date: '2024-08-08T00:00:00Z', major: false },
  { version: '24w33a', versionType: 'snapshot', date: '2024-08-15T00:00:00Z', major: false },
  { version: '1.20.1', versionType: 'release', date: '2023-06-12T00:00:00Z', major: true },
  { version: '1.19.4', versionType: 'release', date: '2023-03-14T00:00:00Z', major: true },
];

const DEFAULT_PLATFORMS: PlatformInfo[] = [
  { name: 'fabric', supportedProjectTypes: ['mod'] },
  { name: 'forge', supportedProjectTypes: ['mod'] },
  { name: 'neoforge', supportedProjectTypes: ['mod'] },
  { name: 'quilt', supportedProjectTypes: ['mod'] },
  { name: 'paper', supportedProjectTypes: ['plugin'] },
];

export function makeDefaultFileRef(projectId: string, versionNumber: string): FileRef {
  const filename = `${projectId}-${versionNumber}.jar`;
  return {
    filename,
    url: `https://cdn.modrinth.com/data/${projectId}/versions/${versionNumber}/${filename}`,
    size: 1024,
    sha1: `sha1-${projectId}-${versionNumber}`,
    sha512: `sha512-${projectId}-${versionNumber}`,
  };
}

function throwIfAborted(opts?: RequestOptions): void {
  if (opts?.signal?.aborted) {
    throw opts.signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }
}

/**
 * In-memory implementation of `ModrinthClient` for deterministic unit tests (§10).
 */
export class FakeModrinthClient implements ModrinthClient {
  private readonly collections = new Map<string, CollectionInfo>();
  private readonly projects = new Map<string, ProjectInfo>();
  private readonly versions = new Map<string, VersionInfo>();
  private readonly versionsByProject = new Map<string, VersionInfo[]>();
  private gameVersions: GameVersionInfo[] = [...DEFAULT_GAME_VERSIONS];
  private platforms: PlatformInfo[] = [...DEFAULT_PLATFORMS];
  private readonly errorTriggers = new Map<string, Error>();

  public readonly calls: FakeModrinthCalls = {
    getCollection: [],
    getProjects: [],
    getProjectVersions: [],
    getVersionsByIds: [],
    getGameVersions: 0,
    getPlatforms: 0,
  };

  constructor(seed?: FakeModrinthClientSeed) {
    if (seed?.collections) {
      for (const c of seed.collections) {
        this.addCollection(c);
      }
    }
    if (seed?.projects) {
      this.addProjects(seed.projects);
    }
    if (seed?.versions) {
      this.addVersions(seed.versions);
    }
    if (seed?.gameVersions) {
      this.setGameVersions(seed.gameVersions);
    }
    if (seed?.platforms) {
      this.setPlatforms(seed.platforms);
    }
  }

  public addCollection(collection: CollectionInfo): this {
    this.collections.set(collection.id, {
      id: collection.id,
      name: collection.name,
      projectIds: [...collection.projectIds],
    });
    return this;
  }

  public setCollection(id: string, projectIds: string[], name = `Collection ${id}`): this {
    return this.addCollection({ id, name, projectIds });
  }

  public addProject(seed: FakeProjectSeed): this {
    const slug = seed.slug ?? seed.id;
    const title = seed.title ?? seed.id;
    const type = seed.type ?? 'mod';
    const urlType =
      type === 'mod' ||
      type === 'plugin' ||
      type === 'datapack' ||
      type === 'resourcepack' ||
      type === 'shader' ||
      type === 'modpack'
        ? type
        : 'project';
    const project: ProjectInfo = {
      id: seed.id,
      slug,
      title,
      type,
      modrinthUrl: seed.modrinthUrl ?? `https://modrinth.com/${urlType}/${slug}`,
      support: {
        client: seed.support?.client ?? 'required',
        server: seed.support?.server ?? 'required',
      },
    };
    this.projects.set(project.id, project);
    return this;
  }

  public addProjects(seeds: FakeProjectSeed[]): this {
    for (const s of seeds) {
      this.addProject(s);
    }
    return this;
  }

  public addVersion(seed: FakeVersionSeed): this {
    const versionNumber = seed.versionNumber ?? '1.0.0';
    const file =
      seed.file === undefined ? makeDefaultFileRef(seed.projectId, versionNumber) : seed.file;
    const version: VersionInfo = {
      id: seed.id,
      projectId: seed.projectId,
      versionNumber,
      versionType: seed.versionType ?? 'release',
      publishedAt: seed.publishedAt ?? '2025-01-01T00:00:00Z',
      gameVersions: seed.gameVersions ? [...seed.gameVersions] : ['1.20.1'],
      platforms: seed.platforms ? [...seed.platforms] : ['fabric'],
      file,
      ...(seed.files ? { files: [...seed.files] } : {}),
      dependencies: seed.dependencies ? [...seed.dependencies] : [],
    };
    this.versions.set(version.id, version);
    const list = this.versionsByProject.get(version.projectId) ?? [];
    const existingIdx = list.findIndex((v) => v.id === version.id);
    if (existingIdx >= 0) {
      list[existingIdx] = version;
    } else {
      list.push(version);
    }
    this.versionsByProject.set(version.projectId, list);
    return this;
  }

  public addVersions(seeds: FakeVersionSeed[]): this {
    for (const s of seeds) {
      this.addVersion(s);
    }
    return this;
  }

  public setGameVersions(gameVersions: GameVersionInfo[]): this {
    this.gameVersions = [...gameVersions];
    return this;
  }

  public setPlatforms(platforms: PlatformInfo[]): this {
    this.platforms = [...platforms];
    return this;
  }

  public failOn(key: string, error: Error = new Error(`FakeModrinthClient failure: ${key}`)): this {
    this.errorTriggers.set(key, error);
    return this;
  }

  public resetCalls(): void {
    this.calls.getCollection.length = 0;
    this.calls.getProjects.length = 0;
    this.calls.getProjectVersions.length = 0;
    this.calls.getVersionsByIds.length = 0;
    this.calls.getGameVersions = 0;
    this.calls.getPlatforms = 0;
  }

  public async getCollection(id: string, opts?: RequestOptions): Promise<CollectionInfo> {
    throwIfAborted(opts);
    this.calls.getCollection.push({ id });
    const err =
      this.errorTriggers.get(`collection:${id}`) ?? this.errorTriggers.get('getCollection');
    if (err) {
      throw err;
    }
    const found = this.collections.get(id);
    if (!found) {
      throw new Error(`Collection not found: ${id}`);
    }
    return {
      id: found.id,
      name: found.name,
      projectIds: [...found.projectIds],
    };
  }

  public async getProjects(ids: string[], opts?: RequestOptions): Promise<ProjectInfo[]> {
    throwIfAborted(opts);
    this.calls.getProjects.push({ ids: [...ids] });
    const err = this.errorTriggers.get('getProjects');
    if (err) {
      throw err;
    }
    const results: ProjectInfo[] = [];
    for (const id of ids) {
      const projErr = this.errorTriggers.get(`project:${id}`);
      if (projErr) {
        throw projErr;
      }
      const project = this.projects.get(id);
      if (project) {
        results.push({
          ...project,
          support: { ...project.support },
        });
      }
    }
    return results;
  }

  public async getProjectVersions(
    projectId: string,
    q: ProjectVersionsQuery,
    opts?: RequestOptions,
  ): Promise<VersionInfo[]> {
    throwIfAborted(opts);
    this.calls.getProjectVersions.push({ projectId, q: { ...q } });
    const err =
      this.errorTriggers.get(`versions:${projectId}`) ??
      this.errorTriggers.get('getProjectVersions');
    if (err) {
      throw err;
    }
    const list = this.versionsByProject.get(projectId) ?? [];
    const platformLower = q.platform?.toLowerCase();
    return list
      .filter(
        (v) =>
          (!q.gameVersion || v.gameVersions.includes(q.gameVersion)) &&
          (!platformLower || v.platforms.some((p) => p.toLowerCase() === platformLower)),
      )
      .map((v) => ({
        ...v,
        gameVersions: [...v.gameVersions],
        platforms: [...v.platforms],
        file: v.file ? { ...v.file } : null,
        ...(v.files ? { files: v.files.map((f) => ({ ...f })) } : {}),
        dependencies: v.dependencies.map((d) => ({ ...d })),
      }));
  }

  public async getVersionsByIds(ids: string[], opts?: RequestOptions): Promise<VersionInfo[]> {
    throwIfAborted(opts);
    this.calls.getVersionsByIds.push({ ids: [...ids] });
    const err = this.errorTriggers.get('getVersionsByIds');
    if (err) {
      throw err;
    }
    const results: VersionInfo[] = [];
    for (const id of ids) {
      const versionErr = this.errorTriggers.get(`version:${id}`);
      if (versionErr) {
        throw versionErr;
      }
      const v = this.versions.get(id);
      if (v) {
        results.push({
          ...v,
          gameVersions: [...v.gameVersions],
          platforms: [...v.platforms],
          file: v.file ? { ...v.file } : null,
          ...(v.files ? { files: v.files.map((f) => ({ ...f })) } : {}),
          dependencies: v.dependencies.map((d) => ({ ...d })),
        });
      }
    }
    return results;
  }

  public async getGameVersions(opts?: RequestOptions): Promise<GameVersionInfo[]> {
    throwIfAborted(opts);
    this.calls.getGameVersions += 1;
    const err = this.errorTriggers.get('getGameVersions');
    if (err) {
      throw err;
    }
    return this.gameVersions.map((gv) => ({ ...gv }));
  }

  public async getPlatforms(opts?: RequestOptions): Promise<PlatformInfo[]> {
    throwIfAborted(opts);
    this.calls.getPlatforms += 1;
    const err = this.errorTriggers.get('getPlatforms');
    if (err) {
      throw err;
    }
    return this.platforms.map((p) => ({
      ...p,
      supportedProjectTypes: [...p.supportedProjectTypes],
    }));
  }
}
