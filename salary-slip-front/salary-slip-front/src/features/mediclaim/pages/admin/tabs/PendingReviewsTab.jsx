import { useEffect, useState } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { useAuthorization } from "../../../../../hooks/useAuthorization";
import { mediclaimActionAccess } from "../../../../../utils/formActionAccess";
import Drawer from "../../../../../components/ui/Drawer";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimSummaryCard from "../../../components/ClaimSummaryCard";
import ManagerReviewPanel from "../../../components/ManagerReviewPanel";
import CoordinatorReviewPanel from "../../../components/CoordinatorReviewPanel";
import CommitteeReviewPanel from "../../../components/CommitteeReviewPanel";
import HrEligibilityReviewPanel from "../../../components/HrEligibilityReviewPanel";
import DirectorDecisionPanel from "../../../components/DirectorDecisionPanel";
import { REVIEW_STAGE, REVIEW_STAGE_META, getStageByPendingStatus } from "../../../models/reviewStages";
import { formatCurrencyINR, formatClaimDate } from "../../../utils/formatters";

const PER_PAGE = 15;

// Which panel component renders for a resolved stage.
const STAGE_PANEL = {
  [REVIEW_STAGE.MANAGER]: ManagerReviewPanel,
  [REVIEW_STAGE.COORDINATOR]: CoordinatorReviewPanel,
  [REVIEW_STAGE.COMMITTEE]: CommitteeReviewPanel,
  [REVIEW_STAGE.HR_ELIGIBILITY]: HrEligibilityReviewPanel,
  [REVIEW_STAGE.DIRECTOR]: DirectorDecisionPanel,
};

// Which `mediclaimActionAccess(can)` boolean gates that stage's decision
// controls — the exact key names that helper exports (see
// `src/utils/formActionAccess.js`).
const STAGE_ACCESS_KEY = {
  [REVIEW_STAGE.MANAGER]: "managerDecide",
  [REVIEW_STAGE.COORDINATOR]: "coordinatorDecide",
  [REVIEW_STAGE.COMMITTEE]: "committeeDecide",
  [REVIEW_STAGE.HR_ELIGIBILITY]: "hrVerificationDecide",
  [REVIEW_STAGE.DIRECTOR]: "directorDecide",
};

/** Resolves which stage a pending-review row is awaiting, tolerant of the
 *  field-naming uncertainty the plan flagged (`currentStage`/`current_stage`
 *  vs. deriving it from `status`). */
function resolveStage(row) {
  const raw = row.currentStage || row.current_stage;
  if (raw && REVIEW_STAGE[raw]) return REVIEW_STAGE[raw];
  return getStageByPendingStatus(row.status || row.currentStatus || row.current_status) || null;
}

/**
 * Company-wide queue of claims awaiting a review decision at any stage, via
 * `mediclaimApi.reviewsPending`. The tab itself is visible to anyone holding
 * ANY of the five stage `.decide` permission codes (gated one level up in
 * `AdminMediclaimWorkspace`'s `TABS`), but each row's actual decision panel
 * is resolved from that claim's own current stage and gated individually —
 * a reviewer who only holds, say, `mediclaim.claim.coordinator.decide` sees
 * every pending claim in this list (for visibility/awareness) but can only
 * open decision controls on the ones actually awaiting Coordinator
 * Verification; every other row opens as a read-only summary instead.
 */
export default function PendingReviewsTab() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const access = mediclaimActionAccess(can);

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
    mediclaimApi.reviewsPending({ page, perPage: PER_PAGE }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load pending reviews." });
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

  const selectedStage = selectedClaim ? resolveStage(selectedClaim) : null;
  const selectedStageMeta = selectedStage ? REVIEW_STAGE_META[selectedStage] : null;
  const SelectedPanel = selectedStage ? STAGE_PANEL[selectedStage] : null;
  const canDecideSelected = selectedStage ? Boolean(access[STAGE_ACCESS_KEY[selectedStage]]) : false;

  const columns = [
    { key: "claimNumber", label: "Claim #", render: (row) => row.claimNumber || row.claim_number || "—" },
    { key: "employeeName", label: "Employee", render: (row) => row.employeeName || row.employee_snapshot?.name || "—" },
    { key: "patientName", label: "Patient", render: (row) => row.patientName || row.patient_snapshot?.name || "—" },
    { key: "claimedAmount", label: "Claimed", render: (row) => formatCurrencyINR(row.totalClaimedAmount ?? row.total_claimed_amount) },
    {
      key: "stage",
      label: "Awaiting",
      render: (row) => {
        const stage = resolveStage(row);
        return stage ? REVIEW_STAGE_META[stage]?.label : (row.status || "—");
      },
    },
    { key: "status", label: "Status", render: (row) => <ClaimStatusBadge status={row.status} /> },
    { key: "submittedOn", label: "Submitted", render: (row) => formatClaimDate(row.submittedAt || row.submitted_at) },
  ];

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Every claim currently awaiting a review decision at any stage, company-wide. You can open decision controls
        only for the stage(s) you hold — other rows open as a read-only summary.
      </p>

      <ClaimsTable
        columns={columns}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage="No claims are currently pending review."
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
        title={selectedStageMeta?.label || "Claim Review"}
        subtitle={selectedClaim?.claimNumber || selectedClaim?.claim_number}
        size="lg"
      >
        {selectedClaim && SelectedPanel && canDecideSelected && (
          <SelectedPanel claim={selectedClaim} onDecided={handleDecided} />
        )}

        {selectedClaim && (!SelectedPanel || !canDecideSelected) && (
          <div className="space-y-4">
            <ClaimSummaryCard claim={selectedClaim} />
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
              {SelectedPanel
                ? `You do not have permission to decide claims at the ${selectedStageMeta?.label || "current"} stage — showing a read-only summary instead.`
                : "This claim's current review stage could not be determined — showing a read-only summary instead."}
            </p>
          </div>
        )}
      </Drawer>
    </div>
  );
}
