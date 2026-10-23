import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { deserialize, validateInstanceSchema } from '../../src/core';
import type { ModrinthClient, RequestOptions } from '../../src/ports';
import { App } from '../../src/ui/App';
import { triggerTextDownload } from '../../src/ui/download';
import { FakeModrinthClient } from '../helpers/fake-modrinth-client';

function buildFullM31FakeClient(): FakeModrinthClient {
  const client = new FakeModrinthClient({
    gameVersions: [
      { version: '1.21.1', versionType: 'release', date: '2024-08-08T00:00:00Z', major: false },
      { version: '24w33a', versionType: 'snapshot', date: '2024-08-15T00:00:00Z', major: false },
      { version: '1.20.1-beta1', versionType: 'beta', date: '2023-06-01T00:00:00Z', major: false },
      { version: '1.20.1-alpha1', versionType: 'alpha', date: '2023-05-01T00:00:00Z', major: false },
      { version: '1.20.1', versionType: 'release', date: '2023-06-12T00:00:00Z', major: true },
    ],
    platforms: [
      { name: 'fabric', supportedProjectTypes: ['mod'] },
      { name: 'neoforge', supportedProjectTypes: ['mod'] },
      { name: 'paper', supportedProjectTypes: ['plugin'] },
      { name: 'datapack', supportedProjectTypes: ['datapack'] },
    ],
  });

  client.setCollection(
    'col-m31',
    [
      'shader-iris',
      'rp-faithful',
      'dp-terralith',
      'plugin-luckperms',
      'mod-sodium',
      'mod-lithium',
      'mod-fallback',
      'mod-missing',
      'modpack-fabulously',
      'unknown-widget',
    ],
    'M3.1 Full Review Collection',
  );

  client.addProjects([
    {
      id: 'mod-sodium',
      slug: 'sodium',
      title: 'Sodium',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/sodium',
      support: { client: 'required', server: 'unsupported' },
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
      id: 'mod-fallback',
      slug: 'mystery-mod',
      title: 'Mystery Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/mystery-mod',
      support: { client: 'unknown', server: 'optional' },
    },
    {
      id: 'mod-missing',
      slug: 'unreleased-mod',
      title: 'Unreleased Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/unreleased-mod',
      support: { client: 'required', server: 'required' },
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
      id: 'shader-iris',
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
    {
      id: 'unknown-widget',
      slug: 'mystery-widget',
      title: 'Mystery Widget',
      type: 'widget',
      modrinthUrl: 'https://modrinth.com/project/mystery-widget',
      support: { client: 'optional', server: 'optional' },
    },
  ]);

  client.addVersions([
    {
      id: 'v-sodium',
      projectId: 'mod-sodium',
      versionNumber: '0.5.8+mc1.20.1',
      versionType: 'release',
      publishedAt: '2024-02-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-fabric-api', type: 'required' }],
    },
    {
      id: 'v-lithium',
      projectId: 'mod-lithium',
      versionNumber: '0.11.2',
      versionType: 'beta',
      publishedAt: '2024-02-02T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-fabric-api', type: 'required' }],
    },
    {
      id: 'v-fallback',
      projectId: 'mod-fallback',
      versionNumber: '1.0.0-any',
      versionType: 'release',
      publishedAt: '2024-02-03T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: [],
    },
    {
      id: 'v-fapi',
      projectId: 'dep-fabric-api',
      versionNumber: '0.92.0+1.20.1',
      versionType: 'release',
      publishedAt: '2024-02-05T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
    {
      id: 'v-luckperms',
      projectId: 'plugin-luckperms',
      versionNumber: '5.4.102',
      versionType: 'release',
      publishedAt: '2024-02-06T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
    {
      id: 'v-terralith',
      projectId: 'dp-terralith',
      versionNumber: '2.5.4',
      versionType: 'release',
      publishedAt: '2024-02-07T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['datapack'],
    },
    {
      id: 'v-faithful',
      projectId: 'rp-faithful',
      versionNumber: 'r4',
      versionType: 'release',
      publishedAt: '2024-02-08T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['minecraft'],
    },
    {
      id: 'v-shader',
      projectId: 'shader-iris',
      versionNumber: '5.1.1',
      versionType: 'release',
      publishedAt: '2024-02-09T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['iris'],
    },
  ]);

  return client;
}

