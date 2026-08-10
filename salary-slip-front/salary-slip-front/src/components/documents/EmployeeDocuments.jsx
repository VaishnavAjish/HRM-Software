import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, Eye, Download, RefreshCw, Trash2, Loader2,
  AlertTriangle, Inbox, Search,
} from "lucide-react";
import toast from "react-hot-toast";
import { documentV1Api } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import DocumentViewerModal from "./DocumentViewerModal";

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const ALLOWED_MIME = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

const formatSize = (bytes) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
};

const formatDate = (iso) => (iso ? new Date(iso).toLocaleDateString() : "—");

/**
 * Employee document panel: upload, list, view, download, replace, delete.
 *
 * The backend is authoritative for permissions — `actions` comes back per
 * document from the API and only decides which buttons render.
 */
export default function EmployeeDocuments({ employeeId = null, employeeLabel = "", readOnly = false }) {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [types, setTypes] = useState([]);
  const [docs, setDocs] = useState([]);
  const [listState, setListState] = useState({ loading: true, error: null });
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const [documentType, setDocumentType] = useState("");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const [viewing, setViewing] = useState(null);
  const [replacingId, setReplacingId] = useState(null);
  const replaceRef = useRef(null);

  const loadList = useCallback(async () => {
    setListState({ loading: true, error: null });
    try {
      const res = await documentV1Api.list(
        { employeeId, search, documentType: typeFilter, pageSize: 50 },
        token,
        tokenType,
      );
      setDocs(res?.data?.items || []);
      setListState({ loading: false, error: null });
    } catch (err) {
      setListState({ loading: false, error: err?.message || "Could not load documents." });
    }
  }, [employeeId, search, typeFilter, token, tokenType]);

  useEffect(() => {
    let cancelled = false;
    documentV1Api
      .getTypes(token, tokenType)
      .then((res) => {
        if (!cancelled) setTypes(res?.data?.types || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token, tokenType]);

  useEffect(() => {
    const id = setTimeout(loadList, 250); // debounce search/filter
    return () => clearTimeout(id);
  }, [loadList]);

  /** Client-side checks are a courtesy; the backend re-validates from content. */
  const validate = (f) => {
    if (!f) return "Choose a file.";
    if (f.size === 0) return "That file is empty.";
    if (f.size > MAX_BYTES) return "File must be 10 MB or smaller.";
    if (!ALLOWED_MIME.includes(f.type)) return "Only PDF, JPG and PNG files are supported.";
    return null;
  };

  const handleUpload = async () => {
    const problem = validate(file);
    if (!documentType) return toast.error("Select a document type.");
    if (problem) return toast.error(problem);

    setUploading(true);
    try {
      const res = await documentV1Api.upload(
        { file, documentType, employeeId, idempotencyKey: `${employeeId ?? "self"}-${documentType}-${file.size}-${file.lastModified}` },
        token,
        tokenType,
      );
      toast.success(`Uploaded ${res?.data?.fileName ?? "document"}`);
      setFile(null);
      setDocumentType("");
      if (fileRef.current) fileRef.current.value = "";
      loadList();
    } catch (err) {
      toast.error(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleReplaceFile = async (e) => {
    const picked = e.target.files?.[0];
    e.target.value = "";
    const problem = validate(picked);
    if (problem) return toast.error(problem);

    try {
      await documentV1Api.replace({ id: replacingId, file: picked }, token, tokenType);
      toast.success("New version uploaded");
      loadList();
    } catch (err) {
      toast.error(err?.message || "Replace failed");
    } finally {
      setReplacingId(null);
    }
  };

  const handleDownload = async (doc) => {
    try {
      const res = await documentV1Api.downloadUrl(doc.documentId, null, token, tokenType);
      if (!res?.data?.url) throw new Error("No download URL returned");
      window.location.assign(res.data.url);
    } catch (err) {
      toast.error(err?.message || "Download failed");
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete ${doc.documentLabel || doc.documentType}? It will no longer be viewable.`)) return;
    try {
      await documentV1Api.remove(doc.documentId, token, tokenType);
      toast.success("Document deleted");
      loadList();
    } catch (err) {
      toast.error(err?.message || "Delete failed");
    }
  };

  return (
    <div className="space-y-5">
      {/* Upload */}
      {!readOnly && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
          <Upload size={15} /> Upload Document
          {employeeLabel && <span className="font-normal text-gray-400">· {employeeLabel}</span>}
        </h3>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
          <select
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700/60 dark:text-white"
          >
            <option value="">Document type…</option>
            {types.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>

          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-brand-700 hover:file:bg-brand-100 dark:text-gray-300"
          />

          <button
            type="button"
            onClick={handleUpload}
            disabled={uploading || !file || !documentType}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {uploading ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><Upload size={15} /> Upload</>}
          </button>
        </div>

        {file && (
          <p className="mt-2 text-[11px] text-gray-500">
            {file.name} · {formatSize(file.size)}
          </p>
        )}
        <p className="mt-1 text-[11px] text-gray-400">PDF, JPG, PNG · max 10 MB</p>
      </div>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-white"
        >
          <option value="">All types</option>
          {types.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      {/* List */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        {listState.loading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-gray-500">
            <Loader2 size={16} className="animate-spin" /> Loading documents…
          </div>
        ) : listState.error ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertTriangle className="text-amber-500" size={26} />
            <p className="text-sm text-gray-600 dark:text-gray-300">{listState.error}</p>
            <button type="button" onClick={loadList} className="rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700">
              Retry
            </button>
          </div>
        ) : docs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-10 text-center">
            <Inbox className="text-gray-300" size={30} />
            <p className="text-sm text-gray-500">No documents uploaded yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500 dark:border-gray-700 dark:bg-gray-700/40">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Ver</th>
                  <th className="px-4 py-3">Size</th>
                  <th className="px-4 py-3">Uploaded</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {docs.map((d) => {
                  const cur = d.currentVersion || {};
                  const a = d.actions || {};
                  return (
                    <tr key={d.documentId} className="border-b border-gray-50 last:border-0 dark:border-gray-700/50">
                      <td className="px-4 py-3 font-semibold text-gray-800 dark:text-gray-100">
                        {d.documentLabel || d.documentType}
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-gray-600 dark:text-gray-300" title={cur.originalFileName}>
                        {cur.originalFileName || "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">v{d.version}</td>
                      <td className="px-4 py-3 text-gray-500">{formatSize(cur.fileSize)}</td>
                      <td className="px-4 py-3 text-gray-500">{formatDate(cur.uploadedAt || d.createdAt)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          d.status === "ACTIVE"
                            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"
                            : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300"
                        }`}>
                          {d.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {a.view && (
                            <button type="button" onClick={() => setViewing(d)} title="View"
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-gray-700">
                              <Eye size={15} />
                            </button>
                          )}
                          {a.download && (
                            <button type="button" onClick={() => handleDownload(d)} title="Download"
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-gray-700">
                              <Download size={15} />
                            </button>
                          )}
                          {!readOnly && a.replace && (
                            <button type="button" onClick={() => { setReplacingId(d.documentId); replaceRef.current?.click(); }} title="Replace"
                              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-gray-700">
                              <RefreshCw size={15} />
                            </button>
                          )}
                          {!readOnly && a.delete && (
                            <button type="button" onClick={() => handleDelete(d)} title="Delete"
                              className="rounded-lg p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30">
                              <Trash2 size={15} />
                            </button>
                          )}
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

      {/* Hidden input driving the Replace action */}
      <input ref={replaceRef} type="file" accept={ACCEPT} onChange={handleReplaceFile} className="hidden" />

      <DocumentViewerModal document={viewing} open={Boolean(viewing)} onClose={() => setViewing(null)} />
    </div>
  );
}
