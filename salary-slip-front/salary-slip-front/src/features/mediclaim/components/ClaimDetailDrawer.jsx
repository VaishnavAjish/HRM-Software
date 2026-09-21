import { useEffect, useState } from "react";
import { AlertTriangle, FileText, Receipt, ClipboardList, Gavel, UploadCloud, BedDouble, Check, CheckCircle2, Eye, X, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import Drawer, { CollapsibleSection } from "../../../components/ui/Drawer";
import Button from "../../../components/ui/Button";
import DocumentViewerModal from "../../../components/documents/DocumentViewerModal";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { isTerminalClaimStatus } from "../models/claimStatus";
import { getRequiredDocumentTypes } from "../utils/documentChecklistRules";
import { formatCurrencyINR, formatClaimDate, formatClaimNumber } from "../utils/formatters";
import ClaimSummaryCard from "./ClaimSummaryCard";
import ClaimTimeline from "./ClaimTimeline";
import ClaimDecisionsList from "./ClaimDecisionsList";
import DocumentChecklist from "./DocumentChecklist";
import ExpenseEditor from "./ExpenseEditor";

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
  const [isEditingExpenses, setIsEditingExpenses] = useState(false);
  const [editingExpenses, setEditingExpenses] = useState([]);
  const [savingExpenses, setSavingExpenses] = useState(false);
  const [actionDocId, setActionDocId] = useState(null);
  const [actionType, setActionType] = useState(null);

  const handleApproveDocument = async (docId) => {
    if (!docId || actionDocId) return;
    setActionDocId(docId);
    setActionType("approve");
    try {
      await mediclaimApi.approveClaimDocument(claimId, docId, accessToken, tokenType);
      toast.success("Document approved successfully.");
      reloadDocuments();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to approve document.");
    } finally {
      setActionDocId(null);
      setActionType(null);
    }
  };

  const handleDenyDocument = async (docId) => {
    if (!docId || actionDocId) return;
    setActionDocId(docId);
    setActionType("deny");
    try {
      await mediclaimApi.denyClaimDocument(claimId, docId, accessToken, tokenType);
      toast.success("Document denied successfully.");
      reloadDocuments();
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to deny document.");
    } finally {
      setActionDocId(null);
      setActionType(null);
    }
  };

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

  const totalExpenses = expenses.length > 0
    ? expenses.reduce((sum, line) => {
        const val = Number(line.claimed_amount ?? line.claimedAmount ?? line.amount ?? 0);
        return sum + (isNaN(val) ? 0 : val);
      }, 0)
    : Number(claim?.totalClaimedAmount ?? claim?.total_claimed_amount ?? 0);

  const totalApprovedExpenses = expenses.some((line) => (line.approved_amount ?? line.approvedAmount) != null)
    ? expenses.reduce((sum, line) => {
        const val = Number(line.approved_amount ?? line.approvedAmount ?? 0);
        return sum + (isNaN(val) ? 0 : val);
      }, 0)
    : (claim?.approvedAmount ?? claim?.approved_amount ?? claim?.totalApprovedAmount ?? claim?.total_approved_amount != null
        ? Number(claim?.approvedAmount ?? claim?.approved_amount ?? claim?.totalApprovedAmount ?? claim?.total_approved_amount)
        : null);

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

  const canSubmitFinalize = Boolean(dischargeInput) && !dischargeSaving;

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

    setDischargeSaving(true);
    try {
      await mediclaimApi.recordClaimDischarge(
        claimId,
        dischargeInput,
        accessToken,
        tokenType,
      );
      toast.success("Treatment finalized — the document upload window has started.");
      setDischargeInput("");
      reloadDocuments();
    } catch (err) {
      toast.error(err?.message || "Failed to finalize the treatment.");
    } finally {
      setDischargeSaving(false);
    }
  };

  const startEditingExpenses = () => {
    const lines = expenses.length > 0
      ? expenses.map((line) => ({
          category: line.category,
          amount: String(line.claimed_amount ?? line.claimedAmount ?? line.amount ?? ""),
          description: line.description || "",
          expenseDate: line.expense_date || line.expenseDate || "",
        }))
      : [{ category: "", amount: "", description: "" }];
    setEditingExpenses(lines);
    setIsEditingExpenses(true);
  };

  const cancelEditingExpenses = () => {
    setIsEditingExpenses(false);
    setEditingExpenses([]);
  };

  const handleSaveExpenses = async () => {
    setSavingExpenses(true);
    try {
      await mediclaimApi.updateClaimExpenses(claimId, editingExpenses, accessToken, tokenType);
      toast.success("Expense breakdown updated.");
      setIsEditingExpenses(false);
      reloadDocuments();
    } catch (err) {
      toast.error(err?.message || "Failed to update expense breakdown.");
    } finally {
      setSavingExpenses(false);
    }
  };

  return (
    <>
      <Drawer
        isOpen={isOpen}
        onClose={onClose}
        title={claim ? formatClaimNumber(claim) : (title ? formatClaimNumber(title) : "Claim Details")}
        subtitle={claim?.patientName || claim?.patient_snapshot?.name}
        size="lg"
        footer={footer}
      >
        {loading && <p className="py-10 text-center text-sm text-gray-400">Loading claim…</p>}
        {!loading && error && <p className="py-10 text-center text-sm text-red-500">{error}</p>}

        {!loading && !error && claim && (
          <div className="space-y-4">
            <ClaimSummaryCard claim={claim} />

            <CollapsibleSection
              title="Expense Breakdown"
              icon={<Receipt size={15} />}
              count={expenses.length}
              action={
                !isTerminalClaimStatus(claim?.status) && !isEditingExpenses ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      startEditingExpenses();
                    }}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400"
                  >
                    Edit Expenses
                  </button>
                ) : null
              }
            >
              {isEditingExpenses ? (
                <div className="space-y-3 pt-1">
                  <ExpenseEditor
                    lines={editingExpenses}
                    onChange={setEditingExpenses}
                  />
                  <div className="flex justify-end gap-2 pt-2">
                    <Button size="sm" variant="secondary" onClick={cancelEditingExpenses} disabled={savingExpenses}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveExpenses} disabled={savingExpenses}>
                      {savingExpenses ? "Saving..." : "Save Expenses"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {expenses.length === 0 ? (
                    <div className="space-y-2">
                      <p className="py-2 text-center text-xs text-gray-400">No expense line items recorded.</p>
                      {Number(claim?.totalClaimedAmount ?? claim?.total_claimed_amount ?? 0) > 0 && (
                        <div className="flex items-center justify-between rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2 text-xs dark:border-gray-700 dark:bg-gray-800/40">
                          <span className="text-gray-600 dark:text-gray-300">Total Claimed</span>
                          <span className="font-semibold text-gray-900 dark:text-white">
                            {formatCurrencyINR(claim?.totalClaimedAmount ?? claim?.total_claimed_amount)}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {expenses.map((line, idx) => (
                        <div
                          key={line.id ?? idx}
                          className="flex items-start justify-between rounded-lg border border-gray-100 bg-white p-2.5 text-xs dark:border-gray-700 dark:bg-gray-800"
                        >
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">
                              {line.categoryLabel || line.category}
                            </p>
                            {line.description && (
                              <p className="mt-0.5 text-gray-500 dark:text-gray-400">{line.description}</p>
                            )}
                            {line.expense_date && (
                              <p className="mt-0.5 text-[11px] text-gray-400">{line.expense_date}</p>
                            )}
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-gray-900 dark:text-white">
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

                      <div className="mt-3 flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/90 px-3 py-2.5 text-sm font-semibold dark:border-gray-700 dark:bg-gray-800/80">
                        <div>
                          <p className="text-gray-900 dark:text-white">Total Expenses</p>
                          <p className="text-xs font-normal text-gray-500 dark:text-gray-400">
                            {expenses.length} {expenses.length === 1 ? "item" : "items"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-base font-bold text-gray-900 dark:text-white">
                            {formatCurrencyINR(totalExpenses)}
                          </p>
                          {totalApprovedExpenses != null && totalApprovedExpenses > 0 && (
                            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                              Approved {formatCurrencyINR(totalApprovedExpenses)}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}</CollapsibleSection>

            <CollapsibleSection title="Documents" icon={<FileText size={15} />} count={documents.length} defaultOpen={canUploadNow}>
              {canUploadNow ? (
                <div className="space-y-3">
                  {isDischargeMissing && (
                    <div className="space-y-3 rounded-lg border border-dashed border-amber-200 bg-amber-50/60 px-3 py-3 text-xs dark:border-amber-500/30 dark:bg-amber-500/5">
                      <p className="flex items-start gap-2 text-amber-700 dark:text-amber-300">
                        <BedDouble size={14} className="mt-0.5 flex-shrink-0" />
                        Treatment was still ongoing when this claim was submitted, so the document upload window hasn&apos;t
                        started yet. Once discharged, record the discharge date below — you&apos;ll
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
                  {documents.map((doc) => {
                    const docId = doc.documentId ?? doc.id;
                    const docStatus = (doc.status || "ACTIVE").toUpperCase();
                    const isApproved = docStatus === "APPROVED";
                    const isDenied = docStatus === "DENIED" || docStatus === "REJECTED";
                    const isActive = !isApproved && !isDenied;

                    return (
                      <div
                        key={docId}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-white px-3 py-2.5 text-sm hover:bg-gray-50/70 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/40"
                      >
                        <div
                          onClick={() => setViewerDoc(doc)}
                          className="min-w-0 flex-1 cursor-pointer"
                        >
                          <span className="truncate font-medium text-gray-800 hover:text-brand-600 dark:text-gray-200 dark:hover:text-brand-400">
                            {doc.documentLabel || doc.documentType}
                          </span>
                        </div>

                        <div className="flex flex-shrink-0 items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setViewerDoc(doc)}
                            className="inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                          >
                            <Eye size={12} />
                            View
                          </button>

                          {isActive && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleApproveDocument(docId)}
                                disabled={actionDocId === docId}
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 disabled:opacity-50"
                              >
                                <Check size={12} />
                                {actionDocId === docId && actionType === "approve" ? "Approving..." : "Approve"}
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDenyDocument(docId)}
                                disabled={actionDocId === docId}
                                className="inline-flex items-center gap-1 rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1 disabled:opacity-50"
                              >
                                <X size={12} />
                                {actionDocId === docId && actionType === "deny" ? "Denying..." : "Deny"}
                              </button>
                            </>
                          )}

                          {isApproved && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" /> Approved
                            </span>
                          )}

                          {isDenied && (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400">
                              <XCircle size={14} className="text-red-600 dark:text-red-400" /> Denied
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
