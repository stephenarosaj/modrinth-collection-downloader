import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import { resolveCollection, toTables } from '../../src/core';
import { App } from '../../src/ui/App';
import { EntryTables } from '../../src/ui/components/EntryTables';
import { StatusSymbol } from '../../src/ui/components/StatusSymbol';
import { FakeModrinthClient } from '../helpers/fake-modrinth-client';

function buildM33FakeClient(): FakeModrinthClient {
  const client = new FakeModrinthClient({
    gameVersions: [
      { version: '1.20.1', versionType: 'release', date: '2023-06-12T00:00:00Z', major: true },
    ],
    platforms: [{ name: 'fabric', supportedProjectTypes: ['mod'] }],
  });

  client.setCollection(
    'col-m33',
    [
      'mod-ok',
      'mod-missing-client',
      'mod-needs-server-unavail',
      'mod-fallback',
      'mod-unknown',
      'mod-pin-a',
      'mod-pin-b',
    ],
    'M3.3 Status & Highlights Suite',
  );

  client.addProjects([
    // 1. Clean OK mod on both environments, requires dep-selectable
    {
      id: 'mod-ok',
      slug: 'clean-mod',
      title: 'Clean Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/clean-mod',
      support: { client: 'required', server: 'required' },
    },
    // 2. Missing compatible version on Client, valid on Server (tests NO_COMPATIBLE_VERSION + single-env vs both-env ring/row status)
    {
      id: 'mod-missing-client',
      slug: 'missing-client-mod',
      title: 'Missing Client Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/missing-client-mod',
      support: { client: 'required', server: 'optional' },
    },
    // 3. Requires dep-client-only on both Client and Server, but dep-client-only is unsupported on Server
    //    (tests DEPENDENCY_UNAVAILABLE + NEEDED_BUT_UNAVAILABLE dual highlighting on an unsupported ✗ cell)
    {
      id: 'mod-needs-server-unavail',
      slug: 'server-bridged-mod',
      title: 'Server Bridged Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/server-bridged-mod',
      support: { client: 'required', server: 'required' },
    },
    // 4. Game-version fallback on Client (PLATFORM_UNVERIFIED), normal on Server
    {
      id: 'mod-fallback',
      slug: 'fallback-mod',
      title: 'Fallback Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/fallback-mod',
      support: { client: 'optional', server: 'optional' },
    },
    // 5. Unknown support on Client (SUPPORT_UNKNOWN), optional on Server
    {
      id: 'mod-unknown',
      slug: 'mystery-support-mod',
      title: 'Mystery Support Mod',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/mystery-support-mod',
      support: { client: 'unknown', server: 'optional' },
    },
    // 6 & 7. Two mods that pin different compatible versions of dep-pinned on Client (PIN_CONFLICT)
    {
      id: 'mod-pin-a',
      slug: 'pin-mod-a',
      title: 'Pin Mod A',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/pin-mod-a',
      support: { client: 'required', server: 'unsupported' },
    },
    {
      id: 'mod-pin-b',
      slug: 'pin-mod-b',
      title: 'Pin Mod B',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/pin-mod-b',
      support: { client: 'required', server: 'unsupported' },
    },
    // Dependencies:
    // dep-selectable: normal required dependency of Clean Mod (tests REQUIRED_DEPENDENCY_NOT_SELECTED in isolation when deselected on Client)
    {
      id: 'dep-selectable',
      slug: 'core-lib',
      title: 'Core Lib',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/core-lib',
      support: { client: 'optional', server: 'required' },
    },
    // dep-client-only: supported on Client, unsupported (✗) on Server, required by Server Bridged Mod
    {
      id: 'dep-client-only',
      slug: 'client-render-lib',
      title: 'Client Render Lib',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/client-render-lib',
      support: { client: 'required', server: 'unsupported' },
    },
    // dep-pinned: pinned to v-pin-1 by Pin Mod A and v-pin-2 by Pin Mod B on Client
    {
      id: 'dep-pinned',
      slug: 'pinned-lib',
      title: 'Pinned Lib',
      type: 'mod',
      modrinthUrl: 'https://modrinth.com/mod/pinned-lib',
      support: { client: 'required', server: 'unsupported' },
    },
  ]);

  client.addVersions([
    {
      id: 'v-ok',
      projectId: 'mod-ok',
      versionNumber: '1.0.0',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-selectable', type: 'required' }],
    },
    // mod-missing-client has no 1.20.1 fabric version, only 1.19.4 (so version === null for 1.20.1)
    {
      id: 'v-missing-old',
      projectId: 'mod-missing-client',
      versionNumber: '0.9.0',
      versionType: 'release',
      publishedAt: '2023-01-01T00:00:00Z',
      gameVersions: ['1.19.4'],
      platforms: ['fabric'],
    },
    {
      id: 'v-needs-server-unavail',
      projectId: 'mod-needs-server-unavail',
      versionNumber: '2.1.0',
      versionType: 'release',
      publishedAt: '2024-05-02T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-client-only', type: 'required' }],
    },
    {
      id: 'v-fallback',
      projectId: 'mod-fallback',
      versionNumber: '1.2.0-universal',
      versionType: 'release',
      publishedAt: '2024-05-03T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: [],
    },
    {
      id: 'v-unknown',
      projectId: 'mod-unknown',
      versionNumber: '3.0.0',
      versionType: 'release',
      publishedAt: '2024-05-04T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
    {
      id: 'v-pin-a',
      projectId: 'mod-pin-a',
      versionNumber: '1.0.0',
      versionType: 'release',
      publishedAt: '2024-05-05T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-pinned', versionId: 'v-pinned-1', type: 'required' }],
    },
    {
      id: 'v-pin-b',
      projectId: 'mod-pin-b',
      versionNumber: '1.0.0',
      versionType: 'release',
      publishedAt: '2024-05-06T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
      dependencies: [{ projectId: 'dep-pinned', versionId: 'v-pinned-2', type: 'required' }],
    },
    {
      id: 'v-dep-selectable',
      projectId: 'dep-selectable',
      versionNumber: '1.4.0',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
    {
      id: 'v-dep-client-only',
      projectId: 'dep-client-only',
      versionNumber: '2.0.0',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
    {
      id: 'v-pinned-1',
      projectId: 'dep-pinned',
      versionNumber: '1.0.0',
      versionType: 'release',
      publishedAt: '2024-04-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
    {
      id: 'v-pinned-2',
      projectId: 'dep-pinned',
      versionNumber: '1.1.0',
      versionType: 'release',
      publishedAt: '2024-05-01T00:00:00Z',
      gameVersions: ['1.20.1'],
      platforms: ['fabric'],
    },
  ]);

  return client;
}

