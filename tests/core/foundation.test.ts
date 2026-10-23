import { describe, expect, it } from 'vitest';
import {
  CORE_SCHEMA_VERSION,
  ENVIRONMENTS,
  PLATFORM_AGNOSTIC_TYPES,
  PROJECT_TYPE_ORDER,
  TYPE_FOLDER_MAP,
  isExportableProjectType,
  isPlatformAgnostic,
  isSelectable,
} from '../../src/core/model';
import { FakeModrinthClient } from '../helpers/fake-modrinth-client';

describe('M1 Foundation — Domain model and FakeModrinthClient', () => {
  it('exports authoritative constants and domain helpers', () => {
    expect(CORE_SCHEMA_VERSION).toBe(1);
    expect(ENVIRONMENTS).toEqual(['client', 'server']);
    expect(PROJECT_TYPE_ORDER).toEqual(['mod', 'plugin', 'datapack', 'resourcepack', 'shader']);
    expect(PLATFORM_AGNOSTIC_TYPES).toEqual(['resourcepack', 'shader', 'datapack']);
    expect(TYPE_FOLDER_MAP).toEqual({
      mod: 'mods',
      plugin: 'plugins',
      datapack: 'datapacks',
      resourcepack: 'resourcepacks',
      shader: 'shaderpacks',
    });

    expect(isPlatformAgnostic('resourcepack')).toBe(true);
    expect(isPlatformAgnostic('shader')).toBe(true);
    expect(isPlatformAgnostic('datapack')).toBe(true);
    expect(isPlatformAgnostic('mod')).toBe(false);
    expect(isPlatformAgnostic('plugin')).toBe(false);

    expect(isExportableProjectType('mod')).toBe(true);
    expect(isExportableProjectType('modpack')).toBe(false);

    const dummyVersion = {
      id: 'v1',
      versionNumber: '1.0.0',
      versionType: 'release' as const,
      publishedAt: '2025-01-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      file: {
        filename: 'a.jar',
        url: 'https://cdn.modrinth.com/a.jar',
        size: 100,
        sha1: '1',
        sha512: '5',
      },
      dependencies: [],
    };

    expect(isSelectable({ support: 'required', version: dummyVersion })).toBe(true);
    expect(isSelectable({ support: 'optional', version: dummyVersion })).toBe(true);
    expect(isSelectable({ support: 'unknown', version: dummyVersion })).toBe(true);
    expect(isSelectable({ support: 'unsupported', version: dummyVersion })).toBe(false);
    expect(isSelectable({ support: 'required', version: null })).toBe(false);
  });

  it('seeds and queries collections, projects, versions, game versions, and platforms in FakeModrinthClient', async () => {
    const client = new FakeModrinthClient()
      .setCollection('col-1', ['sodium', 'fabric-api'], 'Performance Pack')
      .addProject({
        id: 'sodium',
        slug: 'sodium',
        title: 'Sodium',
        type: 'mod',
        support: { client: 'required', server: 'unsupported' },
      })
      .addProject({
        id: 'fabric-api',
        title: 'Fabric API',
      })
      .addVersion({
        id: 'v-sodium-1',
        projectId: 'sodium',
        versionNumber: '0.5.8',
        gameVersions: ['1.20.1'],
        platforms: ['fabric'],
        dependencies: [{ projectId: 'fabric-api', type: 'required' }],
      })
      .addVersion({
        id: 'v-fapi-1',
        projectId: 'fabric-api',
        versionNumber: '0.92.0',
        gameVersions: ['1.20.1'],
        platforms: ['fabric'],
      });

    const collection = await client.getCollection('col-1');
    expect(collection).toEqual({
      id: 'col-1',
      name: 'Performance Pack',
      projectIds: ['sodium', 'fabric-api'],
    });

    const projects = await client.getProjects(['sodium', 'fabric-api', 'missing']);
    expect(projects).toHaveLength(2);
    expect(projects[0]?.support).toEqual({ client: 'required', server: 'unsupported' });
    expect(projects[1]?.support).toEqual({ client: 'required', server: 'required' });

    const sodiumVersions = await client.getProjectVersions('sodium', {
      gameVersion: '1.20.1',
      platform: 'fabric',
    });
    expect(sodiumVersions).toHaveLength(1);
    expect(sodiumVersions[0]?.versionNumber).toBe('0.5.8');

    const byIds = await client.getVersionsByIds(['v-fapi-1']);
    expect(byIds).toHaveLength(1);
    expect(byIds[0]?.projectId).toBe('fabric-api');

    const gameVersions = await client.getGameVersions();
    expect(gameVersions.some((gv) => gv.version === '1.20.1' && gv.versionType === 'release')).toBe(
      true,
    );

    const platforms = await client.getPlatforms();
    expect(platforms.some((p) => p.name === 'fabric')).toBe(true);

    expect(client.calls.getCollection).toHaveLength(1);
    expect(client.calls.getProjects).toHaveLength(1);
    expect(client.calls.getProjectVersions).toHaveLength(1);
    expect(client.calls.getVersionsByIds).toHaveLength(1);
    expect(client.calls.getGameVersions).toBe(1);
    expect(client.calls.getPlatforms).toBe(1);
  });

  it('honors AbortSignal and configured failures in FakeModrinthClient', async () => {
    const client = new FakeModrinthClient().setCollection('col-1', []);
    const controller = new AbortController();
    controller.abort();

    await expect(client.getCollection('col-1', { signal: controller.signal })).rejects.toThrow();

    client.failOn('collection:col-1', new Error('Rate limited'));
    await expect(client.getCollection('col-1')).rejects.toThrow('Rate limited');
  });

  it('filters getProjectVersions by q.platform case-insensitively when specified and returns all gameVersion-matching versions when omitted', async () => {
    const client = new FakeModrinthClient()
      .addVersion({
        id: 'v-fabric',
        projectId: 'mod-a',
        versionNumber: '1.0.0-fabric',
        gameVersions: ['1.20.1'],
        platforms: ['Fabric', 'Quilt'],
      })
      .addVersion({
        id: 'v-forge',
        projectId: 'mod-a',
        versionNumber: '1.0.0-forge',
        gameVersions: ['1.20.1'],
        platforms: ['Forge'],
      })
      .addVersion({
        id: 'v-old-fabric',
        projectId: 'mod-a',
        versionNumber: '0.9.0-fabric',
        gameVersions: ['1.19.4'],
        platforms: ['fabric'],
      });

    const fabricOnly = await client.getProjectVersions('mod-a', {
      gameVersion: '1.20.1',
      platform: 'fabric',
    });
    expect(fabricOnly.map((v) => v.id)).toEqual(['v-fabric']);

    const forgeUpper = await client.getProjectVersions('mod-a', {
      gameVersion: '1.20.1',
      platform: 'FORGE',
    });
    expect(forgeUpper.map((v) => v.id)).toEqual(['v-forge']);

    const allPlatformsFor1201 = await client.getProjectVersions('mod-a', {
      gameVersion: '1.20.1',
    });
    expect(allPlatformsFor1201.map((v) => v.id)).toEqual(['v-fabric', 'v-forge']);
  });
});
