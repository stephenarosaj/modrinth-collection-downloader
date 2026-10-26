/**
 * Pure version resolution, dependency closure, initial selection, and version-override recompute.
 */

import type {
  Change,
  Entry,
  EnvironmentId,
  EnvironmentState,
  FileRef,
  Instance,
  InstanceTarget,
  ProjectType,
  ReducerResult,
  ReleasePreference,
  Resolution,
  Selection,
  SkippedProject,
  Support,
  VersionRef,
} from './model';
import {
  CORE_SCHEMA_VERSION,
  ENVIRONMENTS,
  MODPACK_SKIPPED_REASON,
  PROJECT_TYPES,
  extractOptionalDependencyIds,
  extractRequiredDependencyIds,
  getKnownProjectTitle,
  isExportableProjectType,
  isPlatformAgnostic,
  isSelectable,
  isUnverifiedPlatformCandidate,
  registerKnownProjectTitles,
} from './model';
import type { ModrinthClient, ProjectInfo, VersionInfo } from '../ports';
import { parseCollectionInput } from './collection';

export { extractRequiredDependencyIds } from './model';

/** Parameters for resolving a single project version in an environment. */
export interface ResolveVersionInput {
  projectType: ProjectType | string;
  support: Support;
  versions: readonly (VersionInfo | VersionRef)[];
  target: InstanceTarget;
  pinnedVersionIds?: readonly string[];
  pinnedVersions?: readonly (VersionInfo | VersionRef)[];
}

/** Output of version resolution for a single environment. */
export interface ResolvedEnvironmentVersion {
  candidates: VersionRef[];
  version: VersionRef | null;
  resolution: Resolution;
  pinConflict: boolean;
}

/** Progress update reporting current resolution phase and counts. */
export interface ResolveProgress {
  phase: 'collection' | 'projects' | 'versions' | 'dependencies' | 'complete';
  loaded: number;
  total: number;
  message?: string;
}

/** Options for resolving an entire collection into an Instance. */
export interface ResolveCollectionOptions {
  collectionInput: string;
  gameVersion: string;
  platform: string;
  releasePreference: ReleasePreference;
  createdAt?: string;
  signal?: AbortSignal;
  onProgress?: (progress: ResolveProgress) => void;
}

/** Result of collection resolution containing the instance and skipped projects. */
export interface ResolveCollectionResult {
  instance: Instance;
  skipped: SkippedProject[];
}

/** Options for synchronously recomputing an environment's dependency closure. */
export interface RecomputeClosureOptions {
  projectId: string;
  env: EnvironmentId;
  versionId: string;
  extraProjects?: readonly ProjectInfo[];
  extraVersions?: readonly VersionInfo[];
}

/** Options for asynchronously overriding an entry version and fetching missing dependencies. */
export interface ChangeEntryVersionOptions {
  projectId: string;
  env: EnvironmentId;
  versionId: string;
  signal?: AbortSignal;
}

function isKnownProjectType(type: string): type is ProjectType {
  return (PROJECT_TYPES as readonly string[]).includes(type);
}

function pickPrimaryFile(version: VersionInfo | VersionRef): FileRef | null {
  if (version.file !== null && version.file !== undefined) {
    return version.file;
  }
  if ('files' in version && Array.isArray(version.files) && version.files.length > 0) {
    const explicitPrimary = version.files.find((f) => f.primary === true);
    if (explicitPrimary) {
      return explicitPrimary;
    }
    const implicitPrimary = version.files.find((f) => f.primary === undefined);
    if (implicitPrimary) {
      return implicitPrimary;
    }
  }
  return null;
}

/**
 * Converts a `VersionInfo` or `VersionRef` into a validated `VersionRef`,
 * returning `null` if the version has no valid primary file or if its primary
 * file is a `.mrpack` archive.
 */
export function toUsableVersionRef(version: VersionInfo | VersionRef): VersionRef | null {
  const primary = pickPrimaryFile(version);
  if (!primary) {
    return null;
  }
  const filename = primary.filename?.trim() ?? '';
  const url = primary.url?.trim() ?? '';
  if (!filename || !url) {
    return null;
  }
  if (filename.toLowerCase().endsWith('.mrpack')) {
    return null;
  }

  return {
    id: version.id,
    versionNumber: version.versionNumber,
    versionType: version.versionType,
    publishedAt: version.publishedAt,
    gameVersions: [...version.gameVersions],
    platforms: [...version.platforms],
    file: {
      filename: primary.filename,
      url: primary.url,
      size: primary.size,
      sha1: primary.sha1,
      sha512: primary.sha512,
    },
    dependencies: version.dependencies.map((d) => ({
      projectId: d.projectId,
      ...(d.versionId !== undefined ? { versionId: d.versionId } : {}),
      type: d.type,
    })),
  };
}

/**
 * Filters a list of versions to usable `VersionRef`s (with valid non-`.mrpack` primary files),
 * deduplicating by version `id`.
 */
export function filterUsableVersions(
  versions: readonly (VersionInfo | VersionRef)[],
): VersionRef[] {
  const seen = new Set<string>();
  const result: VersionRef[] = [];
  for (const v of versions) {
    if (seen.has(v.id)) {
      continue;
    }
    const usable = toUsableVersionRef(v);
    if (usable) {
      seen.add(usable.id);
      result.push(usable);
    }
  }
  return result;
}

/**
 * Compares two versions by `publishedAt` descending (newest first).
 * Never compares version-number strings. Uses `id` as a deterministic tie-breaker.
 */
export function comparePublishedAtDesc(
  a: Pick<VersionRef, 'id' | 'publishedAt'>,
  b: Pick<VersionRef, 'id' | 'publishedAt'>,
): number {
  const timeA = Date.parse(a.publishedAt);
  const timeB = Date.parse(b.publishedAt);
  if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
    return timeB - timeA;
  }
  if (a.publishedAt !== b.publishedAt) {
    return b.publishedAt.localeCompare(a.publishedAt);
  }
  return a.id.localeCompare(b.id);
}

/**
 * Orders compatible versions according to `releasePreference`:
 * - `'stable'`: all `'release'` versions (newest first), then `'beta'`/`'alpha'` versions (newest first).
 * - `'newest'`: all versions ordered by `publishedAt` descending regardless of `versionType`.
 */
export function sortVersionsByPreference(
  versions: readonly VersionRef[],
  releasePreference: ReleasePreference,
): VersionRef[] {
  const copy = [...versions];
  if (releasePreference === 'stable') {
    copy.sort((a, b) => {
      const aRelease = a.versionType === 'release' ? 0 : 1;
      const bRelease = b.versionType === 'release' ? 0 : 1;
      if (aRelease !== bRelease) {
        return aRelease - bRelease;
      }
      return comparePublishedAtDesc(a, b);
    });
    return copy;
  }
  copy.sort(comparePublishedAtDesc);
  return copy;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
  }
}

