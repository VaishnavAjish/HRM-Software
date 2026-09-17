import { useEffect, useState } from "react";
import { FilePlus2, AlertTriangle, UploadCloud, Calendar, Search, Download, RefreshCw } from "lucide-react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import Button from "../../../../../components/ui/Button";
import { downloadCSV } from "../../../../../utils/exportUtils";
import ClaimsTable from "../../../components/ClaimsTable";
import ClaimStatusBadge from "../../../components/ClaimStatusBadge";
import ClaimDetailDrawer from "../../../components/ClaimDetailDrawer";
import NewClaimRequestModal from "../../../components/NewClaimRequestModal";
import { CLAIM_STATUS } from "../../../models/claimStatus";
import {
  CLAIM_WORKFLOW_BUCKET,
  PENDING_APPROVAL_STATUSES,
  PENDING_DOCUMENT_STATUSES,
  FINALIZED_CLAIM_STATUSES,
} from "../../../models/reviewStages";
import { formatCurrencyINR, formatClaimDate, getFinancialYearLabel } from "../../../utils/formatters";

const EDITABLE_STATUSES = [CLAIM_STATUS.DRAFT, CLAIM_STATUS.RETURNED_FOR_CORRECTION];

// `missing_document_types` is computed server-side per row (see
// MyClaimController::index()) — non-empty means this claim has cleared
// discharge (documents_due_at is set) but still has required documents
// outstanding, regardless of how far review/settlement has otherwise
// progressed. This is what a claim looks like right after an admin has
// approved it but the employee hasn't uploaded documents yet.
function missingDocs(row) {
  return row.missingDocumentTypes || row.missing_document_types || [];
}

const CLAIM_COLUMNS = [
  { key: "claimNumber", label: "Claim #", render: (row) => row.claimNumber || row.claim_number || "—" },
  { key: "patientName", label: "Patient", render: (row) => row.patientName || row.patient_snapshot?.name || "—" },
  { key: "claimedAmount", label: "Claimed", render: (row) => formatCurrencyINR(row.totalClaimedAmount ?? row.total_claimed_amount) },
  {
    key: "approvedAmount",
    label: "Approved",
    render: (row) => ((row.approvedAmount ?? row.approved_amount) != null ? formatCurrencyINR(row.approvedAmount ?? row.approved_amount) : "—"),
  },
  {
    key: "status",
    label: "Status",
    render: (row) => (
      <div className="flex items-center gap-1.5">
        <ClaimStatusBadge status={row.status} />
        {missingDocs(row).length > 0 && (
          <span
            title={`Missing: ${missingDocs(row).join(", ")}`}
            className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
          >
            <UploadCloud size={11} /> Upload documents
          </span>
        )}
      </div>
    ),
  },
  { key: "updatedOn", label: "Last Updated", render: (row) => formatClaimDate(row.updatedAt || row.updated_at || row.createdAt || row.created_at) },
];

const PER_PAGE = 15;
// Once a specific financial year is selected, fetch that whole year in one
// page instead of paginating it — a single employee's claims within one FY
// realistically never approach this, and it lets the per-year summary strip
// below be an exact total rather than "this page only".
const FY_PAGE_SIZE = 100;

/** "2026-27" -> 2026 — the FY's starting calendar year, what the backend's `financial_year` filter expects. */
function fyLabelToStartYear(label) {
  return parseInt(String(label).split("-")[0], 10);
}

const SUB_TABS = [
  { key: CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL, label: "Pending Approval", statuses: PENDING_APPROVAL_STATUSES },
  { key: CLAIM_WORKFLOW_BUCKET.PENDING_DOCUMENT, label: "Pending Document", statuses: PENDING_DOCUMENT_STATUSES },
  { key: CLAIM_WORKFLOW_BUCKET.FINALIZED, label: "Approved Claim", statuses: FINALIZED_CLAIM_STATUSES },
];

