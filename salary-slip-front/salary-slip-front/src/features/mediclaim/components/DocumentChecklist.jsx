import { useState } from "react";
import { CheckCircle2, Eye, Loader2, UploadCloud } from "lucide-react";
import toast from "react-hot-toast";
import DocumentViewerModal from "../../../components/documents/DocumentViewerModal";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { CLAIM_DOCUMENT_CHECKLIST } from "../models/documentTypes";
import { REQUIREMENT, resolveRequiredDocuments } from "../utils/documentChecklistRules";

/**
 * Section F — fixed 8-row document checklist. Required/optional state per
 * row comes from `documentChecklistRules.resolveRequiredDocuments`, driven
 * only by the claim's treatment type and medico-legal flag (see that file's
 * own doc comment for the two conditional rules).
 *
 * Upload/view is built directly on the existing document plumbing per the
 * implementation plan's reconciliation #4: `mediclaimApi.uploadClaimDocument`
 * for upload, and the existing `DocumentViewerModal` (reused completely
 * unmodified) for viewing an already-uploaded document.
 *
 * Refuses to render meaningful upload controls when `claimId` is missing —
 * the wizard gates reaching this step until a real claim id exists (Step 1's
 * "Save & Continue" is what creates it), but this component guards
 * independently too rather than assuming its caller always gets that right.
 */
export default function DocumentChecklist({ claimId, claimSnapshot = {}, uploadedDocs = [], onUploaded, readOnly = false }) {
  const { user } = useAuth();
  const [uploadingType, setUploadingType] = useState(null);
  const [viewerDoc, setViewerDoc] = useState(null);

  const requirements = resolveRequiredDocuments(claimSnapshot);

  const docsByType = (documentType) => uploadedDocs.filter((d) => (d.documentType || d.document_type) === documentType);

  const handleFileChange = async (documentType, event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !claimId) return;

    setUploadingType(documentType);
    try {
      await mediclaimApi.uploadClaimDocument(claimId, { file, documentType }, user?.accessToken, user?.tokenType);
      toast.success("Document uploaded");
      onUploaded?.();
    } catch (err) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploadingType(null);
    }
  };

  return (
    <div className="space-y-3">
      {!claimId && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
          Save the earlier steps first — document upload unlocks once this claim has been saved and has a claim number.
        </p>
      )}

      <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
        {CLAIM_DOCUMENT_CHECKLIST.map((row) => {
          const requirement = requirements[row.documentType];
          if (requirement === REQUIREMENT.HIDDEN) return null;

          const docs = docsByType(row.documentType);
          const isUploading = uploadingType === row.documentType;
          const inputId = `mediclaim-doc-${row.key}`;

          return (
            <div key={row.key} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{row.label}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      requirement === REQUIREMENT.REQUIRED
                        ? "bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300"
                        : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                    }`}
                  >
                    {requirement === REQUIREMENT.REQUIRED ? "Required" : "Optional"}
                  </span>
                </div>
                {row.conditionNote && <p className="text-[11px] text-gray-400">{row.conditionNote}</p>}
                {docs.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {docs.map((doc) => (
                      <button
                        key={doc.documentId ?? doc.id}
                        type="button"
                        onClick={() => setViewerDoc(doc)}
                        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-300"
                      >
                        <CheckCircle2 size={11} /> {doc.currentVersion?.fileName || doc.fileName || "View"}
                        <Eye size={11} />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {!readOnly && (
                <label
                  htmlFor={claimId ? inputId : undefined}
                  className={`inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    !claimId
                      ? "cursor-not-allowed border-gray-200 text-gray-350 dark:border-gray-700 dark:text-gray-600"
                      : "cursor-pointer border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {isUploading ? <Loader2 size={13} className="animate-spin" /> : <UploadCloud size={13} />}
                  {docs.length > 0 ? "Replace" : "Upload"}
                  <input
                    id={inputId}
                    type="file"
                    className="hidden"
                    disabled={!claimId || isUploading}
                    onChange={(e) => handleFileChange(row.documentType, e)}
                  />
                </label>
              )}
            </div>
          );
        })}
      </div>

      <DocumentViewerModal document={viewerDoc} open={Boolean(viewerDoc)} onClose={() => setViewerDoc(null)} />
    </div>
  );
}
