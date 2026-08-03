import { useEffect, useRef, useState } from "react";
import { FileSpreadsheet, ChevronDown, CheckCircle2, XCircle, FileText, Trash2, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { getCompanyConfig } from "../../config/companyConfig";
import UploadReportModal from "./UploadReportModal";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const PAGE_LIMIT = 15;
const SCROLL_THRESHOLD_PX = 80;

function batchTitle(batch) {
  if (batch.type === "salary" && batch.month) {
    return `${MONTHS[parseInt(batch.month, 10) - 1] || batch.month} ${batch.year || ""}`.trim();
  }
  return batch.file_name || "Upload";
}

export default function UploadBatchPanel({ type, icon: Icon = FileSpreadsheet, title = "Upload History", refreshKey, companyId, autoOpenBatchId }) {
  const { user } = useAuth();
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportBatch, setReportBatch] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const scrollRef = useRef(null);

  const requestPage = async (pageNum, { append }) => {
    try {
      // The append spinner belongs to the scroll handler that triggers it, so
      // it is set here after the first await rather than by the caller.
      if (append) setLoadingMore(true);
      const res = await salaryApi.getUploadBatches(type, user?.accessToken, user?.tokenType, companyId, pageNum, PAGE_LIMIT);
      if (res.status) {
        setBatches((prev) => (append ? [...prev, ...(res.data || [])] : res.data || []));
        setPage(res.meta?.page || pageNum);
        setTotalPages(res.meta?.totalPages || 1);
        setTotal(res.meta?.total ?? (res.data || []).length);
      }
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  // Raises no spinner of its own — every state update happens after an await,
  // so calling this from an effect costs no cascading render. `loading` starts
  // true; a type/company/refresh change turns it back on during render below.
  const loadPage = (pageNum, options) =>
    requestPage(pageNum, options).catch((err) =>
      toast.error(err.message || "Failed to load upload history"),
    );

  const listKey = `${type}|${companyId}|${refreshKey}`;
  const [listSeen, setListSeen] = useState(listKey);
  if (listSeen !== listKey) {
    setListSeen(listKey);
    setLoading(true);
  }

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    loadPage(1, { append: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, companyId, refreshKey]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || loading || loadingMore || page >= totalPages) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight <= SCROLL_THRESHOLD_PX) {
      loadPage(page + 1, { append: true });
    }
  };

  const requestReport = async (batchId) => {
    try {
      const res = await salaryApi.getUploadBatch(type, batchId, user?.accessToken, user?.tokenType);
      if (res.status) setReportBatch(res.data);
    } finally {
      setReportLoading(false);
    }
  };

  // Fetch only — opening the dialog is the caller's business, so this is safe
  // to call from an effect.
  const loadReport = (batchId) =>
    requestReport(batchId).catch((err) => toast.error(err.message || "Failed to load report"));

  const openReport = (batchId) => {
    setReportOpen(true);
    setReportLoading(true);
    return loadReport(batchId);
  };

  const deleteBatch = async (e, batchId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this upload? The employees/salary slips it created will be removed too — this can't be undone.")) return;
    setDeletingId(batchId);
    try {
      const res = await salaryApi.deleteUploadBatch(type, batchId, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success("Upload and its records removed");
        setBatches((prev) => prev.filter((b) => b.id !== batchId));
        setTotal((prev) => Math.max(0, prev - 1));
        if (expandedId === batchId) setExpandedId(null);
      } else {
        toast.error(res.message || "Failed to remove upload");
      }
    } catch (err) {
      toast.error(err.message || "Failed to remove upload");
    } finally {
      setDeletingId(null);
    }
  };

  // Expanding the requested row is a consequence of the prop changing, so it is
  // assigned during render; fetching its report stays in the effect.
  const [autoOpenSeen, setAutoOpenSeen] = useState(autoOpenBatchId);
  if (autoOpenSeen !== autoOpenBatchId) {
    setAutoOpenSeen(autoOpenBatchId);
    if (autoOpenBatchId) {
      setExpandedId(autoOpenBatchId);
      setReportOpen(true);
      setReportLoading(true);
    }
  }

  useEffect(() => {
    if (autoOpenBatchId) loadReport(autoOpenBatchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenBatchId]);

  return (
    <div className="bg-white dark:bg-[#0b0f1a] rounded-2xl p-5 border border-gray-200 dark:border-white/10 shadow-sm flex flex-col h-full max-h-[85vh]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
            <Icon size={16} />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white">{title}</h3>
        </div>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300">
          {total} total
        </span>
      </div>

      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto pr-2 space-y-3 scrollbar-hide">
        {loading ? (
          Array(4).fill(0).map((_, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-xl bg-gray-50 dark:bg-white/[0.02] animate-pulse">
              <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 shrink-0" />
              <div className="flex-1 space-y-2 py-1">
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              </div>
            </div>
          ))
        ) : batches.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">No uploads found.</p>
        ) : (
          <>
            {batches.map((batch) => {
              const isExpanded = expandedId === batch.id;
              const allPassed = batch.failed_count === 0;
              return (
                <div
                  key={batch.id}
                  className="rounded-xl border border-gray-100 dark:border-white/5 bg-white dark:bg-white/[0.02] overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : batch.id)}
                    className="w-full flex items-start gap-3 p-3 text-left hover:bg-gray-50 dark:hover:bg-white/[0.03] transition-colors"
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full font-bold text-xs uppercase ${
                      allPassed ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/20 dark:text-emerald-400" : "bg-amber-50 text-amber-600 dark:bg-amber-950/20 dark:text-amber-400"
                    }`}>
                      <FileSpreadsheet size={15} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900 dark:text-white">{batchTitle(batch)}</p>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                          {getCompanyConfig(batch.company_code)?.label || batch.company_code || "—"}
                        </span>
                        <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                          {batch.success_count} passed
                        </span>
                        {batch.failed_count > 0 && (
                          <span className="text-[10px] font-semibold text-red-500 dark:text-red-400">
                            {batch.failed_count} failed
                          </span>
                        )}
                      </div>
                    </div>
                    <ChevronDown size={14} className={`text-gray-400 mt-1 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 pt-1 border-t border-gray-100 dark:border-white/5">
                      <div className="grid grid-cols-2 gap-2 mb-2.5 text-xs">
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={13} /> {batch.success_count} passed
                        </div>
                        <div className="flex items-center gap-1.5 text-red-500 dark:text-red-400">
                          <XCircle size={13} /> {batch.failed_count} failed
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-2">
                        {new Date(batch.created_at).toLocaleString()} · {batch.total_rows} rows total
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => openReport(batch.id)}
                          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-600 py-1.5 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                        >
                          <FileText size={13} /> View Full Report
                        </button>
                        <button
                          onClick={(e) => deleteBatch(e, batch.id)}
                          disabled={deletingId === batch.id}
                          title="Delete upload and its records"
                          className="flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-600 px-2.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {loadingMore && (
              <div className="flex items-center justify-center py-3 text-gray-400">
                <Loader2 size={16} className="animate-spin" />
              </div>
            )}
          </>
        )}
      </div>

      <UploadReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        batch={reportBatch}
        type={type}
        loading={reportLoading}
      />
    </div>
  );
}
