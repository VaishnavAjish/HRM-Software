import { useEffect, useState } from "react";
import { Trash2, Search, Download, RefreshCw } from "lucide-react";
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
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";

const PER_PAGE = 15;

// A claim still moving through review/settlement belongs in Pending
// Reviews, not here — this is the "the workflow is actually done" bucket
// the Claims tab defaults to, so a fresh Submitted request doesn't read as
// if it landed in the wrong place. "All statuses" (below) still reaches
// everything, including in-progress claims, when that's genuinely needed.
// Shared with PendingReviewsTab.jsx's "Approved Claim" sub-tab — one
// definition of "finalized" instead of two that could drift apart.
const FINALIZED_FILTER_VALUE = FINALIZED_CLAIM_STATUSES.join(",");

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Full company-scoped claims list via `mediclaimApi.adminClaims` (the bare
 * admin claim-list endpoint added per the implementation plan's
 * reconciliation #3) — defaults to only *finalized* claims (see
 * `FINALIZED_STATUSES`); a Draft/Submitted/under-review/awaiting-settlement
 * claim belongs in Pending Reviews instead and is excluded here by default
 * (Drafts are excluded unconditionally, server-side, regardless of filter —
 * they're the employee's own private unsubmitted work). Row click opens the
 * shared, read-only `ClaimDetailDrawer` — deciding a claim happens from the
 * Pending Reviews tab instead, same separation `TeamClaimsTab`/
 * `PendingMyApprovalTab` already established on the employee side.
 *
 * "Delete" (gated on `mediclaim.claim.delete`, realistically super-admin
 * only) is a genuine hard delete, unlike every "retire" pattern elsewhere
 * in this module — see `Admin\ClaimController::destroy()`'s docblock for
 * why a claim doesn't need that soft-delete treatment. Meant for cleaning
 * up test/duplicate/erroneous rows, not routine use.
 *
 * Search forwards to `Admin\ClaimController::index()`'s existing `search`
 * param (claim number / employee name / emp code, server-side — this
 * endpoint was already built to support it, just never wired on this
 * screen). "Export CSV" is scoped to the current page only (this list is
 * server-paginated, unlike `PendingReviewsTab.jsx`'s two client-loaded
 * buckets). `onPageSizeChange` enables `Pagination`'s "Show N entries"
 * control, matching the house data-table pattern used elsewhere
 * (`RequisitionsTab.jsx`, `EmployeeMasterTable.jsx`).
 */
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
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = JSON.stringify([accessToken ?? "", tokenType ?? "", page, perPage, status, search, reloadToken]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const exportCsv = () => {
    const rows = result.rows.map((row) => ({
      "Claim #": row.claimNumber || row.claim_number || "",
      Employee: row.employeeName || row.employee_snapshot?.name || "",
      Patient: row.patientName || row.patient_snapshot?.name || "",
      "Claimed Amount": row.totalClaimedAmount ?? row.total_claimed_amount ?? "",
      "Approved Amount": row.approvedAmount ?? row.approved_amount ?? "",
      Status: row.status || "",
      "Last Updated": row.updatedAt || row.updated_at || "",
    }));
    downloadCSV(rows, "mediclaim-claims");
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

  const CLAIM_COLUMNS = [
    { key: "claimNumber", label: "Claim #", render: (row) => row.claimNumber || row.claim_number || "—" },
    { key: "employeeName", label: "Employee", render: (row) => row.employeeName || row.employee_snapshot?.name || "—" },
    { key: "patientName", label: "Patient", render: (row) => row.patientName || row.patient_snapshot?.name || "—" },
    { key: "claimedAmount", label: "Claimed", render: (row) => formatCurrencyINR(row.totalClaimedAmount ?? row.total_claimed_amount) },
    {
      key: "approvedAmount",
      label: "Approved",
      render: (row) => ((row.approvedAmount ?? row.approved_amount) != null ? formatCurrencyINR(row.approvedAmount ?? row.approved_amount) : "—"),
    },
    { key: "status", label: "Status", render: (row) => <ClaimStatusBadge status={row.status} /> },
    { key: "updatedOn", label: "Last Updated", render: (row) => formatClaimDate(row.updatedAt || row.updated_at || row.createdAt || row.created_at) },
    ...(canDelete ? [{
      key: "actions",
      label: "",
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
  const state = { loading, rows: result.rows, total: result.total, error: loading ? null : result.error };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Finalized Mediclaim claims — Draft, Submitted and under-review claims are in Pending Reviews instead.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search claim #, employee…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-900"
            />
          </div>
          <select
            className={inputClass}
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          >
            <option value={FINALIZED_FILTER_VALUE}>Finalized (default)</option>
            <option value="">All statuses (incl. in progress)</option>
            {CLAIM_STATUS_LIST.map((s) => (
              <option key={s} value={s}>{CLAIM_STATUS_META[s]?.label || s}</option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={() => setReloadToken((n) => n + 1)}>
            Refresh
          </Button>
          <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      <ClaimsTable
        columns={CLAIM_COLUMNS}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage={search ? "No claims match this search." : "No claims found."}
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
