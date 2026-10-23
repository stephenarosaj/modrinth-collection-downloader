import { describe, expect, it } from 'vitest';
import {
  CORE_SCHEMA_VERSION,
  type Entry,
  type EntryOrigin,
  type EnvironmentId,
  type EnvironmentState,
  type Instance,
  type Kind,
  type ProjectType,
  type Reason,
  type Resolution,
  type Selection,
  type Support,
  type VersionDependency,
  type VersionRef,
} from '../../src/core/model';
import {
  compareKindPriority,
  computeEntryStatus,
  computeStatus,
  formatCellStatusTooltip,
  formatReason,
  formatRowStatusTooltip,
  getReasonKind,
  getWorstKind,
} from '../../src/core/status';

function makeVersion(
  id: string,
  dependencies: VersionDependency[] = [],
  publishedAt = '2025-01-01T00:00:00Z',
): VersionRef {
  return {
    id,
    versionNumber: `1.0.0-${id}`,
    versionType: 'release',
    publishedAt,
    gameVersions: ['1.20.1'],
    platforms: ['fabric'],
    file: {
      filename: `${id}.jar`,
      url: `https://cdn.modrinth.com/${id}.jar`,
      size: 1024,
      sha1: `sha1-${id}`,
      sha512: `sha512-${id}`,
    },
    dependencies,
  };
}

interface EnvConfig {
  support?: Support;
  version?: VersionRef | null;
  candidates?: VersionRef[];
  resolution?: Resolution;
  dependencies?: string[];
  requiredBy?: string[];
  selection?: Selection;
}

function makeEnvState(config: EnvConfig = {}): EnvironmentState {
  const support = config.support ?? 'required';
  const version =
    config.version === undefined
      ? support === 'unsupported'
        ? null
        : makeVersion('v-default')
      : config.version;
  const candidates = config.candidates ?? (version ? [version] : []);
  const resolution: Resolution = config.resolution ?? (version ? 'latest-compatible' : 'none');
  const dependencies =
    config.dependencies ??
    (version
      ? version.dependencies.filter((d) => d.type === 'required').map((d) => d.projectId)
      : []);
  const requiredBy = config.requiredBy ?? [];
  const selection =
    config.selection ??
    (support !== 'unsupported' && version !== null
      ? { on: true, source: 'user' }
      : { on: false, source: 'none' });

  return {
    support,
    candidates,
    version,
    resolution,
    dependencies,
    requiredBy,
    selection,
  };
}

function makeEntry(
  id: string,
  opts: {
    origin?: EntryOrigin;
    type?: ProjectType;
    client?: EnvConfig;
    server?: EnvConfig;
  } = {},
): Entry {
  return {
    project: {
      id,
      slug: id,
      title: `Project ${id}`,
      type: opts.type ?? 'mod',
      modrinthUrl: `https://modrinth.com/mod/${id}`,
    },
    origin: opts.origin ?? 'collection',
    environments: {
      client: makeEnvState(opts.client),
      server: makeEnvState(opts.server),
    },
  };
}

function makeInstance(entries: Entry[]): Instance {
  return {
    schemaVersion: CORE_SCHEMA_VERSION,
    meta: {
      name: 'Status Test Instance',
      source: {
        collectionId: 'col-status',
        url: 'https://modrinth.com/collection/col-status',
      },
      target: {
        gameVersion: '1.20.1',
        platform: 'fabric',
        releasePreference: 'stable',
      },
      createdAt: '2025-01-01T00:00:00Z',
    },
    entries,
  };
}