async function renderAndLoadM33Collection(client: FakeModrinthClient) {
  const view = render(<App modrinthClient={client} />);

  const loadButton = await screen.findByRole('button', { name: 'Load collection' });
  await waitFor(() => {
    expect(loadButton).not.toBeDisabled();
  });

  fireEvent.change(screen.getByLabelText('Collection URL or ID'), {
    target: { value: 'col-m33' },
  });
  fireEvent.change(screen.getByLabelText('Game Version'), {
    target: { value: '1.20.1' },
  });
  fireEvent.change(screen.getByLabelText('Platform'), {
    target: { value: 'fabric' },
  });

  fireEvent.click(loadButton);

  await screen.findByRole('heading', { name: 'M3.3 Status & Highlights Suite' });
  return view;
}

function getRow(projectId: string): HTMLElement {
  const row = document.querySelector(`tr[data-project-id="${projectId}"]`) as HTMLElement | null;
  expect(row).toBeTruthy();
  return row!;
}

function getEnvCell(projectId: string, env: 'client' | 'server'): HTMLElement {
  const row = getRow(projectId);
  const cell = row.querySelector(`td[data-env="${env}"]`) as HTMLElement | null;
  expect(cell).toBeTruthy();
  return cell!;
}

describe('M3.3 Status symbols, tooltips, highlights, and accessibility', () => {
  it('gates status symbols, row tints, and cell rings by active environment toggles (§7.3.1)', async () => {
    const client = buildM33FakeClient();
    await renderAndLoadM33Collection(client);

    // 1. Both Client and Server toggles are off on initial load:
    //    No status symbols, no tooltips, no row tints, and no cell rings
    expect(screen.queryAllByRole('tooltip')).toHaveLength(0);
    expect(document.querySelectorAll('button.status-symbol')).toHaveLength(0);
    expect(document.querySelectorAll('.row-tint')).toHaveLength(0);
    expect(document.querySelectorAll('.env-cell-ring')).toHaveLength(0);

    const allRows = Array.from(document.querySelectorAll('tr.entry-row'));
    expect(allRows.length).toBeGreaterThan(0);
    for (const row of allRows) {
      expect(row).toHaveAttribute('data-row-status', 'none');
    }

    const allEnvCells = Array.from(document.querySelectorAll('td.env-cell'));
    for (const cell of allEnvCells) {
      expect(cell).toHaveAttribute('data-cell-status', 'none');
    }

    // 2. Turn on Client environment only:
    //    Server Bridged Mod is OK on Client (because dep-client-only is available on Client),
    //    even though it has DEPENDENCY_UNAVAILABLE on Server!
    fireEvent.click(screen.getByLabelText('Client environment'));

    const bridgedRow = getRow('mod-needs-server-unavail');
    expect(bridgedRow).toHaveAttribute('data-row-status', 'ok');
    expect(bridgedRow).not.toHaveClass('row-tint-error');
    expect(getEnvCell('mod-needs-server-unavail', 'client')).toHaveAttribute(
      'data-cell-status',
      'ok',
    );
    expect(getEnvCell('mod-needs-server-unavail', 'server')).toHaveAttribute(
      'data-cell-status',
      'none',
    );
    expect(getEnvCell('mod-needs-server-unavail', 'server')).not.toHaveClass('env-cell-ring-error');

    const clientRenderLibRow = getRow('dep-client-only');
    expect(clientRenderLibRow).toHaveAttribute('data-row-status', 'ok');
    expect(getEnvCell('dep-client-only', 'server')).toHaveAttribute('data-cell-status', 'none');
    expect(getEnvCell('dep-client-only', 'server')).not.toHaveClass('env-cell-ring-error');

    // Missing Client Mod has NO_COMPATIBLE_VERSION on Client -> Client cell has ring, Server cell has no ring (inactive)
    const missingRow = getRow('mod-missing-client');
    expect(missingRow).toHaveAttribute('data-row-status', 'error');
    expect(missingRow).toHaveClass('row-tint', 'row-tint-error');
    expect(getEnvCell('mod-missing-client', 'client')).toHaveClass(
      'env-cell-ring',
      'env-cell-ring-error',
    );
    expect(getEnvCell('mod-missing-client', 'server')).not.toHaveClass('env-cell-ring');
    expect(within(missingRow).getByRole('tooltip')).toHaveTextContent(
      'Client: No compatible version is available for this environment.',
    );

    // 3. Turn on Server environment as well:
    //    Missing Client Mod is missing in both Client and Server -> both cells get error rings and tooltip shows both
    fireEvent.click(screen.getByLabelText('Server environment'));

    expect(getEnvCell('mod-missing-client', 'client')).toHaveClass('env-cell-ring-error');
    expect(getEnvCell('mod-missing-client', 'server')).toHaveClass('env-cell-ring-error');
    const missingTooltipText = within(missingRow).getByRole('tooltip').textContent;
    expect(missingTooltipText).toContain(
      'Client: No compatible version is available for this environment.',
    );
    expect(missingTooltipText).toContain(
      'Server: No compatible version is available for this environment.',
    );
  });

  it('renders distinct symbols, tooltips, row tints, and per-cell rings for all 8 Reasons and 4 Kinds, including dual dependency highlighting (§7.4, §7.5, §13 M3.3)', async () => {
    const client = buildM33FakeClient();
    await renderAndLoadM33Collection(client);

    // Activate both Client and Server environments
    fireEvent.click(screen.getByLabelText('Client environment'));
    fireEvent.click(screen.getByLabelText('Server environment'));

    // --- 1. OK (`ok`) ---
    const okRow = getRow('mod-ok');
    expect(okRow).toHaveAttribute('data-row-status', 'ok');
    expect(okRow).not.toHaveClass('row-tint');
    const okBtn = within(okRow).getByRole('button', { name: /Clean Mod status: OK/i });
    expect(okBtn).toHaveAttribute('data-status-kind', 'ok');
    expect(okBtn).toHaveAttribute('data-status-symbol', '✓');
    expect(okBtn).toHaveClass('status-symbol-ok', 'status-shape-circle');
    expect(within(okRow).getByRole('tooltip')).toHaveTextContent('OK');
    expect(getEnvCell('mod-ok', 'client')).not.toHaveClass('env-cell-ring');
    expect(getEnvCell('mod-ok', 'server')).not.toHaveClass('env-cell-ring');

    // --- 2. NO_COMPATIBLE_VERSION (`error`) ---
    const missingRow = getRow('mod-missing-client');
    expect(missingRow).toHaveAttribute('data-row-status', 'error');
    expect(missingRow).toHaveClass('row-tint', 'row-tint-error');
    const missingBtn = within(missingRow).getByRole('button', {
      name: /Missing Client Mod status: Error/i,
    });
    expect(missingBtn).toHaveAttribute('data-status-kind', 'error');
    expect(missingBtn).toHaveAttribute('data-status-symbol', '⚠!');
    expect(missingBtn).toHaveAttribute('data-status-reasons', 'NO_COMPATIBLE_VERSION');
    expect(missingBtn).toHaveClass('status-symbol-error', 'status-shape-error-triangle');

    // --- 3 & 4. DEPENDENCY_UNAVAILABLE & NEEDED_BUT_UNAVAILABLE (`error` — dual highlighting) ---
    // On Server, Server Bridged Mod is selected and requires Client Render Lib, which is unsupported (✗) on Server.
    // On Client, both are OK.
    const bridgedRow = getRow('mod-needs-server-unavail');
    expect(bridgedRow).toHaveAttribute('data-row-status', 'error');
    expect(bridgedRow).toHaveClass('row-tint', 'row-tint-error');
    const bridgedBtn = within(bridgedRow).getByRole('button', {
      name: /Server Bridged Mod status: Error/i,
    });
    expect(bridgedBtn).toHaveAttribute('data-status-kind', 'error');
    expect(bridgedBtn).toHaveAttribute('data-status-reasons', 'DEPENDENCY_UNAVAILABLE');
    expect(within(bridgedRow).getByRole('tooltip')).toHaveTextContent(
      'Server: A required dependency is unavailable in this environment.',
    );
    // Single-environment ring placement: Client cell is OK (no ring), Server cell has error ring
    expect(getEnvCell('mod-needs-server-unavail', 'client')).toHaveAttribute(
      'data-cell-status',
      'ok',
    );
    expect(getEnvCell('mod-needs-server-unavail', 'client')).not.toHaveClass('env-cell-ring');
    expect(getEnvCell('mod-needs-server-unavail', 'server')).toHaveAttribute(
      'data-cell-status',
      'error',
    );
    expect(getEnvCell('mod-needs-server-unavail', 'server')).toHaveAttribute(
      'data-cell-reasons',
      'DEPENDENCY_UNAVAILABLE',
    );
    expect(getEnvCell('mod-needs-server-unavail', 'server')).toHaveClass(
      'env-cell-ring',
      'env-cell-ring-error',
    );

    // Dual highlight on the dependency row (Client Render Lib) and its unsupported (✗) Server cell:
    const depUnavailRow = getRow('dep-client-only');
    expect(depUnavailRow).toHaveAttribute('data-row-status', 'error');
    expect(depUnavailRow).toHaveClass('row-tint', 'row-tint-error');
    const depUnavailBtn = within(depUnavailRow).getByRole('button', {
      name: /Client Render Lib status: Error/i,
    });
    expect(depUnavailBtn).toHaveAttribute('data-status-kind', 'error');
    expect(depUnavailBtn).toHaveAttribute('data-status-reasons', 'NEEDED_BUT_UNAVAILABLE');
    expect(within(depUnavailRow).getByRole('tooltip')).toHaveTextContent(
      'Server: Required by a selected entry in this environment, but unavailable here.',
    );
    expect(getEnvCell('dep-client-only', 'client')).toHaveAttribute('data-cell-status', 'ok');
    expect(getEnvCell('dep-client-only', 'client')).not.toHaveClass('env-cell-ring');
    const depServerCell = getEnvCell('dep-client-only', 'server');
    expect(within(depServerCell).getByLabelText('Unsupported')).toHaveTextContent('✗');
    expect(depServerCell).toHaveAttribute('data-cell-status', 'error');
    expect(depServerCell).toHaveAttribute('data-cell-reasons', 'NEEDED_BUT_UNAVAILABLE');
    expect(depServerCell).toHaveClass('env-cell-ring', 'env-cell-ring-error');

    // --- 5. PIN_CONFLICT (`warning`) ---
    const pinnedRow = getRow('dep-pinned');
    expect(pinnedRow).toHaveAttribute('data-row-status', 'warning');
    expect(pinnedRow).toHaveClass('row-tint', 'row-tint-warning');
    const pinnedBtn = within(pinnedRow).getByRole('button', {
      name: /Pinned Lib status: Warning/i,
    });
    expect(pinnedBtn).toHaveAttribute('data-status-kind', 'warning');
    expect(pinnedBtn).toHaveAttribute('data-status-symbol', '⚠');
    expect(pinnedBtn).toHaveAttribute('data-status-reasons', 'PIN_CONFLICT');
    expect(pinnedBtn).toHaveClass('status-symbol-warning', 'status-shape-triangle');
    expect(within(pinnedRow).getByRole('tooltip')).toHaveTextContent(
      'Client: Multiple entries pin different versions of this dependency; resolved to the newest compatible pin.',
    );
    expect(getEnvCell('dep-pinned', 'client')).toHaveClass(
      'env-cell-ring',
      'env-cell-ring-warning',
    );
    expect(getEnvCell('dep-pinned', 'server')).not.toHaveClass('env-cell-ring');

    // --- 6. PLATFORM_UNVERIFIED (`warning`) ---
    const fallbackRow = getRow('mod-fallback');
    expect(fallbackRow).toHaveAttribute('data-row-status', 'warning');
    expect(fallbackRow).toHaveClass('row-tint', 'row-tint-warning');
    const fallbackBtn = within(fallbackRow).getByRole('button', {
      name: /Fallback Mod status: Warning/i,
    });
    expect(fallbackBtn).toHaveAttribute('data-status-kind', 'warning');
    expect(fallbackBtn).toHaveAttribute('data-status-reasons', 'PLATFORM_UNVERIFIED');
    expect(within(fallbackRow).getByRole('tooltip')).toHaveTextContent(
      'Client: Resolved via game-version fallback (version does not explicitly list a platform).',
    );
    expect(getEnvCell('mod-fallback', 'client')).toHaveClass(
      'env-cell-ring',
      'env-cell-ring-warning',
    );
    expect(getEnvCell('mod-fallback', 'server')).toHaveClass(
      'env-cell-ring',
      'env-cell-ring-warning',
    );

    // --- 7. SUPPORT_UNKNOWN (`unknown`) ---
    const unknownRow = getRow('mod-unknown');
    expect(unknownRow).toHaveAttribute('data-row-status', 'unknown');
    expect(unknownRow).toHaveClass('row-tint', 'row-tint-unknown');
    const unknownBtn = within(unknownRow).getByRole('button', {
      name: /Mystery Support Mod status: Unknown/i,
    });
    expect(unknownBtn).toHaveAttribute('data-status-kind', 'unknown');
    expect(unknownBtn).toHaveAttribute('data-status-symbol', '?');
    expect(unknownBtn).toHaveAttribute('data-status-reasons', 'SUPPORT_UNKNOWN');
    expect(unknownBtn).toHaveClass('status-symbol-unknown', 'status-shape-question');
    expect(within(unknownRow).getByRole('tooltip')).toHaveTextContent(
      'Client: Environment support is unknown on Modrinth.',
    );
    // Client is unknown (ringed), Server is optional + ok (not ringed)
    expect(getEnvCell('mod-unknown', 'client')).toHaveClass(
      'env-cell-ring',
      'env-cell-ring-unknown',
    );
    expect(getEnvCell('mod-unknown', 'server')).toHaveAttribute('data-cell-status', 'ok');
    expect(getEnvCell('mod-unknown', 'server')).not.toHaveClass('env-cell-ring');

    // --- 8. REQUIRED_DEPENDENCY_NOT_SELECTED (`warning`) ---
    // Explicitly deselect Core Lib on Client while Clean Mod remains selected on Client
    const coreLibClientCb = screen.getByLabelText('Select Core Lib for Client');
    fireEvent.click(coreLibClientCb);

    const coreLibRow = getRow('dep-selectable');
    expect(coreLibRow).toHaveAttribute('data-row-status', 'warning');
    expect(coreLibRow).toHaveClass('row-tint', 'row-tint-warning');
    const coreLibBtn = within(coreLibRow).getByRole('button', {
      name: /Core Lib status: Warning/i,
    });
    expect(coreLibBtn).toHaveAttribute('data-status-reasons', 'REQUIRED_DEPENDENCY_NOT_SELECTED');
    expect(within(coreLibRow).getByRole('tooltip')).toHaveTextContent(
      'Client: Required by a selected entry in this environment, but not selected.',
    );
    expect(getEnvCell('dep-selectable', 'client')).toHaveAttribute(
      'data-cell-reasons',
      'REQUIRED_DEPENDENCY_NOT_SELECTED',
    );
    expect(getEnvCell('dep-selectable', 'client')).toHaveClass(
      'env-cell-ring',
      'env-cell-ring-warning',
    );
    expect(getEnvCell('dep-selectable', 'server')).not.toHaveClass('env-cell-ring');

    // --- 9. REQUIRED_NOT_SELECTED (`warning`) ---
    // Explicitly deselect Clean Mod on Client (support === 'required')
    const cleanModClientCb = screen.getByLabelText('Select Clean Mod for Client');
    fireEvent.click(cleanModClientCb);

    expect(okRow).toHaveAttribute('data-row-status', 'warning');
    expect(okRow).toHaveClass('row-tint', 'row-tint-warning');
    const cleanWarnBtn = within(okRow).getByRole('button', {
      name: /Clean Mod status: Warning/i,
    });
    expect(cleanWarnBtn).toHaveAttribute('data-status-kind', 'warning');
    expect(cleanWarnBtn).toHaveAttribute('data-status-reasons', 'REQUIRED_NOT_SELECTED');
    expect(within(okRow).getByRole('tooltip')).toHaveTextContent(
      'Client: Marked as required for this environment, but explicitly deselected.',
    );
    expect(getEnvCell('mod-ok', 'client')).toHaveClass('env-cell-ring', 'env-cell-ring-warning');
    expect(getEnvCell('mod-ok', 'server')).not.toHaveClass('env-cell-ring');

    // --- 10. Mixed non-OK cell severities on the same row (`warning` on Client + `error` on Server) ---
    // Deselect Server Bridged Mod on Client while Server remains selected:
    // Client becomes warning (REQUIRED_NOT_SELECTED), Server remains error (DEPENDENCY_UNAVAILABLE),
    // and row remains error (worst across active environments).
    const bridgedClientCb = screen.getByLabelText('Select Server Bridged Mod for Client');
    fireEvent.click(bridgedClientCb);

    expect(bridgedRow).toHaveAttribute('data-row-status', 'error');
    expect(bridgedRow).toHaveClass('row-tint', 'row-tint-error');
    const bridgedClientCell = getEnvCell('mod-needs-server-unavail', 'client');
    expect(bridgedClientCell).toHaveAttribute('data-cell-status', 'warning');
    expect(bridgedClientCell).toHaveAttribute('data-cell-reasons', 'REQUIRED_NOT_SELECTED');
    expect(bridgedClientCell).toHaveClass('env-cell-ring', 'env-cell-ring-warning');
    expect(bridgedClientCell).not.toHaveClass('env-cell-ring-error');

    const bridgedServerCell = getEnvCell('mod-needs-server-unavail', 'server');
    expect(bridgedServerCell).toHaveAttribute('data-cell-status', 'error');
    expect(bridgedServerCell).toHaveAttribute('data-cell-reasons', 'DEPENDENCY_UNAVAILABLE');
    expect(bridgedServerCell).toHaveClass('env-cell-ring', 'env-cell-ring-error');

    const bridgedMixedTooltip = within(bridgedRow).getByRole('tooltip').textContent;
    expect(bridgedMixedTooltip).toContain(
      'Client: Marked as required for this environment, but explicitly deselected.',
    );
    expect(bridgedMixedTooltip).toContain(
      'Server: A required dependency is unavailable in this environment.',
    );

    // Re-select Server Bridged Mod on Client to restore initial selection state
    fireEvent.click(bridgedClientCb);
  });

  it('supports keyboard focus on status symbols, links tooltips via aria-describedby, computes status when EntryTables is rendered standalone, and passes axe-core with zero violations', async () => {
    const client = buildM33FakeClient();
    const { container, unmount } = await renderAndLoadM33Collection(client);

    fireEvent.click(screen.getByLabelText('Client environment'));
    fireEvent.click(screen.getByLabelText('Server environment'));

    // Verify keyboard focus and aria-describedby -> role="tooltip" linkage
    const statusButtons = screen.getAllByRole('button', { name: /status:/i });
    expect(statusButtons.length).toBeGreaterThan(0);

    for (const btn of statusButtons) {
      btn.focus();
      expect(btn).toHaveFocus();
      const describedById = btn.getAttribute('aria-describedby');
      expect(describedById).toBeTruthy();
      const tooltipEl = document.getElementById(describedById!);
      expect(tooltipEl).toBeTruthy();
      expect(tooltipEl).toHaveAttribute('role', 'tooltip');
    }

    // Verify WCAG 2.1 SC 1.4.13 Escape dismissal and focus/blur reset on status tooltips
    const firstBtn = statusButtons[0]!;
    firstBtn.focus();
    const firstTooltip = document.getElementById(firstBtn.getAttribute('aria-describedby')!)!;
    expect(firstTooltip).not.toHaveClass('status-tooltip-dismissed');
    fireEvent.keyDown(firstBtn, { key: 'Escape' });
    expect(firstTooltip).toHaveClass('status-tooltip-dismissed');
    fireEvent.blur(firstBtn);
    expect(firstTooltip).not.toHaveClass('status-tooltip-dismissed');
    fireEvent.keyDown(firstBtn, { key: 'Escape' });
    expect(firstTooltip).toHaveClass('status-tooltip-dismissed');
    fireEvent.focus(firstBtn);
    expect(firstTooltip).not.toHaveClass('status-tooltip-dismissed');

    // Run axe-core on the full review screen with active environments, status symbols, tooltips, tints, and rings
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = (() => null) as unknown as typeof originalGetContext;
    try {
      const axeResults = await axe.run(container, {
        rules: {
          'color-contrast': { enabled: false },
        },
      });
      expect(axeResults.violations).toEqual([]);
    } finally {
      HTMLCanvasElement.prototype.getContext = originalGetContext;
    }

    unmount();

    // Also verify standalone <EntryTables /> fallback status computation when neither entryStatuses nor instance is passed
    const resolved = await resolveCollection(client, {
      collectionInput: 'col-m33',
      gameVersion: '1.20.1',
      platform: 'fabric',
      releasePreference: 'stable',
    });
    const standaloneTables = toTables(resolved.instance);

    const standaloneFallbackView = render(
      <EntryTables
        tables={standaloneTables}
        activeEnvironments={{ client: true, server: false }}
      />,
    );

    const standaloneMissingRow = getRow('mod-missing-client');
    expect(standaloneMissingRow).toHaveAttribute('data-row-status', 'error');
    expect(standaloneMissingRow).toHaveClass('row-tint-error');
    standaloneFallbackView.unmount();

    // Verify standalone <EntryTables /> when instance is passed without entryStatuses (`if (instance)` branch)
    const standaloneWithInstanceView = render(
      <EntryTables
        tables={standaloneTables}
        instance={resolved.instance}
        activeEnvironments={{ client: true, server: false }}
      />,
    );
    expect(getRow('mod-missing-client')).toHaveAttribute('data-row-status', 'error');
    expect(getRow('mod-missing-client')).toHaveClass('row-tint-error');
    standaloneWithInstanceView.unmount();

    // Verify standalone <EntryTables tables={[]} /> without entryStatuses or instance (`if (tables.length === 0)` branch)
    const emptyTablesView = render(<EntryTables tables={[]} />);
    expect(
      screen.getByText('No exportable projects found in this collection.'),
    ).toBeInTheDocument();
    emptyTablesView.unmount();

    // Verify <StatusSymbol /> null-row guard (`if (!rowStatus) return null;`)
    const nullStatusView = render(
      <StatusSymbol
        projectId="p1"
        projectTitle="P1"
        entryStatus={{ client: null, server: null, row: null }}
      />,
    );
    expect(nullStatusView.container).toBeEmptyDOMElement();
    nullStatusView.unmount();
  });
});
