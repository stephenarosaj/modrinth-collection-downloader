import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { App } from '../../src/ui/App';
import { formatAutoSelectChanges } from '../../src/ui/components/AutoSelectToast';
import { FakeModrinthClient } from '../helpers/fake-modrinth-client';

function buildM32FakeClient(): FakeModrinthClient {
  const client = new FakeModrinthClient({
    gameVersions: [
      { version: '1.21.1', versionType: 'release', date: '2024-08-08T00:00:00Z', major: false },
      { version: '1.20.1', versionType: 'release', date: '2023-06-12T00:00:00Z', major: true },
    ],
    platforms: [
      { name: 'fabric', supportedProjectTypes: ['mod'] },
      { name: 'neoforge', supportedProjectTypes: ['mod'] },
    ],
  });

  client.setCollection('col-m32', ['mod-alpha', 'mod-beta', 'rp-pack'], 'M3.2 Selection Suite');

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
      id: 'dep-shared',
      slug: 'shared-lib',
      title: 'Shared Lib',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/shared-lib',
      support: { client: 'required', server: 'required' },
    },
    {
      id: 'dep-alpha-only',
      slug: 'alpha-core',
      title: 'Alpha Core',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/alpha-core',
      support: { client: 'required', server: 'required' },
    },
    {
      id: 'dep-extra',
      slug: 'extra-engine',
      title: 'Extra Engine',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/extra-engine',
      support: { client: 'required', server: 'required' },
    },
    {
      id: 'rp-pack',
      slug: 'vivid-pack',
      title: 'Vivid Pack',
      type: 'resourcepack',
      modrinthUrl: 'https://modrinth.com/resourcepack/vivid-pack',
      support: { client: 'required', server: 'unsupported' },
    },
  ]);

  client.addVersions([
    // Alpha Mod versions for 1.20.1 fabric:
    // v-alpha-2 (newest release): requires dep-shared + dep-alpha-only
    // v-alpha-1 (older beta): requires dep-shared + dep-extra (new dep not needed by v-alpha-2!)
    // v-alpha-fallback (no platform listed): fallback candidate
    {
      id: 'v-alpha-2',
      projectId: 'mod-alpha',
      versionNumber: '2.0.0',
      versionType: 'release',
      publishedAt: '2024-05-10T00:00:00Z',
      gameVersions: ['1.20.1', '1.21.1'],
      platforms: ['fabric', 'neoforge'],
      dependencies: [
        { projectId: 'dep-shared', type: 'required' },
        { projectId: 'dep-alpha-only', type: 'required' },
      ],
    },
    {
      id: 'v-alpha-1',
      projectId: 'mod-alpha',
      versionNumber: '1.5.0-beta.1',
      versionType: 'beta',
      publishedAt: '2024-04-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [
        { projectId: 'dep-shared', type: 'required' },
        { projectId: 'dep-extra', type: 'required' },
      ],
    },
    {
      id: 'v-alpha-unverified',
      projectId: 'mod-alpha',
      versionNumber: '1.0.0-universal',
      versionType: 'release',
      publishedAt: '2024-01-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: [],
      dependencies: [],
    },
    // Beta Mod version: requires dep-shared
    {
      id: 'v-beta-1',
      projectId: 'mod-beta',
      versionNumber: '1.1.0',
      versionType: 'release',
      publishedAt: '2024-05-05T00:00:00Z',
      gameVersions: ['1.20.1', '1.21.1'],
      platforms: ['fabric', 'neoforge'],
      dependencies: [{ projectId: 'dep-shared', type: 'required' }],
    },
    // Dependencies
    {
      id: 'v-shared-1',
      projectId: 'dep-shared',
      versionNumber: '3.2.0',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1', '1.21.1'],
      platforms: ['fabric', 'neoforge'],
    },
    {
      id: 'v-alpha-only-1',
      projectId: 'dep-alpha-only',
      versionNumber: '1.0.4',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1', '1.21.1'],
      platforms: ['fabric', 'neoforge'],
    },
    {
      id: 'v-extra-1',
      projectId: 'dep-extra',
      versionNumber: '0.9.0',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1', '1.21.1'],
      platforms: ['fabric', 'neoforge'],
    },
    {
      id: 'v-rp-1',
      projectId: 'rp-pack',
      versionNumber: '4.0',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1', '1.21.1'],
      platforms: ['minecraft'],
    },
  ]);

  return client;
}

