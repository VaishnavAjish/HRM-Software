import { useEffect, useState, useMemo } from "react";
import { FilePlus2, AlertTriangle, Search, Download, RefreshCw, Columns } from "lucide-react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import Button from "../../../../../components/ui/Button";
import { downloadCSV } from "../../../../../utils/exportUtils";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
import NewClaimRequestModal from "../../../components/NewClaimRequestModal";
import { CLAIM_STATUS } from "../../../models/claimStatus";
import { formatCurrencyINR, formatClaimDate, formatClaimNumber } from "../../../utils/formatters";

const EDITABLE_STATUSES = [CLAIM_STATUS.DRAFT, CLAIM_STATUS.RETURNED_FOR_CORRECTION];

function missingDocs(row) {
  return row.missingDocumentTypes || row.missing_document_types || [];
}

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 outline-none";

const STATUS_OPTIONS = [
  { value: CLAIM_STATUS.APPROVED, label: "Approved" },
  { value: CLAIM_STATUS.SUBMITTED, label: "Submitted" },
  { value: CLAIM_STATUS.PARTIALLY_APPROVED, label: "Partially Approved" },
  { value: CLAIM_STATUS.REJECTED, label: "Rejected" },
  { value: CLAIM_STATUS.SETTLEMENT_PENDING, label: "Settlement Pending" },
  { value: CLAIM_STATUS.SETTLED, label: "Settled" },
  { value: CLAIM_STATUS.CLOSED, label: "Closed" },
  { value: CLAIM_STATUS.DRAFT, label: "Draft" },
];