function isAbortError(err: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) {
    return true;
  }
  if (!err || typeof err !== 'object') {
    return false;
  }
  return 'name' in err && (err as { name?: string }).name === 'AbortError';
}

/**
 * Resolves a single project's version and candidate list for one environment.
 *
 * Order of rules:
 * 1. Pinned (dependencies only): compatible pinned version; if multiple distinct pins exist,
 *    pick the compatible pin with the greatest `publishedAt` and set `pinConflict: true`.
 * 2. Latest compatible: matches `gameVersion` and (for `mod`/`plugin`) `platform`, ordered by `releasePreference`.
 * 3. Game-version fallback: for platform-specific types when Rule 2 yields none, versions matching
 *    `gameVersion` whose `platforms` array is empty, ordered by `publishedAt` descending.
 * 4. None: `version: null, resolution: 'none'`.
 */
export function resolveVersionForEnvironment(
  input: ResolveVersionInput,
): ResolvedEnvironmentVersion {
  if (input.support === 'unsupported') {
    return {
      candidates: [],
      version: null,
      resolution: 'none',
      pinConflict: false,
    };
  }

  const agnostic = isPlatformAgnostic(input.projectType);
  const gameVersion = input.target.gameVersion;
  const platformLower = input.target.platform.toLowerCase();

  const usableVersions = filterUsableVersions([...input.versions, ...(input.pinnedVersions ?? [])]);
  const usableById = new Map<string, VersionRef>(usableVersions.map((v) => [v.id, v]));

  const matchesGameVersion = (v: VersionRef): boolean => v.gameVersions.includes(gameVersion);
  const matchesPlatform = (v: VersionRef): boolean =>
    agnostic || v.platforms.some((p) => p.toLowerCase() === platformLower);
  const isFallbackCandidate = (v: VersionRef): boolean =>
    matchesGameVersion(v) && isUnverifiedPlatformCandidate(v, input.projectType);

  const directPool = sortVersionsByPreference(
    usableVersions.filter((v) => matchesGameVersion(v) && matchesPlatform(v)),
    input.target.releasePreference,
  );

  const fallbackPool = [...usableVersions.filter(isFallbackCandidate)].sort(comparePublishedAtDesc);

  const candidates = [...directPool, ...fallbackPool];

  // Rule 1: Pinned (dependencies only)
  const distinctPinIds = Array.from(
    new Set((input.pinnedVersionIds ?? []).filter((id): id is string => Boolean(id))),
  );
  const compatiblePins: VersionRef[] = [];
  for (const pinId of distinctPinIds) {
    const pinned = usableById.get(pinId);
    if (pinned && matchesGameVersion(pinned) && matchesPlatform(pinned)) {
      compatiblePins.push(pinned);
    }
  }
  compatiblePins.sort(comparePublishedAtDesc);

  const pinConflict = compatiblePins.length > 1;

  if (compatiblePins[0]) {
    return {
      candidates,
      version: compatiblePins[0],
      resolution: 'pinned',
      pinConflict,
    };
  }

  // Rule 2: Latest compatible
  if (directPool[0]) {
    return {
      candidates,
      version: directPool[0],
      resolution: 'latest-compatible',
      pinConflict,
    };
  }

  // Rule 3: Game-version fallback
  if (fallbackPool[0]) {
    return {
      candidates,
      version: fallbackPool[0],
      resolution: 'game-version-fallback',
      pinConflict,
    };
  }

  // Rule 4: None
  return {
    candidates,
    version: null,
    resolution: 'none',
    pinConflict,
  };
}

/**
 * Applies the initial selection rules across both environments:
 * - Every collection entry is selected (`on: true, source: 'user'`) where selectable.
 * - Every dependency entry is selected (`on: true, source: 'auto'`) where selectable
 *   and transitively required by ≥1 selected entry's chosen version in that environment.
 */
