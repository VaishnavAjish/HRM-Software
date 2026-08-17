import { Loader2, TriangleAlert } from "lucide-react";
import Modal from "../../../components/ui/Modal";
import Button from "../../../components/ui/Button";

/**
 * The organization module has no confirm-dialog today — deletes and moves
 * fire immediately. This is the one reusable primitive the new chart's
 * delete/move/disconnect flows all sit on top of, per the spec's
 * "never silently modify organization data" requirement.
 */
export default function ConfirmDialog({
  open,
  title,
  body,
  impact,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <Modal isOpen onClose={onCancel} title={title} size="sm">
      <div className="space-y-3">
        {danger && (
          <div className="flex items-start gap-2 rounded-lg bg-red-50 p-2.5 text-red-700 dark:bg-red-900/20 dark:text-red-400">
            <TriangleAlert size={16} className="mt-0.5 flex-shrink-0" />
            <span className="text-xs">This action changes live organization data.</span>
          </div>
        )}
        {body && <p className="text-sm text-gray-700 dark:text-gray-200">{body}</p>}
        {impact && impact.length > 0 && (
          <ul className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600 dark:bg-gray-700/50 dark:text-gray-300">
            {impact.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </div>
      <footer className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {confirmLabel}
        </Button>
      </footer>
    </Modal>
  );
}
