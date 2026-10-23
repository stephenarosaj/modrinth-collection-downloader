import { useState } from 'react';
import { formatRowStatusTooltip, type EntryStatus, type Kind } from '../../core';

export interface StatusSymbolProps {
  projectId: string;
  projectTitle: string;
  entryStatus: EntryStatus;
}

interface StatusKindVisualMeta {
  glyph: string;
  dataSymbol: string;
  kindLabel: string;
  shapeClass: string;
}

const STATUS_KIND_META: Readonly<Record<Kind, StatusKindVisualMeta>> = {
  ok: {
    glyph: '✓',
    dataSymbol: '✓',
    kindLabel: 'OK',
    shapeClass: 'status-shape-circle',
  },
  warning: {
    glyph: '⚠',
    dataSymbol: '⚠',
    kindLabel: 'Warning',
    shapeClass: 'status-shape-triangle',
  },
  error: {
    glyph: '⚠',
    dataSymbol: '⚠!',
    kindLabel: 'Error',
    shapeClass: 'status-shape-error-triangle',
  },
  unknown: {
    glyph: '?',
    dataSymbol: '?',
    kindLabel: 'Unknown',
    shapeClass: 'status-shape-question',
  },
};

export function StatusSymbol({ projectId, projectTitle, entryStatus }: StatusSymbolProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  const rowStatus = entryStatus.row;
  if (!rowStatus) {
    return null;
  }

  const { kind, reasons } = rowStatus;
  const meta = STATUS_KIND_META[kind];
  const tooltipId = `status-tooltip-${projectId}`;
  const tooltipText = formatRowStatusTooltip(entryStatus);
  const tooltipClassName = isDismissed
    ? 'status-tooltip status-tooltip-dismissed'
    : 'status-tooltip';

  return (
    <div
      className="status-symbol-wrapper"
      onMouseEnter={() => setIsDismissed(false)}
      onMouseLeave={() => setIsDismissed(false)}
    >
      <button
        type="button"
        className={`status-symbol status-symbol-${kind} ${meta.shapeClass}`}
        data-status-kind={kind}
        data-status-symbol={meta.dataSymbol}
        data-status-reasons={reasons.join(',')}
        aria-label={`${projectTitle} status: ${meta.kindLabel}`}
        aria-describedby={tooltipId}
        onFocus={() => setIsDismissed(false)}
        onBlur={() => setIsDismissed(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsDismissed(true);
          }
        }}
      >
        <span className="status-glyph" aria-hidden="true">
          {meta.glyph}
          {kind === 'error' && <span className="status-error-bang">!</span>}
        </span>
      </button>
      <span id={tooltipId} role="tooltip" className={tooltipClassName}>
        {tooltipText}
      </span>
    </div>
  );
}
