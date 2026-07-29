import { useEffect, useMemo, useRef, useState } from "react";
import { Upload, FileText, X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { documentApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

/**
 * Upload form for the standardised document naming system.
 *
 * The user picks an employee, a document type and a file — they never name the
 * file. The server-generated name is fetched and shown before they confirm, so
 * what they see here is exactly what gets stored.
 */
export default function DocumentUploadForm({
  userId = null,
  employeeLabel = "",
  onUploaded,
  onClose,
}) {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [types, setTypes] = useState([]);
  const [meta, setMeta] = useState({ allowed_extensions: [], max_bytes: 0 });
  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState(null);
  // Keyed by "type:filename" so a result from a previous selection can never
  // be shown against the current one — that also avoids resetting state from
  // inside an effect just to clear a stale preview.
  const [previewState, setPreviewState] = useState({ key: "", data: null });
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    documentApi
      .getTypes(token, tokenType)
      .then((res) => {
        if (cancelled) return;
        setTypes(res?.data || []);
        setMeta(res?.meta || { allowed_extensions: [], max_bytes: 0 });
      })
      .catch(() => {
        if (!cancelled) toast.error("Could not load document types");
      });

    return () => {
      cancelled = true;
    };
  }, [token, tokenType]);

  const previewKey = documentType && file ? `${documentType}:${file.name}` : "";

  // Ask the server what it would name this file. Debounced so switching type
  // or re-picking a file does not fire a request per click.
  useEffect(() => {
    if (!previewKey) return undefined;

    let cancelled = false;
    const timer = setTimeout(() => {
      documentApi
        .previewName({ userId, documentType, fileName: file.name }, token, tokenType)
        .then((res) => {
          if (!cancelled) setPreviewState({ key: previewKey, data: res?.data || null });
        })
        .catch(() => {
          if (!cancelled) setPreviewState({ key: previewKey, data: null });
        });
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewKey, documentType, file, userId, token, tokenType]);

  const preview = previewState.key === previewKey ? previewState.data : null;
  const previewing = Boolean(previewKey) && previewState.key !== previewKey;

  const grouped = useMemo(() => {
    return types.reduce((acc, t) => {
      (acc[t.category] ||= []).push(t);
      return acc;
    }, {});
  }, [types]);

  const maxMb = meta.max_bytes ? Math.round(meta.max_bytes / 1048576) : null;
  const canUpload = Boolean(documentType && file) && !uploading;

  const handleUpload = async () => {
    if (!canUpload) return;

    setUploading(true);
    try {
      const res = await documentApi.upload({ userId, documentType, file }, token, tokenType);
      toast.success(`Uploaded as ${res?.data?.generated_name ?? "document"}`);
      onUploaded?.(res?.data);
      setFile(null);
      setDocumentType("");
      setPreviewState({ key: "", data: null });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-5">
      {employeeLabel && (
        <div>
          <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">Employee</label>
          <p className="mt-1 text-sm font-semibold text-gray-900 dark:text-white">{employeeLabel}</p>
        </div>
      )}

      <div>
        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
          Document Type <span className="text-red-500">*</span>
        </label>
        <select
          value={documentType}
          onChange={(e) => setDocumentType(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700/60 dark:text-white"
        >
          <option value="">Select document type…</option>
          {Object.entries(grouped).map(([category, items]) => (
            <optgroup key={category} label={category}>
              {items.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div>
        <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">File</label>
        <input
          ref={fileInputRef}
          type="file"
          accept={meta.allowed_extensions?.map((e) => `.${e}`).join(",")}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100 dark:text-gray-300"
        />
        <p className="mt-1 text-[11px] text-gray-400">
          {meta.allowed_extensions?.join(", ").toUpperCase()}
          {maxMb ? ` · max ${maxMb} MB` : ""}
        </p>
      </div>

      {/* The name is generated server-side; showing it here is the whole point
          of the feature — the user confirms rather than types it. */}
      {(previewing || preview) && (
        <div className="rounded-xl border border-brand-100 bg-brand-50/60 p-3 dark:border-brand-900/40 dark:bg-brand-900/10">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-brand-700 dark:text-brand-400">
            <FileText size={12} /> Generated Filename
          </p>
          {previewing ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Generating…
            </p>
          ) : (
            <>
              <p className="mt-1 break-all font-mono text-[13px] font-semibold text-gray-900 dark:text-gray-100">
                {preview.generated_name}
              </p>
              <p className="mt-1 text-[11px] text-gray-500">
                Version {preview.version} · original name kept for reference
              </p>
            </>
          )}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <X size={15} /> Cancel
          </button>
        )}
        <button
          type="button"
          onClick={handleUpload}
          disabled={!canUpload}
          className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uploading ? (
            <>
              <Loader2 size={15} className="animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload size={15} /> Upload
            </>
          )}
        </button>
      </div>
    </div>
  );
}
