import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Users, UserCheck, UserPlus, Briefcase, CalendarDays, Laptop,
  FileClock, UserPlus2, FileText, Star, Award, PackageCheck, PackageX,
  AlertTriangle, CalendarClock, LogOut, BarChart3, TrendingUp,
  ClipboardList, FileBarChart, CalendarCheck, CalendarOff,
  ListChecks, Video,
} from "lucide-react";
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, BarChart, PieChart, Pie, Cell,
} from "recharts";
import { StatCard } from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi, salaryApi } from "../../../utils/api";
import { downloadCSV } from "../../../utils/exportUtils";
import { resolveCompanyScope } from "../../../config/companyConfig";

// Validated categorical palette (dataviz skill: fixed hue order, adjacent-pair
// CVD ΔE 9.1 — passes with the direct legend labels rendered alongside every
// slice as the required secondary encoding). Gray is reserved for the
// overflow "Other" bucket only, never a real department.
const DEPT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300"];
const DEPT_OTHER_COLOR = "#94a3b8";
const MAX_DEPT_SLICES = 6;

const TONES = {
  blue: "text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20",
  green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
  yellow: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
  red: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20",
};

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
  const [onboarding, setOnboarding] = useState(null);
  const [pendingReviews, setPendingReviews] = useState(null);
  const [upcomingInterviews, setUpcomingInterviews] = useState(null);
  const [attendanceToday, setAttendanceToday] = useState(null);
  const [overviewTab, setOverviewTab] = useState("trend");

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

      const { companyId, unit } = resolveCompanyScope(companyScope);
      const now = new Date();

      const [onboardingRes, reviewsRes, interviewsRes, attendanceRes] = await Promise.all([
        hrApi.getOnboardingDashboard(user?.accessToken, user?.tokenType).catch(() => null),
        perfRes?.data?.cycle_id
          ? hrApi.getPerformanceReviews(user?.accessToken, user?.tokenType, {
              cycle_id: perfRes.data.cycle_id, review_type: "manager",
            }).catch(() => null)
          : Promise.resolve(null),
        hrApi.getInterviews(user?.accessToken, user?.tokenType, { status: "scheduled", per_page: 20 }).catch(() => null),
        salaryApi.getAttendanceGrid(user?.accessToken, user?.tokenType, {
          companyId, unit, month: now.getMonth() + 1, year: now.getFullYear(),
        }).catch(() => null),
      ]);

      if (onboardingRes?.status) setOnboarding(onboardingRes.data);

      if (reviewsRes?.status && Array.isArray(reviewsRes.data)) {
        setPendingReviews(reviewsRes.data.filter((r) => r.status === "draft").length);
      }

      if (interviewsRes?.status) {
        const nowMs = Date.now();
        const upcoming = (interviewsRes.data?.data || [])
          .filter((iv) => iv.scheduled_at && new Date(iv.scheduled_at).getTime() >= nowMs)
          .sort((a, b) => new Date(a.scheduled_at) - new Date(b.scheduled_at))
          .slice(0, 5);
        setUpcomingInterviews(upcoming);
      }

      if (attendanceRes?.status) {
        const key = todayKey();
        const { employees, attendance } = attendanceRes.data;
        const counts = { present: 0, absent: 0, half_day: 0, leave: 0, unmarked: 0 };
        (employees || []).forEach((e) => {
          const status = attendance?.[e.emp_code]?.[key];
          if (status && Object.prototype.hasOwnProperty.call(counts, status)) counts[status]++;
          else counts.unmarked++;
        });
        setAttendanceToday({ ...counts, total: (employees || []).length });
      }
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

  const rawDept = data?.charts?.department_distribution || [];
  const deptTotal = rawDept.reduce((sum, d) => sum + Number(d.total), 0);
  const sortedDept = [...rawDept].sort((a, b) => Number(b.total) - Number(a.total));
  const otherDeptTotal = sortedDept.slice(MAX_DEPT_SLICES).reduce((sum, d) => sum + Number(d.total), 0);
  const departmentData = [
    ...sortedDept.slice(0, MAX_DEPT_SLICES).map((d, i) => ({
      department: d.department, total: Number(d.total), color: DEPT_COLORS[i % DEPT_COLORS.length],
    })),
    ...(otherDeptTotal > 0 ? [{ department: "Other", total: otherDeptTotal, color: DEPT_OTHER_COLOR }] : []),
  ].map((d) => ({ ...d, pct: deptTotal ? Math.round((d.total / deptTotal) * 100) : 0 }));

  const pendingTasksList = data?.pending_tasks || [];
  const docsPending = onboarding?.kpis?.find((k) => k.key === "docs_pending")?.value;
  const onboardingPending = onboarding?.kpis?.find((k) => k.key === "pending_onboarding")?.value;
  const taskRows = [
    {
      key: "approvals", label: "Pending Approvals", to: "/admin/hr/hiring", icon: ClipboardList,
      count: data ? pendingTasksList.filter((t) => t.type === "requisition_approval" || t.type === "offer_approval").length : null,
    },
    {
      key: "feedback", label: "Interview Feedback Pending", to: "/admin/hr/hiring", icon: CalendarClock,
      count: data ? pendingTasksList.filter((t) => t.type === "interview_feedback").length : null,
    },
    { key: "docs", label: "Documents To Verify", to: "/admin/hr/onboarding", icon: FileText, count: docsPending ?? null },
    { key: "onboarding", label: "Onboarding In Progress", to: "/admin/hr/onboarding", icon: UserPlus2, count: onboardingPending ?? null },
    { key: "reviews", label: "Performance Reviews Pending", to: "/admin/hr/performance", icon: Award, count: pendingReviews },
  ].filter((r) => r.count !== null && r.count !== undefined);

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

      <SectionCard title="Hiring Funnel" subtitle="Candidates currently in recruitment stages" icon={<TrendingUp size={18} />}>
        <div className="h-72">
          {funnelData.length ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
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

      {/* ── Row: Workforce Overview + Recent Activity ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2">
          <SectionCard
            title="Workforce Overview"
            subtitle={overviewTab === "trend" ? "Net Joiners vs Resignations (6-Month Trend)" : "Headcount by department"}
            icon={<BarChart3 size={18} />}
            action={
              <div className="flex gap-1 rounded-lg bg-gray-100 dark:bg-gray-800 p-1">
                <TabButton active={overviewTab === "trend"} onClick={() => setOverviewTab("trend")}>Trend</TabButton>
                <TabButton active={overviewTab === "department"} onClick={() => setOverviewTab("department")}>Departments</TabButton>
              </div>
            }
          >
            <div className="h-72">
              {overviewTab === "trend" ? (
                <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
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
              ) : departmentData.length ? (
                <div className="flex h-full items-center gap-6">
                  <div className="w-1/2 h-full">
                    <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
                      <PieChart>
                        <Pie data={departmentData} dataKey="total" nameKey="department" innerRadius="55%" outerRadius="82%" paddingAngle={2} stroke="none">
                          {departmentData.map((d) => <Cell key={d.department} fill={d.color} />)}
                        </Pie>
                        <Tooltip
                          contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }}
                          formatter={(value, _name, entry) => [`${value} (${entry.payload.pct}%)`, entry.payload.department]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="flex-1 space-y-2 text-xs max-h-64 overflow-y-auto pr-1">
                    {departmentData.map((d) => (
                      <li key={d.department} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 truncate text-gray-700 dark:text-gray-300">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                          <span className="truncate">{d.department}</span>
                        </span>
                        <span className="font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">
                          {d.total} <span className="text-gray-400 font-normal">({d.pct}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : <EmptyChart text="No department data available" /> }
            </div>
          </SectionCard>
        </div>

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

      {/* ── Row: Attendance / Leave / Performance / Assets ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6">
        <SectionCard title="Attendance Today" icon={<CalendarCheck size={18} />} action={<Link to="/admin/attendance" className="text-xs font-bold text-brand-600 hover:underline">View →</Link>}>
          {attendanceToday && attendanceToday.total > 0 ? (
            <div className="flex items-center gap-4">
              <div className="relative w-16 h-16 flex-shrink-0">
                <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
                  <circle cx="18" cy="18" r="15.5" pathLength="100" fill="none" stroke="#e5e7eb" strokeWidth="4" />
                  <circle
                    cx="18" cy="18" r="15.5" pathLength="100" fill="none" stroke="#10b981" strokeWidth="4" strokeLinecap="round"
                    strokeDasharray={`${Math.round((attendanceToday.present / attendanceToday.total) * 100)} 100`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xs font-bold text-gray-900 dark:text-white">
                    {Math.round((attendanceToday.present / attendanceToday.total) * 100)}%
                  </span>
                </div>
              </div>
              <div className="flex-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
                <StatRow label="Present" value={attendanceToday.present} tone="green" />
                <StatRow label="Absent" value={attendanceToday.absent} tone="red" />
                <StatRow label="On Leave" value={attendanceToday.leave} tone="blue" />
                <StatRow label="Half Day" value={attendanceToday.half_day} tone="yellow" />
              </div>
            </div>
          ) : <EmptyChart text="No attendance recorded for today" compact /> }
        </SectionCard>

        <SectionCard title="Leave Overview" icon={<CalendarOff size={18} />}>
          <div className="flex flex-col items-center justify-center text-center py-4 gap-2">
            <CalendarOff size={20} className="text-gray-300 dark:text-gray-600" />
            <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Leave Management isn't set up yet</p>
            <p className="text-[10px] text-gray-400 dark:text-gray-500 max-w-[180px]">This widget will populate once that module exists.</p>
          </div>
        </SectionCard>

        <SectionCard title="Performance Snapshot" icon={<Award size={18} />} action={<Link to="/admin/hr/performance" className="text-xs font-bold text-brand-600 hover:underline">View →</Link>}>
          {performance ? (
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Top Performers" value={performance.cards?.top_performers} icon={<Award size={16} />} tone="green" />
              <MiniStat label="Needs Attention" value={performance.cards?.low_performers} icon={<AlertTriangle size={16} />} tone="red" />
              <MiniStat label="Avg Rating" value={performance.cards?.average_rating ?? "—"} icon={<Star size={16} />} tone="yellow" />
              <MiniStat label="Promotion Ready" value={performance.cards?.promotion_eligible} icon={<TrendingUp size={16} />} tone="blue" />
            </div>
          ) : <EmptyChart text="No performance records" compact /> }
        </SectionCard>

        <SectionCard title="Assets Overview" icon={<Laptop size={18} />} action={<Link to="/admin/hr/assets" className="text-xs font-bold text-brand-600 hover:underline">View →</Link>}>
          {assets ? (
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Assigned" value={assets.assigned} icon={<PackageCheck size={16} />} tone="blue" />
              <MiniStat label="Available" value={assets.available} icon={<PackageCheck size={16} />} tone="green" />
              <MiniStat label="Damaged" value={assets.damaged} icon={<AlertTriangle size={16} />} tone="yellow" />
              <MiniStat label="Lost" value={assets.lost} icon={<PackageX size={16} />} tone="red" />
            </div>
          ) : <EmptyChart text="No asset data available" compact /> }
        </SectionCard>
      </div>

      {/* ── Row: My Tasks / Upcoming Interviews / HR Shortcuts ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <SectionCard title="My Tasks" subtitle="What needs your attention" icon={<ListChecks size={18} />}>
          {taskRows.length === 0 ? (
            <EmptyChart text="Task data unavailable" compact />
          ) : (
            <div className="space-y-1">
              {taskRows.map((r) => {
                const Icon = r.icon;
                return (
                  <Link key={r.key} to={r.to} className="flex items-center justify-between gap-2 rounded-xl px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition">
                    <span className="flex items-center gap-2.5 text-xs font-medium text-gray-700 dark:text-gray-300">
                      <Icon size={15} className="text-gray-400 flex-shrink-0" />
                      {r.label}
                    </span>
                    <span className={`text-[11px] font-bold rounded-full px-2 py-0.5 flex-shrink-0 ${r.count > 0 ? "bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-400" : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500"}`}>
                      {r.count}
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Upcoming Interviews" icon={<Video size={18} />} action={<Link to="/admin/hr/hiring" className="text-xs font-bold text-brand-600 hover:underline">View hiring →</Link>}>
          {upcomingInterviews === null ? (
            <EmptyChart text="Interview data unavailable" compact />
          ) : upcomingInterviews.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-6">No upcoming interviews scheduled</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {upcomingInterviews.map((iv) => (
                <div key={iv.id} className="rounded-xl border border-gray-100 dark:border-gray-800 p-2.5">
                  <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{iv.candidate?.name || "Candidate"}</p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{iv.requisition?.title || iv.round_name || "Interview"}</p>
                  <p className="text-[11px] text-brand-600 dark:text-brand-400 font-medium mt-1">
                    {new Date(iv.scheduled_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="HR Shortcuts">
          <div className="grid grid-cols-2 gap-3">
            <QuickAction to="/admin/hr/hiring" icon={<Briefcase size={18} />} label="Hiring Funnel" />
            <QuickAction to="/admin/hr/onboarding" icon={<UserPlus2 size={18} />} label="Onboarding" />
            <QuickAction to="/admin/hr/assets" icon={<Laptop size={18} />} label="IT Assets" />
            <QuickAction to="/admin/hr/performance" icon={<Award size={18} />} label="Performance" />
            <QuickAction to="/admin/hr/exit" icon={<LogOut size={18} />} label="Exit Desk" />
            <QuickAction to="/admin/hr/reports" icon={<FileBarChart size={18} />} label="HR Reports" />
            <QuickAction to="/admin/employees/add" icon={<UserPlus size={18} />} label="Add Employee" />
          </div>
        </SectionCard>
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
  return (
    <div className="rounded-2xl border border-gray-100 dark:border-gray-800 p-3 bg-gray-50/40 dark:bg-gray-800/40">
      <div className={`w-8 h-8 rounded-xl flex items-center justify-center mb-2 ${TONES[tone] || TONES.blue}`}>{icon}</div>
      <p className="text-base font-bold text-gray-900 dark:text-white">{value ?? "—"}</p>
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function StatRow({ label, value, tone }) {
  const dotTone = {
    blue: "bg-brand-500", green: "bg-emerald-500", yellow: "bg-amber-500", red: "bg-rose-500",
  };
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotTone[tone] || dotTone.blue}`} />
      <span className="text-gray-500 dark:text-gray-400 truncate">{label}</span>
      <span className="font-bold text-gray-900 dark:text-white ml-auto">{value ?? "—"}</span>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition ${
        active
          ? "bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-xs"
          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
      }`}
    >
      {children}
    </button>
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
