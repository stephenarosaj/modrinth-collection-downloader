import { memo } from 'react';
import {
  formatPlatformDisplayName,
  type EnvironmentState,
  type ExportableProjectType,
  type TableModel,
  type TableRow,
} from '../../core';

export interface EntryTablesProps {
  tables: readonly TableModel[];
}

export const PROJECT_TYPE_HEADINGS: Readonly<Record<ExportableProjectType, string>> = {
  mod: 'Mods',
  plugin: 'Plugins',
  datapack: 'Datapacks',
  resourcepack: 'Resource Packs',
  shader: 'Shaders',
};

interface EnvironmentCellProps {
  envState: EnvironmentState;
}

const EnvironmentCell = memo(function EnvironmentCell({ envState }: EnvironmentCellProps) {
  if (envState.support === 'unsupported') {
    return (
      <td className="env-cell env-cell-unsupported">
        <span className="env-unsupported" aria-label="Unsupported">
          ✗
        </span>
      </td>
    );
  }

  if (envState.version === null) {
    return (
      <td className="env-cell env-cell-missing">
        <span className="env-no-version">No compatible version</span>
        <span className={`badge badge-support badge-support-${envState.support}`}>
          {envState.support}
        </span>
      </td>
    );
  }

  return (
    <td className="env-cell">
      <span className="env-version-number">{envState.version.versionNumber}</span>
      {envState.version.versionType !== 'release' && (
        <span className={`badge badge-version-type badge-${envState.version.versionType}`}>
          {envState.version.versionType}
        </span>
      )}
      {envState.resolution === 'game-version-fallback' && (
        <span className="badge badge-fallback">unverified platform</span>
      )}
      <span className={`badge badge-support badge-support-${envState.support}`}>
        {envState.support}
      </span>
    </td>
  );
});

interface EntryTableRowProps {
  row: TableRow;
  isDependency?: boolean;
}

const EntryTableRow = memo(function EntryTableRow({
  row,
  isDependency = false,
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
      <EnvironmentCell envState={row.environments.client} />
      <EnvironmentCell envState={row.environments.server} />
    </tr>
  );
});

export function EntryTables({ tables }: EntryTablesProps) {
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
                    <th scope="col">Client</th>
                    <th scope="col">Server</th>
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row) => (
                    <EntryTableRow key={row.project.id} row={row} />
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
                      <EntryTableRow key={depRow.project.id} row={depRow} isDependency />
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
