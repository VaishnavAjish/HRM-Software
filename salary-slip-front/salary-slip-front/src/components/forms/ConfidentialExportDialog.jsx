import { AlertTriangle, FileText, Loader2, Printer, ShieldAlert } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";

/**
 * Two-stage gate in front of any export that could carry a complete Aadhaar.
 *
 * Stage CHOICE exists because a full number being visible on screen is not by
 * itself a request to put it on paper. Most exports are routine — a masked copy
 * for a file — and defaulting those to a confidential export would generate audit
 * noise and scatter unnecessary copies of an identity number.
 *
 * Stage CONFIRM states plainly what the user is about to create and that it will
 * be audited, before any authorisation request is made. Nothing is requested from
 * the server until Continue is pressed.
 */
export default function ConfidentialExportDialog({
  prompt,
  busy,
  onCancel,
  onChooseMasked,
  onChooseConfidential,
  onConfirm,
}) {
  if (!prompt) return null;

  const isPrint = prompt.kind === "PRINT";
  const verb = isPrint ? "Print" : "Download";
  const Icon = isPrint ? Printer : FileText;

  if (prompt.stage === "CHOICE") {
    return (
      <Modal
        isOpen
        onClose={onCancel}
        title={`${verb} Appointment Document`}
        size="md"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            This record has a complete Aadhaar number on file. Choose which
            version to {verb.toLowerCase()}.
          </p>

          <button
            type="button"
            onClick={onChooseMasked}
            disabled={busy}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-gray-200 p-4 text-left transition hover:border-brand-400 disabled:opacity-50 dark:border-gray-700"
          >
            <Icon size={18} className="mt-0.5 shrink-0 text-gray-500" />
            <span>
              <span className="block text-sm font-bold text-gray-900 dark:text-gray-100">
                {verb} Masked Version
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                Shows XXXX XXXX 1345. No special permission, no confidential
                handling required.
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={onChooseConfidential}
            disabled={busy}
            className="flex w-full items-start gap-3 rounded-xl border-2 border-red-200 bg-red-50/50 p-4 text-left transition hover:border-red-400 disabled:opacity-50 dark:border-red-900 dark:bg-red-900/10"
          >
            <ShieldAlert size={18} className="mt-0.5 shrink-0 text-red-600" />
            <span>
              <span className="block text-sm font-bold text-red-700 dark:text-red-400">
                {verb} Confidential Full-Aadhaar Version
              </span>
              <span className="mt-0.5 block text-xs text-red-600/80 dark:text-red-400/80">
                Contains the complete Aadhaar number. Requires authorization and
                is audited.
              </span>
            </span>
          </button>

          <div className="flex justify-end pt-2">
            <Button variant="secondary" onClick={onCancel} disabled={busy}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      isOpen
      onClose={busy ? undefined : onCancel}
      title="Export Confidential Identity Document?"
      size="md"
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-900/20">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <p className="text-sm leading-relaxed text-amber-900 dark:text-amber-200">
            This document contains a complete Aadhaar number and sensitive
            identity information. The export will be audited. Printed or
            downloaded copies are outside application access control and must be
            handled according to company privacy policy.
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
          >
            {busy ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <ShieldAlert size={14} />
            )}
            {busy ? "Authorizing…" : "Continue Confidential Export"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
