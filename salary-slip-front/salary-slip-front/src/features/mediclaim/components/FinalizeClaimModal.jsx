import { useEffect, useState } from "react";
import { X, CheckCircle2, ShieldCheck, UserCheck, AlertCircle, Hourglass } from "lucide-react";
import toast from "react-hot-toast";
import Button from "../../../components/ui/Button";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { getRequiredDocumentTypes } from "../utils/documentChecklistRules";
import { formatCurrencyINR, formatClaimDate, formatClaimNumber } from "../utils/formatters";

const SETTLEMENT_MODES = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online Payment" },
];

export default function FinalizeClaimModal({ isOpen, onClose, claim, onFinalized }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const claimId = claim?.id ?? claim?.claimId;
  const claimedTotal = Number(claim?.totalClaimedAmount ?? claim?.total_claimed_amount ?? 0);
  const approvedTotal = Number(claim?.totalApprovedAmount ?? claim?.total_approved_amount ?? claim?.approvedAmount ?? claimedTotal);

  const [prevClaimId, setPrevClaimId] = useState(claimId);
  const [settlementAmount, setSettlementAmount] = useState(() => approvedTotal > 0 ? String(approvedTotal) : "");
  const [paymentMode, setPaymentMode] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [docCheck, setDocCheck] = useState({ key: null, missing: [], error: null });

  if (claimId !== prevClaimId) {
    setPrevClaimId(claimId);
    setSettlementAmount(approvedTotal > 0 ? String(approvedTotal) : "");
    setError(null);
    setDocCheck({ key: null, missing: [], error: null });
  }

  const treatmentType = claim?.treatmentType || claim?.treatment_type || "Hospitalization";
  const isMedicoLegal = claim?.isMedicoLegal ?? claim?.is_medico_legal_case ?? claim?.is_medico_legal ?? claim?.isMedicoLegalCase;

  // Settling a claim before every required document is on file is refused
  // server-side too (`ClaimWorkflowService::recordSettlement()`); this check
  // mirrors that rule here so the reviewer sees a clear blocked state instead
  // of filling out the whole form only to have it rejected on submit.
  useEffect(() => {
    if (!isOpen || !claimId || !accessToken) return undefined;
    let cancelled = false;

    Promise.all([
      mediclaimApi.claimDocuments(claimId, accessToken, tokenType),
      mediclaimApi.documentRequirements({}, accessToken, tokenType),
    ])
      .then(([docsRes, reqRes]) => {
        if (cancelled) return;
        const docsPayload = docsRes?.data;
        const docs = Array.isArray(docsPayload?.data) ? docsPayload.data : Array.isArray(docsPayload) ? docsPayload : [];
        const reqPayload = reqRes?.data;
        const requirements = Array.isArray(reqPayload?.data) ? reqPayload.data : Array.isArray(reqPayload) ? reqPayload : [];
        const requiredTypes = getRequiredDocumentTypes(requirements, { treatmentType, isMedicoLegal });
        const missing = requiredTypes.filter((type) => !docs.some((d) => (d.documentType || d.document_type) === type));
        setDocCheck({ key: claimId, missing, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setDocCheck({ key: claimId, missing: [], error: err?.message || "Failed to check document completeness." });
      });

    return () => { cancelled = true; };
    // treatmentType/isMedicoLegal are read from `claim`, which is effectively
    // static per claimId — including it in the deps would re-run this on
    // every parent re-render instead of only when the modal targets a new claim.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, claimId, accessToken, tokenType]);

  if (!isOpen || !claim) return null;

  const employeeName = claim.employeeName || claim.employee_snapshot?.name || claim.employee?.name || "Employee";
  const patientName = claim.patientName || claim.patient_snapshot?.name || claim.patient?.name || "Patient";
  const patientRelationship = claim.patientRelationship || claim.patient_snapshot?.relationship_type || claim.member?.relationship_type || "Self";

  const numAmount = Number(settlementAmount) || 0;
  const checkingDocs = docCheck.key !== claimId && !docCheck.error;
  const missingDocs = docCheck.key === claimId ? docCheck.missing : [];
  const blockedByDocs = !checkingDocs && !docCheck.error && missingDocs.length > 0;

  const handleConfirm = async () => {
    if (blockedByDocs || checkingDocs) return;

    if (!numAmount || numAmount <= 0) {
      setError("Please enter a valid settlement amount.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        decision: "final_approve",
        amount: numAmount,
        mode: paymentMode,
        reference: reference.trim() || undefined,
        remarks: remarks.trim() || undefined,
      };

      const res = await mediclaimApi.submitReviewDecision(claimId, payload, accessToken, tokenType);
      toast.success(`Claim ${formatClaimNumber(claim)} finalized successfully! Claim amount deducted.`);
      onFinalized?.(res?.data ?? null);
      onClose();
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to finalize claim.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl dark:bg-gray-800 dark:border dark:border-gray-700">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                Finalize Claim &amp; Deduct Policy
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Claim {formatClaimNumber(claim)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {!error && blockedByDocs && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <Hourglass size={15} className="mt-0.5 flex-shrink-0" />
            <span>
              Waiting on {missingDocs.length} required document{missingDocs.length === 1 ? "" : "s"} — this claim
              cannot be finalized until they&apos;re all on file.
            </span>
          </div>
        )}

        {!error && docCheck.error && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-300">
            <AlertCircle size={15} className="mt-0.5 flex-shrink-0" />
            <span>{docCheck.error}</span>
          </div>
        )}

        <div className="mt-4 space-y-4 text-xs">
          {/* Employee & Patient Summary */}
          <div className="rounded-xl border border-gray-100 bg-gray-50/70 p-3 dark:border-gray-700 dark:bg-gray-800/60">
            <div className="flex items-center gap-1.5 font-semibold text-gray-900 dark:text-white mb-2">
              <UserCheck size={14} className="text-brand-600 dark:text-brand-400" />
              Employee &amp; Patient Information
            </div>
            <div className="grid grid-cols-2 gap-2 text-gray-600 dark:text-gray-300">
              <div>
                <span className="text-gray-400 block text-[11px]">Employee Name</span>
                <span className="font-medium text-gray-900 dark:text-white">{employeeName}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Patient Name</span>
                <span className="font-medium text-gray-900 dark:text-white">{patientName} ({patientRelationship})</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Treatment Type</span>
                <span className="font-medium text-gray-900 dark:text-white">{treatmentType}</span>
              </div>
              <div>
                <span className="text-gray-400 block text-[11px]">Submission Date</span>
                <span className="font-medium text-gray-900 dark:text-white">{formatClaimDate(claim.submittedAt || claim.submitted_at || claim.createdAt || claim.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Amount Breakdown */}
          <div className="rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-3 dark:border-emerald-500/30 dark:bg-emerald-500/5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-600 dark:text-gray-300">Total Claimed Amount</span>
              <span className="font-semibold text-gray-900 dark:text-white">{formatCurrencyINR(claimedTotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-emerald-200/50 pt-2 text-sm font-bold dark:border-emerald-500/20">
              <span className="text-emerald-800 dark:text-emerald-300">Final Approved Amount to Deduct</span>
              <span className="text-emerald-600 dark:text-emerald-400">{formatCurrencyINR(numAmount)}</span>
            </div>
            <p className="mt-1.5 text-[11px] text-emerald-700 dark:text-emerald-400">
              Confirming will deduct {formatCurrencyINR(numAmount)} from the employee&apos;s annual floater policy limit.
            </p>
          </div>

          {/* Settlement Details */}
          <div className="space-y-3">
            <div>
              <label className="mb-1 block font-semibold text-gray-700 dark:text-gray-300">
                Final Settlement Amount (₹)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={settlementAmount}
                onChange={(e) => setSettlementAmount(e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="Enter final amount"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block font-semibold text-gray-700 dark:text-gray-300">
                  Payment Mode
                </label>
                <select
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                >
                  {SETTLEMENT_MODES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block font-semibold text-gray-700 dark:text-gray-300">
                  Transaction / Ref No.
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Optional reference"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block font-semibold text-gray-700 dark:text-gray-300">
                Final Remarks
              </label>
              <textarea
                rows={2}
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional settlement notes..."
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-gray-700">
          <Button variant="secondary" size="sm" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleConfirm}
            disabled={submitting || checkingDocs || blockedByDocs}
            className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
          >
            <CheckCircle2 size={14} className="mr-1.5" />
            {submitting ? "Finalizing..." : checkingDocs ? "Checking documents…" : "Confirm & Finalize Claim"}
          </Button>
        </div>
      </div>
    </div>
  );
}