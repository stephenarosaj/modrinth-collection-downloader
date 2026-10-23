import { memo, useEffect, useMemo, useRef } from 'react';
import {
  CORE_SCHEMA_VERSION,
  ENVIRONMENTS,
  computeEntryStatus,
  computeHeaderTriState,
  formatCellStatusTooltip,
  formatPlatformDisplayName,
  getHeaderTriState,
  isSelectable,
  isUnverifiedPlatformCandidate,
  type EntryStatus,
  type EnvironmentId,
  type EnvironmentState,
  type ExportableProjectType,
  type HeaderTriState,
  type Instance,
  type ProjectType,
  type Status,
  type TableModel,
  type TableRow,
  type VersionRef,
} from '../../core';
import type { ActiveEnvironments } from './EnvironmentTogglesBar';
import { StatusSymbol } from './StatusSymbol';

export interface EntryTablesProps {
  tables: readonly TableModel[];
  instance?: Instance | null;
  entryStatuses?: ReadonlyMap<string, EntryStatus>;
  targetPlatform?: string;
  activeEnvironments?: ActiveEnvironments;
  flashingCells?: ReadonlySet<string>;
  isRecomputing?: boolean;
  skippedCount?: number;
  onToggleEntrySelection?: (projectId: string, env: EnvironmentId, selected: boolean) => void;
  onToggleSelectAll?: (
    projectType: ExportableProjectType,
    env: EnvironmentId,
    selectAll: boolean,
  ) => void;
  onChangeEntryVersion?: (projectId: string, env: EnvironmentId, versionId: string) => void;
}

export const PROJECT_TYPE_HEADINGS: Readonly<Record<ExportableProjectType, string>> = {
  mod: 'Mods',
  plugin: 'Plugins',
  datapack: 'Datapacks',
  resourcepack: 'Resource Packs',
  shader: 'Shaders',
};

const DEFAULT_ACTIVE_ENVIRONMENTS: ActiveEnvironments = {
  client: false,
  server: false,
};

const EMPTY_FLASHING_SET: ReadonlySet<string> = new Set<string>();

export function formatCandidateOptionLabel(
  candidate: VersionRef,
  projectType: ProjectType,
): string {
  let label = candidate.versionNumber;
  if (candidate.versionType !== 'release') {
    label += ` (${candidate.versionType})`;
  }
  if (isUnverifiedPlatformCandidate(candidate, projectType)) {
    label += ' [unverified platform]';
  }
  return label;
}

function buildCandidateOptions(envState: EnvironmentState): VersionRef[] {
  if (!envState.version) {
    return envState.candidates;
  }
  if (envState.candidates.some((c) => c.id === envState.version!.id)) {
    return envState.candidates;
  }
  return [envState.version, ...envState.candidates];
}

interface HeaderSelectAllCellProps {
  env: EnvironmentId;
  heading: string;
  triState: HeaderTriState;
  hasSelectableCollectionRows: boolean;
  isActive: boolean;
  isRecomputing: boolean;
  onToggle: (selectAll: boolean) => void;
}

function HeaderSelectAllCell({
  env,
  heading,
  triState,
  hasSelectableCollectionRows,
  isActive,
  isRecomputing,
  onToggle,
}: HeaderSelectAllCellProps) {
  const checkboxRef = useRef<HTMLInputElement | null>(null);
  const envLabel = env === 'client' ? 'Client' : 'Server';

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = triState === 'indeterminate';
    }
  }, [triState]);

  return (
    <th scope="col" className={`col-env ${!isActive ? 'env-col-inactive' : ''}`} data-env={env}>
      <div className="th-env-header">
        <input
          ref={(el) => {
            checkboxRef.current = el;
            if (el) {
              el.indeterminate = triState === 'indeterminate';
            }
          }}
          type="checkbox"
          className="env-select-all-checkbox"
          checked={triState === 'checked'}
          aria-checked={triState === 'indeterminate' ? 'mixed' : triState === 'checked'}
          disabled={!isActive || !hasSelectableCollectionRows || isRecomputing}
          aria-label={`Select all ${heading} for ${envLabel}`}
          onChange={() => onToggle(triState !== 'checked')}
        />
        <span>{envLabel}</span>
      </div>
    </th>
  );
}

