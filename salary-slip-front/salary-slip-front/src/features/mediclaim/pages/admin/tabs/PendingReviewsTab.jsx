import { useEffect, useMemo, useState } from "react";
import { Search, Download, RefreshCw, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { useAuthorization } from "../../../../../hooks/useAuthorization";
import { mediclaimActionAccess } from "../../../../../utils/formActionAccess";
import { downloadCSV } from "../../../../../utils/exportUtils";
import Drawer from "../../../../../components/ui/Drawer";
import Button from "../../../../../components/ui/Button";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
import { CLAIM_STATUS } from "../../../models/claimStatus";
import SingleApprovalPanel from "../../../components/SingleApprovalPanel";
import ManagerReviewPanel from "../../../components/ManagerReviewPanel";
import CoordinatorReviewPanel from "../../../components/CoordinatorReviewPanel";
import CommitteeReviewPanel from "../../../components/CommitteeReviewPanel";
import HrEligibilityReviewPanel from "../../../components/HrEligibilityReviewPanel";
import DirectorDecisionPanel from "../../../components/DirectorDecisionPanel";
import {
  REVIEW_STAGE,
  REVIEW_STAGE_META,
  getStageByPendingStatus,
  CLAIM_WORKFLOW_BUCKET,
  getClaimWorkflowBucket,
  FINALIZED_CLAIM_STATUSES,
} from "../../../models/reviewStages";
import { formatCurrencyINR, formatClaimDate, getFinancialYearLabel, formatClaimNumber } from "../../../utils/formatters";

const PER_PAGE = 15;
const FINALIZED_FILTER_VALUE = FINALIZED_CLAIM_STATUSES.join(",");

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
// reviews/pending covers every in-flight claim (Pending Approval + Pending
// Document together) in one company — capped generously so the two
// buckets below can be paginated purely client-side, with no extra
// round-trip when switching between them.
const PENDING_FETCH_SIZE = 100;

// Which panel component renders for a resolved stage. SETTLEMENT is
// deliberately absent: a SETTLEMENT_PENDING claim now falls through to the
// same `ClaimDetailDrawer` + `FinalizeClaimModal` "Finalize Claim" action
// every other tab uses, instead of the standalone `SettlementPanel` form
// that used to render here — one finalize UI instead of two.
const STAGE_PANEL = {
  [REVIEW_STAGE.APPROVAL]: SingleApprovalPanel,
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
  [REVIEW_STAGE.APPROVAL]: "claimApprove",
  [REVIEW_STAGE.MANAGER]: "managerDecide",
  [REVIEW_STAGE.COORDINATOR]: "coordinatorDecide",
  [REVIEW_STAGE.COMMITTEE]: "committeeDecide",
  [REVIEW_STAGE.HR_ELIGIBILITY]: "hrVerificationDecide",
  [REVIEW_STAGE.DIRECTOR]: "directorDecide",
};

const SUB_TABS = [
  {
    key: CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL,
    label: "Pending Approval",
    description: "Newly submitted claims awaiting the single approval decision (legacy in-flight claims still moving through Manager, Coordinator, Committee, HR Eligibility or Director review also show here).",
  },
  {
    key: CLAIM_WORKFLOW_BUCKET.PENDING_DOCUMENT,
    label: "Pending Document",
    description: "Approved claims awaiting employee document submission and final Admin review & settlement approval.",
  },
    {
    key: CLAIM_WORKFLOW_BUCKET.FINALIZED,
    label: "Approved Claim",
  },
];

/** Resolves which stage a pending-review row is awaiting, tolerant of the
 *  field-naming uncertainty the plan flagged (`currentStage`/`current_stage`
 *  vs. deriving it from `status`). */
function resolveStage(row) {
  const raw = row.currentStage || row.current_stage;
  if (raw && REVIEW_STAGE[raw]) return REVIEW_STAGE[raw];
  return getStageByPendingStatus(row.status || row.currentStatus || row.current_status) || null;
}

function employeeName(row) {
  return row.employeeName || row.employee_snapshot?.name || row.employee?.name || "—";
}

function matchesSearch(row, term) {
  if (!term) return true;
  const haystack = `${formatClaimNumber(row)} ${employeeName(row)} ${row.patientName || row.patient_snapshot?.name || ""}`.toLowerCase();
  return haystack.includes(term.toLowerCase());
}

function toCsvRow(row) {
  return {
    "Claim #": formatClaimNumber(row),
    Employee: employeeName(row),
    Patient: row.patientName || row.patient_snapshot?.name || "",
    "Claimed Amount": row.totalClaimedAmount ?? row.total_claimed_amount ?? "",
    "Approved Amount": row.approvedAmount ?? row.approved_amount ?? row.totalApprovedAmount ?? row.total_approved_amount ?? "",
    Status: row.status || "",
    Submitted: row.submittedAt || row.submitted_at || "",
  };
}

/**
 * Company-wide claim workflow view, split into three filter sub-tabs
 * mirroring the actual pipeline end to end — "like Employees" in the sense
 * of one consistent, well-organized table format reused across every
 * stage, rather than one flat undifferentiated list:
 *
 *  - **Pending Approval**: every claim still moving through the five review
 *    stages (Manager → Coordinator → Committee → HR Eligibility →
 *    Director). Approving here at Director stage is what moves a claim into
 *    the next bucket.
 *  - **Pending Document**: SETTLEMENT_PENDING claims — cleared every review
 *    stage, now waiting on the employee's document upload and then HR's
 *    Final Approve (the same `ClaimDetailDrawer` + `FinalizeClaimModal`
 *    "Finalize Claim" action every other tab uses, which shows the actual
 *    uploaded documents and blocks finalizing until they're all on file).
 *  - **Approved Claim**: the finished pipeline — settled/closed (and also
 *    rejected/withdrawn/cancelled, so a claim never just vanishes from
 *    every tab) — the same `FINALIZED_CLAIM_STATUSES` set the admin Claims
 *    tab defaults to, fetched via `adminClaims()` lazily, only once this
 *    sub-tab is actually opened.
 *
 * Pending Approval and Pending Document share ONE `reviewsPending()` fetch
 * (a generous `PENDING_FETCH_SIZE` cap) split client-side by
 * `getClaimWorkflowBucket()` — that endpoint already returns both buckets
 * together, and splitting a single mixed server-paginated result would make
 * per-bucket pagination incoherent, so each bucket paginates independently
 * over the same already-loaded set instead.
 *
 * Toolbar mirrors the house data-table pattern this app already uses
 * elsewhere (`EmployeeMasterTable.jsx`'s search+pill-filter+action-button
 * row, `RequisitionsTab.jsx`'s Export/Refresh buttons): a search box
 * (claim #/employee/patient — client-side for the two in-memory buckets,
 * forwarded as `Admin\ClaimController::index()`'s existing `search` param
 * for Approved Claim), the three buckets as a pill-button group instead of
 * plain underline tabs, and Refresh/Export CSV actions. `ClaimsTable`'s
 * `Pagination` already supported a "Show N entries" page-size control and
 * numbered pages — it just needed `onPageSizeChange` actually wired here.
 */
export default function PendingReviewsTab() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const access = mediclaimActionAccess(can);

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [subTab, setSubTab] = useState(CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [fyFilter, setFyFilter] = useState("");
  const [perPage, setPerPage] = useState(PER_PAGE);
  const [selectedClaim, setSelectedClaim] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [deletingId, setDeletingId] = useState(null);

  const [pendingResult, setPendingResult] = useState({ key: null, rows: [], error: null });
  const [approvalPage, setApprovalPage] = useState(1);
  const [documentPage, setDocumentPage] = useState(1);
  const [finalizedPage, setFinalizedPage] = useState(1);
  const pendingRequestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${reloadToken}`;

  const selectSubTab = (key) => {
    setSubTab(key);
    setApprovalPage(1);
    setDocumentPage(1);
    setFinalizedPage(1);
  };

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.reviewsPending({ perPage: PENDING_FETCH_SIZE }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setPendingResult({ key: pendingRequestKey, rows, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setPendingResult({ key: pendingRequestKey, rows: [], error: err?.message || "Failed to load pending reviews." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, reloadToken, pendingRequestKey]);

  const pendingLoading = pendingResult.key !== pendingRequestKey;

  const matchesFilters = (row) => {
    if (!matchesSearch(row, search)) return false;
    if (statusFilter && String(row.status || "").toUpperCase() !== statusFilter.toUpperCase()) {
      return false;
    }
    if (fyFilter) {
      const d = row.submittedAt || row.submitted_at || row.createdAt || row.created_at || row.updatedAt;
      if (getFinancialYearLabel(d) !== fyFilter) return false;
    }
    return true;
  };

  const approvalRows = pendingResult.rows
    .filter((row) => getClaimWorkflowBucket(row.status) === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL)
    .filter(matchesFilters);
  const documentRows = pendingResult.rows
    .filter((row) => getClaimWorkflowBucket(row.status) === CLAIM_WORKFLOW_BUCKET.PENDING_DOCUMENT)
    .filter(matchesFilters);

  const [finalizedResult, setFinalizedResult] = useState({ key: null, rows: [], total: 0, error: null });
  const finalizedStatus = statusFilter || FINALIZED_FILTER_VALUE;
  const finalizedRequestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${finalizedPage}|${perPage}|${search}|${statusFilter}|${fyFilter}|${reloadToken}`;

  const fyOptions = useMemo(() => {
    const set = new Set();
    const allRows = [...(pendingResult.rows || []), ...(finalizedResult.rows || [])];
    allRows.forEach((r) => {
      const d = r.submittedAt || r.submitted_at || r.createdAt || r.created_at || r.updatedAt;
      const label = getFinancialYearLabel(d);
      if (label) set.add(label);
    });
    const currentFY = getFinancialYearLabel(new Date());
    if (currentFY) set.add(currentFY);
    set.add("2025-26");
    set.add("2024-25");
    set.add("2023-24");
    return Array.from(set).sort().reverse();
  }, [pendingResult.rows, finalizedResult.rows]);

  useEffect(() => {
    if (!accessToken || subTab !== CLAIM_WORKFLOW_BUCKET.FINALIZED) return undefined;
    let cancelled = false;
    mediclaimApi.adminClaims(
      {
        page: finalizedPage,
        perPage,
        status: finalizedStatus,
        search: search || undefined,
        financial_year: fyFilter || undefined,
        year: fyFilter || undefined,
      },
      accessToken,
      tokenType,
    )
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setFinalizedResult({ key: finalizedRequestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setFinalizedResult({ key: finalizedRequestKey, rows: [], total: 0, error: err?.message || "Failed to load approved claims." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, subTab, finalizedPage, perPage, search, finalizedStatus, fyFilter, reloadToken, finalizedRequestKey]);

  const finalizedRows = useMemo(() => {
    return finalizedResult.rows.filter((row) => {
      if (statusFilter && String(row.status || "").toUpperCase() !== statusFilter.toUpperCase()) {
        return false;
      }
      if (fyFilter) {
        const d = row.submittedAt || row.submitted_at || row.createdAt || row.created_at || row.updatedAt;
        if (getFinancialYearLabel(d) !== fyFilter) return false;
      }
      return true;
    });
  }, [finalizedResult.rows, statusFilter, fyFilter]);

  const finalizedLoading = subTab === CLAIM_WORKFLOW_BUCKET.FINALIZED && finalizedResult.key !== finalizedRequestKey;

  const loadPending = () => setReloadToken((n) => n + 1);

  const handleDecided = () => {
    setSelectedClaim(null);
    loadPending();
  };

  const handleSearchChange = (value) => {
    setSearch(value);
    setApprovalPage(1);
    setDocumentPage(1);
    setFinalizedPage(1);
  };

  // Exports the currently active sub-tab's full filtered set (not just the
  // page on screen) for Pending Approval/Pending Document, since those are
  // already fully loaded client-side — Approved Claim is server-paginated,
  // so its export is scoped to the current page only.
  const exportCsv = () => {
    const rows = subTab === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL
      ? approvalRows
      : subTab === CLAIM_WORKFLOW_BUCKET.PENDING_DOCUMENT
        ? documentRows
        : finalizedRows;
    downloadCSV(rows.map(toCsvRow), `mediclaim-${subTab.toLowerCase()}`);
  };

  // Hard delete (mediclaim.claim.delete — realistically super-admin only,
  // see Admin\ClaimController::destroy()'s docblock), available from every
  // sub-tab: a claim stuck mid-review, mid-document, or already finalized
  // can all be cleaned up from wherever it happens to currently sit rather
  // than only from the separate top-level Claims tab.
  const deleteClaim = async (row) => {
    const id = row.id ?? row.claimId;
    const label = formatClaimNumber(row) || "this claim";
    if (!window.confirm(`Permanently delete ${label}? This cannot be undone.`)) return;

    setDeletingId(id);
    try {
      await mediclaimApi.deleteClaim(id, accessToken, tokenType);
      toast.success(`${label} deleted`);
      if (selectedClaim && (selectedClaim.id ?? selectedClaim.claimId) === id) setSelectedClaim(null);
      loadPending();
    } catch (err) {
      toast.error(err?.message || "Failed to delete this claim.");
    } finally {
      setDeletingId(null);
    }
  };

  const selectedStage = selectedClaim ? resolveStage(selectedClaim) : null;
  const SelectedPanel = selectedStage ? STAGE_PANEL[selectedStage] : null;
  const canDecideSelected = selectedStage ? Boolean(access[STAGE_ACCESS_KEY[selectedStage]]) : false;
  // Anything that isn't one of the five review-stage decision panels the
  // current user can actually use — finalized, awaiting documents (APPROVED/
  // PARTIALLY_APPROVED under the simplified workflow auto-settle once
  // documents are complete — see autoSettleIfDocumentsComplete() — so there
  // is nothing to decide here), SETTLEMENT_PENDING (finalized via the same
  // `ClaimDetailDrawer` "Finalize Claim" action every other tab uses, not a
  // dedicated panel here), or a legacy stage the viewer lacks permission
  // for — falls back to the same full `ClaimDetailDrawer` the Approved Claim
  // tab already uses, instead of a bare summary card plus a "no permission"
  // message that was actively misleading for a claim with no decision
  // pending at all.
  const selectedIsActionable = Boolean(selectedClaim && SelectedPanel && canDecideSelected);

  const baseColumns = [
    { key: "claimNumber", label: "Claim #", render: (row) => formatClaimNumber(row) || "—" },
    { key: "employeeName", label: "Employee", render: employeeName },
    { key: "patientName", label: "Patient", render: (row) => row.patientName || row.patient_snapshot?.name || "—" },
    { key: "claimedAmount", label: "Claimed", render: (row) => formatCurrencyINR(row.totalClaimedAmount ?? row.total_claimed_amount) },
  ];

  // Delete is available on every sub-tab, not just the finalized/Claims
  // view — a claim can be a test/duplicate/erroneous row at any stage of
  // the pipeline, and there is no reason super admin should have to wait
  // for it to reach "Approved Claim" first to clean it up.
  const actionsColumn = access.claimDelete ? [{
    key: "actions",
    label: "ACTIONS",
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
  }] : [];

  const pendingColumns = [
    ...baseColumns,
    {
      key: "stage",
      label: "Awaiting",
      render: (row) => {
        const stage = resolveStage(row);
        if (stage) return REVIEW_STAGE_META[stage]?.label;
        if (row.status === "APPROVED" || row.status === "PARTIALLY_APPROVED") return "Employee's Documents";
        return row.status || "—";
      },
    },
    { key: "status", label: "Status", render: (row) => <ClaimStatusBadge status={row.status} /> },
    { key: "submittedOn", label: "Submitted", render: (row) => formatClaimDate(row.submittedAt || row.submitted_at) },
    ...actionsColumn,
  ];

  const finalizedColumns = [
    ...baseColumns,
    {
      key: "approvedAmount",
      label: "Approved",
      render: (row) => {
        const amt = row.approvedAmount ?? row.approved_amount ?? row.totalApprovedAmount ?? row.total_approved_amount;
        return amt != null && amt !== "" ? formatCurrencyINR(amt) : "—";
      },
    },
    { key: "status", label: "Status", render: (row) => <ClaimStatusBadge status={row.status} /> },
    { key: "updatedOn", label: "Last Updated", render: (row) => formatClaimDate(row.updatedAt || row.updated_at) },
    ...actionsColumn,
  ];

  const activeSubTab = SUB_TABS.find((t) => t.key === subTab) || SUB_TABS[0];
  const tabCount = (key) => {
    if (pendingLoading && key !== CLAIM_WORKFLOW_BUCKET.FINALIZED) return null;
    if (key === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL) return approvalRows.length;
    if (key === CLAIM_WORKFLOW_BUCKET.PENDING_DOCUMENT) return documentRows.length;
    if (key === CLAIM_WORKFLOW_BUCKET.FINALIZED) return finalizedLoading ? null : (statusFilter || fyFilter ? finalizedRows.length : finalizedResult.total);
    return null;
  };

  const toolbarHeader = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search claim #, employee, patient…"
            className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-900"
          />
        </div>

        <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

        {/* Specific Status Dropdown */}
        <select
          className={inputClass}
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setApprovalPage(1);
            setDocumentPage(1);
            setFinalizedPage(1);
          }}
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
          onChange={(e) => {
            setFyFilter(e.target.value);
            setApprovalPage(1);
            setDocumentPage(1);
            setFinalizedPage(1);
          }}
        >
          <option value="">All Financial Years</option>
          {fyOptions.map((label) => (
            <option key={label} value={label}>FY {label}</option>
          ))}
        </select>

        <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

        {SUB_TABS.map((t) => {
          const count = tabCount(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => selectSubTab(t.key)}
              aria-current={subTab === t.key ? "page" : undefined}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap transition ${
                subTab === t.key
                  ? "bg-brand-600 text-white shadow-sm shadow-brand-600/30"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10"
              }`}
            >
              {t.label}{count != null ? ` (${count})` : ""}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={loadPending}>
          Refresh
        </Button>
        <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div>
        {toolbarHeader}
        {activeSubTab.description && (
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{activeSubTab.description}</p>
        )}
      </div>

      {subTab !== CLAIM_WORKFLOW_BUCKET.FINALIZED ? (
        <ClaimsTable
          columns={pendingColumns}
          rows={paginate(subTab === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL ? approvalRows : documentRows, subTab === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL ? approvalPage : documentPage, perPage)}
          loading={pendingLoading}
          error={pendingResult.error}
          emptyMessage={
            search || statusFilter || fyFilter
              ? "No claims match this filter."
              : subTab === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL ? "No claims are currently pending approval." : "No claims are currently pending documents."
          }
          getRowKey={(row) => row.id ?? row.claimId}
          onRowClick={setSelectedClaim}
          page={subTab === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL ? approvalPage : documentPage}
          perPage={perPage}
          total={subTab === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL ? approvalRows.length : documentRows.length}
          onPageChange={subTab === CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL ? setApprovalPage : setDocumentPage}
          onPageSizeChange={setPerPage}
        />
      ) : (
        <ClaimsTable
          columns={finalizedColumns}
          rows={finalizedRows}
          loading={finalizedLoading}
          error={finalizedLoading ? null : finalizedResult.error}
          emptyMessage={search || statusFilter || fyFilter ? "No approved claims match this filter." : "No approved claims yet."}
          getRowKey={(row) => row.id ?? row.claimId}
          onRowClick={setSelectedClaim}
          page={finalizedPage}
          perPage={perPage}
          total={statusFilter || fyFilter ? finalizedRows.length : finalizedResult.total}
          onPageChange={setFinalizedPage}
          onPageSizeChange={setPerPage}
        />
      )}

      {selectedIsActionable ? (
        <Drawer
          isOpen={Boolean(selectedClaim)}
          onClose={() => setSelectedClaim(null)}
          title={REVIEW_STAGE_META[selectedStage]?.label || "Claim Review"}
          subtitle={formatClaimNumber(selectedClaim)}
          size="lg"
        >
          <SelectedPanel claim={selectedClaim} onDecided={handleDecided} />
        </Drawer>
      ) : (
        <ClaimDetailDrawer
          isOpen={Boolean(selectedClaim)}
          onClose={() => setSelectedClaim(null)}
          claimId={selectedClaim?.id ?? selectedClaim?.claimId}
          title={formatClaimNumber(selectedClaim)}
          // Without this, finalizing (or approving/denying a document) inside
          // the drawer only refreshed the drawer's own claim fetch — the
          // outer table's already-loaded `pendingResult.rows` never
          // re-fetched, so a just-finalized claim kept showing its stale
          // "Pending for Document Approval" badge/bucket in the list behind
          // the drawer until an unrelated full page reload happened to
          // refetch it.
          onDocumentsChanged={loadPending}
        />
      )}
    </div>
  );
}

function paginate(rows, page, perPage) {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}
