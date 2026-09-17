import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, AreaChart, Area,
} from "recharts";
import {
  ArrowRight, ClipboardList, Hourglass, IndianRupee, RefreshCw, CheckCircle2, XCircle, TrendingUp,
} from "lucide-react";
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

// `claimStatus.js`'s own metadata only carries Tailwind classes (for
// badges/dots), not hex values — recharts needs real colors to fill
// bars/slices with, so this is a small local mirror of that same palette
// rather than a change to the shared model file.
const STATUS_COLOR_HEX = {
  DRAFT: "#9ca3af",
  SUBMITTED: "#0ea5e9",
  MANAGER_REVIEW: "#f59e0b",
  COORDINATOR_VERIFICATION: "#f59e0b",
  COMMITTEE_RECOMMENDATION: "#f59e0b",
  HR_ELIGIBILITY_VERIFICATION: "#f59e0b",
  DIRECTOR_FINAL_APPROVAL: "#f59e0b",
  APPROVED: "#22c55e",
  PARTIALLY_APPROVED: "#14b8a6",
  REJECTED: "#ef4444",
  SETTLEMENT_PENDING: "#6366f1",
  SETTLED: "#10b981",
  CLOSED: "#94a3b8",
  RETURNED_FOR_CORRECTION: "#f97316",
  WITHDRAWN: "#9ca3af",
  CANCELLED: "#9ca3af",
};

// Broad lifecycle buckets for the "Status Mix" donut — a coarser view than
// the per-status bar chart next to it, so the two charts answer different
// questions (exact stage vs. overall health) instead of duplicating one
// another.
const STATUS_GROUPS = [
  { key: "pending", label: "In Review", color: "#f59e0b", statuses: ["SUBMITTED", ...PENDING_REVIEW_STATUSES] },
  { key: "approved", label: "Approved & Settled", color: "#10b981", statuses: ["APPROVED", "PARTIALLY_APPROVED", "SETTLEMENT_PENDING", "SETTLED", "CLOSED"] },
  { key: "attention", label: "Needs Correction", color: "#f97316", statuses: ["RETURNED_FOR_CORRECTION"] },
  { key: "rejected", label: "Rejected / Withdrawn", color: "#ef4444", statuses: ["REJECTED", "WITHDRAWN", "CANCELLED"] },
  { key: "draft", label: "Draft", color: "#9ca3af", statuses: ["DRAFT"] },
];

const TOOLTIP_STYLE = { backgroundColor: "#1f2937", color: "#f9fafb", border: "1px solid #374151", borderRadius: 12, fontSize: 12 };

function KpiTile({ icon, label, value, sub, tone = "text-brand-600 dark:text-brand-400" }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className={`mb-1 flex items-center gap-1.5 ${tone}`}>
        {icon}
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
      </div>
      <p className="truncate text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="truncate text-[11px] text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100">{title}</h3>
        {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
      </div>
      {children}
    </div>
  );
}

function SkeletonBlock({ className }) {
  return <div className={`animate-pulse rounded-2xl bg-gray-100 dark:bg-gray-700/40 ${className}`} />;
}

/**
 * Admin workspace landing tab — a real metrics dashboard: KPI tiles, a
 * per-status bar chart, a lifecycle-mix donut, and a 6-month filing trend.
 * Rule Books / Hospitals / Document Requirements management moved out of
 * here entirely — see the workspace's own "Settings" tab (`SettingsTab.jsx`).
 *
 * Every number here is computed client-side from the real `adminClaims()`
 * list — nothing is fabricated. There is no dedicated dashboard/aggregate
 * endpoint in the backend, so this stays a "breakdown of the claims we can
 * see" view rather than inventing chart data the API doesn't provide.
 */
