import { useEffect, useState } from "react";
import { AlertTriangle, FileText, Receipt, ClipboardList, Gavel, UploadCloud, BedDouble } from "lucide-react";
import toast from "react-hot-toast";
import Drawer, { CollapsibleSection } from "../../../components/ui/Drawer";
import Button from "../../../components/ui/Button";
import DocumentViewerModal from "../../../components/documents/DocumentViewerModal";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { EXPENSE_CATEGORIES, getExpenseCategoryLabel } from "../models/expenseCategories";
import { isTerminalClaimStatus } from "../models/claimStatus";
import { getRequiredDocumentTypes } from "../utils/documentChecklistRules";
import { formatCurrencyINR, formatClaimDate } from "../utils/formatters";
import ClaimSummaryCard from "./ClaimSummaryCard";
import ClaimTimeline from "./ClaimTimeline";
import ClaimDecisionsList from "./ClaimDecisionsList";
import DocumentChecklist from "./DocumentChecklist";

const EMPTY_RESULT = { key: null, claim: null, documents: [], error: null };

/**
 * A single claim's read-only detail: summary + expense breakdown + document
 * list + timeline. This is a pure "click a row, see details" component,
 * reused everywhere a claim is listed — My Claims, Team Claims, Pending
 * Reviews, and the admin Claims tab.
 *
 * `footer` is the escape hatch a later phase's review panel needs: F5 wraps
 * this exact drawer with a remarks textarea + decision buttons passed in as
 * `footer` (see `Drawer`'s own `footer` slot), rather than forking a second
 * detail view — so a reviewer deciding a claim and an employee looking at
 * their own claim history always see identically laid-out data. Passing no
 * `footer` (as every F3 call site does) simply omits it, matching Drawer's
 * existing "footer is optional" contract.
 *
 * `allowDocumentUpload` (opt-in, default false): only `MyClaimsTab.jsx`
 * passes this — it swaps the plain read-only document list for the actual
 * upload checklist (`DocumentChecklist`, with `documentRequirements`) plus a
 * due-date banner, since only the claim's own employee should be uploading
 * documents against it here. Every other existing caller (admin Claims,
 * Team Claims, Pending Reviews, History) is unaffected — they keep the
 * original plain list, exactly as before.
 *
 * When that same claim was submitted while treatment was still ongoing
 * (`is_ongoing_treatment`), the checklist/due-date banner is replaced by a
 * "Finalize Treatment" prompt instead — there is no real due date to show
 * yet, since `documents_due_at` was only ever anchored to admission (or the
 * submission instant) as a placeholder, and the final bill wasn't known at
 * submission either. Recording the discharge date AND the final expense
 * line items together here calls `mediclaimApi.finalizeTreatment()`, which
 * recomputes the real 7-day window server-side and (for a claim already
 * approved-in-principle) reconciles the approved amount to the final total
 * — see `ClaimWorkflowService::finalizeTreatment()`'s docblock. Once that
 * lands the claim reloads and the normal checklist takes over.
 */
