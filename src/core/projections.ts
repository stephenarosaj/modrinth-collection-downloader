/**
 * Pure projections of Instance into UI tables, archive file trees, and .mrpack index.
 */

import {
  ENVIRONMENTS,
  MODPACK_SKIPPED_REASON,
  PROJECT_TYPE_ORDER,
  TYPE_FOLDER_MAP,
  type Entry,
  type EnvironmentId,
  type ExportableProjectType,
  type FileTree,
  type FileTreeEntry,
  type Instance,
  type LinkedProjectRef,
  type MrpackEnvSupport,
  type MrpackFile,
  type MrpackIndex,
  type MrpackOptions,
  type SkippedProject,
  type Support,
  type TableModel,
  type TableRow,
  type VersionRef,
  extractOptionalDependencyIds,
  extractRequiredDependencyIds,
  getKnownProjectTitle,
  isExportableProjectType,
  isPlatformAgnostic,
  registerKnownProjectTitles,
} from './model';
import { formatEntryFilename, resolveUniqueFilename } from './naming';

/**
 * Mapping from target platform identifier (lower-case) to Modrinth `.mrpack` dependency key.
 */
const MRPACK_PLATFORM_DEPENDENCY_KEYS: Readonly<Record<string, string>> = {
  fabric: 'fabric-loader',
  'fabric-loader': 'fabric-loader',
  quilt: 'quilt-loader',
  'quilt-loader': 'quilt-loader',
  forge: 'forge',
  neoforge: 'neoforge',
};

/**
 * Maps a platform name (e.g. `'fabric'`, `'quilt'`, `'forge'`, `'neoforge'`) to its `.mrpack`
 * `dependencies` key, or `null` if the platform does not have a standard `.mrpack` loader key.
 */
export function mapPlatformToMrpackDependencyKey(platform: string): string | null {
  const key = platform.trim().toLowerCase();
  return MRPACK_PLATFORM_DEPENDENCY_KEYS[key] ?? null;
}

/**
 * Maps an environment's `Support` and selection state into `.mrpack` `env` support:
 * - If selected: `'required'` -> `'required'`, `'optional'` / `'unknown'` -> `'optional'`.
 * - If not selected (or `'unsupported'`): `'unsupported'`.
 */
export function toMrpackEnvSupport(support: Support, selected: boolean): MrpackEnvSupport {
  if (!selected || support === 'unsupported') {
    return 'unsupported';
  }
  if (support === 'required') {
    return 'required';
  }
  return 'optional';
}

interface DependencyLookupMaps {
  /** For each parentId, IDs of entries that list `parentId` in `requiredBy`. */
  reverseRequiredBy: Record<EnvironmentId, Map<string, string[]>>;
  /** For each depId, IDs of entries that list `depId` in `dependencies`. */
  reverseDependencies: Record<EnvironmentId, Map<string, string[]>>;
  /** For each depId, references to entries that list `depId` as an optional dependency. */
  reverseOptionalBy: Record<EnvironmentId, Map<string, LinkedProjectRef[]>>;
}

function buildDependencyLookupMaps(instance: Instance): DependencyLookupMaps {
  const reverseRequiredBy: Record<EnvironmentId, Map<string, string[]>> = {
    client: new Map<string, string[]>(),
    server: new Map<string, string[]>(),
  };
  const reverseDependencies: Record<EnvironmentId, Map<string, string[]>> = {
    client: new Map<string, string[]>(),
    server: new Map<string, string[]>(),
  };
  const reverseOptionalBy: Record<EnvironmentId, Map<string, LinkedProjectRef[]>> = {
    client: new Map<string, LinkedProjectRef[]>(),
    server: new Map<string, LinkedProjectRef[]>(),
  };

  for (const env of ENVIRONMENTS) {
    const reqByMap = reverseRequiredBy[env];
    const depMap = reverseDependencies[env];
    const optByMap = reverseOptionalBy[env];
    const seenOptionalPair = new Set<string>();

    for (const entry of instance.entries) {
      const pid = entry.project.id;
      const envState = entry.environments[env];

      for (const parentId of envState.requiredBy) {
        if (parentId === pid) {
          continue;
        }
        let list = reqByMap.get(parentId);
        if (!list) {
          list = [];
          reqByMap.set(parentId, list);
        }
        list.push(pid);
      }

      for (const depId of envState.dependencies) {
        if (depId === pid) {
          continue;
        }
        let list = depMap.get(depId);
        if (!list) {
          list = [];
          depMap.set(depId, list);
        }
        list.push(pid);
      }

      for (const optId of extractOptionalDependencyIds(envState.version)) {
        if (optId === pid) {
          continue;
        }
        const pairKey = `${optId}:${pid}`;
        if (seenOptionalPair.has(pairKey)) {
          continue;
        }
        seenOptionalPair.add(pairKey);
        let list = optByMap.get(optId);
        if (!list) {
          list = [];
          optByMap.set(optId, list);
        }
        list.push({
          id: pid,
          title: entry.project.title,
        });
      }
    }
  }

  return {
    reverseRequiredBy,
    reverseDependencies,
    reverseOptionalBy,
  };
}

