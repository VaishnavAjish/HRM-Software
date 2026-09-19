import { useEffect, useState, useMemo } from "react";
import { Trash2, Search, Download, RefreshCw, Columns, Check, Calendar, Filter } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import Button from "../../../../../components/ui/Button";
import { downloadCSV } from "../../../../../utils/exportUtils";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
import { CLAIM_STATUS_LIST, CLAIM_STATUS_META } from "../../../models/claimStatus";
import { FINALIZED_CLAIM_STATUSES } from "../../../models/reviewStages";
import { formatCurrencyINR, formatClaimDate, getFinancialYearLabel } from "../../../utils/formatters";

const PER_PAGE = 15;

const FINALIZED_FILTER_VALUE = FINALIZED_CLAIM_STATUSES.join(",");

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

const STATUS_PILLS = [
  { key: FINALIZED_FILTER_VALUE, label: "Finalized (Default)" },
  { key: "", label: "All Statuses" },
  { key: "approved", label: "Approved" },
  { key: "settled", label: "Settled" },
  { key: "rejected", label: "Rejected" },
  { key: "draft,submitted", label: "Pending Review" },
];

export default function ClaimsTab() {
  const { user } = useAuth();
  const { can } = useMediclaimAuthorization();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const canDelete = can("mediclaim.claim.delete");

  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE);
  const [status, setStatus] = useState(FINALIZED_FILTER_VALUE);
  const [search, setSearch] = useState("");
  const [fyFilter, setFyFilter] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Column visibility popover state
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState({});

  const requestKey = JSON.stringify([accessToken ?? "", tokenType ?? "", page, perPage, status, search, reloadToken]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const exportCsv = () => {
    const rowsToExport = result.rows.map((row) => ({
      "Claim #": row.claimNumber || row.claim_number || "",
      Employee: row.employeeName || row.employee_snapshot?.name || "",
      Patient: row.patientName || row.patient_snapshot?.name || "",
      "Claimed Amount": row.totalClaimedAmount ?? row.total_claimed_amount ?? "",
      "Approved Amount": row.approvedAmount ?? row.approved_amount ?? row.totalApprovedAmount ?? row.total_approved_amount ?? "",
      Status: row.status || "",
      "Last Updated": row.updatedAt || row.updated_at || "",
    }));
    downloadCSV(rowsToExport, "mediclaim-admin-claims");
  };

  const deleteClaim = async (row) => {
    const id = row.id ?? row.claimId;
    const label = row.claimNumber || row.claim_number || "this claim";
    if (!window.confirm(`Permanently delete ${label}? This cannot be undone.`)) return;

    setDeletingId(id);
    try {
      await mediclaimApi.deleteClaim(id, accessToken, tokenType);
      toast.success(`${label} deleted`);
      setReloadToken((n) => n + 1);
    } catch (err) {
      toast.error(err?.message || "Failed to delete this claim.");
    } finally {
      setDeletingId(null);
    }
  };

  const ALL_COLUMNS = [
    { key: "claimNumber", label: "Claim #", render: (row) => row.claimNumber || row.claim_number || "—" },
    { key: "employeeName", label: "Employee", render: (row) => row.employeeName || row.employee_snapshot?.name || "—" },
    { key: "patientName", label: "Patient", render: (row) => row.patientName || row.patient_snapshot?.name || "—" },
    { key: "claimedAmount", label: "Claimed", render: (row) => formatCurrencyINR(row.totalClaimedAmount ?? row.total_claimed_amount) },
    {
      key: "approvedAmount",
      label: "Approved",
      render: (row) => {
        const amt = row.approvedAmount ?? row.approved_amount ?? row.totalApprovedAmount ?? row.total_approved_amount;
        return amt != null && amt !== "" ? formatCurrencyINR(amt) : "—";
      },
    },
    { key: "status", label: "Status", render: (row) => <ClaimStatusBadge status={row.status} /> },
    { key: "updatedOn", label: "Last Updated", render: (row) => formatClaimDate(row.updatedAt || row.updated_at || row.createdAt || row.created_at) },
    ...(canDelete ? [{
      key: "actions",
      label: "Actions",
      className: "text-right",
      render: (row) => {
        const id = row.id ?? row.claimId;
        return (
          <button
            type="button"
            title="Delete claim"
            disabled={deletingId === id}
            onClick={(e) => { e.stopPropagation(); deleteClaim(row); }}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/20"
          >
            <Trash2 size={14} />
          </button>
        );
      },
    }] : []),
  ];

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.adminClaims({ page, perPage, status: status || undefined, search: search || undefined }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load claims." });
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, page, perPage, status, search, reloadToken, requestKey]);

  const loading = result.key !== requestKey;
  
  // Dynamic client-side filtering for Financial Year if selected
  const filteredRows = useMemo(() => {
    if (!fyFilter) return result.rows;
    return result.rows.filter((row) => {
      const d = row.createdAt || row.created_at || row.updatedAt;
      return d ? getFinancialYearLabel(d) === fyFilter : true;
    });
  }, [result.rows, fyFilter]);

  const state = { loading, rows: filteredRows, total: result.total, error: loading ? null : result.error };

  // Calculate Counters
  const counters = useMemo(() => {
    let approved = 0;
    let pending = 0;
    let rejected = 0;
    result.rows.forEach((r) => {
      const s = String(r.status || "").toLowerCase();
      if (s.includes("approved") || s.includes("settled")) approved++;
      else if (s.includes("reject") || s.includes("disallow")) rejected++;
      else pending++;
    });
    return { total: result.total, approved, pending, rejected };
  }, [result.rows, result.total]);

  const toggleColumn = (key) => {
    setHiddenColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const headerContent = (
    <div className="space-y-3">
      {/* Top Controls Row matching View Employees style */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Search Bar & Pill Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search claim #, employee, patient..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-900"
            />
          </div>

          <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-1">
            {STATUS_PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => { setStatus(p.key); setPage(1); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  status === p.key
                    ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons: Export CSV, Columns, Refresh */}
        <div className="flex items-center gap-2 relative">
          <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={exportCsv}>
            Export CSV
          </Button>

          {/* Columns Visibility Dropdown */}
          <div className="relative">
            <Button
              size="sm"
              variant="secondary"
              icon={<Columns size={13} />}
              onClick={() => setShowColumnsMenu((v) => !v)}
            >
              Columns
            </Button>
            {showColumnsMenu && (
              <div className="absolute right-0 top-full mt-2 z-30 w-48 rounded-xl border border-gray-100 bg-white p-2 shadow-xl dark:border-gray-700 dark:bg-gray-800">
                <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                  Toggle Columns
                </p>
                <div className="mt-1 space-y-1">
                  {ALL_COLUMNS.map((col) => (
                    <label
                      key={col.key}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={!hiddenColumns[col.key]}
                        onChange={() => toggleColumn(col.key)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                      <span>{col.label || col.key}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={() => setReloadToken((n) => n + 1)}>
            Refresh
          </Button>
        </div>
      </div>

      {/* Second Row: Dropdowns & Counter Summary matching View Employees */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-3 dark:border-gray-700/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Dropdown Filter */}
          <select
            className={inputClass}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value={FINALIZED_FILTER_VALUE}>Finalized (Default)</option>
            <option value="">All Statuses</option>
            {CLAIM_STATUS_LIST.map((s) => (
              <option key={s} value={s}>{CLAIM_STATUS_META[s]?.label || s}</option>
            ))}
          </select>

          {/* Financial Year Dropdown Filter */}
          <select
            className={inputClass}
            value={fyFilter}
            onChange={(e) => setFyFilter(e.target.value)}
          >
            <option value="">All Financial Years</option>
            <option value="2025-26">FY 2025-26</option>
            <option value="2024-25">FY 2024-25</option>
            <option value="2023-24">FY 2023-24</option>
          </select>
        </div>

        {/* Counter Summary (matching View Employees page count badges) */}
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          <span>
            <strong className="text-gray-800 dark:text-gray-200">{counters.total}</strong> Total
          </span>
          <span>•</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            <strong className="font-bold">{counters.approved}</strong> Approved
          </span>
          <span>•</span>
          <span className="text-amber-600 dark:text-amber-400">
            <strong className="font-bold">{counters.pending}</strong> Pending
          </span>
          <span>•</span>
          <span className="text-rose-600 dark:text-rose-400">
            <strong className="font-bold">{counters.rejected}</strong> Rejected
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <ClaimsTable
        columns={ALL_COLUMNS}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage={search ? "No claims match this search." : "No claims found."}
        headerContent={headerContent}
        hiddenColumns={hiddenColumns}
        getRowKey={(row) => row.id ?? row.claimId}
        onRowClick={(row) => setSelectedClaimId(row.id ?? row.claimId)}
        page={page}
        perPage={perPage}
        total={state.total}
        onPageChange={setPage}
        onPageSizeChange={setPerPage}
      />

      <ClaimDetailDrawer isOpen={Boolean(selectedClaimId)} onClose={() => setSelectedClaimId(null)} claimId={selectedClaimId} />
    </div>
  );
}