/**
 * "My Claims" — merges the old separate "Submit Claim"/"My Claims" tabs
 * into one page: the full claim history table (same `ClaimsTable` styling
 * every other list screen in this app uses) plus a "New Claim Request"
 * button that opens `NewClaimRequestModal` — a single popup, filled out
 * once, that creates AND submits the claim in one action. There is no more
 * draft wizard tab to route to.
 *
 * A claim needing documents (approved and past discharge, per
 * `missing_document_types` computed server-side in `MyClaimController::index()`)
 * gets a dismissal-free amber banner at the top plus a per-row "Upload
 * documents" pill — this is the workflow step between admin/director
 * approval and HR's final settlement approval: the claim sits at
 * SETTLEMENT_PENDING until the employee uploads everything required, which
 * they do right here (row click opens `ClaimDetailDrawer` with
 * `allowDocumentUpload`, already gated on nothing but ownership — upload
 * works at any non-draft status, not just this one).
 *
 * A claim returned for correction (or, in the rare case a submit failed
 * right after create, one still sitting in DRAFT) reopens that same modal
 * pre-filled, via `editClaim` — resubmitting is still one popup, one
 * Submit action, never a visible draft state. Everything else opens the
 * shared, read-only `ClaimDetailDrawer`, which is also where a claim's
 * separate post-discharge document upload happens (see that component).
 *
 * The Financial Year filter ("All Years" by default) narrows the list to
 * one FY (April–March, matching `PolicyEligibilityService::floaterUsage()`'s
 * boundary exactly) via the backend's `financial_year` query param, and
 * shows an exact claimed/approved subtotal for that year once selected. Its
 * option list is discovered from a separate, unfiltered, one-off fetch
 * (`FY_PAGE_SIZE`-capped) so it only ever offers years this employee
 * actually has claims in.
 *
 * Three workflow sub-tabs (`SUB_TABS`, mirroring the admin Pending Reviews
 * tab's exact same three-bucket structure via the shared
 * `models/reviewStages.js` status lists) sit above the table: **Pending
 * Approval** (Draft through Director Final Approval), **Pending Document**
 * (SETTLEMENT_PENDING — approved, waiting on the employee's own upload here
 * before HR's final settlement approve), and **Approved Claim** (the
 * finished pipeline). Each maps to an explicit `status` filter sent to
 * `GET /me/claims` server-side (unlike the admin tab, which splits one
 * already-loaded batch client-side — this tab already had server-side
 * pagination working per bucket via the `status` param, so there was no
 * reason to give that up). The FY filter and the sub-tab combine freely —
 * both are just query params on the same fetch.
 */
