import { describe, expect, it } from 'vitest';
import {
  getMrpackWarnings,
  getSkippedEntries,
  mapPlatformToMrpackDependencyKey,
  toFileTree,
  toMrpack,
  toMrpackEnvSupport,
  toTables,
} from '../../src/core/projections';
import {
  MODPACK_SKIPPED_REASON,
  type Entry,
  type EnvironmentState,
  type Instance,
  type ProjectType,
  type Support,
  type VersionRef,
} from '../../src/core/model';

function makeVersion(overrides: Partial<VersionRef> = {}): VersionRef {
  return {
    id: overrides.id ?? 'ver-1',
    versionNumber: overrides.versionNumber ?? '1.0.0',
    versionType: overrides.versionType ?? 'release',
    publishedAt: overrides.publishedAt ?? '2025-01-01T00:00:00.000Z',
    gameVersions: overrides.gameVersions ?? ['1.20.1'],
    platforms: overrides.platforms ?? ['fabric'],
    file: overrides.file ?? {
      filename: 'mod-1.0.0.jar',
      url: 'https://cdn.modrinth.com/data/mod/versions/ver-1/mod-1.0.0.jar',
      size: 2048,
      sha1: '1111111111111111111111111111111111111111',
      sha512: '2222222222222222222222222222222222222222222222222222222222222222',
    },
    dependencies: overrides.dependencies ?? [],
  };
}

function makeEnvState(overrides: Partial<EnvironmentState> = {}): EnvironmentState {
  const version = overrides.version !== undefined ? overrides.version : makeVersion();
  return {
    support: overrides.support ?? 'required',
    candidates: overrides.candidates ?? (version ? [version] : []),
    version,
    resolution: overrides.resolution ?? (version ? 'latest-compatible' : 'none'),
    dependencies: overrides.dependencies ?? [],
    requiredBy: overrides.requiredBy ?? [],
    selection: overrides.selection ?? { on: true, source: 'user' },
  };
}

function makeEntry(
  id: string,
  title: string,
  type: ProjectType,
  origin: 'collection' | 'dependency',
  clientState: Partial<EnvironmentState> = {},
  serverState: Partial<EnvironmentState> = {},
): Entry {
  return {
    project: {
      id,
      slug: id,
      title,
      type,
      modrinthUrl: `https://modrinth.com/project/${id}`,
    },
    origin,
    environments: {
      client: makeEnvState(clientState),
      server: makeEnvState(serverState),
    },
  };
}

function makeInstance(entries: Entry[], platform = 'fabric', gameVersion = '1.20.1'): Instance {
  return {
    schemaVersion: 1,
    meta: {
      name: 'Test Collection',
      source: {
        collectionId: 'col-123',
        url: 'https://modrinth.com/collection/col-123',
      },
      target: {
        gameVersion,
        platform,
        releasePreference: 'stable',
      },
      createdAt: '2025-02-01T12:00:00.000Z',
    },
    entries,
  };
}

