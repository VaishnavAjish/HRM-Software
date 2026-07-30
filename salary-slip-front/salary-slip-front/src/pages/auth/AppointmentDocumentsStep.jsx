import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, Eye, Download, RefreshCw, Trash2, Loader2, ArrowLeft,
  CheckCircle2, AlertTriangle, Inbox, Camera,
} from "lucide-react";
import toast from "react-hot-toast";
import { appointmentV1Api, documentV1Api } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import usePhotoCapture from "../../hooks/usePhotoCapture";
import DocumentViewerModal from "../../components/documents/DocumentViewerModal";
import { PHOTO_DOCUMENT_TYPE } from "./documentTypes";

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.webp";

// Used only until GET /v1/documents/types answers (or if it's unreachable) —
// the real, authoritative list always comes from the server. This previously
// hardcoded list included "APPOINTMENT_FORM", which was never a key in
// DocumentType::CATEGORIES on the backend: every upload against it was
// rejected there with DOCUMENT_TYPE_INVALID, so it silently never appeared
// in the list above. Every slug below is a real, current catalogue key so the
// fallback can't repeat that mistake.
const FALLBACK_TYPES = [
  { value: "AADHAR_CARD", label: "Aadhaar Card" },
  { value: "PAN_CARD", label: "PAN Card" },
  { value: "PHOTOGRAPH", label: "Photograph" },
  { value: "BANK_PASSBOOK", label: "Passbook" },
  { value: "RESUME", label: "Resume" },
  { value: "ELECTRICITY_BILL", label: "Electricity Bill" },
  { value: "DEGREE_CERTIFICATE", label: "Degree Certificate" },
  { value: "EXPERIENCE_LETTER", label: "Experience Letter" },
  { value: "APPOINTMENT_LETTER", label: "Appointment Letter" },
  { value: "SIGNATURE", label: "Signature" },
  { value: "OTHER", label: "Other" },
];
const FALLBACK_MAX_BYTES = 10 * 1024 * 1024;
const FALLBACK_MIME = { default: ["application/pdf", "image/jpeg", "image/png"] };

