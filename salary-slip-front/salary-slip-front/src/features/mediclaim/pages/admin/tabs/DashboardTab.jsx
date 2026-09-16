import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ClipboardList, Hourglass, IndianRupee } from "lucide-react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import { CLAIM_STATUS_META, CLAIM_STATUS_LIST } from "../../../models/claimStatus";
import { formatCurrencyINR } from "../../../utils/formatters";

// The five statuses a claim carries while awaiting a review decision at some
// stage (Manager through Director) — see `models/reviewStages.js`'s
// `pendingStatus` mapping. Used only to compute the "Pending Review" tile,
// not for any authorization decision.
const PENDING_REVIEW_STATUSES = [
  "MANAGER_REVIEW",
  "COORDINATOR_VERIFICATION",
  "COMMITTEE_RECOMMENDATION",
  "HR_ELIGIBILITY_VERIFICATION",
  "DIRECTOR_FINAL_APPROVAL",
];

// A reasonably large page so the on-screen breakdown is accurate for the
// common case; if the company genuinely has more claims than this, the
// truncation notice below says so rather than silently under-counting.
const DASHBOARD_FETCH_LIMIT = 200;

/**
 * Small metrics/summary view for the admin workspace's landing tab. Every
 * number here is computed client-side from the real `adminClaims()` list —
 * nothing is fabricated. There is no dedicated dashboard/aggregate endpoint
 * in the backend plan (B4's route table has no such route), so this
 * deliberately stays a "status breakdown of the claims we can see" view
 * rather than inventing chart data the API doesn't provide, per the plan's
 * own guidance for this tab.
 */
export default function DashboardTab({ onNavigate }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}`;
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    mediclaimApi.adminClaims({ page: 1, perPage: DASHBOARD_FETCH_LIMIT }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load claims for the dashboard." });
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, requestKey]);

  const state = { loading: result.key !== requestKey, rows: result.rows, total: result.total, error: result.error };

  const statusCounts = useMemo(() => {
    const counts = {};
    state.rows.forEach((row) => {
      const status = row.status || "UNKNOWN";
      counts[status] = (counts[status] || 0) + 1;
    });
    return counts;
  }, [state.rows]);

  const pendingReviewCount = useMemo(
    () => PENDING_REVIEW_STATUSES.reduce((sum, status) => sum + (statusCounts[status] || 0), 0),
    [statusCounts],
  );

  const claimedTotal = useMemo(
    () => state.rows.reduce((sum, row) => sum + (Number(row.totalClaimedAmount ?? row.total_claimed_amount) || 0), 0),
    [state.rows],
  );

  const truncated = state.total > state.rows.length;

  if (state.loading) {
    return <p className="py-16 text-center text-sm text-gray-400">Loading dashboard…</p>;
  }

  if (state.error) {
    return <p className="py-16 text-center text-sm text-red-500">{state.error}</p>;
  }

  if (state.rows.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <ClipboardList size={32} className="mx-auto text-gray-300 dark:text-gray-600" />
        <p className="mx-auto mt-3 max-w-md text-sm text-gray-500 dark:text-gray-400">
          No Mediclaim claims have been filed yet. Once employees start submitting claims, a status breakdown and
          claimed-amount summary will appear here.
        </p>
        <button
          type="button"
          onClick={() => onNavigate?.("reports")}
          className="mx-auto mt-4 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          Open Reports <ArrowRight size={12} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile icon={<ClipboardList size={16} />} label="Total Claims" value={state.total} />
        <StatTile icon={<Hourglass size={16} />} label="Pending Review" value={pendingReviewCount} />
        <StatTile icon={<IndianRupee size={16} />} label="Claimed Amount" value={formatCurrencyINR(claimedTotal)} />
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Claims by Status</h3>
          <button
            type="button"
            onClick={() => onNavigate?.("reports")}
            className="inline-flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
          >
            Full reports <ArrowRight size={12} />
          </button>
        </div>

        {truncated && (
          <p className="mb-3 text-[11px] text-amber-600 dark:text-amber-400">
            Showing the breakdown for the {state.rows.length} most recently loaded of {state.total} total claims —
            open Reports for the complete, exact breakdown.
          </p>
        )}

        <div className="space-y-2">
          {CLAIM_STATUS_LIST.filter((status) => statusCounts[status]).map((status) => {
            const meta = CLAIM_STATUS_META[status];
            const count = statusCounts[status];
            const pct = Math.round((count / state.rows.length) * 100);
            return (
              <div key={status} className="flex items-center gap-3 text-xs">
                <span className="w-44 flex-shrink-0 truncate font-medium text-gray-700 dark:text-gray-200">
                  {meta?.label || status}
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                  <div className={`h-full rounded-full ${meta?.dot || "bg-gray-400"}`} style={{ width: `${pct}%` }} />
                </div>
                <span className="w-8 flex-shrink-0 text-right font-semibold text-gray-600 dark:text-gray-300">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatTile({ icon, label, value }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-400">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</p>
        <p className="truncate text-base font-bold text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
