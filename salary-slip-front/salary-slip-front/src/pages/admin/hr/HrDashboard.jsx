import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Users, UserCheck, UserPlus, Clock, ClipboardList, Briefcase, CalendarDays, Laptop,
  FileClock, Sparkles, Plus, RefreshCw, Download, TrendingUp,
  UserPlus2, FileText, Star, Award, PackageCheck, PackageX,
  AlertTriangle, CalendarClock, UsersRound, LogOut, BarChart3, FileBarChart, Wallet,
  ChevronRight, ArrowUpRight, Activity
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, BarChart,
} from "recharts";
import { StatCard } from "../../../components/ui/Card";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";
import { downloadCSV } from "../../../utils/exportUtils";

const STAGE_LABELS = {
  applied: "Applied", screening: "Screening", shortlisted: "Shortlisted",
  interview: "Interview", selected: "Selected", offer_sent: "Offer Sent",
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
            <div key={i} className="skeleton h-28 rounded-3xl" />
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
    <div className="space-y-6 pb-12 font-sans text-gray-900 dark:text-gray-100">

      {/* ── KPI Grid (8 Key Metrics) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Lift><StatCard compact title="Total Workforce" value={cards.total_employees ?? "—"} icon={<Users size={20} />} color="blue" /></Lift>
        <Lift><StatCard compact title="Active Employees" value={cards.active_employees ?? "—"} icon={<UserCheck size={20} />} color="green" /></Lift>
        <Lift><StatCard compact title="New Joiners (30d)" value={cards.new_joiners ?? "—"} icon={<UserPlus size={20} />} color="purple" /></Lift>
        <Lift><StatCard compact title="On Notice Period" value={cards.employees_on_notice_period ?? "—"} icon={<FileClock size={20} />} color="yellow" /></Lift>
        <Lift><StatCard compact title="Pending Approvals" value={cards.pending_approvals ?? "—"} icon={<ClipboardList size={20} />} color="red" /></Lift>
        <Lift><StatCard compact title="Open Positions" value={cards.open_job_positions ?? "—"} icon={<Briefcase size={20} />} color="blue" /></Lift>
        <Lift><StatCard compact title="Interviews Today" value={cards.interviews_today ?? "—"} icon={<CalendarDays size={20} />} color="green" /></Lift>
        <Lift><StatCard compact title="Asset Allocations Pending" value={cards.assets_pending_allocation ?? "—"} icon={<Laptop size={20} />} color="purple" /></Lift>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <SectionCard title="Hiring Funnel" subtitle="Candidates currently in recruitment stages" icon={<TrendingUp size={18} />}>
            <div className="h-72">
              {funnelData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                    <YAxis type="category" dataKey="stage" width={120} tick={{ fontSize: 12, fill: "#6b7280" }} />
                    <Tooltip contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }} cursor={{ fill: "#f8fafc" }} />
                    <Bar dataKey="count" fill="#4f46e5" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyChart text="No candidates in hiring funnel" /> }
            </div>
          </SectionCard>

          <SectionCard title="Workforce Dynamics" subtitle="Net Joiners vs Resignations (6-Month Trend)" icon={<BarChart3 size={18} />}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={growthTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <Tooltip contentStyle={{ borderRadius: 16, border: "none" }} />
                  <Legend />
                  <Bar dataKey="joiners" name="Joiners" fill="#10b981" radius={[8, 8, 0, 0]} barSize={24} />
                  <Line type="monotone" dataKey="resignations" name="Resignations" stroke="#ef4444" strokeWidth={3} dot={{ r: 4 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </SectionCard>

          {/* Real Module Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <SectionCard title="Assets Status" icon={<Laptop size={18} />} action={<Link to="/admin/hr/assets" className="text-xs font-bold text-brand-600 hover:underline">View all →</Link>}>
              {assets ? (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Assigned" value={assets.assigned} icon={<PackageCheck size={16} />} tone="blue" />
                  <MiniStat label="Available" value={assets.available} icon={<PackageCheck size={16} />} tone="green" />
                  <MiniStat label="Damaged" value={assets.damaged} icon={<AlertTriangle size={16} />} tone="yellow" />
                  <MiniStat label="Lost" value={assets.lost} icon={<PackageX size={16} />} tone="red" />
                </div>
              ) : <EmptyChart text="No asset data available" compact /> }
            </SectionCard>

            <SectionCard title="Performance Snapshot" icon={<Award size={18} />} action={<Link to="/admin/hr/performance" className="text-xs font-bold text-brand-600 hover:underline">View matrix →</Link>}>
              {performance ? (
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Top Performers" value={performance.cards?.top_performers} icon={<Award size={16} />} tone="green" />
                  <MiniStat label="Needs Attention" value={performance.cards?.low_performers} icon={<AlertTriangle size={16} />} tone="red" />
                  <MiniStat label="Avg Rating" value={performance.cards?.average_rating ?? "—"} icon={<Star size={16} />} tone="yellow" />
                  <MiniStat label="Promotion Ready" value={performance.cards?.promotion_eligible} icon={<TrendingUp size={16} />} tone="blue" />
                </div>
              ) : <EmptyChart text="No performance records" compact /> }
            </SectionCard>
          </div>
        </div>

        {/* ── Quick Launch & Activity Stream Column ── */}
        <div className="space-y-6">
          <SectionCard title="HR Shortcuts">
            <div className="grid grid-cols-2 gap-3">
              <QuickAction to="/admin/hr/hiring" icon={<Briefcase size={18} />} label="Hiring Funnel" />
              <QuickAction to="/admin/hr/onboarding" icon={<UserPlus2 size={18} />} label="Onboarding" />
              <QuickAction to="/admin/hr/assets" icon={<Laptop size={18} />} label="IT Assets" />
              <QuickAction to="/admin/hr/performance" icon={<Award size={18} />} label="Performance" />
              <QuickAction to="/admin/hr/exit" icon={<LogOut size={18} />} label="Exit Desk" />
              <QuickAction to="/admin/hr/reports" icon={<FileBarChart size={18} />} label="HR Reports" />
            </div>
          </SectionCard>

          <SectionCard title="Recent Activity Trail">
            {(!data?.recent_activities || data.recent_activities.length === 0) ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">No recent HR activity</p>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                {data.recent_activities.map((a, i) => {
                  const meta = ACTIVITY_META[a.type] || ACTIVITY_META.candidate;
                  const Icon = meta.icon;
                  return (
                    <div key={i} className="flex items-start gap-3 px-1 py-2.5 border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                      <span className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${meta.color}18` }}>
                        <Icon size={15} style={{ color: meta.color }} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-gray-800 dark:text-gray-200 leading-snug">{a.text}</p>
                        <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(a.at)}</p>
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

function Lift({ children }) {
  return <div className="transition-transform duration-200 hover:-translate-y-0.5">{children}</div>;
}

function SectionCard({ title, subtitle, icon, action, compact, children }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200/80 dark:border-gray-800 shadow-sm p-6 transition-all hover:shadow-md">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div>
          <h3 className={`font-bold text-gray-900 dark:text-white flex items-center gap-2.5 ${compact ? "text-sm" : "text-base"}`}>
            {icon && <span className="text-brand-600 dark:text-brand-400">{icon}</span>}
            {title}
          </h3>
          {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
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
    green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
    yellow: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
    red: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20",
  };
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-3 bg-gray-50/40 dark:bg-gray-800/40">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${tones[tone] || tones.blue}`}>{icon}</div>
      <p className="text-base font-bold text-gray-900 dark:text-white">{value ?? "—"}</p>
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function EmptyChart({ text, compact }) {
  return (
    <div className={`flex items-center justify-center ${compact ? "h-32" : "h-full"} text-xs font-semibold text-gray-400 dark:text-gray-500`}>
      {text}
    </div>
  );
}

function QuickAction({ to, icon, label }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-gray-200/80 dark:border-gray-800 px-3 py-3.5 text-xs font-semibold text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800/50 hover:border-brand-400 hover:bg-brand-50/50 dark:hover:bg-brand-950/30 hover:text-brand-600 dark:hover:text-brand-400 hover:-translate-y-0.5 transition-all text-center shadow-xs"
    >
      <span className="text-brand-600 dark:text-brand-400">{icon}</span>
      {label}
    </Link>
  );
}
