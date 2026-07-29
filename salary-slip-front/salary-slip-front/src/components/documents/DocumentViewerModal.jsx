import { useCallback, useEffect, useState } from "react";
import { X, Download, RefreshCw, AlertTriangle, Loader2, FileText } from "lucide-react";
import toast from "react-hot-toast";
import { documentV1Api } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";

/**
 * Previews a document inside the app.
 *
 * The presigned URL is fetched fresh every time the viewer opens and lives only
 * in component state — never localStorage, sessionStorage, redux or the URL
 * bar. When it expires the user re-requests one rather than the app caching it.
 */
export default function DocumentViewerModal({ document: doc, open, onClose }) {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [state, setState] = useState({ loading: false, url: "", error: null, expiresAt: null });

  const documentId = doc?.documentId ?? doc?.id;
  const version = doc?.currentVersion ?? doc?.version;
  const mimeType = doc?.currentVersion?.mimeType ?? doc?.mimeType ?? "";
  const fileName = doc?.currentVersion?.fileName ?? doc?.fileName ?? "Document";

  const load = useCallback(async () => {
    if (!documentId) return;

    setState({ loading: true, url: "", error: null, expiresAt: null });
    try {
      const res = await documentV1Api.viewUrl(documentId, null, token, tokenType);
      setState({
        loading: false,
        url: res?.data?.url || "",
        error: null,
        expiresAt: res?.data?.expiresAt || null,
      });
    } catch (err) {
      setState({ loading: false, url: "", error: err?.message || "Could not open this document.", expiresAt: null });
    }
  }, [documentId, token, tokenType]);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    // Deferred so the fetch is not a synchronous setState in the effect body.
    const id = setTimeout(() => {
      if (!cancelled) load();
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [open, load]);

  if (!open || !doc) return null;

  const isPdf = mimeType.includes("pdf");
  const isImage = mimeType.startsWith("image/");

  const handleDownload = async () => {
    try {
      const res = await documentV1Api.downloadUrl(documentId, null, token, tokenType);
      const url = res?.data?.url;
      if (!url) throw new Error("No download URL returned");
      // Navigating to the presigned URL triggers the attachment disposition
      // set server-side; nothing is persisted client-side.
      window.location.assign(url);
    } catch (err) {
      toast.error(err?.message || "Download failed");
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-gray-900 dark:text-white">
              {doc.documentLabel || doc.documentType}
            </h3>
            <p className="truncate text-xs text-gray-400">
              {fileName}
              {version ? ` · v${typeof version === "object" ? version.version : version}` : ""}
            </p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Download size={14} /> Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
              aria-label="Close viewer"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="relative flex-1 overflow-auto bg-gray-100 dark:bg-gray-900">
          {state.loading && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
              <Loader2 size={16} className="animate-spin" /> Opening document…
            </div>
          )}

          {state.error && !state.loading && (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <AlertTriangle className="text-amber-500" size={30} />
              <p className="text-sm text-gray-700 dark:text-gray-200">{state.error}</p>
              <button
                type="button"
                onClick={load}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
              >
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          )}

          {!state.loading && !state.error && state.url && (
            <>
              {isImage && (
                <img src={state.url} alt={fileName} className="mx-auto max-h-full object-contain" />
              )}
              {isPdf && (
                <iframe src={state.url} title={fileName} className="h-full w-full border-0" />
              )}
              {!isImage && !isPdf && (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
                  <FileText size={30} className="text-gray-400" />
                  <p className="text-sm text-gray-600 dark:text-gray-300">
                    This file type cannot be previewed.
                  </p>
                  <button
                    type="button"
                    onClick={handleDownload}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
                  >
                    <Download size={14} /> Download instead
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Links are short-lived by design; make that visible rather than
            letting the preview silently go blank. */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-2 text-[11px] text-gray-400 dark:border-gray-700">
          <span>Secure temporary link — expires shortly</span>
          <button
            type="button"
            onClick={load}
            className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            <RefreshCw size={11} /> Refresh link
          </button>
        </div>
      </div>
    </div>
  );
}
