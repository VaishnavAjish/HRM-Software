import { useEffect, useState } from "react";
import { FileText, Receipt, ClipboardList, Gavel, Stethoscope, Check, CheckCircle2, Eye, X, XCircle } from "lucide-react";
import toast from "react-hot-toast";
import { CollapsibleSection } from "../../../components/ui/Drawer";
import DocumentViewerModal from "../../../components/documents/DocumentViewerModal";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { getExpenseCategoryLabel } from "../models/expenseCategories";
import { formatCurrencyINR, formatClaimDate } from "../utils/formatters";
import ClaimDecisionsList from "./ClaimDecisionsList";
import ClaimTimeline from "./ClaimTimeline";

/**
 * Everything an approver needs to see about a claim beyond the compact
 * `ClaimSummaryCard` header — illness/hospital/treatment details, the
 * expense breakdown, uploaded documents (read-only), prior stage
 * decisions, and the full event timeline. Fetches the full claim +
 * document list itself from just a `claimId`, since the thin row object
 * `reviews/pending` returns (used to populate the Pending Approval/Pending
 * Document tables) carries none of this.
 *
 * Purpose-built for `ReviewPanelShell` (every decision panel embeds this
 * between the summary card and the decision controls, per the user's "show
 * all details when approving" request) — but it's plain `claimId`-driven,
 * so any other read-only detail view could reuse it too.
 */
export default function ClaimFullDetail({ claimId }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [reloadToken, setReloadToken] = useState(0);
  const [actionDocId, setActionDocId] = useState(null);
  const [actionType, setActionType] = useState(null);
  const requestKey = claimId && accessToken ? `${claimId}|${accessToken}|${tokenType ?? ""}|${reloadToken}` : null;

  const handleApproveDocument = async (docId) => {
    if (!docId || actionDocId) return;
    setActionDocId(docId);
    setActionType("approve");
    try {
      await mediclaimApi.approveClaimDocument(claimId, docId, accessToken, tokenType);
      toast.success("Document approved successfully.");
      setReloadToken((t) => t + 1);
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
      setReloadToken((t) => t + 1);
    } catch (err) {
      toast.error(err?.response?.data?.message || err?.message || "Failed to deny document.");
    } finally {
      setActionDocId(null);
      setActionType(null);
    }
  };
  const [result, setResult] = useState({ key: null, claim: null, documents: [], error: null });
  const [viewerDoc, setViewerDoc] = useState(null);

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

  if (!claimId) return null;
  if (loading) return <p className="py-6 text-center text-xs text-gray-400">Loading claim details…</p>;
  if (result.error) return <p className="py-6 text-center text-xs text-red-500">{result.error}</p>;
  if (!claim) return null;

  const expenses = claim.expenses || claim.expenseLines || claim.expense_lines || [];

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
  const hospitalName = claim.isNetworkHospital ?? claim.is_network_hospital
    ? (claim.hospital?.name || claim.hospitalName)
    : (claim.nonNetworkHospitalName || claim.non_network_hospital_name);
  const isMedicoLegal = Boolean(claim.isMedicoLegal ?? claim.is_medico_legal_case ?? claim.is_medico_legal ?? claim.isMedicoLegalCase);
  const isOngoing = Boolean(claim.isOngoingTreatment ?? claim.is_ongoing_treatment);

  return (
    <div className="space-y-4">
      <CollapsibleSection title="Claim Information" icon={<Stethoscope size={15} />} defaultOpen>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <InfoField label="Treatment Type" value={claim.treatmentType || claim.treatment_type} />
          <InfoField label="Hospital" value={hospitalName} />
          <InfoField label="Medico-Legal Case" value={isMedicoLegal ? "Yes" : "No"} />
          <InfoField label="Nature of Illness" value={claim.natureOfIllness || claim.nature_of_illness} />
          <InfoField label="Treating Doctor" value={claim.treatingDoctorName || claim.treating_doctor_name} />
          <InfoField label="First Symptom Date" value={formatClaimDate(claim.firstSymptomDate || claim.first_symptom_date)} />
          <InfoField label="First Consultation" value={formatClaimDate(claim.firstConsultationDate || claim.first_consultation_date)} />
          <InfoField label="Admission" value={formatClaimDate(claim.admissionAt || claim.admission_at)} />
          <InfoField label="Discharge" value={isOngoing ? "Ongoing" : formatClaimDate(claim.dischargeAt || claim.discharge_at)} />
        </div>
        {(claim.treatmentDescription || claim.treatment_description) && (
          <p className="mt-3 text-xs text-gray-600 dark:text-gray-300">
            {claim.treatmentDescription || claim.treatment_description}
          </p>
        )}
      </CollapsibleSection>

      <CollapsibleSection title="Expense Breakdown" icon={<Receipt size={15} />} count={expenses.length}>
        {expenses.length === 0 ? (
          <div className="space-y-2">
            <p className="py-2 text-center text-xs text-gray-400">No expense line items recorded.</p>
            {Number(claim?.totalClaimedAmount ?? claim?.total_claimed_amount ?? 0) > 0 && (
              <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50/90 px-3 py-2.5 text-sm font-semibold dark:border-gray-700 dark:bg-gray-800/80">
                <p className="text-gray-900 dark:text-white">Total Expenses</p>
                <div className="text-right">
                  <p className="text-base font-bold text-gray-900 dark:text-white">
                    {formatCurrencyINR(claim?.totalClaimedAmount ?? claim?.total_claimed_amount)}
                  </p>
                  {totalApprovedExpenses != null && totalApprovedExpenses > 0 && (
                    <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      Approved {formatCurrencyINR(totalApprovedExpenses)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
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
      </CollapsibleSection>

      <CollapsibleSection title="Documents" icon={<FileText size={15} />} count={documents.length}>
        {documents.length === 0 ? (
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

      <CollapsibleSection title="Prior Decisions" icon={<Gavel size={15} />}>
        <ClaimDecisionsList claimId={claimId} />
      </CollapsibleSection>

      <CollapsibleSection title="Timeline" icon={<ClipboardList size={15} />}>
        <ClaimTimeline claimId={claimId} />
      </CollapsibleSection>

      <DocumentViewerModal document={viewerDoc} open={Boolean(viewerDoc)} onClose={() => setViewerDoc(null)} />
    </div>
  );
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{value || "—"}</p>
    </div>
  );
}
