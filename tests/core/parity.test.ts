import { describe, expect, it } from 'vitest';
import {
  extractCollectionId,
  filterReleaseGameVersions,
  parseCollectionInput,
} from '../../src/core/collection';
import { resolveCollection } from '../../src/core/resolver';
import { computeStatus } from '../../src/core/status';
import { MODPACK_SKIPPED_REASON } from '../../src/core/model';
import { getSkippedEntries, toFileTree, toMrpack, toTables } from '../../src/core/projections';
import type { GameVersionInfo } from '../../src/ports';
import { FakeModrinthClient, makeDefaultFileRef } from '../helpers/fake-modrinth-client';

describe('parity (§11) — collection ID and URL parsing', () => {
  it.each([
    {
      input: 'YV97U1kk',
      expectedId: 'YV97U1kk',
      expectedUrl: 'https://modrinth.com/collection/YV97U1kk',
    },
    {
      input: '  YV97U1kk  ',
      expectedId: 'YV97U1kk',
      expectedUrl: 'https://modrinth.com/collection/YV97U1kk',
    },
    {
      input: 'https://modrinth.com/collection/YV97U1kk',
      expectedId: 'YV97U1kk',
      expectedUrl: 'https://modrinth.com/collection/YV97U1kk',
    },
    {
      input: 'http://modrinth.com/collection/YV97U1kk/',
      expectedId: 'YV97U1kk',
      expectedUrl: 'https://modrinth.com/collection/YV97U1kk',
    },
    {
      input: 'https://www.modrinth.com/collection/my_col-123?foo=bar#section',
      expectedId: 'my_col-123',
      expectedUrl: 'https://modrinth.com/collection/my_col-123',
    },
    {
      input: 'modrinth.com/collection/abc_DEF-99',
      expectedId: 'abc_DEF-99',
      expectedUrl: 'https://modrinth.com/collection/abc_DEF-99',
    },
    {
      input: 'www.modrinth.com/collection/abc_DEF-99/',
      expectedId: 'abc_DEF-99',
      expectedUrl: 'https://modrinth.com/collection/abc_DEF-99',
    },
  ])('parses "$input" -> "$expectedId"', ({ input, expectedId, expectedUrl }) => {
    expect(parseCollectionInput(input)).toEqual({
      collectionId: expectedId,
      url: expectedUrl,
    });
    expect(extractCollectionId(input)).toBe(expectedId);
  });

  it.each([
    '',
    '   ',
    'https://modrinth.com/mod/sodium',
    'https://modrinth.com/collection/',
    'https://modrinth.com/collection/abc/extra',
    'https://example.com/collection/YV97U1kk',
    'id with spaces',
    'invalid/slash',
  ])('throws on invalid collection input "%s"', (invalidInput) => {
    expect(() => parseCollectionInput(invalidInput)).toThrow();
  });
});

describe('parity (§11) — release-only game version filtering', () => {
  it('keeps only release game versions and excludes snapshots, betas, and alphas', () => {
    const versions: GameVersionInfo[] = [
      { version: '1.21.1', versionType: 'release', date: '2024-08-08T00:00:00Z', major: false },
      { version: '24w33a', versionType: 'snapshot', date: '2024-08-15T00:00:00Z', major: false },
      { version: '1.20.1', versionType: 'release', date: '2023-06-12T00:00:00Z', major: true },
      { version: 'b1.7.3', versionType: 'beta', date: '2011-07-08T00:00:00Z', major: false },
      { version: 'a1.2.6', versionType: 'alpha', date: '2010-12-03T00:00:00Z', major: false },
    ];

    const filtered = filterReleaseGameVersions(versions);
    expect(filtered.map((v) => v.version)).toEqual(['1.21.1', '1.20.1']);
  });
});

