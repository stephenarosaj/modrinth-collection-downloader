/**
 * Pure status computation and human-readable reason formatting.
 */

import {
  ENVIRONMENTS,
  REASONS,
  extractRequiredDependencyIds,
  isExportableProjectType,
  isSelectable,
  type Entry,
  type EntryStatus,
  type EnvironmentId,
  type Instance,
  type InstanceStatusMap,
  type Kind,
  type Reason,
  type Status,
} from './model';

const KIND_PRIORITY: Readonly<Record<Kind, number>> = {
  ok: 0,
  unknown: 1,
  warning: 2,
  error: 3,
} as const;

const REASON_KIND_MAP: Readonly<Record<Reason, Exclude<Kind, 'ok'>>> = {
  NO_COMPATIBLE_VERSION: 'error',
  DEPENDENCY_UNAVAILABLE: 'error',
  NEEDED_BUT_UNAVAILABLE: 'error',
  DEPENDENCY_NOT_SELECTED: 'warning',
  REQUIRED_NOT_SELECTED: 'warning',
  REQUIRED_DEPENDENCY_NOT_SELECTED: 'warning',
  PIN_CONFLICT: 'warning',
  PLATFORM_UNVERIFIED: 'warning',
  SUPPORT_UNKNOWN: 'unknown',
} as const;

export const REASON_MESSAGES: Readonly<Record<Reason, string>> = {
  NO_COMPATIBLE_VERSION: 'No compatible version is available for this environment.',
  DEPENDENCY_UNAVAILABLE: 'A required dependency is unavailable in this environment.',
  NEEDED_BUT_UNAVAILABLE: 'Required by a selected entry in this environment, but unavailable here.',
  DEPENDENCY_NOT_SELECTED: 'A required dependency is not selected in this environment.',
  REQUIRED_NOT_SELECTED: 'Marked as required for this environment, but explicitly deselected.',
  REQUIRED_DEPENDENCY_NOT_SELECTED:
    'Required by a selected entry in this environment, but not selected.',
  PIN_CONFLICT:
    'Multiple entries pin different versions of this dependency; resolved to the newest compatible pin.',
  PLATFORM_UNVERIFIED:
    'Resolved via game-version fallback (version does not explicitly list a platform).',
  SUPPORT_UNKNOWN: 'Environment support is unknown on Modrinth.',
} as const;

export const REASON_SHORT_TITLES: Readonly<Record<Reason, string>> = {
  NO_COMPATIBLE_VERSION: 'No Compatible Version',
  DEPENDENCY_UNAVAILABLE: 'Missing Dependency',
  NEEDED_BUT_UNAVAILABLE: 'Required Dependency Unavailable',
  DEPENDENCY_NOT_SELECTED: 'Unselected Dependency',
  REQUIRED_NOT_SELECTED: 'Explicitly Deselected',
  REQUIRED_DEPENDENCY_NOT_SELECTED: 'Required Dependency Unchecked',
  PIN_CONFLICT: 'Version Pin Conflict',
  PLATFORM_UNVERIFIED: 'Unverified Platform',
  SUPPORT_UNKNOWN: 'Unknown Support',
} as const;

export interface BadgeTooltipMeta {
  title: string;
  description: string;
  tone: 'ok' | 'warning' | 'unknown';
}

export const ENV_BADGE_TOOLTIP_META = {
  support: {
    required: (envLabel: string): BadgeTooltipMeta => ({
      title: `Required on ${envLabel}`,
      description: `Modrinth metadata marks this project as required for the ${envLabel.toLowerCase()} environment.`,
      tone: 'ok',
    }),
    optional: (envLabel: string): BadgeTooltipMeta => ({
      title: `Optional on ${envLabel}`,
      description: `Modrinth metadata marks this project as optional for the ${envLabel.toLowerCase()} environment.`,
      tone: 'ok',
    }),
    unknown: (): BadgeTooltipMeta => ({
      title: REASON_SHORT_TITLES.SUPPORT_UNKNOWN,
      description: REASON_MESSAGES.SUPPORT_UNKNOWN,
      tone: 'unknown',
    }),
  },
  selectionAuto: (envLabel: string): BadgeTooltipMeta => ({
    title: 'Auto-Selected Dependency',
    description: `Automatically enabled because a selected project in the ${envLabel.toLowerCase()} environment requires it.`,
    tone: 'ok',
  }),
  versionType: {
    beta: {
      title: 'Beta Pre-Release',
      description:
        'Published on the beta channel; may include minor bugs or pre-release changes.',
      tone: 'warning',
    } satisfies BadgeTooltipMeta,
    alpha: {
      title: 'Alpha Pre-Release',
      description:
        'Published on the alpha channel; early build that may be unstable or experimental.',
      tone: 'warning',
    } satisfies BadgeTooltipMeta,
  },
  platformUnverified: {
    title: REASON_SHORT_TITLES.PLATFORM_UNVERIFIED,
    description: REASON_MESSAGES.PLATFORM_UNVERIFIED,
    tone: 'warning',
  } satisfies BadgeTooltipMeta,
} as const;