export function applyInitialSelection(entries: readonly Entry[]): Entry[] {
  const cloned: Entry[] = entries.map((entry) => ({
    project: { ...entry.project },
    origin: entry.origin,
    environments: {
      client: {
        ...entry.environments.client,
        candidates: [...entry.environments.client.candidates],
        dependencies: [...entry.environments.client.dependencies],
        requiredBy: [...entry.environments.client.requiredBy],
        selection: { on: false, source: 'none' },
      },
      server: {
        ...entry.environments.server,
        candidates: [...entry.environments.server.candidates],
        dependencies: [...entry.environments.server.dependencies],
        requiredBy: [...entry.environments.server.requiredBy],
        selection: { on: false, source: 'none' },
      },
    },
  }));

  const byId = new Map<string, Entry>(cloned.map((e) => [e.project.id, e]));

  for (const env of ENVIRONMENTS) {
    const queue: Entry[] = [];
    const visited = new Set<string>();
    for (const entry of cloned) {
      const envState = entry.environments[env];
      if (entry.origin === 'collection' && isSelectable(envState)) {
        envState.selection = { on: true, source: 'user' };
        visited.add(entry.project.id);
        queue.push(entry);
      } else {
        envState.selection = { on: false, source: 'none' };
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currentState = current.environments[env];
      if (!currentState.selection.on || !currentState.version) {
        continue;
      }
      for (const depId of currentState.dependencies) {
        const depEntry = byId.get(depId);
        if (!depEntry) {
          continue;
        }
        const depState = depEntry.environments[env];
        if (!isSelectable(depState)) {
          continue;
        }
        if (!depState.selection.on) {
          depState.selection = {
            on: true,
            source: depEntry.origin === 'collection' ? 'user' : 'auto',
          };
        }
        if (depState.selection.on && !visited.has(depId)) {
          visited.add(depId);
          queue.push(depEntry);
        }
      }
    }
  }

  return cloned;
}

interface EnvClosureResult {
  closureIds: string[];
  resolvedByProject: Map<string, ResolvedEnvironmentVersion>;
  requiredByMap: Map<string, string[]>;
  missingProjectIds: string[];
  missingVersionIds: string[];
}

function computeEnvironmentClosureInMemory(
  env: EnvironmentId,
  rootProjectIds: readonly string[],
  target: InstanceTarget,
  projectMap: ReadonlyMap<string, ProjectInfo>,
  versionsByProject: ReadonlyMap<string, VersionInfo[]>,
  versionsById: ReadonlyMap<string, VersionInfo>,
  fetchedProjectIds: ReadonlySet<string>,
  fetchedVersionIds: ReadonlySet<string>,
  userOverrides?: ReadonlyMap<string, VersionRef>,
  collectionIdSet?: ReadonlySet<string>,
): EnvClosureResult {
  const effectiveCollectionIds = collectionIdSet ?? new Set<string>(rootProjectIds);
  const resolvedByProject = new Map<string, ResolvedEnvironmentVersion>();
  let pinsByTarget = new Map<string, string[]>();
  let requiredByMap = new Map<string, string[]>();
  let closureIds = [...rootProjectIds];

  const maxIterations = Math.max(fetchedProjectIds.size + rootProjectIds.length + 4, 8);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    // Resolve every project currently in closureIds
    for (const projectId of closureIds) {
      const proj = projectMap.get(projectId);
      if (!proj || !isExportableProjectType(proj.type)) {
        resolvedByProject.set(projectId, {
          candidates: [],
          version: null,
          resolution: 'none',
          pinConflict: false,
        });
        continue;
      }

      const support = proj.support[env];
      const isCollectionEntry = effectiveCollectionIds.has(projectId);
      const pinIds = isCollectionEntry ? [] : (pinsByTarget.get(projectId) ?? []);
      const pinnedVersionObjs: VersionInfo[] = [];
      for (const pinId of pinIds) {
        const pv = versionsById.get(pinId);
        if (pv && pv.projectId === projectId) {
          pinnedVersionObjs.push(pv);
        }
      }

      const baseResolved = resolveVersionForEnvironment({
        projectType: proj.type,
        support,
        versions: versionsByProject.get(projectId) ?? [],
        target,
        pinnedVersionIds: pinIds,
        pinnedVersions: pinnedVersionObjs,
      });

      const userOverride = userOverrides?.get(projectId);
      if (userOverride && support !== 'unsupported') {
        const hasCandidate = baseResolved.candidates.some((c) => c.id === userOverride.id);
        const candidates = hasCandidate
          ? baseResolved.candidates
          : [userOverride, ...baseResolved.candidates];
        resolvedByProject.set(projectId, {
          candidates,
          version: userOverride,
          resolution: 'user',
          pinConflict: baseResolved.pinConflict,
        });
      } else {
        resolvedByProject.set(projectId, baseResolved);
      }
    }

    // Traverse required dependencies from rootProjectIds with cycle protection
    const visited = new Set<string>(rootProjectIds);
    const queue: string[] = [...rootProjectIds];
    const nextClosureIds: string[] = [...rootProjectIds];
    const nextPinsMap = new Map<string, Set<string>>();
    const nextRequiredByMap = new Map<string, Set<string>>();

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const resolved = resolvedByProject.get(currentId);
      const chosen = resolved?.version ?? null;
      if (!chosen) {
        continue;
      }

      for (const dep of chosen.dependencies) {
        if (dep.type !== 'required' || !dep.projectId) {
          continue;
        }
        const depId = dep.projectId;

        let reqSet = nextRequiredByMap.get(depId);
        if (!reqSet) {
          reqSet = new Set<string>();
          nextRequiredByMap.set(depId, reqSet);
        }
        reqSet.add(currentId);

        if (dep.versionId && !effectiveCollectionIds.has(depId)) {
          let pinSet = nextPinsMap.get(depId);
          if (!pinSet) {
            pinSet = new Set<string>();
            nextPinsMap.set(depId, pinSet);
          }
          pinSet.add(dep.versionId);
        }

        if (!visited.has(depId)) {
          visited.add(depId);
          nextClosureIds.push(depId);
          if (fetchedProjectIds.has(depId)) {
            queue.push(depId);
          }
        }
      }
    }

    const nextPinsRecord = new Map<string, string[]>();
    for (const [k, v] of nextPinsMap.entries()) {
      nextPinsRecord.set(k, Array.from(v));
    }

    const nextRequiredByRecord = new Map<string, string[]>();
    for (const [k, v] of nextRequiredByMap.entries()) {
      nextRequiredByRecord.set(k, Array.from(v));
    }

    const sameClosure =
      nextClosureIds.length === closureIds.length &&
      nextClosureIds.every((id, idx) => id === closureIds[idx]);
    const samePins =
      nextPinsRecord.size === pinsByTarget.size &&
      Array.from(nextPinsRecord.entries()).every(([k, arr]) => {
        const prev = pinsByTarget.get(k);
        return (
          prev !== undefined && prev.length === arr.length && prev.every((v, i) => v === arr[i])
        );
      });

    closureIds = nextClosureIds;
    pinsByTarget = nextPinsRecord;
    requiredByMap = nextRequiredByRecord;

    if (sameClosure && samePins) {
      // Ensure any newly added leaf nodes in closureIds are also resolved
      for (const projectId of closureIds) {
        if (!resolvedByProject.has(projectId)) {
          const proj = projectMap.get(projectId);
          if (!proj || !isExportableProjectType(proj.type)) {
            resolvedByProject.set(projectId, {
              candidates: [],
              version: null,
              resolution: 'none',
              pinConflict: false,
            });
          } else {
            const isCollectionEntry = effectiveCollectionIds.has(projectId);
            const pinIds = isCollectionEntry ? [] : (pinsByTarget.get(projectId) ?? []);
            const pinnedVersionObjs = pinIds
              .map((id) => versionsById.get(id))
              .filter((v): v is VersionInfo => v !== undefined && v.projectId === projectId);
            resolvedByProject.set(
              projectId,
              resolveVersionForEnvironment({
                projectType: proj.type,
                support: proj.support[env],
                versions: versionsByProject.get(projectId) ?? [],
                target,
                pinnedVersionIds: pinIds,
                pinnedVersions: pinnedVersionObjs,
              }),
            );
          }
        }
      }
      break;
    }
  }

  const missingProjectIds: string[] = [];
  const missingVersionIds: string[] = [];

  for (const projectId of closureIds) {
    if (!fetchedProjectIds.has(projectId) && !missingProjectIds.includes(projectId)) {
      missingProjectIds.push(projectId);
    }
    const chosen = resolvedByProject.get(projectId)?.version;
    if (chosen) {
      for (const dep of chosen.dependencies) {
        if (dep.type === 'required' && dep.versionId && !effectiveCollectionIds.has(dep.projectId)) {
          const knownForTarget =
            versionsByProject.get(dep.projectId)?.some((v) => v.id === dep.versionId) ?? false;
          if (!knownForTarget && !versionsById.has(dep.versionId) && !fetchedVersionIds.has(dep.versionId)) {
            if (!missingVersionIds.includes(dep.versionId)) {
              missingVersionIds.push(dep.versionId);
            }
          }
        }
      }
    }
  }

  return {
    closureIds,
    resolvedByProject,
    requiredByMap,
    missingProjectIds,
    missingVersionIds,
  };
}