/**
 * Computes the set of dependency project IDs that should be visible in the review tables:
 * "a dependency entry is always listed if any collection entry requires it in any environment
 * (regardless of selection)."
 */
function computeVisibleDependencyIds(
  instance: Instance,
  entryById: Map<string, Entry>,
  lookupMaps: DependencyLookupMaps,
): Set<string> {
  const visible = new Set<string>();

  for (const env of ENVIRONMENTS) {
    const visited = new Set<string>();
    const queue: string[] = [];
    const reqByMap = lookupMaps.reverseRequiredBy[env];

    for (const entry of instance.entries) {
      if (entry.origin === 'collection') {
        visited.add(entry.project.id);
        queue.push(entry.project.id);
      } else if (entry.environments[env].selection.on) {
        visible.add(entry.project.id);
        visited.add(entry.project.id);
        queue.push(entry.project.id);
      }
    }

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const currentEntry = entryById.get(currentId);
      if (!currentEntry) {
        continue;
      }

      const envState = currentEntry.environments[env];
      const nextIds = new Set<string>(envState.dependencies);

      for (const depId of extractRequiredDependencyIds(envState.version)) {
        nextIds.add(depId);
      }

      const revReqBy = reqByMap.get(currentId);
      if (revReqBy) {
        for (const depId of revReqBy) {
          nextIds.add(depId);
        }
      }

      for (const depId of nextIds) {
        const depEntry = entryById.get(depId);
        if (depEntry?.origin === 'dependency') {
          visible.add(depId);
        }
        if (!visited.has(depId)) {
          visited.add(depId);
          queue.push(depId);
        }
      }
    }
  }

  // Also include any dependency entry whose requiredBy references an external ID (e.g. minimal unit test fixtures).
  for (const entry of instance.entries) {
    if (entry.origin !== 'dependency') {
      continue;
    }
    for (const env of ENVIRONMENTS) {
      for (const reqId of entry.environments[env].requiredBy) {
        if (!entryById.has(reqId)) {
          visible.add(entry.project.id);
        }
      }
    }
  }

  return visible;
}

/**
 * Resolves the structured references (`{ id, title }`) of all entries requiring `entry` in each environment.
 */
function resolveRequiredByRefs(
  entry: Entry,
  entryById: Map<string, Entry>,
  lookupMaps: DependencyLookupMaps,
): Record<EnvironmentId, LinkedProjectRef[]> {
  const result: Record<EnvironmentId, LinkedProjectRef[]> = {
    client: [],
    server: [],
  };

  for (const env of ENVIRONMENTS) {
    const requiringIds: string[] = [...entry.environments[env].requiredBy];
    const revDeps = lookupMaps.reverseDependencies[env].get(entry.project.id);
    if (revDeps) {
      for (const otherId of revDeps) {
        if (!requiringIds.includes(otherId)) {
          requiringIds.push(otherId);
        }
      }
    }

    result[env] = requiringIds.map((reqId) => ({
      id: reqId,
      title: entryById.get(reqId)?.project.title ?? getKnownProjectTitle(reqId) ?? reqId,
    }));
  }

  return result;
}

/**
 * Resolves the structured references (`{ id, title }`) of all direct required dependencies of `entry` in each environment.
 */
