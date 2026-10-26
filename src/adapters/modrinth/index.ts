import type {
  CollectionInfo,
  GameVersionInfo,
  ModrinthClient,
  PlatformInfo,
  ProjectInfo,
  ProjectVersionsQuery,
  RequestOptions,
  VersionFileInfo,
  VersionInfo,
} from '../../ports';
import type {
  DependencyType,
  EnvironmentId,
  FileRef,
  ProjectType,
  Support,
  VersionDependency,
  VersionType,
} from '../../core/model';
import {
  createAbortError,
  defaultFetch,
  defaultSleep,
  isAbortError,
  isRetryableStatus,
  parseRetryDelayMs,
  throwIfAborted,
} from '../http-retry';

/**
 * Modrinth loader tags whose `supported_project_types` includes `"mod"`
 * and neither `"plugin"` nor `"datapack"` (verified in `docs/modrinth-api-notes.md`).
 */
export const MOD_LOADERS: ReadonlySet<string> = new Set([
  'babric',
  'bta-babric',
  'fabric',
  'forge',
  'java-agent',
  'legacy-fabric',
  'liteloader',
  'modloader',
  'neoforge',
  'nilloader',
  'ornithe',
  'quilt',
  'rift',
]);

/**
 * Modrinth loader tags whose `supported_project_types` includes `"plugin"`
 * (verified in `docs/modrinth-api-notes.md`).
 */
export const PLUGIN_LOADERS: ReadonlySet<string> = new Set([
  'bukkit',
  'bungeecord',
  'folia',
  'geyser',
  'paper',
  'purpur',
  'spigot',
  'sponge',
  'velocity',
  'waterfall',
]);

/**
 * Modrinth loader tags whose `supported_project_types` includes `"datapack"`
 * (verified in `docs/modrinth-api-notes.md`).
 */
export const DATAPACK_LOADERS: ReadonlySet<string> = new Set(['datapack']);

/** Raw JSON payload schema returned by Modrinth `/v3/collection/{id}`. */
export interface RawModrinthCollection {
  id: string;
  name?: string | null;
  description?: string | null;
  icon_url?: string | null;
  user?: string | null;
  projects?: string[] | null;
}

/** Raw JSON payload schema returned by Modrinth `/v2/project/{id}` and items of `/v2/projects`. */
export interface RawModrinthProject {
  id: string;
  slug?: string | null;
  title?: string | null;
  description?: string | null;
  icon_url?: string | null;
  project_type?: string | null;
  loaders?: string[] | null;
  client_side?: string | null;
  server_side?: string | null;
  updated?: string | null;
}

/** Raw JSON payload schema for file objects in Modrinth version endpoints. */
export interface RawModrinthVersionFile {
  hashes?: {
    sha1?: string | null;
    sha512?: string | null;
  } | null;
  url?: string | null;
  filename?: string | null;
  primary?: boolean | null;
  size?: number | null;
}

/** Raw JSON payload schema for dependency declarations in Modrinth version endpoints. */
export interface RawModrinthVersionDependency {
  version_id?: string | null;
  project_id?: string | null;
  file_name?: string | null;
  dependency_type?: string | null;
}

/** Raw JSON payload schema returned by Modrinth `/v2/version/{id}` and `/v2/project/{id}/version`. */
export interface RawModrinthVersion {
  id: string;
  project_id: string;
  name?: string | null;
  version_number: string;
  version_type?: string | null;
  date_published: string;
  game_versions?: string[] | null;
  loaders?: string[] | null;
  files?: RawModrinthVersionFile[] | null;
  dependencies?: RawModrinthVersionDependency[] | null;
}

/** Raw JSON payload schema returned by Modrinth `/v2/tag/game_version`. */
export interface RawModrinthGameVersionTag {
  version: string;
  version_type: string;
  date: string;
  major?: boolean | null;
}

/** Raw JSON payload schema returned by Modrinth `/v2/tag/loader`. */
export interface RawModrinthLoaderTag {
  name: string;
  icon?: string | null;
  supported_project_types?: string[] | null;
}

