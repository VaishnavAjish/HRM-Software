import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { downloadCSV } from "../../../utils/exportUtils";
import { StatCard } from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";

const DEPT_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#9b59b6", "#e74c3c"];
const DEPT_OTHER_COLOR = "#94a3b8";
const MAX_DEPT_SLICES = 6;

const STAGE_ORDER = ['applied', 'screening', 'shortlisted', 'assessment', 'interview', 'selected', 'offer_sent', 'offer_accepted', 'rejected', 'on_hold'];
const STAGE_LABELS = {
  applied: "Applied", screening: "Screening", shortlisted: "Shortlisted",
  assessment: "Assessment", interview: "Interview", selected: "Selected",
  offer_sent: "Offer Sent", offer_accepted: "Offer Accepted", rejected: "Rejected", on_hold: "On Hold",
};

const ACTIVITY_META = {
  candidate: { icon: 'Users', color: "#6366f1" },
  interview: { icon: 'CalendarClock', color: "#0ea5e9" },
  offer: { icon: 'FileText', color: "#22c55e" },
  requisition_approval: { icon: 'Briefcase', color: "#f59e0b" },
  offer_approval: { icon: 'FileText', color: "#22c55e" },
  interview_feedback: { icon: 'MessageSquare', color: "#0ea5e9" },
};

const TONES = {
  blue: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20",
  green: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20",
  yellow: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20",
  red: "text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20",
  purple: "text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20",
  orange: "text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20",
};

