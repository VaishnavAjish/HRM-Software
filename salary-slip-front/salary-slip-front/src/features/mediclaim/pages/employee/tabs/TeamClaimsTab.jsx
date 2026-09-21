import { useEffect, useState, useMemo } from "react";
import { Search, Download, RefreshCw, Columns } from "lucide-react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import Button from "../../../../../components/ui/Button";
import { downloadCSV } from "../../../../../utils/exportUtils";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
import { CLAIM_STATUS_LIST, CLAIM_STATUS_META } from "../../../models/claimStatus";
import { formatCurrencyINR, formatClaimDate, formatClaimNumber } from "../../../utils/formatters";

const PER_PAGE = 15;

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

const TEAM_PILLS = [
  { key: "", label: "All Team Claims" },
  { key: "in_review", label: "In Review" },
  { key: "finalized", label: "Finalized" },
];

export default function TeamClaimsTab() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE);
  const [pillBucket, setPillBucket] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [search, setSearch] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Columns visibility state
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState({});

  const ALL_COLUMNS = [
    { key: "claimNumber", label: "Claim #", render: (row) => formatClaimNumber(row) || "—" },
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
  ];

  const requestKey = JSON.stringify([accessToken ?? "", tokenType ?? "", page, perPage, pillBucket, statusFilter, search, reloadToken]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.teamClaims({ page, perPage, bucket: pillBucket || undefined, status: statusFilter || undefined, search: search || undefined }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load team claims." });
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, page, perPage, pillBucket, statusFilter, search, reloadToken, requestKey]);

  const loading = result.key !== requestKey;
  const state = { loading, rows: result.rows, total: result.total, error: loading ? null : result.error };

  const exportCsv = () => {
    const rowsToExport = result.rows.map((row) => ({
      "Claim #": formatClaimNumber(row),
      Employee: row.employeeName || row.employee_snapshot?.name || "",
      Patient: row.patientName || row.patient_snapshot?.name || "",
      "Claimed Amount": row.totalClaimedAmount ?? row.total_claimed_amount ?? "",
      "Approved Amount": row.approvedAmount ?? row.approved_amount ?? row.totalApprovedAmount ?? row.total_approved_amount ?? "",
      Status: row.status || "",
      "Last Updated": row.updatedAt || row.updated_at || "",
    }));
    downloadCSV(rowsToExport, "team-mediclaim-claims");
  };

  const toggleColumn = (key) => {
    setHiddenColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const counters = useMemo(() => {
    let totalClaimed = 0;
    let totalApproved = 0;
    result.rows.forEach((r) => {
      totalClaimed += Number(r.totalClaimedAmount ?? r.total_claimed_amount) || 0;
      totalApproved += Number(r.approvedAmount ?? r.approved_amount ?? r.totalApprovedAmount ?? r.total_approved_amount) || 0;
    });
    return { count: result.total, totalClaimed, totalApproved };
  }, [result.rows, result.total]);

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
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search claim #, employee, patient..."
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-900"
            />
          </div>

          <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

          {/* Status Pills */}
          <div className="flex flex-wrap items-center gap-1">
            {TEAM_PILLS.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => { setPillBucket(p.key); setPage(1); }}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                  pillBucket === p.key
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
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Statuses</option>
            {CLAIM_STATUS_LIST.map((s) => (
              <option key={s} value={s}>{CLAIM_STATUS_META[s]?.label || s}</option>
            ))}
          </select>
        </div>

        {/* Counter Summary */}
        <div className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          <span>
            <strong className="text-gray-800 dark:text-gray-200">{counters.count}</strong> Total Team Claims
          </span>
          <span>•</span>
          <span>
            Claimed: <strong className="text-gray-800 dark:text-gray-200">{formatCurrencyINR(counters.totalClaimed)}</strong>
          </span>
          <span>•</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            Approved: <strong className="font-bold">{formatCurrencyINR(counters.totalApproved)}</strong>
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
        emptyMessage={search ? "No team claims match this search." : "No team claims found."}
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
