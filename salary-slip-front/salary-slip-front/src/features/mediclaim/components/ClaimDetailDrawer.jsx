import { useEffect, useState } from "react";
import { FileText, Receipt, ClipboardList, Gavel } from "lucide-react";
import Drawer, { CollapsibleSection } from "../../../components/ui/Drawer";
import DocumentViewerModal from "../../../components/documents/DocumentViewerModal";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { getExpenseCategoryLabel } from "../models/expenseCategories";
import { formatCurrencyINR } from "../utils/formatters";
import ClaimSummaryCard from "./ClaimSummaryCard";
import ClaimTimeline from "./ClaimTimeline";
import ClaimDecisionsList from "./ClaimDecisionsList";

const EMPTY_RESULT = { key: null, claim: null, documents: [], error: null };

/**
 * A single claim's read-only detail: summary + expense breakdown + document
 * list + timeline. This is a pure "click a row, see details" component,
 * reused everywhere a claim is listed — History here in F3; Team Claims,
 * Pending Reviews, and the admin Claims tab in later phases.
 *
 * `footer` is the escape hatch a later phase's review panel needs: F5 wraps
 * this exact drawer with a remarks textarea + decision buttons passed in as
 * `footer` (see `Drawer`'s own `footer` slot), rather than forking a second
 * detail view — so a reviewer deciding a claim and an employee looking at
 * their own claim history always see identically laid-out data. Passing no
 * `footer` (as every F3 call site does) simply omits it, matching Drawer's
 * existing "footer is optional" contract.
 */
export default function ClaimDetailDrawer({ isOpen, onClose, claimId, footer, title }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const requestKey = isOpen && claimId && accessToken ? `${claimId}|${accessToken}|${tokenType ?? ""}` : null;
  const [result, setResult] = useState(EMPTY_RESULT);
  const [viewerDoc, setViewerDoc] = useState(null);
  const [wasOpen, setWasOpen] = useState(isOpen);

  if (wasOpen !== isOpen) {
    setWasOpen(isOpen);
    if (!isOpen) {
      setResult(EMPTY_RESULT);
      setViewerDoc(null);
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
                        <p className="font-semibold text-gray-800 dark:text-gray-100">{formatCurrencyINR(line.claimedAmount ?? line.amount)}</p>
                        {(line.approvedAmount != null || line.approved_amount != null) && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                            Approved {formatCurrencyINR(line.approvedAmount ?? line.approved_amount)}
                          </p>
                        )}
                        {line.disallowedReason && <p className="text-xs text-red-500">{line.disallowedReason}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleSection>

            <CollapsibleSection title="Documents" icon={<FileText size={15} />} count={documents.length}>
              {documents.length === 0 ? (
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