describe('M3.1 Read-only tables + JSON export', () => {
  it('populates release-only Game Version options and formatted Platform options from ModrinthClient', async () => {
    const client = buildFullM31FakeClient();
    render(<App modrinthClient={client} />);

    const gameVersionSelect = await screen.findByLabelText('Game Version');
    await waitFor(() => {
      expect(gameVersionSelect).not.toBeDisabled();
    });

    const versionOptions = within(gameVersionSelect)
      .getAllByRole('option')
      .map((opt) => opt.textContent);
    expect(versionOptions).toEqual(['1.21.1', '1.20.1']);
    expect(versionOptions).not.toContain('24w33a');
    expect(versionOptions).not.toContain('1.20.1-beta1');
    expect(versionOptions).not.toContain('1.20.1-alpha1');

    const platformSelect = screen.getByLabelText('Platform');
    const platformOptions = within(platformSelect)
      .getAllByRole('option')
      .map((opt) => ({
        value: (opt as HTMLOptionElement).value,
        label: opt.textContent,
      }));

    expect(platformOptions).toEqual([
      { value: 'fabric', label: 'Fabric' },
      { value: 'neoforge', label: 'NeoForge' },
      { value: 'paper', label: 'Paper' },
    ]);
  });

  it('validates collection input on submit and supports retrying failed tag loads', async () => {
    const client = buildFullM31FakeClient();
    client.failOn('getGameVersions', new Error('Tag endpoint unavailable'));

    render(<App modrinthClient={client} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Tag endpoint unavailable/i);

    // Clear the failure and click Retry
    const freshClient = buildFullM31FakeClient();
    vi.spyOn(client, 'getGameVersions').mockImplementation((opts) =>
      freshClient.getGameVersions(opts),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    const loadButton = screen.getByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    // Submitting with empty collection input shows validation error
    fireEvent.click(loadButton);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Collection ID or URL cannot be empty/i,
    );
  });

  it('resolves a collection, renders tables in canonical order, displays environments, dependencies, skipped projects, and exports valid instance.json', async () => {
    const client = buildFullM31FakeClient();
    const exportedPayloads: Array<{ filename: string; json: string }> = [];

    render(
      <App
        modrinthClient={client}
        onExportJson={(filename, json) => {
          exportedPayloads.push({ filename, json });
        }}
      />,
    );

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'https://modrinth.com/collection/col-m31' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.change(screen.getByLabelText('Platform'), {
      target: { value: 'fabric' },
    });

    fireEvent.click(loadButton);

    // Wait for review header to appear
    const collectionHeading = await screen.findByRole('heading', {
      name: 'M3.1 Full Review Collection',
    });
    expect(collectionHeading).toBeInTheDocument();

    // Progress bar and log are present
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    expect(screen.getByLabelText('Resolution log')).toHaveTextContent(/Resolution complete/i);

    // Verify canonical table section order: Mods, Plugins, Datapacks, Resource Packs, Shaders
    const tableSections = document.querySelectorAll('section.table-section');
    const sectionOrder = Array.from(tableSections).map((el) =>
      el.getAttribute('data-project-type'),
    );
    expect(sectionOrder).toEqual(['mod', 'plugin', 'datapack', 'resourcepack', 'shader']);

    // Check Mods table rows, versions, support tags, unsupported cells, missing version cells, and platform column
    const modsTable = screen.getByRole('table', { name: 'Mods table' });

    const sodiumRow = modsTable.querySelector('tr[data-project-id="mod-sodium"]') as HTMLElement;
    expect(sodiumRow).toBeTruthy();
    const sodiumLink = within(sodiumRow).getByRole('link', { name: 'Open Sodium on Modrinth' });
    expect(sodiumLink).toHaveAttribute('href', 'https://modrinth.com/mod/sodium');
    expect(sodiumLink).toHaveAttribute('target', '_blank');
    const sodiumCells = within(sodiumRow).getAllByRole('cell');
    expect(sodiumCells[1]).toHaveTextContent('Fabric');
    expect(sodiumCells[2]).toHaveTextContent('0.5.8+mc1.20.1');
    expect(sodiumCells[2]).toHaveTextContent('required');
    expect(within(sodiumCells[3]!).getByLabelText('Unsupported')).toHaveTextContent('✗');

    const lithiumRow = modsTable.querySelector('tr[data-project-id="mod-lithium"]') as HTMLElement;
    const lithiumCells = within(lithiumRow).getAllByRole('cell');
    expect(lithiumCells[2]).toHaveTextContent('0.11.2');
    expect(lithiumCells[2]).toHaveTextContent('beta');
    expect(lithiumCells[2]).toHaveTextContent('optional');
    expect(lithiumCells[3]).toHaveTextContent('0.11.2');
    expect(lithiumCells[3]).toHaveTextContent('required');

    const fallbackRow = modsTable.querySelector(
      'tr[data-project-id="mod-fallback"]',
    ) as HTMLElement;
    const fallbackCells = within(fallbackRow).getAllByRole('cell');
    expect(fallbackCells[2]).toHaveTextContent('1.0.0-any');
    expect(fallbackCells[2]).toHaveTextContent('unverified platform');
    expect(fallbackCells[2]).toHaveTextContent('unknown');

    const missingRow = modsTable.querySelector('tr[data-project-id="mod-missing"]') as HTMLElement;
    const missingCells = within(missingRow).getAllByRole('cell');
    expect(missingCells[2]).toHaveTextContent('No compatible version');
    expect(missingCells[2]).toHaveTextContent('required');
    expect(missingCells[3]).toHaveTextContent('No compatible version');

    // Dependencies footer in the Mods table
    expect(within(modsTable).getByRole('rowheader', { name: 'Dependencies' })).toBeInTheDocument();
    const fapiRow = modsTable.querySelector('tr[data-project-id="dep-fabric-api"]') as HTMLElement;
    expect(fapiRow).toBeTruthy();
    expect(fapiRow).toHaveAttribute('data-origin', 'dependency');
    expect(fapiRow).toHaveTextContent('required by: Sodium, Lithium (client)');
    expect(fapiRow).toHaveTextContent('required by: Lithium (server)');

    // Platform-agnostic tables show "—" in Platform column
    const datapacksTable = screen.getByRole('table', { name: 'Datapacks table' });
    const terralithRow = datapacksTable.querySelector(
      'tr[data-project-id="dp-terralith"]',
    ) as HTMLElement;
    expect(within(terralithRow).getAllByRole('cell')[1]).toHaveTextContent('—');

    const resourcePacksTable = screen.getByRole('table', { name: 'Resource Packs table' });
    const faithfulRow = resourcePacksTable.querySelector(
      'tr[data-project-id="rp-faithful"]',
    ) as HTMLElement;
    expect(within(faithfulRow).getAllByRole('cell')[1]).toHaveTextContent('—');

    const shadersTable = screen.getByRole('table', { name: 'Shaders table' });
    const shaderRow = shadersTable.querySelector(
      'tr[data-project-id="shader-iris"]',
    ) as HTMLElement;
    expect(within(shaderRow).getAllByRole('cell')[1]).toHaveTextContent('—');

    // Skipped section displays modpack and unknown type projects with reasons
    const skippedSection = screen.getByRole('region', { name: 'Skipped Projects' });
    expect(within(skippedSection).getByText('Fabulously Optimized')).toBeInTheDocument();
    expect(
      within(skippedSection).getByText(
        /Modpacks \(\.mrpack\) cannot be downloaded as individual projects/i,
      ),
    ).toBeInTheDocument();
    expect(within(skippedSection).getByText('Mystery Widget')).toBeInTheDocument();
    expect(
      within(skippedSection).getByText(/Unsupported project type: widget/i),
    ).toBeInTheDocument();

    // Export instance.json validates against schema and round-trips via deserialize
    fireEvent.click(screen.getByRole('button', { name: 'Export instance.json' }));
    expect(exportedPayloads).toHaveLength(1);
    expect(exportedPayloads[0]!.filename).toBe('col-m31-instance.json');

    const parsed = JSON.parse(exportedPayloads[0]!.json) as unknown;
    const validation = validateInstanceSchema(parsed);
    expect(validation).toEqual({ valid: true, errors: [] });

    const roundTripped = deserialize(exportedPayloads[0]!.json);
    expect(roundTripped.meta.name).toBe('M3.1 Full Review Collection');
    expect(roundTripped.meta.source.collectionId).toBe('col-m31');
    expect(roundTripped.meta.target).toEqual({
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });
  });

  it('supports cancelling an in-flight collection resolution via the Cancel button, clearing stale state, and isolating superseded controllers', async () => {
    const baseClient = buildFullM31FakeClient();

    const signals: AbortSignal[] = [];
    const deferredCalls: Array<{
      id: string;
      resolve: (value: Awaited<ReturnType<ModrinthClient['getCollection']>>) => void;
      reject: (reason?: unknown) => void;
    }> = [];

    const controlledClient: ModrinthClient = {
      getGameVersions: (opts) => baseClient.getGameVersions(opts),
      getPlatforms: (opts) => baseClient.getPlatforms(opts),
      getProjects: (ids, opts) => baseClient.getProjects(ids, opts),
      getProjectVersions: (id, q, opts) => baseClient.getProjectVersions(id, q, opts),
      getVersionsByIds: (ids, opts) => baseClient.getVersionsByIds(ids, opts),
      getCollection: (id: string, opts?: RequestOptions) => {
        if (opts?.signal) {
          signals.push(opts.signal);
        }
        if (id === 'col-m31') {
          return baseClient.getCollection(id, opts);
        }
        return new Promise((resolve, reject) => {
          deferredCalls.push({ id, resolve, reject });
        });
      },
    };

    render(<App modrinthClient={controlledClient} />);

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    // 1. First resolve 'col-m31' to populate instance and skipped projects
    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-m31' },
    });
    fireEvent.click(loadButton);

    expect(
      await screen.findByRole('heading', { name: 'M3.1 Full Review Collection' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Skipped Projects' })).toBeInTheDocument();

    // 2. Start a second resolution ('col-slow-1') and verify stale instance & skipped are cleared immediately
    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-slow-1' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

    expect(
      screen.queryByRole('heading', { name: 'M3.1 Full Review Collection' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Skipped Projects' })).not.toBeInTheDocument();

    const cancelButton = await screen.findByRole('button', { name: 'Cancel' });
    fireEvent.click(cancelButton);

    // Signal was aborted and terminal 'Cancelled' phase label is shown
    expect(signals[1]?.aborted).toBe(true);
    expect(await screen.findByRole('status')).toHaveTextContent('Resolution cancelled.');
    const progressRegion = screen.getByRole('region', { name: 'Resolution progress' });
    expect(within(progressRegion).getByText('Cancelled')).toBeInTheDocument();

    // 3. Start a third resolution ('col-slow-2'), then before its abort rejection fires,
    //    cancel and immediately start a fourth resolution ('col-slow-3') to verify
    //    the superseded third controller's delayed abort rejection does not clobber the fourth
    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-slow-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    // Cancel 'col-slow-2' so button re-enables, then start 'col-slow-3'
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-slow-3' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));
    expect(await screen.findByRole('button', { name: 'Cancel' })).toBeInTheDocument();

    // Now the superseded 'col-slow-2' promise rejects asynchronously with AbortError
    const slow2 = deferredCalls.find((d) => d.id === 'col-slow-2');
    expect(slow2).toBeDefined();
    slow2!.reject(new DOMException('The operation was aborted.', 'AbortError'));

    // Give microtasks a turn; 'col-slow-3' must still be actively resolving with Cancel button visible
    await Promise.resolve();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('displays an error alert banner and "Failed" terminal phase label when collection resolution fails', async () => {
    const client = buildFullM31FakeClient();
    client.failOn('getCollection', new Error('Collection 404: not found on Modrinth'));

    render(<App modrinthClient={client} />);

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-missing' },
    });
    fireEvent.click(loadButton);

    const progressRegion = await screen.findByRole('region', { name: 'Resolution progress' });
    const alert = await within(progressRegion).findByRole('alert');
    expect(alert).toHaveTextContent('Collection 404: not found on Modrinth');
    expect(within(progressRegion).getByText('Failed')).toBeInTheDocument();
  });

  it('handles triggerTextDownload DOM/ObjectURL cleanup and surfaces export errors in App', async () => {
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    const createObjectURLMock = vi.fn(() => 'blob:https://example.test/instance-1');
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
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    try {
      triggerTextDownload('test-instance.json', '{"hello":"world"}');

      expect(createObjectURLMock).toHaveBeenCalledTimes(1);
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLMock).toHaveBeenCalledWith('blob:https://example.test/instance-1');
      expect(document.body.querySelector('a[download="test-instance.json"]')).toBeNull();

      // Verify cleanup still occurs in finally when anchor.click() throws
      clickSpy.mockImplementationOnce(() => {
        throw new Error('Blocked download');
      });
      expect(() => triggerTextDownload('throwing.json', '{}')).toThrow('Blocked download');
      expect(revokeObjectURLMock).toHaveBeenCalledTimes(2);
      expect(document.body.querySelector('a[download="throwing.json"]')).toBeNull();
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

    // Verify App surfaces an error alert when onExportJson throws
    const client = buildFullM31FakeClient();
    render(
      <App
        modrinthClient={client}
        onExportJson={() => {
          throw new Error('Disk quota exceeded during export');
        }}
      />,
    );

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-m31' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.click(loadButton);

    const exportBtn = await screen.findByRole('button', { name: 'Export instance.json' });
    fireEvent.click(exportBtn);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Disk quota exceeded during export',
    );
  });

  it('supports unchecking preferStable (releasePreference: "newest") and renders empty exportable entries state', async () => {
    const client = buildFullM31FakeClient();
    client.setCollection('col-empty-exportable', ['modpack-fabulously'], 'Modpack-Only Collection');

    render(<App modrinthClient={client} />);

    const loadButton = await screen.findByRole('button', { name: 'Load collection' });
    await waitFor(() => {
      expect(loadButton).not.toBeDisabled();
    });

    const preferStableCheckbox = screen.getByLabelText(
      'Prefer stable releases over newest alpha/beta',
    );
    expect(preferStableCheckbox).toBeChecked();
    fireEvent.click(preferStableCheckbox);
    expect(preferStableCheckbox).not.toBeChecked();

    fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
      target: { value: 'col-empty-exportable' },
    });
    fireEvent.change(screen.getByLabelText('Game Version'), {
      target: { value: '1.20.1' },
    });
    fireEvent.click(loadButton);

    expect(
      await screen.findByRole('heading', { name: 'Modpack-Only Collection' }),
    ).toBeInTheDocument();

    const summaryRegion = screen.getByRole('region', { name: 'Collection summary' });
    expect(within(summaryRegion).getByText('newest')).toBeInTheDocument();

    expect(
      screen.getByText('No exportable projects found in this collection.'),
    ).toBeInTheDocument();
  });
});