function makePlaceholderProjectInfo(projectId: string): ProjectInfo {
  return {
    id: projectId,
    slug: projectId,
    title: projectId,
    type: 'mod',
    modrinthUrl: `https://modrinth.com/project/${projectId}`,
    support: {
      client: 'required',
      server: 'required',
    },
  };
}

function makeUnsupportedEnvironmentState(): EnvironmentState {
  return {
    support: 'unsupported',
    candidates: [],
    version: null,
    resolution: 'none',
    dependencies: [],
    requiredBy: [],
    selection: { on: false, source: 'none' },
  };
}

function entryToProjectInfo(entry: Entry): ProjectInfo {
  return {
    id: entry.project.id,
    slug: entry.project.slug,
    title: entry.project.title,
    type: entry.project.type,
    modrinthUrl: entry.project.modrinthUrl,
    support: {
      client: entry.environments.client.support,
      server: entry.environments.server.support,
    },
  };
}

function versionRefToVersionInfo(
  version: VersionRef,
  projectId: string,
  fallbackRequiredDeps?: readonly string[],
): VersionInfo {
  const dependencies =
    version.dependencies.length > 0 || !fallbackRequiredDeps || fallbackRequiredDeps.length === 0
      ? version.dependencies.map((d) => ({
          projectId: d.projectId,
          ...(d.versionId !== undefined ? { versionId: d.versionId } : {}),
          type: d.type,
        }))
      : fallbackRequiredDeps.map((depId) => ({
          projectId: depId,
          type: 'required' as const,
        }));

  return {
    id: version.id,
    projectId,
    versionNumber: version.versionNumber,
    versionType: version.versionType,
    publishedAt: version.publishedAt,
    gameVersions: [...version.gameVersions],
    platforms: [...version.platforms],
    file: { ...version.file },
    dependencies,
  };
}

function collectEntryVersionsForEnv(entry: Entry, env: EnvironmentId): VersionInfo[] {
  const envState = entry.environments[env];
  const seen = new Set<string>();
  const result: VersionInfo[] = [];

  const pushRef = (ref: VersionRef, isChosen: boolean): void => {
    if (seen.has(ref.id)) {
      return;
    }
    seen.add(ref.id);
    result.push(
      versionRefToVersionInfo(
        ref,
        entry.project.id,
        isChosen ? envState.dependencies : undefined,
      ),
    );
  };

  for (const c of envState.candidates) {
    pushRef(c, c.id === envState.version?.id);
  }
  if (envState.version) {
    pushRef(envState.version, true);
  }

  return result;
}

/**
 * Resolves a Modrinth collection into a complete `Instance` and list of `SkippedProject`s
 * against the `ModrinthClient` port.
 */