function resolveRequiredDependencies(
  entry: Entry,
  entryById: Map<string, Entry>,
  lookupMaps: DependencyLookupMaps,
): Record<EnvironmentId, LinkedProjectRef[]> {
  const result: Record<EnvironmentId, LinkedProjectRef[]> = {
    client: [],
    server: [],
  };

  for (const env of ENVIRONMENTS) {
    const envState = entry.environments[env];
    const depIds = new Set<string>(envState.dependencies);

    for (const depId of extractRequiredDependencyIds(envState.version)) {
      depIds.add(depId);
    }

    const revReqBy = lookupMaps.reverseRequiredBy[env].get(entry.project.id);
    if (revReqBy) {
      for (const otherId of revReqBy) {
        depIds.add(otherId);
      }
    }

    result[env] = [...depIds].map((depId) => ({
      id: depId,
      title: entryById.get(depId)?.project.title ?? getKnownProjectTitle(depId) ?? depId,
    }));
  }

  return result;
}

/**
 * Resolves the structured references (`{ id, title }`) of all direct optional dependencies of `entry` in each environment.
 */
function resolveOptionalDependencies(
  entry: Entry,
  entryById: Map<string, Entry>,
): Record<EnvironmentId, LinkedProjectRef[]> {
  const result: Record<EnvironmentId, LinkedProjectRef[]> = {
    client: [],
    server: [],
  };

  for (const env of ENVIRONMENTS) {
    const envState = entry.environments[env];
    const optIds = extractOptionalDependencyIds(envState.version);

    result[env] = optIds.map((optId) => ({
      id: optId,
      title: entryById.get(optId)?.project.title ?? getKnownProjectTitle(optId) ?? optId,
    }));
  }

  return result;
}

/**
 * Resolves the structured references (`{ id, title }`) of all entries listing `entry` as an optional dependency in each environment.
 */
function resolveOptionalByRefs(
  entry: Entry,
  lookupMaps: DependencyLookupMaps,
): Record<EnvironmentId, LinkedProjectRef[]> {
  return {
    client: lookupMaps.reverseOptionalBy.client.get(entry.project.id) ?? [],
    server: lookupMaps.reverseOptionalBy.server.get(entry.project.id) ?? [],
  };
}

/**
 * Projects an `Instance` into per-project-type `TableModel`s for the review UI.
 * - Ordered by `PROJECT_TYPE_ORDER`: `mod`, `plugin`, `datapack`, `resourcepack`, `shader`.
 * - `rows` = collection entries (`origin === 'collection'`).
 * - `dependencies` = dependency entries (`origin === 'dependency'`) required by any collection entry
 *   in any environment (regardless of selection).
 * - Types with zero collection rows and zero visible dependency rows are omitted.
 */
export function toTables(instance: Instance): TableModel[] {
  const entryById = new Map<string, Entry>();
  for (const entry of instance.entries) {
    entryById.set(entry.project.id, entry);
  }
  registerKnownProjectTitles(instance.entries.map((e) => e.project));

  const lookupMaps = buildDependencyLookupMaps(instance);
  const visibleDepIds = computeVisibleDependencyIds(instance, entryById, lookupMaps);
  const tables: TableModel[] = [];

  for (const projectType of PROJECT_TYPE_ORDER) {
    const rows: TableRow[] = [];
    const dependencies: TableRow[] = [];

    for (const entry of instance.entries) {
      if (entry.project.type !== projectType) {
        continue;
      }

      if (entry.origin === 'dependency' && !visibleDepIds.has(entry.project.id)) {
        continue;
      }

      const requiredByRefs = resolveRequiredByRefs(entry, entryById, lookupMaps);
      const requiredDependencies = resolveRequiredDependencies(entry, entryById, lookupMaps);
      const optionalByRefs = resolveOptionalByRefs(entry, lookupMaps);
      const optionalDependencies = resolveOptionalDependencies(entry, entryById);

      const row: TableRow = {
        entry,
        project: entry.project,
        origin: entry.origin,
        platform: isPlatformAgnostic(entry.project.type) ? null : instance.meta.target.platform,
        environments: entry.environments,
        requiredByTitles: {
          client: requiredByRefs.client.map((ref) => ref.title),
          server: requiredByRefs.server.map((ref) => ref.title),
        },
        requiredByRefs,
        requiredDependencies,
        optionalByRefs,
        optionalDependencies,
      };

      if (entry.origin === 'collection') {
        rows.push(row);
      } else {
        dependencies.push(row);
      }
    }

    if (rows.length > 0 || dependencies.length > 0) {
      tables.push({
        type: projectType,
        rows,
        dependencies,
      });
    }
  }

  return tables;
}

