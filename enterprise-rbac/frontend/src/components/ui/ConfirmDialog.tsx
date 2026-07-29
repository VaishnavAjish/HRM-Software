interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  danger,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} aria-hidden="true" />
      <div className="relative w-full max-w-sm rounded-xl border bg-card p-6 shadow-xl">
        <h3 className="text-base font-semibold text-foreground">{title}</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-md border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-md px-3 py-2 text-sm font-medium text-primary-foreground ${
              danger ? 'bg-destructive hover:opacity-90' : 'bg-primary hover:opacity-90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
