import { describe, expect, it } from 'vitest';
import {
  applyInitialSelection,
  changeEntryVersion,
  comparePublishedAtDesc,
  extractRequiredDependencyIds,
  filterUsableVersions,
  recomputeDependencyClosure,
  resolveCollection,
  resolveVersionForEnvironment,
  sortVersionsByPreference,
  toUsableVersionRef,
} from '../../src/core/resolver';
import { computeStatus } from '../../src/core/status';
import {
  MODPACK_SKIPPED_REASON,
  type InstanceTarget,
  type ProjectType,
  type ReleasePreference,
  type Support,
} from '../../src/core/model';
import type { VersionInfo } from '../../src/ports';
import { FakeModrinthClient, makeDefaultFileRef } from '../helpers/fake-modrinth-client';

function makeVersion(
  overrides: Partial<VersionInfo> & { id: string; projectId?: string },
): VersionInfo {
  const projectId = overrides.projectId ?? 'proj-a';
  const versionNumber = overrides.versionNumber ?? overrides.id;
  return {
    id: overrides.id,
    projectId,
    versionNumber,
    versionType: overrides.versionType ?? 'release',
    publishedAt: overrides.publishedAt ?? '2025-01-01T00:00:00Z',
    gameVersions: overrides.gameVersions ?? ['1.20.1'],
    platforms: overrides.platforms ?? ['fabric'],
    file:
      overrides.file === undefined ? makeDefaultFileRef(projectId, versionNumber) : overrides.file,
    ...(overrides.files ? { files: overrides.files } : {}),
    dependencies: overrides.dependencies ?? [],
  };
}

const DEFAULT_TARGET: InstanceTarget = {
  gameVersion: '1.20.1',
  platform: 'fabric',
  releasePreference: 'stable',
};

describe('resolver — usable version filtering & timestamp ordering', () => {
  it('filters out versions with null files or .mrpack primary files', () => {
    const valid = makeVersion({ id: 'v-valid' });
    const noFile = makeVersion({ id: 'v-no-file', file: null });
    const mrpackFile = makeVersion({
      id: 'v-mrpack',
      file: {
        ...makeDefaultFileRef('proj-a', '1.0.0'),
        filename: 'pack-1.0.0.MRPACK',
      },
    });
    const fromFilesArray = makeVersion({
      id: 'v-files-arr',
      file: null,
      files: [
        {
          ...makeDefaultFileRef('proj-a', '2.0.0'),
          primary: true,
        },
      ],
    });

    expect(toUsableVersionRef(valid)?.id).toBe('v-valid');
    expect(toUsableVersionRef(noFile)).toBeNull();
    expect(toUsableVersionRef(mrpackFile)).toBeNull();
    expect(toUsableVersionRef(fromFilesArray)?.id).toBe('v-files-arr');

    const usable = filterUsableVersions([valid, noFile, mrpackFile, fromFilesArray, valid]);
    expect(usable.map((v) => v.id)).toEqual(['v-valid', 'v-files-arr']);
  });

  it('orders versions strictly by publishedAt descending, never comparing version-number strings', () => {
    const olderWithHigherNumber = makeVersion({
      id: 'v-2.0.0',
      versionNumber: '2.0.0',
      publishedAt: '2024-01-01T00:00:00Z',
    });
    const newerWithLowerNumber = makeVersion({
      id: 'v-1.9.0-backport',
      versionNumber: '1.9.0',
      publishedAt: '2025-06-01T00:00:00Z',
    });

    const usable = filterUsableVersions([olderWithHigherNumber, newerWithLowerNumber]);
    const sorted = sortVersionsByPreference(usable, 'newest');
    expect(sorted.map((v) => v.id)).toEqual(['v-1.9.0-backport', 'v-2.0.0']);
    expect(comparePublishedAtDesc(olderWithHigherNumber, newerWithLowerNumber)).toBeGreaterThan(0);
  });

  it('extracts unique required dependency projectIds only', () => {
    const v = toUsableVersionRef(
      makeVersion({
        id: 'v1',
        dependencies: [
          { projectId: 'dep-req-1', type: 'required' },
          { projectId: 'dep-opt', type: 'optional' },
          { projectId: 'dep-inc', type: 'incompatible' },
          { projectId: 'dep-emb', type: 'embedded' },
          { projectId: 'dep-req-1', type: 'required' },
          { projectId: 'dep-req-2', type: 'required' },
        ],
      }),
    );
    expect(extractRequiredDependencyIds(v)).toEqual(['dep-req-1', 'dep-req-2']);
    expect(extractRequiredDependencyIds(null)).toEqual([]);
  });
});