/** Collection metadata extending CollectionInfo with description, optional icon URL, and user ID. */
export interface CollectionDetails extends CollectionInfo {
  description: string;
  iconUrl?: string;
  userId?: string;
}

/** Project metadata extending ProjectInfo with description, platforms, and update timestamp. */
export interface ModrinthProjectDetails extends ProjectInfo {
  description: string;
  iconUrl?: string;
  platforms: string[];
  updatedAt: string;
}

/** File attachment metadata extending VersionFileInfo. */
export interface ModrinthVersionFileDetails extends VersionFileInfo {
  primary?: boolean;
}

/** Version dependency metadata extending VersionDependency with optional file name. */
export interface ModrinthVersionDependencyDetails extends VersionDependency {
  fileName?: string;
}

/** Resolved version metadata extending VersionInfo. */
export interface ModrinthVersionDetails extends VersionInfo {
  name: string;
  files: ModrinthVersionFileDetails[];
  dependencies: ModrinthVersionDependencyDetails[];
}

/** Configuration options for HttpModrinthClient. */
export interface HttpModrinthClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxConcurrency?: number;
  batchSize?: number;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Error thrown when a Modrinth API request fails, preserving the requested endpoint URL and HTTP status. */
export class ModrinthApiError extends Error {
  public readonly url: string;
  public readonly status?: number;

  constructor(message: string, url: string, status?: number, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ModrinthApiError';
    this.url = url;
    this.status = status;
  }
}

/**
 * Classifies a raw Modrinth `/v2/projects` object into a domain `ProjectType`
 * (or passes through unknown project types so the resolver can record them in `SkippedProject[]`).
 *
 * Precedence when `project_type === 'mod'` (`docs/modrinth-api-notes.md`):
 * 1. `hasModLoader` -> `'mod'`
 * 2. `hasPluginLoader` -> `'plugin'`
 * 3. `hasDatapackLoader` -> `'datapack'`
 * 4. fallback -> `'mod'`
 */
export function classifyProjectType(
  rawProject: Pick<RawModrinthProject, 'project_type' | 'loaders'>,
): ProjectType | (string & {}) {
  const rawType = (rawProject.project_type ?? '').trim().toLowerCase();

  if (
    rawType === 'resourcepack' ||
    rawType === 'shader' ||
    rawType === 'modpack' ||
    rawType === 'plugin' ||
    rawType === 'datapack'
  ) {
    return rawType;
  }

  if (rawType === 'mod') {
    const loaders = (rawProject.loaders ?? []).map((l) => l.trim().toLowerCase());
    const hasModLoader = loaders.some((l) => MOD_LOADERS.has(l));
    const hasPluginLoader = loaders.some((l) => PLUGIN_LOADERS.has(l));
    const hasDatapackLoader = loaders.some((l) => DATAPACK_LOADERS.has(l));

    if (hasModLoader) {
      return 'mod';
    }
    if (hasPluginLoader) {
      return 'plugin';
    }
    if (hasDatapackLoader) {
      return 'datapack';
    }
    return 'mod';
  }

  return rawType || 'unknown';
}

/**
 * Normalizes a Modrinth `client_side` or `server_side` string into a domain `Support` value
 * (`docs/modrinth-api-notes.md`).
 */
export function normalizeSupportValue(value?: string | null): Support {
  const normalized = (value ?? '').trim().toLowerCase();
  if (
    normalized === 'required' ||
    normalized === 'optional' ||
    normalized === 'unsupported' ||
    normalized === 'unknown'
  ) {
    return normalized;
  }
  return 'unknown';
}

/** Normalizes a raw Modrinth version type string into a valid VersionType, defaulting to 'release'. */
export function normalizeVersionType(value?: string | null): VersionType {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'release' || normalized === 'beta' || normalized === 'alpha') {
    return normalized;
  }
  return 'release';
}