describe('Status table rules (§7.4) — table-driven single-reason & priority tests', () => {
  const statusCases: {
    name: string;
    entries: Entry[];
    targetId: string;
    env: EnvironmentId;
    expectedKind: Kind;
    expectedReasons: Reason[];
  }[] = [
    {
      name: 'ok when required, version resolved, and selected',
      entries: [makeEntry('mod-ok')],
      targetId: 'mod-ok',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'NO_COMPATIBLE_VERSION (error) when support !== unsupported and version === null',
      entries: [
        makeEntry('mod-no-ver', {
          client: { support: 'required', version: null, selection: { on: false, source: 'none' } },
        }),
      ],
      targetId: 'mod-no-ver',
      env: 'client',
      expectedKind: 'error',
      expectedReasons: ['NO_COMPATIBLE_VERSION'],
    },
    {
      name: 'DEPENDENCY_UNAVAILABLE (error) on selected parent when required dependency has version === null',
      entries: [
        makeEntry('parent', {
          client: {
            support: 'required',
            dependencies: ['dep-missing'],
            selection: { on: true, source: 'user' },
          },
        }),
        makeEntry('dep-missing', {
          origin: 'dependency',
          client: {
            support: 'required',
            version: null,
            requiredBy: ['parent'],
            selection: { on: false, source: 'none' },
          },
        }),
      ],
      targetId: 'parent',
      env: 'client',
      expectedKind: 'error',
      expectedReasons: ['DEPENDENCY_UNAVAILABLE'],
    },
    {
      name: 'NEEDED_BUT_UNAVAILABLE (error) + NO_COMPATIBLE_VERSION on dependency with version === null when needed by selected parent',
      entries: [
        makeEntry('parent', {
          client: {
            support: 'required',
            dependencies: ['dep-missing'],
            selection: { on: true, source: 'user' },
          },
        }),
        makeEntry('dep-missing', {
          origin: 'dependency',
          client: {
            support: 'required',
            version: null,
            requiredBy: ['parent'],
            selection: { on: false, source: 'none' },
          },
        }),
      ],
      targetId: 'dep-missing',
      env: 'client',
      expectedKind: 'error',
      expectedReasons: ['NO_COMPATIBLE_VERSION', 'NEEDED_BUT_UNAVAILABLE'],
    },
    {
      name: 'NEEDED_BUT_UNAVAILABLE (error) on dependency with support === unsupported when needed by selected parent',
      entries: [
        makeEntry('parent', {
          server: {
            support: 'required',
            dependencies: ['dep-client-only'],
            selection: { on: true, source: 'user' },
          },
        }),
        makeEntry('dep-client-only', {
          origin: 'dependency',
          server: {
            support: 'unsupported',
            version: null,
            requiredBy: ['parent'],
            selection: { on: false, source: 'none' },
          },
        }),
      ],
      targetId: 'dep-client-only',
      env: 'server',
      expectedKind: 'error',
      expectedReasons: ['NEEDED_BUT_UNAVAILABLE'],
    },
    {
      name: 'REQUIRED_NOT_SELECTED (warning) when support === required and selection is off/user',
      entries: [
        makeEntry('mod-req-off', {
          client: {
            support: 'required',
            selection: { on: false, source: 'user' },
          },
        }),
      ],
      targetId: 'mod-req-off',
      env: 'client',
      expectedKind: 'warning',
      expectedReasons: ['REQUIRED_NOT_SELECTED'],
    },
    {
      name: 'optional entry explicitly deselected by user is ok (not REQUIRED_NOT_SELECTED)',
      entries: [
        makeEntry('mod-opt-off', {
          client: {
            support: 'optional',
            selection: { on: false, source: 'user' },
          },
        }),
      ],
      targetId: 'mod-opt-off',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'REQUIRED_DEPENDENCY_NOT_SELECTED (warning) when selectable dependency is needed by selected parent and is off',
      entries: [
        makeEntry('parent', {
          client: {
            dependencies: ['dep-off'],
            selection: { on: true, source: 'user' },
          },
        }),
        makeEntry('dep-off', {
          origin: 'dependency',
          client: {
            support: 'optional',
            requiredBy: ['parent'],
            selection: { on: false, source: 'user' },
          },
        }),
      ],
      targetId: 'dep-off',
      env: 'client',
      expectedKind: 'warning',
      expectedReasons: ['REQUIRED_DEPENDENCY_NOT_SELECTED'],
    },
    {
      name: 'PIN_CONFLICT (warning) when two requiring entries in same environment pin different compatible versions',
      entries: [
        makeEntry('parent-1', {
          client: {
            version: makeVersion('p1-v1', [
              { projectId: 'dep-pinned', versionId: 'pin-v1', type: 'required' },
            ]),
            dependencies: ['dep-pinned'],
          },
        }),
        makeEntry('parent-2', {
          client: {
            version: makeVersion('p2-v1', [
              { projectId: 'dep-pinned', versionId: 'pin-v2', type: 'required' },
            ]),
            dependencies: ['dep-pinned'],
          },
        }),
        makeEntry('dep-pinned', {
          origin: 'dependency',
          client: {
            version: makeVersion('pin-v2', [], '2025-02-01T00:00:00Z'),
            candidates: [
              makeVersion('pin-v2', [], '2025-02-01T00:00:00Z'),
              makeVersion('pin-v1', [], '2025-01-01T00:00:00Z'),
            ],
            resolution: 'pinned',
            requiredBy: ['parent-1', 'parent-2'],
            selection: { on: true, source: 'auto' },
          },
        }),
      ],
      targetId: 'dep-pinned',
      env: 'client',
      expectedKind: 'warning',
      expectedReasons: ['PIN_CONFLICT'],
    },
    {
      name: 'PIN_CONFLICT is NOT emitted when candidates has only 1 compatible version [pin-v1] and second parent pins incompatible pin-v2-incompatible',
      entries: [
        makeEntry('parent-1', {
          client: {
            version: makeVersion('p1-v1', [
              { projectId: 'dep-pinned', versionId: 'pin-v1', type: 'required' },
            ]),
            dependencies: ['dep-pinned'],
          },
        }),
        makeEntry('parent-2', {
          client: {
            version: makeVersion('p2-v1', [
              { projectId: 'dep-pinned', versionId: 'pin-v2-incompatible', type: 'required' },
            ]),
            dependencies: ['dep-pinned'],
          },
        }),
        makeEntry('dep-pinned', {
          origin: 'dependency',
          client: {
            version: makeVersion('pin-v1', [], '2025-01-01T00:00:00Z'),
            candidates: [makeVersion('pin-v1', [], '2025-01-01T00:00:00Z')],
            resolution: 'pinned',
            requiredBy: ['parent-1', 'parent-2'],
            selection: { on: true, source: 'auto' },
          },
        }),
      ],
      targetId: 'dep-pinned',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'PIN_CONFLICT is NOT emitted when a dependency with conflicting pins is manually overridden (resolution: user)',
      entries: [
        makeEntry('parent-1', {
          client: {
            version: makeVersion('p1-v1', [
              { projectId: 'dep-pinned', versionId: 'pin-v1', type: 'required' },
            ]),
            dependencies: ['dep-pinned'],
          },
        }),
        makeEntry('parent-2', {
          client: {
            version: makeVersion('p2-v1', [
              { projectId: 'dep-pinned', versionId: 'pin-v2', type: 'required' },
            ]),
            dependencies: ['dep-pinned'],
          },
        }),
        makeEntry('dep-pinned', {
          origin: 'dependency',
          client: {
            version: makeVersion('pin-v1', [], '2025-01-01T00:00:00Z'),
            candidates: [
              makeVersion('pin-v2', [], '2025-02-01T00:00:00Z'),
              makeVersion('pin-v1', [], '2025-01-01T00:00:00Z'),
            ],
            resolution: 'user',
            requiredBy: ['parent-1', 'parent-2'],
            selection: { on: true, source: 'auto' },
          },
        }),
      ],
      targetId: 'dep-pinned',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'PIN_CONFLICT is NOT emitted when a conflicting pin comes from an entry not in state.requiredBy (outside environment closure)',
      entries: [
        makeEntry('parent-in-closure', {
          client: {
            version: makeVersion('p1-v1', [
              { projectId: 'dep-pinned', versionId: 'pin-v1', type: 'required' },
            ]),
            dependencies: ['dep-pinned'],
          },
        }),
        makeEntry('outsider-dep', {
          origin: 'dependency',
          client: {
            version: makeVersion('out-v1', [
              { projectId: 'dep-pinned', versionId: 'pin-v2', type: 'required' },
            ]),
            dependencies: ['dep-pinned'],
            requiredBy: [],
            selection: { on: false, source: 'none' },
          },
        }),
        makeEntry('dep-pinned', {
          origin: 'dependency',
          client: {
            version: makeVersion('pin-v1', [], '2025-01-01T00:00:00Z'),
            candidates: [
              makeVersion('pin-v2', [], '2025-02-01T00:00:00Z'),
              makeVersion('pin-v1', [], '2025-01-01T00:00:00Z'),
            ],
            resolution: 'pinned',
            requiredBy: ['parent-in-closure'],
            selection: { on: true, source: 'auto' },
          },
        }),
      ],
      targetId: 'dep-pinned',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'REQUIRED_NOT_SELECTED is NOT emitted when support === required and selection is off/none or off/auto',
      entries: [
        makeEntry('mod-req-auto-off', {
          origin: 'dependency',
          client: {
            support: 'required',
            selection: { on: false, source: 'auto' },
          },
        }),
        makeEntry('mod-req-none-off', {
          origin: 'dependency',
          server: {
            support: 'required',
            selection: { on: false, source: 'none' },
          },
        }),
      ],
      targetId: 'mod-req-auto-off',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'REQUIRED_NOT_SELECTED is NOT emitted when support === required and selection is off/none',
      entries: [
        makeEntry('mod-req-none-off', {
          origin: 'dependency',
          client: {
            support: 'required',
            selection: { on: false, source: 'none' },
          },
        }),
      ],
      targetId: 'mod-req-none-off',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'DEPENDENCY_UNAVAILABLE is NOT emitted on a deselected parent when its required dependency is unavailable',
      entries: [
        makeEntry('parent-deselected', {
          client: {
            support: 'optional',
            dependencies: ['dep-missing'],
            selection: { on: false, source: 'user' },
          },
        }),
        makeEntry('dep-missing', {
          origin: 'dependency',
          client: {
            support: 'required',
            version: null,
            requiredBy: ['parent-deselected'],
            selection: { on: false, source: 'none' },
          },
        }),
      ],
      targetId: 'parent-deselected',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'NEEDED_BUT_UNAVAILABLE is NOT emitted on an unsupported dependency when requiring parent is deselected',
      entries: [
        makeEntry('parent-deselected', {
          server: {
            support: 'optional',
            dependencies: ['dep-client-only'],
            selection: { on: false, source: 'user' },
          },
        }),
        makeEntry('dep-client-only', {
          origin: 'dependency',
          server: {
            support: 'unsupported',
            version: null,
            requiredBy: ['parent-deselected'],
            selection: { on: false, source: 'none' },
          },
        }),
      ],
      targetId: 'dep-client-only',
      env: 'server',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'REQUIRED_DEPENDENCY_NOT_SELECTED is NOT emitted on a deselected dependency when requiring parent is also deselected',
      entries: [
        makeEntry('parent-deselected', {
          client: {
            support: 'optional',
            dependencies: ['dep-off'],
            selection: { on: false, source: 'user' },
          },
        }),
        makeEntry('dep-off', {
          origin: 'dependency',
          client: {
            support: 'optional',
            requiredBy: ['parent-deselected'],
            selection: { on: false, source: 'user' },
          },
        }),
      ],
      targetId: 'dep-off',
      env: 'client',
      expectedKind: 'ok',
      expectedReasons: [],
    },
    {
      name: 'PLATFORM_UNVERIFIED (warning) when resolution === game-version-fallback',
      entries: [
        makeEntry('mod-fallback', {
          client: {
            support: 'required',
            resolution: 'game-version-fallback',
          },
        }),
      ],
      targetId: 'mod-fallback',
      env: 'client',
      expectedKind: 'warning',
      expectedReasons: ['PLATFORM_UNVERIFIED'],
    },
    {
      name: 'SUPPORT_UNKNOWN (unknown) when support === unknown and selected',
      entries: [
        makeEntry('mod-unknown', {
          client: {
            support: 'unknown',
            selection: { on: true, source: 'user' },
          },
        }),
      ],
      targetId: 'mod-unknown',
      env: 'client',
      expectedKind: 'unknown',
      expectedReasons: ['SUPPORT_UNKNOWN'],
    },
    {
      name: 'Priority error > warning > unknown > ok when multiple reasons co-occur on a cell',
      entries: [
        makeEntry('mod-multi', {
          client: {
            support: 'unknown',
            resolution: 'game-version-fallback',
            dependencies: ['dep-missing'],
            selection: { on: true, source: 'user' },
          },
        }),
        makeEntry('dep-missing', {
          origin: 'dependency',
          client: {
            support: 'required',
            version: null,
            requiredBy: ['mod-multi'],
            selection: { on: false, source: 'none' },
          },
        }),
      ],
      targetId: 'mod-multi',
      env: 'client',
      expectedKind: 'error',
      expectedReasons: ['DEPENDENCY_UNAVAILABLE', 'PLATFORM_UNVERIFIED', 'SUPPORT_UNKNOWN'],
    },
  ];

  it.each(statusCases)('$name', ({ entries, targetId, env, expectedKind, expectedReasons }) => {
    const instance = makeInstance(entries);
    const statusMap = computeStatus(instance);
    const cellStatus = statusMap.get(targetId)?.[env];

    expect(cellStatus).toEqual({
      kind: expectedKind,
      reasons: expectedReasons,
    });
  });
});