describe('resolver — resolveVersionForEnvironment (table-driven)', () => {
  interface ResolutionCase {
    name: string;
    projectType: ProjectType;
    support: Support;
    releasePreference: ReleasePreference;
    versions: VersionInfo[];
    pinnedVersionIds?: string[];
    expectedVersionId: string | null;
    expectedResolution: 'pinned' | 'latest-compatible' | 'game-version-fallback' | 'none';
    expectedPinConflict: boolean;
    expectedCandidateIds: string[];
  }

  const vReleaseOld = makeVersion({
    id: 'v-rel-old',
    versionNumber: '1.0.0',
    versionType: 'release',
    publishedAt: '2024-01-01T00:00:00Z',
    gameVersions: ['1.20.1'],
    platforms: ['fabric'],
  });
  const vReleaseNew = makeVersion({
    id: 'v-rel-new',
    versionNumber: '1.1.0',
    versionType: 'release',
    publishedAt: '2024-06-01T00:00:00Z',
    gameVersions: ['1.20.1'],
    platforms: ['fabric'],
  });
  const vBetaNewer = makeVersion({
    id: 'v-beta-newest',
    versionNumber: '2.0.0-beta.1',
    versionType: 'beta',
    publishedAt: '2025-01-01T00:00:00Z',
    gameVersions: ['1.20.1'],
    platforms: ['fabric'],
  });
  const vAlphaOnly = makeVersion({
    id: 'v-alpha-only',
    versionNumber: '0.1.0-alpha',
    versionType: 'alpha',
    publishedAt: '2024-03-01T00:00:00Z',
    gameVersions: ['1.20.1'],
    platforms: ['fabric'],
  });
  const vFallbackOld = makeVersion({
    id: 'v-fallback-old',
    versionNumber: '1.0.0-fb',
    versionType: 'release',
    publishedAt: '2024-02-01T00:00:00Z',
    gameVersions: ['1.20.1'],
    platforms: [],
  });
  const vFallbackNew = makeVersion({
    id: 'v-fallback-new',
    versionNumber: '1.2.0-fb',
    versionType: 'beta',
    publishedAt: '2024-09-01T00:00:00Z',
    gameVersions: ['1.20.1'],
    platforms: [],
  });
  const vForgeOnly = makeVersion({
    id: 'v-forge-only',
    versionNumber: '1.5.0-forge',
    versionType: 'release',
    publishedAt: '2025-02-01T00:00:00Z',
    gameVersions: ['1.20.1'],
    platforms: ['forge'],
  });
  const vOtherMc = makeVersion({
    id: 'v-mc-1.21',
    versionNumber: '3.0.0',
    versionType: 'release',
    publishedAt: '2025-03-01T00:00:00Z',
    gameVersions: ['1.21.1'],
    platforms: ['fabric'],
  });

  const cases: ResolutionCase[] = [
    {
      name: 'Rule 0: unsupported environment always returns null version and empty candidates',
      projectType: 'mod',
      support: 'unsupported',
      releasePreference: 'stable',
      versions: [vReleaseNew, vBetaNewer],
      expectedVersionId: null,
      expectedResolution: 'none',
      expectedPinConflict: false,
      expectedCandidateIds: [],
    },
    {
      name: 'Rule 1 (Pinned): compatible pin wins over newer release and beta',
      projectType: 'mod',
      support: 'required',
      releasePreference: 'stable',
      versions: [vReleaseOld, vReleaseNew, vBetaNewer],
      pinnedVersionIds: ['v-rel-old'],
      expectedVersionId: 'v-rel-old',
      expectedResolution: 'pinned',
      expectedPinConflict: false,
      expectedCandidateIds: ['v-rel-new', 'v-rel-old', 'v-beta-newest'],
    },
    {
      name: 'Rule 1 (Pin conflict): multiple compatible pins pick greatest publishedAt and flag pinConflict',
      projectType: 'mod',
      support: 'required',
      releasePreference: 'stable',
      versions: [vReleaseOld, vReleaseNew, vBetaNewer],
      pinnedVersionIds: ['v-rel-old', 'v-rel-new'],
      expectedVersionId: 'v-rel-new',
      expectedResolution: 'pinned',
      expectedPinConflict: true,
      expectedCandidateIds: ['v-rel-new', 'v-rel-old', 'v-beta-newest'],
    },
    {
      name: 'Rule 1 -> Rule 2: incompatible pin (wrong platform or MC version) falls back to latest-compatible',
      projectType: 'mod',
      support: 'required',
      releasePreference: 'stable',
      versions: [vReleaseOld, vReleaseNew, vForgeOnly, vOtherMc],
      pinnedVersionIds: ['v-forge-only', 'v-mc-1.21'],
      expectedVersionId: 'v-rel-new',
      expectedResolution: 'latest-compatible',
      expectedPinConflict: false,
      expectedCandidateIds: ['v-rel-new', 'v-rel-old'],
    },
    {
      name: 'Rule 2 (stable): prefers newest release over newer beta',
      projectType: 'mod',
      support: 'required',
      releasePreference: 'stable',
      versions: [vReleaseOld, vReleaseNew, vBetaNewer, vFallbackNew],
      expectedVersionId: 'v-rel-new',
      expectedResolution: 'latest-compatible',
      expectedPinConflict: false,
      expectedCandidateIds: ['v-rel-new', 'v-rel-old', 'v-beta-newest', 'v-fallback-new'],
    },
    {
      name: 'Rule 2 (stable fallback to pre-release): picks newest beta/alpha when no release exists',
      projectType: 'mod',
      support: 'required',
      releasePreference: 'stable',
      versions: [vAlphaOnly, vBetaNewer],
      expectedVersionId: 'v-beta-newest',
      expectedResolution: 'latest-compatible',
      expectedPinConflict: false,
      expectedCandidateIds: ['v-beta-newest', 'v-alpha-only'],
    },
    {
      name: 'Rule 2 (newest): picks version with greatest publishedAt regardless of versionType',
      projectType: 'mod',
      support: 'required',
      releasePreference: 'newest',
      versions: [vReleaseOld, vReleaseNew, vBetaNewer],
      expectedVersionId: 'v-beta-newest',
      expectedResolution: 'latest-compatible',
      expectedPinConflict: false,
      expectedCandidateIds: ['v-beta-newest', 'v-rel-new', 'v-rel-old'],
    },
    {
      name: 'Rule 2 (platform-agnostic): resourcepack/shader/datapack ignore platform tags',
      projectType: 'shader',
      support: 'optional',
      releasePreference: 'stable',
      versions: [vForgeOnly],
      expectedVersionId: 'v-forge-only',
      expectedResolution: 'latest-compatible',
      expectedPinConflict: false,
      expectedCandidateIds: ['v-forge-only'],
    },
    {
      name: 'Rule 3 (game-version-fallback): uses version with empty platforms array when no platform match exists',
      projectType: 'mod',
      support: 'required',
      releasePreference: 'stable',
      versions: [vFallbackOld, vFallbackNew, vForgeOnly],
      expectedVersionId: 'v-fallback-new',
      expectedResolution: 'game-version-fallback',
      expectedPinConflict: false,
      expectedCandidateIds: ['v-fallback-new', 'v-fallback-old'],
    },
    {
      name: 'Rule 3 non-fallback: versions for gameVersion that declare OTHER platforms do NOT trigger fallback',
      projectType: 'mod',
      support: 'required',
      releasePreference: 'stable',
      versions: [vForgeOnly, vOtherMc],
      expectedVersionId: null,
      expectedResolution: 'none',
      expectedPinConflict: false,
      expectedCandidateIds: [],
    },
  ];

  it.each(cases)('$name', (tc) => {
    const res = resolveVersionForEnvironment({
      projectType: tc.projectType,
      support: tc.support,
      versions: tc.versions,
      target: {
        ...DEFAULT_TARGET,
        releasePreference: tc.releasePreference,
      },
      pinnedVersionIds: tc.pinnedVersionIds,
    });

    expect(res.version?.id ?? null).toBe(tc.expectedVersionId);
    expect(res.resolution).toBe(tc.expectedResolution);
    expect(res.pinConflict).toBe(tc.expectedPinConflict);
    expect(res.candidates.map((c) => c.id)).toEqual(tc.expectedCandidateIds);
  });
});

