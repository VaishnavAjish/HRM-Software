import {
  LifeBuoy, Flame, Clock, AlertTriangle, UserCheck,
  PieChart, BarChart3, TrendingUp, ShieldAlert, Award, CornerUpRight, CheckCircle2,
} from "lucide-react";
import { statusMeta, priorityMeta, slaMeta, slaLabel, metric, PRIORITY_ORDER } from "./ticketMeta";

/**
 * The helpdesk overview.
 *
 * Every figure comes from /api/tickets/dashboard. This component previously
 * carried literal arrays for department load, branch load, priority
 * distribution and SLA health, plus `|| 18`-style fallbacks on the metric cards
 * — so a deployment with two tickets displayed 96.8% compliance across four
 * branches that were never in the database. There are no fallback values now:
 * where the API has nothing to say, the panel says so.
 */
export default function SuperAdminTicketDashboard({ summary, tickets = [], loading, onFilterSelect, onSelectTicket }) {
  const byStatus = summary?.by_status || {};
  const byPriority = summary?.by_priority || {};
  const byDept = summary?.by_department || [];
  const byBranch = summary?.by_branch || [];

  const cards = [
    { key: "open", label: "Open Tickets", value: byStatus.open, icon: Clock, cls: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { key: "assigned", label: "Assigned", value: byStatus.assigned, icon: UserCheck, cls: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
    { key: "overdue", label: "Overdue (SLA Breached)", value: summary?.sla_breached, icon: AlertTriangle, cls: "bg-rose-500/15 text-rose-700 dark:text-rose-400" },
    { key: "escalated", label: "Escalated", value: byStatus.escalated, icon: ShieldAlert, cls: "bg-red-500/15 text-red-700 dark:text-red-300" },
    { key: "resolved", label: "Resolved Today", value: summary?.resolved_today, icon: CheckCircle2, cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { key: "pending_approval", label: "Pending Approval", value: byStatus.pending_approval, icon: CornerUpRight, cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    {
      key: "avg_resolution",
      label: "Avg Resolution Time",
      // Null until something has actually been resolved — never a placeholder.
      value: summary?.avg_resolution_hours == null ? null : `${summary.avg_resolution_hours}h`,
      icon: TrendingUp,
      cls: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400",
      static: true,
    },
    {
      key: "sla_compliance",
      label: "SLA Compliance",
      value: summary?.sla_compliance == null ? null : `${summary.sla_compliance}%`,
      icon: Award,
      cls: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300",
      static: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Metric cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {cards.map((card) => {
          const Icon = card.icon;
          const clickable = !card.static && onFilterSelect;
          const Wrapper = clickable ? "button" : "div";

          return (
            <Wrapper
              key={card.key}
              {...(clickable ? { onClick: () => onFilterSelect(card.key), type: "button" } : {})}
              className={`flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-3.5 text-left dark:border-gray-800 dark:bg-gray-900 ${
                clickable ? "transition hover:border-brand-300 hover:shadow-sm" : ""
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${card.cls}`}>
                  <Icon size={16} />
                </span>
                <span className="text-lg font-extrabold text-gray-900 dark:text-white">
                  {loading ? "…" : metric(card.value)}
                </span>
              </div>
              <p className="mt-2 truncate text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                {card.label}
              </p>
            </Wrapper>
          );
        })}
      </div>

      {/* Live queue preview */}
      <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
        <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-gray-800">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-extrabold text-gray-900 dark:text-white">
              <LifeBuoy size={16} className="text-brand-500" /> Live Ticket Queue
            </h3>
            <p className="text-[11px] text-gray-400">Most recent requests, with their SLA countdown</p>
          </div>
          <button
            onClick={() => onFilterSelect && onFilterSelect("inbox")}
            className="text-xs font-bold text-brand-600 hover:underline dark:text-brand-400"
          >
            View full inbox ({tickets.length})
          </button>
        </div>

        {tickets.length === 0 ? (
          <p className="py-8 text-center text-xs text-gray-400">
            {loading ? "Loading tickets…" : "No tickets in your scope yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-gray-100 text-[11px] font-bold uppercase text-gray-400 dark:border-gray-800">
                  <th className="px-3 py-2.5">Ticket #</th>
                  <th className="px-3 py-2.5">Employee</th>
                  <th className="px-3 py-2.5">Department</th>
                  <th className="px-3 py-2.5">Priority</th>
                  <th className="px-3 py-2.5">Escalation</th>
                  <th className="px-3 py-2.5">Assigned To</th>
                  <th className="px-3 py-2.5">SLA</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700 dark:divide-gray-800/60 dark:text-gray-300">
                {tickets.slice(0, 5).map((t) => {
                  const s = statusMeta(t.status);
                  const p = priorityMeta(t.priority);
                  const sla = slaMeta(t.sla_status);

                  return (
                    <tr key={t.id} className="transition-colors hover:bg-gray-50/80 dark:hover:bg-gray-800/40">
                      <td className="px-3 py-3 font-mono font-bold text-brand-600 dark:text-brand-400">
                        {t.ticket_number}
                      </td>
                      <td className="px-3 py-3 font-semibold text-gray-900 dark:text-white">
                        {t.employee?.name || "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-600 dark:text-gray-300">{t.department || "—"}</td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] ${p.colorCls}`}>{p.label}</span>
                      </td>
                      <td className="px-3 py-3 font-semibold text-gray-600 dark:text-gray-300">
                        {t.escalation_level > 0 ? `Level ${t.escalation_level}` : "—"}
                      </td>
                      <td className="px-3 py-3 text-gray-800 dark:text-gray-200">
                        {t.assignee?.name || <span className="text-gray-400">Unassigned</span>}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] ${sla.cls}`}>
                          <Clock size={11} /> {slaLabel(t)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${s.badgeBg}`}>{s.label}</span>
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => onSelectTicket && onSelectTicket(t.id)}
                          className="rounded-lg bg-gray-100 px-2.5 py-1 font-bold text-brand-600 hover:bg-brand-50 dark:bg-gray-800 dark:text-brand-400"
                        >
                          Inspect
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Breakdowns */}
      <div className="grid gap-4 lg:grid-cols-4">
        <BarPanel
          title="Department Load"
          icon={BarChart3}
          iconCls="text-brand-500"
          rows={byDept}
          loading={loading}
          empty="No tickets to break down by department yet."
        />

        <ListPanel
          title="Branch Load"
          icon={PieChart}
          iconCls="text-purple-500"
          rows={byBranch}
          loading={loading}
          empty="No branch data yet."
        />

        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <PanelHeader title="Priority Distribution" icon={Flame} iconCls="text-amber-500" />
          <div className="space-y-2 text-xs">
            {PRIORITY_ORDER.slice().reverse().map((key) => {
              const meta = priorityMeta(key);
              return (
                <div key={key} className={`flex items-center justify-between rounded-xl p-2 font-bold ${meta.colorCls}`}>
                  <span>{meta.label} Priority</span>
                  <span>{loading ? "…" : metric(byPriority[key])}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* SLA health — the three figures the API computes, nothing more. */}
        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
          <PanelHeader
            title="SLA Health"
            icon={ShieldAlert}
            iconCls="text-emerald-500"
            right={
              summary?.sla_compliance == null ? (
                <span className="text-[10px] text-gray-400">No data</span>
              ) : (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  {summary.sla_compliance}%
                </span>
              )
            }
          />
          <div className="space-y-3 text-xs">
            <SlaBand
              tone="emerald"
              title="On-Track"
              value={summary?.on_track}
              caption="active tickets inside their response window"
            />
            <SlaBand
              tone="amber"
              title="At Risk"
              value={summary?.at_risk}
              caption="within the last quarter of their SLA window"
            />
            <SlaBand
              tone="rose"
              title="Breached"
              value={summary?.sla_breached}
              caption="past target and still unresolved"
            />
            {summary?.sla_compliance == null && (
              <p className="text-[11px] leading-relaxed text-gray-400">
                Compliance is calculated once tickets have been resolved against an SLA target.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PanelHeader({ title, icon: Icon, iconCls, right }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 pb-2.5 dark:border-gray-800">
      <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
        <Icon size={15} className={iconCls} /> {title}
      </h3>
      {right}
    </div>
  );
}

function BarPanel({ title, icon, iconCls, rows, loading, empty }) {
  const max = Math.max(1, ...rows.map((r) => r.count || 0));

  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <PanelHeader title={title} icon={icon} iconCls={iconCls} />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-gray-400">{loading ? "Loading…" : empty}</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div key={row.name} className="space-y-1">
              <div className="flex justify-between text-xs font-semibold">
                <span className="truncate text-gray-700 dark:text-gray-300">{row.name}</span>
                <span className="font-extrabold text-gray-900 dark:text-white">{row.count}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.round((row.count / max) * 100)}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ListPanel({ title, icon, iconCls, rows, loading, empty }) {
  return (
    <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
      <PanelHeader title={title} icon={icon} iconCls={iconCls} />
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-gray-400">{loading ? "Loading…" : empty}</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row) => (
            <div
              key={row.name}
              className="flex items-center justify-between rounded-xl bg-gray-50 p-2 text-xs dark:bg-gray-800/60"
            >
              <span className="truncate font-semibold text-gray-800 dark:text-gray-200">{row.name}</span>
              <span className="shrink-0 font-extrabold text-brand-600 dark:text-brand-400">
                {row.count} {row.count === 1 ? "ticket" : "tickets"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlaBand({ tone, title, value, caption }) {
  const tones = {
    emerald: "bg-emerald-50/60 border-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:border-emerald-900/40 dark:text-emerald-300",
    amber: "bg-amber-50/60 border-amber-100 text-amber-800 dark:bg-amber-950/30 dark:border-amber-900/40 dark:text-amber-300",
    rose: "bg-rose-50/60 border-rose-100 text-rose-800 dark:bg-rose-950/30 dark:border-rose-900/40 dark:text-rose-300",
  };

  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="flex items-center justify-between font-bold">
        <span>{title}</span>
        <span>{metric(value)}</span>
      </p>
      <p className="mt-0.5 text-[11px] opacity-80">{caption}</p>
    </div>
  );
}