const formatSize = (b) =>
  !b ? "—" : b < 1024 ? `${b} B` : b < 1048576 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1048576).toFixed(1)} MB`;

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

/**
 * Shown when the profile photo taken on step 1 could not be uploaded with the
 * appointment save. The appointment itself is already stored — only the photo
 * is outstanding — so this offers a retry rather than sending the user back.
 */
function PendingPhotoBanner({ photo, retrying, onRetry, onRemove }) {
  if (!photo) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <div className="flex items-center gap-2 text-xs text-amber-800">
        <AlertTriangle size={15} className="shrink-0" />
        <span>
          <strong className="font-bold">Profile photo upload failed.</strong>{" "}
          The appointment was saved. {photo.name} · {formatSize(photo.size)}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={retrying}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-40"
        >
          {retrying ? (
            <><Loader2 size={13} className="animate-spin" /> Uploading…</>
          ) : (
            <><RefreshCw size={13} /> Retry Upload</>
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={retrying}
          className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 disabled:opacity-40"
        >
          Remove Photo
        </button>
      </div>
    </div>
  );
}

/**
 * Step 2 of the appointment flow. Receives only the saved appointmentId — the
 * Aadhaar number is read server-side from the appointment record and is never
 * sent from here.
 */
export default function AppointmentDocumentsStep({
  appointmentId,
  summary = {},
  onBack,
  onComplete,
  pendingPhoto = null,
  onPendingPhotoUploaded,
  onDiscardPendingPhoto,
}) {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [docs, setDocs] = useState([]);
  const [listState, setListState] = useState({ loading: true, error: null });
  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [lastError, setLastError] = useState(null);
  const fileRef = useRef(null);

  const [viewing, setViewing] = useState(null);
  const [replacingId, setReplacingId] = useState(null);
  const [replacingType, setReplacingType] = useState(null);
  const [retryingPhoto, setRetryingPhoto] = useState(false);
  const replaceRef = useRef(null);

  // The type list, its per-type MIME allowlist and the max size are all
  // authoritative on the server (config/documents.php, DocumentType). Fetched
  // once here instead of hardcoded so the picker can never again offer a
  // slug the backend will actually reject.
  const [catalog, setCatalog] = useState({
    types: FALLBACK_TYPES,
    maxFileSizeBytes: FALLBACK_MAX_BYTES,
    allowedMimeTypes: FALLBACK_MIME,
  });

  useEffect(() => {
    let cancelled = false;
    documentV1Api.getTypes(token, tokenType)
      .then((res) => {
        if (cancelled || !res?.data?.types?.length) return;
        setCatalog({
          types: res.data.types,
          maxFileSizeBytes: res.data.maxFileSizeBytes || FALLBACK_MAX_BYTES,
          allowedMimeTypes: res.data.allowedMimeTypes || FALLBACK_MIME,
        });
      })
      .catch(() => {
        // Keep the fallback list — better than an empty picker.
      });
    return () => { cancelled = true; };
  }, [token, tokenType]);

  const loadList = useCallback(async () => {
    if (!appointmentId) return;
    setListState({ loading: true, error: null });
    try {
      const res = await appointmentV1Api.listDocuments(appointmentId, token, tokenType);
      setDocs(res?.data?.items || []);
      setListState({ loading: false, error: null });
    } catch (err) {
      setListState({ loading: false, error: err?.message || "Could not load documents." });
    }
  }, [appointmentId, token, tokenType]);

  useEffect(() => {
    const id = setTimeout(loadList, 0);
    return () => clearTimeout(id);
  }, [loadList]);

  // Capture instead of picking a file — rear camera, since these are physical
  // documents (an ID card, a signed letter), not a selfie-style profile shot.
  const { requestCapture, cameraModal } = usePhotoCapture({
    onCapture: (capturedFile) => setFile(capturedFile),
    front: false,
  });

  const validate = (f, type) => {
    if (!f) return "Choose a file.";
    if (f.size === 0) return "That file is empty.";
    if (f.size > catalog.maxFileSizeBytes) return `File must be ${formatSize(catalog.maxFileSizeBytes)} or smaller.`;
    const allowed = catalog.allowedMimeTypes[type] || catalog.allowedMimeTypes.default || FALLBACK_MIME.default;
    if (!allowed.includes(f.type)) {
      const names = allowed.map((m) => (m.split("/")[1] || m).toUpperCase()).join(", ");
      return `This document type only accepts: ${names}.`;
    }
    return null;
  };

  const handleUpload = async () => {
    if (!documentType) return toast.error("Select a document type.");
    const problem = validate(file, documentType);
    if (problem) return toast.error(problem);

    setUploading(true);
    setLastError(null);
    try {
      await appointmentV1Api.uploadDocument(
        appointmentId,
        { file, documentType, idempotencyKey: `${appointmentId}-${documentType}-${file.size}-${file.lastModified}` },
        token,
        tokenType,
      );
      toast.success("Document uploaded.");
      setFile(null);
      setDocumentType("");
      if (fileRef.current) fileRef.current.value = "";
      loadList();
    } catch (err) {
      // A failed upload leaves the appointment and earlier documents intact.
      setLastError(err?.message || "Upload failed.");
      toast.error(err?.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  /**
   * Retries only the photo. The appointment already exists, so this never
   * creates or updates one — it posts the same File to the same appointmentId.
   */
  const handleRetryPendingPhoto = async () => {
    if (!pendingPhoto || retryingPhoto) return;

    setRetryingPhoto(true);
    try {
      await appointmentV1Api.uploadDocument(
        appointmentId,
        { file: pendingPhoto, documentType: PHOTO_DOCUMENT_TYPE },
        token,
        tokenType,
      );
      toast.success("Profile photo uploaded.");
      // Only now may the parent drop the file.
      onPendingPhotoUploaded?.();
      loadList();
    } catch (err) {
      // Keep the file so the control stays available for another attempt.
      toast.error(err?.message || "Profile photo upload failed.");
    } finally {
      setRetryingPhoto(false);
    }
  };

  const handleReplaceFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    const problem = validate(picked, replacingType);
    if (problem) return toast.error(problem);
    try {
      await documentV1Api.replace({ id: replacingId, file: picked }, token, tokenType);
      toast.success("New version uploaded.");
      loadList();
    } catch (err) {
      toast.error(err?.message || "Replace failed.");
    } finally {
      setReplacingId(null);
      setReplacingType(null);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const res = await documentV1Api.downloadUrl(doc.documentId, null, token, tokenType);
      if (!res?.data?.url) throw new Error("No download URL returned");
      window.location.assign(res.data.url);
    } catch (err) {
      toast.error(err?.message || "Download failed.");
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete ${doc.documentLabel || doc.documentType}?`)) return;
    try {
      await documentV1Api.remove(doc.documentId, token, tokenType);
      toast.success("Document deleted.");
      loadList();
    } catch (err) {
      toast.error(err?.message || "Delete failed.");
    }
  };

  const handleComplete = async () => {
    setCompleting(true);
    try {
      await appointmentV1Api.complete(appointmentId, token, tokenType);
      toast.success("Appointment completed successfully.");
      onComplete?.();
    } catch (err) {
      // The server lists which required documents are missing.
      const missing = err?.data?.error?.details?.missing;
      toast.error(
        missing?.length
          ? `Missing required documents: ${missing.join(", ")}`
          : err?.message || "Unable to complete appointment.",
      );
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
        <div className="flex flex-wrap gap-x-8 gap-y-2 text-xs">
          {[
            ["Appointment No", summary.appointmentNumber],
            ["Name", summary.name],
            ["Aadhaar", summary.aadhaarDisplay],
            ["Company", summary.company],
            ["Unit", summary.unit],
          ].map(([label, value]) => (
            <div key={label}>
              <p className="text-gray-400 font-medium">{label}</p>
              <p className="font-bold text-gray-800">{value || "—"}</p>
            </div>
          ))}
        </div>
      </div>

      <PendingPhotoBanner
        photo={pendingPhoto}
        retrying={retryingPhoto}
        onRetry={handleRetryPendingPhoto}
        onRemove={onDiscardPendingPhoto}
      />

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-800">
          <Upload size={15} /> Upload Documents
        </h3>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm"
          >
            <option value="">Document type…</option>
            {catalog.types.some((t) => t.category) ? (
              Object.entries(
                catalog.types.reduce((groups, t) => {
                  const key = t.category || "Other";
                  (groups[key] ||= []).push(t);
                  return groups;
                }, {}),
              ).map(([category, items]) => (
                <optgroup key={category} label={category}>
                  {items.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </optgroup>
              ))
            ) : (
              catalog.types.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))
            )}
          </select>

          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="block w-full min-w-0 text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700"
            />
            <button
              type="button"
              onClick={requestCapture}
              title="Take a photo instead of choosing a file"
              className="inline-flex flex-shrink-0 items-center justify-center rounded-lg border border-gray-200 p-2.5 text-gray-500 hover:border-brand-300 hover:text-brand-600"
            >
              <Camera size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file || !documentType}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            {uploading ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><Upload size={15} /> Upload</>}
          </button>
        </div>
        {cameraModal}

        {file && <p className="mt-2 text-[11px] text-gray-500">{file.name} · {formatSize(file.size)}</p>}
        <p className="mt-1 text-[11px] text-gray-400">
          PDF, JPG, PNG · max {formatSize(catalog.maxFileSizeBytes)}
        </p>

        {lastError && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="flex items-center gap-1.5"><AlertTriangle size={13} /> {lastError}</span>
            <button type="button" onClick={handleUpload} className="font-bold underline">Retry</button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
        {listState.loading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" /> Loading documents…
          </div>
        ) : listState.error ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <AlertTriangle className="text-amber-500" size={24} />
            <p className="text-sm text-gray-600">{listState.error}</p>
            <button type="button" onClick={loadList} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white">Retry</button>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <Inbox className="text-gray-300" size={26} />
            <p className="text-sm text-gray-500">No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">File</th>
                  <th className="px-4 py-2.5">Ver</th>
                  <th className="px-4 py-2.5">Size</th>
                  <th className="px-4 py-2.5">Uploaded</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const cur = d.currentVersion || {};
                  const a = d.actions || {};
                  return (
                    <tr key={d.documentId} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2.5 font-semibold text-gray-800">{d.documentLabel || d.documentType}</td>
                      <td className="max-w-[180px] truncate px-4 py-2.5 text-gray-600" title={cur.originalFileName}>{cur.originalFileName || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-500">v{d.version}</td>
                      <td className="px-4 py-2.5 text-gray-500">{formatSize(cur.fileSize)}</td>
                      <td className="px-4 py-2.5 text-gray-500">{formatDate(cur.uploadedAt || d.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-bold text-green-700">{d.status}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {a.view && <button type="button" title="View" onClick={() => setViewing(d)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600"><Eye size={15} /></button>}
                          {a.download && <button type="button" title="Download" onClick={() => handleDownload(d)} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600"><Download size={15} /></button>}
                          {a.replace && <button type="button" title="Replace" onClick={() => { setReplacingId(d.documentId); setReplacingType(d.documentType); replaceRef.current?.click(); }} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600"><RefreshCw size={15} /></button>}
                          {a.delete && <button type="button" title="Delete" onClick={() => handleDelete(d)} className="rounded-lg p-1.5 text-gray-500 hover:bg-red-50 hover:text-red-600"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <input ref={replaceRef} type="file" accept={ACCEPT} onChange={handleReplaceFile} className="hidden" />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
        >
          <ArrowLeft size={15} /> Back to Appointment Details
        </button>

        <button
          type="button"
          onClick={handleComplete}
          disabled={completing}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
        >
          {completing ? <><Loader2 size={15} className="animate-spin" /> Completing…</> : <><CheckCircle2 size={15} /> Complete Appointment</>}
        </button>
      </div>

      <DocumentViewerModal document={viewing} open={Boolean(viewing)} onClose={() => setViewing(null)} />
    </div>
  );
}
