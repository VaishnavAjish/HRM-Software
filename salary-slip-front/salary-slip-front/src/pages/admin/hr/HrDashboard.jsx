import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Users,
  UserCheck,
  UserPlus,
  Clock,
  ClipboardList,
  Briefcase,
  CalendarDays,
  Laptop,
  FileClock,
  Cake,
  PartyPopper,
  Sparkles,
  Plus,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { StatCard } from "../../../components/ui/Card";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7", "#64748b"];

const STAGE_LABELS = {
  applied: "Applied", screening: "Screening", shortlisted: "Shortlisted",
  hr_interview: "HR Interview", technical_interview: "Technical Interview",
  final_interview: "Final Interview", selected: "Selected", offer_sent: "Offer Sent",
  offer_accepted: "Offer Accepted", rejected: "Rejected", on_hold: "On Hold",
};

export default function HrDashboard() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await hrApi.getDashboard(user?.accessToken, user?.tokenType, companyScope);
        if (!cancelled && res.status) setData(res.data);
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Failed to load HR dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (user?.accessToken) load();
    return () => { cancelled = true; };
  }, [user, scopeKey]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton h-24 rounded-xl" />
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
  const deptData = (data?.charts?.department_distribution || []).map((d) => ({ name: d.department, value: d.total }));
  const genderData = (data?.charts?.gender_diversity || []).map((d) => ({ name: d.gender, value: d.total }));
  const ageData = data?.charts?.age_distribution || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">HR Dashboard</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">Workforce, hiring and asset overview at a glance</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Total Employees" value={cards.total_employees ?? "—"} icon={<Users size={22} />} color="blue" />
        <StatCard title="Active Employees" value={cards.active_employees ?? "—"} icon={<UserCheck size={22} />} color="green" />
        <StatCard title="New Joiners (30d)" value={cards.new_joiners ?? "—"} icon={<UserPlus size={22} />} color="purple" />
        <StatCard title="On Notice Period" value={cards.employees_on_notice_period ?? "—"} icon={<FileClock size={22} />} color="yellow" />
        <StatCard title="Pending Approvals" value={cards.pending_approvals ?? "—"} icon={<ClipboardList size={22} />} color="red" />
        <StatCard title="Open Job Positions" value={cards.open_job_positions ?? "—"} icon={<Briefcase size={22} />} color="blue" />
        <StatCard title="Interviews Today" value={cards.interviews_today ?? "—"} icon={<CalendarDays size={22} />} color="green" />
        <StatCard title="Assets Pending Allocation" value={cards.assets_pending_allocation ?? "—"} icon={<Laptop size={22} />} color="purple" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Hiring Funnel</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Candidates currently at each pipeline stage</p>
            <div className="h-72">
              {funnelData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={funnelData} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                    <YAxis type="category" dataKey="stage" width={120} tick={{ fontSize: 12, fill: "#6b7280" }} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                    <Bar dataKey="count" fill="#6366f1" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">No candidates yet</div>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Employee Growth vs Attrition</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">Last 6 months</p>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={growthTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                  <Legend />
                  <Line type="monotone" dataKey="joiners" name="Joiners" stroke="#22c55e" strokeWidth={3} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="resignations" name="Resignations" stroke="#ef4444" strokeWidth={3} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Department Distribution</h3>
              <MiniPie data={deptData} />
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Gender Diversity</h3>
              <MiniPie data={genderData} />
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Age Distribution</h3>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ageData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                  <XAxis dataKey="band" tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
                  <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              <QuickAction to="/admin/hr/hiring" icon={<Plus size={16} />} label="New Requisition" />
              <QuickAction to="/admin/hr/hiring" icon={<Users size={16} />} label="Add Candidate" />
              <QuickAction to="/admin/hr/hiring" icon={<CalendarDays size={16} />} label="Schedule Interview" />
              <QuickAction to="/admin/hr/assets" icon={<Laptop size={16} />} label="Allocate Asset" />
            </div>
          </div>

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

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Pending Tasks</h3>
            <div className="space-y-2">
              {(!data?.pending_tasks || data.pending_tasks.length === 0) && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Nothing pending 🎉</p>
              )}
              {(data?.pending_tasks || []).slice(0, 6).map((t, i) => (
                <div key={i} className="flex items-center gap-2 text-sm px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                  <Clock size={14} className="text-amber-500 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-200 truncate">{t.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Recent Activities</h3>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {(!data?.recent_activities || data.recent_activities.length === 0) && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">No recent activity</p>
              )}
              {(data?.recent_activities || []).map((a, i) => (
                <div key={i} className="text-sm text-gray-600 dark:text-gray-300 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-700/40">
                  {a.text}
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <h3 className="text-base font-bold text-gray-900 dark:text-white mb-4">Upcoming Birthdays &amp; Anniversaries</h3>
            <div className="space-y-2">
              {(data?.upcoming_birthdays || []).map((b) => (
                <div key={`b-${b.id}`} className="flex items-center gap-2 text-sm">
                  <Cake size={14} className="text-pink-500 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-200 truncate">{b.name}</span>
                  <span className="ml-auto text-xs text-gray-400">{b.date}</span>
                </div>
              ))}
              {(data?.upcoming_anniversaries || []).map((a) => (
                <div key={`a-${a.id}`} className="flex items-center gap-2 text-sm">
                  <PartyPopper size={14} className="text-amber-500 flex-shrink-0" />
                  <span className="text-gray-700 dark:text-gray-200 truncate">{a.name}</span>
                  <span className="ml-auto text-xs text-gray-400">{a.date}</span>
                </div>
              ))}
              {(!data?.upcoming_birthdays?.length && !data?.upcoming_anniversaries?.length) && (
                <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">Nothing in the next 30 days</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickAction({ to, icon, label }) {
  return (
    <Link
      to={to}
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-3 text-xs font-medium text-gray-600 dark:text-gray-300 hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-900/20 hover:text-brand-700 dark:hover:text-brand-400 transition-colors text-center"
    >
      {icon}
      {label}
    </Link>
  );
}

function MiniPie({ data }) {
  if (!data.length) {
    return <div className="flex items-center justify-center h-40 text-sm text-gray-500 dark:text-gray-400">No data</div>;
  }
  return (
    <>
      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={3} dataKey="value">
              {data.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={{ borderRadius: 12, border: "none" }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-1.5 mt-2">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-1.5 min-w-0">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
            <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{d.name}</span>
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </>
  );
}
