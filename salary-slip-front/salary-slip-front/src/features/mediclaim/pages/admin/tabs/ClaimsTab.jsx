import { useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
import { CLAIM_STATUS_LIST, CLAIM_STATUS_META } from "../../../models/claimStatus";
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";

const PER_PAGE = 15;

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
];

const inputClass =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * Full company-scoped claims list, at any stage, via `mediclaimApi.adminClaims`
 * (the bare admin claim-list endpoint added per the implementation plan's
 * reconciliation #3). Row click opens the shared, read-only `ClaimDetailDrawer`
 * — deciding a claim happens from the Pending Reviews tab instead, same
 * separation `TeamClaimsTab`/`PendingMyApprovalTab` already established on
 * the employee side.
 */
export default function ClaimsTab() {
  const { user } = useAuth();
  const [state, setState] = useState({ loading: true, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [selectedClaimId, setSelectedClaimId] = useState(null);

  useEffect(() => {
    if (!user?.accessToken) return undefined;
    let cancelled = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));

    mediclaimApi.adminClaims({ page, perPage: PER_PAGE, status: status || undefined }, user.accessToken, user.tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setState({ loading: false, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ loading: false, rows: [], total: 0, error: err?.message || "Failed to load claims." });
      });

    return () => { cancelled = true; };
  }, [user, page, status]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">Every Mediclaim claim filed within this company, at any stage.</p>
        <select
          className={inputClass}
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          {CLAIM_STATUS_LIST.map((s) => (
            <option key={s} value={s}>{CLAIM_STATUS_META[s]?.label || s}</option>
          ))}
        </select>
      </div>

      <ClaimsTable
        columns={CLAIM_COLUMNS}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage="No claims found."
        getRowKey={(row) => row.id ?? row.claimId}
        onRowClick={(row) => setSelectedClaimId(row.id ?? row.claimId)}
        page={page}
        perPage={PER_PAGE}
        total={state.total}
        onPageChange={setPage}
      />

      <ClaimDetailDrawer isOpen={Boolean(selectedClaimId)} onClose={() => setSelectedClaimId(null)} claimId={selectedClaimId} />
    </div>
  );
}