/** Normalizes a raw Modrinth dependency type string into a valid DependencyType, defaulting to 'optional'. */
export function normalizeDependencyType(value?: string | null): DependencyType {
  const normalized = (value ?? '').trim().toLowerCase();
  if (
    normalized === 'required' ||
    normalized === 'optional' ||
    normalized === 'incompatible' ||
    normalized === 'embedded'
  ) {
    return normalized;
  }
  return 'optional';
}

function chunkArray<T>(items: readonly T[], chunkSize: number): T[][] {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function buildModrinthProjectUrl(type: string, slugOrId: string): string {
  const urlType =
    type === 'mod' ||
    type === 'plugin' ||
    type === 'datapack' ||
    type === 'resourcepack' ||
    type === 'shader' ||
    type === 'modpack'
      ? type
      : 'project';
  return `https://modrinth.com/${urlType}/${slugOrId}`;
}

function mapRawProject(raw: RawModrinthProject): ModrinthProjectDetails {
  const type = classifyProjectType(raw);
  const slug = raw.slug && raw.slug.trim().length > 0 ? raw.slug : raw.id;
  const title = raw.title && raw.title.trim().length > 0 ? raw.title : slug;
  const support: Record<EnvironmentId, Support> = {
    client: normalizeSupportValue(raw.client_side),
    server: normalizeSupportValue(raw.server_side),
  };

  return {
    id: raw.id,
    slug,
    title,
    description: raw.description ?? '',
    ...(raw.icon_url ? { iconUrl: raw.icon_url } : {}),
    type,
    modrinthUrl: buildModrinthProjectUrl(type, slug),
    support,
    platforms: (raw.loaders ?? []).map((l) => l.toLowerCase()),
    updatedAt: raw.updated ?? '',
  };
}

function mapRawVersion(raw: RawModrinthVersion): ModrinthVersionDetails {
  const files: ModrinthVersionFileDetails[] = (raw.files ?? []).map((f) => ({
    url: f.url ?? '',
    filename: f.filename ?? '',
    size: typeof f.size === 'number' ? f.size : 0,
    primary: typeof f.primary === 'boolean' ? f.primary : undefined,
    sha1: f.hashes?.sha1 ?? '',
    sha512: f.hashes?.sha512 ?? '',
  }));

  const primaryCandidate =
    files.find((f) => f.primary === true) ??
    files.find((f) => f.primary === undefined) ??
    files[0] ??
    null;
  const file: FileRef | null = primaryCandidate
    ? {
        filename: primaryCandidate.filename,
        url: primaryCandidate.url,
        size: primaryCandidate.size,
        sha1: primaryCandidate.sha1,
        sha512: primaryCandidate.sha512,
      }
    : null;

  const dependencies: ModrinthVersionDependencyDetails[] = (raw.dependencies ?? [])
    .filter(
      (d): d is RawModrinthVersionDependency & { project_id: string } =>
        typeof d.project_id === 'string' && d.project_id.trim().length > 0,
    )
    .map((d) => ({
      projectId: d.project_id.trim(),
      ...(d.version_id ? { versionId: d.version_id } : {}),
      ...(d.file_name ? { fileName: d.file_name } : {}),
      type: normalizeDependencyType(d.dependency_type),
    }));

  return {
    id: raw.id,
    projectId: raw.project_id,
    name: raw.name ?? raw.version_number,
    versionNumber: raw.version_number,
    versionType: normalizeVersionType(raw.version_type),
    publishedAt: raw.date_published,
    gameVersions: Array.isArray(raw.game_versions) ? [...raw.game_versions] : [],
    platforms: (raw.loaders ?? []).map((l) => l.toLowerCase()),
    file,
    files,
    dependencies,
  };
}

/**
 * ModrinthClient adapter that communicates with the Modrinth REST API.
 * Handles concurrency limiting, batching for multi-project queries, retry with backoff, and cancellation.
 */
export class HttpModrinthClient implements ModrinthClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxConcurrency: number;
  private readonly batchSize: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  private activeCount = 0;
  private readonly waitQueue: Array<{
    grant: () => void;
    cleanup: () => void;
  }> = [];

  constructor(opts: HttpModrinthClientOptions = {}) {
    this.baseUrl = (opts.baseUrl ?? 'https://api.modrinth.com').replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? defaultFetch;
    this.maxConcurrency = Math.max(1, opts.maxConcurrency ?? 5);
    this.batchSize = Math.max(1, opts.batchSize ?? 100);
    this.maxRetries = Math.max(0, opts.maxRetries ?? 3);
    this.baseDelayMs = Math.max(0, opts.baseDelayMs ?? 500);
    this.sleep = opts.sleep ?? defaultSleep;
  }

  private acquireSlot(signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    if (this.activeCount < this.maxConcurrency) {
      this.activeCount += 1;
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        const idx = this.waitQueue.indexOf(entry);
        if (idx !== -1) {
          this.waitQueue.splice(idx, 1);
        }
        entry.cleanup();
        reject(createAbortError(signal));
      };

      const entry = {
        grant: () => {
          entry.cleanup();
          resolve();
        },
        cleanup: () => {
          signal?.removeEventListener('abort', onAbort);
        },
      };

      signal?.addEventListener('abort', onAbort, { once: true });
      this.waitQueue.push(entry);
    });
  }

  private releaseSlot(): void {
    while (this.waitQueue.length > 0) {
      const next = this.waitQueue.shift()!;
      next.grant();
      return;
    }
    this.activeCount = Math.max(0, this.activeCount - 1);
  }

  private async requestJson<T>(path: string, signal?: AbortSignal): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
    await this.acquireSlot(signal);

    try {
      for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
        throwIfAborted(signal);

        let response: Response;
        try {
          response = await this.fetchImpl(url, {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
            signal,
          });

          if (response.ok) {
            const data = (await response.json()) as T;
            throwIfAborted(signal);
            return data;
          }
        } catch (error) {
          if (isAbortError(error, signal)) {
            throw createAbortError(signal);
          }
          if (attempt < this.maxRetries) {
            const delayMs = this.baseDelayMs * Math.pow(2, attempt);
            await this.sleep(delayMs, signal);
            continue;
          }
          throw new ModrinthApiError(
            `Network error while requesting ${url} after ${attempt + 1} attempt(s): ${
              error instanceof Error ? error.message : String(error)
            }`,
            url,
            undefined,
            { cause: error },
          );
        }

        const status = response.status;
        if (isRetryableStatus(status) && attempt < this.maxRetries) {
          const delayMs = parseRetryDelayMs(response.headers, attempt, this.baseDelayMs);
          await this.sleep(delayMs, signal);
          continue;
        }

        throw new ModrinthApiError(
          `Modrinth API error ${status} (${response.statusText || 'Error'}) for ${url}`,
          url,
          status,
        );
      }

      throw new ModrinthApiError(`Failed to request ${url}`, url);
    } finally {
      this.releaseSlot();
    }
  }

  async getCollection(id: string, opts?: RequestOptions): Promise<CollectionDetails> {
    const signal = opts?.signal;
    const raw = await this.requestJson<RawModrinthCollection>(
      `/v3/collection/${encodeURIComponent(id)}`,
      signal,
    );

    return {
      id: raw.id,
      name: raw.name ?? raw.id,
      description: raw.description ?? '',
      ...(raw.icon_url ? { iconUrl: raw.icon_url } : {}),
      ...(raw.user ? { userId: raw.user } : {}),
      projectIds: Array.isArray(raw.projects) ? [...raw.projects] : [],
    };
  }

  async getProjects(ids: string[], opts?: RequestOptions): Promise<ModrinthProjectDetails[]> {
    const signal = opts?.signal;
    throwIfAborted(signal);

    const uniqueIds = Array.from(new Set(ids.filter((id) => Boolean(id))));
    if (uniqueIds.length === 0) {
      return [];
    }

    const chunks = chunkArray(uniqueIds, this.batchSize);
    const batchResults = await Promise.all(
      chunks.map((chunk) =>
        this.requestJson<RawModrinthProject[]>(
          `/v2/projects?ids=${encodeURIComponent(JSON.stringify(chunk))}`,
          signal,
        ),
      ),
    );

    const byId = new Map<string, ModrinthProjectDetails>();
    const extras: ModrinthProjectDetails[] = [];

    for (const batch of batchResults) {
      for (const raw of batch) {
        const mapped = mapRawProject(raw);
        if (!byId.has(mapped.id)) {
          byId.set(mapped.id, mapped);
        } else {
          extras.push(mapped);
        }
      }
    }

    const ordered: ModrinthProjectDetails[] = [];
    const included = new Set<string>();
    for (const id of uniqueIds) {
      const found = byId.get(id);
      if (found) {
        ordered.push(found);
        included.add(id);
      }
    }
    for (const [id, proj] of byId.entries()) {
      if (!included.has(id)) {
        ordered.push(proj);
      }
    }
    ordered.push(...extras);

    return ordered;
  }

  async getProjectVersions(
    projectId: string,
    q: ProjectVersionsQuery,
    opts?: RequestOptions,
  ): Promise<ModrinthVersionDetails[]> {
    const signal = opts?.signal;
    throwIfAborted(signal);

    const queryParts: string[] = [];
    if (q.gameVersion) {
      queryParts.push(`game_versions=${encodeURIComponent(JSON.stringify([q.gameVersion]))}`);
    }
    if (q.platform) {
      queryParts.push(`loaders=${encodeURIComponent(JSON.stringify([q.platform.toLowerCase()]))}`);
    }

    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    const rawVersions = await this.requestJson<RawModrinthVersion[]>(
      `/v2/project/${encodeURIComponent(projectId)}/version${queryString}`,
      signal,
    );

    return rawVersions.map(mapRawVersion);
  }

  async getVersionsByIds(ids: string[], opts?: RequestOptions): Promise<ModrinthVersionDetails[]> {
    const signal = opts?.signal;
    throwIfAborted(signal);

    const uniqueIds = Array.from(new Set(ids.filter((id) => Boolean(id))));
    if (uniqueIds.length === 0) {
      return [];
    }

    const chunks = chunkArray(uniqueIds, this.batchSize);
    const batchResults = await Promise.all(
      chunks.map((chunk) =>
        this.requestJson<RawModrinthVersion[]>(
          `/v2/versions?ids=${encodeURIComponent(JSON.stringify(chunk))}`,
          signal,
        ),
      ),
    );

    const byId = new Map<string, ModrinthVersionDetails>();
    for (const batch of batchResults) {
      for (const raw of batch) {
        const mapped = mapRawVersion(raw);
        byId.set(mapped.id, mapped);
      }
    }

    const ordered: ModrinthVersionDetails[] = [];
    const included = new Set<string>();
    for (const id of uniqueIds) {
      const found = byId.get(id);
      if (found) {
        ordered.push(found);
        included.add(id);
      }
    }
    for (const [id, ver] of byId.entries()) {
      if (!included.has(id)) {
        ordered.push(ver);
      }
    }

    return ordered;
  }

  async getGameVersions(opts?: RequestOptions): Promise<GameVersionInfo[]> {
    const signal = opts?.signal;
    const raw = await this.requestJson<RawModrinthGameVersionTag[]>('/v2/tag/game_version', signal);
    return raw.map((item) => ({
      version: item.version,
      versionType: item.version_type,
      date: item.date,
      major: Boolean(item.major),
    }));
  }

  async getPlatforms(opts?: RequestOptions): Promise<PlatformInfo[]> {
    const signal = opts?.signal;
    const raw = await this.requestJson<RawModrinthLoaderTag[]>('/v2/tag/loader', signal);
    return raw.map((item) => ({
      name: item.name.toLowerCase(),
      icon: item.icon ?? '',
      supportedProjectTypes: Array.isArray(item.supported_project_types)
        ? [...item.supported_project_types]
        : [],
    }));
  }
}

/** Factory function creating a new HttpModrinthClient instance. */
export function createModrinthClient(opts?: HttpModrinthClientOptions): HttpModrinthClient {
  return new HttpModrinthClient(opts);
}
