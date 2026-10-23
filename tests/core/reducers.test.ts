import { describe, expect, it } from 'vitest';
import {
  CORE_SCHEMA_VERSION,
  isSelectable,
  type Entry,
  type EntryOrigin,
  type EnvironmentId,
  type EnvironmentState,
  type Instance,
  type ProjectType,
  type Resolution,
  type Selection,
  type Support,
  type VersionDependency,
  type VersionRef,
} from '../../src/core/model';
import {
  computeInitialSelection,
  deselectAllInTable,
  deselectEntry,
  getHeaderTriState,
  hasSelectionChangedFromDefault,
  reduceInstance,
  resetInstanceSelection,
  selectAllInTable,
  selectEntry,
  setEntryVersion,
} from '../../src/core/reducers';

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
  const version = config.version === undefined ? makeVersion('v-default') : config.version;
  const candidates = config.candidates ?? (version ? [version] : []);
  const resolution: Resolution = config.resolution ?? (version ? 'latest-compatible' : 'none');
  const dependencies =
    config.dependencies ??
    (version
      ? version.dependencies.filter((d) => d.type === 'required').map((d) => d.projectId)
      : []);
  const requiredBy = config.requiredBy ?? [];
  const selection = config.selection ?? { on: false, source: 'none' };

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
      name: 'Test Collection',
      source: {
        collectionId: 'col-1',
        url: 'https://modrinth.com/collection/col-1',
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

function getEnv(instance: Instance, projectId: string, env: EnvironmentId): EnvironmentState {
  const entry = instance.entries.find((e) => e.project.id === projectId);
  if (!entry) {
    throw new Error(`Entry ${projectId} not found`);
  }
  return entry.environments[env];
}

describe('Selectability & computeInitialSelection (§7.3)', () => {
  const selectabilityCases: {
    name: string;
    support: Support;
    hasVersion: boolean;
    expectedSelectable: boolean;
  }[] = [
    {
      name: 'required with version',
      support: 'required',
      hasVersion: true,
      expectedSelectable: true,
    },
    {
      name: 'optional with version',
      support: 'optional',
      hasVersion: true,
      expectedSelectable: true,
    },
    {
      name: 'unknown with version',
      support: 'unknown',
      hasVersion: true,
      expectedSelectable: true,
    },
    {
      name: 'unsupported with version',
      support: 'unsupported',
      hasVersion: true,
      expectedSelectable: false,
    },
    {
      name: 'required without version',
      support: 'required',
      hasVersion: false,
      expectedSelectable: false,
    },
    {
      name: 'optional without version',
      support: 'optional',
      hasVersion: false,
      expectedSelectable: false,
    },
    {
      name: 'unknown without version',
      support: 'unknown',
      hasVersion: false,
      expectedSelectable: false,
    },
    {
      name: 'unsupported without version',
      support: 'unsupported',
      hasVersion: false,
      expectedSelectable: false,
    },
  ];

  it.each(selectabilityCases)(
    'isSelectable($name) -> $expectedSelectable',
    ({ support, hasVersion, expectedSelectable }) => {
      const state = makeEnvState({
        support,
        version: hasVersion ? makeVersion('v1') : null,
      });
      expect(isSelectable(state)).toBe(expectedSelectable);
    },
  );

  it('selects all selectable collection entries (user) and only required selectable dependency entries (auto) per environment', () => {
    const entries = [
      // Collection entry selectable in client (required) and server (unknown)
      makeEntry('col-both', {
        origin: 'collection',
        client: { support: 'required', dependencies: ['dep-client-only', 'dep-transitive-1'] },
        server: { support: 'unknown', dependencies: [] },
      }),
      // Collection entry unsupported on server, no version on client
      makeEntry('col-unselectable', {
        origin: 'collection',
        client: { support: 'required', version: null },
        server: { support: 'unsupported', version: null },
      }),
      // Dependency required on client, selectable on both client and server (should NOT be selected on server!)
      makeEntry('dep-client-only', {
        origin: 'dependency',
        client: { support: 'required', requiredBy: ['col-both'] },
        server: { support: 'required', requiredBy: [] },
      }),
      // Transitive dependency chain: col-both -> dep-transitive-1 -> dep-transitive-2
      makeEntry('dep-transitive-1', {
        origin: 'dependency',
        client: {
          support: 'optional',
          dependencies: ['dep-transitive-2'],
          requiredBy: ['col-both'],
        },
        server: { support: 'optional' },
      }),
      makeEntry('dep-transitive-2', {
        origin: 'dependency',
        client: { support: 'unknown', requiredBy: ['dep-transitive-1'] },
        server: { support: 'optional' },
      }),
      // Orphan dependency not required by any selected entry
      makeEntry('dep-orphan', {
        origin: 'dependency',
        client: { support: 'required' },
        server: { support: 'required' },
      }),
    ];

    const instance = computeInitialSelection(makeInstance(entries));

    expect(getEnv(instance, 'col-both', 'client').selection).toEqual({ on: true, source: 'user' });
    expect(getEnv(instance, 'col-both', 'server').selection).toEqual({ on: true, source: 'user' });

    expect(getEnv(instance, 'col-unselectable', 'client').selection).toEqual({
      on: false,
      source: 'none',
    });
    expect(getEnv(instance, 'col-unselectable', 'server').selection).toEqual({
      on: false,
      source: 'none',
    });

    expect(getEnv(instance, 'dep-client-only', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });
    expect(getEnv(instance, 'dep-client-only', 'server').selection).toEqual({
      on: false,
      source: 'none',
    });

    expect(getEnv(instance, 'dep-transitive-1', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });
    expect(getEnv(instance, 'dep-transitive-2', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });

    expect(getEnv(instance, 'dep-orphan', 'client').selection).toEqual({
      on: false,
      source: 'none',
    });
    expect(getEnv(instance, 'dep-orphan', 'server').selection).toEqual({
      on: false,
      source: 'none',
    });
  });

  it('also supports passing an Entry[] array directly to computeInitialSelection and handles dependency cycles', () => {
    const entries = [
      makeEntry('col-a', {
        origin: 'collection',
        client: { dependencies: ['dep-cycle-1'] },
      }),
      makeEntry('dep-cycle-1', {
        origin: 'dependency',
        client: { dependencies: ['dep-cycle-2'] },
      }),
      makeEntry('dep-cycle-2', {
        origin: 'dependency',
        client: { dependencies: ['dep-cycle-1'] },
      }),
    ];

    const resolvedEntries = computeInitialSelection(entries);
    expect(resolvedEntries[0]?.environments.client.selection).toEqual({
      on: true,
      source: 'user',
    });
    expect(resolvedEntries[1]?.environments.client.selection).toEqual({
      on: true,
      source: 'auto',
    });
    expect(resolvedEntries[2]?.environments.client.selection).toEqual({
      on: true,
      source: 'auto',
    });
  });
});

describe('select / deselect reducer rules (§7.3)', () => {
  it('selects an entry with source:user and auto-selects transitive selectable dependencies while respecting off/user', () => {
    const instance = makeInstance([
      makeEntry('mod-a', {
        origin: 'collection',
        client: {
          dependencies: ['dep-1', 'dep-user-off', 'dep-unselectable'],
          selection: { on: false, source: 'user' },
        },
      }),
      makeEntry('dep-1', {
        origin: 'dependency',
        client: {
          dependencies: ['dep-2'],
          requiredBy: ['mod-a'],
          selection: { on: false, source: 'auto' },
        },
      }),
      makeEntry('dep-2', {
        origin: 'dependency',
        client: {
          requiredBy: ['dep-1'],
          selection: { on: false, source: 'none' },
        },
      }),
      makeEntry('dep-user-off', {
        origin: 'dependency',
        client: {
          requiredBy: ['mod-a'],
          selection: { on: false, source: 'user' },
        },
      }),
      makeEntry('dep-unselectable', {
        origin: 'dependency',
        client: {
          version: null,
          requiredBy: ['mod-a'],
          selection: { on: false, source: 'none' },
        },
      }),
    ]);

    const result = selectEntry(instance, 'mod-a', 'client');

    expect(getEnv(result.instance, 'mod-a', 'client').selection).toEqual({
      on: true,
      source: 'user',
    });
    expect(getEnv(result.instance, 'dep-1', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });
    expect(getEnv(result.instance, 'dep-2', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });
    // Explicitly turned off by user -> stays off/user!
    expect(getEnv(result.instance, 'dep-user-off', 'client').selection).toEqual({
      on: false,
      source: 'user',
    });
    // Unselectable -> stays off/none!
    expect(getEnv(result.instance, 'dep-unselectable', 'client').selection).toEqual({
      on: false,
      source: 'none',
    });

    expect(result.changes).toEqual([
      { projectId: 'dep-1', env: 'client', on: true, reason: 'auto-selected' },
      { projectId: 'dep-2', env: 'client', on: true, reason: 'auto-selected' },
    ]);
  });

  it('does not mutate input instance and ignores select on unselectable or unknown entries', () => {
    const instance = makeInstance([
      makeEntry('unselectable', {
        origin: 'collection',
        client: { support: 'unsupported', version: null },
      }),
    ]);

    const res1 = selectEntry(instance, 'unselectable', 'client');
    expect(res1.instance).toBe(instance);
    expect(res1.changes).toEqual([]);

    const res2 = selectEntry(instance, 'does-not-exist', 'client');
    expect(res2.instance).toBe(instance);
    expect(res2.changes).toEqual([]);
  });

  it('deselects an entry with source:user and auto-deselects only orphaned source:auto dependencies', () => {
    const instance = computeInitialSelection(
      makeInstance([
        makeEntry('mod-a', {
          origin: 'collection',
          client: { dependencies: ['dep-shared', 'dep-only-a'] },
        }),
        makeEntry('mod-b', {
          origin: 'collection',
          client: { dependencies: ['dep-shared'] },
        }),
        makeEntry('dep-shared', {
          origin: 'dependency',
          client: { requiredBy: ['mod-a', 'mod-b'] },
        }),
        makeEntry('dep-only-a', {
          origin: 'dependency',
          client: {
            dependencies: ['dep-transitive-a', 'dep-user-selected'],
            requiredBy: ['mod-a'],
          },
        }),
        makeEntry('dep-transitive-a', {
          origin: 'dependency',
          client: { requiredBy: ['dep-only-a'] },
        }),
        makeEntry('dep-user-selected', {
          origin: 'dependency',
          client: { requiredBy: ['dep-only-a'] },
        }),
      ]),
    );

    // User explicitly selects dep-user-selected so its source becomes 'user'
    const withUserDep = selectEntry(instance, 'dep-user-selected', 'client').instance;
    expect(getEnv(withUserDep, 'dep-user-selected', 'client').selection).toEqual({
      on: true,
      source: 'user',
    });

    // Now deselect mod-a on client
    const afterDeselectA = deselectEntry(withUserDep, 'mod-a', 'client');

    expect(getEnv(afterDeselectA.instance, 'mod-a', 'client').selection).toEqual({
      on: false,
      source: 'user',
    });
    // dep-shared is still required by mod-b (which is selected) -> stays on/auto
    expect(getEnv(afterDeselectA.instance, 'dep-shared', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });
    // dep-only-a and dep-transitive-a are no longer required by any selected entry -> off/auto
    expect(getEnv(afterDeselectA.instance, 'dep-only-a', 'client').selection).toEqual({
      on: false,
      source: 'auto',
    });
    expect(getEnv(afterDeselectA.instance, 'dep-transitive-a', 'client').selection).toEqual({
      on: false,
      source: 'auto',
    });
    // dep-user-selected has source: 'user' -> untouched!
    expect(getEnv(afterDeselectA.instance, 'dep-user-selected', 'client').selection).toEqual({
      on: true,
      source: 'user',
    });
    // Server environment is completely independent and untouched
    expect(getEnv(afterDeselectA.instance, 'mod-a', 'server').selection).toEqual({
      on: true,
      source: 'user',
    });

    expect(afterDeselectA.changes).toEqual([
      { projectId: 'dep-only-a', env: 'client', on: false, reason: 'auto-deselected' },
      { projectId: 'dep-transitive-a', env: 'client', on: false, reason: 'auto-deselected' },
    ]);
  });

  it('auto-deselects cyclic auto dependencies when their user-selected root is deselected', () => {
    const instance = computeInitialSelection(
      makeInstance([
        makeEntry('root', {
          origin: 'collection',
          client: { dependencies: ['cycle-1'] },
        }),
        makeEntry('cycle-1', {
          origin: 'dependency',
          client: { dependencies: ['cycle-2'], requiredBy: ['root', 'cycle-2'] },
        }),
        makeEntry('cycle-2', {
          origin: 'dependency',
          client: { dependencies: ['cycle-1'], requiredBy: ['cycle-1'] },
        }),
      ]),
    );

    const res = deselectEntry(instance, 'root', 'client');
    expect(getEnv(res.instance, 'cycle-1', 'client').selection).toEqual({
      on: false,
      source: 'auto',
    });
    expect(getEnv(res.instance, 'cycle-2', 'client').selection).toEqual({
      on: false,
      source: 'auto',
    });
    expect(res.changes).toHaveLength(2);
  });
});

describe('Header select-all, deselect-all, and getHeaderTriState (§7.3)', () => {
  it('computes tri-state and applies select-all / deselect-all to collection rows of target projectType only', () => {
    const initial = computeInitialSelection(
      makeInstance([
        makeEntry('mod-1', {
          origin: 'collection',
          type: 'mod',
          client: { dependencies: ['dep-mod-1'] },
        }),
        makeEntry('mod-2', {
          origin: 'collection',
          type: 'mod',
          client: { support: 'optional' },
        }),
        makeEntry('mod-unsupported', {
          origin: 'collection',
          type: 'mod',
          client: { support: 'unsupported', version: null },
        }),
        makeEntry('dep-mod-1', {
          origin: 'dependency',
          type: 'mod',
          client: { requiredBy: ['mod-1'] },
        }),
        makeEntry('shader-1', {
          origin: 'collection',
          type: 'shader',
          client: { support: 'optional' },
        }),
      ]),
    );

    // Initially all selectable collection mods are selected -> 'checked'
    expect(getHeaderTriState(initial, 'mod', 'client')).toBe('checked');
    // No plugin entries -> 'unchecked'
    expect(getHeaderTriState(initial, 'plugin', 'client')).toBe('unchecked');

    // Deselect mod-1 -> 1 of 2 selectable collection mods selected -> 'indeterminate'
    const afterOneDeselected = deselectEntry(initial, 'mod-1', 'client').instance;
    expect(getHeaderTriState(afterOneDeselected, 'mod', 'client')).toBe('indeterminate');

    // Deselect all in 'mod' table on client
    const afterDeselectAll = deselectAllInTable(afterOneDeselected, 'mod', 'client');
    expect(getHeaderTriState(afterDeselectAll.instance, 'mod', 'client')).toBe('unchecked');
    expect(getEnv(afterDeselectAll.instance, 'mod-1', 'client').selection).toEqual({
      on: false,
      source: 'user',
    });
    expect(getEnv(afterDeselectAll.instance, 'mod-2', 'client').selection).toEqual({
      on: false,
      source: 'user',
    });
    expect(getEnv(afterDeselectAll.instance, 'dep-mod-1', 'client').selection).toEqual({
      on: false,
      source: 'auto',
    });
    // shader-1 in another table is untouched
    expect(getEnv(afterDeselectAll.instance, 'shader-1', 'client').selection).toEqual({
      on: true,
      source: 'user',
    });

    // Select all in 'mod' table on client -> selects mod-1 and mod-2 (user) and auto-selects dep-mod-1 (auto)
    const afterSelectAll = selectAllInTable(afterDeselectAll.instance, 'mod', 'client');
    expect(getHeaderTriState(afterSelectAll.instance, 'mod', 'client')).toBe('checked');
    expect(getEnv(afterSelectAll.instance, 'mod-1', 'client').selection).toEqual({
      on: true,
      source: 'user',
    });
    expect(getEnv(afterSelectAll.instance, 'mod-2', 'client').selection).toEqual({
      on: true,
      source: 'user',
    });
    expect(getEnv(afterSelectAll.instance, 'dep-mod-1', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });
    expect(afterSelectAll.changes).toEqual([
      { projectId: 'dep-mod-1', env: 'client', on: true, reason: 'auto-selected' },
    ]);
  });
});

describe('set-version, reset-selection, and hasSelectionChangedFromDefault (§7.2, §7.3)', () => {
  it('updates version, sets resolution:user, recomputes dependencies/requiredBy, and reconciles auto-selections', () => {
    const v1 = makeVersion('v1', [{ projectId: 'dep-old', type: 'required' }]);
    const v2 = makeVersion('v2', [
      { projectId: 'dep-new', type: 'required' },
      { projectId: 'dep-optional', type: 'optional' },
    ]);

    const initial = computeInitialSelection(
      makeInstance([
        makeEntry('mod-main', {
          origin: 'collection',
          client: {
            version: v1,
            candidates: [v1, v2],
            dependencies: ['dep-old'],
          },
        }),
        makeEntry('dep-old', {
          origin: 'dependency',
          client: { requiredBy: ['mod-main'] },
        }),
        makeEntry('dep-new', {
          origin: 'dependency',
          client: { requiredBy: [] },
        }),
        makeEntry('dep-optional', {
          origin: 'dependency',
          client: { requiredBy: [] },
        }),
      ]),
    );

    expect(hasSelectionChangedFromDefault(initial)).toBe(false);
    expect(getEnv(initial, 'dep-old', 'client').selection).toEqual({ on: true, source: 'auto' });
    expect(getEnv(initial, 'dep-new', 'client').selection).toEqual({ on: false, source: 'none' });

    const res = setEntryVersion(initial, 'mod-main', 'client', 'v2');

    const mainClient = getEnv(res.instance, 'mod-main', 'client');
    expect(mainClient.version?.id).toBe('v2');
    expect(mainClient.resolution).toBe('user');
    expect(mainClient.dependencies).toEqual(['dep-new']);

    expect(getEnv(res.instance, 'dep-old', 'client').requiredBy).toEqual([]);
    expect(getEnv(res.instance, 'dep-old', 'client').selection).toEqual({
      on: false,
      source: 'auto',
    });

    expect(getEnv(res.instance, 'dep-new', 'client').requiredBy).toEqual(['mod-main']);
    expect(getEnv(res.instance, 'dep-new', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });

    // Optional dependency is ignored
    expect(getEnv(res.instance, 'dep-optional', 'client').selection).toEqual({
      on: false,
      source: 'none',
    });

    expect(res.changes).toEqual([
      { projectId: 'dep-old', env: 'client', on: false, reason: 'auto-deselected' },
      { projectId: 'dep-new', env: 'client', on: true, reason: 'auto-selected' },
    ]);

    expect(hasSelectionChangedFromDefault(res.instance)).toBe(true);

    // Resetting selection after setEntryVersion clears selection diffs (off/auto -> off/none)
    // and yields hasSelectionChangedFromDefault === false (Finding #3)
    const afterReset = resetInstanceSelection(res.instance);
    expect(hasSelectionChangedFromDefault(afterReset.instance)).toBe(false);
  });

  it('re-evaluates child dependency version pins and ignores unsupported environments on set-version (Finding #2)', () => {
    const depV1Pinned = makeVersion(
      'dep-v1-pinned',
      [{ projectId: 'dep-grandchild', type: 'required' }],
      '2024-01-01T00:00:00Z',
    );
    const depV2Latest = makeVersion('dep-v2-latest', [], '2025-01-01T00:00:00Z');

    const mainV1Unpinned = makeVersion(
      'main-v1',
      [{ projectId: 'dep-child', type: 'required' }],
      '2025-01-01T00:00:00Z',
    );
    const mainV2Pinned = makeVersion(
      'main-v2',
      [{ projectId: 'dep-child', versionId: 'dep-v1-pinned', type: 'required' }],
      '2024-06-01T00:00:00Z',
    );

    const initial = computeInitialSelection(
      makeInstance([
        makeEntry('mod-main', {
          origin: 'collection',
          client: {
            version: mainV1Unpinned,
            candidates: [mainV1Unpinned, mainV2Pinned],
            dependencies: ['dep-child'],
          },
          server: {
            support: 'unsupported',
            version: null,
            candidates: [mainV1Unpinned, mainV2Pinned],
          },
        }),
        makeEntry('dep-child', {
          origin: 'dependency',
          client: {
            version: depV2Latest,
            candidates: [depV2Latest, depV1Pinned],
            resolution: 'latest-compatible',
            dependencies: [],
            requiredBy: ['mod-main'],
          },
        }),
        makeEntry('dep-grandchild', {
          origin: 'dependency',
          client: {
            requiredBy: [],
          },
        }),
      ]),
    );

    // Calling set-version on an unsupported environment is a no-op
    const unsupportedRes = setEntryVersion(initial, 'mod-main', 'server', 'main-v2');
    expect(unsupportedRes.instance).toBe(initial);
    expect(unsupportedRes.changes).toEqual([]);

    // Switching mod-main to main-v2 on client pins dep-child to dep-v1-pinned and auto-selects dep-grandchild
    const clientRes = setEntryVersion(initial, 'mod-main', 'client', 'main-v2');
    expect(getEnv(clientRes.instance, 'dep-child', 'client').version?.id).toBe('dep-v1-pinned');
    expect(getEnv(clientRes.instance, 'dep-child', 'client').resolution).toBe('pinned');
    expect(getEnv(clientRes.instance, 'dep-child', 'client').dependencies).toEqual([
      'dep-grandchild',
    ]);
    expect(getEnv(clientRes.instance, 'dep-grandchild', 'client').requiredBy).toEqual([
      'dep-child',
    ]);
    expect(getEnv(clientRes.instance, 'dep-grandchild', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });
    expect(clientRes.changes).toEqual([
      { projectId: 'dep-grandchild', env: 'client', on: true, reason: 'auto-selected' },
    ]);
  });

  it('resets selection to initial default state on reset-selection action', () => {
    const initial = computeInitialSelection(
      makeInstance([
        makeEntry('mod-1', {
          origin: 'collection',
          client: { dependencies: ['dep-1'] },
        }),
        makeEntry('dep-1', {
          origin: 'dependency',
          client: { requiredBy: ['mod-1'] },
        }),
      ]),
    );

    const modified = deselectEntry(initial, 'mod-1', 'client').instance;
    expect(hasSelectionChangedFromDefault(modified)).toBe(true);

    const reset = resetInstanceSelection(modified);
    expect(reset.changes).toEqual([]);
    expect(hasSelectionChangedFromDefault(reset.instance)).toBe(false);
    expect(getEnv(reset.instance, 'mod-1', 'client').selection).toEqual({
      on: true,
      source: 'user',
    });
    expect(getEnv(reset.instance, 'dep-1', 'client').selection).toEqual({
      on: true,
      source: 'auto',
    });

    // Also verify reduceInstance directly with reset-selection
    const directReset = reduceInstance(modified, { type: 'reset-selection' });
    expect(hasSelectionChangedFromDefault(directReset.instance)).toBe(false);
  });
});