const CARD_GROUPS = [
  { key: 'open_requisitions', label: 'Open Requisitions', tone: 'blue', icon: 'Briefcase' },
  { key: 'open_positions', label: 'Open Positions', tone: 'blue', icon: 'Target' },
  { key: 'total_candidates', label: 'Total Candidates', tone: 'purple', icon: 'Users' },
  { key: 'candidates_this_month', label: 'Candidates This Month', tone: 'purple', icon: 'UserPlus' },
  { key: 'active_candidates', label: 'Active Candidates', tone: 'green', icon: 'UserCheck' },
  { key: 'candidates_in_interview', label: 'In Interview', tone: 'blue', icon: 'CalendarClock' },
  { key: 'offers_pending', label: 'Offers Pending', tone: 'yellow', icon: 'FileText' },
  { key: 'offers_sent', label: 'Offers Sent', tone: 'yellow', icon: 'Send' },
  { key: 'offers_accepted_this_month', label: 'Accepted This Month', tone: 'green', icon: 'CheckCircle2' },
  { key: 'interviews_today', label: 'Interviews Today', tone: 'blue', icon: 'CalendarClock' },
  { key: 'interviews_this_week', label: 'Interviews This Week', tone: 'blue', icon: 'Calendar' },
  { key: 'interviews_pending_feedback', label: 'Pending Feedback', tone: 'red', icon: 'AlertTriangle' },
  { key: 'offers_expiring_soon', label: 'Offers Expiring', tone: 'orange', icon: 'AlertTriangle' },
  { key: 'bgv_pending', label: 'BGV Pending', tone: 'orange', icon: 'AlertTriangle' },
  { key: 'joining_this_month', label: 'Joining This Month', tone: 'green', icon: 'CalendarCheck' },
  { key: 'time_to_fill_avg_days', label: 'Avg Time to Fill (days)', tone: 'blue', icon: 'TrendingUp' },
  { key: 'time_to_hire_avg_days', label: 'Avg Time to Hire (days)', tone: 'purple', icon: 'TrendingUp' },
  { key: 'offer_acceptance_rate', label: 'Offer Acceptance %', tone: 'green', icon: 'TrendingUp' },
  { key: 'joining_rate', label: 'Joining Rate %', tone: 'green', icon: 'TrendingUp' },
];

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Math.max(0, (Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatMonth(monthStr) {
  if (!monthStr) return "";
  const [y, m] = monthStr.split("-").map(Number);
  return new Date(y, (m || 1) - 1, 1).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

function formatCurrency(value) {
  if (value === undefined || value === null) return "—";
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value);
}

function KpiCard({ key, label, value, tone, icon: Icon }) {
  const IconComp = Icons[icon] || Users;
  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-slate-700 p-4 ${TONES[tone]} shadow-sm`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value !== undefined && value !== null ? value : "—"}</p>
        </div>
        <div className={`p-2 rounded-xl ${TONES[tone].replace('text-', 'bg-').replace('dark:text-', 'dark:bg-').replace('bg-', 'bg-opacity-20 ')}`}>
          <IconComp size={20} />
        </div>
      </div>
    </div>
  );
}

const Icons = {
  Users, Briefcase, Target, TrendingUp, TrendingDown, Clock, CheckCircle2, XCircle,
  BarChart3, DollarSign, UserCheck, PackageSearch, Award, Flag, Search,
CalendarClock, Send, UserPlus, AlertTriangle, Star, Eye, ExternalLink,
  Calendar, CalendarCheck,
};

export default function RecruitmentDashboard() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const { can } = useAuthorization();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await hrApi.getDashboard(user?.accessToken, user?.tokenType, {});
      if (res.status) setData(res.data);
      else console.error(res.message || "Failed to load recruitment dashboard");
    } catch (err) {
      console.error(err.message || "Failed to load recruitment dashboard");
    } finally {
      setLoading(false);
    }
  }, [user, companyScope]);

  const reload = useCallback(() => {
    setRefreshKey(k => k + 1);
    load();
  }, [load]);

  useEffect(() => {
    if (user?.accessToken) load();
  }, [load, user]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 animate-pulse">
              <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-700 rounded mb-2"></div>
              <div className="h-8 w-1/2 bg-slate-200 dark:bg-slate-700 rounded"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const cards = data?.cards || {};

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="sticky top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 py-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Recruitment Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Real-time hiring metrics, funnel analytics & recruiter performance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={reload} size="sm">
              <RefreshCw size={16} className="mr-1" /> Refresh
            </Button>
            <Button onClick={exportSummary} size="sm">
              <Download size={16} className="mr-1" /> Export
            </Button>
          </div>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {CARD_GROUPS.map(({ key, label, tone, icon }) => (
            <KpiCard key={key} label={label} value={cards[key] !== undefined ? (typeof cards[key] === 'number' ? cards[key].toLocaleString() : cards[key]) : "—"} tone={tone} icon={icon} />
          ))}
        </div>

{activeTab === "overview" && (
          <>
            <Card className="border-rose-200 dark:border-rose-800">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={20} className="text-rose-600 dark:text-rose-400" />
                <h3 className="font-semibold text-slate-900 dark:text-white">Alerts & Attention Required</h3>
              </div>
              <div className="space-y-2">
                {data?.alerts?.length > 0 && (
                  data.alerts.map((alert, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-xl ${
                      alert.severity === 'high' ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800' :
                      alert.severity === 'medium' ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' :
                      'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                    }`}>
                      <div className={`flex-1 min-w-0 ${alert.severity === 'high' ? 'text-rose-700 dark:text-rose-300' : alert.severity === 'medium' ? 'text-amber-700 dark:text-amber-300' : 'text-blue-700 dark:text-blue-300'}`}>
                        <p className="font-medium">{alert.message}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{alert.count} item(s) need attention</p>
</div>
</div>
                   ))
                 )}
               </div>
