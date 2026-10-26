import { describe, expect, it, vi } from 'vitest';
import { defaultSleep } from '../../src/adapters/http-retry';
import {
  classifyProjectType,
  createModrinthClient,
  DATAPACK_LOADERS,
  HttpModrinthClient,
  MOD_LOADERS,
  ModrinthApiError,
  normalizeSupportValue,
  PLUGIN_LOADERS,
  type RawModrinthProject,
  type RawModrinthVersion,
} from '../../src/adapters/modrinth';
import { services } from '../../src/app/services';
import { resolveCollection, serialize, validateInstanceSchema } from '../../src/core';
import collectionFixture from '../fixtures/modrinth/collection.json';
import gameVersionsFixture from '../fixtures/modrinth/game-versions.json';
import loadersFixture from '../fixtures/modrinth/loaders.json';
import projectsFixture from '../fixtures/modrinth/projects.json';
import versionsFixture from '../fixtures/modrinth/versions.json';

function jsonResponse(
  data: unknown,
  init: ResponseInit = { status: 200, statusText: 'OK' },
): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

describe('classifyProjectType & normalizeSupportValue', () => {
  it('classifies all recorded fixture projects according to verified loader precedence rules', () => {
    const byId = new Map<string, RawModrinthProject>(
      (projectsFixture as RawModrinthProject[]).map((p) => [p.id, p]),
    );

    // Pure mod (Sodium: fabric, neoforge, quilt)
    expect(classifyProjectType(byId.get('AANobbMI')!)).toBe('mod');
    // Pure plugin (WorldGuard: bukkit, folia, paper, spigot)
    expect(classifyProjectType(byId.get('DKY9btbd')!)).toBe('plugin');
    // Pure plugin (EssentialsX: bukkit, paper, spigot)
    expect(classifyProjectType(byId.get('hXiIvTyT')!)).toBe('plugin');
    // Pure datapack (BlazeandCave's Advancements Pack: datapack)
    expect(classifyProjectType(byId.get('VoVJ47kN')!)).toBe('datapack');
    // Hybrid mod + datapack (Terralith: datapack, fabric, forge, neoforge, quilt) -> mod
    expect(classifyProjectType(byId.get('8oi3bsk5')!)).toBe('mod');
    // Hybrid mod + plugin (WorldEdit: bukkit, fabric, folia, forge, neoforge, paper, quilt, spigot) -> mod
    expect(classifyProjectType(byId.get('1u6JkXh5')!)).toBe('mod');
    // Resourcepack (Fresh Animations)
    expect(classifyProjectType(byId.get('50dA9Sha')!)).toBe('resourcepack');
    // Shader (Complementary Shaders - Unbound)
    expect(classifyProjectType(byId.get('R6NEzAwj')!)).toBe('shader');
    // Modpack (Fabulously Optimized)
    expect(classifyProjectType(byId.get('1KVo5zza')!)).toBe('modpack');
  });

  it('handles edge cases in classifyProjectType (plugin+datapack hybrid, empty loaders, unknown project_type)', () => {
    expect(
      classifyProjectType({
        project_type: 'mod',
        loaders: ['datapack', 'paper'],
      }),
    ).toBe('plugin');

    expect(
      classifyProjectType({
        project_type: 'mod',
        loaders: [],
      }),
    ).toBe('mod');

    expect(
      classifyProjectType({
        project_type: 'plugin',
        loaders: [],
      }),
    ).toBe('plugin');

    expect(
      classifyProjectType({
        project_type: 'datapack',
        loaders: [],
      }),
    ).toBe('datapack');

    expect(
      classifyProjectType({
        project_type: 'custom_future_type',
        loaders: ['fabric'],
      }),
    ).toBe('custom_future_type');

    expect(MOD_LOADERS.has('fabric')).toBe(true);
    expect(PLUGIN_LOADERS.has('paper')).toBe(true);
    expect(DATAPACK_LOADERS.has('datapack')).toBe(true);
  });

  it('maps client_side and server_side strings to Support values', () => {
    expect(normalizeSupportValue('required')).toBe('required');
    expect(normalizeSupportValue('OPTIONAL')).toBe('optional');
    expect(normalizeSupportValue(' unsupported ')).toBe('unsupported');
    expect(normalizeSupportValue('unknown')).toBe('unknown');
    expect(normalizeSupportValue('unrecognized')).toBe('unknown');
    expect(normalizeSupportValue(null)).toBe('unknown');
    expect(normalizeSupportValue(undefined)).toBe('unknown');
  });
});

