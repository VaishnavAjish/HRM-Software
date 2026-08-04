import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Users, UserCheck, UserPlus, Clock, ClipboardList, Briefcase, CalendarDays, Laptop,
  FileClock, Cake, PartyPopper, Sparkles, Plus, RefreshCw, Download, TrendingUp,
  UserPlus2, FileText, Star, Award, PackageCheck, PackageX,
  AlertTriangle, CalendarClock, UsersRound, LogOut, BarChart3, FileBarChart, Wallet,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, PieChart, Pie, Cell, BarChart,
} from "recharts";
import { StatCard } from "../../../components/ui/Card";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";
import { downloadCSV } from "../../../utils/exportUtils";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#64748b"];

const STAGE_LABELS = {
  applied: "Applied", screening: "Screening", shortlisted: "Shortlisted",
  hr_interview: "HR Interview", technical_interview: "Technical Interview",
  final_interview: "Final Interview", selected: "Selected", offer_sent: "Offer Sent",
  offer_accepted: "Offer Accepted", rejected: "Rejected", on_hold: "On Hold",
};

const ACTIVITY_META = {
  candidate: { icon: UserPlus2, color: "#6366f1" },
  interview: { icon: CalendarClock, color: "#0ea5e9" },
  offer: { icon: FileText, color: "#22c55e" },
};

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function HrDashboard() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [assets, setAssets] = useState(null);
  const [performance, setPerformance] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dashRes, assetRes, perfRes] = await Promise.all([
        hrApi.getDashboard(user?.accessToken, user?.tokenType, companyScope),
        hrApi.getAssetDashboard(user?.accessToken, user?.tokenType, companyScope).catch(() => null),
        hrApi.getPerformanceDashboard(user?.accessToken, user?.tokenType, {}).catch(() => null),
      ]);
      if (dashRes.status) setData(dashRes.data);
      if (assetRes?.status) setAssets(assetRes.data);
      if (perfRes?.status) setPerformance(perfRes.data);
    } catch (err) {
      toast.error(err.message || "Failed to load HR dashboard");
    } finally {
      setLoading(false);
    }
    // companyScope is what the request actually reads. It is memoised in
    // CompanyContext on [companyId, activeUnit] — the same inputs scopeKey is
    // built from — so depending on it directly is stable and cannot loop.
  }, [user, companyScope]);

  useEffect(() => { if (user?.accessToken) load(); }, [load]);

  const exportSummary = () => {
    const rows = Object.entries(cards).map(([key, value]) => ({
      Metric: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      Value: value,
    }));
    downloadCSV(rows, "hr-dashboard-summary");
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
        <SkeletonTable rows={6} />
      </div>
    );
  }

  const cards = data?.cards || {};
  const funnelData = Object.entries(data?.charts?.hiring_funnel || {}).map(([stage, count]) => ({
    stage: STAGE_LABELS[stage] || stage,
    count,
  }));
  const growthTrend = (data?.charts?.employee_growth || []).map((g, i) => ({
    month: g.month,
    joiners: g.count,
    resignations: data?.charts?.attrition_trend?.[i]?.count ?? 0,
  }));
  return (
    <div className="space-y-6">
      {/* ── Premium header ── */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">HR Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {greeting()}{user?.name ? `, ${user.name.split(" ")[0]}` : ""} — {new Date().toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={load}
            title="Refresh"
            className="p-2 rounded-xl border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-brand-600 hover:border-brand-300 dark:hover:border-brand-700 bg-white dark:bg-gray-800 transition-colors"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={exportSummary}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 hover:border-brand-300 dark:hover:border-brand-700 hover:text-brand-600 transition-colors"
          >
            <Download size={15} /> Export
          </button>
          <Link
            to="/admin/employees/add"
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-gradient-to-br from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 shadow-sm transition-colors"
          >
            <Plus size={16} /> Add Employee
          </Link>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <Lift><StatCard title="Total Employees" value={cards.total_employees ?? "—"} icon={<Users size={22} />} color="blue" /></Lift>
        <Lift><StatCard title="Active Employees" value={cards.active_employees ?? "—"} icon={<UserCheck size={22} />} color="green" /></Lift>
        <Lift><StatCard title="New Joiners (30d)" value={cards.new_joiners ?? "—"} icon={<UserPlus size={22} />} color="purple" /></Lift>
        <Lift><StatCard title="On Notice Period" value={cards.employees_on_notice_period ?? "—"} icon={<FileClock size={22} />} color="yellow" /></Lift>
        <Lift><StatCard title="Pending Approvals" value={cards.pending_approvals ?? "—"} icon={<ClipboardList size={22} />} color="red" /></Lift>
        <Lift><StatCard title="Open Job Positions" value={cards.open_job_positions ?? "—"} icon={<Briefcase size={22} />} color="blue" /></Lift>
        <Lift><StatCard title="Interviews Today" value={cards.interviews_today ?? "—"} icon={<CalendarDays size={22} />} color="green" /></Lift>
        <Lift><StatCard title="Assets Pending Allocation" value={cards.assets_pending_allocation ?? "—"} icon={<Laptop size={22} />} color="purple" /></Lift>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard title="Hiring Pipeline" subtitle="Candidates currently at each stage" icon={<TrendingUp size={16} />}>
            <div className="h-72">
              {funnelData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                    <YAxis type="category" dataKey="stage" width={120} tick={{ fontSize: 12, fill: "#6b7280" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="count" fill="#2563eb" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart text="No candidates yet" /> }
            </div>
          </SectionCard>

          <SectionCard title="Employee Growth vs Attrition" subtitle="Last 6 months" icon={<BarChart3 size={16} />}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={growthTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb" }} />
                  <Legend />
                  <Bar dataKey="joiners" name="Joiners" fill="#10b981" radius={[6, 6, 0, 0]} barSize={22} />
                  <Line type="monotone" dataKey="resignations" name="Resignations" stroke="#ef4444" strokeWidth={2.5} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Assets + Performance snapshots — real aggregates, one card each */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SectionCard title="Assets Overview" icon={<Laptop size={16} />} action={<Link to="/admin/hr/assets" className="text-xs font-semibold text-brand-600 hover:underline">View all</Link>}>
              {assets ? (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Assigned" value={assets.assigned} icon={<PackageCheck size={16} />} tone="blue" />
                  <MiniStat label="Available" value={assets.available} icon={<PackageCheck size={16} />} tone="green" />
                  <MiniStat label="Damaged" value={assets.damaged} icon={<AlertTriangle size={16} />} tone="yellow" />
                  <MiniStat label="Lost" value={assets.lost} icon={<PackageX size={16} />} tone="red" />
                </div>
              ) : <EmptyChart text="No asset data yet" compact /> }
            </SectionCard>

            <SectionCard title="Performance Snapshot" icon={<Award size={16} />} action={<Link to="/admin/hr/performance" className="text-xs font-semibold text-brand-600 hover:underline">View matrix</Link>}>
              {performance ? (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Top Performers" value={performance.cards?.top_performers} icon={<Award size={16} />} tone="green" />
                  <MiniStat label="Needs Attention" value={performance.cards?.low_performers} icon={<AlertTriangle size={16} />} tone="red" />
                  <MiniStat label="Avg Rating" value={performance.cards?.average_rating ?? "—"} icon={<Star size={16} />} tone="yellow" />
                  <MiniStat label="Promotion Ready" value={performance.cards?.promotion_eligible} icon={<TrendingUp size={16} />} tone="blue" />
                </div>
              ) : <EmptyChart text="No reviews yet" compact /> }
            </SectionCard>
          </div>

          {/* Honest placeholders — these aren't tracked anywhere in the app yet */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <PlaceholderCard
              icon={<CalendarClock size={22} />}
              title="Today's Attendance"
              text="Live present / absent / late breakdown isn't wired into this dashboard yet — the full picture is in the Attendance module."
              linkTo="/admin/attendance"
              linkLabel="Open Attendance"
            />
            <PlaceholderCard
              icon={<LogOut size={22} />}
              title="Leave Overview"
              text="This HRMS doesn't have a leave-request system yet, so there's nothing real to show here — this card will populate once one exists."
            />
          </div>
        </div>

        {/* ── Side column ── */}
        <div className="space-y-6">
          <SectionCard title="Quick Actions">
            <div className="grid grid-cols-2 gap-2.5">
              <QuickAction to="/admin/hr/hiring" icon={<Briefcase size={18} />} label="New Requisition" />
              <QuickAction to="/admin/hr/hiring" icon={<UsersRound size={18} />} label="Add Candidate" />
              <QuickAction to="/admin/hr/hiring" icon={<CalendarDays size={18} />} label="Schedule Interview" />
              <QuickAction to="/admin/hr/assets" icon={<Laptop size={18} />} label="Allocate Asset" />
              <QuickAction to="/admin/attendance" icon={<CalendarClock size={18} />} label="Attendance" />
              <QuickAction to="/admin/salary" icon={<Wallet size={18} />} label="Payroll" />
              <QuickAction to="/admin/hr/performance" icon={<Award size={18} />} label="Performance" />
              <QuickAction to="/admin/hr/reports" icon={<FileBarChart size={18} />} label="HR Reports" />
            </div>
          </SectionCard>

          <div className="bg-gradient-to-br from-brand-600 to-indigo-700 rounded-2xl p-6 shadow-sm text-white">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles size={18} />
              <h3 className="text-base font-bold">AI Insights</h3>
              <Badge variant="yellow" className="ml-auto">Preview</Badge>
            </div>
            <p className="text-sm text-white/85">
              AI-powered resume matching, attrition prediction and hiring recommendations are on the roadmap.
              This card is a placeholder — no predictions are generated yet.
            </p>
          </div>

          <SectionCard title="Pending Tasks">
            {(!data?.pending_tasks || data.pending_tasks.length === 0) ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Nothing pending 🎉</p>
            ) : (
              <div className="space-y-1.5">
                {data.pending_tasks.slice(0, 6).map((t, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700/40">
                    <span className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center flex-shrink-0">
                      <Clock size={14} className="text-amber-600 dark:text-amber-400" />
                    </span>
                    <span className="text-gray-700 dark:text-gray-200 truncate">{t.text}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard title="Recent Activities">
            {(!data?.recent_activities || data.recent_activities.length === 0) ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No recent activity</p>
            ) : (
              <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
                {data.recent_activities.map((a, i) => {
                  const meta = ACTIVITY_META[a.type] || ACTIVITY_META.candidate;
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="flex items-start gap-2.5 px-1 py-2.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${meta.color}18` }}>
                        <Icon size={14} style={{ color: meta.color }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-gray-700 dark:text-gray-200 leading-snug">{a.text}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{timeAgo(a.at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── Small building blocks ─────────────────── */

/** Subtle hover-lift wrapper — kept separate from StatCard so the shared
 *  component (used elsewhere in the app) doesn't need to change. */
function Lift({ children }) {
  return <div className="transition-transform duration-200 hover:-translate-y-0.5">{children}</div>;
}

function SectionCard({ title, subtitle, icon, action, compact, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-6 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className={`font-bold text-gray-900 dark:text-white flex items-center gap-2 ${compact ? "text-base" : "text-lg"}`}>
            {icon && <span className="text-brand-600 dark:text-brand-400">{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function MiniStat({ label, value, icon, tone }) {
  const tones = {
    blue: "text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20",
    green: "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20",
    yellow: "text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20",
    red: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20",
  };
  return (
    <div className="rounded-xl border border-gray-100 dark:border-gray-700 p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${tones[tone] || tones.blue}`}>{icon}</div>
      <p className="text-lg font-bold text-gray-900 dark:text-white">{value ?? "—"}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function PlaceholderCard({ icon, title, text, linkTo, linkLabel }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-6 flex flex-col items-center text-center">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 mb-3">{icon}</div>
      <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">{title}</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{text}</p>
      {linkTo && (
        <Link to={linkTo} className="text-xs font-semibold text-brand-600 hover:underline">{linkLabel}</Link>
      )}
    </div>
  );
}

function EmptyChart({ text, compact }) {
  return (
    <div className={`flex items-center justify-center ${compact ? "h-40" : "h-full"} text-sm text-gray-400 dark:text-gray-500`}>
      {text}
    </div>
  );
}

function QuickAction({ to, icon, label }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-4 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50/50 dark:bg-gray-900/20 hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 hover:-translate-y-0.5 transition-all text-center"
    >
      {icon}
      {label}
    </Link>
  );
}