/**
 * Returns the severity `Kind` associated with a specific status `Reason`.
 */
export function getReasonKind(reason: Reason): Exclude<Kind, 'ok'> {
  return REASON_KIND_MAP[reason];
}

/**
 * Compares two `Kind` values by priority (`error > warning > unknown > ok`).
 * Returns a positive number if `a` is higher priority than `b`, negative if lower, or `0` if equal.
 */
export function compareKindPriority(a: Kind, b: Kind): number {
  return KIND_PRIORITY[a] - KIND_PRIORITY[b];
}

/**
 * Returns the worst `Kind` across a collection of kinds (`error > warning > unknown > ok`).
 * Defaults to `'ok'` if empty.
 */
export function getWorstKind(kinds: Iterable<Kind>): Kind {
  let worst: Kind = 'ok';
  for (const kind of kinds) {
    if (KIND_PRIORITY[kind] > KIND_PRIORITY[worst]) {
      worst = kind;
    }
  }
  return worst;
}

/**
 * Formats a `Reason` into a human-readable tooltip explanation, optionally prefixed with the environment label.
 */
export function formatReason(reason: Reason, env?: EnvironmentId): string {
  const baseMessage = REASON_MESSAGES[reason];
  if (!env) {
    return baseMessage;
  }
  const label = env === 'client' ? 'Client' : 'Server';
  return `${label}: ${baseMessage}`;
}

/**
 * Formats all reasons of a single cell's `Status` into a multi-line or single-line tooltip string.
 */
export function formatCellStatusTooltip(status: Status | null, env?: EnvironmentId): string {
  if (!status || status.reasons.length === 0) {
    if (!status) {
      return '';
    }
    return env ? `${env === 'client' ? 'Client' : 'Server'}: OK` : 'OK';
  }
  return status.reasons.map((r) => formatReason(r, env)).join('\n');
}

/**
 * Formats all active environment reasons of an `EntryStatus` into a tooltip string.
 */
export function formatRowStatusTooltip(entryStatus: EntryStatus): string {
  if (!entryStatus.row) {
    return '';
  }
  const lines: string[] = [];
  for (const env of ENVIRONMENTS) {
    const cellStatus = entryStatus[env];
    if (cellStatus && cellStatus.reasons.length > 0) {
      for (const reason of cellStatus.reasons) {
        lines.push(formatReason(reason, env));
      }
    }
  }
  if (lines.length === 0) {
    return 'OK';
  }
  return lines.join('\n');
}

function normalizeActiveEnvironments(
  activeEnvironments?: ReadonlySet<EnvironmentId> | readonly EnvironmentId[],
): ReadonlySet<EnvironmentId> {
  if (activeEnvironments === undefined) {
    return new Set<EnvironmentId>(ENVIRONMENTS);
  }
  if (activeEnvironments instanceof Set) {
    return activeEnvironments;
  }
  return new Set<EnvironmentId>(activeEnvironments);
}

/**
 * Collects unique direct required dependency project IDs for `entry` in `env`.
 * Uses `state.dependencies` if populated, or falls back to `state.version.dependencies` (`type === 'required'`).
 */
function getRequiredDependencyIds(entry: Entry, env: EnvironmentId): string[] {
  const state = entry.environments[env];
  return state.dependencies.length > 0
    ? state.dependencies
    : extractRequiredDependencyIds(state.version);
}

/**
 * Collects unique transitive required dependency project IDs for `entry` in `env`,
 * traversing both forward `dependencies` edges and reverse `requiredBy` edges.
 */
