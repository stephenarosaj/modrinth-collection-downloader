import { useState } from 'react';
import {
  ENVIRONMENTS,
  REASON_SHORT_TITLES,
  formatReason,
  type EntryStatus,
  type EnvironmentId,
  type Kind,
  type Status,
} from '../../core';

/** Props for {@link StatusSymbol}. */
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

function OkCheckmark() {
  return (
    <svg
      className="status-glyph-svg"
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 8.5 6.5 12 13 4.5" />
    </svg>
  );
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
    glyph: '!',
    dataSymbol: '!',
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

export { REASON_SHORT_TITLES };

interface TooltipCardModel {
  env: EnvironmentId | 'row';
  envLabel: string;
  status: Status;
}

function buildTooltipCards(entryStatus: EntryStatus): TooltipCardModel[] {
  const cards: TooltipCardModel[] = [];

  for (const env of ENVIRONMENTS) {
    const cellStatus = entryStatus[env];
    if (cellStatus && cellStatus.kind !== 'ok' && cellStatus.reasons.length > 0) {
      cards.push({
        env,
        envLabel: env === 'client' ? 'Client' : 'Server',
        status: cellStatus,
      });
    }
  }

  if (cards.length === 0 && entryStatus.row && entryStatus.row.kind !== 'ok') {
    cards.push({
      env: 'row',
      envLabel: 'Status',
      status: entryStatus.row,
    });
  }

  return cards;
}

/**
 * Renders an accessible status badge indicating entry health (`ok`, `warning`, `error`, `unknown`)
 * with keyboard focus support, Escape dismissal (WCAG 2.1 SC 1.4.13), and detailed stacked tooltip cards.
 */
export function StatusSymbol({ projectId, projectTitle, entryStatus }: StatusSymbolProps) {
  const [isDismissed, setIsDismissed] = useState(false);

  const rowStatus = entryStatus.row;
  if (!rowStatus) {
    return null;
  }

  const { kind, reasons } = rowStatus;
  const meta = STATUS_KIND_META[kind];
  const hasTooltip = kind !== 'ok';
  const tooltipId = `status-tooltip-${projectId}`;
  const cards = hasTooltip ? buildTooltipCards(entryStatus) : [];
  const tooltipClassName = [
    'status-tooltip',
    cards.length > 1 ? 'status-tooltip-stacked' : '',
    isDismissed ? 'status-tooltip-dismissed' : '',
  ]
    .filter(Boolean)
    .join(' ');

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
        aria-describedby={hasTooltip ? tooltipId : undefined}
        onFocus={() => setIsDismissed(false)}
        onBlur={() => setIsDismissed(false)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setIsDismissed(true);
          }
        }}
      >
        <span className="status-glyph" aria-hidden="true">
          {kind === 'ok' ? <OkCheckmark /> : meta.glyph}
        </span>
      </button>
      {hasTooltip && (
        <div id={tooltipId} role="tooltip" className={tooltipClassName}>
          {cards.map((card) => (
            <div
              key={card.env}
              className={`status-tooltip-card status-tooltip-card-${card.status.kind}`}
              data-tooltip-env={card.env}
              data-tooltip-kind={card.status.kind}
            >
              <div className="status-tooltip-card-header">
                <span className="status-tooltip-env-badge">{card.envLabel}</span>
                <span className={`status-tooltip-kind-badge status-tooltip-kind-${card.status.kind}`}>
                  {STATUS_KIND_META[card.status.kind].kindLabel}
                </span>
              </div>
              <div className="status-tooltip-reasons">
                {card.status.reasons.map((reason) => (
                  <div key={reason} className="status-tooltip-reason-item">
                    <span className="status-tooltip-reason-title">
                      {REASON_SHORT_TITLES[reason]}
                    </span>
                    <p className="status-tooltip-reason-text">
                      <span className="sr-only">{card.envLabel}: </span>
                      {formatReason(reason)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