function areStringArraysEqual(a: readonly string[], b: readonly string[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

function areStatusesEqual(a: Status | null, b: Status | null): boolean {
  if (a === b) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return a.kind === b.kind && areStringArraysEqual(a.reasons, b.reasons);
}

function areEntryStatusesEqual(a: EntryStatus | undefined, b: EntryStatus | undefined): boolean {
  if (a === b) {
    return true;
  }
  if (a === undefined || b === undefined) {
    return false;
  }
  return (
    areStatusesEqual(a.client, b.client) &&
    areStatusesEqual(a.server, b.server) &&
    areStatusesEqual(a.row, b.row)
  );
}

function areCandidatesEqual(a: readonly VersionRef[], b: readonly VersionRef[]): boolean {
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]?.id !== b[i]?.id) {
      return false;
    }
  }
  return true;
}

function areEnvironmentStatesEqual(a: EnvironmentState, b: EnvironmentState): boolean {
  if (a === b) {
    return true;
  }
  return (
    a.support === b.support &&
    (a.version?.id ?? null) === (b.version?.id ?? null) &&
    a.resolution === b.resolution &&
    a.selection.on === b.selection.on &&
    a.selection.source === b.selection.source &&
    areCandidatesEqual(a.candidates, b.candidates)
  );
}

interface EnvironmentCellProps {
  projectId: string;
  projectTitle: string;
  projectType: ProjectType;
  env: EnvironmentId;
  envState: EnvironmentState;
  cellStatus: Status | null;
  isActive: boolean;
  isFlashing: boolean;
  isRecomputing: boolean;
  onToggleEntrySelection?: (projectId: string, env: EnvironmentId, selected: boolean) => void;
  onChangeEntryVersion?: (projectId: string, env: EnvironmentId, versionId: string) => void;
}

function areEnvCellPropsEqual(prev: EnvironmentCellProps, next: EnvironmentCellProps): boolean {
  return (
    prev.projectId === next.projectId &&
    prev.projectTitle === next.projectTitle &&
    prev.projectType === next.projectType &&
    prev.env === next.env &&
    prev.isActive === next.isActive &&
    prev.isFlashing === next.isFlashing &&
    prev.isRecomputing === next.isRecomputing &&
    prev.onToggleEntrySelection === next.onToggleEntrySelection &&
    prev.onChangeEntryVersion === next.onChangeEntryVersion &&
    areEnvironmentStatesEqual(prev.envState, next.envState) &&
    areStatusesEqual(prev.cellStatus, next.cellStatus)
  );
}