function getTransitiveRequiredDependencyIds(
  entry: Entry,
  env: EnvironmentId,
  entryById: ReadonlyMap<string, Entry>,
  allEntries: readonly Entry[],
): string[] {
  const visited = new Set<string>([entry.project.id]);
  const queue: string[] = [...getRequiredDependencyIds(entry, env)];

  for (const other of allEntries) {
    if (
      other.project.id !== entry.project.id &&
      other.environments[env].requiredBy.includes(entry.project.id) &&
      !queue.includes(other.project.id)
    ) {
      queue.push(other.project.id);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const depId = queue.shift()!;
    if (visited.has(depId)) {
      continue;
    }
    visited.add(depId);
    result.push(depId);

    const depEntry = entryById.get(depId);
    if (depEntry) {
      for (const nextDepId of getRequiredDependencyIds(depEntry, env)) {
        if (!visited.has(nextDepId)) {
          queue.push(nextDepId);
        }
      }
    }
  }

  return result;
}

/**
 * Checks whether `entry` is required (directly or transitively) in `env` by at least one currently selected entry.
 */
function isNeededBySelectedEntry(
  entry: Entry,
  env: EnvironmentId,
  entryById: ReadonlyMap<string, Entry>,
  allEntries: readonly Entry[],
): boolean {
  const state = entry.environments[env];

  for (const parentId of state.requiredBy) {
    const parent = entryById.get(parentId);
    if (parent && parent.environments[env].selection.on) {
      return true;
    }
  }

  for (const candidateParent of allEntries) {
    if (!candidateParent.environments[env].selection.on) {
      continue;
    }
    const deps = getTransitiveRequiredDependencyIds(
      candidateParent,
      env,
      entryById,
      allEntries,
    );
    if (deps.includes(entry.project.id)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether multiple requiring entries in `env` pin different compatible versions of `entry`.
 */
function hasPinConflictInEnvironment(
  entry: Entry,
  env: EnvironmentId,
  entryById: ReadonlyMap<string, Entry>,
  allEntries: readonly Entry[],
): boolean {
  const state = entry.environments[env];
  if (entry.origin !== 'dependency' || state.resolution !== 'pinned') {
    return false;
  }

  const requiringEntries: Entry[] =
    state.requiredBy.length > 0
      ? state.requiredBy
          .map((parentId) => entryById.get(parentId))
          .filter((parent): parent is Entry => parent !== undefined)
      : allEntries.filter(
          (other) =>
            other.project.id !== entry.project.id &&
            (other.origin === 'collection' ||
              other.environments[env].requiredBy.length > 0 ||
              other.environments[env].selection.on),
        );

  const pinnedVersionIds = new Set<string>();
  for (const other of requiringEntries) {
    const otherVersion = other.environments[env].version;
    if (!otherVersion) {
      continue;
    }
    for (const dep of otherVersion.dependencies) {
      if (
        dep.type === 'required' &&
        dep.projectId === entry.project.id &&
        typeof dep.versionId === 'string' &&
        dep.versionId.length > 0
      ) {
        pinnedVersionIds.add(dep.versionId);
      }
    }
  }

  if (pinnedVersionIds.size <= 1) {
    return false;
  }

  const candidateIds = new Set(state.candidates.map((c) => c.id));
  if (state.version !== null) {
    candidateIds.add(state.version.id);
  }

  let compatiblePinCount = 0;
  for (const pinId of pinnedVersionIds) {
    if (candidateIds.has(pinId)) {
      compatiblePinCount += 1;
    }
  }
  return compatiblePinCount > 1;
}

/**
 * Evaluates a single entry's cell status in `env`.
 * Returns `null` when the environment is inactive, when the project type is non-exportable (`modpack`),
 * or when `support === 'unsupported'` and `NEEDED_BUT_UNAVAILABLE` does not apply.
 */
function evaluateCellStatus(
  entry: Entry,
  env: EnvironmentId,
  entryById: ReadonlyMap<string, Entry>,
  allEntries: readonly Entry[],
  isActiveEnv: boolean,
): Status | null {
  if (!isActiveEnv || !isExportableProjectType(entry.project.type)) {
    return null;
  }

  const state = entry.environments[env];
  const neededBySelected = isNeededBySelectedEntry(entry, env, entryById, allEntries);

  // An unsupported cell has no status unless it is needed by a selected entry in this environment.
  if (state.support === 'unsupported') {
    if (neededBySelected) {
      return {
        kind: 'error',
        reasons: ['NEEDED_BUT_UNAVAILABLE'],
      };
    }
    return null;
  }

  const reasons: Reason[] = [];

  // 1. NO_COMPATIBLE_VERSION (error): version === null
  if (state.version === null) {
    reasons.push('NO_COMPATIBLE_VERSION');
  }

  // 2. DEPENDENCY_UNAVAILABLE (error): entry is selected and a required dependency has version === null or support === 'unsupported'
  if (state.selection.on) {
    const depIds = getTransitiveRequiredDependencyIds(entry, env, entryById, allEntries);
    const hasUnavailableDep = depIds.some((depId) => {
      const depEntry = entryById.get(depId);
      if (!depEntry) {
        return true;
      }
      const depState = depEntry.environments[env];
      return depState.support === 'unsupported' || depState.version === null;
    });
    if (hasUnavailableDep) {
      reasons.push('DEPENDENCY_UNAVAILABLE');
    }

    const hasUnselectedDep = depIds.some((depId) => {
      const depEntry = entryById.get(depId);
      if (!depEntry) {
        return false;
      }
      const depState = depEntry.environments[env];
      return isSelectable(depState) && !depState.selection.on;
    });
    if (hasUnselectedDep) {
      reasons.push('DEPENDENCY_NOT_SELECTED');
    }
  }

  // 3. NEEDED_BUT_UNAVAILABLE (error): needed by a selected entry in this environment, but has version === null (or unsupported, handled above)
  if (neededBySelected && state.version === null) {
    reasons.push('NEEDED_BUT_UNAVAILABLE');
  }

  // 4. REQUIRED_NOT_SELECTED (warning): support === 'required' and selection is off/user
  if (state.support === 'required' && !state.selection.on && state.selection.source === 'user') {
    reasons.push('REQUIRED_NOT_SELECTED');
  }

  // 5. REQUIRED_DEPENDENCY_NOT_SELECTED (warning): needed by >= 1 selected entry in this environment, cell is selectable, and selection is off
  if (neededBySelected && isSelectable(state) && !state.selection.on) {
    reasons.push('REQUIRED_DEPENDENCY_NOT_SELECTED');
  }

  // 6. PIN_CONFLICT (warning): multiple requiring versions in this environment pin different compatible versions
  if (hasPinConflictInEnvironment(entry, env, entryById, allEntries)) {
    reasons.push('PIN_CONFLICT');
  }

  // 7. PLATFORM_UNVERIFIED (warning): resolution === 'game-version-fallback'
  if (state.resolution === 'game-version-fallback') {
    reasons.push('PLATFORM_UNVERIFIED');
  }

  // 8. SUPPORT_UNKNOWN (unknown): support === 'unknown'
  if (state.support === 'unknown') {
    reasons.push('SUPPORT_UNKNOWN');
  }

  const kind = getWorstKind(
    reasons.map((r) =>
      r === 'NO_COMPATIBLE_VERSION' && state.support === 'optional'
        ? 'warning'
        : REASON_KIND_MAP[r],
    ),
  );
  return { kind, reasons };
}

/**
 * Computes per-entry cell and row status (`EntryStatus`), respecting active environment toggles.
 * - Inactive environments yield `null` cell status and do not contribute to `row` status.
 * - Unsupported cells yield `null` cell status unless flagged with `NEEDED_BUT_UNAVAILABLE`.
 * - If no environments are active (or all active cells on the row are `null`), `row` is `null`.
 */
export function computeEntryStatus(
  instance: Instance,
  activeEnvironments?: ReadonlySet<EnvironmentId> | readonly EnvironmentId[],
): Map<string, EntryStatus> {
  const activeSet = normalizeActiveEnvironments(activeEnvironments);
  const entryById = new Map<string, Entry>();
  for (const entry of instance.entries) {
    entryById.set(entry.project.id, entry);
  }

  const result = new Map<string, EntryStatus>();

  for (const entry of instance.entries) {
    const clientStatus = evaluateCellStatus(
      entry,
      'client',
      entryById,
      instance.entries,
      activeSet.has('client'),
    );
    const serverStatus = evaluateCellStatus(
      entry,
      'server',
      entryById,
      instance.entries,
      activeSet.has('server'),
    );

    const activeCellStatuses: Status[] = [];
    if (clientStatus !== null) {
      activeCellStatuses.push(clientStatus);
    }
    if (serverStatus !== null) {
      activeCellStatuses.push(serverStatus);
    }

    let rowStatus: Status | null = null;
    if (activeCellStatuses.length > 0) {
      const worstKind = getWorstKind(activeCellStatuses.map((s) => s.kind));
      const presentReasons = new Set<Reason>();
      for (const cellStatus of activeCellStatuses) {
        for (const reason of cellStatus.reasons) {
          presentReasons.add(reason);
        }
      }
      const orderedReasons = REASONS.filter((r) => presentReasons.has(r));
      rowStatus = {
        kind: worstKind,
        reasons: orderedReasons,
      };
    }

    result.set(entry.project.id, {
      client: clientStatus,
      server: serverStatus,
      row: rowStatus,
    });
  }

  return result;
}

/**
 * Pure status computation returning `Map<entryId, Record<EnvironmentId, Status>>`.
 * Unsupported cells (when not `NEEDED_BUT_UNAVAILABLE`) and inactive environments return `{ kind: 'ok', reasons: [] }`.
 */
export function computeStatus(
  instance: Instance,
  activeEnvironments?: ReadonlySet<EnvironmentId> | readonly EnvironmentId[],
): InstanceStatusMap {
  const entryStatuses = computeEntryStatus(instance, activeEnvironments);
  const statusMap: InstanceStatusMap = new Map();

  for (const entry of instance.entries) {
    const entryStatus = entryStatuses.get(entry.project.id);
    statusMap.set(entry.project.id, {
      client: entryStatus?.client ?? { kind: 'ok', reasons: [] },
      server: entryStatus?.server ?? { kind: 'ok', reasons: [] },
    });
  }

  return statusMap;
}
