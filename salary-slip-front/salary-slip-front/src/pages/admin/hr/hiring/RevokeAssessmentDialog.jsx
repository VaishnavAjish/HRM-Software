import { useState } from "react";
import Button from "../../../../components/ui/Button";
import Modal from "../../../../components/ui/Modal";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

export default function RevokeAssessmentDialog({ candidateName, onCancel, onConfirm, revoking }) {
  const [reason, setReason] = useState("");

  return (
    <Modal
      isOpen
      onClose={revoking ? () => {} : onCancel}
      title="Revoke Assessment Access?"
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={revoking}>Cancel</Button>
          <Button variant="danger" onClick={() => onConfirm(reason.trim() || null)} disabled={revoking}>
            {revoking ? "Revoking..." : "Revoke Assessment"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-300">
        <strong>{candidateName}</strong> will no longer be able to start this assessment using the existing link. Assessment history will be preserved.
      </p>
      <div className="mt-3">
        <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Reason (optional)</label>
        <textarea rows={2} className={inputClass} placeholder="e.g. assigned the wrong assessment" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </div>
    </Modal>
  );
}
