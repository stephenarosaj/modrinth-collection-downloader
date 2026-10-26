import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it, vi } from 'vitest';
import { createArchiveWriter } from '../../src/adapters';
import {
  CORE_SCHEMA_VERSION,
  computeEntryStatus,
  deselectEntry,
  resolveCollection,
  serialize,
  toTables,
  type Entry,
  type ExportableProjectType,
  type Instance,
  type VersionRef,
} from '../../src/core';
import type { FileFetcher, RequestOptions } from '../../src/ports';
import { App } from '../../src/ui/App';
import { EntryTables } from '../../src/ui/components/EntryTables';
import { formatUserFacingError } from '../../src/ui/utils';
import { FakeModrinthClient } from '../helpers/fake-modrinth-client';

function buildM5FakeClient(): FakeModrinthClient {
  const client = new FakeModrinthClient({
    gameVersions: [
      { version: '1.20.1', versionType: 'release', date: '2023-06-12T00:00:00Z', major: true },
    ],
    platforms: [{ name: 'fabric', supportedProjectTypes: ['mod'] }],
  });

  client.setCollection('col-m5', ['mod-alpha', 'mod-beta'], 'M5 Polish Collection');

  client.addProjects([
    {
      id: 'mod-alpha',
      slug: 'alpha-mod',
      title: 'Alpha Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/alpha-mod',
      support: { client: 'required', server: 'required' },
    },
    {
      id: 'mod-beta',
      slug: 'beta-mod',
      title: 'Beta Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/beta-mod',
      support: { client: 'optional', server: 'required' },
    },
    {
      id: 'dep-gamma',
      slug: 'gamma-lib',
      title: 'Gamma Lib',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/gamma-lib',
      support: { client: 'required', server: 'required' },
    },
  ]);

  client.addVersions([
    {
      id: 'v-alpha-1',
      projectId: 'mod-alpha',
      versionNumber: '1.0.0',
      versionType: 'release',
      publishedAt: '2024-06-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [
        { projectId: 'dep-gamma', versionId: 'v-gamma-pinned', type: 'required' },
      ],
    },
    {
      id: 'v-beta-1',
      projectId: 'mod-beta',
      versionNumber: '2.0.0',
      versionType: 'release',
      publishedAt: '2024-06-02T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
    {
      id: 'v-gamma-1',
      projectId: 'dep-gamma',
      versionNumber: '0.9.0',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
    {
      id: 'v-gamma-pinned',
      projectId: 'dep-gamma',
      versionNumber: '0.8.5',
      versionType: 'release',
      publishedAt: '2024-04-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
  ]);

  return client;
}

function makeSyntheticEntry(
  index: number,
  projectType: ExportableProjectType,
  origin: 'collection' | 'dependency',
  requiredByIds: string[] = [],
): Entry {
  const id = `proj-${index}`;
  const versionRef: VersionRef = {
    id: `ver-${index}-1`,
    versionNumber: `1.0.${index}`,
    versionType: 'release',
    publishedAt: '2024-07-01T00:00:00Z',
    gameVersions: ['1.20.1'],
    platforms: projectType === 'mod' || projectType === 'plugin' ? ['fabric'] : ['minecraft'],
    file: {
      filename: `${id}-1.0.${index}.${projectType === 'mod' || projectType === 'plugin' ? 'jar' : 'zip'}`,
      url: `https://cdn.modrinth.com/data/${id}/versions/ver-${index}-1/${id}.jar`,
      size: 1024,
      sha1: 'a'.repeat(40),
      sha512: 'b'.repeat(128),
    },
    dependencies: [],
  };

  return {
    project: {
      id,
      slug: `slug-${index}`,
      title: `Project ${index.toString().padStart(3, '0')}`,
      type: projectType,
      modrinthUrl: `https://modrinth.com/${projectType}/slug-${index}`,
    },
    origin,
    environments: {
      client: {
        support: projectType === 'plugin' ? 'unsupported' : 'required',
        candidates: projectType === 'plugin' ? [] : [versionRef],
        version: projectType === 'plugin' ? null : versionRef,
        resolution: projectType === 'plugin' ? 'none' : 'latest-compatible',
        dependencies: [],
        requiredBy: projectType === 'plugin' ? [] : requiredByIds,
        selection:
          projectType === 'plugin'
            ? { on: false, source: 'none' }
            : { on: true, source: origin === 'collection' ? 'user' : 'auto' },
      },
      server: {
        support:
          projectType === 'resourcepack' || projectType === 'shader' ? 'unsupported' : 'required',
        candidates:
          projectType === 'resourcepack' || projectType === 'shader' ? [] : [versionRef],
        version:
          projectType === 'resourcepack' || projectType === 'shader' ? null : versionRef,
        resolution:
          projectType === 'resourcepack' || projectType === 'shader'
            ? 'none'
            : 'latest-compatible',
        dependencies: [],
        requiredBy:
          projectType === 'resourcepack' || projectType === 'shader' ? [] : requiredByIds,
        selection:
          projectType === 'resourcepack' || projectType === 'shader'
            ? { on: false, source: 'none' }
            : { on: true, source: origin === 'collection' ? 'user' : 'auto' },
      },
    },
  };
}

function build500EntryInstance(): Instance {
  const types: ExportableProjectType[] = ['mod', 'resourcepack', 'shader', 'datapack', 'plugin'];
  const entries: Entry[] = [];

  for (let i = 0; i < 450; i += 1) {
    const type = types[i % types.length]!;
    entries.push(makeSyntheticEntry(i, type, 'collection'));
  }

  for (let i = 450; i < 500; i += 1) {
    const parentIndex = (i - 450) * 5;
    const parentId = `proj-${parentIndex}`;
    const parentEntry = entries[parentIndex]!;
    const depId = `proj-${i}`;
    parentEntry.environments.client.dependencies.push(depId);
    parentEntry.environments.server.dependencies.push(depId);
    entries.push(makeSyntheticEntry(i, 'mod', 'dependency', [parentId]));
  }

  return {
    schemaVersion: CORE_SCHEMA_VERSION,
    meta: {
      name: '500 Entry Scale Suite',
      source: {
        collectionId: 'col-500',
        url: 'https://modrinth.com/collection/col-500',
      },
      target: {
        gameVersion: '1.20.1',
        platform: 'fabric',
        releasePreference: 'stable',
      },
      createdAt: '2025-01-01T00:00:00.000Z',
    },
    entries,
  };
}

async function runAxeAudit(container: HTMLElement) {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof originalGetContext;
  try {
    return await axe.run(container, {
      rules: {
        'color-contrast': { enabled: false },
      },
    });
  } finally {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  }
}

describe('Error Formatting, Retry UX, Partial-Result Resilience, Empty States & 500-Row Performance', () => {
  describe('1. formatUserFacingError and Collection Resolution Retry UX', () => {
    it('formats HTTP 429, 404, 5xx, and network errors with recovery guidance while preserving already-formatted and fallback errors', () => {
      expect(formatUserFacingError(new Error('HTTP 429 Too Many Requests'))).toBe(
        'Modrinth API rate limit reached (HTTP 429 Too Many Requests). Please wait a moment and retry.',
      );
      expect(formatUserFacingError('Rate limit exceeded on /v2/projects')).toBe(
        'Modrinth API rate limit reached (Rate limit exceeded on /v2/projects). Please wait a moment and retry.',
      );
      expect(
        formatUserFacingError(
          new Error('Modrinth API rate limit reached (429). Please wait and retry.'),
        ),
      ).toBe('Modrinth API rate limit reached (429). Please wait and retry.');
      expect(formatUserFacingError(new Error('HTTP 404 Not Found'))).toBe(
        'Requested Modrinth resource was not found (HTTP 404 Not Found). Verify the collection ID or URL is public and valid.',
      );
      expect(formatUserFacingError(new Error('Modrinth API error 404 (Not Found)'))).toBe(
        'Requested Modrinth resource was not found (Modrinth API error 404 (Not Found)). Verify the collection ID or URL is public and valid.',
      );
      expect(formatUserFacingError(new Error('Collection not found: xyz'))).toBe(
        'Collection not found: xyz',
      );
      expect(formatUserFacingError(new Error('Collection not found: 404'))).toBe(
        'Collection not found: 404',
      );
      expect(formatUserFacingError(new Error('HTTP 502 Bad Gateway'))).toBe(
        'Modrinth server error (HTTP 502 Bad Gateway). Please wait a moment and retry.',
      );
      expect(formatUserFacingError(new Error('HTTP 503 Service Unavailable'))).toBe(
        'Modrinth server error (HTTP 503 Service Unavailable). Please wait a moment and retry.',
      );
      expect(formatUserFacingError(new Error('TypeError: Failed to fetch'))).toBe(
        'Network connection error (TypeError: Failed to fetch). Check your internet connection and retry.',
      );
      expect(formatUserFacingError(new Error('   '), 'Custom fallback')).toBe('Custom fallback');
      expect(formatUserFacingError(null, 'Custom fallback')).toBe('Custom fallback');
    });

    it('surfaces a clear rate-limit error banner and Retry button on HTTP 429, then resolves when Retry is clicked', async () => {
      const client = buildM5FakeClient();
      client.failOn('getCollection', new Error('HTTP 429 Too Many Requests'));

      const { container } = render(<App modrinthClient={client} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-m5' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Modrinth API rate limit reached (HTTP 429 Too Many Requests). Please wait a moment and retry.',
      );

      const progressPanel = screen.getByRole('region', { name: 'Resolution progress' });
      const retryBtn = within(progressPanel).getByRole('button', { name: 'Retry' });
      expect(retryBtn).toBeInTheDocument();

      // Verify axe accessibility on the error + retry state
      const axeResults = await runAxeAudit(container);
      expect(axeResults.violations).toEqual([]);

      // Clear the error trigger and click Retry without re-submitting the form
      client.failOn('getCollection', null as unknown as Error);
      fireEvent.click(retryBtn);

      await screen.findByRole('heading', { name: 'M5 Polish Collection' });
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(screen.getByText('Alpha Mod')).toBeInTheDocument();
      expect(screen.getByText('Beta Mod')).toBeInTheDocument();
    });

    it('renders Retry button after cancelling an in-flight collection resolution and resolves on Retry', async () => {
      const client = buildM5FakeClient();
      let rejectPendingCollection: ((reason?: unknown) => void) | null = null;
      const originalGetCollection = client.getCollection.bind(client);

      vi.spyOn(client, 'getCollection').mockImplementationOnce(
        (_id: string, opts?: RequestOptions) =>
          new Promise((_resolve, reject) => {
            rejectPendingCollection = reject;
            opts?.signal?.addEventListener('abort', () => {
              reject(new DOMException('Aborted', 'AbortError'));
            });
          }),
      );

      render(<App modrinthClient={client} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-m5' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      const cancelBtn = await screen.findByRole('button', { name: 'Cancel' });
      fireEvent.click(cancelBtn);
      if (rejectPendingCollection) {
        (rejectPendingCollection as (reason?: unknown) => void)(
          new DOMException('Aborted', 'AbortError'),
        );
      }

      expect(await screen.findByRole('status')).toHaveTextContent('Resolution cancelled.');

      vi.mocked(client.getCollection).mockImplementation(originalGetCollection);
      const retryBtn = screen.getByRole('button', { name: 'Retry' });
      fireEvent.click(retryBtn);

      await screen.findByRole('heading', { name: 'M5 Polish Collection' });
      expect(screen.getByText('Alpha Mod')).toBeInTheDocument();
    });
  });

  describe('2. Partial-Result Resolution Resilience', () => {
    it('completes resolution when one collection project fails getProjectVersions, surfacing the failure in Skipped Projects and resolution log', async () => {
      const client = buildM5FakeClient();
      client.failOn('versions:mod-beta', new Error('Upstream 502 Bad Gateway'));

      render(<App modrinthClient={client} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-m5' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      await screen.findByRole('heading', { name: 'M5 Polish Collection' });

      // Alpha Mod and its dependency Gamma Lib succeeded and appear in the Mods table;
      // fetch-failed Beta Mod is excluded from the Mods table and recorded only in Skipped Projects
      const modsSection = screen.getByRole('region', { name: 'Mods' });
      expect(within(modsSection).getByText('Alpha Mod')).toBeInTheDocument();
      expect(within(modsSection).getByText('Gamma Lib')).toBeInTheDocument();
      expect(within(modsSection).queryByText('Beta Mod')).not.toBeInTheDocument();

      // Beta Mod appears in Skipped Projects with its fetch error reason
      const skippedSection = screen.getByRole('region', { name: 'Skipped Projects' });
      expect(within(skippedSection).getByText('Beta Mod')).toBeInTheDocument();
      expect(
        within(skippedSection).getByText(/Failed to fetch versions: Upstream 502 Bad Gateway/i),
      ).toBeInTheDocument();

      // Resolution log records the warning
      const logList = screen.getByLabelText('Resolution log');
      expect(logList).toHaveTextContent('Warning: Failed to fetch versions for Beta Mod (mod-beta)');
    });

    it('surfaces top-level resolution error and Retry button when 100% of collection projects fail getProjectVersions', async () => {
      const client = buildM5FakeClient();
      client.failOn('versions:mod-alpha', new Error('HTTP 429 Too Many Requests'));
      client.failOn('versions:mod-beta', new Error('HTTP 429 Too Many Requests'));

      render(<App modrinthClient={client} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-m5' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(
        'Modrinth API rate limit reached (HTTP 429 Too Many Requests). Please wait a moment and retry.',
      );
      expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'M5 Polish Collection' })).not.toBeInTheDocument();
    });

    it('degrades gracefully when dependency getProjectVersions or getVersionsByIds fails during closure calculation', async () => {
      const client = buildM5FakeClient();
      client.failOn('versions:dep-gamma', new Error('Dependency versions timeout'));
      client.failOn('getVersionsByIds', new Error('Pinned versions endpoint unavailable'));

      const progressMessages: string[] = [];
      const result = await resolveCollection(client, {
        collectionInput: 'col-m5',
        gameVersion: '1.20.1',
        platform: 'fabric',
        releasePreference: 'stable',
        onProgress: (p) => {
          if (p.message) {
            progressMessages.push(p.message);
          }
        },
      });

      expect(result.instance.entries.map((e) => e.project.id)).toContain('mod-alpha');
      expect(result.instance.entries.map((e) => e.project.id)).toContain('mod-beta');
      expect(result.skipped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'dep-gamma',
            reason: 'Failed to fetch versions: Dependency versions timeout',
          }),
        ]),
      );
      expect(progressMessages).toEqual(
        expect.arrayContaining([
          'Warning: Failed to fetch versions for Gamma Lib (dep-gamma)',
          'Warning: Failed to fetch pinned versions (Pinned versions endpoint unavailable)',
        ]),
      );
    });

    it('degrades gracefully when client.getProjects fails during transitive dependency lookup, creating a placeholder dependency entry and recording Skipped Projects', async () => {
      const client = buildM5FakeClient();
      client.failOn('getVersionsByIds', new Error('Pinned versions endpoint unavailable'));
      const originalGetProjects = client.getProjects.bind(client);
      let getProjectsCalls = 0;

      vi.spyOn(client, 'getProjects').mockImplementation(
        async (ids: string[], opts?: RequestOptions) => {
          getProjectsCalls += 1;
          if (getProjectsCalls === 2) {
            throw new Error('Dependency projects endpoint 503');
          }
          return originalGetProjects(ids, opts);
        },
      );

      const progressMessages: string[] = [];
      const result = await resolveCollection(client, {
        collectionInput: 'col-m5',
        gameVersion: '1.20.1',
        platform: 'fabric',
        releasePreference: 'stable',
        onProgress: (p) => {
          if (p.message) {
            progressMessages.push(p.message);
          }
        },
      });

      const depEntry = result.instance.entries.find((e) => e.project.id === 'dep-gamma');
      expect(depEntry).toBeDefined();
      expect(depEntry!.origin).toBe('dependency');
      expect(depEntry!.environments.client.version).toBeNull();
      expect(depEntry!.environments.client.requiredBy).toContain('mod-alpha');

      const activeStatuses = computeEntryStatus(result.instance, ['client']);
      expect(activeStatuses.get('mod-alpha')?.client?.reasons).toContain('DEPENDENCY_UNAVAILABLE');
      expect(activeStatuses.get('dep-gamma')?.client?.reasons).toContain('NEEDED_BUT_UNAVAILABLE');

      expect(result.skipped).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'dep-gamma',
            reason: expect.stringContaining(
              'Failed to fetch dependency project: Dependency projects endpoint 503',
            ),
          }),
        ]),
      );
      expect(progressMessages).toEqual(
        expect.arrayContaining([
          expect.stringContaining('Warning: Failed to fetch dependency projects'),
        ]),
      );
    });
  });

  describe('3. Zip Export Retry UX', () => {
    it('renders Retry client.zip export button when a binary download fails and succeeds on retry', async () => {
      const client = buildM5FakeClient();
      const archiveWriter = createArchiveWriter();
      const exportedBlobs: Array<{ filename: string; blob: Blob }> = [];

      let shouldFailFetch = true;
      const fileFetcher: FileFetcher = {
        fetchBinary: vi.fn(async (url: string) => {
          if (shouldFailFetch && url.includes('mod-alpha')) {
            throw new Error('CDN connection reset');
          }
          return new Uint8Array([1, 2, 3, 4]);
        }),
      };

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

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-m5' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      await screen.findByRole('heading', { name: 'M5 Polish Collection' });

      // Enable Client environment to unlock Export client.zip
      fireEvent.click(screen.getByRole('checkbox', { name: 'Client environment' }));

      const exportClientZipBtn = screen.getByRole('button', { name: 'Export client.zip' });
      expect(exportClientZipBtn).not.toBeDisabled();
      fireEvent.click(exportClientZipBtn);

      const failureAlert = await screen.findByRole('alert');
      expect(failureAlert).toHaveClass('zip-partial-failure-alert');
      expect(failureAlert).toHaveTextContent('CDN connection reset');
      expect(exportedBlobs).toHaveLength(1);

      const retryZipBtn = within(failureAlert).getByRole('button', {
        name: 'Retry client.zip export',
      });

      // Fix the CDN failure and click Retry client.zip export
      shouldFailFetch = false;
      fireEvent.click(retryZipBtn);

      await waitFor(() => {
        expect(exportedBlobs).toHaveLength(2);
      });
      expect(exportedBlobs[1]!.filename).toBe('col-m5-client.zip');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('routes Retry server.zip export to server environment and disables retry while Server environment toggle is off', async () => {
      const client = buildM5FakeClient();
      const archiveWriter = createArchiveWriter();
      const exportedBlobs: Array<{ filename: string; blob: Blob }> = [];

      let shouldFailFetch = true;
      const fileFetcher: FileFetcher = {
        fetchBinary: vi.fn(async (url: string) => {
          if (shouldFailFetch && url.includes('mod-beta')) {
            throw new Error('Server binary mirror 503');
          }
          return new Uint8Array([5, 6, 7, 8]);
        }),
      };

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

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-m5' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      await screen.findByRole('heading', { name: 'M5 Polish Collection' });

      const serverEnvCheckbox = screen.getByRole('checkbox', { name: 'Server environment' });
      fireEvent.click(serverEnvCheckbox);

      const exportServerZipBtn = screen.getByRole('button', { name: 'Export server.zip' });
      expect(exportServerZipBtn).not.toBeDisabled();
      fireEvent.click(exportServerZipBtn);

      const failureAlert = await screen.findByRole('alert');
      expect(failureAlert).toHaveClass('zip-partial-failure-alert');
      expect(failureAlert).toHaveTextContent('Server binary mirror 503');
      expect(exportedBlobs).toHaveLength(1);
      expect(exportedBlobs[0]!.filename).toBe('col-m5-server.zip');

      const retryServerZipBtn = within(failureAlert).getByRole('button', {
        name: 'Retry server.zip export',
      });
      expect(retryServerZipBtn).not.toBeDisabled();

      // Turning off Server environment disables Retry server.zip export
      fireEvent.click(serverEnvCheckbox);
      expect(retryServerZipBtn).toBeDisabled();

      // Re-enabling Server environment re-enables Retry server.zip export and exports col-m5-server.zip
      fireEvent.click(serverEnvCheckbox);
      expect(retryServerZipBtn).not.toBeDisabled();

      shouldFailFetch = false;
      fireEvent.click(retryServerZipBtn);

      await waitFor(() => {
        expect(exportedBlobs).toHaveLength(2);
      });
      expect(exportedBlobs[1]!.filename).toBe('col-m5-server.zip');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });
  });

  describe('4. Empty & Edge States + axe-core Accessibility', () => {
    it('renders the Getting started card initially with 0 axe violations and hides it once a collection is loaded', async () => {
      const client = buildM5FakeClient();
      const { container } = render(<App modrinthClient={client} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      const gettingStarted = screen.getByRole('region', { name: 'Getting started' });
      expect(gettingStarted).toBeInTheDocument();
      expect(
        within(gettingStarted).getByRole('heading', { name: 'Ready to build an instance' }),
      ).toBeInTheDocument();

      const axeResults = await runAxeAudit(container);
      expect(axeResults.violations).toEqual([]);

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-m5' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      await screen.findByRole('heading', { name: 'M5 Polish Collection' });
      expect(screen.queryByRole('region', { name: 'Getting started' })).not.toBeInTheDocument();
    });

    it('renders empty collection message when a collection has 0 projects', async () => {
      const client = buildM5FakeClient();
      client.setCollection('col-empty', [], 'Empty Collection');

      render(<App modrinthClient={client} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-empty' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      await screen.findByRole('heading', { name: 'Empty Collection' });
      expect(
        screen.getByText('No exportable projects found in this collection.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/skipped project/i)).not.toBeInTheDocument();
    });

    it('renders empty exportable message and skipped count note when a collection contains only a modpack', async () => {
      const client = buildM5FakeClient();
      client.addProject({
        id: 'mp-only',
        slug: 'only-modpack',
        title: 'Only Modpack',
        type: 'modpack',
        modrinthUrl: 'https://modrinth.com/modpack/only-modpack',
      });
      client.setCollection('col-modpack-only', ['mp-only'], 'Modpack Only Collection');

      render(<App modrinthClient={client} />);

      await waitFor(() => {
        expect(screen.getByLabelText('Game Version')).not.toBeDisabled();
      });

      fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
        target: { value: 'col-modpack-only' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

      await screen.findByRole('heading', { name: 'Modpack Only Collection' });
      expect(
        screen.getByText('No exportable projects found in this collection.'),
      ).toBeInTheDocument();
      expect(screen.getByText('1 skipped project is listed below.')).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Skipped Projects' })).toHaveTextContent(
        'Only Modpack',
      );
    });
  });

  describe('5. Performance Pass at 500 Rows', () => {
    it(
      'renders a 500-entry instance across all 5 tables and toggles individual and Select All checkboxes responsively',
      async () => {
      const client = buildM5FakeClient();
      const instance500 = build500EntryInstance();
      const serialized = serialize(instance500);

      const { container } = render(<App modrinthClient={client} />);

      const importInput = screen.getByLabelText('Import instance.json file') as HTMLInputElement;
      const file = new File([serialized], 'col-500-instance.json', { type: 'application/json' });

      const startRender = performance.now();
      fireEvent.change(importInput, { target: { files: [file] } });

      await screen.findByRole('heading', { name: '500 Entry Scale Suite' });
      const renderElapsedMs = performance.now() - startRender;

      const allRows = container.querySelectorAll('tr.entry-row');
      expect(allRows).toHaveLength(500);
      expect(renderElapsedMs).toBeLessThan(2000);

      // Enable Client environment so checkboxes are interactive
      fireEvent.click(screen.getByRole('checkbox', { name: 'Client environment' }));

      const firstModCheckbox = screen.getByLabelText(
        'Select Project 000 for Client',
      ) as HTMLInputElement;
      expect(firstModCheckbox.checked).toBe(true);

      const startSingleToggle = performance.now();
      fireEvent.click(firstModCheckbox);
      const singleToggleElapsedMs = performance.now() - startSingleToggle;

      expect(firstModCheckbox.checked).toBe(false);
      expect(singleToggleElapsedMs).toBeLessThan(2000);

      // Toggle Select All for Mods on Client
      const selectAllModsClient = screen.getByLabelText(
        'Select all Mods for Client',
      ) as HTMLInputElement;
      const startBulkToggle = performance.now();
      fireEvent.click(selectAllModsClient);
      const bulkToggleElapsedMs = performance.now() - startBulkToggle;

      expect(firstModCheckbox.checked).toBe(true);
      expect(bulkToggleElapsedMs).toBeLessThan(2000);
    }, 15000);

    it('isolates row and cell re-renders via React.memo when toggling a single row at 500 entries', () => {
      const instance500 = build500EntryInstance();
      let totalVersionTypeReads = 0;
      const readsByProject = new Map<string, number>();

      for (const entry of instance500.entries) {
        const versionRef =
          entry.environments.client.version ?? entry.environments.server.version;
        if (versionRef) {
          let currentType = versionRef.versionType;
          Object.defineProperty(versionRef, 'versionType', {
            configurable: true,
            enumerable: true,
            get() {
              totalVersionTypeReads += 1;
              readsByProject.set(
                entry.project.id,
                (readsByProject.get(entry.project.id) ?? 0) + 1,
              );
              return currentType;
            },
            set(next) {
              currentType = next;
            },
          });
        }
      }

      const activeEnvironments = { client: true, server: true };
      const { rerender } = render(
        <EntryTables
          tables={toTables(instance500)}
          instance={instance500}
          activeEnvironments={activeEnvironments}
        />,
      );

      // Initial render evaluates all 500 rows (1000 environment cells across 500 rows)
      expect(readsByProject.size).toBe(500);
      expect(totalVersionTypeReads).toBeGreaterThanOrEqual(500);

      // 1. Toggle a standalone collection row (`proj-250`, no dependencies): only 1 row re-renders
      totalVersionTypeReads = 0;
      readsByProject.clear();
      const singleRowUpdated = deselectEntry(instance500, 'proj-250', 'client').instance;

      rerender(
        <EntryTables
          tables={toTables(singleRowUpdated)}
          instance={singleRowUpdated}
          activeEnvironments={activeEnvironments}
        />,
      );

      expect(Array.from(readsByProject.keys())).toEqual(['proj-250']);
      expect(readsByProject.get('proj-250')).toBe(2);
      expect(totalVersionTypeReads).toBe(2);

      // 2. Toggle a parent row (`proj-0`) with auto-selected dependency (`proj-450`): only those 2 rows re-render
      totalVersionTypeReads = 0;
      readsByProject.clear();
      const parentAndDepUpdated = deselectEntry(singleRowUpdated, 'proj-0', 'client').instance;

      rerender(
        <EntryTables
          tables={toTables(parentAndDepUpdated)}
          instance={parentAndDepUpdated}
          activeEnvironments={activeEnvironments}
        />,
      );

      expect(Array.from(readsByProject.keys()).sort()).toEqual(['proj-0', 'proj-450']);
      expect(totalVersionTypeReads).toBe(4);
      expect(totalVersionTypeReads).toBeLessThan(20);
    });
  });
});
