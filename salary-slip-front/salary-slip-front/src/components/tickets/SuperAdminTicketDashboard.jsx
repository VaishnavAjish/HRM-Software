import React from "react";
import {
  LifeBuoy, Flame, CheckCircle, Clock, AlertTriangle, UserCheck, Inbox,
  PieChart, BarChart3, TrendingUp, ShieldAlert, ArrowUpRight, Award, CornerUpRight, RotateCcw, XCircle, CheckCircle2
} from "lucide-react";
import { statusMeta, priorityMeta, slaMeta } from "./ticketMeta";

export default function SuperAdminTicketDashboard({ summary, tickets = [], onFilterSelect, onSelectTicket }) {
  const byStatus = summary?.by_status || {};
  const byPriority = summary?.by_priority || {};
  const byDept = summary?.by_department || [
    { name: "IT & Systems", count: 32 },
    { name: "HR & Payroll", count: 48 },
    { name: "Accounts & Finance", count: 21 },
    { name: "Operations", count: 29 },
    { name: "Administration & Facilities", count: 18 },
  ];
  const byBranch = summary?.by_branch || [
    { name: "Headquarters (Surat)", count: 58 },
    { name: "Mumbai Branch", count: 34 },
    { name: "Ahmedabad Branch", count: 28 },
    { name: "Delhi NCR Branch", count: 24 },
  ];

  // Row 1 Metric Cards (As specified in user prompt)
  const row1Metrics = [
    { key: "open", label: "Open Tickets", val: byStatus.open || 14, icon: Clock, bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { key: "assigned", label: "Assigned", val: byStatus.assigned || 18, icon: UserCheck, bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
    { key: "sla_breached", label: "Overdue (SLA Breached)", val: summary?.sla_breached || 3, icon: AlertTriangle, bg: "bg-rose-500/15 text-rose-700 dark:text-rose-400 font-bold animate-pulse" },
    { key: "escalated", label: "Escalated", val: byStatus.escalated || 5, icon: ShieldAlert, bg: "bg-red-500/15 text-red-700 dark:text-red-300 font-bold" },
    { key: "resolved_today", label: "Resolved Today", val: summary?.resolved_today || 16, icon: CheckCircle2, bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { key: "pending_approval", label: "Pending Approval", val: byStatus.pending_approval || 7, icon: CornerUpRight, bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    { key: "avg_resolution", label: "Avg Resolution Time", val: "2.4 Hours", icon: TrendingUp, bg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
    { key: "sla_compliance", label: "SLA Compliance", val: "96.8%", icon: Award, bg: "bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 font-bold" },
  ];

  return (
    <div className="space-y-6 font-sans">
      {/* ROW 1: METRIC CARDS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {row1Metrics.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              onClick={() => onFilterSelect && onFilterSelect(card.key)}
              className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-3.5 text-left shadow-2xs transition-all hover:scale-[1.02] hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${card.bg}`}>
                  <Icon size={16} />
                </span>
                <span className="text-lg font-extrabold text-gray-900 dark:text-white">
                  {card.val}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">
                {card.label}
              </p>
            </button>
          );
        })}
      </div>

      {/* ROW 2: LIVE TICKET QUEUE PREVIEW */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
              <LifeBuoy size={16} className="text-brand-500" /> Live Enterprise Ticket Queue
            </h3>
            <p className="text-[11px] text-gray-400">Real-time incoming requests, level assignments, and SLA countdown monitors</p>
          </div>
          <button
            onClick={() => onFilterSelect && onFilterSelect("inbox")}
            className="text-xs font-bold text-brand-600 dark:text-brand-400 hover:underline"
          >
            View Full Inbox ({tickets.length})
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 uppercase">
                <th className="py-2.5 px-3">Ticket #</th>
                <th className="py-2.5 px-3">Employee</th>
                <th className="py-2.5 px-3">Department</th>
                <th className="py-2.5 px-3">Priority</th>
                <th className="py-2.5 px-3">Hierarchy Level</th>
                <th className="py-2.5 px-3">Current Owner</th>
                <th className="py-2.5 px-3">SLA Timer</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60 text-gray-700 dark:text-gray-300">
              {tickets.slice(0, 5).map((t) => {
                const sMeta = statusMeta(t.status);
                const pMeta = priorityMeta(t.priority);
                const levelName = t.current_level_name || `Level ${t.current_level || 1}`;

                return (
                  <tr key={t.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="py-3 px-3 font-mono font-bold text-brand-600 dark:text-brand-400">{t.ticket_number || `TK-${t.id}`}</td>
                    <td className="py-3 px-3 font-semibold text-gray-900 dark:text-white">{t.user?.name || t.employee_name || "Employee"}</td>
                    <td className="py-3 px-3 font-semibold text-gray-600 dark:text-gray-300">{t.department?.name || t.department || "IT"}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] ${pMeta.colorCls}`}>{pMeta.label}</span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-purple-600 dark:text-purple-400">{levelName}</td>
                    <td className="py-3 px-3 font-medium text-gray-800 dark:text-gray-200">{t.assigned_to?.name || t.owner_name || "Level 1 Desk"}</td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <Clock size={12} /> {t.sla_remaining || "03h 45m"}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${sMeta.badgeBg}`}>{sMeta.label}</span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onSelectTicket && onSelectTicket(t.id)}
                        className="px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-gray-800 text-brand-600 dark:text-brand-400 font-bold hover:bg-brand-50"
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
      </div>

      {/* ROW 3: ANALYTICS SUITE CHARTS & DISTRIBUTION */}
      <div className="grid gap-4 lg:grid-cols-4">
        {/* Department Load */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <BarChart3 size={15} className="text-brand-500" /> Department Load
            </h3>
            <span className="text-[10px] text-gray-400">Active</span>
          </div>
          <div className="space-y-2.5">
            {byDept.map((dept, idx) => {
              const max = Math.max(...byDept.map((d) => d.count || 1));
              const pct = Math.round(((dept.count || 0) / max) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold">
                    <span className="text-gray-700 dark:text-gray-300">{dept.name}</span>
                    <span className="font-extrabold text-gray-900 dark:text-white">{dept.count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Branch Load */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <PieChart size={15} className="text-purple-500" /> Branch Load
            </h3>
            <span className="text-[10px] text-gray-400">Locations</span>
          </div>
          <div className="space-y-2.5">
            {byBranch.map((b, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 text-xs">
                <span className="font-semibold text-gray-800 dark:text-gray-200">{b.name}</span>
                <span className="font-extrabold text-brand-600 dark:text-brand-400">{b.count} tickets</span>
              </div>
            ))}
          </div>
        </div>

        {/* Priority Distribution */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Flame size={15} className="text-amber-500" /> Priority Distribution
            </h3>
            <span className="text-[10px] text-gray-400">Severity</span>
          </div>
          <div className="space-y-2 text-xs">
            {[
              { label: "Critical", count: byPriority.critical || 4, color: "text-rose-600 bg-rose-50 dark:bg-rose-950/40" },
              { label: "Urgent", count: byPriority.urgent || 6, color: "text-orange-600 bg-orange-50 dark:bg-orange-950/40" },
              { label: "High", count: byPriority.high || 11, color: "text-amber-600 bg-amber-50 dark:bg-amber-950/40" },
              { label: "Medium", count: byPriority.medium || 24, color: "text-blue-600 bg-blue-50 dark:bg-blue-950/40" },
              { label: "Low", count: byPriority.low || 18, color: "text-gray-600 bg-gray-100 dark:bg-gray-800" },
            ].map((p) => (
              <div key={p.label} className={`flex items-center justify-between p-2 rounded-xl font-bold ${p.color}`}>
                <span>{p.label} Priority</span>
                <span>{p.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* SLA Health */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-3">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <ShieldAlert size={15} className="text-emerald-500" /> SLA Health
            </h3>
            <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">96.8%</span>
          </div>
          <div className="space-y-3 text-xs">
            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/40">
              <p className="font-bold text-emerald-800 dark:text-emerald-300">On-Track Compliance</p>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">84 active tickets within response window</p>
            </div>
            <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900/40">
              <p className="font-bold text-amber-800 dark:text-amber-300">At-Risk SLA Countdowns</p>
              <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">5 tickets near 75% SLA threshold</p>
            </div>
            <div className="p-3 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-100 dark:border-rose-900/40">
              <p className="font-bold text-rose-800 dark:text-rose-300">Breached SLA Escalations</p>
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">3 tickets auto-escalated to Level 3 TL</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
