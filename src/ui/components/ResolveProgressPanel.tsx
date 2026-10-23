import type { ResolveProgress } from '../../core';

export interface ResolveProgressPanelProps {
  isResolving: boolean;
  progress: ResolveProgress | null;
  logs: readonly string[];
  error: string | null;
  wasCancelled: boolean;
  onCancel: () => void;
}

const PHASE_LABELS: Readonly<Record<ResolveProgress['phase'], string>> = {
  collection: 'Fetching collection',
  projects: 'Fetching projects',
  versions: 'Resolving versions',
  dependencies: 'Resolving dependencies',
  complete: 'Complete',
};

export function ResolveProgressPanel({
  isResolving,
  progress,
  logs,
  error,
  wasCancelled,
  onCancel,
}: ResolveProgressPanelProps) {
  if (!isResolving && !progress && !error && !wasCancelled) {
    return null;
  }

  const loaded = progress?.loaded ?? 0;
  const total = progress?.total ?? 0;
  const safeMax = Math.max(total, 1);
  const safeValue = Math.min(Math.max(loaded, 0), safeMax);
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  let phaseLabel: string;
  if (!isResolving && wasCancelled) {
    phaseLabel = 'Cancelled';
  } else if (!isResolving && error) {
    phaseLabel = 'Failed';
  } else {
    phaseLabel = progress ? PHASE_LABELS[progress.phase] : 'Initializing';
  }

  return (
    <section className="resolve-progress-panel card" aria-label="Resolution progress">
      <div className="resolve-progress-header">
        <div className="resolve-progress-info">
          <span className="resolve-phase">{phaseLabel}</span>
          {progress && (
            <span className="resolve-counts">
              {loaded} / {total}
            </span>
          )}
        </div>
        {isResolving && (
          <button type="button" className="btn btn-danger" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>

      {(isResolving || progress) && (
        <div
          className="progress-bar-track"
          role="progressbar"
          aria-label="Collection resolution progress"
          aria-valuenow={safeValue}
          aria-valuemin={0}
          aria-valuemax={safeMax}
        >
          <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
        </div>
      )}

      {wasCancelled && (
        <div className="alert alert-warn" role="status">
          Resolution cancelled.
        </div>
      )}

      {error && (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      )}

      {logs.length > 0 && (
        <div className="resolve-log" aria-label="Resolution log">
          <ul>
            {logs.map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