export async function resolveCollection(
  client: ModrinthClient,
  opts: ResolveCollectionOptions,
): Promise<ResolveCollectionResult> {
  throwIfAborted(opts.signal);
  const { collectionId, url } = parseCollectionInput(opts.collectionInput);
  const target: InstanceTarget = {
    gameVersion: opts.gameVersion,
    platform: opts.platform,
    releasePreference: opts.releasePreference,
  };
  const requestOpts = opts.signal ? { signal: opts.signal } : undefined;

  throwIfAborted(opts.signal);
  opts.onProgress?.({
    phase: 'collection',
    loaded: 0,
    total: 1,
    message: `Fetching collection ${collectionId}`,
  });

  const collection = await client.getCollection(collectionId, requestOpts);
  const uniqueCollectionIds = Array.from(
    new Set(collection.projectIds.filter((id) => Boolean(id))),
  );

  throwIfAborted(opts.signal);
  opts.onProgress?.({
    phase: 'projects',
    loaded: 0,
    total: uniqueCollectionIds.length,
    message: `Fetching ${uniqueCollectionIds.length} collection project(s)`,
  });

  const projectMap = new Map<string, ProjectInfo>();
  const versionsByProject = new Map<string, VersionInfo[]>();
  const versionsById = new Map<string, VersionInfo>();
  const fetchedProjectIds = new Set<string>();
  const fetchedVersionIds = new Set<string>();
  const skipped: SkippedProject[] = [];
  const skippedIds = new Set<string>();

  const recordSkipped = (item: SkippedProject): void => {
    if (!skippedIds.has(item.id)) {
      skippedIds.add(item.id);
      skipped.push(item);
    }
  };

  if (uniqueCollectionIds.length > 0) {
    const initialProjects = await client.getProjects(uniqueCollectionIds, requestOpts);
    for (const p of initialProjects) {
      projectMap.set(p.id, p);
    }
  }

  const exportableCollectionIds: string[] = [];
  const modpackCollectionProjects: ProjectInfo[] = [];

  for (const id of uniqueCollectionIds) {
    fetchedProjectIds.add(id);
    const proj = projectMap.get(id);
    if (!proj) {
      recordSkipped({
        id,
        title: id,
        type: 'unknown',
        reason: 'Project not found on Modrinth',
      });
      continue;
    }

    if (proj.type === 'modpack') {
      recordSkipped({
        id: proj.id,
        slug: proj.slug,
        title: proj.title,
        type: proj.type,
        modrinthUrl: proj.modrinthUrl,
        reason: MODPACK_SKIPPED_REASON,
      });
      modpackCollectionProjects.push(proj);
      continue;
    }

    if (!isKnownProjectType(proj.type)) {
      recordSkipped({
        id: proj.id,
        slug: proj.slug,
        title: proj.title,
        type: proj.type,
        modrinthUrl: proj.modrinthUrl,
        reason: `Unsupported project type: ${proj.type}`,
      });
      continue;
    }

    exportableCollectionIds.push(proj.id);
  }

  // Fetch versions for exportable collection projects
  let loadedVersions = 0;
  const failedCollectionVersionErrors: unknown[] = [];
  const failedCollectionProjectIds = new Set<string>();
  for (const projectId of exportableCollectionIds) {
    throwIfAborted(opts.signal);
    const collectionProj = projectMap.get(projectId);
    const projectLabel = collectionProj
      ? `${collectionProj.title} (${collectionProj.slug})`
      : projectId;
    opts.onProgress?.({
      phase: 'versions',
      loaded: loadedVersions,
      total: exportableCollectionIds.length,
      message: `Fetching versions for ${projectLabel}`,
    });
    try {
      const versions = await client.getProjectVersions(
        projectId,
        { gameVersion: target.gameVersion },
        requestOpts,
      );
      versionsByProject.set(projectId, versions);
      for (const v of versions) {
        versionsById.set(v.id, v);
      }
      loadedVersions += 1;
    } catch (err: unknown) {
      if (isAbortError(err, opts.signal)) {
        throw err;
      }
      failedCollectionVersionErrors.push(err);
      failedCollectionProjectIds.add(projectId);
      versionsByProject.set(projectId, []);
      const proj = projectMap.get(projectId)!;
      recordSkipped({
        id: proj.id,
        slug: proj.slug,
        title: proj.title,
        type: proj.type,
        modrinthUrl: proj.modrinthUrl,
        reason: `Failed to fetch versions: ${err instanceof Error ? err.message : String(err)}`,
      });
      loadedVersions += 1;
      opts.onProgress?.({
        phase: 'versions',
        loaded: loadedVersions,
        total: exportableCollectionIds.length,
        message: `Warning: Failed to fetch versions for ${proj.title} (${projectId})`,
      });
    }
  }

  if (
    exportableCollectionIds.length > 0 &&
    failedCollectionVersionErrors.length === exportableCollectionIds.length
  ) {
    throw failedCollectionVersionErrors[0];
  }

  const resolvedCollectionIds = exportableCollectionIds.filter(
    (id) => !failedCollectionProjectIds.has(id),
  );

  // Fixed-point dependency fetch & closure loop across both environments
  const collectionIdSet = new Set<string>(resolvedCollectionIds);
  let clientClosure!: EnvClosureResult;
  let serverClosure!: EnvClosureResult;

  while (true) {
    throwIfAborted(opts.signal);
    clientClosure = computeEnvironmentClosureInMemory(
      'client',
      resolvedCollectionIds,
      target,
      projectMap,
      versionsByProject,
      versionsById,
      fetchedProjectIds,
      fetchedVersionIds,
      undefined,
      collectionIdSet,
    );
    serverClosure = computeEnvironmentClosureInMemory(
      'server',
      resolvedCollectionIds,
      target,
      projectMap,
      versionsByProject,
      versionsById,
      fetchedProjectIds,
      fetchedVersionIds,
      undefined,
      collectionIdSet,
    );

    const missingProjects = Array.from(
      new Set([...clientClosure.missingProjectIds, ...serverClosure.missingProjectIds]),
    );
    const missingVersions = Array.from(
      new Set([...clientClosure.missingVersionIds, ...serverClosure.missingVersionIds]),
    );

    if (missingProjects.length === 0 && missingVersions.length === 0) {
      break;
    }

    if (missingProjects.length > 0) {
      throwIfAborted(opts.signal);
      opts.onProgress?.({
        phase: 'dependencies',
        loaded: fetchedProjectIds.size,
        total: fetchedProjectIds.size + missingProjects.length,
        message: `Fetching ${missingProjects.length} dependency project(s)`,
      });

      for (const id of missingProjects) {
        fetchedProjectIds.add(id);
      }

      let depProjects: ProjectInfo[] = [];
      let depProjectsFetchError: unknown = null;
      try {
        depProjects = await client.getProjects(missingProjects, requestOpts);
      } catch (err: unknown) {
        if (isAbortError(err, opts.signal)) {
          throw err;
        }
        depProjectsFetchError = err;
        opts.onProgress?.({
          phase: 'dependencies',
          loaded: fetchedProjectIds.size,
          total: fetchedProjectIds.size,
          message: `Warning: Failed to fetch dependency projects (${err instanceof Error ? err.message : String(err)})`,
        });
      }
      for (const p of depProjects) {
        projectMap.set(p.id, p);
      }

      for (const depId of missingProjects) {
        const proj = projectMap.get(depId);
        if (!proj) {
          // Create a placeholder project with no versions so dependency unavailability is surfaced in status
          const placeholder = makePlaceholderProjectInfo(depId);
          projectMap.set(depId, placeholder);
          versionsByProject.set(depId, []);
          if (depProjectsFetchError !== null) {
            recordSkipped({
              id: placeholder.id,
              slug: placeholder.slug,
              title: placeholder.title,
              type: placeholder.type,
              modrinthUrl: placeholder.modrinthUrl,
              reason: `Failed to fetch dependency project: ${
                depProjectsFetchError instanceof Error
                  ? depProjectsFetchError.message
                  : String(depProjectsFetchError)
              }`,
            });
          }
          continue;
        }

        if (proj.type === 'modpack' || !isKnownProjectType(proj.type)) {
          recordSkipped({
            id: proj.id,
            slug: proj.slug,
            title: proj.title,
            type: proj.type,
            modrinthUrl: proj.modrinthUrl,
            reason:
              proj.type === 'modpack'
                ? MODPACK_SKIPPED_REASON
                : `Unsupported project type: ${proj.type}`,
          });
          versionsByProject.set(depId, []);
          continue;
        }

        opts.onProgress?.({
          phase: 'dependencies',
          loaded: fetchedProjectIds.size,
          total: fetchedProjectIds.size,
          message: `Fetching versions for ${proj.title} (${proj.slug})`,
        });

        try {
          const versions = await client.getProjectVersions(
            depId,
            { gameVersion: target.gameVersion },
            requestOpts,
          );
          versionsByProject.set(depId, versions);
          for (const v of versions) {
            versionsById.set(v.id, v);
          }
        } catch (err: unknown) {
          if (isAbortError(err, opts.signal)) {
            throw err;
          }
          versionsByProject.set(depId, []);
          recordSkipped({
            id: proj.id,
            slug: proj.slug,
            title: proj.title,
            type: proj.type,
            modrinthUrl: proj.modrinthUrl,
            reason: `Failed to fetch versions: ${err instanceof Error ? err.message : String(err)}`,
          });
          opts.onProgress?.({
            phase: 'dependencies',
            loaded: fetchedProjectIds.size,
            total: fetchedProjectIds.size,
            message: `Warning: Failed to fetch versions for ${proj.title} (${depId})`,
          });
        }
      }
    }

    if (missingVersions.length > 0) {
      for (const vId of missingVersions) {
        fetchedVersionIds.add(vId);
      }
      try {
        const pinnedFetched = await client.getVersionsByIds(missingVersions, requestOpts);
        for (const v of pinnedFetched) {
          versionsById.set(v.id, v);
          const existingList = versionsByProject.get(v.projectId);
          if (existingList && !existingList.some((ev) => ev.id === v.id)) {
            existingList.push(v);
          }
        }
      } catch (err: unknown) {
        if (isAbortError(err, opts.signal)) {
          throw err;
        }
        opts.onProgress?.({
          phase: 'dependencies',
          loaded: fetchedProjectIds.size,
          total: fetchedProjectIds.size,
          message: `Warning: Failed to fetch pinned versions (${err instanceof Error ? err.message : String(err)})`,
        });
      }
    }
  }

  // Assemble entries: collection entries first, then dependency entries in discovery order
  const dependencyProjectIds: string[] = [];
  for (const id of [...clientClosure.closureIds, ...serverClosure.closureIds]) {
    if (!collectionIdSet.has(id) && !dependencyProjectIds.includes(id)) {
      const proj = projectMap.get(id);
      if (proj && isExportableProjectType(proj.type)) {
        dependencyProjectIds.push(id);
      }
    }
  }

  const allEntryProjectIds = [
    ...resolvedCollectionIds,
    ...modpackCollectionProjects.map((p) => p.id),
    ...dependencyProjectIds,
  ];

  const rawEntries: Entry[] = [];

  for (const projectId of allEntryProjectIds) {
    const proj = projectMap.get(projectId)!;
    const isModpack = proj.type === 'modpack';
    if (isModpack) {
      rawEntries.push({
        project: {
          id: proj.id,
          slug: proj.slug,
          title: proj.title,
          type: 'modpack',
          modrinthUrl: proj.modrinthUrl,
        },
        origin: 'collection',
        environments: {
          client: makeUnsupportedEnvironmentState(),
          server: makeUnsupportedEnvironmentState(),
        },
      });
      continue;
    }

    const origin = collectionIdSet.has(projectId) ? 'collection' : 'dependency';
    const envStates = {} as Record<EnvironmentId, EnvironmentState>;

    for (const env of ENVIRONMENTS) {
      const closure = env === 'client' ? clientClosure : serverClosure;
      const resolved =
        closure.resolvedByProject.get(projectId) ??
        resolveVersionForEnvironment({
          projectType: proj.type,
          support: proj.support[env],
          versions: versionsByProject.get(projectId) ?? [],
          target,
        });

      envStates[env] = {
        support: proj.support[env],
        candidates: resolved.candidates,
        version: resolved.version,
        resolution: resolved.resolution,
        dependencies: extractRequiredDependencyIds(resolved.version),
        requiredBy: closure.requiredByMap.get(projectId) ?? [],
        selection: { on: false, source: 'none' },
      };
    }

    rawEntries.push({
      project: {
        id: proj.id,
        slug: proj.slug,
        title: proj.title,
        type: proj.type as ProjectType,
        modrinthUrl: proj.modrinthUrl,
      },
      origin,
      environments: envStates,
    });
  }

  const entriesWithSelection = applyInitialSelection(rawEntries);
  registerKnownProjectTitles([...projectMap.values()]);

  const missingOptionalIds = new Set<string>();
  for (const entry of entriesWithSelection) {
    for (const env of ENVIRONMENTS) {
      for (const optId of extractOptionalDependencyIds(entry.environments[env].version)) {
        if (!projectMap.has(optId) && !getKnownProjectTitle(optId)) {
          missingOptionalIds.add(optId);
        }
      }
    }
  }
  if (missingOptionalIds.size > 0) {
    try {
      const optProjects = await client.getProjects([...missingOptionalIds], requestOpts);
      registerKnownProjectTitles(optProjects);
    } catch (err: unknown) {
      if (isAbortError(err, opts.signal)) {
        throw err;
      }
    }
  }

  throwIfAborted(opts.signal);
  opts.onProgress?.({
    phase: 'complete',
    loaded: entriesWithSelection.length,
    total: entriesWithSelection.length,
    message: 'Resolution complete',
  });

  const instance: Instance = {
    schemaVersion: CORE_SCHEMA_VERSION,
    meta: {
      name: collection.name || collectionId,
      source: {
        collectionId,
        url,
      },
      target,
      createdAt: opts.createdAt ?? new Date().toISOString(),
    },
    entries: entriesWithSelection,
  };

  return {
    instance,
    skipped,
  };
}