/**
 * Returns any non-exportable entries (such as `modpack` projects or entries with `.mrpack` primary files)
 * present in `instance.entries` for display in the Skipped section.
 */
export function getSkippedEntries(instance: Instance): SkippedProject[] {
  const skipped: SkippedProject[] = [];

  for (const entry of instance.entries) {
    if (!isExportableProjectType(entry.project.type)) {
      skipped.push({
        id: entry.project.id,
        slug: entry.project.slug,
        title: entry.project.title,
        type: entry.project.type,
        modrinthUrl: entry.project.modrinthUrl,
        reason:
          entry.project.type === 'modpack'
            ? MODPACK_SKIPPED_REASON
            : `Unsupported project type: ${entry.project.type}`,
      });
      continue;
    }

    const hasMrpackFile = ENVIRONMENTS.some(
      (env) =>
        entry.environments[env].version?.file.filename.toLowerCase().endsWith('.mrpack') ?? false,
    );
    if (hasMrpackFile) {
      skipped.push({
        id: entry.project.id,
        slug: entry.project.slug,
        title: entry.project.title,
        type: entry.project.type,
        modrinthUrl: entry.project.modrinthUrl,
        reason: MODPACK_SKIPPED_REASON,
      });
    }
  }

  return skipped;
}

/**
 * Projects an `Instance` into deterministic `client` and `server` archive file trees.
 * Only exportable entries selected (`selection.on === true`) with a non-null `version` in that
 * environment are included. Collisions within the same folder append `-2`, `-3`, etc.
 */
export function toFileTree(instance: Instance): { client: FileTree; server: FileTree } {
  const buildForEnv = (environment: EnvironmentId): FileTree => {
    const usedByFolder = new Map<string, Set<string>>();
    const files: FileTreeEntry[] = [];

    for (const entry of instance.entries) {
      if (!isExportableProjectType(entry.project.type)) {
        continue;
      }

      const envState = entry.environments[environment];
      if (!envState.selection.on || envState.version === null) {
        continue;
      }

      // Refuse .mrpack primary files.
      if (envState.version.file.filename.toLowerCase().endsWith('.mrpack')) {
        continue;
      }

      const folder = TYPE_FOLDER_MAP[entry.project.type];
      let usedInFolder = usedByFolder.get(folder);
      if (!usedInFolder) {
        usedInFolder = new Set<string>();
        usedByFolder.set(folder, usedInFolder);
      }

      const baseFilename = formatEntryFilename(entry, envState.version, instance.meta.target);
      const filename = resolveUniqueFilename(baseFilename, usedInFolder);

      files.push({
        path: `${folder}/${filename}`,
        folder,
        filename,
        projectId: entry.project.id,
        versionId: envState.version.id,
        type: entry.project.type,
        file: envState.version.file,
      });
    }

    return {
      environment,
      files,
    };
  };

  return {
    client: buildForEnv('client'),
    server: buildForEnv('server'),
  };
}

/**
 * Returns warnings applicable when exporting `instance` to `.mrpack`.
 * Specifically warns when one or more selected `plugin` entries are excluded.
 */
export function getMrpackWarnings(instance: Instance): string[] {
  const excludedPlugins: string[] = [];

  for (const entry of instance.entries) {
    if (entry.project.type !== 'plugin') {
      continue;
    }
    const clientSelected =
      entry.environments.client.selection.on && entry.environments.client.version !== null;
    const serverSelected =
      entry.environments.server.selection.on && entry.environments.server.version !== null;

    if (clientSelected || serverSelected) {
      excludedPlugins.push(entry.project.title);
    }
  }

  if (excludedPlugins.length === 0) {
    return [];
  }

  const noun = excludedPlugins.length === 1 ? 'plugin was' : 'plugins were';
  return [
    `${excludedPlugins.length} ${noun} excluded from .mrpack export (${excludedPlugins.join(', ')}): the Modrinth .mrpack format does not support plugins.`,
  ];
}