export default function MyClaimsTab({ lookups }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [claimsResult, setClaimsResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PER_PAGE);
  const [subTab, setSubTab] = useState(CLAIM_WORKFLOW_BUCKET.PENDING_APPROVAL);
  const [search, setSearch] = useState("");
  const [fyFilter, setFyFilter] = useState(""); // "" = All Years; otherwise a "2026-27"-style label
  const [fyOptions, setFyOptions] = useState([]);
  const [claimsNeedingDocuments, setClaimsNeedingDocuments] = useState([]);
  const [selectedClaimId, setSelectedClaimId] = useState(null);
  const [modal, setModal] = useState({ open: false, editClaim: null });
  const perPage = fyFilter ? FY_PAGE_SIZE : pageSize;
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${page}|${pageSize}|${subTab}|${search}|${fyFilter}`;
  const activeStatuses = SUB_TABS.find((t) => t.key === subTab)?.statuses || PENDING_APPROVAL_STATUSES;

  const fetchParams = () => ({
    page: fyFilter ? 1 : page,
    perPage,
    status: activeStatuses.join(","),
    search: search || undefined,
    ...(fyFilter ? { financialYear: fyLabelToStartYear(fyFilter) } : {}),
  });

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.myClaims(fetchParams(), accessToken, tokenType)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, tokenType, page, subTab, fyFilter, requestKey]);

  // A one-off, unfiltered (every status, every year), large fetch that
  // feeds two things not scoped to whichever sub-tab/FY is currently
  // active: the FY dropdown's option list (only years this employee
  // actually has claims in), and the "needs documents" banner below — that
  // banner must stay visible even while browsing "Pending Approval", since
  // its whole point is nudging the employee toward "Pending Document",
  // which a bucket-filtered fetch could never surface on its own.
  const loadDocumentsSample = () => {
    if (!accessToken) return;
    mediclaimApi.myClaims({ perPage: FY_PAGE_SIZE }, accessToken, tokenType)
      .then((res) => {
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const labels = new Set(
          rows
            .map((row) => getFinancialYearLabel(row.submittedAt || row.submitted_at || row.createdAt || row.created_at))
            .filter(Boolean),
        );
        setFyOptions([...labels].sort().reverse());
        setClaimsNeedingDocuments(rows.filter((row) => missingDocs(row).length > 0));
      })
      .catch(() => {});
  };

  useEffect(() => {
    loadDocumentsSample();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, tokenType]);

  // A deliberate re-fetch outside the effect above (after a claim is
  // submitted, or a document upload changes what "missing documents" means
  // for a row) — bumping `page` would be wrong when the page hasn't
  // changed, so this refetches directly with the current key instead of
  // going through a state change the effect would react to. Also refreshes
  // the unfiltered documents-needed sample, since an upload/submit here can
  // change that banner's answer too.
  const loadClaims = () => {
    if (!accessToken) return;
    mediclaimApi.myClaims(fetchParams(), accessToken, tokenType)
      .then((res) => {
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setClaimsResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        setClaimsResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load your claims." });
      });
    loadDocumentsSample();
  };

  const claimsLoading = claimsResult.key !== requestKey;
  const claimsState = {
    loading: claimsLoading,
    rows: claimsResult.rows,
    total: claimsResult.total,
    error: claimsLoading ? null : claimsResult.error,
  };

  // Exact for the selected FY (FY_PAGE_SIZE covers every realistic case);
  // only shown once a specific year is picked, not for "All Years".
  const fySummary = fyFilter && !claimsLoading
    ? claimsState.rows.reduce(
      (acc, row) => ({
        claimed: acc.claimed + (Number(row.totalClaimedAmount ?? row.total_claimed_amount) || 0),
        approved: acc.approved + (Number(row.approvedAmount ?? row.approved_amount) || 0),
      }),
      { claimed: 0, approved: 0 },
    )
    : null;

  const selectFy = (value) => {
    setFyFilter(value);
    setPage(1);
  };

  const selectSubTab = (key) => {
    setSubTab(key);
    setPage(1);
  };

  const handleSearchChange = (value) => {
    setSearch(value);
    setPage(1);
  };

  const exportCsv = () => {
    const rows = claimsState.rows.map((row) => ({
      "Claim #": row.claimNumber || row.claim_number || "",
      Patient: row.patientName || row.patient_snapshot?.name || "",
      "Claimed Amount": row.totalClaimedAmount ?? row.total_claimed_amount ?? "",
      "Approved Amount": row.approvedAmount ?? row.approved_amount ?? "",
      Status: row.status || "",
      "Last Updated": row.updatedAt || row.updated_at || "",
    }));
    downloadCSV(rows, `my-claims-${subTab.toLowerCase()}`);
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Every claim you&apos;ve filed. A claim returned for correction reopens this same form pre-filled.
        </p>
        <Button icon={<FilePlus2 size={14} />} onClick={() => setModal({ open: true, editClaim: null })}>
          New Claim Request
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:w-56">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search claim #, patient…"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white dark:border-white/10 dark:bg-gray-800 dark:text-white dark:focus:bg-gray-900"
            />
          </div>

          <div className="h-5 w-px bg-gray-200 dark:bg-white/10 mx-1 hidden sm:block" />

          {SUB_TABS.map((t) => (
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
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" icon={<RefreshCw size={13} />} onClick={loadClaims}>
            Refresh
          </Button>
          <Button size="sm" variant="secondary" icon={<Download size={13} />} onClick={exportCsv}>
            Export CSV
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-500 dark:text-gray-400">
          <Calendar size={13} /> Financial Year
          <select
            value={fyFilter}
            onChange={(e) => selectFy(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          >
            <option value="">All Years</option>
            {fyOptions.map((label) => (
              <option key={label} value={label}>FY {label}</option>
            ))}
          </select>
        </label>

        {fySummary && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {claimsState.rows.length} claim{claimsState.rows.length === 1 ? "" : "s"} in FY {fyFilter}
            {" · "}{formatCurrencyINR(fySummary.claimed)} claimed
            {" · "}<span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrencyINR(fySummary.approved)} approved</span>
          </span>
        )}
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
              ? "1 claim has been approved and is waiting on you to upload documents."
              : `${claimsNeedingDocuments.length} claims have been approved and are waiting on you to upload documents.`}
          </span>
          <Button size="sm" variant="amber" onClick={() => setSelectedClaimId(claimsNeedingDocuments[0].id ?? claimsNeedingDocuments[0].claimId)}>
            Upload Now
          </Button>
        </div>
      )}

      <ClaimsTable
        columns={CLAIM_COLUMNS}
        rows={claimsState.rows}
        loading={claimsState.loading}
        error={claimsState.error}
        emptyMessage={fyFilter ? `No claims in this tab for FY ${fyFilter}.` : "No claims in this tab yet."}
        headerContent={headerContent}
        getRowKey={(row) => row.id ?? row.claimId}
        onRowClick={handleRowClick}
        page={fyFilter ? undefined : page}
        perPage={fyFilter ? undefined : pageSize}
        total={fyFilter ? undefined : claimsState.total}
        onPageChange={fyFilter ? undefined : setPage}
        onPageSizeChange={fyFilter ? undefined : setPageSize}
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
