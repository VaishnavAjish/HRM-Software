import { useEffect, useState } from "react";
import { FileClock } from "lucide-react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import { CLAIM_STATUS, CLAIM_STATUS_LIST, isTerminalClaimStatus } from "../../../models/claimStatus";
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";

// "Closed/settled" per the plan's description of this tab: the terminal
// statuses from claimStatus.js (REJECTED / CLOSED / WITHDRAWN / CANCELLED)
// plus SETTLED, which claimStatus.js deliberately leaves non-terminal (a
// claim stays open administratively until CLOSED) but which reads as
// "done" from the employee's own point of view — worth showing in history
// rather than making them wait for the formal closure step.
const HISTORY_STATUSES = [
  ...CLAIM_STATUS_LIST.filter((status) => isTerminalClaimStatus(status)),
  CLAIM_STATUS.SETTLED,
];

const CLAIM_COLUMNS = [
  { key: "claimNumber", label: "Claim #", render: (row) => row.claimNumber || row.claim_number || "—" },
  { key: "patientName", label: "Patient", render: (row) => row.patientName || row.patient_snapshot?.name || "—" },
  { key: "claimedAmount", label: "Claimed", render: (row) => formatCurrencyINR(row.totalClaimedAmount ?? row.total_claimed_amount) },
  {
    key: "approvedAmount",
    label: "Approved",
    render: (row) => ((row.approvedAmount ?? row.approved_amount) != null ? formatCurrencyINR(row.approvedAmount ?? row.approved_amount) : "—"),
  },
  { key: "status", label: "Status", render: (row) => <ClaimStatusBadge status={row.status} /> },
  { key: "submittedOn", label: "Submitted", render: (row) => formatClaimDate(row.submittedAt || row.submitted_at) },
];

const PER_PAGE = 15;

/**
 * Closed/settled claims (via `myClaims({status: HISTORY_STATUSES})`) plus
 * past office intimations (`myIntimations()`) — the employee's Mediclaim
 * history in one tab. Row click opens the shared `ClaimDetailDrawer`
 * read-only, exactly as it will for every other claims list in later
 * phases.
 */
export default function HistoryTab() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [claimsResult, setClaimsResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const [intimationsResult, setIntimationsResult] = useState({ key: null, intimations: [], error: null });
  const intimationsKey = `${accessToken ?? ""}|${tokenType ?? ""}`;
  const claimsKey = `${intimationsKey}|${page}`;

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.myClaims({ status: HISTORY_STATUSES, page, perPage: PER_PAGE }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setClaimsResult({ key: claimsKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setClaimsResult({ key: claimsKey, rows: [], total: 0, error: err?.message || "Failed to load claim history." });
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, page, claimsKey]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.myIntimations({}, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const intimations = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setIntimationsResult({ key: intimationsKey, intimations, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setIntimationsResult({ key: intimationsKey, intimations: [], error: err?.message || "Failed to load past intimations." });
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, intimationsKey]);

  const claimsLoading = claimsResult.key !== claimsKey;
  const claimsState = {
    loading: claimsLoading,
    rows: claimsResult.rows,
    total: claimsResult.total,
    error: claimsLoading ? null : claimsResult.error,
  };
  const intimationsState = {
    loading: intimationsResult.key !== intimationsKey,
    intimations: intimationsResult.intimations,
    error: intimationsResult.error,
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-3 text-sm font-semibold text-gray-700 dark:text-gray-200">Closed &amp; Settled Claims</p>
        <ClaimsTable
          columns={CLAIM_COLUMNS}
          rows={claimsState.rows}
          loading={claimsState.loading}
          error={claimsState.error}
          emptyMessage="No closed or settled claims yet."
          getRowKey={(row) => row.id ?? row.claimId}
          onRowClick={(row) => setSelectedClaimId(row.id ?? row.claimId)}
          page={page}
          perPage={PER_PAGE}
          total={claimsState.total}
          onPageChange={setPage}
        />
      </div>

      <div>
        <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <FileClock size={15} /> Past Intimations
        </p>
        <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {intimationsState.loading ? (
            <p className="py-10 text-center text-sm text-gray-400">Loading intimations…</p>
          ) : intimationsState.error ? (
            <p className="py-10 text-center text-sm text-red-500">{intimationsState.error}</p>
          ) : intimationsState.intimations.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No office intimations recorded yet.</p>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {intimationsState.intimations.map((intimation) => (
                <div key={intimation.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <p className="font-medium text-gray-800 dark:text-gray-100">{intimation.referenceNumber || intimation.reference_number}</p>
                    <p className="text-xs text-gray-400">{formatClaimDate(intimation.createdAt || intimation.created_at)}</p>
                  </div>
                  {(intimation.emergency || intimation.isEmergency) && (
                    <span className="text-xs font-semibold text-amber-600">Emergency</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ClaimDetailDrawer
        isOpen={Boolean(selectedClaimId)}
        onClose={() => setSelectedClaimId(null)}
        claimId={selectedClaimId}
      />
    </div>
  );
}