const EnvironmentCell = memo(function EnvironmentCell({
  projectId,
  projectTitle,
  projectType,
  env,
  envState,
  cellStatus,
  isActive,
  isFlashing,
  isRecomputing,
  onToggleEntrySelection,
  onChangeEntryVersion,
}: EnvironmentCellProps) {
  const envLabel = env === 'client' ? 'Client' : 'Server';
  const cellKind = cellStatus?.kind ?? 'none';
  const cellReasons = cellStatus?.reasons.join(',') ?? '';
  const hasRing = Boolean(cellStatus && cellStatus.kind !== 'ok');
  const cellTooltip = hasRing ? formatCellStatusTooltip(cellStatus, env) : undefined;

  const baseClassName = [
    'col-env',
    'env-cell',
    !isActive ? 'env-col-inactive' : '',
    isFlashing ? 'env-cell-flash' : '',
    hasRing && cellStatus ? `env-cell-ring env-cell-ring-${cellStatus.kind}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (envState.support === 'unsupported') {
    return (
      <td
        className={`${baseClassName} env-cell-unsupported`}
        data-env={env}
        data-cell-status={cellKind}
        data-cell-reasons={cellReasons}
        data-flashing={isFlashing ? 'true' : undefined}
        title={cellTooltip}
      >
        <span className="env-unsupported" aria-label="Unsupported">
          ✗
        </span>
      </td>
    );
  }

  if (envState.version === null) {
    return (
      <td
        className={`${baseClassName} env-cell-missing`}
        data-env={env}
        data-cell-status={cellKind}
        data-cell-reasons={cellReasons}
        data-flashing={isFlashing ? 'true' : undefined}
        title={cellTooltip}
      >
        <span className="env-no-version">No compatible version</span>
        <span className={`badge badge-support badge-support-${envState.support}`}>
          {envState.support}
        </span>
      </td>
    );
  }

  const candidateOptions = buildCandidateOptions(envState);
  const showFallbackBadge =
    envState.resolution === 'game-version-fallback' ||
    isUnverifiedPlatformCandidate(envState.version, projectType);

  return (
    <td
      className={baseClassName}
      data-env={env}
      data-cell-status={cellKind}
      data-cell-reasons={cellReasons}
      data-flashing={isFlashing ? 'true' : undefined}
      title={cellTooltip}
    >
      <div className="env-cell-controls">
        <input
          type="checkbox"
          className="env-select-checkbox"
          checked={envState.selection.on}
          disabled={!isActive || isRecomputing}
          aria-label={`Select ${projectTitle} for ${envLabel}`}
          onChange={(e) => onToggleEntrySelection?.(projectId, env, e.target.checked)}
        />
        <select
          className="env-version-select"
          aria-label={`${projectTitle} ${envLabel} version`}
          value={envState.version.id}
          disabled={!isActive || isRecomputing}
          onChange={(e) => onChangeEntryVersion?.(projectId, env, e.target.value)}
        >
          {candidateOptions.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {formatCandidateOptionLabel(candidate, projectType)}
            </option>
          ))}
        </select>
        <span className="env-version-number sr-only">{envState.version.versionNumber}</span>
        {envState.version.versionType !== 'release' && (
          <span className={`badge badge-version-type badge-${envState.version.versionType}`}>
            {envState.version.versionType}
          </span>
        )}
        {showFallbackBadge && <span className="badge badge-fallback">unverified platform</span>}
        <span className={`badge badge-support badge-support-${envState.support}`}>
          {envState.support}
        </span>
        {envState.selection.on && envState.selection.source === 'auto' && (
          <span className="badge badge-selection-auto" data-selection-source="auto">
            auto
          </span>
        )}
        {!envState.selection.on && envState.selection.source === 'user' && (
          <span className="badge badge-selection-user-off" data-selection-source="user-off">
            user off
          </span>
        )}
      </div>
    </td>
  );
}, areEnvCellPropsEqual);

interface EntryTableRowProps {
  row: TableRow;
  entryStatus: EntryStatus | undefined;
  activeEnvironments: ActiveEnvironments;
  clientFlashing: boolean;
  serverFlashing: boolean;
  isRecomputing: boolean;
  isDependency?: boolean;
  onToggleEntrySelection?: (projectId: string, env: EnvironmentId, selected: boolean) => void;
  onChangeEntryVersion?: (projectId: string, env: EnvironmentId, versionId: string) => void;
}

function areTableRowsEqual(a: TableRow, b: TableRow): boolean {
  if (a === b) {
    return true;
  }
  return (
    a.project.id === b.project.id &&
    a.project.title === b.project.title &&
    a.project.type === b.project.type &&
    a.project.modrinthUrl === b.project.modrinthUrl &&
    a.origin === b.origin &&
    a.platform === b.platform &&
    areStringArraysEqual(a.requiredByTitles.client, b.requiredByTitles.client) &&
    areStringArraysEqual(a.requiredByTitles.server, b.requiredByTitles.server) &&
    areEnvironmentStatesEqual(a.environments.client, b.environments.client) &&
    areEnvironmentStatesEqual(a.environments.server, b.environments.server)
  );
}

function areEntryRowPropsEqual(prev: EntryTableRowProps, next: EntryTableRowProps): boolean {
  return (
    (prev.isDependency ?? false) === (next.isDependency ?? false) &&
    prev.activeEnvironments.client === next.activeEnvironments.client &&
    prev.activeEnvironments.server === next.activeEnvironments.server &&
    prev.clientFlashing === next.clientFlashing &&
    prev.serverFlashing === next.serverFlashing &&
    prev.isRecomputing === next.isRecomputing &&
    prev.onToggleEntrySelection === next.onToggleEntrySelection &&
    prev.onChangeEntryVersion === next.onChangeEntryVersion &&
    areTableRowsEqual(prev.row, next.row) &&
    areEntryStatusesEqual(prev.entryStatus, next.entryStatus)
  );
}

const EntryTableRow = memo(function EntryTableRow({
  row,
  entryStatus,
  activeEnvironments,
  clientFlashing,
  serverFlashing,
  isRecomputing,
  isDependency = false,
  onToggleEntrySelection,
  onChangeEntryVersion,
}: EntryTableRowProps) {
  const platformLabel = row.platform ? formatPlatformDisplayName(row.platform) : '—';
  const clientRequiredBy = row.requiredByTitles.client;
  const serverRequiredBy = row.requiredByTitles.server;
  const rowStatus = entryStatus?.row ?? null;
  const rowStatusKind = rowStatus?.kind ?? 'none';

  const rowClassName = [
    'entry-row',
    isDependency ? 'entry-row-dependency' : '',
    rowStatus && rowStatus.kind !== 'ok' ? `row-tint row-tint-${rowStatus.kind}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <tr
      className={rowClassName}
      data-project-id={row.project.id}
      data-origin={row.origin}
      data-row-status={rowStatusKind}
    >
      <td className="col-status" data-row-status={rowStatusKind}>
        {entryStatus && entryStatus.row !== null ? (
          <StatusSymbol
            projectId={row.project.id}
            projectTitle={row.project.title}
            entryStatus={entryStatus}
          />
        ) : null}
      </td>
      <td className="name-cell">
        <div className="project-header">
          <span className="project-title">{row.project.title}</span>
          <a
            href={row.project.modrinthUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="modrinth-link"
            aria-label={`Open ${row.project.title} on Modrinth`}
          >
            Open on Modrinth ↗
          </a>
        </div>
        {isDependency && (clientRequiredBy.length > 0 || serverRequiredBy.length > 0) && (
          <div className="required-by-list">
            {clientRequiredBy.length > 0 && (
              <span className="required-by-item">
                required by: {clientRequiredBy.join(', ')} (client)
              </span>
            )}
            {serverRequiredBy.length > 0 && (
              <span className="required-by-item">
                required by: {serverRequiredBy.join(', ')} (server)
              </span>
            )}
          </div>
        )}
      </td>
      <td className="platform-cell">{platformLabel}</td>
      <EnvironmentCell
        projectId={row.project.id}
        projectTitle={row.project.title}
        projectType={row.project.type}
        env="client"
        envState={row.environments.client}
        cellStatus={entryStatus?.client ?? null}
        isActive={activeEnvironments.client}
        isFlashing={clientFlashing}
        isRecomputing={isRecomputing}
        onToggleEntrySelection={onToggleEntrySelection}
        onChangeEntryVersion={onChangeEntryVersion}
      />
      <EnvironmentCell
        projectId={row.project.id}
        projectTitle={row.project.title}
        projectType={row.project.type}
        env="server"
        envState={row.environments.server}
        cellStatus={entryStatus?.server ?? null}
        isActive={activeEnvironments.server}
        isFlashing={serverFlashing}
        isRecomputing={isRecomputing}
        onToggleEntrySelection={onToggleEntrySelection}
        onChangeEntryVersion={onChangeEntryVersion}
      />
    </tr>
  );
}, areEntryRowPropsEqual);

export function EntryTables({
  tables,
  instance = null,
  entryStatuses,
  targetPlatform = 'fabric',
  activeEnvironments = DEFAULT_ACTIVE_ENVIRONMENTS,
  flashingCells = EMPTY_FLASHING_SET,
  isRecomputing = false,
  skippedCount,
  onToggleEntrySelection,
  onToggleSelectAll,
  onChangeEntryVersion,
}: EntryTablesProps) {
  const activeEnvironmentIds = useMemo<EnvironmentId[]>(
    () => ENVIRONMENTS.filter((env) => activeEnvironments[env]),
    [activeEnvironments],
  );

  const resolvedEntryStatuses = useMemo<ReadonlyMap<string, EntryStatus>>(() => {
    if (entryStatuses) {
      return entryStatuses;
    }
    if (instance) {
      return computeEntryStatus(instance, activeEnvironmentIds);
    }
    if (tables.length === 0) {
      return new Map<string, EntryStatus>();
    }
    const fallbackInstance: Instance = {
      schemaVersion: CORE_SCHEMA_VERSION,
      meta: {
        name: '',
        source: { collectionId: '', url: '' },
        target: {
          gameVersion: '',
          platform: targetPlatform,
          releasePreference: 'stable',
        },
        createdAt: '',
      },
      entries: tables.flatMap((t) => [
        ...t.rows.map((r) => r.entry),
        ...t.dependencies.map((r) => r.entry),
      ]),
    };
    return computeEntryStatus(fallbackInstance, activeEnvironmentIds);
  }, [entryStatuses, instance, tables, targetPlatform, activeEnvironmentIds]);

  if (tables.length === 0) {
    return (
      <div className="empty-tables card">
        <p>No exportable projects found in this collection.</p>
        {skippedCount !== undefined && skippedCount > 0 && (
          <p className="empty-tables-note">
            {skippedCount} skipped project{skippedCount === 1 ? ' is' : 's are'} listed below.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="entry-tables">
      {tables.map((table) => {
        const heading = PROJECT_TYPE_HEADINGS[table.type];
        const clientTriState = instance
          ? getHeaderTriState(instance, table.type, 'client')
          : computeHeaderTriState(table.rows.map((r) => r.environments.client));
        const serverTriState = instance
          ? getHeaderTriState(instance, table.type, 'server')
          : computeHeaderTriState(table.rows.map((r) => r.environments.server));
        const hasSelectableClientRows = table.rows.some((r) => isSelectable(r.environments.client));
        const hasSelectableServerRows = table.rows.some((r) => isSelectable(r.environments.server));

        return (
          <section
            key={table.type}
            className="table-section card"
            aria-label={heading}
            data-project-type={table.type}
          >
            <div className="table-section-header">
              <h2>{heading}</h2>
              <div className="table-counts">
                <span className="badge badge-count">
                  {table.rows.length} {table.rows.length === 1 ? 'entry' : 'entries'}
                </span>
                {table.dependencies.length > 0 && (
                  <span className="badge badge-count badge-count-dep">
                    {table.dependencies.length}{' '}
                    {table.dependencies.length === 1 ? 'dependency' : 'dependencies'}
                  </span>
                )}
              </div>
            </div>

            <div className="table-wrapper">
              <table className="entry-table" aria-label={`${heading} table`}>
                <thead>
                  <tr>
                    <th scope="col" className="col-status" aria-label="Status">
                      <span className="sr-only">Status</span>
                    </th>
                    <th scope="col">Name</th>
                    <th scope="col">Platform</th>
                    <HeaderSelectAllCell
                      env="client"
                      heading={heading}
                      triState={clientTriState}
                      hasSelectableCollectionRows={hasSelectableClientRows}
                      isActive={activeEnvironments.client}
                      isRecomputing={isRecomputing}
                      onToggle={(selectAll) => onToggleSelectAll?.(table.type, 'client', selectAll)}
                    />
                    <HeaderSelectAllCell
                      env="server"
                      heading={heading}
                      triState={serverTriState}
                      hasSelectableCollectionRows={hasSelectableServerRows}
                      isActive={activeEnvironments.server}
                      isRecomputing={isRecomputing}
                      onToggle={(selectAll) => onToggleSelectAll?.(table.type, 'server', selectAll)}
                    />
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <EntryTableRow
                      key={row.project.id}
                      row={row}
                      entryStatus={resolvedEntryStatuses.get(row.project.id)}
                      activeEnvironments={activeEnvironments}
                      clientFlashing={flashingCells.has(`${row.project.id}:client`)}
                      serverFlashing={flashingCells.has(`${row.project.id}:server`)}
                      isRecomputing={isRecomputing}
                      onToggleEntrySelection={onToggleEntrySelection}
                      onChangeEntryVersion={onChangeEntryVersion}
                    />
                  ))}
                </tbody>
                {table.dependencies.length > 0 && (
                  <tbody className="dependencies-body">
                    <tr className="dependencies-divider">
                      <th colSpan={5} scope="rowgroup">
                        Dependencies
                      </th>
                    </tr>
                    {table.dependencies.map((depRow) => (
                      <EntryTableRow
                        key={depRow.project.id}
                        row={depRow}
                        entryStatus={resolvedEntryStatuses.get(depRow.project.id)}
                        activeEnvironments={activeEnvironments}
                        clientFlashing={flashingCells.has(`${depRow.project.id}:client`)}
                        serverFlashing={flashingCells.has(`${depRow.project.id}:server`)}
                        isRecomputing={isRecomputing}
                        isDependency
                        onToggleEntrySelection={onToggleEntrySelection}
                        onChangeEntryVersion={onChangeEntryVersion}
                      />
                    ))}
                  </tbody>
                )}
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
}
