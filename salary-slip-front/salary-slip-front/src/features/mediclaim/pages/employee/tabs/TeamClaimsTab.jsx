import { useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
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

/**
 * Read-only browsing of the manager's reporting-subtree claims, at any
 * status, via `mediclaimApi.teamClaims`. Row click always opens the shared
 * `ClaimDetailDrawer` (read-only) — this tab is deliberately NOT where a
 * manager decides a claim; that is `PendingMyApprovalTab`, which renders
 * `ManagerReviewPanel` instead of this drawer.
 */
export default function TeamClaimsTab() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${page}`;

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.teamClaims({ page, perPage: PER_PAGE }, accessToken, tokenType)
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
  }, [accessToken, tokenType, page, requestKey]);

  const loading = result.key !== requestKey;
  const state = { loading, rows: result.rows, total: result.total, error: loading ? null : result.error };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Claims filed by employees in your reporting line, at any stage. Read-only — to decide a claim
        awaiting your manager review, use the Pending My Approval tab instead.
      </p>

      <ClaimsTable
        columns={CLAIM_COLUMNS}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage="No claims found for your team."
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
