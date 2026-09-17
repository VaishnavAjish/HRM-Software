import { useState } from "react";
import { CheckCircle2, Eye, Loader2, UploadCloud } from "lucide-react";
import toast from "react-hot-toast";
import DocumentViewerModal from "../../../components/documents/DocumentViewerModal";
import { useAuth } from "../../../context/AuthContext";
import { mediclaimApi } from "../services/mediclaimApi";
import { REQUIREMENT, resolveRequiredDocuments } from "../utils/documentChecklistRules";

const CONDITION_NOTES = {
  hospitalized_or_surgery: "Required if hospitalized",
  medico_legal: "Required if medico-legal",
};

/**
 * The document checklist — rows come from the HR-managed `requirements`
 * list (`mediclaimApi.documentRequirements()`) rather than a fixed
 * constant, so admins can add/retire document types and flip
 * required/optional without a code change. Required/optional state per row
 * still comes from `documentChecklistRules.resolveRequiredDocuments`, now
 * driven by each row's own `conditionalRule` instead of a hardcoded rule.
 *
 * Upload/view is built directly on the existing document plumbing:
 * `mediclaimApi.uploadClaimDocument` for upload, and the existing
 * `DocumentViewerModal` (reused completely unmodified) for viewing an
 * already-uploaded document.
 *
 * Refuses to render meaningful upload controls when `claimId` is missing.
 *
 * `requirementsLoading` (from the caller's own lookups fetch) disambiguates
 * an empty `requirements` array that's still loading from one that's
 * genuinely empty (HR hasn't configured any document types under Settings →
 * Document Requirements yet) — these used to look identical ("Loading the
 * document checklist…" forever), which read exactly like the upload feature
 * being broken. In practice this table self-heals on first read (see
 * `MediclaimDocumentRequirement::ensureDefaultsSeeded()`), but the honest
 * empty-state message stays as a safety net regardless.
 */
export default function DocumentChecklist({ claimId, requirements = [], requirementsLoading = false, claimSnapshot = {}, uploadedDocs = [], onUploaded, readOnly = false }) {
  const { user } = useAuth();
  const [uploadingType, setUploadingType] = useState(null);
  const [viewerDoc, setViewerDoc] = useState(null);

  const resolved = resolveRequiredDocuments(requirements, claimSnapshot);
  const rows = [...requirements].sort((a, b) => (a.sortOrder ?? a.sort_order ?? 0) - (b.sortOrder ?? b.sort_order ?? 0));

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
          Document upload unlocks once this claim has a claim number.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">
          {requirementsLoading
            ? "Loading the document checklist…"
            : "No document types have been configured yet — ask HR to set these up under Mediclaim Settings."}
        </p>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-100 bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
          {rows.map((row) => {
            const documentType = row.documentType || row.document_type;
            const requirement = resolved[documentType];
            const conditionalRule = row.conditionalRule || row.conditional_rule;
            const docs = docsByType(documentType);
            const isUploading = uploadingType === documentType;
            const inputId = `mediclaim-doc-${documentType}`;

            return (
              <div key={row.id ?? documentType} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
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
                  {conditionalRule && CONDITION_NOTES[conditionalRule] && (
                    <p className="text-[11px] text-gray-400">{CONDITION_NOTES[conditionalRule]}</p>
                  )}
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
                      onChange={(e) => handleFileChange(documentType, e)}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}

      <DocumentViewerModal document={viewerDoc} open={Boolean(viewerDoc)} onClose={() => setViewerDoc(null)} />
    </div>
  );
}