describe('HttpModrinthClient — endpoints & fixture mapping', () => {
  it('getCollection fetches /v3/collection/{id} and maps collection metadata without custom User-Agent', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(collectionFixture));
    const client = createModrinthClient({ fetchImpl: fetchMock });

    const collection = await client.getCollection('YV97U1kk');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, calledInit] = fetchMock.mock.calls[0]!;
    expect(calledUrl).toBe('https://api.modrinth.com/v3/collection/YV97U1kk');
    expect(calledInit?.headers).toEqual({ Accept: 'application/json' });
    expect(calledInit?.headers).not.toHaveProperty('User-Agent');

    expect(collection).toEqual({
      id: 'YV97U1kk',
      name: 'Featured projects',
      description: 'All the projects that have been featured by Modrinth Staff.',
      iconUrl:
        'https://cdn.modrinth.com/data/YV97U1kk/3167dc610f9e6471dad147fd51f1c7900b4ba3a0_96.webp',
      userId: '2REoufqX',
      projectIds: [
        'EsAfCjCV',
        'Orvt0mRa',
        'HIuqnQpi',
        '8oi3bsk5',
        '1u6JkXh5',
        'hXiIvTyT',
        'VoVJ47kN',
        '50dA9Sha',
        'R6NEzAwj',
        '1KVo5zza',
      ],
    });
  });

  it('getProjects deduplicates IDs, skips network when empty, and maps ProjectInfo + metadata', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const ids = JSON.parse(url.searchParams.get('ids') ?? '[]') as string[];
      const matched = (projectsFixture as RawModrinthProject[]).filter((p) => ids.includes(p.id));
      return jsonResponse(matched);
    });

    const client = new HttpModrinthClient({ fetchImpl: fetchMock });

    // Empty input makes 0 network calls
    const emptyResult = await client.getProjects([]);
    expect(emptyResult).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    // Duplicate IDs are deduplicated and order is preserved
    const projects = await client.getProjects([
      'AANobbMI',
      'DKY9btbd',
      'AANobbMI',
      'VoVJ47kN',
      '8oi3bsk5',
      '1u6JkXh5',
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const requestedUrl = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(requestedUrl.pathname).toBe('/v2/projects');
    expect(JSON.parse(requestedUrl.searchParams.get('ids')!)).toEqual([
      'AANobbMI',
      'DKY9btbd',
      'VoVJ47kN',
      '8oi3bsk5',
      '1u6JkXh5',
    ]);

    expect(projects.map((p) => ({ id: p.id, type: p.type }))).toEqual([
      { id: 'AANobbMI', type: 'mod' },
      { id: 'DKY9btbd', type: 'plugin' },
      { id: 'VoVJ47kN', type: 'datapack' },
      { id: '8oi3bsk5', type: 'mod' },
      { id: '1u6JkXh5', type: 'mod' },
    ]);

    const sodium = projects[0]!;
    expect(sodium.title).toBe('Sodium');
    expect(sodium.slug).toBe('sodium');
    expect(sodium.support).toEqual({ client: 'required', server: 'unsupported' });
    expect(sodium.platforms).toEqual(['fabric', 'neoforge', 'quilt']);
    expect(sodium.modrinthUrl).toBe('https://modrinth.com/mod/sodium');

    const worldEdit = projects[4]!;
    expect(worldEdit.support).toEqual({ client: 'unknown', server: 'unknown' });
  });

  it('getProjectVersions includes or omits loaders parameter and maps files + dependencies', async () => {
    const indiumVersions = (versionsFixture as RawModrinthVersion[]).filter(
      (v) => v.project_id === 'Orvt0mRa',
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(indiumVersions))
      .mockResolvedValueOnce(jsonResponse(indiumVersions));

    const client = createModrinthClient({ fetchImpl: fetchMock });

    // 1. With gameVersion only (no platform -> omits loaders query param)
    const withoutPlatform = await client.getProjectVersions('Orvt0mRa', {
      gameVersion: '1.20.1',
    });

    const url1 = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url1.pathname).toBe('/v2/project/Orvt0mRa/version');
    expect(url1.searchParams.get('game_versions')).toBe('["1.20.1"]');
    expect(url1.searchParams.has('loaders')).toBe(false);

    expect(withoutPlatform).toHaveLength(1);
    const v = withoutPlatform[0]!;
    expect(v.id).toBe('nQHYSjxO');
    expect(v.projectId).toBe('Orvt0mRa');
    expect(v.versionNumber).toBe('1.0.36+mc1.20.1');
    expect(v.versionType).toBe('release');
    expect(v.gameVersions).toEqual(['1.20.1', '1.20.5', '1.20.6']);
    expect(v.platforms).toEqual(['fabric', 'quilt']);
    expect(v.file).toEqual({
      filename: 'indium-1.0.36+mc1.20.1.jar',
      url: 'https://cdn.modrinth.com/data/Orvt0mRa/versions/nQHYSjxO/indium-1.0.36%2Bmc1.20.1.jar',
      size: 105382,
      sha1: 'd824614e7a173d273167969f427702f51846aca7',
      sha512:
        '7c5a1851f1fc08ae69318e151d07151fabba6cda2a24616c9251e1a4e5b969453e88b97d60f926271d60e3511bfc6fa05a64a108466efb7f29bec4519547e0c9',
    });
    expect(v.files[0]?.sha1).toBe('d824614e7a173d273167969f427702f51846aca7');
    expect(v.files[0]?.sha512).toBe(
      '7c5a1851f1fc08ae69318e151d07151fabba6cda2a24616c9251e1a4e5b969453e88b97d60f926271d60e3511bfc6fa05a64a108466efb7f29bec4519547e0c9',
    );
    expect(v.dependencies).toEqual([
      {
        projectId: 'AANobbMI',
        versionId: 'ygf8cVZg',
        type: 'required',
      },
    ]);

    // 2. With platform specified -> includes loaders query param
    await client.getProjectVersions('Orvt0mRa', {
      gameVersion: '1.20.1',
      platform: 'Fabric',
    });

    const url2 = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(url2.searchParams.get('game_versions')).toBe('["1.20.1"]');
    expect(url2.searchParams.get('loaders')).toBe('["fabric"]');
  });

  it('filters out dependencies with null, undefined, or whitespace project_id so resolveCollection and serialize succeed', async () => {
    const rawCollection = {
      id: 'col-f03',
      name: 'Collection F-03',
      projects: ['proj-f03'],
    };
    const rawProjects: RawModrinthProject[] = [
      {
        id: 'proj-f03',
        slug: 'proj-f03',
        title: 'Project F-03',
        project_type: 'mod',
        loaders: ['fabric'],
        client_side: 'required',
        server_side: 'required',
      },
      {
        id: 'valid-dep',
        slug: 'valid-dep',
        title: 'Valid Dep',
        project_type: 'mod',
        loaders: ['fabric'],
        client_side: 'required',
        server_side: 'required',
      },
    ];
    const rawProjVersions: RawModrinthVersion[] = [
      {
        id: 'ver-f03',
        project_id: 'proj-f03',
        version_number: '1.0.0',
        version_type: 'release',
        date_published: '2025-01-01T00:00:00Z',
        game_versions: ['1.20.1'],
        loaders: ['fabric'],
        files: [
          {
            filename: 'proj-f03.jar',
            url: 'https://cdn.modrinth.com/proj-f03.jar',
            size: 100,
            primary: true,
            hashes: { sha1: 'aaa', sha512: 'bbb' },
          },
        ],
        dependencies: [
          {
            project_id: null,
            file_name: 'embedded.jar',
            dependency_type: 'embedded',
          },
          {
            project_id: undefined,
            dependency_type: 'optional',
          },
          {
            project_id: '   ',
            dependency_type: 'required',
          },
          {
            project_id: ' valid-dep ',
            dependency_type: 'required',
          },
        ],
      },
    ];
    const rawDepVersions: RawModrinthVersion[] = [
      {
        id: 'ver-dep',
        project_id: 'valid-dep',
        version_number: '1.0.0',
        version_type: 'release',
        date_published: '2025-01-01T00:00:00Z',
        game_versions: ['1.20.1'],
        loaders: ['fabric'],
        files: [
          {
            filename: 'valid-dep.jar',
            url: 'https://cdn.modrinth.com/valid-dep.jar',
            size: 200,
            primary: true,
            hashes: { sha1: 'ccc', sha512: 'ddd' },
          },
        ],
        dependencies: [],
      },
    ];

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      if (url.pathname === '/v3/collection/col-f03') {
        return jsonResponse(rawCollection);
      }
      if (url.pathname === '/v2/projects') {
        const ids = JSON.parse(url.searchParams.get('ids') ?? '[]') as string[];
        return jsonResponse(rawProjects.filter((p) => ids.includes(p.id)));
      }
      if (url.pathname === '/v2/project/proj-f03/version') {
        return jsonResponse(rawProjVersions);
      }
      if (url.pathname === '/v2/project/valid-dep/version') {
        return jsonResponse(rawDepVersions);
      }
      return new Response('Not Found', { status: 404 });
    });

    const client = createModrinthClient({ fetchImpl: fetchMock });
    const mappedVersions = await client.getProjectVersions('proj-f03', {
      gameVersion: '1.20.1',
      platform: 'fabric',
    });

    expect(mappedVersions[0]?.dependencies).toEqual([
      {
        projectId: 'valid-dep',
        type: 'required',
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-f03',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
      createdAt: '2026-10-23T12:00:00.000Z',
    });

    const json = serialize(instance);
    expect(validateInstanceSchema(JSON.parse(json))).toEqual({ valid: true, errors: [] });
  });

  it('falls back to files[0] when all files have primary: false, and prefers primary: undefined over primary: false', async () => {
    const rawVersions: RawModrinthVersion[] = [
      {
        id: 'ver-all-false',
        project_id: 'proj-f05',
        version_number: '1.0.0',
        version_type: 'release',
        date_published: '2025-01-01T00:00:00Z',
        game_versions: ['1.20.1'],
        loaders: ['fabric'],
        files: [
          {
            filename: 'BetterThirdPerson-Forge-1.16.4-1.5.0.jar',
            url: 'https://cdn.modrinth.com/BetterThirdPerson-Forge-1.16.4-1.5.0.jar',
            size: 123,
            primary: false,
            hashes: { sha1: '111', sha512: '222' },
          },
          {
            filename: 'javadoc.jar',
            url: 'https://cdn.modrinth.com/javadoc.jar',
            size: 456,
            primary: false,
            hashes: { sha1: '333', sha512: '444' },
          },
        ],
        dependencies: [],
      },
      {
        id: 'ver-undefined-primary',
        project_id: 'proj-f05',
        version_number: '1.0.1',
        version_type: 'release',
        date_published: '2025-01-02T00:00:00Z',
        game_versions: ['1.20.1'],
        loaders: ['fabric'],
        files: [
          {
            filename: 'secondary.jar',
            url: 'https://cdn.modrinth.com/secondary.jar',
            size: 100,
            primary: false,
            hashes: { sha1: '555', sha512: '666' },
          },
          {
            filename: 'fallback.jar',
            url: 'https://cdn.modrinth.com/fallback.jar',
            size: 200,
            primary: undefined,
            hashes: { sha1: '777', sha512: '888' },
          },
        ],
        dependencies: [],
      },
      {
        id: 'ver-empty-files',
        project_id: 'proj-f05',
        version_number: '1.0.2',
        version_type: 'release',
        date_published: '2025-01-03T00:00:00Z',
        game_versions: ['1.20.1'],
        loaders: ['fabric'],
        files: [],
        dependencies: [],
      },
    ];

    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(rawVersions));
    const client = createModrinthClient({ fetchImpl: fetchMock });

    const versions = await client.getProjectVersions('proj-f05', { gameVersion: '1.20.1' });

    expect(versions[0]?.file).toEqual({
      filename: 'BetterThirdPerson-Forge-1.16.4-1.5.0.jar',
      url: 'https://cdn.modrinth.com/BetterThirdPerson-Forge-1.16.4-1.5.0.jar',
      size: 123,
      sha1: '111',
      sha512: '222',
    });
    expect(versions[0]?.files.map((f) => f.primary)).toEqual([false, false]);

    expect(versions[1]?.file).toEqual({
      filename: 'fallback.jar',
      url: 'https://cdn.modrinth.com/fallback.jar',
      size: 200,
      sha1: '777',
      sha512: '888',
    });
    expect(versions[1]?.files.map((f) => f.primary)).toEqual([false, undefined]);

    expect(versions[2]?.file).toBeNull();
  });

  it('getVersionsByIds batches IDs and skips network when empty', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const ids = JSON.parse(url.searchParams.get('ids') ?? '[]') as string[];
      const matched = (versionsFixture as RawModrinthVersion[]).filter((v) => ids.includes(v.id));
      return jsonResponse(matched);
    });

    const client = createModrinthClient({ fetchImpl: fetchMock });

    expect(await client.getVersionsByIds([])).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    const versions = await client.getVersionsByIds(['ygf8cVZg', 'rvI2dfzR', 'ygf8cVZg']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(versions.map((v) => v.id)).toEqual(['ygf8cVZg', 'rvI2dfzR']);
  });

  it('getGameVersions and getPlatforms map tag endpoints', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(gameVersionsFixture))
      .mockResolvedValueOnce(jsonResponse(loadersFixture));

    const client = createModrinthClient({ fetchImpl: fetchMock });

    const gameVersions = await client.getGameVersions();
    expect(gameVersions[0]).toEqual({
      version: '1.21.4',
      versionType: 'release',
      date: '2024-12-03T10:12:57Z',
      major: false,
    });
    expect(gameVersions.find((gv) => gv.version === '1.20.1')?.major).toBe(true);

    const platforms = await client.getPlatforms();
    const fabric = platforms.find((p) => p.name === 'fabric');
    expect(fabric).toBeDefined();
    expect(fabric?.supportedProjectTypes).toEqual(['mod', 'project', 'modpack']);
    expect(fabric?.icon).toContain('<svg');
  });

  it('services.modrinthClient lazily delegates to globalThis.fetch spy installed after import', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(jsonResponse(collectionFixture));

    try {
      const collection = await services.modrinthClient.getCollection('YV97U1kk');
      expect(collection.id).toBe('YV97U1kk');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

describe('HttpModrinthClient — batching, concurrency, retry/backoff, and abort', () => {
  it('chunks > 100 IDs across multiple /v2/projects and /v2/versions requests', async () => {
    const projectBatchSizes: number[] = [];
    const versionBatchSizes: number[] = [];

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const url = new URL(String(input));
      const ids = JSON.parse(url.searchParams.get('ids') ?? '[]') as string[];
      if (url.pathname === '/v2/projects') {
        projectBatchSizes.push(ids.length);
        return jsonResponse(
          ids.map((id) => ({
            id,
            slug: `slug-${id}`,
            title: `Project ${id}`,
            project_type: 'mod',
            loaders: ['fabric'],
            client_side: 'required',
            server_side: 'required',
          })),
        );
      }
      versionBatchSizes.push(ids.length);
      return jsonResponse(
        ids.map((id) => ({
          id,
          project_id: `p-${id}`,
          name: id,
          version_number: '1.0.0',
          version_type: 'release',
          date_published: '2025-01-01T00:00:00Z',
          game_versions: ['1.20.1'],
          loaders: ['fabric'],
          files: [],
          dependencies: [],
        })),
      );
    });

    const client = createModrinthClient({ fetchImpl: fetchMock, batchSize: 100 });
    const ids250 = Array.from({ length: 250 }, (_, i) => `id-${i + 1}`);

    const projects = await client.getProjects(ids250);
    expect(projects).toHaveLength(250);
    expect(projectBatchSizes).toEqual([100, 100, 50]);

    const versions = await client.getVersionsByIds(ids250);
    expect(versions).toHaveLength(250);
    expect(versionBatchSizes).toEqual([100, 100, 50]);
  });

  it('enforces maxConcurrency (5) when 15 requests are fired in parallel', async () => {
    let inFlight = 0;
    let maxObservedInFlight = 0;
    const resolvers: Array<() => void> = [];

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(() => {
      inFlight += 1;
      maxObservedInFlight = Math.max(maxObservedInFlight, inFlight);

      return new Promise<Response>((resolve) => {
        resolvers.push(() => {
          inFlight -= 1;
          resolve(jsonResponse([]));
        });
      });
    });

    const client = createModrinthClient({ fetchImpl: fetchMock, maxConcurrency: 5 });

    const promises = Array.from({ length: 15 }, (_, i) =>
      client.getProjectVersions(`proj-${i}`, { gameVersion: '1.20.1' }),
    );

    await Promise.resolve();
    expect(inFlight).toBe(5);
    expect(maxObservedInFlight).toBe(5);

    while (resolvers.length > 0) {
      const nextBatch = resolvers.splice(0, resolvers.length);
      for (const finish of nextBatch) {
        finish();
      }
      await new Promise((r) => setTimeout(r, 0));
      expect(maxObservedInFlight).toBeLessThanOrEqual(5);
    }

    await Promise.all(promises);
    expect(fetchMock).toHaveBeenCalledTimes(15);
    expect(maxObservedInFlight).toBe(5);
  });

  it('retries 429 with Retry-After and X-Ratelimit-Reset headers and 503 with exponential backoff', async () => {
    const sleepDelays: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'Retry-After': '4' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
          headers: { 'X-Ratelimit-Reset': '2' },
        }),
      )
      .mockResolvedValueOnce(
        new Response('Service Unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'X-Ratelimit-Reset': '0' },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(collectionFixture));

    const client = createModrinthClient({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      baseDelayMs: 300,
      maxRetries: 3,
    });

    const result = await client.getCollection('YV97U1kk');
    expect(result.id).toBe('YV97U1kk');
    expect(fetchMock).toHaveBeenCalledTimes(4);
    // Attempt 0: Retry-After=4 -> 4000ms
    // Attempt 1: X-Ratelimit-Reset=2 -> 2000ms
    // Attempt 2: 503 (X-Ratelimit-Reset=0 ignored) -> 300 * 2^2 = 1200ms
    expect(sleepDelays).toEqual([4000, 2000, 1200]);
  });

  it('throws ModrinthApiError with status when 429 or 5xx retries are exhausted, and retries transient network errors', async () => {
    const sleepDelays: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const exhaustedFetchMock = vi.fn<typeof fetch>().mockImplementation(async () => {
      return new Response('Service Unavailable', {
        status: 503,
        statusText: 'Service Unavailable',
      });
    });

    const exhaustedClient = createModrinthClient({
      fetchImpl: exhaustedFetchMock,
      sleep: sleepMock,
      baseDelayMs: 100,
      maxRetries: 2,
    });

    await expect(exhaustedClient.getCollection('YV97U1kk')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ModrinthApiError &&
        err.status === 503 &&
        err.url === 'https://api.modrinth.com/v3/collection/YV97U1kk',
    );
    expect(exhaustedFetchMock).toHaveBeenCalledTimes(3);
    expect(sleepDelays).toEqual([100, 200]);

    // Transient network error (TypeError('Failed to fetch')) retries and recovers
    sleepDelays.length = 0;
    const networkFetchMock = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse(collectionFixture));

    const networkClient = createModrinthClient({
      fetchImpl: networkFetchMock,
      sleep: sleepMock,
      baseDelayMs: 250,
      maxRetries: 2,
    });

    const recovered = await networkClient.getCollection('YV97U1kk');
    expect(recovered.id).toBe('YV97U1kk');
    expect(networkFetchMock).toHaveBeenCalledTimes(2);
    expect(sleepDelays).toEqual([250]);
  });

  it('retries mid-body response.json() failures, wraps in ModrinthApiError when exhausted, and normalizes mid-body abort', async () => {
    const sleepDelays: number[] = [];
    const sleepMock = vi.fn(async (ms: number) => {
      sleepDelays.push(ms);
    });

    const brokenBodyResponse = () =>
      ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: () => Promise.reject(new SyntaxError('Unexpected end of JSON input')),
      }) as unknown as Response;

    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(brokenBodyResponse())
      .mockResolvedValueOnce(brokenBodyResponse());

    const client = createModrinthClient({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      baseDelayMs: 100,
      maxRetries: 1,
    });

    await expect(client.getCollection('YV97U1kk')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ModrinthApiError &&
        err.status === undefined &&
        err.url === 'https://api.modrinth.com/v3/collection/YV97U1kk' &&
        err.cause instanceof SyntaxError,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sleepDelays).toEqual([100]);

    // Mid-body abort is normalized to AbortError without retrying
    const abortController = new AbortController();
    const abortFetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => {
        abortController.abort(new DOMException('Aborted mid-body', 'AbortError'));
        throw new TypeError('Body stream interrupted');
      },
    } as unknown as Response);

    const abortClient = createModrinthClient({
      fetchImpl: abortFetchMock,
      sleep: sleepMock,
      maxRetries: 3,
    });

    await expect(
      abortClient.getCollection('YV97U1kk', { signal: abortController.signal }),
    ).rejects.toSatisfy((err: unknown) => err instanceof Error && err.name === 'AbortError');
    expect(abortFetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws ModrinthApiError immediately on non-retryable 404 without retrying', async () => {
    const sleepMock = vi.fn(async () => {});
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('Not Found', {
        status: 404,
        statusText: 'Not Found',
      }),
    );

    const client = createModrinthClient({
      fetchImpl: fetchMock,
      sleep: sleepMock,
      maxRetries: 3,
    });

    await expect(client.getCollection('nonexistent')).rejects.toSatisfy(
      (err: unknown) =>
        err instanceof ModrinthApiError &&
        err.status === 404 &&
        err.url === 'https://api.modrinth.com/v3/collection/nonexistent',
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sleepMock).not.toHaveBeenCalled();
  });

  it('honors AbortSignal when pre-aborted, queued in waitQueue for concurrency, or sleeping in retry backoff', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const client = createModrinthClient({ fetchImpl: fetchMock });

    const preAborted = new AbortController();
    preAborted.abort(new DOMException('Pre-aborted request', 'AbortError'));

    await expect(client.getCollection('YV97U1kk', { signal: preAborted.signal })).rejects.toThrow(
      'Pre-aborted request',
    );
    expect(fetchMock).not.toHaveBeenCalled();

    // Saturate maxConcurrency (1), queue a second request in waitQueue, abort it, and verify a third request still acquires the slot
    let releaseFirstRequest!: () => void;
    const queueFetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            releaseFirstRequest = () => resolve(jsonResponse(collectionFixture));
          }),
      )
      .mockImplementationOnce(async () => jsonResponse(collectionFixture));

    const singleSlotClient = createModrinthClient({
      fetchImpl: queueFetchMock,
      maxConcurrency: 1,
    });

    const req1Promise = singleSlotClient.getCollection('YV97U1kk');
    await Promise.resolve();
    expect(queueFetchMock).toHaveBeenCalledTimes(1);

    const queuedController = new AbortController();
    const req2Promise = singleSlotClient.getCollection('YV97U1kk', {
      signal: queuedController.signal,
    });
    const req3Promise = singleSlotClient.getCollection('YV97U1kk');

    queuedController.abort(new DOMException('Aborted while queued', 'AbortError'));
    await expect(req2Promise).rejects.toSatisfy(
      (err: unknown) => err instanceof Error && err.name === 'AbortError',
    );
    // Only req1 has called fetch so far
    expect(queueFetchMock).toHaveBeenCalledTimes(1);

    // Completing req1 releases the slot to req3
    releaseFirstRequest();
    const [res1, res3] = await Promise.all([req1Promise, req3Promise]);
    expect(res1.id).toBe('YV97U1kk');
    expect(res3.id).toBe('YV97U1kk');
    expect(queueFetchMock).toHaveBeenCalledTimes(2);

    // Test deterministic abort during retry backoff sleep
    const backoffController = new AbortController();
    fetchMock.mockResolvedValueOnce(
      new Response('Server Error', { status: 502, statusText: 'Bad Gateway' }),
    );
    const backoffClient = createModrinthClient({
      fetchImpl: fetchMock,
      baseDelayMs: 5000,
      maxRetries: 2,
      sleep: (ms, signal) => {
        const sleepPromise = defaultSleep(ms, signal);
        queueMicrotask(() => backoffController.abort());
        return sleepPromise;
      },
    });

    const backoffPromise = backoffClient.getCollection('YV97U1kk', {
      signal: backoffController.signal,
    });
    await expect(backoffPromise).rejects.toThrow(/aborted/i);
  });
});
