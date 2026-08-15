import { useCallback, useEffect, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";
import {
  Briefcase, Users, CalendarClock, FileSignature, UserCheck, ClipboardList,
  AlertTriangle, Clock, RefreshCw, TrendingUp, CheckCircle2,
} from "lucide-react";
import Badge from "../../../../components/ui/Badge";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { hrApi } from "../../../../utils/api";

const STAGE_LABELS = {
  applied: "Applied", screening: "Screening", shortlisted: "Shortlisted",
  assessment: "Assessment", interview: "Interview", selected: "Selected",
  offer_sent: "Offer Sent", offer_accepted: "Offer Accepted",
  rejected: "Rejected", on_hold: "On Hold",
};

const SOURCE_LABELS = {
  referral: "Referral", job_portal: "Job Portal", linkedin: "LinkedIn",
  walk_in: "Walk-in", google_form: "Google Form", other: "Other",
};

export default function RecruitmentDashboardTab({ onNavigate = () => {} }) {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    if (!user?.accessToken) return;
    setLoading(true);
    setError(false);
    hrApi.getRecruitmentDashboard(user.accessToken, user.tokenType, { ...companyScope })
      .then((res) => { if (res.status) setData(res.data); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  if (loading && !data) return <div className="p-6"><SkeletonTable rows={8} /></div>;

  if (error && !data) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">Unable to load the recruitment dashboard.</p>
        <button onClick={load} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 dark:text-brand-400 hover:underline">
          <RefreshCw size={14} /> Retry
        </button>
      </div>
    );
  }

  const kpis = data?.kpis || {};
  const funnel = (data?.funnel || []).map((f) => ({ ...f, label: STAGE_LABELS[f.stage] || f.stage }));
  const alerts = data?.alerts || {};
  const analytics = data?.analytics || {};
  const alertTotal =
    (alerts.overdue_requisitions?.count || 0) + (alerts.feedback_pending?.count || 0)
    + (alerts.offers_expiring?.count || 0) + (alerts.approvals_waiting?.count || 0)
    + (alerts.joining_overdue?.count || 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
        <KpiTile icon={<Briefcase size={16} />} label="Open Requisitions" value={kpis.open_requisitions} sub={`${kpis.total_openings ?? 0} openings`} onClick={() => onNavigate("requisitions")} />
        <KpiTile icon={<ClipboardList size={16} />} label="In Review" value={kpis.in_review_requisitions} sub={`${kpis.draft_requisitions ?? 0} drafts`} onClick={() => onNavigate("requisitions")} />
        <KpiTile icon={<Users size={16} />} label="Active Candidates" value={kpis.active_candidates} sub={`+${kpis.new_candidates_7d ?? 0} this week`} onClick={() => onNavigate("candidates")} />
        <KpiTile icon={<CalendarClock size={16} />} label="Interviews This Week" value={kpis.interviews_this_week} sub={`${kpis.interviews_today ?? 0} today`} onClick={() => onNavigate("interview")} />
        <KpiTile icon={<FileSignature size={16} />} label="Offers Awaiting Reply" value={kpis.offers_awaiting_response} sub={`${kpis.offers_accepted_30d ?? 0} accepted / 30d`} onClick={() => onNavigate("offer")} />
        <KpiTile icon={<UserCheck size={16} />} label="Joining in 14 Days" value={kpis.upcoming_joiners_14d} sub="accepted offers" onClick={() => onNavigate("offer")} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <Card
          title="Hiring Funnel"
          subtitle="Candidates currently in each recruitment stage"
          icon={<TrendingUp size={16} />}
        >
          <div className="h-80">
            {funnel.some((f) => f.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0} debounce={50}>
                <BarChart data={funnel} layout="vertical" margin={{ left: 24, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e5e7eb" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <YAxis type="category" dataKey="label" width={104} tick={{ fontSize: 12, fill: "#6b7280" }} />
                  <Tooltip contentStyle={{ borderRadius: 16, border: "none", boxShadow: "0 10px 25px rgba(0,0,0,0.1)" }} cursor={{ fill: "#f8fafc" }} />
                  <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} barSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="h-full flex items-center justify-center text-sm text-gray-400">No candidates in the pipeline yet</p>
            )}
          </div>
        </Card>

        <Card
          title="Needs Attention"
          subtitle="Hiring work that requires action today"
          icon={<AlertTriangle size={16} />}
          headerRight={alertTotal > 0 ? <Badge variant="red">{alertTotal}</Badge> : <Badge variant="green">All clear</Badge>}
        >
          {alertTotal === 0 ? (
            <div className="py-10 text-center">
              <CheckCircle2 size={28} className="mx-auto text-green-500 mb-2" />
              <p className="text-sm text-gray-500 dark:text-gray-400">Nothing is overdue or waiting on you.</p>
            </div>
          ) : (
            <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
              <AlertGroup
                title="Overdue requisitions" data={alerts.overdue_requisitions} variant="red"
                render={(it) => <>{it.title} <DaysBadge days={it.days_overdue} suffix="overdue" variant="red" /></>}
                onClick={() => onNavigate("requisitions")}
              />
              <AlertGroup
                title="Approvals waiting" data={alerts.approvals_waiting} variant="yellow"
                render={(it) => <>{it.title} <span className="text-xs text-gray-400">→ {it.assigned_to || it.step_type}</span> <DaysBadge days={it.days_waiting} suffix="waiting" variant="yellow" /></>}
                onClick={() => onNavigate("hr-manager")}
              />
              <AlertGroup
                title="Interview feedback pending" data={alerts.feedback_pending} variant="yellow"
                render={(it) => <>{it.candidate} · {it.round_name} <DaysBadge days={it.days_waiting} suffix="waiting" variant="yellow" /></>}
                onClick={() => onNavigate("interview")}
              />
              <AlertGroup
                title="Offers expiring" data={alerts.offers_expiring} variant="red"
                render={(it) => <>{it.candidate} {it.days_left != null && (it.days_left < 0
                  ? <DaysBadge days={-it.days_left} suffix="past expiry" variant="red" />
                  : <DaysBadge days={it.days_left} suffix="left" variant="yellow" />)}</>}
                onClick={() => onNavigate("offer")}
              />
              <AlertGroup
                title="Joining overdue" data={alerts.joining_overdue} variant="red"
                render={(it) => <>{it.candidate} <DaysBadge days={it.days_overdue} suffix="past joining date" variant="red" /></>}
                onClick={() => onNavigate("offer")}
              />
            </div>
          )}
        </Card>
      </div>

      <Card
        title="Recruitment Analytics"
        subtitle={`Last ${analytics.window_days ?? 90} days`}
        icon={<Clock size={16} />}
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <StatTile label="Time to Hire" value={analytics.time_to_hire_days != null ? `${analytics.time_to_hire_days} days` : "—"} sub={`${analytics.hires ?? 0} hires`} />
          <StatTile label="Offer Acceptance" value={analytics.offer_acceptance_rate != null ? `${analytics.offer_acceptance_rate}%` : "—"} sub={`${analytics.offers_responded ?? 0} offers responded`} />
          <StatTile label="Hires" value={analytics.hires ?? 0} sub="offer accepted in window" />
        </div>

        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Source effectiveness</p>
        {(analytics.sources || []).length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No applications in this window</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left py-2 pr-4">Source</th>
                  <th className="text-right py-2 pr-4">Applied</th>
                  <th className="text-right py-2 pr-4">Hired</th>
                  <th className="text-left py-2 w-1/3">Conversion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {(analytics.sources || []).map((s) => (
                  <tr key={s.source}>
                    <td className="py-2 pr-4 text-gray-700 dark:text-gray-200">{SOURCE_LABELS[s.source] || s.source || "Unknown"}</td>
                    <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-200">{s.applied}</td>
                    <td className="py-2 pr-4 text-right text-gray-700 dark:text-gray-200">{s.hired}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.min(100, s.conversion_pct ?? 0)}%` }} />
                        </div>
                        <span className="text-xs text-gray-500 dark:text-gray-400 w-10 text-right">
                          {s.conversion_pct != null ? `${s.conversion_pct}%` : "—"}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data?.definitions && (
          <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500">
            {data.definitions.time_to_hire_days} {data.definitions.offer_acceptance_rate}
          </p>
        )}
      </Card>
    </div>
  );
}

function Card({ title, subtitle, icon, headerRight, children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-brand-600 dark:text-brand-400">{icon}</span>
          <div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{title}</p>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400">{subtitle}</p>}
          </div>
        </div>
        {headerRight}
      </div>
      {children}
    </div>
  );
}

function KpiTile({ icon, label, value, sub, onClick }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm px-4 py-3 hover:border-brand-300 dark:hover:border-brand-700 transition-colors"
    >
      <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400 mb-1">
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value ?? "—"}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </button>
  );
}

function StatTile({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-gray-50 dark:bg-gray-900/30 px-4 py-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500">{sub}</p>}
    </div>
  );
}

function AlertGroup({ title, data, variant, render, onClick }) {
  if (!data?.count) return null;
  return (
    <div>
      <button onClick={onClick} className="flex items-center gap-2 mb-1.5 group">
        <Badge variant={variant}>{data.count}</Badge>
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 group-hover:text-brand-600 dark:group-hover:text-brand-400">{title}</span>
      </button>
      <ul className="space-y-1">
        {(data.items || []).map((it, i) => (
          <li key={i} className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-2 flex-wrap">
            {render(it)}
          </li>
        ))}
        {data.count > (data.items || []).length && (
          <li className="text-xs text-gray-400">+{data.count - data.items.length} more</li>
        )}
      </ul>
    </div>
  );
}

function DaysBadge({ days, suffix, variant }) {
  if (days == null) return null;
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${
      variant === "red"
        ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
        : "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
    }`}>
      {days}d {suffix}
    </span>
  );
}
