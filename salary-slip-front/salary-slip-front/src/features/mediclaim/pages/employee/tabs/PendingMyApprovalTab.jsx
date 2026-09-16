import { useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ManagerReviewPanel from "../../../components/ManagerReviewPanel";
import Drawer from "../../../../../components/ui/Drawer";
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";

const PER_PAGE = 15;

const COLUMNS = [
  { key: "claimNumber", label: "Claim #", render: (row) => row.claimNumber || row.claim_number || "—" },
  { key: "employeeName", label: "Employee", render: (row) => row.employeeName || row.employee_snapshot?.name || "—" },
  { key: "patientName", label: "Patient", render: (row) => row.patientName || row.patient_snapshot?.name || "—" },
  { key: "claimedAmount", label: "Claimed", render: (row) => formatCurrencyINR(row.totalClaimedAmount ?? row.total_claimed_amount) },
  { key: "status", label: "Status", render: (row) => <ClaimStatusBadge status={row.status} /> },
  { key: "submittedOn", label: "Submitted", render: (row) => formatClaimDate(row.submittedAt || row.submitted_at) },
];

/**
 * Claims from the manager's reporting subtree currently awaiting *their*
 * manager-review decision, via `mediclaimApi.teamPendingApprovals`. Row
 * click opens `ManagerReviewPanel` for that claim in a drawer; a successful
 * decision closes the drawer and reloads the list, so a decided claim drops
 * off immediately.
 */
export default function PendingMyApprovalTab() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${page}|${reloadToken}`;

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.teamPendingApprovals({ page, perPage: PER_PAGE }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load pending approvals." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, page, requestKey]);

  const loading = result.key !== requestKey;
  const state = { loading, rows: result.rows, total: result.total, error: loading ? null : result.error };

  const loadPending = () => setReloadToken((n) => n + 1);

  const handleDecided = () => {
    setSelectedClaim(null);
    loadPending();
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Claims from your team currently awaiting your manager-review decision. Click a claim to approve,
        reject, or return it for correction.
      </p>

      <ClaimsTable
        columns={COLUMNS}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage="No claims are currently pending your approval."
        getRowKey={(row) => row.id ?? row.claimId}
        onRowClick={setSelectedClaim}
        page={page}
        perPage={PER_PAGE}
        total={state.total}
        onPageChange={setPage}
      />

      <Drawer
        isOpen={Boolean(selectedClaim)}
        onClose={() => setSelectedClaim(null)}
        title="Manager Review"
        subtitle={selectedClaim?.claimNumber || selectedClaim?.claim_number}
        size="lg"
      >
        {selectedClaim && <ManagerReviewPanel claim={selectedClaim} onDecided={handleDecided} />}
      </Drawer>
    </div>
  );
}