describe('Environment toggles & row status aggregation (§7.3.1, §7.4)', () => {
  it('computes row status across active environments only and returns null when neither environment is active', () => {
    const instance = makeInstance([
      makeEntry('mod-mixed', {
        // client has warning (PLATFORM_UNVERIFIED), server has error (NO_COMPATIBLE_VERSION)
        client: {
          support: 'required',
          resolution: 'game-version-fallback',
        },
        server: {
          support: 'required',
          version: null,
          selection: { on: false, source: 'none' },
        },
      }),
      makeEntry('mod-client-only', {
        client: { support: 'required' },
        server: { support: 'unsupported', version: null },
      }),
    ]);

    // 1. Both environments active (default) -> row is worst across both ('error')
    const bothActive = computeEntryStatus(instance);
    expect(bothActive.get('mod-mixed')?.client?.kind).toBe('warning');
    expect(bothActive.get('mod-mixed')?.server?.kind).toBe('error');
    expect(bothActive.get('mod-mixed')?.row).toEqual({
      kind: 'error',
      reasons: ['NO_COMPATIBLE_VERSION', 'PLATFORM_UNVERIFIED'],
    });
    // Unsupported server cell on mod-client-only is null
    expect(bothActive.get('mod-client-only')?.client).toEqual({ kind: 'ok', reasons: [] });
    expect(bothActive.get('mod-client-only')?.server).toBeNull();
    expect(bothActive.get('mod-client-only')?.row).toEqual({ kind: 'ok', reasons: [] });

    // 2. Only client active -> server is null and ignored in row status ('warning')
    const clientOnly = computeEntryStatus(instance, ['client']);
    expect(clientOnly.get('mod-mixed')?.client?.kind).toBe('warning');
    expect(clientOnly.get('mod-mixed')?.server).toBeNull();
    expect(clientOnly.get('mod-mixed')?.row).toEqual({
      kind: 'warning',
      reasons: ['PLATFORM_UNVERIFIED'],
    });

    // 3. Only server active -> mod-client-only has server unsupported (null), so row is null
    const serverOnly = computeEntryStatus(instance, new Set<EnvironmentId>(['server']));
    expect(serverOnly.get('mod-mixed')?.row?.kind).toBe('error');
    expect(serverOnly.get('mod-client-only')?.client).toBeNull();
    expect(serverOnly.get('mod-client-only')?.server).toBeNull();
    expect(serverOnly.get('mod-client-only')?.row).toBeNull();

    // 4. Neither environment active -> all cell and row statuses are null in computeEntryStatus
    const noneActive = computeEntryStatus(instance, []);
    expect(noneActive.get('mod-mixed')).toEqual({
      client: null,
      server: null,
      row: null,
    });
  });

  it('ignores non-exportable (modpack) entries in cell and row status evaluation', () => {
    const instance = makeInstance([
      makeEntry('modpack-entry', {
        type: 'modpack',
        client: { support: 'required', version: null, selection: { on: false, source: 'none' } },
        server: { support: 'required', version: null, selection: { on: false, source: 'none' } },
      }),
    ]);

    const entryStatuses = computeEntryStatus(instance);
    expect(entryStatuses.get('modpack-entry')).toEqual({
      client: null,
      server: null,
      row: null,
    });

    const statusMap = computeStatus(instance);
    expect(statusMap.get('modpack-entry')).toEqual({
      client: { kind: 'ok', reasons: [] },
      server: { kind: 'ok', reasons: [] },
    });
  });

  it('provides priority helpers and human-readable tooltip formatters', () => {
    expect(getReasonKind('NO_COMPATIBLE_VERSION')).toBe('error');
    expect(getReasonKind('PIN_CONFLICT')).toBe('warning');
    expect(getReasonKind('SUPPORT_UNKNOWN')).toBe('unknown');

    expect(compareKindPriority('error', 'warning')).toBeGreaterThan(0);
    expect(compareKindPriority('ok', 'unknown')).toBeLessThan(0);
    expect(getWorstKind(['ok', 'unknown', 'warning'])).toBe('warning');
    expect(getWorstKind([])).toBe('ok');

    expect(formatReason('REQUIRED_NOT_SELECTED', 'client')).toContain('Client:');
    expect(formatReason('REQUIRED_NOT_SELECTED')).not.toContain('Client:');

    expect(formatCellStatusTooltip(null, 'client')).toBe('');
    expect(formatCellStatusTooltip({ kind: 'ok', reasons: [] }, 'server')).toBe('Server: OK');

    const tooltip = formatRowStatusTooltip({
      client: { kind: 'warning', reasons: ['REQUIRED_NOT_SELECTED'] },
      server: { kind: 'error', reasons: ['NO_COMPATIBLE_VERSION'] },
      row: { kind: 'error', reasons: ['NO_COMPATIBLE_VERSION', 'REQUIRED_NOT_SELECTED'] },
    });
    expect(tooltip).toContain('Client:');
    expect(tooltip).toContain('Server:');
  });
});