/**
 * Pure synchronous helper that overrides an entry's chosen version in `env`,
 * recomputes that environment's dependency closure and `requiredBy` edges,
 * updates auto-selected / auto-deselected dependencies, and returns `{ instance, changes }`.
 */
export function recomputeDependencyClosure(
  instance: Instance,
  opts: RecomputeClosureOptions,
): ReducerResult {
  const { projectId, env, versionId } = opts;
  const targetEntry = instance.entries.find((e) => e.project.id === projectId);
  if (!targetEntry) {
    return { instance, changes: [] };
  }

  const targetEnvState = targetEntry.environments[env];
  if (targetEnvState.support === 'unsupported') {
    return { instance, changes: [] };
  }

  // Find the chosen version in candidates, current version, or extraVersions
  const extraUsable = filterUsableVersions(
    (opts.extraVersions ?? []).filter((v) => v.projectId === projectId),
  );
  const candidatePool = [
    ...targetEnvState.candidates,
    ...(targetEnvState.version ? [targetEnvState.version] : []),
    ...extraUsable,
  ];
  const chosenVersion = candidatePool.find((v) => v.id === versionId) ?? null;
  if (!chosenVersion) {
    return { instance, changes: [] };
  }

  // Clone existing entries into entryMap and build closure maps
  const entryMap = new Map<string, Entry>();
  const projectMap = new Map<string, ProjectInfo>();
  const versionsByProject = new Map<string, VersionInfo[]>();
  const versionsById = new Map<string, VersionInfo>();
  const fetchedProjectIds = new Set<string>();
  const fetchedVersionIds = new Set<string>();
  const collectionIdSet = new Set<string>();
  const userOverrides = new Map<string, VersionRef>();

  for (const entry of instance.entries) {
    const id = entry.project.id;
    entryMap.set(id, {
      project: { ...entry.project },
      origin: entry.origin,
      environments: {
        client: {
          ...entry.environments.client,
          candidates: [...entry.environments.client.candidates],
          dependencies: [...entry.environments.client.dependencies],
          requiredBy: [...entry.environments.client.requiredBy],
          selection: { ...entry.environments.client.selection },
        },
        server: {
          ...entry.environments.server,
          candidates: [...entry.environments.server.candidates],
          dependencies: [...entry.environments.server.dependencies],
          requiredBy: [...entry.environments.server.requiredBy],
          selection: { ...entry.environments.server.selection },
        },
      },
    });

    projectMap.set(id, entryToProjectInfo(entry));
    fetchedProjectIds.add(id);
    if (entry.origin === 'collection') {
      collectionIdSet.add(id);
    }

    const envVersions = collectEntryVersionsForEnv(entry, env);
    versionsByProject.set(id, envVersions);
    for (const v of envVersions) {
      versionsById.set(v.id, v);
      fetchedVersionIds.add(v.id);
    }

    const envState = entry.environments[env];
    if (id !== projectId && envState.resolution === 'user' && envState.version !== null) {
      userOverrides.set(id, envState.version);
    }
  }

  for (const p of opts.extraProjects ?? []) {
    projectMap.set(p.id, p);
    fetchedProjectIds.add(p.id);
    if (!versionsByProject.has(p.id)) {
      versionsByProject.set(p.id, []);
    }
  }

  for (const v of opts.extraVersions ?? []) {
    versionsById.set(v.id, v);
    fetchedVersionIds.add(v.id);
    const list = versionsByProject.get(v.projectId) ?? [];
    if (!list.some((ev) => ev.id === v.id)) {
      list.push(v);
    }
    versionsByProject.set(v.projectId, list);
  }

  userOverrides.set(projectId, chosenVersion);
  const chosenVersionInfo = versionRefToVersionInfo(chosenVersion, projectId);
  versionsById.set(chosenVersionInfo.id, chosenVersionInfo);
  fetchedVersionIds.add(chosenVersionInfo.id);
  const targetVerList = versionsByProject.get(projectId) ?? [];
  if (!targetVerList.some((v) => v.id === chosenVersionInfo.id)) {
    targetVerList.push(chosenVersionInfo);
    versionsByProject.set(projectId, targetVerList);
  }

  // Synthesize placeholder ProjectInfo for any unknown dependency projectId referenced by known versions
  // so missing dependencies in the closure still produce an Entry with version: null and requiredBy populated
  for (const verList of versionsByProject.values()) {
    for (const v of verList) {
      for (const dep of v.dependencies) {
        if (dep.type === 'required' && dep.projectId && !projectMap.has(dep.projectId)) {
          projectMap.set(dep.projectId, makePlaceholderProjectInfo(dep.projectId));
          fetchedProjectIds.add(dep.projectId);
          versionsByProject.set(dep.projectId, []);
        }
      }
    }
  }

  // Determine root entries for closure in `env`
  const rootIds: string[] = [];
  for (const entry of entryMap.values()) {
    if (
      isExportableProjectType(entry.project.type) &&
      (entry.origin === 'collection' ||
        entry.project.id === projectId ||
        (entry.environments[env].selection.on &&
          entry.environments[env].selection.source === 'user'))
    ) {
      rootIds.push(entry.project.id);
    }
  }

  const closure = computeEnvironmentClosureInMemory(
    env,
    rootIds,
    instance.meta.target,
    projectMap,
    versionsByProject,
    versionsById,
    fetchedProjectIds,
    fetchedVersionIds,
    userOverrides,
    collectionIdSet,
  );

  // Add any newly discovered exportable projects in closure.closureIds to entryMap
  for (const id of closure.closureIds) {
    if (!entryMap.has(id)) {
      const proj = projectMap.get(id) ?? makePlaceholderProjectInfo(id);
      if (isExportableProjectType(proj.type)) {
        const envStates = {} as Record<EnvironmentId, EnvironmentState>;
        for (const e of ENVIRONMENTS) {
          const res =
            e === env
              ? (closure.resolvedByProject.get(id) ??
                resolveVersionForEnvironment({
                  projectType: proj.type,
                  support: proj.support[e],
                  versions: versionsByProject.get(id) ?? [],
                  target: instance.meta.target,
                }))
              : resolveVersionForEnvironment({
                  projectType: proj.type,
                  support: proj.support[e],
                  versions: versionsByProject.get(id) ?? [],
                  target: instance.meta.target,
                });
          envStates[e] = {
            support: proj.support[e],
            candidates: res.candidates,
            version: res.version,
            resolution: res.resolution,
            dependencies: extractRequiredDependencyIds(res.version),
            requiredBy: e === env ? (closure.requiredByMap.get(id) ?? []) : [],
            selection: { on: false, source: 'none' },
          };
        }

        entryMap.set(id, {
          project: {
            id: proj.id,
            slug: proj.slug,
            title: proj.title,
            type: proj.type,
            modrinthUrl: proj.modrinthUrl,
          },
          origin: 'dependency',
          environments: envStates,
        });
      }
    }
  }

  // Update environment state in `env` for all exportable entries
  for (const entry of entryMap.values()) {
    if (!isExportableProjectType(entry.project.type)) {
      continue;
    }
    const id = entry.project.id;
    const existingEnvState = entry.environments[env];
    const resolved = closure.resolvedByProject.get(id);

    if (resolved) {
      entry.environments[env] = {
        ...existingEnvState,
        candidates: resolved.candidates,
        version: resolved.version,
        resolution: resolved.resolution,
        dependencies: extractRequiredDependencyIds(resolved.version),
        requiredBy: closure.requiredByMap.get(id) ?? [],
      };
    } else {
      // Entry fell out of `env`'s closure: clear requiredBy and revert any dropped pin if resolution !== 'user'
      if (existingEnvState.resolution !== 'user') {
        const unpinned = resolveVersionForEnvironment({
          projectType: entry.project.type,
          support: existingEnvState.support,
          versions: versionsByProject.get(id) ?? [],
          target: instance.meta.target,
        });
        entry.environments[env] = {
          ...existingEnvState,
          candidates: unpinned.candidates,
          version: unpinned.version,
          resolution: unpinned.resolution,
          dependencies: extractRequiredDependencyIds(unpinned.version),
          requiredBy: [],
        };
      } else {
        entry.environments[env] = {
          ...existingEnvState,
          requiredBy: [],
        };
      }
    }
  }

  // Recompute selection and collect auto-select / auto-deselect changes in `env`
  const selectionRoots: Entry[] = [];
  for (const entry of entryMap.values()) {
    const st = entry.environments[env];
    if (!isSelectable(st) || !st.selection.on) {
      continue;
    }
    if (
      st.selection.source === 'user' ||
      (entry.project.id === projectId && st.requiredBy.length === 0)
    ) {
      selectionRoots.push(entry);
    }
  }

  const neededBySelectedInEnv = new Set<string>();
  const selVisited = new Set<string>(selectionRoots.map((e) => e.project.id));
  const selQueue: Entry[] = [...selectionRoots];

  while (selQueue.length > 0) {
    const curr = selQueue.shift()!;
    const currState = curr.environments[env];
    if (!currState.selection.on || !currState.version) {
      continue;
    }

    for (const depId of currState.dependencies) {
      const depEntry = entryMap.get(depId);
      if (!depEntry) {
        continue;
      }
      const depState = depEntry.environments[env];
      if (!isSelectable(depState)) {
        continue;
      }
      // A dependency explicitly turned off by the user (off/user) stays off
      if (!depState.selection.on && depState.selection.source === 'user') {
        continue;
      }
      neededBySelectedInEnv.add(depId);
      if (!selVisited.has(depId)) {
        selVisited.add(depId);
        // Temporarily mark on so its transitive dependencies are also traversed
        if (!depState.selection.on) {
          depState.selection = { on: true, source: 'auto' };
        }
        selQueue.push(depEntry);
      }
    }
  }

  const prevEntriesById = new Map<string, Entry>(instance.entries.map((e) => [e.project.id, e]));
  const changes: Change[] = [];

  for (const entry of entryMap.values()) {
    const prevSelection: Selection = prevEntriesById.get(entry.project.id)?.environments[env]
      .selection ?? {
      on: false,
      source: 'none',
    };
    const currState = entry.environments[env];

    if (prevSelection.source === 'user') {
      currState.selection = { ...prevSelection };
      continue;
    }

    if (neededBySelectedInEnv.has(entry.project.id) && isSelectable(currState)) {
      currState.selection = { on: true, source: 'auto' };
      if (!prevSelection.on) {
        changes.push({
          projectId: entry.project.id,
          env,
          on: true,
          reason: 'auto-selected',
        });
      }
    } else if (
      entry.project.id === projectId &&
      prevSelection.on &&
      currState.requiredBy.length === 0
    ) {
      currState.selection = { ...prevSelection };
    } else {
      if (prevSelection.on && prevSelection.source === 'auto') {
        currState.selection = { on: false, source: 'auto' };
        changes.push({
          projectId: entry.project.id,
          env,
          on: false,
          reason: 'auto-deselected',
        });
      } else {
        currState.selection = { on: false, source: prevSelection.source };
      }
    }
  }

  return {
    instance: {
      ...instance,
      entries: Array.from(entryMap.values()),
    },
    changes,
  };
}

