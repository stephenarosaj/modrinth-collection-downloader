import { useEffect, useRef } from 'react';

export interface ConfirmReResolveDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmReResolveDialog({
  open,
  onConfirm,
  onCancel,
}: ConfirmReResolveDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    cancelButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop">
      <div
        className="modal-dialog card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-reresolve-title"
        aria-describedby="confirm-reresolve-description"
      >
        <h3 id="confirm-reresolve-title">Re-resolve collection?</h3>
        <p id="confirm-reresolve-description">
          Changing the game version, platform, or release preference will re-resolve the collection
          and reset your manual selections to defaults.
        </p>
        <div className="modal-actions">
          <button
            ref={cancelButtonRef}
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={onConfirm}>
            Confirm Re-resolve
          </button>
        </div>
      </div>
    </div>
  );
}
