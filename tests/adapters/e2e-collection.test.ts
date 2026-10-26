import { describe, expect, it, vi } from 'vitest';
import {
  createModrinthClient,
  type RawModrinthProject,
  type RawModrinthVersion,
} from '../../src/adapters/modrinth';
import { createAppServices, services } from '../../src/app/services';
import {
  deserialize,
  MODPACK_SKIPPED_REASON,
  resolveCollection,
  serialize,
  toFileTree,
  toMrpack,
  toTables,
  validateInstanceSchema,
} from '../../src/core';
import collectionFixture from '../fixtures/modrinth/collection.json';
import gameVersionsFixture from '../fixtures/modrinth/game-versions.json';
import loadersFixture from '../fixtures/modrinth/loaders.json';
import projectsFixture from '../fixtures/modrinth/projects.json';
import versionsFixture from '../fixtures/modrinth/versions.json';

function createFixtureFetchMock() {
  return vi.fn<typeof fetch>().mockImplementation(async (input) => {
    const url = new URL(String(input));

    if (url.pathname === `/v3/collection/${collectionFixture.id}`) {
      return new Response(JSON.stringify(collectionFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/v2/projects') {
      const ids = JSON.parse(url.searchParams.get('ids') ?? '[]') as string[];
      const matched = (projectsFixture as RawModrinthProject[]).filter((p) => ids.includes(p.id));
      return new Response(JSON.stringify(matched), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const versionMatch = /^\/v2\/project\/([^/]+)\/version$/.exec(url.pathname);
    if (versionMatch) {
      const projectId = decodeURIComponent(versionMatch[1]!);
      const gameVersions = url.searchParams.has('game_versions')
        ? (JSON.parse(url.searchParams.get('game_versions')!) as string[])
        : [];
      const loaders = url.searchParams.has('loaders')
        ? (JSON.parse(url.searchParams.get('loaders')!) as string[])
        : [];

      const matched = (versionsFixture as RawModrinthVersion[]).filter((v) => {
        if (v.project_id !== projectId) {
          return false;
        }
        if (
          gameVersions.length > 0 &&
          !gameVersions.some((gv) => (v.game_versions ?? []).includes(gv))
        ) {
          return false;
        }
        if (
          loaders.length > 0 &&
          !loaders.some((l) => (v.loaders ?? []).map((x) => x.toLowerCase()).includes(l))
        ) {
          return false;
        }
        return true;
      });

      return new Response(JSON.stringify(matched), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/v2/versions') {
      const ids = JSON.parse(url.searchParams.get('ids') ?? '[]') as string[];
      const matched = (versionsFixture as RawModrinthVersion[]).filter((v) => ids.includes(v.id));
      return new Response(JSON.stringify(matched), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/v2/tag/game_version') {
      return new Response(JSON.stringify(gameVersionsFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (url.pathname === '/v2/tag/loader') {
      return new Response(JSON.stringify(loadersFixture), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('Not Found', { status: 404, statusText: 'Not Found' });
  });
}

describe('E2E Acceptance — HttpModrinthClient + resolveCollection + serialize/deserialize', () => {
  it('resolves recorded collection YV97U1kk end-to-end into an Instance, validates schema, and round-trips JSON', async () => {
    const fetchMock = createFixtureFetchMock();
    const client = createModrinthClient({ fetchImpl: fetchMock });

    const { instance, skipped } = await resolveCollection(client, {
      collectionInput: 'https://modrinth.com/collection/YV97U1kk',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
      createdAt: '2026-10-23T10:00:00.000Z',
    });

    // 1. Metadata verification
    expect(instance.schemaVersion).toBe(1);
    expect(instance.meta).toEqual({
      name: 'Featured projects',
      source: {
        collectionId: 'YV97U1kk',
        url: 'https://modrinth.com/collection/YV97U1kk',
      },
      target: {
        gameVersion: '1.20.1',
        platform: 'fabric',
        releasePreference: 'stable',
      },
      createdAt: '2026-10-23T10:00:00.000Z',
    });

    // 2. Modpack (1KVo5zza Fabulously Optimized) is recorded in skippedProjects
    expect(skipped).toEqual([
      {
        id: '1KVo5zza',
        slug: 'fabulously-optimized',
        title: 'Fabulously Optimized',
        type: 'modpack',
        modrinthUrl: 'https://modrinth.com/modpack/fabulously-optimized',
        reason: MODPACK_SKIPPED_REASON,
      },
    ]);

    const entriesById = new Map(instance.entries.map((e) => [e.project.id, e]));

    // 3. Verify project classifications & resolutions across all types
    // Pure mods: AppleSkin (EsAfCjCV), Indium (Orvt0mRa), Common Network (HIuqnQpi)
    const appleSkin = entriesById.get('EsAfCjCV')!;
    expect(appleSkin.project.type).toBe('mod');
    expect(appleSkin.origin).toBe('collection');
    expect(appleSkin.environments.client.version?.id).toBe('N5XeV21r');
    expect(appleSkin.environments.server.version?.id).toBe('N5XeV21r');
    expect(appleSkin.environments.client.dependencies).toEqual(['P7dR8mSH']);

    const indium = entriesById.get('Orvt0mRa')!;
    expect(indium.project.type).toBe('mod');
    expect(indium.origin).toBe('collection');
    expect(indium.environments.client.version?.id).toBe('nQHYSjxO');
    expect(indium.environments.client.dependencies).toEqual(['AANobbMI']);
    expect(indium.environments.server.support).toBe('unsupported');
    expect(indium.environments.server.version).toBeNull();

    const commonNetwork = entriesById.get('HIuqnQpi')!;
    expect(commonNetwork.project.type).toBe('mod');
    expect(commonNetwork.environments.client.version?.id).toBe('dqeVoHmO');
    expect(commonNetwork.environments.server.version?.id).toBe('dqeVoHmO');

    // Hybrid mod+datapack: Terralith (8oi3bsk5) -> classified as 'mod', resolves Fabric .jar (WeYhEb5d)
    const terralith = entriesById.get('8oi3bsk5')!;
    expect(terralith.project.type).toBe('mod');
    expect(terralith.environments.client.version?.id).toBe('WeYhEb5d');
    expect(terralith.environments.server.version?.id).toBe('WeYhEb5d');
    expect(terralith.environments.server.version?.file.filename).toBe(
      'Terralith_1.20.x_v2.5.4.jar',
    );

    // Hybrid mod+plugin: WorldEdit (1u6JkXh5) -> classified as 'mod', support 'unknown'
    const worldEdit = entriesById.get('1u6JkXh5')!;
    expect(worldEdit.project.type).toBe('mod');
    expect(worldEdit.environments.client.support).toBe('unknown');
    expect(worldEdit.environments.client.version?.id).toBe('Wrlqaul6');
    expect(worldEdit.environments.server.version?.id).toBe('Wrlqaul6');

    // Pure plugin: EssentialsX (hXiIvTyT) -> classified as 'plugin'
    const essentialsX = entriesById.get('hXiIvTyT')!;
    expect(essentialsX.project.type).toBe('plugin');
    expect(essentialsX.environments.client.support).toBe('unsupported');
    expect(essentialsX.environments.server.support).toBe('required');
    // Target platform is 'fabric', so Paper/Spigot plugin has no compatible Fabric version
    expect(essentialsX.environments.server.version).toBeNull();
    expect(essentialsX.environments.server.resolution).toBe('none');

    // Pure datapack: BlazeandCave's Advancements Pack (VoVJ47kN) -> platform-agnostic 'datapack'
    const bacap = entriesById.get('VoVJ47kN')!;
    expect(bacap.project.type).toBe('datapack');
    expect(bacap.environments.client.version?.id).toBe('T3BLedpI');
    expect(bacap.environments.server.version?.id).toBe('T3BLedpI');

    // Resourcepack: Fresh Animations (50dA9Sha) -> platform-agnostic 'resourcepack'
    const freshAnimations = entriesById.get('50dA9Sha')!;
    expect(freshAnimations.project.type).toBe('resourcepack');
    expect(freshAnimations.environments.client.version?.id).toBe('aQjwvDfY');
    expect(freshAnimations.environments.server.support).toBe('unsupported');

    // Shader: Complementary Shaders - Unbound (R6NEzAwj) -> platform-agnostic 'shader'
    const complementary = entriesById.get('R6NEzAwj')!;
    expect(complementary.project.type).toBe('shader');
    expect(complementary.environments.client.version?.id).toBe('B1kyfoUZ');
    expect(complementary.environments.server.support).toBe('unsupported');

    // 4. Dependencies resolved into instance.entries with origin: 'dependency'
    const fabricApi = entriesById.get('P7dR8mSH')!;
    expect(fabricApi).toBeDefined();
    expect(fabricApi.origin).toBe('dependency');
    expect(fabricApi.project.type).toBe('mod');
    expect(fabricApi.environments.client.version?.id).toBe('rvI2dfzR');
    expect(fabricApi.environments.client.resolution).toBe('latest-compatible');
    expect(fabricApi.environments.client.requiredBy).toEqual(['EsAfCjCV']);
    expect(fabricApi.environments.client.selection).toEqual({ on: true, source: 'auto' });
    expect(fabricApi.environments.server.version?.id).toBe('rvI2dfzR');
    expect(fabricApi.environments.server.requiredBy).toEqual(['EsAfCjCV']);
    expect(fabricApi.environments.server.selection).toEqual({ on: true, source: 'auto' });

    // Pinned dependency: Sodium (AANobbMI) pinned to ygf8cVZg (0.5.11) by Indium (Orvt0mRa) in client
    const sodium = entriesById.get('AANobbMI')!;
    expect(sodium).toBeDefined();
    expect(sodium.origin).toBe('dependency');
    expect(sodium.project.type).toBe('mod');
    expect(sodium.environments.client.resolution).toBe('pinned');
    expect(sodium.environments.client.version?.id).toBe('ygf8cVZg');
    expect(sodium.environments.client.version?.versionNumber).toBe('mc1.20.1-0.5.11');
    expect(sodium.environments.client.requiredBy).toEqual(['Orvt0mRa']);
    expect(sodium.environments.client.selection).toEqual({ on: true, source: 'auto' });
    expect(sodium.environments.server.support).toBe('unsupported');
    expect(sodium.environments.server.selection).toEqual({ on: false, source: 'none' });

    // 5. Projections & Schema-validated serialization round-trip
    const tables = toTables(instance);
    expect(tables.map((t) => t.type)).toEqual([
      'mod',
      'plugin',
      'datapack',
      'resourcepack',
      'shader',
    ]);

    const fileTree = toFileTree(instance);
    expect(fileTree.client.files.length).toBeGreaterThan(0);
    expect(fileTree.server.files.length).toBeGreaterThan(0);

    const mrpack = toMrpack(instance, { platformVersion: '0.16.10' });
    expect(mrpack.dependencies).toEqual({
      minecraft: '1.20.1',
      'fabric-loader': '0.16.10',
    });

    const json = serialize(instance);
    const parsedUnknown: unknown = JSON.parse(json);
    const schemaCheck = validateInstanceSchema(parsedUnknown);
    expect(schemaCheck).toEqual({ valid: true, errors: [] });

    const roundTripped = deserialize(json);
    expect(roundTripped).toEqual(instance);
    expect(serialize(roundTripped)).toBe(json);
  });

  it('resolves plugin entries when target platform is paper and verifies createAppServices composition root', async () => {
    const fetchMock = createFixtureFetchMock();
    const appServices = createAppServices({
      modrinth: { fetchImpl: fetchMock },
      fetch: { fetchImpl: fetchMock },
    });

    expect(services.modrinthClient).toBeDefined();
    expect(services.fileFetcher).toBeDefined();
    expect(services.archiveWriter).toBeDefined();

    const { instance } = await resolveCollection(appServices.modrinthClient, {
      collectionInput: 'YV97U1kk',
      gameVersion: '1.20.1',
      platform: 'paper',
      releasePreference: 'stable',
      createdAt: '2026-10-23T10:00:00.000Z',
    });

    const essentialsX = instance.entries.find((e) => e.project.id === 'hXiIvTyT')!;
    expect(essentialsX.project.type).toBe('plugin');
    expect(essentialsX.environments.server.version?.id).toBe('puUfqBpY');
    expect(essentialsX.environments.server.version?.file.filename).toBe('EssentialsX-2.20.1.jar');
    expect(essentialsX.environments.server.selection).toEqual({ on: true, source: 'user' });
  });
});
