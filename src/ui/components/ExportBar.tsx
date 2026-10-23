import type { EnvironmentId, FileTree, MrpackIndex } from '../../core';
import type { ExportEnvironmentZipResult, ZipExportProgress } from '../download';
import type { ActiveEnvironments } from './EnvironmentTogglesBar';

export interface ExportBarProps {
  activeEnvironments: ActiveEnvironments;
  fileTrees: { client: FileTree; server: FileTree };
  mrpackPreview: MrpackIndex;
  mrpackWarnings: readonly string[];
  platformVersion: string;
  onPlatformVersionChange: (value: string) => void;
  canExportZip: boolean;
  canExportMrpack: boolean;
  isRecomputing: boolean;
  isExporting: boolean;
  exportingEnv: EnvironmentId | null;
  zipProgress: ZipExportProgress | null;
  zipResult: ExportEnvironmentZipResult | null;
  onExportEnvironmentZip: (env: EnvironmentId) => void;
  onCancelZipExport: () => void;
  onExportJson: () => void;
  onExportMrpack: () => void;
}

function computeProgressPercent(progress: ZipExportProgress | null): number {
  if (!progress) {
    return 0;
  }
  if (progress.phase === 'complete') {
    return 100;
  }
  if (progress.phase === 'archiving') {
    return Math.round(80 + Math.min(100, Math.max(0, progress.archivePercent)) * 0.2);
  }
  if (progress.total <= 0) {
    return 0;
  }
  return Math.round((progress.completed / progress.total) * 80);
}

export function ExportBar({
  activeEnvironments,
  fileTrees,
  mrpackPreview,
  mrpackWarnings,
  platformVersion,
  onPlatformVersionChange,
  canExportZip,
  canExportMrpack,
  isRecomputing,
  isExporting,
  exportingEnv,
  zipProgress,
  zipResult,
  onExportEnvironmentZip,
  onCancelZipExport,
  onExportJson,
  onExportMrpack,
}: ExportBarProps) {
  const clientFileCount = fileTrees.client.files.length;
  const serverFileCount = fileTrees.server.files.length;
  const mrpackFileCount = mrpackPreview.files.length;

  const clientZipDisabled =
    !activeEnvironments.client ||
    clientFileCount === 0 ||
    isExporting ||
    isRecomputing ||
    !canExportZip;

  const serverZipDisabled =
    !activeEnvironments.server ||
    serverFileCount === 0 ||
    isExporting ||
    isRecomputing ||
    !canExportZip;

  const mrpackDisabled =
    mrpackFileCount === 0 || isExporting || isRecomputing || !canExportMrpack;

  const progressPercent = computeProgressPercent(zipProgress);
  const retryZipEnv: EnvironmentId | null =
    zipResult !== null
      ? (zipResult.env ??
        (zipResult.filename.endsWith('-server.zip') || zipResult.filename.startsWith('server.')
          ? 'server'
          : 'client'))
      : null;

  return (
    <section className="card export-bar" aria-label="Export outputs">
      <div className="export-bar-row">
        <div className="export-group" role="group" aria-label="Archive and JSON exports">
          <button
            type="button"
            className="btn btn-primary"
            aria-label="Export client.zip"
            disabled={clientZipDisabled}
            onClick={() => onExportEnvironmentZip('client')}
          >
            <span>Export client.zip</span>
            <span className="badge export-count-badge">({clientFileCount})</span>
          </button>

          <button
            type="button"
            className="btn btn-primary"
            aria-label="Export server.zip"
            disabled={serverZipDisabled}
            onClick={() => onExportEnvironmentZip('server')}
          >
            <span>Export server.zip</span>
            <span className="badge export-count-badge">({serverFileCount})</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={isExporting || isRecomputing}
            onClick={onExportJson}
          >
            Export instance.json
          </button>
        </div>

        <div className="export-mrpack-group" role="group" aria-label="Modrinth modpack export">
          <div className="export-platform-version-field">
            <label htmlFor="mrpack-platform-version-input" className="export-inline-label">
              Platform version (optional)
            </label>
            <input
              id="mrpack-platform-version-input"
              type="text"
              aria-label="Platform version (optional)"
              value={platformVersion}
              onChange={(e) => onPlatformVersionChange(e.target.value)}
              placeholder="e.g. 0.16.9"
              disabled={isExporting || isRecomputing}
            />
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            aria-label="Export .mrpack"
            disabled={mrpackDisabled}
            onClick={onExportMrpack}
          >
            <span>Export .mrpack</span>
            <span className="badge export-count-badge">({mrpackFileCount})</span>
          </button>
        </div>
      </div>

      {mrpackWarnings.length > 0 && (
        <div
          className="alert alert-warn mrpack-plugin-warning"
          role="note"
          aria-label="Plugin exclusion warning"
        >
          {mrpackWarnings.map((warning) => (
            <span key={warning}>{warning}</span>
          ))}
        </div>
      )}

      {exportingEnv !== null && zipProgress !== null && (
        <div className="zip-export-progress" role="region" aria-label="Zip export status">
          <div className="zip-export-progress-header">
            <span className="zip-export-progress-label">
              {zipProgress.phase === 'archiving'
                ? `Archiving ${exportingEnv}.zip (${Math.round(zipProgress.archivePercent)}%)…`
                : `Downloading ${zipProgress.completed} / ${zipProgress.total} files${
                    zipProgress.currentFile ? ` (${zipProgress.currentFile})` : ''
                  }…`}
            </span>
            <button type="button" className="btn btn-danger" onClick={onCancelZipExport}>
              Cancel export
            </button>
          </div>
          <div
            className="progress-bar-track"
            role="progressbar"
            aria-label="Zip export progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
          >
            <div className="progress-bar-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      )}

      {zipResult !== null && zipResult.failedFiles.length > 0 && (
        <div className="alert alert-error zip-partial-failure-alert" role="alert">
          <div className="zip-partial-failure-content">
            <p className="zip-partial-failure-summary">
              {zipResult.succeededCount > 0
                ? `Packaged ${zipResult.succeededCount} of ${zipResult.totalCount} files into ${zipResult.filename}. ${zipResult.failedFiles.length} download${zipResult.failedFiles.length === 1 ? '' : 's'} failed:`
                : `No zip was created for ${zipResult.filename} because all ${zipResult.totalCount} download${zipResult.totalCount === 1 ? '' : 's'} failed:`}
            </p>
            <ul className="zip-failed-files-list">
              {zipResult.failedFiles.map((failed) => (
                <li key={failed.path}>
                  <strong>{failed.filename}</strong> (<code>{failed.path}</code>): {failed.error}
                </li>
              ))}
            </ul>
          </div>
          {retryZipEnv !== null && (
            <button
              type="button"
              className="btn btn-secondary zip-retry-btn"
              onClick={() => onExportEnvironmentZip(retryZipEnv)}
              disabled={retryZipEnv === 'server' ? serverZipDisabled : clientZipDisabled}
            >
              Retry {retryZipEnv}.zip export
            </button>
          )}
        </div>
      )}
    </section>
  );
}