async function renderAndLoadM32Collection(client: FakeModrinthClient) {
  render(<App modrinthClient={client} />);

  const loadButton = await screen.findByRole('button', { name: 'Load collection' });
  await waitFor(() => {
    expect(loadButton).not.toBeDisabled();
  });

  fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
    target: { value: 'col-m32' },
  });
  fireEvent.change(screen.getByLabelText('Game Version'), {
    target: { value: '1.20.1' },
  });
  fireEvent.change(screen.getByLabelText('Platform'), {
    target: { value: 'fabric' },
  });

  fireEvent.click(loadButton);

  await screen.findByRole('heading', { name: 'M3.2 Selection Suite' });
}

describe('M3.2 Selection and dependency auto-select', () => {
  it('keeps Client and Server environment toggles off by default while showing underlying selections, and enables only the toggled column without mutating selections (§7.3.1)', async () => {
    const client = buildM32FakeClient();
    await renderAndLoadM32Collection(client);

    const clientToggle = screen.getByLabelText('Client environment') as HTMLInputElement;
    const serverToggle = screen.getByLabelText('Server environment') as HTMLInputElement;

    // Both environment toggles are off by default
    expect(clientToggle).not.toBeChecked();
    expect(serverToggle).not.toBeChecked();

    // Checkboxes and version selects in both columns are disabled, but underlying selections show through
    const alphaClientCb = screen.getByLabelText('Select Alpha Mod for Client') as HTMLInputElement;
    const alphaServerCb = screen.getByLabelText('Select Alpha Mod for Server') as HTMLInputElement;
    const sharedClientCb = screen.getByLabelText('Select Shared Lib for Client') as HTMLInputElement;
    const alphaClientVer = screen.getByLabelText('Alpha Mod Client version') as HTMLSelectElement;
    const alphaServerVer = screen.getByLabelText('Alpha Mod Server version') as HTMLSelectElement;
    const modsClientSelectAll = screen.getByLabelText(
      'Select all Mods for Client',
    ) as HTMLInputElement;
    const modsServerSelectAll = screen.getByLabelText(
      'Select all Mods for Server',
    ) as HTMLInputElement;

    expect(alphaClientCb).toBeChecked();
    expect(alphaClientCb).toBeDisabled();
    expect(alphaServerCb).toBeChecked();
    expect(alphaServerCb).toBeDisabled();
    expect(sharedClientCb).toBeChecked();
    expect(sharedClientCb).toBeDisabled();
    expect(alphaClientVer).toBeDisabled();
    expect(alphaClientVer.value).toBe('v-alpha-2');
    expect(alphaServerVer).toBeDisabled();
    expect(modsClientSelectAll).toBeChecked();
    expect(modsClientSelectAll).toBeDisabled();
    expect(modsServerSelectAll).toBeChecked();
    expect(modsServerSelectAll).toBeDisabled();

    // Both columns have env-col-inactive class while off
    expect(alphaClientCb.closest('td')).toHaveClass('env-col-inactive');
    expect(alphaServerCb.closest('td')).toHaveClass('env-col-inactive');

    // Enable Client environment only
    fireEvent.click(clientToggle);
    expect(clientToggle).toBeChecked();
    expect(serverToggle).not.toBeChecked();

    expect(alphaClientCb).not.toBeDisabled();
    expect(alphaClientVer).not.toBeDisabled();
    expect(modsClientSelectAll).not.toBeDisabled();
    expect(alphaClientCb.closest('td')).not.toHaveClass('env-col-inactive');

    // Server remains disabled and inactive
    expect(alphaServerCb).toBeDisabled();
    expect(alphaServerVer).toBeDisabled();
    expect(modsServerSelectAll).toBeDisabled();
    expect(alphaServerCb.closest('td')).toHaveClass('env-col-inactive');

    // Deselect Beta Mod on Client, then turn Client toggle off and back on: selection is preserved
    const betaClientCb = screen.getByLabelText('Select Beta Mod for Client') as HTMLInputElement;
    fireEvent.click(betaClientCb);
    expect(betaClientCb).not.toBeChecked();

    fireEvent.click(clientToggle);
    expect(clientToggle).not.toBeChecked();
    expect(betaClientCb).toBeDisabled();
    expect(betaClientCb).not.toBeChecked();

    fireEvent.click(clientToggle);
    expect(betaClientCb).not.toBeDisabled();
    expect(betaClientCb).not.toBeChecked();
  });

  it('auto-deselects auto dependencies only when no longer required by any selected entry, and preserves user-selected dependencies (§7.3)', async () => {
    const client = buildM32FakeClient();
    await renderAndLoadM32Collection(client);

    fireEvent.click(screen.getByLabelText('Client environment'));

    const alphaClientCb = screen.getByLabelText('Select Alpha Mod for Client') as HTMLInputElement;
    const betaClientCb = screen.getByLabelText('Select Beta Mod for Client') as HTMLInputElement;
    const sharedClientCb = screen.getByLabelText('Select Shared Lib for Client') as HTMLInputElement;
    const alphaOnlyClientCb = screen.getByLabelText(
      'Select Alpha Core for Client',
    ) as HTMLInputElement;

    expect(alphaClientCb).toBeChecked();
    expect(betaClientCb).toBeChecked();
    expect(sharedClientCb).toBeChecked();
    expect(alphaOnlyClientCb).toBeChecked();

    // Deselecting Alpha Mod auto-deselects Alpha Core (only needed by Alpha Mod),
    // but keeps Shared Lib selected (still needed by Beta Mod)
    fireEvent.click(alphaClientCb);
    expect(alphaClientCb).not.toBeChecked();
    expect(alphaOnlyClientCb).not.toBeChecked();
    expect(sharedClientCb).toBeChecked();

    // Now deselecting Beta Mod auto-deselects Shared Lib as well
    fireEvent.click(betaClientCb);
    expect(betaClientCb).not.toBeChecked();
    expect(sharedClientCb).not.toBeChecked();

    // If the user explicitly selects Shared Lib (source: 'user'), then selects and deselects Beta Mod,
    // Shared Lib remains selected because its source is 'user'
    fireEvent.click(sharedClientCb);
    expect(sharedClientCb).toBeChecked();

    fireEvent.click(betaClientCb);
    expect(betaClientCb).toBeChecked();
    fireEvent.click(betaClientCb);
    expect(betaClientCb).not.toBeChecked();
    expect(sharedClientCb).toBeChecked();
  });

  it('enforces "user-off dependency stays off" when re-selecting parent mods or clicking Select All (§7.3)', async () => {
    const client = buildM32FakeClient();
    await renderAndLoadM32Collection(client);

    fireEvent.click(screen.getByLabelText('Client environment'));

    const alphaClientCb = screen.getByLabelText('Select Alpha Mod for Client') as HTMLInputElement;
    const alphaOnlyClientCb = screen.getByLabelText(
      'Select Alpha Core for Client',
    ) as HTMLInputElement;
    const sharedClientCb = screen.getByLabelText('Select Shared Lib for Client') as HTMLInputElement;
    const modsClientSelectAll = screen.getByLabelText(
      'Select all Mods for Client',
    ) as HTMLInputElement;

    // User explicitly turns off Alpha Core (off/user)
    fireEvent.click(alphaOnlyClientCb);
    expect(alphaOnlyClientCb).not.toBeChecked();
    expect(
      alphaOnlyClientCb.closest('td')?.querySelector('[data-selection-source="user-off"]'),
    ).toBeTruthy();

    // Deselect Alpha Mod, then re-select Alpha Mod: Alpha Core MUST stay off
    fireEvent.click(alphaClientCb);
    expect(alphaClientCb).not.toBeChecked();

    fireEvent.click(alphaClientCb);
    expect(alphaClientCb).toBeChecked();
    expect(alphaOnlyClientCb).not.toBeChecked();

    // Deselect all Mods via header checkbox, then Select all Mods:
    // Shared Lib (which was auto-deselected) re-enables as auto, while Alpha Core (user-off) stays off!
    fireEvent.click(modsClientSelectAll);
    expect(alphaClientCb).not.toBeChecked();
    expect(sharedClientCb).not.toBeChecked();

    fireEvent.click(modsClientSelectAll);
    expect(alphaClientCb).toBeChecked();
    expect(sharedClientCb).toBeChecked();
    expect(alphaOnlyClientCb).not.toBeChecked();
  });

  it('updates header select-all tri-state (checked, indeterminate, unchecked) per table and environment and keeps environments independent (§7.3)', async () => {
    const client = buildM32FakeClient();
    await renderAndLoadM32Collection(client);

    fireEvent.click(screen.getByLabelText('Client environment'));
    fireEvent.click(screen.getByLabelText('Server environment'));

    const modsClientSelectAll = screen.getByLabelText(
      'Select all Mods for Client',
    ) as HTMLInputElement;
    const modsServerSelectAll = screen.getByLabelText(
      'Select all Mods for Server',
    ) as HTMLInputElement;
    const alphaClientCb = screen.getByLabelText('Select Alpha Mod for Client') as HTMLInputElement;
    const betaClientCb = screen.getByLabelText('Select Beta Mod for Client') as HTMLInputElement;
    const alphaServerCb = screen.getByLabelText('Select Alpha Mod for Server') as HTMLInputElement;
    const betaServerCb = screen.getByLabelText('Select Beta Mod for Server') as HTMLInputElement;
    const sharedServerCb = screen.getByLabelText('Select Shared Lib for Server') as HTMLInputElement;

    // Initially all collection mods are selected -> 'checked'
    expect(modsClientSelectAll).toBeChecked();
    expect(modsClientSelectAll.indeterminate).toBe(false);
    expect(modsClientSelectAll).toHaveAttribute('aria-checked', 'true');

    // Deselect one collection mod in Client -> 'indeterminate'
    fireEvent.click(alphaClientCb);
    expect(modsClientSelectAll).not.toBeChecked();
    expect(modsClientSelectAll.indeterminate).toBe(true);
    expect(modsClientSelectAll).toHaveAttribute('aria-checked', 'mixed');

    // Server is completely unaffected
    expect(modsServerSelectAll).toBeChecked();
    expect(modsServerSelectAll.indeterminate).toBe(false);
    expect(alphaServerCb).toBeChecked();
    expect(betaServerCb).toBeChecked();

    // Clicking an indeterminate header select-all selects all collection rows in that table for Client
    fireEvent.click(modsClientSelectAll);
    expect(alphaClientCb).toBeChecked();
    expect(betaClientCb).toBeChecked();
    expect(modsClientSelectAll).toBeChecked();
    expect(modsClientSelectAll.indeterminate).toBe(false);

    // Clicking a checked header select-all deselects all collection rows -> 'unchecked'
    fireEvent.click(modsClientSelectAll);
    expect(alphaClientCb).not.toBeChecked();
    expect(betaClientCb).not.toBeChecked();
    expect(modsClientSelectAll).not.toBeChecked();
    expect(modsClientSelectAll.indeterminate).toBe(false);
    expect(modsClientSelectAll).toHaveAttribute('aria-checked', 'false');

    // Server selections are still untouched
    expect(alphaServerCb).toBeChecked();
    expect(betaServerCb).toBeChecked();
    expect(sharedServerCb).toBeChecked();
  });

  it('recomputes dependency closure when changing version dropdown, fetching newly required dependencies and flashing + announcing changes for 1000ms (§7.2, §7.5)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const client = buildM32FakeClient();
      await renderAndLoadM32Collection(client);

      fireEvent.click(screen.getByLabelText('Client environment'));

      const alphaClientVer = screen.getByLabelText('Alpha Mod Client version') as HTMLSelectElement;
      const optionTexts = within(alphaClientVer)
        .getAllByRole('option')
        .map((o) => o.textContent);

      // Candidate options include release, beta tag, and unverified platform fallback tag
      expect(optionTexts).toEqual([
        '2.0.0',
        '1.5.0-beta.1 (beta)',
        '1.0.0-universal [unverified platform]',
      ]);

      // Initially Extra Engine is not required by any chosen version, so it's not in the table
      expect(screen.queryByLabelText('Select Extra Engine for Client')).not.toBeInTheDocument();

      // Switch Alpha Mod Client version to v-alpha-1 (which requires dep-shared + dep-extra, and drops dep-alpha-only)
      fireEvent.change(alphaClientVer, { target: { value: 'v-alpha-1' } });

      // Wait for async changeEntryVersion to finish recomputing
      const extraClientCb = (await screen.findByLabelText(
        'Select Extra Engine for Client',
      )) as HTMLInputElement;
      expect(extraClientCb).toBeChecked();

      const alphaOnlyClientCb = screen.getByLabelText(
        'Select Alpha Core for Client',
      ) as HTMLInputElement;
      expect(alphaOnlyClientCb).not.toBeChecked();

      // Server version of Alpha Mod is still v-alpha-2 and Alpha Core is still selected on Server
      const alphaServerVer = screen.getByLabelText('Alpha Mod Server version') as HTMLSelectElement;
      expect(alphaServerVer.value).toBe('v-alpha-2');
      expect(screen.getByLabelText('Select Alpha Core for Server')).toBeChecked();

      // Toast announces both auto-selected and auto-deselected dependencies
      const toast = screen.getByRole('status');
      expect(toast).toHaveTextContent(
        'Auto-selected 1 client dependency · Auto-deselected 1 client dependency',
      );

      // Changed cells have env-cell-flash class and data-flashing="true"
      const extraClientTd = extraClientCb.closest('td');
      const alphaOnlyClientTd = alphaOnlyClientCb.closest('td');
      expect(extraClientTd).toHaveClass('env-cell-flash');
      expect(extraClientTd).toHaveAttribute('data-flashing', 'true');
      expect(alphaOnlyClientTd).toHaveClass('env-cell-flash');
      expect(alphaOnlyClientTd).toHaveAttribute('data-flashing', 'true');

      // After 1000ms, the flash classes clear automatically
      act(() => {
        vi.advanceTimersByTime(1000);
      });

      expect(extraClientTd).not.toHaveClass('env-cell-flash');
      expect(extraClientTd).not.toHaveAttribute('data-flashing');
      expect(alphaOnlyClientTd).not.toHaveClass('env-cell-flash');
      expect(alphaOnlyClientTd).not.toHaveAttribute('data-flashing');

      // Clicking Dismiss notification clears the toast (F-08)
      fireEvent.click(screen.getByRole('button', { name: 'Dismiss notification' }));
      expect(screen.queryByRole('status')).not.toBeInTheDocument();

      // Verify prefers-reduced-motion rule exists in styles.css (§7.5)
      const cssContent = readFileSync(
        resolve(process.cwd(), 'src/ui/styles.css'),
        'utf8',
      );
      expect(cssContent).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
      expect(cssContent).toMatch(/\.env-cell-flash\s*\{[^}]*animation:\s*none/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('recovers from an API error during version override, resets isRecomputing, and clears the error alert on a subsequent successful version override (F-02, F-05)', async () => {
    const client = buildM32FakeClient();
    await renderAndLoadM32Collection(client);

    fireEvent.click(screen.getByLabelText('Client environment'));

    const alphaClientVer = screen.getByLabelText('Alpha Mod Client version') as HTMLSelectElement;
    expect(alphaClientVer.value).toBe('v-alpha-2');

    // Mock getProjects to reject on the first call during version override (when fetching dep-extra)
    const getProjectsSpy = vi
      .spyOn(client, 'getProjects')
      .mockRejectedValueOnce(new Error('Simulated network failure while fetching dependencies'));

    fireEvent.change(alphaClientVer, { target: { value: 'v-alpha-1' } });

    // Alert banner shows the error message
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Simulated network failure while fetching dependencies');

    // Controls re-enable (isRecomputing resets to false) and version stays on v-alpha-2
    expect(alphaClientVer).not.toBeDisabled();
    expect(alphaClientVer.value).toBe('v-alpha-2');
    expect(screen.getByRole('button', { name: 'Export instance.json' })).not.toBeDisabled();

    getProjectsSpy.mockRestore();

    // Retry changing version to v-alpha-1 -> clears the error banner and updates version + dependency closure
    fireEvent.change(alphaClientVer, { target: { value: 'v-alpha-1' } });

    const extraClientCb = (await screen.findByLabelText(
      'Select Extra Engine for Client',
    )) as HTMLInputElement;
    expect(extraClientCb).toBeChecked();
    expect(alphaClientVer.value).toBe('v-alpha-1');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('formats plural and multi-environment auto-select toast messages accurately', () => {
    expect(formatAutoSelectChanges([])).toBeNull();
    expect(
      formatAutoSelectChanges([
        { projectId: 'd1', env: 'client', on: true, reason: 'auto-selected' },
        { projectId: 'd2', env: 'client', on: true, reason: 'auto-selected' },
        { projectId: 'd3', env: 'client', on: true, reason: 'auto-selected' },
      ]),
    ).toBe('Auto-selected 3 client dependencies');
    expect(
      formatAutoSelectChanges([
        { projectId: 'd1', env: 'server', on: false, reason: 'auto-deselected' },
        { projectId: 'd2', env: 'server', on: false, reason: 'auto-deselected' },
      ]),
    ).toBe('Auto-deselected 2 server dependencies');
  });

  it('re-resolves immediately on target change when selection matches default, and prompts with ConfirmReResolveDialog when selection differs from default (§7.3, F-01, F-06, F-08)', async () => {
    const client = buildM32FakeClient();
    await renderAndLoadM32Collection(client);

    const collectionInput = screen.getByLabelText('Collection URL or ID') as HTMLInputElement;
    const gameVersionSelect = screen.getByLabelText('Game Version') as HTMLSelectElement;
    const platformSelect = screen.getByLabelText('Platform') as HTMLSelectElement;
    const preferStableCheckbox = screen.getByLabelText(
      'Prefer stable releases over newest alpha/beta',
    ) as HTMLInputElement;

    expect(gameVersionSelect.value).toBe('1.20.1');
    expect(preferStableCheckbox).toBeChecked();

    // 1. Selections are still at initial defaults -> changing Game Version to 1.21.1 re-resolves immediately without confirm dialog
    fireEvent.change(gameVersionSelect, { target: { value: '1.21.1' } });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await screen.findByRole('heading', { name: 'M3.2 Selection Suite' });
    const summaryRegion = screen.getByRole('region', { name: 'Collection summary' });
    await waitFor(() => {
      expect(within(summaryRegion).getByText('1.21.1')).toBeInTheDocument();
    });

    // 2. Now customize a selection so hasSelectionChangedFromDefault(instance) becomes true
    fireEvent.click(screen.getByLabelText('Client environment'));
    const betaClientCb = screen.getByLabelText('Select Beta Mod for Client') as HTMLInputElement;
    fireEvent.click(betaClientCb);
    expect(betaClientCb).not.toBeChecked();

    // 3. Edit collectionInput without submitting, then change Platform to 'neoforge':
    //    ConfirmReResolveDialog opens, Cancel button receives initial focus (F-06),
    //    and collectionInput is synced/reverted to the loaded collection ('col-m32') (F-01)
    fireEvent.change(collectionInput, { target: { value: 'unsubmitted-other-col' } });
    fireEvent.change(platformSelect, { target: { value: 'neoforge' } });

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText(/Re-resolve collection\?/i)).toBeInTheDocument();

    const cancelButton = within(dialog).getByRole('button', { name: 'Cancel' });
    expect(cancelButton).toHaveFocus();

    // 4. Clicking Cancel closes the dialog, preserves the current instance and custom selection,
    //    and reverts the Platform select back to 'fabric' and collectionInput back to 'col-m32'
    fireEvent.click(cancelButton);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(platformSelect.value).toBe('fabric');
    expect(collectionInput.value).toBe('col-m32');
    expect(within(summaryRegion).getByText('Fabric')).toBeInTheDocument();
    expect(screen.getByLabelText('Select Beta Mod for Client')).not.toBeChecked();

    // 5. Toggling "Prefer stable releases over newest alpha/beta" opens ConfirmReResolveDialog,
    //    and pressing Escape closes the dialog and reverts the checkbox (F-06, F-08)
    fireEvent.click(preferStableCheckbox);
    expect(preferStableCheckbox).not.toBeChecked();

    const dialogPreferStable = await screen.findByRole('dialog');
    expect(within(dialogPreferStable).getByRole('button', { name: 'Cancel' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(preferStableCheckbox).toBeChecked();

    // 6. Submitting a different collectionInput while selections are modified opens the dialog,
    //    and cancelling reverts collectionInput back to 'col-m32' (F-01)
    fireEvent.change(collectionInput, { target: { value: 'other-collection' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load collection' }));

    const dialogCollectionSubmit = await screen.findByRole('dialog');
    fireEvent.click(within(dialogCollectionSubmit).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(collectionInput.value).toBe('col-m32');

    // 7. Change Platform to 'neoforge' again and click Confirm Re-resolve ->
    //    re-resolves for NeoForge and resets selections to initial defaults (all selectable collection mods selected)
    fireEvent.change(platformSelect, { target: { value: 'neoforge' } });
    const dialog2 = await screen.findByRole('dialog');
    fireEvent.click(within(dialog2).getByRole('button', { name: 'Confirm Re-resolve' }));

    await screen.findByRole('heading', { name: 'M3.2 Selection Suite' });
    const updatedSummary = screen.getByRole('region', { name: 'Collection summary' });
    await waitFor(() => {
      expect(within(updatedSummary).getByText('NeoForge')).toBeInTheDocument();
    });

    // Selections are reset to initial defaults (Beta Mod is checked again) and environment toggles reset to off
    expect(screen.getByLabelText('Client environment')).not.toBeChecked();
    expect(screen.getByLabelText('Select Beta Mod for Client')).toBeChecked();
  });
});