export default function ClaimDetailDrawer({ isOpen, onClose, claimId, footer, title, allowDocumentUpload = false, documentRequirements = [], documentRequirementsLoading = false, onDocumentsChanged }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = isOpen && claimId && accessToken ? `${claimId}|${accessToken}|${tokenType ?? ""}|${reloadToken}` : null;
  const [result, setResult] = useState(EMPTY_RESULT);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [wasOpen, setWasOpen] = useState(isOpen);
  // Captured once (lazy initializer, not a render-time `Date.now()` call) —
  // this only ever needs to be "roughly now" for an overdue banner, not
  // live-ticking.
  const [now] = useState(() => new Date());
  const [dischargeInput, setDischargeInput] = useState("");
  const [dischargeSaving, setDischargeSaving] = useState(false);
  const [finalizeExpenses, setFinalizeExpenses] = useState([{ category: "", description: "", claimedAmount: "", expenseDate: "" }]);

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setResult(EMPTY_RESULT);
      setViewerDoc(null);
      setDischargeInput("");
    }
  }

  useEffect(() => {
    if (!requestKey) return undefined;
    let cancelled = false;

    Promise.all([
      mediclaimApi.getClaim(claimId, accessToken, tokenType),
      mediclaimApi.claimDocuments(claimId, accessToken, tokenType).catch(() => null),
    ])
      .then(([claimRes, documentsRes]) => {
        if (cancelled) return;
        const docsPayload = documentsRes?.data;
        const docs = Array.isArray(docsPayload?.data) ? docsPayload.data : Array.isArray(docsPayload) ? docsPayload : [];
        setResult({ key: requestKey, claim: claimRes?.data ?? null, documents: docs, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult((prev) => ({ ...prev, key: requestKey, error: err?.message || "Failed to load claim details." }));
      });

    return () => { cancelled = true; };
  }, [requestKey, claimId, accessToken, tokenType]);

  const { claim, documents } = result;
  const loading = requestKey !== null && result.key !== requestKey;
  const error = loading ? null : result.error;

  const expenses = claim?.expenses || claim?.expenseLines || claim?.expense_lines || [];

  const reloadDocuments = () => {
    setReloadToken((n) => n + 1);
    onDocumentsChanged?.();
  };

  const documentsDueAt = claim?.documentsDueAt || claim?.documents_due_at;
  const missingTypes = claim
    ? getRequiredDocumentTypes(documentRequirements, { treatmentType: claim.treatmentType || claim.treatment_type, isMedicoLegal: claim.isMedicoLegal ?? claim.is_medico_legal_case })
      .filter((type) => !documents.some((d) => (d.documentType || d.document_type) === type))
    : [];
  const isOverdue = documentsDueAt && new Date(documentsDueAt).getTime() < now.getTime();
  const isOngoing = Boolean(claim?.isOngoingTreatment ?? claim?.is_ongoing_treatment);
  const dischargeAt = claim?.dischargeDate || claim?.discharge_at;
  const admissionAt = claim?.admissionDate || claim?.admission_at;
  const isDischargeMissing = isOngoing || !dischargeAt;

  const formatForDatetimeInput = (dateVal) => {
    if (!dateVal) return undefined;
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return undefined;
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const hours = String(d.getHours()).padStart(2, "0");
      const minutes = String(d.getMinutes()).padStart(2, "0");
      return `${year}-${month}-${day}T${hours}:${minutes}`;
    } catch {
      return undefined;
    }
  };
  const minDischargeDate = formatForDatetimeInput(admissionAt);

  // Once a claim reaches a genuinely terminal status (Rejected/Closed/
  // Withdrawn/Cancelled — NOT Settled, which still legally accepts a
  // corrective re-upload), inviting more uploads no longer makes sense;
  // fall back to the plain read-only document list instead.
  const canUploadNow = allowDocumentUpload && !isTerminalClaimStatus(claim?.status);

  const addExpenseLine = () => {
    setFinalizeExpenses((prev) => [...prev, { category: "", description: "", claimedAmount: "", expenseDate: "" }]);
  };

  const updateExpenseLine = (index, field, value) => {
    setFinalizeExpenses((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const removeExpenseLine = (index) => {
    setFinalizeExpenses((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const validExpenseLines = finalizeExpenses.filter((row) => row.category && Number(row.claimedAmount) > 0);
  const canSubmitFinalize = Boolean(dischargeInput) && validExpenseLines.length > 0 && !dischargeSaving;

  const submitFinalizeTreatment = async () => {
    if (!canSubmitFinalize) return;

    const dDate = new Date(dischargeInput);
    const dDay = new Date(dDate.getFullYear(), dDate.getMonth(), dDate.getDate());

    if (admissionAt) {
      const aDate = new Date(admissionAt);
      const aDay = new Date(aDate.getFullYear(), aDate.getMonth(), aDate.getDate());
      if (dDay < aDay) {
        toast.error("Discharge date cannot be before the admission date.");
        return;
      }
    }

    const today = new Date();
    const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (dDay > todayDay) {
      toast.error("Discharge date cannot be in the future.");
      return;
    }

    setDischargeSaving(true);
    try {
      await mediclaimApi.finalizeTreatment(
        claimId,
        { dischargeAt: dischargeInput, expenses: validExpenseLines },
        accessToken,
        tokenType,
      );
      toast.success("Treatment finalized — the document upload window has started.");
      setDischargeInput("");
      setFinalizeExpenses([{ category: "", description: "", claimedAmount: "", expenseDate: "" }]);
      reloadDocuments();
    } catch (err) {
      toast.error(err?.message || "Failed to finalize the treatment.");
    } finally {
      setDischargeSaving(false);
    }
  };

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title={title || claim?.claimNumber || claim?.claim_number || "Claim Details"}
        subtitle={claim?.patientName || claim?.patient_snapshot?.name}
        size="lg"
        footer={footer}
      >
        {loading && <p className="py-10 text-center text-sm text-gray-400">Loading claim…</p>}
        {!loading && error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}

        {!loading && !error && claim && (
          <div className="space-y-4">
            <ClaimSummaryCard claim={claim} />

            <CollapsibleSection title="Expense Breakdown" icon={<Receipt size={15} />} count={expenses.length}>
              {expenses.length === 0 ? (
                <p className="py-2 text-center text-xs text-gray-400">No expense line items recorded.</p>
              ) : (
                <div className="space-y-2">
                  {expenses.map((line, index) => (
                    <div key={line.id ?? index} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700">
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-100">{getExpenseCategoryLabel(line.category)}</p>
                        {line.description && <p className="text-xs text-gray-500 dark:text-gray-400">{line.description}</p>}
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-800 dark:text-gray-100">
                          {formatCurrencyINR(line.claimed_amount ?? line.claimedAmount ?? line.amount)}
                        </p>
                        {(line.approved_amount ?? line.approvedAmount) != null && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            Approved {formatCurrencyINR(line.approved_amount ?? line.approvedAmount)}
                          </p>
                        )}
                        {(line.disallowed_reason || line.disallowedReason) && (
                          <p className="text-xs text-red-500">{line.disallowed_reason || line.disallowedReason}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Documents" icon={<FileText size={15} />} count={documents.length} defaultOpen={canUploadNow}>
              {canUploadNow ? (
                <div className="space-y-3">
                  {isDischargeMissing && (
                    <div className="space-y-3 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 py-3 text-xs dark:border-amber-500/30 dark:bg-amber-500/5">
                      <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                        <BedDouble size={14} className="mt-0.5 flex-shrink-0" />
                        Treatment was still ongoing when this claim was submitted, so the document upload window hasn&apos;t
                        started yet. Once discharged, record the discharge date and the final bill below — you&apos;ll
                        then have 7 days to upload the required documents.
                      </p>

                      <label className="block">
                        <span className="mb-1 block font-semibold text-gray-500 dark:text-gray-400">Date &amp; Time of Discharge</span>
                        <input
                          type="datetime-local"
                          value={dischargeInput}
                          onChange={(e) => setDischargeInput(e.target.value)}
                          min={minDischargeDate}
                          className="w-full max-w-xs rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                        />
                      </label>

                      <div className="space-y-2">
                        <span className="block font-semibold text-gray-500 dark:text-gray-400">Final Charges</span>
                        {finalizeExpenses.map((row, index) => (
                          <div key={index} className="flex flex-wrap items-end gap-2 rounded-lg border border-amber-100 bg-white/60 p-2 dark:border-amber-500/20 dark:bg-gray-800/40">
                            <label className="min-w-[160px] flex-1">
                              <span className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400">Category</span>
                              <select
                                value={row.category}
                                onChange={(e) => updateExpenseLine(index, "category", e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                              >
                                <option value="">Select…</option>
                                {EXPENSE_CATEGORIES.map((cat) => (
                                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                                ))}
                              </select>
                            </label>
                            <label className="min-w-[120px]">
                              <span className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400">Amount (₹)</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={row.claimedAmount}
                                onChange={(e) => updateExpenseLine(index, "claimedAmount", e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                              />
                            </label>
                            <label className="min-w-[130px]">
                              <span className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400">Expense Date</span>
                              <input
                                type="date"
                                value={row.expenseDate}
                                onChange={(e) => updateExpenseLine(index, "expenseDate", e.target.value)}
                                className="w-full rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                              />
                            </label>
                            {finalizeExpenses.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeExpenseLine(index)}
                                className="pb-1.5 text-[11px] font-semibold text-red-500 hover:text-red-600"
                              >
                                Remove
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={addExpenseLine}
                          className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                        >
                          + Add another line
                        </button>
                      </div>

                      <div className="flex justify-end">
                        <Button size="sm" onClick={submitFinalizeTreatment} disabled={!canSubmitFinalize}>
                          {dischargeSaving ? "Saving…" : "Finalize Treatment"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {documentsDueAt && !isDischargeMissing && (
                    <div
                      className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                        isOverdue
                          ? "bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300"
                          : missingTypes.length > 0
                            ? "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                      }`}
                    >
                      {missingTypes.length > 0 ? <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" /> : <UploadCloud size={13} className="mt-0.5 flex-shrink-0" />}
                      <span>
                        {missingTypes.length === 0
                          ? "All required documents are on file."
                          : isOverdue
                            ? `Overdue — required documents were due by ${formatClaimDate(documentsDueAt)}. Upload them as soon as possible.`
                            : `Upload required documents by ${formatClaimDate(documentsDueAt)} (within 1 week of discharge).`}
                      </span>
                    </div>
                  )}

                  <DocumentChecklist
                    claimId={claimId}
                    requirements={documentRequirements}
                    requirementsLoading={documentRequirementsLoading}
                    claimSnapshot={{ treatmentType: claim.treatmentType || claim.treatment_type, isMedicoLegal: claim.isMedicoLegal ?? claim.is_medico_legal_case }}
                    uploadedDocs={documents}
                    onUploaded={reloadDocuments}
                    dischargeDateMissing={isDischargeMissing}
                  />
                </div>
              ) : documents.length === 0 ? (
                <p className="py-2 text-center text-xs text-gray-400">No documents uploaded yet.</p>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <button
                      key={doc.documentId ?? doc.id}
                      type="button"
                      onClick={() => setViewerDoc(doc)}
                      className="flex w-full items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-left text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
                    >
                      <span className="text-gray-700 dark:text-gray-200">{doc.documentLabel || doc.documentType}</span>
                      <span className="text-xs text-gray-400">{doc.status || "View"}</span>
                    </button>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Decisions" icon={<Gavel size={15} />}>
              <ClaimDecisionsList claimId={claimId} />
            </CollapsibleSection>

            <CollapsibleSection title="Timeline" icon={<ClipboardList size={15} />}>
              <ClaimTimeline claimId={claimId} />
            </CollapsibleSection>
          </div>
        )}
      </Drawer>

      <DocumentViewerModal document={viewerDoc} open={Boolean(viewerDoc)} onClose={() => setViewerDoc(null)} />
    </>
  );
}