describe('parity (§11) — prefer-stable semantics & platform-agnostic types', () => {
  it('prefers stable release over newer beta when releasePreference="stable", or falls back to beta if no release exists', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-stable', ['mod-with-release', 'mod-beta-only']);

    client.addProjects([
      { id: 'mod-with-release', title: 'Mod With Release', type: 'mod' },
      { id: 'mod-beta-only', title: 'Mod Beta Only', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'v-rel',
        projectId: 'mod-with-release',
        versionNumber: '1.0.0',
        versionType: 'release',
        publishedAt: '2024-05-01T00:00:00Z',
      },
      {
        id: 'v-beta-newer',
        projectId: 'mod-with-release',
        versionNumber: '2.0.0-beta.1',
        versionType: 'beta',
        publishedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'v-alpha',
        projectId: 'mod-beta-only',
        versionNumber: '0.1.0-alpha',
        versionType: 'alpha',
        publishedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'v-beta',
        projectId: 'mod-beta-only',
        versionNumber: '0.2.0-beta',
        versionType: 'beta',
        publishedAt: '2024-06-01T00:00:00Z',
      },
    ]);

    const stableRes = await resolveCollection(client, {
      collectionInput: 'col-stable',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    const m1Stable = stableRes.instance.entries.find((e) => e.project.id === 'mod-with-release')!;
    const m2Stable = stableRes.instance.entries.find((e) => e.project.id === 'mod-beta-only')!;
    expect(m1Stable.environments.client.version?.id).toBe('v-rel');
    expect(m2Stable.environments.client.version?.id).toBe('v-beta');

    const newestRes = await resolveCollection(client, {
      collectionInput: 'col-stable',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'newest',
    });

    const m1Newest = newestRes.instance.entries.find((e) => e.project.id === 'mod-with-release')!;
    expect(m1Newest.environments.client.version?.id).toBe('v-beta-newer');
  });

  it('treats resourcepack, datapack, and shader as platform-agnostic while enforcing platform on mod and plugin', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-types', ['rp-1', 'dp-1', 'sh-1', 'mod-forge-only']);

    client.addProjects([
      { id: 'rp-1', title: 'Cool Pack', type: 'resourcepack' },
      { id: 'dp-1', title: 'Cool Datapack', type: 'datapack' },
      { id: 'sh-1', title: 'Cool Shader', type: 'shader' },
      { id: 'mod-forge-only', title: 'Forge Mod', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'v-rp',
        projectId: 'rp-1',
        gameVersions: ['1.20.1'],
        platforms: ['minecraft'],
      },
      {
        id: 'v-dp',
        projectId: 'dp-1',
        gameVersions: ['1.20.1'],
        platforms: ['datapack'],
      },
      {
        id: 'v-sh',
        projectId: 'sh-1',
        gameVersions: ['1.20.1'],
        platforms: ['iris', 'optifine'],
      },
      {
        id: 'v-forge',
        projectId: 'mod-forge-only',
        gameVersions: ['1.20.1'],
        platforms: ['forge'],
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-types',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    const rp = instance.entries.find((e) => e.project.id === 'rp-1')!;
    const dp = instance.entries.find((e) => e.project.id === 'dp-1')!;
    const sh = instance.entries.find((e) => e.project.id === 'sh-1')!;
    const forgeMod = instance.entries.find((e) => e.project.id === 'mod-forge-only')!;

    expect(rp.environments.client.version?.id).toBe('v-rp');
    expect(dp.environments.client.version?.id).toBe('v-dp');
    expect(sh.environments.client.version?.id).toBe('v-sh');
    expect(forgeMod.environments.client.version).toBeNull();
  });
});

describe('parity (§11) — refusing modpacks and .mrpack primary files', () => {
  it('refuses modpack projects and versions whose primary file ends with .mrpack', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-mrpack', ['pack-proj', 'sneaky-mrpack-mod', 'valid-mod']);

    client.addProjects([
      { id: 'pack-proj', title: 'Some Modpack', type: 'modpack' },
      { id: 'sneaky-mrpack-mod', title: 'Sneaky Modpack File', type: 'mod' },
      { id: 'valid-mod', title: 'Valid Mod', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'v-sneaky-mrpack',
        projectId: 'sneaky-mrpack-mod',
        versionNumber: '1.0.0',
        file: {
          ...makeDefaultFileRef('sneaky-mrpack-mod', '1.0.0'),
          filename: 'sneaky-1.0.0.mrpack',
        },
      },
      {
        id: 'v-valid',
        projectId: 'valid-mod',
        versionNumber: '1.0.0',
      },
    ]);

    const { instance, skipped } = await resolveCollection(client, {
      collectionInput: 'col-mrpack',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    expect(skipped).toEqual([
      expect.objectContaining({
        id: 'pack-proj',
        title: 'Some Modpack',
        type: 'modpack',
        reason: MODPACK_SKIPPED_REASON,
      }),
    ]);
    expect(getSkippedEntries(instance)).toEqual(skipped);

    // sneaky-mrpack-mod has no usable version because its primary file is .mrpack
    const sneaky = instance.entries.find((e) => e.project.id === 'sneaky-mrpack-mod')!;
    expect(sneaky.environments.client.version).toBeNull();
    expect(sneaky.environments.client.selection.on).toBe(false);

    // Exports only contain valid-mod
    const tables = toTables(instance);
    expect(tables).toHaveLength(1);
    expect(tables[0]?.rows.map((r) => r.project.id)).toEqual(['sneaky-mrpack-mod', 'valid-mod']);

    const fileTree = toFileTree(instance);
    expect(fileTree.client.files.map((f) => f.projectId)).toEqual(['valid-mod']);

    const mrpack = toMrpack(instance);
    expect(mrpack.files).toHaveLength(1);
  });
});

describe('parity (§11) — duplicate avoidance & missing versions/files handling', () => {
  it('deduplicates repeated projectIds in the collection and shared dependencies without duplicate API fetches', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-dups', ['mod-a', 'mod-b', 'mod-a', 'shared-dep']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'mod-b', title: 'Mod B', type: 'mod' },
      { id: 'shared-dep', title: 'Shared Dep', type: 'mod' },
      { id: 'diamond-leaf', title: 'Diamond Leaf', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va',
        projectId: 'mod-a',
        dependencies: [
          { projectId: 'shared-dep', type: 'required' },
          { projectId: 'diamond-leaf', type: 'required' },
        ],
      },
      {
        id: 'vb',
        projectId: 'mod-b',
        dependencies: [
          { projectId: 'shared-dep', type: 'required' },
          { projectId: 'diamond-leaf', type: 'required' },
        ],
      },
      { id: 'vs', projectId: 'shared-dep' },
      { id: 'vd', projectId: 'diamond-leaf' },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'https://modrinth.com/collection/col-dups',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    expect(instance.entries.map((e) => `${e.project.id}:${e.origin}`)).toEqual([
      'mod-a:collection',
      'mod-b:collection',
      'shared-dep:collection',
      'diamond-leaf:dependency',
    ]);

    // Verify each project's versions were fetched only once
    const fetchedVersionProjectIds = client.calls.getProjectVersions.map((c) => c.projectId);
    expect(fetchedVersionProjectIds).toEqual(['mod-a', 'mod-b', 'shared-dep', 'diamond-leaf']);
  });

  it('gracefully handles missing versions, versions with no primary file, and missing projects', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-missing', [
      'ghost-project',
      'no-version-mod',
      'no-file-mod',
      'mod-with-missing-dep',
    ]);

    client.addProjects([
      { id: 'no-version-mod', title: 'No Version Mod', type: 'mod' },
      { id: 'no-file-mod', title: 'No File Mod', type: 'mod' },
      { id: 'mod-with-missing-dep', title: 'Mod With Missing Dep', type: 'mod' },
      { id: 'unavail-dep', title: 'Unavailable Dep', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'v-no-file',
        projectId: 'no-file-mod',
        file: null,
        files: [],
      },
      {
        id: 'v-parent',
        projectId: 'mod-with-missing-dep',
        dependencies: [{ projectId: 'unavail-dep', type: 'required' }],
      },
      // unavail-dep has no versions for 1.20.1
    ]);

    const { instance, skipped } = await resolveCollection(client, {
      collectionInput: 'col-missing',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    expect(skipped).toEqual([
      expect.objectContaining({
        id: 'ghost-project',
      }),
    ]);

    const statusMap = computeStatus(instance);

    expect(statusMap.get('no-version-mod')?.client).toEqual({
      kind: 'error',
      reasons: ['NO_COMPATIBLE_VERSION'],
    });
    expect(statusMap.get('no-file-mod')?.client).toEqual({
      kind: 'error',
      reasons: ['NO_COMPATIBLE_VERSION'],
    });
    expect(statusMap.get('mod-with-missing-dep')?.client).toEqual({
      kind: 'error',
      reasons: ['DEPENDENCY_UNAVAILABLE'],
    });
    expect(statusMap.get('unavail-dep')?.client).toEqual({
      kind: 'error',
      reasons: ['NO_COMPATIBLE_VERSION', 'NEEDED_BUT_UNAVAILABLE'],
    });
  });
});