</Card>
           </>
         )}

        {activeTab === "funnel" && data?.charts?.hiring_funnel && (
          <Card className="col-span-1 lg:col-span-2">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Hiring Funnel</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={data.charts.hiring_funnel} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis type="number" tickFormatter={v => v.toLocaleString()} />
                <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => [value.toLocaleString(), "Candidates"]} />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} maxBarWidth={40} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {activeTab === "sources" && data?.charts?.source_chart && (
          <Card>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Candidates by Source</h3>
            <ResponsiveContainer width="100%" height={350}>
              <PieChart>
                <Pie
                  data={data.charts.source_chart}
                  cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2}
                  dataKey="total" nameKey="source"
                  label={({ source, total, percent }) => `${source}: ${total} (${(percent * 100).toFixed(0)}%)`}
                  labelLine={false}
                >
                  {data.charts.source_chart.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={DEPT_COLORS[index % DEPT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => [value.toLocaleString(), "Candidates"]} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {activeTab === "recruiters" && data?.charts?.recruiter_performance && (
          <Card className="col-span-1 lg:col-span-2">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Recruiter Performance</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3">Recruiter</th>
                    <th className="px-4 py-3 text-right">Total Candidates</th>
                    <th className="px-4 py-3 text-right">Conversions</th>
                    <th className="px-4 py-3 text-right">Conversion Rate</th>
                    <th className="px-4 py-3 text-right">Avg Time to Hire (days)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.charts.recruiter_performance.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium">{r.recruiter_name}</td>
                      <td className="px-4 py-3 text-right">{r.total_candidates}</td>
                      <td className="px-4 py-3 text-right">{r.conversions}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={r.conversion_rate > 20 ? 'green' : r.conversion_rate > 10 ? 'yellow' : 'red'}>
                          {r.conversion_rate}%
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">{r.avg_time_to_hire ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "departments" && data?.charts?.department_hiring && (
          <Card className="col-span-1 lg:col-span-2">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Department Hiring</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-right">Requisitions</th>
                    <th className="px-4 py-3 text-right">Openings</th>
                    <th className="px-4 py-3 text-right">Filled</th>
                    <th className="px-4 py-3 text-right">Open</th>
                    <th className="px-4 py-3 text-right">Fill Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.charts.department_hiring.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium">{d.department}</td>
                      <td className="px-4 py-3 text-right">{d.total_requisitions}</td>
                      <td className="px-4 py-3 text-right">{d.total_openings}</td>
                      <td className="px-4 py-3 text-right text-green-600">{d.filled}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{d.open}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={d.fill_rate > 80 ? 'green' : d.fill_rate > 50 ? 'yellow' : 'red'}>
                          {d.fill_rate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "alerts" && data?.alerts && (
          <Card className="col-span-1 lg:col-span-2">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Alerts & Attention Required</h3>
            {data.alerts.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 size={48} className="mx-auto text-green-500 mb-3" />
                <p className="text-slate-500 dark:text-slate-400">No alerts at this time. All systems operational.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {data.alerts.map((alert, i) => (
                  <div key={i} className={`flex items-center gap-3 p-4 rounded-xl ${
                    alert.severity === 'high' ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800' :
                    alert.severity === 'medium' ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' :
                    'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                  }`}>
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${alert.severity === 'high' ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600' : alert.severity === 'medium' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'}`}>
                      {alert.severity === 'high' ? <AlertTriangle size={20} /> : alert.severity === 'medium' ? <AlertCircle size={20} /> : <Info size={20} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white">{alert.message}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{alert.count} item(s) need attention</p>
                    </div>
                    <Badge variant={alert.severity === 'high' ? 'red' : alert.severity === 'medium' ? 'yellow' : 'blue'} className="text-xs">
                      {alert.severity.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}

        {activeTab === "recruiters" && data?.charts?.recruiter_workload && (
          <Card className="col-span-1 lg:col-span-2">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Recruiter Workload</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3">Recruiter</th>
                    <th className="px-4 py-3 text-right">Active Candidates</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.charts.recruiter_workload.map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium">{r.recruiter_name}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={r.active_candidates > 20 ? 'red' : r.active_candidates > 10 ? 'yellow' : 'green'}>
                          {r.active_candidates}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {activeTab === "departments" && data?.charts?.department_hiring && (
          <Card className="col-span-1 lg:col-span-2">
            <h3 className="font-semibold text-slate-900 dark:text-white mb-4">Department Hiring</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-3">Department</th>
                    <th className="px-4 py-3 text-right">Requisitions</th>
                    <th className="px-4 py-3 text-right">Openings</th>
                    <th className="px-4 py-3 text-right">Filled</th>
                    <th className="px-4 py-3 text-right">Open</th>
                    <th className="px-4 py-3 text-right">Fill Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                  {data.charts.department_hiring.map((d, i) => (
                    <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="px-4 py-3 font-medium">{d.department}</td>
                      <td className="px-4 py-3 text-right">{d.total_requisitions}</td>
                      <td className="px-4 py-3 text-right">{d.total_openings}</td>
                      <td className="px-4 py-3 text-right text-green-600">{d.filled}</td>
                      <td className="px-4 py-3 text-right text-blue-600">{d.open}</td>
                      <td className="px-4 py-3 text-right">
                        <Badge variant={d.fill_rate > 80 ? 'green' : d.fill_rate > 50 ? 'yellow' : 'red'}>
                          {d.fill_rate}%
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