export default function MyClaimsTab({ lookups }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [fyFilter, setFyFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [selectedClaimId, setSelectedClaimId] = useState(null);

  const [modal, setModal] = useState({ open: false, editClaim: null });
  const [claimsResult, setClaimsResult] = useState({ key: null, rows: [], total: 0, error: null });

  // Column visibility state
  const [showColumnsMenu, setShowColumnsMenu] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState({});

  const fyOptions = useMemo(() => {
    const list = lookups?.policyTypes || [];
    const set = new Set();
    list.forEach((p) => {
      if (p.year) set.add(p.year);
    });
    if (set.size === 0) {
      set.add("2025-26");
      set.add("2024-25");
    }
    return Array.from(set);
  }, [lookups]);

  const requestKey = JSON.stringify([
    accessToken ?? "",
    tokenType ?? "",
    fyFilter,
    statusFilter,
    search,
    page,
    pageSize,
  ]);

  const loadClaims = () => {
    if (!accessToken) return;
    let cancelled = false;

    mediclaimApi.myClaims(
      {
        status: statusFilter || undefined,
        year: fyFilter || undefined,
        search: search || undefined,
        page,
        perPage: pageSize,
      },
      accessToken,
      tokenType,
    )
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setClaimsResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setClaimsResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load your claims." });
      });
  };

  useEffect(() => {
    if (!accessToken) return;
    loadClaims();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, tokenType, fyFilter, statusFilter, search, page, pageSize]);

  const claimsLoading = claimsResult.key !== requestKey;
  const claimsState = {
    loading: claimsLoading,
    rows: claimsResult.rows,
    total: claimsResult.total,
    error: claimsLoading ? null : claimsResult.error,
  };

  const claimsNeedingDocuments = useMemo(() => {
    return claimsState.rows.filter(
      (r) => String(r?.status || '').toUpperCase() === CLAIM_STATUS.SUBMITTED,
    );
  }, [claimsState.rows]);

  const toggleColumn = (key) => {
    setHiddenColumns((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const ALL_COLUMNS = [
    { key: "claimNumber", label: "Claim #", render: (row) => formatClaimNumber(row, user) || "—" },
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
    { key: "status", label: "Status", render: (row) => <ClaimStatusBadge status={row.status} missingDocsCount={missingDocs(row).length} /> },
    { key: "updatedOn", label: "Last Updated", render: (row) => formatClaimDate(row.updatedAt || row.updated_at || row.createdAt || row.created_at) },
  ];

  const exportCsv = () => {
    const rowsToExport = claimsState.rows.map((row) => ({
      "Claim #": formatClaimNumber(row, user),
      Patient: row.patientName || row.patient_snapshot?.name || "",
      "Claimed Amount": row.totalClaimedAmount ?? row.total_claimed_amount ?? "",
      "Approved Amount": row.approvedAmount ?? row.approved_amount ?? row.totalApprovedAmount ?? row.total_approved_amount ?? "",
      Status: row.status || "",
      "Last Updated": row.updatedAt || row.updated_at || "",
    }));
    downloadCSV(rowsToExport, `my-claims${statusFilter ? `-${statusFilter.toLowerCase()}` : ""}`);
  };

  const handleRowClick = (row) => {
    if (EDITABLE_STATUSES.includes(row.status)) {
      setModal({ open: true, editClaim: row });
      return;
    }
    setSelectedClaimId(row.id ?? row.claimId);
  };

  const closeModal = () => setModal({ open: false, editClaim: null });

  const headerContent = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Search & Filter Dropdowns */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search claim #, patient..."
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-900"
          />
        </div>

        <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

        {/* Specific Status Dropdown */}
        <select
          className={inputClass}
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>

        {/* Financial Year Dropdown Filter */}
        <select
          className={inputClass}
          value={fyFilter}
          onChange={(e) => { setFyFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Financial Years</option>
          {fyOptions.map((label) => (
            <option key={label} value={label}>FY {label}</option>
          ))}
        </select>
      </div>

      {/* Action Buttons: New Claim Request, Export CSV, Columns, Refresh */}
      <div className="flex items-center gap-2 relative">
        <Button icon={<FilePlus2 size={14} />} onClick={() => setModal({ open: true, editClaim: null })}>
          New Claim Request
        </Button>

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

        <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={loadClaims}>
          Refresh
        </Button>
      </div>
    </div>
  );
  return (
    <div className="space-y-4">
      {claimsNeedingDocuments.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <span className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
            <AlertTriangle size={16} className="flex-shrink-0" />
            {claimsNeedingDocuments.length === 1
              ? "1 claim has been submitted and is waiting on you to upload documents."
              : `${claimsNeedingDocuments.length} claims have been submitted and are waiting on you to upload documents.`}
          </span>
          <Button
            size="sm"
            variant="amber"
            onClick={() => {
              const target = claimsNeedingDocuments.find(
                (r) => String(r?.status || '').toUpperCase() === CLAIM_STATUS.SUBMITTED
              ) || claimsNeedingDocuments[0];
              if (target) {
                setSelectedClaimId(target.id ?? target.claimId);
              }
            }}
          >
            Upload Now
          </Button>
        </div>
      )}

      <ClaimsTable
        columns={ALL_COLUMNS}
        rows={claimsState.rows}
        loading={claimsState.loading}
        error={claimsState.error}
        emptyMessage={fyFilter ? `No claims in this tab for FY ${fyFilter}.` : "No claims in this tab yet."}
        headerContent={headerContent}
        hiddenColumns={hiddenColumns}
        getRowKey={(row) => row.id ?? row.claimId}
        onRowClick={handleRowClick}
        page={page}
        perPage={pageSize}
        total={claimsState.total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />

      <ClaimDetailDrawer
        isOpen={Boolean(selectedClaimId)}
        onClose={() => setSelectedClaimId(null)}
        claimId={selectedClaimId}
        allowDocumentUpload
        documentRequirements={lookups?.documentRequirements || []}
        documentRequirementsLoading={Boolean(lookups?.loading)}
        onDocumentsChanged={loadClaims}
      />

      {modal.open && (
        <NewClaimRequestModal
          key={modal.editClaim?.id ?? modal.editClaim?.claimId ?? "new"}
          editClaim={modal.editClaim}
          lookups={lookups}
          onClose={closeModal}
          onSubmitted={loadClaims}
        />
      )}
    </div>
  );
}