export default function DashboardTab({ onNavigate }) {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${reloadToken}`;
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [now] = useState(() => new Date());

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

  const approvedTotal = useMemo(
    () => state.rows.reduce((sum, row) => sum + (Number(row.approvedAmount ?? row.approved_amount) || 0), 0),
    [state.rows],
  );

  const groupCounts = useMemo(
    () => STATUS_GROUPS.map((group) => ({
      ...group,
      count: group.statuses.reduce((sum, s) => sum + (statusCounts[s] || 0), 0),
    })),
    [statusCounts],
  );
  const approvedCount = groupCounts.find((g) => g.key === "approved")?.count || 0;
  const rejectedCount = groupCounts.find((g) => g.key === "rejected")?.count || 0;
  const donutData = groupCounts.filter((g) => g.count > 0);

  const barData = useMemo(
    () => CLAIM_STATUS_LIST
      .filter((status) => statusCounts[status])
      .map((status) => ({ status, label: CLAIM_STATUS_META[status]?.label || status, count: statusCounts[status], fill: STATUS_COLOR_HEX[status] || "#9ca3af" })),
    [statusCounts],
  );

  const trendData = useMemo(() => {
    const buckets = [];
    for (let i = 5; i >= 0; i -= 1) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleString("default", { month: "short" }), count: 0 });
    }
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    state.rows.forEach((row) => {
      const raw = row.createdAt || row.created_at;
      if (!raw) return;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return;
      const bucket = byKey.get(`${d.getFullYear()}-${d.getMonth()}`);
      if (bucket) bucket.count += 1;
    });
    return buckets;
  }, [state.rows, now]);

  const truncated = state.total > state.rows.length;

  const refresh = () => setReloadToken((n) => n + 1);

  return (
    <div className="space-y-4">
      {state.loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-[72px]" />)}
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SkeletonBlock className="h-80" />
            <SkeletonBlock className="h-80" />
          </div>
          <SkeletonBlock className="h-64" />
        </div>
      ) : state.error ? (
        <p className="py-16 text-center text-sm text-red-500">{state.error}</p>
      ) : state.rows.length === 0 ? (
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
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            {truncated ? (
              <p className="text-[11px] text-amber-600 dark:text-amber-400">
                Showing figures for the {state.rows.length} most recently loaded of {state.total} total claims — open
                Reports for the complete, exact breakdown.
              </p>
            ) : <span />}
            <button
              type="button"
              onClick={refresh}
              className="inline-flex flex-shrink-0 items-center gap-1 text-[11px] font-semibold text-gray-400 transition-colors hover:text-brand-600 dark:hover:text-brand-400"
            >
              <RefreshCw size={12} /> Refresh
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <KpiTile icon={<ClipboardList size={14} />} label="Total Claims" value={state.total} />
            <KpiTile icon={<Hourglass size={14} />} label="Pending Review" value={pendingReviewCount} tone="text-amber-600 dark:text-amber-400" />
            <KpiTile icon={<CheckCircle2 size={14} />} label="Approved & Settled" value={approvedCount} tone="text-emerald-600 dark:text-emerald-400" />
            <KpiTile icon={<XCircle size={14} />} label="Rejected / Withdrawn" value={rejectedCount} tone="text-red-500 dark:text-red-400" />
            <KpiTile icon={<IndianRupee size={14} />} label="Claimed Amount" value={formatCurrencyINR(claimedTotal)} />
            <KpiTile icon={<IndianRupee size={14} />} label="Approved Amount" value={formatCurrencyINR(approvedTotal)} tone="text-emerald-600 dark:text-emerald-400" />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Claims by Status" subtitle="Exact stage each claim is currently at">
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
                  <BarChart data={barData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <YAxis type="category" dataKey="label" width={128} tick={{ fontSize: 11, fill: "#6b7280" }} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(148, 163, 184, 0.1)" }} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={14}>
                      {barData.map((entry) => <Cell key={entry.status} fill={entry.fill} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            <ChartCard title="Status Mix" subtitle="Overall lifecycle distribution">
              <div className="flex flex-col items-center gap-4 sm:flex-row">
                <div className="relative h-44 w-44 flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={donutData} dataKey="count" nameKey="label" innerRadius={48} outerRadius={72} paddingAngle={3} strokeWidth={0}>
                        {donutData.map((entry) => <Cell key={entry.key} fill={entry.color} />)}
                      </Pie>
                      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(value, name) => [`${value} claims`, name]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{state.rows.length}</p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-400">claims</p>
                  </div>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  {donutData.map((entry) => (
                    <div key={entry.key} className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2 truncate font-medium text-gray-600 dark:text-gray-300">
                        <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                        {entry.label}
                      </span>
                      <span className="flex-shrink-0 font-semibold text-gray-800 dark:text-gray-100">
                        {entry.count} <span className="font-normal text-gray-400">({Math.round((entry.count / state.rows.length) * 100)}%)</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Filing Trend" subtitle="Claims filed per month, last 6 months">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
                <AreaChart data={trendData} margin={{ left: -16, right: 16, top: 8 }}>
                  <defs>
                    <linearGradient id="mediclaimTrendFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#6b7280" }} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(label) => label} formatter={(value) => [`${value} claims`, "Filed"]} />
                  <Area type="monotone" dataKey="count" stroke="#4f46e5" strokeWidth={2} fill="url(#mediclaimTrendFill)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => onNavigate?.("reports")}
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              <TrendingUp size={12} /> Full reports <ArrowRight size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
