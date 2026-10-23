import { memo, useEffect, useRef } from 'react';
import {
  computeHeaderTriState,
  formatPlatformDisplayName,
  getHeaderTriState,
  isSelectable,
  isUnverifiedPlatformCandidate,
  type EnvironmentId,
  type EnvironmentState,
  type ExportableProjectType,
  type HeaderTriState,
  type Instance,
  type ProjectType,
  type TableModel,
  type TableRow,
  type VersionRef,
} from '../../core';
import type { ActiveEnvironments } from './EnvironmentTogglesBar';

export interface EntryTablesProps {
  tables: readonly TableModel[];
  instance?: Instance | null;
  targetPlatform?: string;
  activeEnvironments?: ActiveEnvironments;
  flashingCells?: ReadonlySet<string>;
  isRecomputing?: boolean;
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
    <th
      scope="col"
      className={`col-env ${!isActive ? 'env-col-inactive' : ''}`}
      data-env={env}
    >
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

interface EnvironmentCellProps {
  projectId: string;
  projectTitle: string;
  projectType: ProjectType;
  env: EnvironmentId;
  envState: EnvironmentState;
  isActive: boolean;
  isFlashing: boolean;
  isRecomputing: boolean;
  onToggleEntrySelection?: (projectId: string, env: EnvironmentId, selected: boolean) => void;
  onChangeEntryVersion?: (projectId: string, env: EnvironmentId, versionId: string) => void;
}

const EnvironmentCell = memo(function EnvironmentCell({
  projectId,
  projectTitle,
  projectType,
  env,
  envState,
  isActive,
  isFlashing,
  isRecomputing,
  onToggleEntrySelection,
  onChangeEntryVersion,
}: EnvironmentCellProps) {
  const envLabel = env === 'client' ? 'Client' : 'Server';
  const baseClassName = [
    'col-env',
    'env-cell',
    !isActive ? 'env-col-inactive' : '',
    isFlashing ? 'env-cell-flash' : '',
  ]
    .filter(Boolean)
    .join(' ');

  if (envState.support === 'unsupported') {
    return (
      <td
        className={`${baseClassName} env-cell-unsupported`}
        data-env={env}
        data-flashing={isFlashing ? 'true' : undefined}
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
        data-flashing={isFlashing ? 'true' : undefined}
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
      data-flashing={isFlashing ? 'true' : undefined}
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
});

interface EntryTableRowProps {
  row: TableRow;
  activeEnvironments: ActiveEnvironments;
  clientFlashing: boolean;
  serverFlashing: boolean;
  isRecomputing: boolean;
  isDependency?: boolean;
  onToggleEntrySelection?: (projectId: string, env: EnvironmentId, selected: boolean) => void;
  onChangeEntryVersion?: (projectId: string, env: EnvironmentId, versionId: string) => void;
}

const EntryTableRow = memo(function EntryTableRow({
  row,
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

  return (
    <tr
      className={isDependency ? 'entry-row entry-row-dependency' : 'entry-row'}
      data-project-id={row.project.id}
      data-origin={row.origin}
    >
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
        isActive={activeEnvironments.server}
        isFlashing={serverFlashing}
        isRecomputing={isRecomputing}
        onToggleEntrySelection={onToggleEntrySelection}
        onChangeEntryVersion={onChangeEntryVersion}
      />
    </tr>
  );
});

export function EntryTables({
  tables,
  instance = null,
  activeEnvironments = DEFAULT_ACTIVE_ENVIRONMENTS,
  flashingCells = EMPTY_FLASHING_SET,
  isRecomputing = false,
  onToggleEntrySelection,
  onToggleSelectAll,
  onChangeEntryVersion,
}: EntryTablesProps) {
  if (tables.length === 0) {
    return (
      <div className="empty-tables card">
        <p>No exportable projects found in this collection.</p>
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
        const hasSelectableClientRows = table.rows.some((r) =>
          isSelectable(r.environments.client),
        );
        const hasSelectableServerRows = table.rows.some((r) =>
          isSelectable(r.environments.server),
        );

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
                    <th scope="col">Name</th>
                    <th scope="col">Platform</th>
                    <HeaderSelectAllCell
                      env="client"
                      heading={heading}
                      triState={clientTriState}
                      hasSelectableCollectionRows={hasSelectableClientRows}
                      isActive={activeEnvironments.client}
                      isRecomputing={isRecomputing}
                      onToggle={(selectAll) =>
                        onToggleSelectAll?.(table.type, 'client', selectAll)
                      }
                    />
                    <HeaderSelectAllCell
                      env="server"
                      heading={heading}
                      triState={serverTriState}
                      hasSelectableCollectionRows={hasSelectableServerRows}
                      isActive={activeEnvironments.server}
                      isRecomputing={isRecomputing}
                      onToggle={(selectAll) =>
                        onToggleSelectAll?.(table.type, 'server', selectAll)
                      }
                    />
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <EntryTableRow
                      key={row.project.id}
                      row={row}
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
                      <th colSpan={4} scope="rowgroup">
                        Dependencies
                      </th>
                    </tr>
                    {table.dependencies.map((depRow) => (
                      <EntryTableRow
                        key={depRow.project.id}
                        row={depRow}
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