/**
 * Projects an `Instance` into a Modrinth `modrinth.index.json` (`MrpackIndex`) structure.
 * - Excludes `plugin` and `modpack` project types.
 * - Maps selected environment support (`required` -> `required`, `optional`/`unknown` -> `optional`,
 *   unselected -> `unsupported`).
 * - Emits a single file entry when both environments share the same `version.id`, or two separate
 *   file entries when client and server selected different versions.
 * - Populates `dependencies.minecraft` and optionally the loader version key if `opts.platformVersion` is given.
 */
export function toMrpack(instance: Instance, opts?: MrpackOptions): MrpackIndex {
  const usedByFolder = new Map<string, Set<string>>();
  const files: MrpackFile[] = [];

  const createMrpackFile = (
    entry: Entry,
    projectType: ExportableProjectType,
    version: VersionRef,
    env: Record<EnvironmentId, MrpackEnvSupport>,
  ): MrpackFile => {
    const folder = TYPE_FOLDER_MAP[projectType];
    let usedInFolder = usedByFolder.get(folder);
    if (!usedInFolder) {
      usedInFolder = new Set<string>();
      usedByFolder.set(folder, usedInFolder);
    }

    const baseFilename = formatEntryFilename(entry, version, instance.meta.target);
    const filename = resolveUniqueFilename(baseFilename, usedInFolder);

    return {
      path: `${folder}/${filename}`,
      hashes: {
        sha1: version.file.sha1,
        sha512: version.file.sha512,
      },
      env,
      downloads: [version.file.url],
      fileSize: version.file.size,
    };
  };

  for (const entry of instance.entries) {
    // Exclude modpacks and plugins.
    if (!isExportableProjectType(entry.project.type) || entry.project.type === 'plugin') {
      continue;
    }

    const clientState = entry.environments.client;
    const serverState = entry.environments.server;

    const clientVersion =
      clientState.selection.on &&
      clientState.support !== 'unsupported' &&
      clientState.version !== null &&
      !clientState.version.file.filename.toLowerCase().endsWith('.mrpack')
        ? clientState.version
        : null;

    const serverVersion =
      serverState.selection.on &&
      serverState.support !== 'unsupported' &&
      serverState.version !== null &&
      !serverState.version.file.filename.toLowerCase().endsWith('.mrpack')
        ? serverState.version
        : null;

    if (!clientVersion && !serverVersion) {
      continue;
    }

    const clientEnvSupport = toMrpackEnvSupport(clientState.support, clientVersion !== null);
    const serverEnvSupport = toMrpackEnvSupport(serverState.support, serverVersion !== null);

    if (clientVersion && serverVersion) {
      if (clientVersion.id === serverVersion.id) {
        files.push(
          createMrpackFile(entry, entry.project.type, clientVersion, {
            client: clientEnvSupport,
            server: serverEnvSupport,
          }),
        );
      } else {
        files.push(
          createMrpackFile(entry, entry.project.type, clientVersion, {
            client: clientEnvSupport,
            server: 'unsupported',
          }),
        );
        files.push(
          createMrpackFile(entry, entry.project.type, serverVersion, {
            client: 'unsupported',
            server: serverEnvSupport,
          }),
        );
      }
    } else if (clientVersion) {
      files.push(
        createMrpackFile(entry, entry.project.type, clientVersion, {
          client: clientEnvSupport,
          server: 'unsupported',
        }),
      );
    } else if (serverVersion) {
      files.push(
        createMrpackFile(entry, entry.project.type, serverVersion, {
          client: 'unsupported',
          server: serverEnvSupport,
        }),
      );
    }
  }

  const dependencies: Record<string, string> = {
    minecraft: instance.meta.target.gameVersion,
  };

  const trimmedPlatformVersion = opts?.platformVersion?.trim();
  if (trimmedPlatformVersion && trimmedPlatformVersion.length > 0) {
    const depKey = mapPlatformToMrpackDependencyKey(instance.meta.target.platform);
    if (depKey) {
      dependencies[depKey] = trimmedPlatformVersion;
    }
  }

  const index: MrpackIndex = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: opts?.versionId ?? '1.0.0',
    name: opts?.name ?? instance.meta.name,
    files,
    dependencies,
  };

  if (opts?.summary !== undefined) {
    index.summary = opts.summary;
  }

  return index;
}
