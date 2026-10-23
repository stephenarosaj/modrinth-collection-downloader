import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import JSZip from 'jszip';
import { describe, expect, it, vi } from 'vitest';
import { createArchiveWriter } from '../../src/adapters';
import {
  deserialize,
  getMrpackWarnings,
  resolveCollection,
  serialize,
  toFileTree,
  toMrpack,
  type MrpackIndex,
} from '../../src/core';
import type { FileFetcher, ModrinthClient, RequestOptions } from '../../src/ports';
import { App } from '../../src/ui/App';
import { triggerBlobDownload } from '../../src/ui/download';
import { FakeModrinthClient } from '../helpers/fake-modrinth-client';

function encodePayload(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

function buildM4FakeClient(): FakeModrinthClient {
  const client = new FakeModrinthClient({
    gameVersions: [
      { version: '1.21.1', versionType: 'release', date: '2024-08-08T00:00:00Z', major: false },
      { version: '1.20.1', versionType: 'release', date: '2023-06-12T00:00:00Z', major: true },
    ],
    platforms: [
      { name: 'fabric', supportedProjectTypes: ['mod'] },
      { name: 'neoforge', supportedProjectTypes: ['mod'] },
      { name: 'paper', supportedProjectTypes: ['plugin'] },
    ],
  });

  client.setCollection(
    'col-m4',
    [
      'mod-sodium',
      'mod-sodium-clone',
      'mod-lithium',
      'plugin-luckperms',
      'dp-terralith',
      'rp-faithful',
      'shader-complementary',
      'modpack-fabulously',
    ],
    'M4 Outputs Suite',
  );

  client.addProjects([
    {
      id: 'mod-sodium',
      slug: 'sodium',
      title: 'Sodium!',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/sodium',
      support: { client: 'required', server: 'unsupported' },
    },
    // Intentional filename collision with Sodium! on Client (`Sodium-Fabric-1.20.1-0.5.8.jar` -> `-2.jar`)
    {
      id: 'mod-sodium-clone',
      slug: 'sodium-clone',
      title: 'Sodium?',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/sodium-clone',
      support: { client: 'optional', server: 'unsupported' },
    },
    {
      id: 'mod-lithium',
      slug: 'lithium',
      title: 'Lithium',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/lithium',
      support: { client: 'optional', server: 'required' },
    },
    {
      id: 'dep-fabric-api',
      slug: 'fabric-api',
      title: 'Fabric API',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/fabric-api',
      support: { client: 'required', server: 'required' },
    },
    {
      id: 'plugin-luckperms',
      slug: 'luckperms',
      title: 'LuckPerms',
      type: 'plugin',
      modrinthUrl: 'https://modrinth.com/plugin/luckperms',
      support: { client: 'unsupported', server: 'required' },
    },
    {
      id: 'dp-terralith',
      slug: 'terralith',
      title: 'Terralith',
      type: 'datapack',
      modrinthUrl: 'https://modrinth.com/datapack/terralith',
      support: { client: 'optional', server: 'required' },
    },
    {
      id: 'rp-faithful',
      slug: 'faithful-32x',
      title: 'Faithful 32x',
      type: 'resourcepack',
      modrinthUrl: 'https://modrinth.com/resourcepack/faithful-32x',
      support: { client: 'required', server: 'unsupported' },
    },
    {
      id: 'shader-complementary',
      slug: 'complementary-reimagined',
      title: 'Complementary Reimagined',
      type: 'shader',
      modrinthUrl: 'https://modrinth.com/shader/complementary-reimagined',
      support: { client: 'optional', server: 'unsupported' },
    },
    {
      id: 'modpack-fabulously',
      slug: 'fabulously-optimized',
      title: 'Fabulously Optimized',
      type: 'modpack',
      modrinthUrl: 'https://modrinth.com/modpack/fabulously-optimized',
      support: { client: 'required', server: 'optional' },
    },
  ]);

  client.addVersions([
    {
      id: 'v-sodium-1',
      projectId: 'mod-sodium',
      versionNumber: '0.5.8',
      versionType: 'release',
      publishedAt: '2024-05-10T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-fabric-api', type: 'required' }],
      file: {
        filename: 'sodium-fabric-0.5.8.jar',
        url: 'https://cdn.modrinth.com/data/mod-sodium/versions/v-sodium-1/sodium-fabric-0.5.8.jar',
        size: 1024,
        sha1: 'a'.repeat(40),
        sha512: 'b'.repeat(128),
      },
    },
    {
      id: 'v-sodium-old',
      projectId: 'mod-sodium',
      versionNumber: '0.5.7',
      versionType: 'release',
      publishedAt: '2024-04-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-fabric-api', type: 'required' }],
      file: {
        filename: 'sodium-fabric-0.5.7.jar',
        url: 'https://cdn.modrinth.com/data/mod-sodium/versions/v-sodium-old/sodium-fabric-0.5.7.jar',
        size: 1000,
        sha1: 'c'.repeat(40),
        sha512: 'd'.repeat(128),
      },
    },
    {
      id: 'v-sodium-clone-1',
      projectId: 'mod-sodium-clone',
      versionNumber: '0.5.8',
      versionType: 'release',
      publishedAt: '2024-05-09T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      file: {
        filename: 'sodium-clone-0.5.8.jar',
        url: 'https://cdn.modrinth.com/data/mod-sodium-clone/versions/v-sodium-clone-1/sodium-clone-0.5.8.jar',
        size: 2048,
        sha1: '1'.repeat(40),
        sha512: '2'.repeat(128),
      },
    },
    {
      id: 'v-lithium-1',
      projectId: 'mod-lithium',
      versionNumber: '0.11.2',
      versionType: 'release',
      publishedAt: '2024-05-08T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-fabric-api', type: 'required' }],
      file: {
        filename: 'lithium-fabric-0.11.2.jar',
        url: 'https://cdn.modrinth.com/data/mod-lithium/versions/v-lithium-1/lithium-fabric-0.11.2.jar',
        size: 3072,
        sha1: '3'.repeat(40),
        sha512: '4'.repeat(128),
      },
    },
    {
      id: 'v-lithium-old',
      projectId: 'mod-lithium',
      versionNumber: '0.11.1',
      versionType: 'release',
      publishedAt: '2024-03-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-fabric-api', type: 'required' }],
      file: {
        filename: 'lithium-fabric-0.11.1.jar',
        url: 'https://cdn.modrinth.com/data/mod-lithium/versions/v-lithium-old/lithium-fabric-0.11.1.jar',
        size: 3000,
        sha1: '5'.repeat(40),
        sha512: '6'.repeat(128),
      },
    },
    {
      id: 'v-fapi-1',
      projectId: 'dep-fabric-api',
      versionNumber: '0.92.0+1.20.1',
      versionType: 'release',
      publishedAt: '2024-05-07T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      file: {
        filename: 'fabric-api-0.92.0.jar',
        url: 'https://cdn.modrinth.com/data/dep-fabric-api/versions/v-fapi-1/fabric-api-0.92.0.jar',
        size: 4096,
        sha1: '7'.repeat(40),
        sha512: '8'.repeat(128),
      },
    },
    {
      id: 'v-luckperms-1',
      projectId: 'plugin-luckperms',
      versionNumber: '5.4.102',
      versionType: 'release',
      publishedAt: '2024-05-06T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      file: {
        filename: 'LuckPerms-Fabric-5.4.102.jar',
        url: 'https://cdn.modrinth.com/data/plugin-luckperms/versions/v-luckperms-1/LuckPerms-Fabric-5.4.102.jar',
        size: 5120,
        sha1: '9'.repeat(40),
        sha512: '0'.repeat(128),
      },
    },
    {
      id: 'v-terralith-1',
      projectId: 'dp-terralith',
      versionNumber: '2.5.4',
      versionType: 'release',
      publishedAt: '2024-05-05T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['datapack'],
      file: {
        filename: 'Terralith_1.20_v2.5.4.zip',
        url: 'https://cdn.modrinth.com/data/dp-terralith/versions/v-terralith-1/Terralith_1.20_v2.5.4.zip',
        size: 6144,
        sha1: 'e'.repeat(40),
        sha512: 'f'.repeat(128),
      },
    },
    {
      id: 'v-faithful-1',
      projectId: 'rp-faithful',
      versionNumber: 'r4',
      versionType: 'release',
      publishedAt: '2024-05-04T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['minecraft'],
      file: {
        filename: 'Faithful-32x-1.20.1.zip',
        url: 'https://cdn.modrinth.com/data/rp-faithful/versions/v-faithful-1/Faithful-32x-1.20.1.zip',
        size: 7168,
        sha1: 'a1'.repeat(20),
        sha512: 'b2'.repeat(64),
      },
    },
    {
      id: 'v-complementary-1',
      projectId: 'shader-complementary',
      versionNumber: '5.1.1',
      versionType: 'release',
      publishedAt: '2024-05-03T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['iris'],
      file: {
        filename: 'ComplementaryReimagined_r5.1.1.zip',
        url: 'https://cdn.modrinth.com/data/shader-complementary/versions/v-complementary-1/ComplementaryReimagined_r5.1.1.zip',
        size: 8192,
        sha1: 'c3'.repeat(20),
        sha512: 'd4'.repeat(64),
      },
    },
  ]);

  return client;
}

