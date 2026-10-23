import { ENVIRONMENTS, type Change, type ChangeReason } from '../../core';

export interface AutoSelectToastProps {
  message: string | null;
  onDismiss?: () => void;
}

const CHANGE_REASONS: readonly ChangeReason[] = ['auto-selected', 'auto-deselected'] as const;

/**
 * Formats a list of reducer/version-override `Change`s into a concise summary
 * for the auto-select toast (§7.5), e.g. `"Auto-selected 3 client dependencies"`.
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
