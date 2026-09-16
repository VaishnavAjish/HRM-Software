import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
import { CLAIM_STATUS } from "../../../models/claimStatus";
import { WIZARD_STEP } from "../../../models/wizardSteps";
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";

const CONTINUABLE_STATUSES = [CLAIM_STATUS.DRAFT, CLAIM_STATUS.RETURNED_FOR_CORRECTION];

const CLAIM_COLUMNS = [
  { key: "claimNumber", label: "Claim #", render: (row) => row.claimNumber || row.claim_number || "Draft" },
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

const PER_PAGE = 15;

/**
 * All of the employee's own claims, regardless of status (History covers
 * only the closed/settled slice — this is the complete list). Row click
 * branches by status: DRAFT/RETURNED_FOR_CORRECTION routes back into the
 * Submit Claim tab's wizard (via `?claimId=`) so the employee can continue
 * editing; everything else opens the shared, read-only `ClaimDetailDrawer`
 * — reused unmodified, never rebuilt.
 */
export default function MyClaimsTab() {
  const { user } = useAuth();
  const [, setSearchParams] = useSearchParams();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [claimsResult, setClaimsResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${page}`;

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.myClaims({ page, perPage: PER_PAGE }, accessToken, tokenType)
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

    return () => { cancelled = true; };
  }, [accessToken, tokenType, page, requestKey]);

  const claimsLoading = claimsResult.key !== requestKey;
  const claimsState = {
    loading: claimsLoading,
    rows: claimsResult.rows,
    total: claimsResult.total,
    error: claimsLoading ? null : claimsResult.error,
  };

  const handleRowClick = (row) => {
    const claimId = row.id ?? row.claimId;
    if (CONTINUABLE_STATUSES.includes(row.status)) {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("tab", "submit");
        next.set("claimId", String(claimId));
        next.set("wizardStep", WIZARD_STEP.PATIENT);
        return next;
      });
      return;
    }
    setSelectedClaimId(claimId);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Every claim you've filed. Drafts and claims returned for correction reopen the Submit Claim wizard;
        everything else opens a read-only summary.
      </p>

      <ClaimsTable
        columns={CLAIM_COLUMNS}
        rows={claimsState.rows}
        loading={claimsState.loading}
        error={claimsState.error}
        emptyMessage="You haven't filed any claims yet."
        getRowKey={(row) => row.id ?? row.claimId}
        onRowClick={handleRowClick}
        page={page}
        perPage={PER_PAGE}
        total={claimsState.total}
        onPageChange={setPage}
      />

      <ClaimDetailDrawer
        isOpen={Boolean(selectedClaimId)}
        onClose={() => setSelectedClaimId(null)}
        claimId={selectedClaimId}
      />
    </div>
  );
}