describe('M4 Outputs — client.zip, server.zip, instance.json offline import, and .mrpack export', () => {
  it('gates client.zip and server.zip exports by environment toggles and produces zip archives matching toFileTree(instance) 100% across all folders and collision suffixes (§7.3.1, §8.1)', async () => {
    const client = buildM4FakeClient();
    const archiveWriter = createArchiveWriter();
    const fetchedUrls: string[] = [];

    const fileFetcher: FileFetcher = {
      fetchBinary: vi.fn(async (url: string) => {
        fetchedUrls.push(url);
        return encodePayload(`binary-for:${url}`);
      }),
    };

    const exportedBlobs: Array<{ filename: string; blob: Blob }> = [];

    render(
      <App
        modrinthClient={client}
        fileFetcher={fileFetcher}
        archiveWriter={archiveWriter}
        onExportBlob={(filename, blob) => {
          exportedBlobs.push({ filename, blob });
        }}
      />,
    );

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-m4' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'fabric' },
    });
    fireEvent.click(loadButton);

    await screen.findByRole('heading', { name: 'M4 Outputs Suite' });

    const exportClientBtn = screen.getByRole('button', { name: 'Export client.zip' });
    const exportServerBtn = screen.getByRole('button', { name: 'Export server.zip' });

    // Both environment toggles are off initially -> both zip buttons are disabled (§7.3.1)
    expect(exportClientBtn).toBeDisabled();
    expect(exportServerBtn).toBeDisabled();
    expect(exportClientBtn).toHaveTextContent('(7)');
    expect(exportServerBtn).toHaveTextContent('(4)');

    // Compute authoritative core toFileTree expectation
    const expectedResolved = await resolveCollection(client, {
      collectionInput: 'col-m4',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });
    const expectedTrees = toFileTree(expectedResolved.instance);

    // Enable Client environment only -> Export client.zip becomes enabled, Export server.zip stays disabled
    fireEvent.click(screen.getByLabelText('Client environment'));
    expect(exportClientBtn).not.toBeDisabled();
    expect(exportServerBtn).toBeDisabled();

    // Export client.zip
    fireEvent.click(exportClientBtn);

    await waitFor(() => {
      expect(exportedBlobs).toHaveLength(1);
    });

    expect(exportedBlobs[0]!.filename).toBe('col-m4-client.zip');
    const clientZip = await JSZip.loadAsync(await exportedBlobs[0]!.blob.arrayBuffer());
    const clientZipPaths = Object.keys(clientZip.files)
      .filter((p) => !clientZip.files[p]!.dir)
      .sort();

    expect(clientZipPaths).toEqual(expectedTrees.client.files.map((f) => f.path).sort());
    // Verify collision suffixing (-2) and per-type folders on Client
    expect(clientZipPaths).toEqual([
      'datapacks/Terralith-1.20.1-2.5.4.zip',
      'mods/FabricAPI-Fabric-1.20.1-0.92.0+1.20.1.jar',
      'mods/Lithium-Fabric-1.20.1-0.11.2.jar',
      'mods/Sodium-Fabric-1.20.1-0.5.8-2.jar',
      'mods/Sodium-Fabric-1.20.1-0.5.8.jar',
      'resourcepacks/Faithful32x-1.20.1-r4.zip',
      'shaderpacks/ComplementaryReimagined-1.20.1-5.1.1.zip',
    ]);

    for (const entry of expectedTrees.client.files) {
      const zipEntry = clientZip.file(entry.path);
      expect(zipEntry).toBeTruthy();
      const bytes = await zipEntry!.async('uint8array');
      expect(Array.from(bytes)).toEqual(Array.from(encodePayload(`binary-for:${entry.file.url}`)));
    }

    // Enable Server environment -> Export server.zip becomes enabled
    fireEvent.click(screen.getByLabelText('Server environment'));
    expect(exportServerBtn).not.toBeDisabled();

    fireEvent.click(exportServerBtn);

    await waitFor(() => {
      expect(exportedBlobs).toHaveLength(2);
    });

    expect(exportedBlobs[1]!.filename).toBe('col-m4-server.zip');
    const serverZip = await JSZip.loadAsync(await exportedBlobs[1]!.blob.arrayBuffer());
    const serverZipPaths = Object.keys(serverZip.files)
      .filter((p) => !serverZip.files[p]!.dir)
      .sort();

    expect(serverZipPaths).toEqual(expectedTrees.server.files.map((f) => f.path).sort());
    expect(serverZipPaths).toEqual([
      'datapacks/Terralith-1.20.1-2.5.4.zip',
      'mods/FabricAPI-Fabric-1.20.1-0.92.0+1.20.1.jar',
      'mods/Lithium-Fabric-1.20.1-0.11.2.jar',
      'plugins/LuckPerms-Fabric-1.20.1-5.4.102.jar',
    ]);

    for (const entry of expectedTrees.server.files) {
      const zipEntry = serverZip.file(entry.path);
      expect(zipEntry).toBeTruthy();
      const bytes = await zipEntry!.async('uint8array');
      expect(Array.from(bytes)).toEqual(Array.from(encodePayload(`binary-for:${entry.file.url}`)));
    }
  });

  it('reports partial download failures while packaging remaining successful files, handles total failure without creating a zip, and supports cancelling in-flight zip exports (§7.6, §13 M4)', async () => {
    const client = buildM4FakeClient();
    const archiveWriter = createArchiveWriter();

    // 1. Partial failure on Server (1 of 4 fails -> 3 packaged into col-m4-server.zip + visible alert)
    const partialFetcher: FileFetcher = {
      fetchBinary: vi.fn(async (url: string) => {
        if (url.includes('LuckPerms')) {
          throw new Error('CDN 503 Service Unavailable for LuckPerms');
        }
        return encodePayload(`ok:${url}`);
      }),
    };

    const exportedBlobs: Array<{ filename: string; blob: Blob }> = [];

    const view = render(
      <App
        modrinthClient={client}
        fileFetcher={partialFetcher}
        archiveWriter={archiveWriter}
        onExportBlob={(filename, blob) => {
          exportedBlobs.push({ filename, blob });
        }}
      />,
    );

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-m4' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.click(loadButton);
    await screen.findByRole('heading', { name: 'M4 Outputs Suite' });

    fireEvent.click(screen.getByLabelText('Server environment'));
    fireEvent.click(screen.getByRole('button', { name: 'Export server.zip' }));

    const partialAlert = await screen.findByRole('alert');
    expect(partialAlert).toHaveTextContent(
      'Packaged 3 of 4 files into col-m4-server.zip. 1 download failed:',
    );
    expect(partialAlert).toHaveTextContent('LuckPerms-Fabric-1.20.1-5.4.102.jar');
    expect(partialAlert).toHaveTextContent('CDN 503 Service Unavailable for LuckPerms');

    expect(exportedBlobs).toHaveLength(1);
    expect(exportedBlobs[0]!.filename).toBe('col-m4-server.zip');
    const partialZip = await JSZip.loadAsync(await exportedBlobs[0]!.blob.arrayBuffer());
    const partialZipPaths = Object.keys(partialZip.files)
      .filter((p) => !partialZip.files[p]!.dir)
      .sort();
    expect(partialZipPaths).toEqual([
      'datapacks/Terralith-1.20.1-2.5.4.zip',
      'mods/FabricAPI-Fabric-1.20.1-0.92.0+1.20.1.jar',
      'mods/Lithium-Fabric-1.20.1-0.11.2.jar',
    ]);

    view.unmount();

    // 2. Total failure (all downloads fail -> alert shown, no zip blob exported)
    const allFailFetcher: FileFetcher = {
      fetchBinary: vi.fn(async () => {
        throw new Error('Network offline');
      }),
    };
    const totalFailBlobs: Array<{ filename: string; blob: Blob }> = [];

    const view2 = render(
      <App
        modrinthClient={client}
        fileFetcher={allFailFetcher}
        archiveWriter={archiveWriter}
        onExportBlob={(filename, blob) => {
          totalFailBlobs.push({ filename, blob });
        }}
      />,
    );

    const loadButton2 = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton2).not.toBeDisabled();
    });
    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-m4' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.click(loadButton2);
    await screen.findByRole('heading', { name: 'M4 Outputs Suite' });

    fireEvent.click(screen.getByLabelText('Server environment'));
    fireEvent.click(screen.getByRole('button', { name: 'Export server.zip' }));

    const allFailAlert = await screen.findByRole('alert');
    expect(allFailAlert).toHaveTextContent(
      'No zip was created for col-m4-server.zip because all 4 downloads failed:',
    );
    expect(totalFailBlobs).toHaveLength(0);

    view2.unmount();

    // 3. Cancellation while downloads are in flight
    const observedSignals: AbortSignal[] = [];
    const cancelBlobs: Array<{ filename: string; blob: Blob }> = [];
    const hangingFetcher: FileFetcher = {
      fetchBinary: vi.fn((_url: string, opts?: RequestOptions) => {
        if (opts?.signal) {
          observedSignals.push(opts.signal);
        }
        return new Promise<Uint8Array>((_resolve, reject) => {
          opts?.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        });
      }),
    };

    render(
      <App
        modrinthClient={client}
        fileFetcher={hangingFetcher}
        archiveWriter={archiveWriter}
        onExportBlob={(filename, blob) => {
          cancelBlobs.push({ filename, blob });
        }}
      />,
    );

    const loadButton3 = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton3).not.toBeDisabled();
    });
    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-m4' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.click(loadButton3);
    await screen.findByRole('heading', { name: 'M4 Outputs Suite' });

    fireEvent.click(screen.getByLabelText('Server environment'));
    fireEvent.click(screen.getByRole('button', { name: 'Export server.zip' }));

    // Progress bar and Cancel export button appear while downloading
    expect(await screen.findByRole('progressbar', { name: 'Zip export progress' })).toBeInTheDocument();
    const cancelExportBtn = screen.getByRole('button', { name: 'Cancel export' });
    fireEvent.click(cancelExportBtn);

    expect(observedSignals.length).toBeGreaterThan(0);
    expect(observedSignals[0]?.aborted).toBe(true);
    expect(screen.queryByRole('button', { name: 'Cancel export' })).not.toBeInTheDocument();
    expect(cancelBlobs).toHaveLength(0);
  });

  it('restores full review state from instance.json offline with zero ModrinthClient calls, round-trips losslessly on re-export, and rejects invalid/future schemas with role="alert" (§8.2, §13 M4)', async () => {
    const client = buildM4FakeClient();
    const exportedJsonPayloads: Array<{ filename: string; json: string }> = [];

    const firstView = render(
      <App
        modrinthClient={client}
        onExportJson={(filename, json) => {
          exportedJsonPayloads.push({ filename, json });
        }}
      />,
    );

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-m4' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'fabric' },
    });
    fireEvent.click(loadButton);

    await screen.findByRole('heading', { name: 'M4 Outputs Suite' });

    // Customize selection and version override before exporting instance.json:
    // - Turn on Client, deselect Sodium?, override Sodium! version to 0.5.7
    fireEvent.click(screen.getByLabelText('Client environment'));
    fireEvent.click(screen.getByLabelText('Select Sodium? for Client'));
    fireEvent.change(screen.getByLabelText('Sodium! Client version'), {
      target: { value: 'v-sodium-old' },
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Sodium! Client version') as HTMLSelectElement).value,
      ).toBe('v-sodium-old');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Export instance.json' }));
    expect(exportedJsonPayloads).toHaveLength(1);
    const exportedJson = exportedJsonPayloads[0]!.json;

    firstView.unmount();

    // Now render a fresh <App /> with a spy ModrinthClient to verify 0 API calls when importing and switching versions offline
    const zeroNetworkClient: ModrinthClient = {
      getCollection: vi.fn(),
      getProjects: vi.fn(),
      getProjectVersions: vi.fn(),
      getVersionsByIds: vi.fn(),
      getGameVersions: vi.fn(async () => []),
      getPlatforms: vi.fn(async () => []),
    };

    const reExportedJsonPayloads: Array<{ filename: string; json: string }> = [];

    render(
      <App
        modrinthClient={zeroNetworkClient}
        onExportJson={(filename, json) => {
          reExportedJsonPayloads.push({ filename, json });
        }}
      />,
    );

    const fileInput = screen.getByLabelText('Import instance.json file') as HTMLInputElement;

    // 1. Importing invalid JSON surfaces a clear error alert
    const invalidFile = new File(['{ malformed json'], 'broken.json', {
      type: 'application/json',
    });
    fireEvent.change(fileInput, { target: { files: [invalidFile] } });

    const invalidAlert = await screen.findByRole('alert');
    expect(invalidAlert).toHaveTextContent(/Invalid JSON in instance payload/i);

    // 2. Importing an unknown future schemaVersion (e.g. schemaVersion: 99) surfaces a clear error alert
    const futureSchemaJson = JSON.stringify({
      ...JSON.parse(exportedJson),
      schemaVersion: 99,
    });
    const futureFile = new File([futureSchemaJson], 'future-instance.json', {
      type: 'application/json',
    });
    fireEvent.change(fileInput, { target: { files: [futureFile] } });

    const futureAlert = await screen.findByRole('alert');
    expect(futureAlert).toHaveTextContent(/Unsupported schemaVersion "99"/i);

    // 3. Importing the valid exported instance.json restores the entire workspace offline with 0 network calls
    const validFile = new File([exportedJson], 'col-m4-instance.json', {
      type: 'application/json',
    });
    fireEvent.change(fileInput, { target: { files: [validFile] } });

    expect(await screen.findByRole('heading', { name: 'M4 Outputs Suite' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    // Verify zero network calls were made
    expect(zeroNetworkClient.getCollection).not.toHaveBeenCalled();
    expect(zeroNetworkClient.getProjects).not.toHaveBeenCalled();
    expect(zeroNetworkClient.getProjectVersions).not.toHaveBeenCalled();
    expect(zeroNetworkClient.getVersionsByIds).not.toHaveBeenCalled();

    // Verify TargetForm inputs were synced from the imported instance
    expect((screen.getByLabelText('Collection URL or ID') as HTMLInputElement).value).toBe(
      'col-m4',
    );
    expect((screen.getByLabelText('Game Version') as HTMLSelectElement).value).toBe('1.20.1');
    expect((screen.getByLabelText('Platform') as HTMLSelectElement).value).toBe('fabric');

    // Verify custom selections and version overrides were restored
    expect(screen.getByLabelText('Select Sodium? for Client')).not.toBeChecked();
    expect(screen.getByLabelText('Select Sodium! for Client')).toBeChecked();
    expect((screen.getByLabelText('Sodium! Client version') as HTMLSelectElement).value).toBe(
      'v-sodium-old',
    );

    // Re-export instance.json and prove lossless round-trip (identical JSON output)
    fireEvent.click(screen.getByRole('button', { name: 'Export instance.json' }));
    expect(reExportedJsonPayloads).toHaveLength(1);
    expect(reExportedJsonPayloads[0]!.filename).toBe('col-m4-instance.json');
    expect(reExportedJsonPayloads[0]!.json).toBe(exportedJson);
    expect(serialize(deserialize(exportedJson))).toBe(exportedJson);

    // 4. Exercise post-import version switching offline and verify ModrinthClient remains uncalled
    fireEvent.click(screen.getByLabelText('Client environment'));
    fireEvent.change(screen.getByLabelText('Sodium! Client version'), {
      target: { value: 'v-sodium-1' },
    });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Sodium! Client version') as HTMLSelectElement).value,
      ).toBe('v-sodium-1');
    });

    expect(zeroNetworkClient.getCollection).not.toHaveBeenCalled();
    expect(zeroNetworkClient.getProjects).not.toHaveBeenCalled();
    expect(zeroNetworkClient.getProjectVersions).not.toHaveBeenCalled();
    expect(zeroNetworkClient.getVersionsByIds).not.toHaveBeenCalled();
  });

  it('exports .mrpack with modrinth.index.json without fetching binaries, supports optional platformVersion, warns when plugins are excluded, and emits separate entries when client/server versions differ (§8.3, §13 M4)', async () => {
    const client = buildM4FakeClient();
    const archiveWriter = createArchiveWriter();
    const fileFetcher: FileFetcher = {
      fetchBinary: vi.fn(async () => {
        throw new Error('fetchBinary must never be called during .mrpack export');
      }),
    };

    const exportedBlobs: Array<{ filename: string; blob: Blob }> = [];

    render(
      <App
        modrinthClient={client}
        fileFetcher={fileFetcher}
        archiveWriter={archiveWriter}
        onExportBlob={(filename, blob) => {
          exportedBlobs.push({ filename, blob });
        }}
      />,
    );

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-m4' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'fabric' },
    });
    fireEvent.click(loadButton);

    await screen.findByRole('heading', { name: 'M4 Outputs Suite' });

    // 1. Plugin exclusion warning is visible because LuckPerms (type: 'plugin') is selected on Server
    const pluginWarning = screen.getByRole('note', { name: 'Plugin exclusion warning' });
    expect(pluginWarning).toHaveTextContent(
      '1 plugin was excluded from .mrpack export (LuckPerms): the Modrinth .mrpack format does not support plugins.',
    );

    // 2. Override Lithium version on Client to 0.11.1 while keeping Server on 0.11.2
    //    so client and server choose different versions of the same project (§8.3)
    fireEvent.click(screen.getByLabelText('Client environment'));
    fireEvent.change(screen.getByLabelText('Lithium Client version'), {
      target: { value: 'v-lithium-old' },
    });
    await waitFor(() => {
      expect((screen.getByLabelText('Lithium Client version') as HTMLSelectElement).value).toBe(
        'v-lithium-old',
      );
    });

    // 3. Export .mrpack WITHOUT platformVersion first
    const exportMrpackBtn = screen.getByRole('button', { name: 'Export .mrpack' });
    expect(exportMrpackBtn).not.toBeDisabled();
    fireEvent.click(exportMrpackBtn);

    await waitFor(() => {
      expect(exportedBlobs).toHaveLength(1);
    });

    expect(fileFetcher.fetchBinary).not.toHaveBeenCalled();
    expect(exportedBlobs[0]!.filename).toBe('col-m4.mrpack');

    const mrpackZip1 = await JSZip.loadAsync(await exportedBlobs[0]!.blob.arrayBuffer());
    const indexFile1 = mrpackZip1.file('modrinth.index.json');
    expect(indexFile1).toBeTruthy();
    const index1 = JSON.parse(await indexFile1!.async('string')) as MrpackIndex;

    expect(index1.formatVersion).toBe(1);
    expect(index1.game).toBe('minecraft');
    expect(index1.name).toBe('M4 Outputs Suite');
    expect(index1.dependencies).toEqual({
      minecraft: '1.20.1',
    });

    // Plugins (LuckPerms) are excluded from files[]
    expect(index1.files.some((f) => f.path.startsWith('plugins/'))).toBe(false);

    // Lithium has two separate file entries because Client chose 0.11.1 and Server chose 0.11.2
    const lithiumFiles = index1.files.filter((f) => f.path.startsWith('mods/Lithium-'));
    expect(lithiumFiles).toHaveLength(2);
    expect(lithiumFiles).toEqual([
      {
        path: 'mods/Lithium-Fabric-1.20.1-0.11.1.jar',
        hashes: { sha1: '5'.repeat(40), sha512: '6'.repeat(128) },
        env: { client: 'optional', server: 'unsupported' },
        downloads: [
          'https://cdn.modrinth.com/data/mod-lithium/versions/v-lithium-old/lithium-fabric-0.11.1.jar',
        ],
        fileSize: 3000,
      },
      {
        path: 'mods/Lithium-Fabric-1.20.1-0.11.2.jar',
        hashes: { sha1: '3'.repeat(40), sha512: '4'.repeat(128) },
        env: { client: 'unsupported', server: 'required' },
        downloads: [
          'https://cdn.modrinth.com/data/mod-lithium/versions/v-lithium-1/lithium-fabric-0.11.2.jar',
        ],
        fileSize: 3072,
      },
    ]);

    // Fabric API shared the same version on Client and Server -> single file entry
    const fapiFiles = index1.files.filter((f) => f.path.startsWith('mods/FabricAPI-'));
    expect(fapiFiles).toHaveLength(1);
    expect(fapiFiles[0]?.env).toEqual({ client: 'required', server: 'required' });

    // 4. Enter Platform version (optional) "0.16.9" and export .mrpack again
    const platformVersionInput = screen.getByLabelText('Platform version (optional)');
    fireEvent.change(platformVersionInput, { target: { value: '0.16.9' } });
    fireEvent.click(exportMrpackBtn);

    await waitFor(() => {
      expect(exportedBlobs).toHaveLength(2);
    });

    expect(fileFetcher.fetchBinary).not.toHaveBeenCalled();
    const mrpackZip2 = await JSZip.loadAsync(await exportedBlobs[1]!.blob.arrayBuffer());
    const index2 = JSON.parse(
      await mrpackZip2.file('modrinth.index.json')!.async('string'),
    ) as MrpackIndex;

    expect(index2.dependencies).toEqual({
      minecraft: '1.20.1',
      'fabric-loader': '0.16.9',
    });

    // Verify core helper parity
    const resolved = await resolveCollection(client, {
      collectionInput: 'col-m4',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });
    expect(getMrpackWarnings(resolved.instance)).toHaveLength(1);
    expect(toMrpack(resolved.instance, { platformVersion: '0.16.9' }).dependencies).toEqual({
      minecraft: '1.20.1',
      'fabric-loader': '0.16.9',
    });

    // 5. Importing an instance.json or reloading a collection resets Platform version (optional) to ''
    const importInput = screen.getByLabelText('Import instance.json file') as HTMLInputElement;
    const importedFile = new File([serialize(resolved.instance)], 'col-m4-instance.json', {
      type: 'application/json',
    });
    fireEvent.change(importInput, { target: { files: [importedFile] } });

    await waitFor(() => {
      expect(
        (screen.getByLabelText('Platform version (optional)') as HTMLInputElement).value,
      ).toBe('');
    });

    fireEvent.change(screen.getByLabelText('Platform version (optional)'), {
      target: { value: '0.16.10' },
    });
    expect((screen.getByLabelText('Platform version (optional)') as HTMLInputElement).value).toBe(
      '0.16.10',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));
    await screen.findByRole('heading', { name: 'M4 Outputs Suite' });
    expect((screen.getByLabelText('Platform version (optional)') as HTMLInputElement).value).toBe(
      '',
    );
  });

  it('cleans up temporary anchor and revokes object URL in triggerBlobDownload even if click throws', () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLMock = vi.fn(() => 'blob:https://example.test/archive-1');
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      writable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: revokeObjectURLMock,
    });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    try {
      const sampleBlob = new Blob([new Uint8Array([1, 2, 3])], { type: 'application/zip' });
      triggerBlobDownload('sample.zip', sampleBlob);

      expect(createObjectURLMock).toHaveBeenCalledWith(sampleBlob);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:https://example.test/archive-1');
      expect(document.body.querySelector('a[download="sample.zip"]')).toBeNull();

      clickSpy.mockImplementationOnce(() => {
        throw new Error('Blocked download');
      });
      expect(() => triggerBlobDownload('throwing.zip', sampleBlob)).toThrow('Blocked download');
      expect(revokeObjectURLMock).toHaveBeenCalledTimes(2);
      expect(document.body.querySelector('a[download="throwing.zip"]')).toBeNull();
    } finally {
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        writable: true,
        value: originalCreateObjectURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        writable: true,
        value: originalRevokeObjectURL,
      });
      clickSpy.mockRestore();
    }
  });
});
