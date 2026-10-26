import { ENVIRONMENTS, type Change, type ChangeReason } from '../../core';

/** Props for {@link AutoSelectToast}. */
export interface AutoSelectToastProps {
  message: string | null;
  onDismiss?: () => void;
}

const CHANGE_REASONS: readonly ChangeReason[] = ['auto-selected', 'auto-deselected'] as const;

/**
 * Formats a list of reducer/version-override `Change` records into a concise summary
 * for the toast notification, e.g. `"Auto-selected 3 client dependencies"`.
 */
export function formatAutoSelectChanges(changes: readonly Change[]): string | null {
  if (changes.length === 0) {
    return null;
  }

  const segments: string[] = [];

  for (const env of ENVIRONMENTS) {
    for (const reason of CHANGE_REASONS) {
      const count = changes.filter((c) => c.env === env && c.reason === reason).length;
      if (count > 0) {
        const actionLabel = reason === 'auto-selected' ? 'Auto-selected' : 'Auto-deselected';
        const noun = count === 1 ? 'dependency' : 'dependencies';
        segments.push(`${actionLabel} ${count} ${env} ${noun}`);
      }
    }
  }

  return segments.length > 0 ? segments.join(' · ') : null;
}

/**
 * Non-intrusive polite toast notification announcing automatic dependency selection
 * and deselection state transitions with an optional manual dismiss button.
 */
export function AutoSelectToast({ message, onDismiss }: AutoSelectToastProps) {
  if (!message) {
    return null;
  }

  return (
    <div className="auto-select-toast" role="status" aria-live="polite">
      <span className="auto-select-toast-message">{message}</span>
      {onDismiss && (
        <button
          type="button"
          className="btn-toast-dismiss"
          aria-label="Dismiss notification"
          onClick={onDismiss}
        >
          ×
        </button>
      )}
    </div>
  );
}