describe('projections', () => {
  describe('toTables & getSkippedEntries', () => {
    it('groups entries by PROJECT_TYPE_ORDER, separates collection rows and dependency footers, and sets platform', () => {
      const shaderEntry = makeEntry(
        'comp-shaders',
        'Complementary Shaders',
        'shader',
        'collection',
      );
      const modEntry = makeEntry(
        'sodium',
        'Sodium',
        'mod',
        'collection',
        { dependencies: ['fabric-api'] },
        { dependencies: [] },
      );
      const depEntry = makeEntry(
        'fabric-api',
        'Fabric API',
        'mod',
        'dependency',
        { requiredBy: ['sodium'], selection: { on: false, source: 'user' } },
        { requiredBy: [], selection: { on: false, source: 'none' } },
      );
      const orphanDepEntry = makeEntry(
        'orphan-lib',
        'Orphan Lib',
        'mod',
        'dependency',
        { requiredBy: [], selection: { on: false, source: 'none' } },
        { requiredBy: [], selection: { on: false, source: 'none' } },
      );
      const resourcepackEntry = makeEntry(
        'fresh-anim',
        'Fresh Animations',
        'resourcepack',
        'collection',
      );
      const modpackEntry = makeEntry('some-pack', 'Some Modpack', 'modpack', 'collection');

      const instance = makeInstance([
        shaderEntry,
        modEntry,
        depEntry,
        orphanDepEntry,
        resourcepackEntry,
        modpackEntry,
      ]);

      const tables = toTables(instance);
      expect(tables.map((t) => t.type)).toEqual(['mod', 'resourcepack', 'shader']);

      const modTable = tables[0]!;
      expect(modTable.rows).toHaveLength(1);
      expect(modTable.rows[0]!.project.id).toBe('sodium');
      expect(modTable.rows[0]!.platform).toBe('fabric');

      // Dependency visibility rule: fabric-api is required by sodium in client (even if deselected),
      // while orphan-lib is not required by any collection entry in any environment.
      expect(modTable.dependencies).toHaveLength(1);
      expect(modTable.dependencies[0]!.project.id).toBe('fabric-api');
      expect(modTable.dependencies[0]!.requiredByTitles).toEqual({
        client: ['Sodium'],
        server: [],
      });

      // Platform-agnostic types have platform: null
      expect(tables[1]!.rows[0]!.platform).toBeNull();
      expect(tables[2]!.rows[0]!.platform).toBeNull();

      // Skipped modpack is reported by getSkippedEntries
      const skipped = getSkippedEntries(instance);
      expect(skipped).toHaveLength(1);
      expect(skipped[0]!.id).toBe('some-pack');
    });

    it('keeps dependency entries visible even when all requiring collection entries are deselected', () => {
      const modA = makeEntry(
        'mod-a',
        'Mod A',
        'mod',
        'collection',
        {
          selection: { on: false, source: 'user' },
          dependencies: ['dep-b'],
        },
        {
          selection: { on: false, source: 'user' },
          dependencies: [],
        },
      );
      const depB = makeEntry(
        'dep-b',
        'Dep B',
        'mod',
        'dependency',
        {
          selection: { on: false, source: 'auto' },
          requiredBy: ['mod-a'],
          dependencies: ['dep-c'],
        },
        {
          selection: { on: false, source: 'none' },
          requiredBy: [],
        },
      );
      const depC = makeEntry(
        'dep-c',
        'Dep C',
        'mod',
        'dependency',
        {
          selection: { on: false, source: 'auto' },
          requiredBy: ['dep-b'],
        },
        {
          selection: { on: false, source: 'none' },
          requiredBy: [],
        },
      );

      const tables = toTables(makeInstance([modA, depB, depC]));
      expect(tables).toHaveLength(1);
      expect(tables[0]!.dependencies.map((d) => d.project.id)).toEqual(['dep-b', 'dep-c']);
      expect(tables[0]!.dependencies[1]!.requiredByTitles.client).toEqual(['Dep B']);
    });

    it('keeps a user-selected dependency and its required transitive dependency visible even after its parent collection entry drops the dependency (#1)', () => {
      const modA = makeEntry(
        'mod-a',
        'Mod A',
        'mod',
        'collection',
        {
          selection: { on: true, source: 'user' },
          dependencies: [],
        },
        {
          selection: { on: false, source: 'none' },
          dependencies: [],
        },
      );
      const depB = makeEntry(
        'dep-b',
        'Dep B',
        'mod',
        'dependency',
        {
          selection: { on: true, source: 'user' },
          requiredBy: [],
          dependencies: ['dep-c'],
          version: makeVersion({
            id: 'v-dep-b',
            dependencies: [{ projectId: 'dep-c', type: 'required' }],
          }),
        },
        {
          selection: { on: false, source: 'none' },
          requiredBy: [],
          dependencies: [],
        },
      );
      const depC = makeEntry(
        'dep-c',
        'Dep C',
        'mod',
        'dependency',
        {
          selection: { on: true, source: 'auto' },
          requiredBy: ['dep-b'],
          dependencies: [],
        },
        {
          selection: { on: false, source: 'none' },
          requiredBy: [],
          dependencies: [],
        },
      );

      const tables = toTables(makeInstance([modA, depB, depC]));
      expect(tables).toHaveLength(1);
      expect(tables[0]!.dependencies.map((d) => d.project.id)).toEqual(['dep-b', 'dep-c']);
    });

    it('reports exportable entries whose chosen version has a .mrpack primary filename in getSkippedEntries (#10)', () => {
      const mrpackMod = makeEntry(
        'mrpack-mod',
        'Mrpack Mod',
        'mod',
        'collection',
        {
          version: makeVersion({
            id: 'v-mrpack',
            file: {
              filename: 'bundle-1.0.0.MRPACK',
              url: 'https://cdn.modrinth.com/bundle.mrpack',
              size: 1024,
              sha1: 'a',
              sha512: 'b',
            },
          }),
        },
        {
          version: null,
          selection: { on: false, source: 'none' },
        },
      );
      const normalMod = makeEntry('normal-mod', 'Normal Mod', 'mod', 'collection');

      const skipped = getSkippedEntries(makeInstance([mrpackMod, normalMod]));
      expect(skipped).toEqual([
        {
          id: 'mrpack-mod',
          slug: 'mrpack-mod',
          title: 'Mrpack Mod',
          type: 'mod',
          modrinthUrl: 'https://modrinth.com/project/mrpack-mod',
          reason: MODPACK_SKIPPED_REASON,
        },
      ]);
    });
  });

  describe('toFileTree', () => {
    it('builds independent client and server file trees with correct folders, names, and collision suffixes', () => {
      const mod1 = makeEntry(
        'better-third-person',
        'Better Third Person',
        'mod',
        'collection',
        {
          version: makeVersion({
            id: 'v-btp',
            versionNumber: '1.9.0',
            file: {
              filename: 'BetterThirdPerson-Forge-1.20-1.9.0.jar',
              url: 'https://cdn.modrinth.com/btp.jar',
              size: 1000,
              sha1: 'a',
              sha512: 'b',
            },
          }),
          selection: { on: true, source: 'user' },
        },
        {
          version: null,
          support: 'unsupported',
          selection: { on: false, source: 'none' },
        },
      );

      // Duplicate title/version in client to trigger -2 collision handling in mods/
      const mod1Duplicate = makeEntry(
        'better-third-person-fork',
        'Better Third Person',
        'mod',
        'collection',
        {
          version: makeVersion({
            id: 'v-btp-2',
            versionNumber: '1.9.0',
            file: {
              filename: 'btp-fork.jar',
              url: 'https://cdn.modrinth.com/btp-fork.jar',
              size: 1001,
              sha1: 'c',
              sha512: 'd',
            },
          }),
          selection: { on: true, source: 'user' },
        },
        {
          version: makeVersion({
            id: 'v-btp-2',
            versionNumber: '1.9.0',
            file: {
              filename: 'btp-fork.jar',
              url: 'https://cdn.modrinth.com/btp-fork.jar',
              size: 1001,
              sha1: 'c',
              sha512: 'd',
            },
          }),
          selection: { on: true, source: 'user' },
        },
      );

      const shader = makeEntry(
        'complementary',
        'Complementary Shaders',
        'shader',
        'collection',
        {
          version: makeVersion({
            id: 'v-sh',
            versionNumber: '5.1',
            file: {
              filename: 'Complementary.zip',
              url: 'https://cdn.modrinth.com/comp.zip',
              size: 5000,
              sha1: 'e',
              sha512: 'f',
            },
          }),
          selection: { on: true, source: 'user' },
        },
        {
          selection: { on: false, source: 'user' },
        },
      );

      const plugin = makeEntry(
        'worldedit',
        'WorldEdit',
        'plugin',
        'collection',
        {
          selection: { on: false, source: 'none' },
        },
        {
          version: makeVersion({
            id: 'v-we',
            versionNumber: '7.3.0',
            file: {
              filename: 'WorldEdit.jar',
              url: 'https://cdn.modrinth.com/we.jar',
              size: 3000,
              sha1: 'g',
              sha512: 'h',
            },
          }),
          selection: { on: true, source: 'user' },
        },
      );

      const instance = makeInstance([mod1, mod1Duplicate, shader, plugin], 'forge', '1.20');
      const tree = toFileTree(instance);

      expect(tree.client.environment).toBe('client');
      expect(tree.client.files.map((f) => f.path)).toEqual([
        'mods/BetterThirdPerson-Forge-1.20-1.9.0.jar',
        'mods/BetterThirdPerson-Forge-1.20-1.9.0-2.jar',
        'shaderpacks/ComplementaryShaders-1.20-5.1.zip',
      ]);

      expect(tree.server.environment).toBe('server');
      expect(tree.server.files.map((f) => f.path)).toEqual([
        'mods/BetterThirdPerson-Forge-1.20-1.9.0.jar',
        'plugins/WorldEdit-Forge-1.20-7.3.0.jar',
      ]);
    });
  });

  describe('toMrpack & getMrpackWarnings', () => {
    it.each<{
      support: Support;
      selected: boolean;
      expected: 'required' | 'optional' | 'unsupported';
    }>([
      { support: 'required', selected: true, expected: 'required' },
      { support: 'optional', selected: true, expected: 'optional' },
      { support: 'unknown', selected: true, expected: 'optional' },
      { support: 'unsupported', selected: true, expected: 'unsupported' },
      { support: 'required', selected: false, expected: 'unsupported' },
      { support: 'optional', selected: false, expected: 'unsupported' },
      { support: 'unknown', selected: false, expected: 'unsupported' },
    ])(
      'maps support=$support (selected=$selected) -> $expected',
      ({ support, selected, expected }) => {
        expect(toMrpackEnvSupport(support, selected)).toBe(expected);
      },
    );

    it.each([
      { platform: 'fabric', expected: 'fabric-loader' },
      { platform: 'quilt', expected: 'quilt-loader' },
      { platform: 'forge', expected: 'forge' },
      { platform: 'neoforge', expected: 'neoforge' },
      { platform: 'paper', expected: null },
    ])(
      'maps platform "$platform" to mrpack dependency key "$expected"',
      ({ platform, expected }) => {
        expect(mapPlatformToMrpackDependencyKey(platform)).toBe(expected);
      },
    );

    it('emits one file entry when client and server share the same version, and two entries when they differ', () => {
      const sharedVer = makeVersion({
        id: 'ver-shared',
        versionNumber: '0.92.0',
        file: {
          filename: 'fabric-api.jar',
          url: 'https://cdn.modrinth.com/fabric-api.jar',
          size: 4096,
          sha1: 'sha1-shared',
          sha512: 'sha512-shared',
        },
      });

      const clientVer = makeVersion({
        id: 'ver-client-only',
        versionNumber: '1.0.0-client',
        file: {
          filename: 'split-client.jar',
          url: 'https://cdn.modrinth.com/split-client.jar',
          size: 1024,
          sha1: 'sha1-client',
          sha512: 'sha512-client',
        },
      });

      const serverVer = makeVersion({
        id: 'ver-server-only',
        versionNumber: '1.0.0-server',
        file: {
          filename: 'split-server.jar',
          url: 'https://cdn.modrinth.com/split-server.jar',
          size: 2048,
          sha1: 'sha1-server',
          sha512: 'sha512-server',
        },
      });

      const sameVersionMod = makeEntry(
        'fabric-api',
        'Fabric API',
        'mod',
        'collection',
        { support: 'required', version: sharedVer, selection: { on: true, source: 'user' } },
        { support: 'unknown', version: sharedVer, selection: { on: true, source: 'user' } },
      );

      const splitVersionMod = makeEntry(
        'split-mod',
        'Split Mod',
        'mod',
        'collection',
        { support: 'optional', version: clientVer, selection: { on: true, source: 'user' } },
        { support: 'required', version: serverVer, selection: { on: true, source: 'user' } },
      );

      const pluginEntry = makeEntry(
        'luckperms',
        'LuckPerms',
        'plugin',
        'collection',
        { selection: { on: false, source: 'none' } },
        { support: 'required', selection: { on: true, source: 'user' } },
      );

      const instance = makeInstance(
        [sameVersionMod, splitVersionMod, pluginEntry],
        'fabric',
        '1.20.1',
      );

      const mrpack = toMrpack(instance, {
        versionId: '2.0.0',
        name: 'Custom Pack',
        summary: 'Pack summary',
        platformVersion: '0.16.9',
      });

      expect(mrpack.formatVersion).toBe(1);
      expect(mrpack.game).toBe('minecraft');
      expect(mrpack.versionId).toBe('2.0.0');
      expect(mrpack.name).toBe('Custom Pack');
      expect(mrpack.summary).toBe('Pack summary');
      expect(mrpack.dependencies).toEqual({
        minecraft: '1.20.1',
        'fabric-loader': '0.16.9',
      });

      // Plugin is excluded; sameVersionMod produces 1 file; splitVersionMod produces 2 files
      expect(mrpack.files).toHaveLength(3);

      expect(mrpack.files[0]).toEqual({
        path: 'mods/FabricAPI-Fabric-1.20.1-0.92.0.jar',
        hashes: { sha1: 'sha1-shared', sha512: 'sha512-shared' },
        env: { client: 'required', server: 'optional' },
        downloads: ['https://cdn.modrinth.com/fabric-api.jar'],
        fileSize: 4096,
      });

      expect(mrpack.files[1]).toEqual({
        path: 'mods/SplitMod-Fabric-1.20.1-1.0.0-client.jar',
        hashes: { sha1: 'sha1-client', sha512: 'sha512-client' },
        env: { client: 'optional', server: 'unsupported' },
        downloads: ['https://cdn.modrinth.com/split-client.jar'],
        fileSize: 1024,
      });

      expect(mrpack.files[2]).toEqual({
        path: 'mods/SplitMod-Fabric-1.20.1-1.0.0-server.jar',
        hashes: { sha1: 'sha1-server', sha512: 'sha512-server' },
        env: { client: 'unsupported', server: 'required' },
        downloads: ['https://cdn.modrinth.com/split-server.jar'],
        fileSize: 2048,
      });

      // Plugin exclusion warning is reported
      const warnings = getMrpackWarnings(instance);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('LuckPerms');
    });

    it('omits platform dependency key when platformVersion is blank or omitted', () => {
      const instance = makeInstance([], 'quilt', '1.20.1');
      expect(toMrpack(instance).dependencies).toEqual({ minecraft: '1.20.1' });
      expect(toMrpack(instance, { platformVersion: '   ' }).dependencies).toEqual({
        minecraft: '1.20.1',
      });
    });
  });
});