describe('resolver — resolveCollection & dependency closure', () => {
  it('computes transitive required dependency closure and ignores optional/incompatible/embedded', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-1', ['mod-a'], 'My Collection');

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'dep-b', title: 'Dep B', type: 'mod' },
      { id: 'dep-c', title: 'Dep C', type: 'mod' },
      { id: 'dep-opt', title: 'Dep Optional', type: 'mod' },
      { id: 'dep-inc', title: 'Dep Incompatible', type: 'mod' },
      { id: 'dep-emb', title: 'Dep Embedded', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va-1',
        projectId: 'mod-a',
        dependencies: [
          { projectId: 'dep-b', type: 'required' },
          { projectId: 'dep-opt', type: 'optional' },
          { projectId: 'dep-inc', type: 'incompatible' },
          { projectId: 'dep-emb', type: 'embedded' },
        ],
      },
      {
        id: 'vb-1',
        projectId: 'dep-b',
        dependencies: [{ projectId: 'dep-c', type: 'required' }],
      },
      {
        id: 'vc-1',
        projectId: 'dep-c',
        dependencies: [],
      },
      { id: 'vopt-1', projectId: 'dep-opt' },
      { id: 'vinc-1', projectId: 'dep-inc' },
      { id: 'vemb-1', projectId: 'dep-emb' },
    ]);

    const { instance, skipped } = await resolveCollection(client, {
      collectionInput: 'col-1',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
      createdAt: '2025-01-01T00:00:00.000Z',
    });

    expect(skipped).toEqual([]);
    expect(instance.entries.map((e) => `${e.project.id}:${e.origin}`)).toEqual([
      'mod-a:collection',
      'dep-b:dependency',
      'dep-c:dependency',
    ]);

    const modA = instance.entries.find((e) => e.project.id === 'mod-a')!;
    const depB = instance.entries.find((e) => e.project.id === 'dep-b')!;
    const depC = instance.entries.find((e) => e.project.id === 'dep-c')!;

    expect(modA.environments.client.selection).toEqual({ on: true, source: 'user' });
    expect(depB.environments.client.selection).toEqual({ on: true, source: 'auto' });
    expect(depC.environments.client.selection).toEqual({ on: true, source: 'auto' });

    expect(depB.environments.client.requiredBy).toEqual(['mod-a']);
    expect(depC.environments.client.requiredBy).toEqual(['dep-b']);
  });

  it('handles cyclic dependencies (2-cycle, 3-cycle, self-dependency, diamond) without infinite loops', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-cycles', ['mod-a']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'dep-b', title: 'Dep B', type: 'mod' },
      { id: 'dep-c', title: 'Dep C', type: 'mod' },
      { id: 'dep-d', title: 'Dep D', type: 'mod' },
    ]);

    // Diamond + 3-cycle + self-loop:
    // A -> B, C, A (self)
    // B -> D, A (2-cycle)
    // C -> D
    // D -> A (3-cycle)
    client.addVersions([
      {
        id: 'va',
        projectId: 'mod-a',
        dependencies: [
          { projectId: 'mod-a', type: 'required' },
          { projectId: 'dep-b', type: 'required' },
          { projectId: 'dep-c', type: 'required' },
        ],
      },
      {
        id: 'vb',
        projectId: 'dep-b',
        dependencies: [
          { projectId: 'dep-d', type: 'required' },
          { projectId: 'mod-a', type: 'required' },
        ],
      },
      {
        id: 'vc',
        projectId: 'dep-c',
        dependencies: [{ projectId: 'dep-d', type: 'required' }],
      },
      {
        id: 'vd',
        projectId: 'dep-d',
        dependencies: [{ projectId: 'mod-a', type: 'required' }],
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-cycles',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    expect(instance.entries.map((e) => e.project.id)).toEqual(['mod-a', 'dep-b', 'dep-c', 'dep-d']);

    const depD = instance.entries.find((e) => e.project.id === 'dep-d')!;
    expect(depD.environments.client.requiredBy).toEqual(['dep-b', 'dep-c']);
  });

  it('preserves origin: "collection" when a collection project is also a required dependency', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-both', ['mod-a', 'fabric-api']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'fabric-api', title: 'Fabric API', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va',
        projectId: 'mod-a',
        dependencies: [{ projectId: 'fabric-api', type: 'required' }],
      },
      {
        id: 'vfapi',
        projectId: 'fabric-api',
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-both',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    expect(instance.entries).toHaveLength(2);
    const fapi = instance.entries.find((e) => e.project.id === 'fabric-api')!;
    expect(fapi.origin).toBe('collection');
    expect(fapi.environments.client.selection).toEqual({ on: true, source: 'user' });
    expect(fapi.environments.client.requiredBy).toEqual(['mod-a']);
  });

  it('resolves client and server environments independently (support, pins, and dependency selection)', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-env', ['client-mod', 'server-mod']);

    client.addProjects([
      {
        id: 'client-mod',
        title: 'Client Mod',
        type: 'mod',
        support: { client: 'required', server: 'unsupported' },
      },
      {
        id: 'server-mod',
        title: 'Server Mod',
        type: 'mod',
        support: { client: 'unsupported', server: 'required' },
      },
      {
        id: 'client-only-lib',
        title: 'Client Only Lib',
        type: 'mod',
        support: { client: 'required', server: 'required' },
      },
      {
        id: 'shared-lib',
        title: 'Shared Lib',
        type: 'mod',
        support: { client: 'required', server: 'required' },
      },
    ]);

    client.addVersions([
      {
        id: 'v-client-mod',
        projectId: 'client-mod',
        dependencies: [
          { projectId: 'client-only-lib', type: 'required' },
          { projectId: 'shared-lib', versionId: 'v-shared-old', type: 'required' },
        ],
      },
      {
        id: 'v-server-mod',
        projectId: 'server-mod',
        dependencies: [{ projectId: 'shared-lib', versionId: 'v-shared-new', type: 'required' }],
      },
      {
        id: 'v-client-lib',
        projectId: 'client-only-lib',
      },
      {
        id: 'v-shared-old',
        projectId: 'shared-lib',
        versionNumber: '1.0.0',
        publishedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'v-shared-new',
        projectId: 'shared-lib',
        versionNumber: '2.0.0',
        publishedAt: '2025-01-01T00:00:00Z',
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-env',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    const clientMod = instance.entries.find((e) => e.project.id === 'client-mod')!;
    const serverMod = instance.entries.find((e) => e.project.id === 'server-mod')!;
    const clientOnlyLib = instance.entries.find((e) => e.project.id === 'client-only-lib')!;
    const sharedLib = instance.entries.find((e) => e.project.id === 'shared-lib')!;

    // Client Mod is selected on client, unsupported/unselected on server
    expect(clientMod.environments.client.selection).toEqual({ on: true, source: 'user' });
    expect(clientMod.environments.server.version).toBeNull();
    expect(clientMod.environments.server.selection).toEqual({ on: false, source: 'none' });

    // Server Mod is unsupported on client, selected on server
    expect(serverMod.environments.client.version).toBeNull();
    expect(serverMod.environments.client.selection).toEqual({ on: false, source: 'none' });
    expect(serverMod.environments.server.selection).toEqual({ on: true, source: 'user' });

    // client-only-lib is required on client (auto-selected), NOT required on server (unselected even though selectable!)
    expect(clientOnlyLib.environments.client.requiredBy).toEqual(['client-mod']);
    expect(clientOnlyLib.environments.client.selection).toEqual({ on: true, source: 'auto' });
    expect(clientOnlyLib.environments.server.version?.id).toBe('v-client-lib');
    expect(clientOnlyLib.environments.server.requiredBy).toEqual([]);
    expect(clientOnlyLib.environments.server.selection).toEqual({ on: false, source: 'none' });

    // shared-lib is pinned to v-shared-old on client and v-shared-new on server
    expect(sharedLib.environments.client.version?.id).toBe('v-shared-old');
    expect(sharedLib.environments.client.resolution).toBe('pinned');
    expect(sharedLib.environments.server.version?.id).toBe('v-shared-new');
    expect(sharedLib.environments.server.resolution).toBe('pinned');
  });

  it('resolves pinned conflicts in an environment and surfaces PIN_CONFLICT in computeStatus', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-pins', ['mod-a', 'mod-b']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'mod-b', title: 'Mod B', type: 'mod' },
      { id: 'dep-lib', title: 'Dep Lib', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va',
        projectId: 'mod-a',
        dependencies: [{ projectId: 'dep-lib', versionId: 'v-lib-1', type: 'required' }],
      },
      {
        id: 'vb',
        projectId: 'mod-b',
        dependencies: [{ projectId: 'dep-lib', versionId: 'v-lib-2', type: 'required' }],
      },
      {
        id: 'v-lib-1',
        projectId: 'dep-lib',
        versionNumber: '1.0.0',
        publishedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'v-lib-2',
        projectId: 'dep-lib',
        versionNumber: '1.5.0',
        publishedAt: '2024-06-01T00:00:00Z',
      },
      {
        id: 'v-lib-3',
        projectId: 'dep-lib',
        versionNumber: '2.0.0',
        publishedAt: '2025-01-01T00:00:00Z',
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-pins',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    const depLib = instance.entries.find((e) => e.project.id === 'dep-lib')!;
    expect(depLib.environments.client.version?.id).toBe('v-lib-2');
    expect(depLib.environments.client.resolution).toBe('pinned');

    const statusMap = computeStatus(instance);
    expect(statusMap.get('dep-lib')?.client.reasons).toContain('PIN_CONFLICT');
    expect(statusMap.get('dep-lib')?.client.kind).toBe('warning');
  });

  it('recomputes dependency closure on version override (changeEntryVersion) and reports auto-select/deselect changes', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-override', ['mod-a']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'dep-old', title: 'Dep Old', type: 'mod' },
      { id: 'dep-new', title: 'Dep New', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va-new',
        projectId: 'mod-a',
        versionNumber: '2.0.0',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-old', type: 'required' }],
      },
      {
        id: 'va-older',
        projectId: 'mod-a',
        versionNumber: '1.0.0',
        publishedAt: '2024-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-new', type: 'required' }],
      },
      {
        id: 'v-dep-old',
        projectId: 'dep-old',
      },
      {
        id: 'v-dep-new',
        projectId: 'dep-new',
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-override',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    // Initially va-new is chosen in both environments, requiring dep-old
    expect(instance.entries.map((e) => e.project.id)).toEqual(['mod-a', 'dep-old']);

    // Now user overrides mod-a in client to va-older, which requires dep-new instead of dep-old
    const result = await changeEntryVersion(instance, client, {
      projectId: 'mod-a',
      env: 'client',
      versionId: 'va-older',
    });

    const updatedModA = result.instance.entries.find((e) => e.project.id === 'mod-a')!;
    const updatedDepOld = result.instance.entries.find((e) => e.project.id === 'dep-old')!;
    const updatedDepNew = result.instance.entries.find((e) => e.project.id === 'dep-new')!;

    expect(updatedModA.environments.client.version?.id).toBe('va-older');
    expect(updatedModA.environments.client.resolution).toBe('user');
    // Server environment remains on va-new
    expect(updatedModA.environments.server.version?.id).toBe('va-new');

    // dep-old was auto-deselected on client, still auto-selected on server
    expect(updatedDepOld.environments.client.selection).toEqual({ on: false, source: 'auto' });
    expect(updatedDepOld.environments.client.requiredBy).toEqual([]);
    expect(updatedDepOld.environments.server.selection).toEqual({ on: true, source: 'auto' });

    // dep-new was fetched and auto-selected on client, unselected on server
    expect(updatedDepNew.environments.client.selection).toEqual({ on: true, source: 'auto' });
    expect(updatedDepNew.environments.client.requiredBy).toEqual(['mod-a']);
    expect(updatedDepNew.environments.server.selection).toEqual({ on: false, source: 'none' });

    expect(result.changes).toEqual([
      { projectId: 'dep-old', env: 'client', on: false, reason: 'auto-deselected' },
      { projectId: 'dep-new', env: 'client', on: true, reason: 'auto-selected' },
    ]);
  });

  it('does not auto-select a dependency that the user explicitly turned off (off/user) during version recompute', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-user-off', ['mod-a']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'dep-shared', title: 'Dep Shared', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va-1',
        projectId: 'mod-a',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-shared', type: 'required' }],
      },
      {
        id: 'va-2',
        projectId: 'mod-a',
        publishedAt: '2024-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-shared', type: 'required' }],
      },
      {
        id: 'v-dep',
        projectId: 'dep-shared',
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-user-off',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    // Simulate user explicitly deselecting dep-shared on client
    const depEntry = instance.entries.find((e) => e.project.id === 'dep-shared')!;
    depEntry.environments.client.selection = { on: false, source: 'user' };

    const recomputed = recomputeDependencyClosure(instance, {
      projectId: 'mod-a',
      env: 'client',
      versionId: 'va-2',
    });

    const afterDep = recomputed.instance.entries.find((e) => e.project.id === 'dep-shared')!;
    expect(afterDep.environments.client.selection).toEqual({ on: false, source: 'user' });
    expect(recomputed.changes).toEqual([]);

    // And applyInitialSelection resets it back to auto-selected
    const resetEntries = applyInitialSelection(recomputed.instance.entries);
    const resetDep = resetEntries.find((e) => e.project.id === 'dep-shared')!;
    expect(resetDep.environments.client.selection).toEqual({ on: true, source: 'auto' });
  });

  it('converges on fixed-point closure in recomputeDependencyClosure for late pin discovery and reverts dropped pins (Finding #4)', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-diamond-pin', ['mod-a', 'mod-b']);

    // Diamond graph:
    // mod-a -> dep-x (unpinned)
    // mod-b (v-b1: no deps; v-b2: requires dep-y)
    // dep-y -> dep-x (pinned to v-x1)
    // dep-x (v-x2 newest: no deps; v-x1 older: requires dep-z)
    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'mod-b', title: 'Mod B', type: 'mod' },
      { id: 'dep-y', title: 'Dep Y', type: 'mod' },
      { id: 'dep-x', title: 'Dep X', type: 'mod' },
      { id: 'dep-z', title: 'Dep Z', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'v-a1',
        projectId: 'mod-a',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-x', type: 'required' }],
      },
      {
        id: 'v-b1-latest',
        projectId: 'mod-b',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [],
      },
      {
        id: 'v-b2-older',
        projectId: 'mod-b',
        publishedAt: '2024-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-y', type: 'required' }],
      },
      {
        id: 'v-y1',
        projectId: 'dep-y',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-x', versionId: 'v-x1-pinned', type: 'required' }],
      },
      {
        id: 'v-x2-latest',
        projectId: 'dep-x',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [],
      },
      {
        id: 'v-x1-pinned',
        projectId: 'dep-x',
        publishedAt: '2024-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-z', type: 'required' }],
      },
      {
        id: 'v-z1',
        projectId: 'dep-z',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [],
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-diamond-pin',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    // Initially dep-x resolves to v-x2-latest (latest-compatible), dep-y and dep-z are not in closure
    const initialX = instance.entries.find((e) => e.project.id === 'dep-x')!;
    expect(initialX.environments.client.version?.id).toBe('v-x2-latest');
    expect(initialX.environments.client.resolution).toBe('latest-compatible');

    // Switch mod-b on client to v-b2-older -> requires dep-y -> pins dep-x to v-x1-pinned -> requires dep-z
    const afterPin = await changeEntryVersion(instance, client, {
      projectId: 'mod-b',
      env: 'client',
      versionId: 'v-b2-older',
    });

    const pinnedX = afterPin.instance.entries.find((e) => e.project.id === 'dep-x')!;
    const depZ = afterPin.instance.entries.find((e) => e.project.id === 'dep-z')!;
    expect(pinnedX.environments.client.version?.id).toBe('v-x1-pinned');
    expect(pinnedX.environments.client.resolution).toBe('pinned');
    expect(pinnedX.environments.client.dependencies).toEqual(['dep-z']);
    expect(depZ.environments.client.requiredBy).toEqual(['dep-x']);
    expect(depZ.environments.client.selection).toEqual({ on: true, source: 'auto' });

    // Now switch mod-b back to v-b1-latest -> pin on dep-x is dropped -> dep-x reverts to v-x2-latest (latest-compatible)
    // and dep-z is auto-deselected!
    const afterUnpin = recomputeDependencyClosure(afterPin.instance, {
      projectId: 'mod-b',
      env: 'client',
      versionId: 'v-b1-latest',
    });

    const unpinnedX = afterUnpin.instance.entries.find((e) => e.project.id === 'dep-x')!;
    const afterZ = afterUnpin.instance.entries.find((e) => e.project.id === 'dep-z')!;
    expect(unpinnedX.environments.client.version?.id).toBe('v-x2-latest');
    expect(unpinnedX.environments.client.resolution).toBe('latest-compatible');
    expect(unpinnedX.environments.client.dependencies).toEqual([]);
    expect(afterZ.environments.client.requiredBy).toEqual([]);
    expect(afterZ.environments.client.selection).toEqual({ on: false, source: 'auto' });
  });

  it('discovers transitive dependencies behind already-known entries on version switch and does not fetch dependencies of unchosen versions (Finding #5, #18)', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-known-dep-switch', ['mod-a']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'dep-b', title: 'Dep B', type: 'mod' },
      { id: 'dep-c', title: 'Dep C', type: 'mod' },
      { id: 'dep-new', title: 'Dep New', type: 'mod' },
      { id: 'dep-historical-unused', title: 'Dep Historical Unused', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va-latest',
        projectId: 'mod-a',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-b', type: 'required' }],
      },
      {
        id: 'va-older',
        projectId: 'mod-a',
        publishedAt: '2024-01-01T00:00:00Z',
        dependencies: [
          { projectId: 'dep-b', versionId: 'vb-old-pinned', type: 'required' },
          { projectId: 'dep-new', type: 'required' },
        ],
      },
      {
        id: 'vb-latest',
        projectId: 'dep-b',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [],
      },
      {
        id: 'vb-old-pinned',
        projectId: 'dep-b',
        publishedAt: '2024-01-01T00:00:00Z',
        // Excluded from getProjectVersions by using an additional gameVersion or normal candidate list;
        // when dep-b switches to vb-old-pinned, it newly requires dep-c!
        dependencies: [{ projectId: 'dep-c', type: 'required' }],
      },
      {
        id: 'vc-1',
        projectId: 'dep-c',
        publishedAt: '2025-01-01T00:00:00Z',
      },
      {
        id: 'v-new-latest',
        projectId: 'dep-new',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [],
      },
      {
        id: 'v-new-historical',
        projectId: 'dep-new',
        publishedAt: '2023-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-historical-unused', type: 'required' }],
      },
      {
        id: 'v-unused',
        projectId: 'dep-historical-unused',
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-known-dep-switch',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    // Initially only mod-a and dep-b are in instance.entries
    expect(instance.entries.map((e) => e.project.id)).toEqual(['mod-a', 'dep-b']);
    client.resetCalls();

    // Override mod-a to va-older:
    // - dep-b switches from vb-latest to vb-old-pinned, which requires brand-new dep-c
    // - dep-new is fetched and resolves to v-new-latest (so v-new-historical's dep-historical-unused must NOT be fetched)
    const result = await changeEntryVersion(instance, client, {
      projectId: 'mod-a',
      env: 'client',
      versionId: 'va-older',
    });

    const entryIds = result.instance.entries.map((e) => e.project.id);
    expect(entryIds).toContain('dep-c');
    expect(entryIds).toContain('dep-new');
    expect(entryIds).not.toContain('dep-historical-unused');

    const fetchedProjectArgIds = client.calls.getProjects.flatMap((c) => c.ids);
    expect(fetchedProjectArgIds).toContain('dep-c');
    expect(fetchedProjectArgIds).toContain('dep-new');
    expect(fetchedProjectArgIds).not.toContain('dep-historical-unused');
  });

  it('creates placeholder entries for missing dependency projects and records skipped modpack/unknown projects (Finding #10, #12, #18)', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-missing-and-skipped', [
      'mod-a',
      'col-modpack',
      'col-unknown-type',
      'col-not-found',
    ]);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'col-modpack', title: 'Some Modpack', type: 'modpack' },
      { id: 'col-unknown-type', title: 'Some Plugin Pack', type: 'datapack-plus' },
      { id: 'dep-modpack', title: 'Dep Modpack', type: 'modpack' },
    ]);

    client.addVersions([
      {
        id: 'va-1',
        projectId: 'mod-a',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [
          { projectId: 'missing-dep-1', type: 'required' },
          { projectId: 'dep-modpack', type: 'required' },
        ],
      },
      {
        id: 'va-2',
        projectId: 'mod-a',
        publishedAt: '2024-01-01T00:00:00Z',
        dependencies: [{ projectId: 'missing-dep-2', type: 'required' }],
      },
    ]);

    const { instance, skipped } = await resolveCollection(client, {
      collectionInput: 'col-missing-and-skipped',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    expect(skipped).toEqual([
      {
        id: 'col-modpack',
        slug: 'col-modpack',
        title: 'Some Modpack',
        type: 'modpack',
        modrinthUrl: 'https://modrinth.com/modpack/col-modpack',
        reason: MODPACK_SKIPPED_REASON,
      },
      {
        id: 'col-unknown-type',
        slug: 'col-unknown-type',
        title: 'Some Plugin Pack',
        type: 'datapack-plus',
        modrinthUrl: 'https://modrinth.com/project/col-unknown-type',
        reason: 'Unsupported project type: datapack-plus',
      },
      {
        id: 'col-not-found',
        title: 'col-not-found',
        type: 'unknown',
        reason: 'Project not found on Modrinth',
      },
      {
        id: 'dep-modpack',
        slug: 'dep-modpack',
        title: 'Dep Modpack',
        type: 'modpack',
        modrinthUrl: 'https://modrinth.com/modpack/dep-modpack',
        reason: MODPACK_SKIPPED_REASON,
      },
    ]);

    // missing-dep-1 has a placeholder entry in instance.entries with version: null and requiredBy: ['mod-a']
    const missingDep1 = instance.entries.find((e) => e.project.id === 'missing-dep-1')!;
    expect(missingDep1).toBeDefined();
    expect(missingDep1.origin).toBe('dependency');
    expect(missingDep1.environments.client.version).toBeNull();
    expect(missingDep1.environments.client.requiredBy).toEqual(['mod-a']);

    const status1 = computeStatus(instance);
    expect(status1.get('mod-a')?.client.reasons).toContain('DEPENDENCY_UNAVAILABLE');
    expect(status1.get('missing-dep-1')?.client.reasons).toContain('NEEDED_BUT_UNAVAILABLE');

    // Switching mod-a to va-2 via changeEntryVersion also creates a placeholder entry for missing-dep-2
    const afterOverride = await changeEntryVersion(instance, client, {
      projectId: 'mod-a',
      env: 'client',
      versionId: 'va-2',
    });
    const missingDep2 = afterOverride.instance.entries.find(
      (e) => e.project.id === 'missing-dep-2',
    )!;
    expect(missingDep2).toBeDefined();
    expect(missingDep2.origin).toBe('dependency');
    expect(missingDep2.environments.client.version).toBeNull();
    expect(missingDep2.environments.client.requiredBy).toEqual(['mod-a']);

    const status2 = computeStatus(afterOverride.instance);
    expect(status2.get('mod-a')?.client.reasons).toContain('DEPENDENCY_UNAVAILABLE');
    expect(status2.get('missing-dep-2')?.client.reasons).toContain('NEEDED_BUT_UNAVAILABLE');
  });

  it('never applies Rule 1 (pinned) to collection entries (origin === "collection") even when required with a versionId pin (Finding #14)', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-no-pin', ['mod-a', 'mod-b']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'mod-b', title: 'Mod B', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va-1',
        projectId: 'mod-a',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [{ projectId: 'mod-b', versionId: 'vb-old', type: 'required' }],
      },
      {
        id: 'va-2',
        projectId: 'mod-a',
        publishedAt: '2024-01-01T00:00:00Z',
        dependencies: [{ projectId: 'mod-b', versionId: 'vb-old', type: 'required' }],
      },
      {
        id: 'vb-old',
        projectId: 'mod-b',
        publishedAt: '2024-01-01T00:00:00Z',
      },
      {
        id: 'vb-latest',
        projectId: 'mod-b',
        publishedAt: '2025-01-01T00:00:00Z',
      },
    ]);

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-no-pin',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    const modB = instance.entries.find((e) => e.project.id === 'mod-b')!;
    expect(modB.origin).toBe('collection');
    expect(modB.environments.client.version?.id).toBe('vb-latest');
    expect(modB.environments.client.resolution).toBe('latest-compatible');
    expect(modB.environments.client.requiredBy).toEqual(['mod-a']);

    // Also verify recomputeDependencyClosure preserves Rule 2 for collection entries
    const recomputed = recomputeDependencyClosure(instance, {
      projectId: 'mod-a',
      env: 'client',
      versionId: 'va-2',
    });
    const modBAfter = recomputed.instance.entries.find((e) => e.project.id === 'mod-b')!;
    expect(modBAfter.environments.client.version?.id).toBe('vb-latest');
    expect(modBAfter.environments.client.resolution).toBe('latest-compatible');
  });

  it('fetches out-of-band pinned versions via getVersionsByIds in resolveCollection and changeEntryVersion (Finding #18)', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-pin-by-id', ['mod-a']);

    client.addProjects([
      { id: 'mod-a', title: 'Mod A', type: 'mod' },
      { id: 'dep-lib', title: 'Dep Lib', type: 'mod' },
    ]);

    client.addVersions([
      {
        id: 'va-1',
        projectId: 'mod-a',
        publishedAt: '2025-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-lib', versionId: 'v-lib-pinned-1', type: 'required' }],
      },
      {
        id: 'va-2',
        projectId: 'mod-a',
        publishedAt: '2024-01-01T00:00:00Z',
        dependencies: [{ projectId: 'dep-lib', versionId: 'v-lib-pinned-2', type: 'required' }],
      },
      {
        id: 'v-lib-latest',
        projectId: 'dep-lib',
        publishedAt: '2025-01-01T00:00:00Z',
      },
    ]);

    // Register out-of-band versions that are only returned by getVersionsByIds (not in getProjectVersions('dep-lib'))
    const origGetVersionsByIds = client.getVersionsByIds.bind(client);
    client.getVersionsByIds = async (ids, opts) => {
      const base = await origGetVersionsByIds(ids, opts);
      const extra: VersionInfo[] = [];
      if (ids.includes('v-lib-pinned-1')) {
        extra.push(
          makeVersion({
            id: 'v-lib-pinned-1',
            projectId: 'dep-lib',
            publishedAt: '2024-02-01T00:00:00Z',
          }),
        );
      }
      if (ids.includes('v-lib-pinned-2')) {
        extra.push(
          makeVersion({
            id: 'v-lib-pinned-2',
            projectId: 'dep-lib',
            publishedAt: '2024-03-01T00:00:00Z',
          }),
        );
      }
      return [...base, ...extra];
    };

    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-pin-by-id',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    const depLib = instance.entries.find((e) => e.project.id === 'dep-lib')!;
    expect(depLib.environments.client.version?.id).toBe('v-lib-pinned-1');
    expect(depLib.environments.client.resolution).toBe('pinned');

    const updated = await changeEntryVersion(instance, client, {
      projectId: 'mod-a',
      env: 'client',
      versionId: 'va-2',
    });
    const depLibAfter = updated.instance.entries.find((e) => e.project.id === 'dep-lib')!;
    expect(depLibAfter.environments.client.version?.id).toBe('v-lib-pinned-2');
    expect(depLibAfter.environments.client.resolution).toBe('pinned');
  });

  it('rejects immediately when passed a pre-aborted AbortSignal in resolveCollection and changeEntryVersion (Finding #15)', async () => {
    const client = new FakeModrinthClient();
    client.setCollection('col-abort', ['mod-a']);
    client.addProjects([{ id: 'mod-a', title: 'Mod A', type: 'mod' }]);
    client.addVersions([
      { id: 'va-1', projectId: 'mod-a', publishedAt: '2025-01-01T00:00:00Z' },
      { id: 'va-2', projectId: 'mod-a', publishedAt: '2024-01-01T00:00:00Z' },
    ]);

    const abortController = new AbortController();
    abortController.abort(new DOMException('Cancelled by test', 'AbortError'));

    const progressEvents: string[] = [];
    await expect(
      resolveCollection(client, {
        collectionInput: 'col-abort',
        gameVersion: '1.20.1',
        platform: 'fabric',
        releasePreference: 'stable',
        signal: abortController.signal,
        onProgress: (p) => progressEvents.push(p.phase),
      }),
    ).rejects.toThrow('Cancelled by test');
    expect(progressEvents).toEqual([]);
    expect(client.calls.getCollection).toHaveLength(0);

    // Resolve normally first, then call changeEntryVersion with a pre-aborted signal on a cached candidate
    const { instance } = await resolveCollection(client, {
      collectionInput: 'col-abort',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });

    await expect(
      changeEntryVersion(instance, client, {
        projectId: 'mod-a',
        env: 'client',
        versionId: 'va-2',
        signal: abortController.signal,
      }),
    ).rejects.toThrow('Cancelled by test');
  });
});