/**
 * Async version override that fetches any newly required dependency projects, versions,
 * or pinned version IDs from `ModrinthClient` before recomputing the environment's closure.
 */
export async function changeEntryVersion(
  instance: Instance,
  client: ModrinthClient,
  opts: ChangeEntryVersionOptions,
): Promise<ReducerResult> {
  throwIfAborted(opts.signal);
  const { projectId, env, versionId, signal } = opts;
  const requestOpts = signal ? { signal } : undefined;
  const targetEntry = instance.entries.find((e) => e.project.id === projectId);
  if (!targetEntry) {
    return { instance, changes: [] };
  }

  const targetEnvState = targetEntry.environments[env];
  if (targetEnvState.support === 'unsupported') {
    return { instance, changes: [] };
  }

  const candidatePool = [
    ...targetEnvState.candidates,
    ...(targetEnvState.version ? [targetEnvState.version] : []),
  ];
  const chosenCandidate = candidatePool.find((c) => c.id === versionId);
  if (!chosenCandidate) {
    return { instance, changes: [] };
  }

  const projectMap = new Map<string, ProjectInfo>();
  const versionsByProject = new Map<string, VersionInfo[]>();
  const versionsById = new Map<string, VersionInfo>();
  const fetchedProjectIds = new Set<string>();
  const fetchedVersionIds = new Set<string>();
  const collectionIdSet = new Set<string>();
  const userOverrides = new Map<string, VersionRef>();
  const rootIds: string[] = [];

  for (const entry of instance.entries) {
    const id = entry.project.id;
    projectMap.set(id, entryToProjectInfo(entry));
    fetchedProjectIds.add(id);
    if (entry.origin === 'collection') {
      collectionIdSet.add(id);
    }

    const envVersions = collectEntryVersionsForEnv(entry, env);
    versionsByProject.set(id, envVersions);
    for (const v of envVersions) {
      versionsById.set(v.id, v);
      fetchedVersionIds.add(v.id);
    }

    const envState = entry.environments[env];
    if (id !== projectId && envState.resolution === 'user' && envState.version !== null) {
      userOverrides.set(id, envState.version);
    }

    if (
      isExportableProjectType(entry.project.type) &&
      (entry.origin === 'collection' ||
        id === projectId ||
        (envState.selection.on && envState.selection.source === 'user'))
    ) {
      rootIds.push(id);
    }
  }

  userOverrides.set(projectId, chosenCandidate);

  const extraProjects: ProjectInfo[] = [];
  const extraVersions: VersionInfo[] = [];

  while (true) {
    throwIfAborted(signal);
    const closure = computeEnvironmentClosureInMemory(
      env,
      rootIds,
      instance.meta.target,
      projectMap,
      versionsByProject,
      versionsById,
      fetchedProjectIds,
      fetchedVersionIds,
      userOverrides,
      collectionIdSet,
    );

    if (closure.missingProjectIds.length === 0 && closure.missingVersionIds.length === 0) {
      break;
    }

    if (closure.missingProjectIds.length > 0) {
      for (const id of closure.missingProjectIds) {
        fetchedProjectIds.add(id);
      }
      const fetchedProjects = await client.getProjects(closure.missingProjectIds, requestOpts);
      for (const p of fetchedProjects) {
        projectMap.set(p.id, p);
        extraProjects.push(p);
      }

      for (const depId of closure.missingProjectIds) {
        const proj = projectMap.get(depId);
        if (!proj) {
          const placeholder = makePlaceholderProjectInfo(depId);
          projectMap.set(depId, placeholder);
          versionsByProject.set(depId, []);
          extraProjects.push(placeholder);
          continue;
        }

        if (!isExportableProjectType(proj.type)) {
          versionsByProject.set(depId, []);
          continue;
        }

        const vers = await client.getProjectVersions(
          depId,
          { gameVersion: instance.meta.target.gameVersion },
          requestOpts,
        );
        versionsByProject.set(depId, vers);
        for (const v of vers) {
          versionsById.set(v.id, v);
          fetchedVersionIds.add(v.id);
          extraVersions.push(v);
        }
      }
    }

    if (closure.missingVersionIds.length > 0) {
      for (const vId of closure.missingVersionIds) {
        fetchedVersionIds.add(vId);
      }
      const fetchedVers = await client.getVersionsByIds(closure.missingVersionIds, requestOpts);
      for (const v of fetchedVers) {
        versionsById.set(v.id, v);
        extraVersions.push(v);
        const existingList = versionsByProject.get(v.projectId);
        if (existingList && !existingList.some((ev) => ev.id === v.id)) {
          existingList.push(v);
        }
      }
    }
  }

  throwIfAborted(signal);
  const recomputed = recomputeDependencyClosure(instance, {
    projectId,
    env,
    versionId,
    extraProjects,
    extraVersions,
  });
  registerKnownProjectTitles([...projectMap.values()]);

  const missingOptionalIds = new Set<string>();
  for (const entry of recomputed.instance.entries) {
    for (const e of ENVIRONMENTS) {
      for (const optId of extractOptionalDependencyIds(entry.environments[e].version)) {
        if (!projectMap.has(optId) && !getKnownProjectTitle(optId)) {
          missingOptionalIds.add(optId);
        }
      }
    }
  }
  if (missingOptionalIds.size > 0) {
    try {
      const optProjects = await client.getProjects([...missingOptionalIds], requestOpts);
      registerKnownProjectTitles(optProjects);
    } catch (err: unknown) {
      if (isAbortError(err, signal)) {
        throw err;
      }
    }
  }

  return recomputed;
}
