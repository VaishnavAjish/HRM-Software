import { useEffect, useState } from "react";
import { CheckCircle2, Hourglass } from "lucide-react";
import Button from "../../../components/ui/Button";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { getRequiredDocumentTypes } from "../utils/documentChecklistRules";
import { formatCurrencyINR } from "../utils/formatters";
import ClaimSummaryCard from "./ClaimSummaryCard";
import DocumentChecklist from "./DocumentChecklist";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const SETTLEMENT_MODES = [
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
  { value: "cash", label: "Cash" },
  { value: "online", label: "Online Payment" },
];

/**
 * Settlement / "Final Approve" — the last step once a claim clears Director
 * Final Approval (status SETTLEMENT_PENDING). Deliberately does NOT reuse
 * `ReviewPanelShell` (a decision + remarks form doesn't fit an
 * amount/mode/reference one), and deliberately blocks the whole form while
 * any required document is still missing — recording a settlement is
 * refused server-side too (`ClaimWorkflowService::recordSettlement()`),
 * this is just that same rule surfaced before the user wastes a submit
 * attempt. This is what keeps a claim sitting in Pending Reviews (never
 * the admin Claims tab) until the employee's documents are actually in.
 *
 * A single "Final Approve" submit both records the settlement AND (once it
 * fully covers the approved amount, which the prefilled default does)
 * closes the claim in the same request — `ReviewQueueController::decide()`
 * chains `closeClaim()` right after a fully-settling `recordSettlement()`.
 *
 * Renders the claim's actual uploaded documents (`DocumentChecklist`,
 * `readOnly`) above the blocked/ready state, regardless of which one it is —
 * this used to only compute a missing-count and never showed the documents
 * themselves, so whoever finalizes a claim had no way to actually open and
 * check what the employee submitted before approving payment.
 */
export default function SettlementPanel({ claim, onDecided }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const claimId = claim?.id ?? claim?.claimId;
  const approvedAmount = Number(claim?.totalApprovedAmount ?? claim?.total_approved_amount ?? 0);

  const [checkResult, setCheckResult] = useState({ key: null, missing: [], docs: [], requirements: [], error: null });
  const [amount, setAmount] = useState(approvedAmount > 0 ? String(approvedAmount) : "");
  const [mode, setMode] = useState(SETTLEMENT_MODES[0].value);
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!accessToken || !claimId) return undefined;
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
        const requiredTypes = getRequiredDocumentTypes(requirements, {
          treatmentType: claim?.treatmentType || claim?.treatment_type,
          isMedicoLegal: claim?.isMedicoLegal ?? claim?.is_medico_legal_case,
        });
        const missing = requiredTypes.filter((type) => !docs.some((d) => (d.documentType || d.document_type) === type));
        setCheckResult({ key: claimId, missing, docs, requirements, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setCheckResult({ key: claimId, missing: [], docs: [], requirements: [], error: err?.message || "Failed to check document completeness." });
      });

    return () => { cancelled = true; };
    // `claim` is read for its (effectively static, per-claim) treatment
    // fields only — including the whole object would re-run this on every
    // parent re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, tokenType, claimId]);

  const checking = checkResult.key !== claimId;
  const blocked = !checking && !checkResult.error && checkResult.missing.length > 0;

  const submit = async () => {
    if (!amount || Number(amount) <= 0) {
      setError("Enter a settlement amount greater than zero.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await mediclaimApi.submitReviewDecision(
        claimId,
        { decision: "final_approve", amount: Number(amount), mode, reference: reference.trim() || undefined },
        accessToken,
        tokenType,
      );
      onDecided?.(res?.data ?? null);
    } catch (err) {
      setError(err?.message || "Failed to record the settlement.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <ClaimSummaryCard claim={claim} />

      {checking ? (
        <p className="py-6 text-center text-sm text-gray-400">Checking document completeness…</p>
      ) : checkResult.error ? (
        <p className="py-6 text-center text-sm text-red-500">{checkResult.error}</p>
      ) : (
        <div className="space-y-4">
          {/* The actual uploaded documents, viewable right here — this is
              the whole reason a claim sits in "Pending Document": to let
              whoever finalizes it actually open and check what the
              employee submitted before approving payment, not just see a
              blocked/ready toggle. readOnly (no upload controls) since this
              is the reviewer's view, not the employee's own. */}
          <DocumentChecklist
            claimId={claimId}
            requirements={checkResult.requirements}
            claimSnapshot={{ treatmentType: claim?.treatmentType || claim?.treatment_type, isMedicoLegal: claim?.isMedicoLegal ?? claim?.is_medico_legal_case }}
            uploadedDocs={checkResult.docs}
            readOnly
          />

          {blocked ? (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              <Hourglass size={14} className="mt-0.5 flex-shrink-0" />
              <span>
                Waiting on the employee to upload {checkResult.missing.length} required document{checkResult.missing.length === 1 ? "" : "s"} —
                this claim cannot be settled until they're all on file. It stays in Pending Reviews until then.
              </span>
            </div>
          ) : (
            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={14} /> All required documents are on file — ready to finalize.
              </p>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Settlement Amount (₹)<span className="text-red-500"> *</span>
                  </label>
                  <input type="number" min="0.01" step="0.01" className={inputClass} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  {approvedAmount > 0 && <p className="mt-1 text-[11px] text-gray-400">Approved amount: {formatCurrencyINR(approvedAmount)}</p>}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Mode</label>
                  <select className={inputClass} value={mode} onChange={(e) => setMode(e.target.value)}>
                    {SETTLEMENT_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Reference Number</label>
                <input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Transaction / cheque number" />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <div className="flex justify-end">
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? "Finalizing…" : "Final Approve"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
