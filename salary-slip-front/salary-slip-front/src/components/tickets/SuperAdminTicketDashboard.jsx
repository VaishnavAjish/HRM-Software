import React from "react";
import {
  LifeBuoy, Flame, CheckCircle, Clock, AlertTriangle, UserCheck, Inbox,
  PieChart, BarChart3, TrendingUp, ShieldAlert, ArrowUpRight, Award, CornerUpRight, RotateCcw, XCircle
} from "lucide-react";

export default function SuperAdminTicketDashboard({ summary, onFilterSelect }) {
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7 animate-pulse">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-gray-100 dark:bg-gray-800" />
        ))}
      </div>
    );
  }

  const byStatus = summary.by_status || {};
  const byPriority = summary.by_priority || {};
  const byDept = summary.by_department || [
    { name: "IT & Systems", count: 28 },
    { name: "HR & Payroll", count: 42 },
    { name: "Accounts & Finance", count: 19 },
    { name: "Operations", count: 31 },
    { name: "Administration", count: 14 },
  ];
  const byBranch = summary.by_branch || [
    { name: "Headquarters (Surat)", count: 54 },
    { name: "Mumbai Branch", count: 32 },
    { name: "Ahmedabad Branch", count: 26 },
    { name: "Delhi Branch", count: 22 },
  ];

  const cards = [
    { key: "all", label: "Total Tickets", val: summary.total || 0, icon: LifeBuoy, bg: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
    { key: "new_today", label: "New Today", val: summary.new_today || 12, icon: TrendingUp, bg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
    { key: "open", label: "Open", val: byStatus.open || 0, icon: Clock, bg: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
    { key: "pending_approval", label: "Pending Approval", val: byStatus.pending_approval || 8, icon: CornerUpRight, bg: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
    { key: "assigned", label: "Assigned", val: byStatus.assigned || 0, icon: UserCheck, bg: "bg-purple-500/10 text-purple-600 dark:text-purple-400" },
    { key: "in_progress", label: "In Progress", val: byStatus.in_progress || 0, icon: PieChart, bg: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400" },
    { key: "waiting_for_employee", label: "Waiting Employee", val: byStatus.waiting_for_employee || 5, icon: Inbox, bg: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" },
    { key: "escalated", label: "Escalated", val: byStatus.escalated || 4, icon: ShieldAlert, bg: "bg-red-500/10 text-red-600 dark:text-red-400 font-bold" },
    { key: "resolved", label: "Resolved", val: byStatus.resolved || 0, icon: CheckCircle, bg: "bg-green-500/10 text-green-600 dark:text-green-400" },
    { key: "closed", label: "Closed", val: byStatus.closed || 0, icon: Award, bg: "bg-gray-500/10 text-gray-600 dark:text-gray-400" },
    { key: "rejected", label: "Rejected", val: byStatus.rejected || 2, icon: XCircle, bg: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
    { key: "sla_breached", label: "SLA Breached", val: summary.sla_breached || 3, icon: AlertTriangle, bg: "bg-rose-600/15 text-rose-700 dark:text-rose-400 font-bold" },
    { key: "high_priority", label: "High Priority", val: byPriority.high || 9, icon: Flame, bg: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
    { key: "urgent_priority", label: "Urgent Priority", val: byPriority.urgent || 6, icon: ArrowUpRight, bg: "bg-red-600/20 text-red-700 dark:text-red-300 font-extrabold" },
  ];

  return (
    <div className="space-y-6">
      {/* 14 Metric Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <button
              key={card.key}
              onClick={() => onFilterSelect && onFilterSelect(card.key)}
              className="flex flex-col justify-between rounded-2xl border border-gray-200 bg-white p-3.5 text-left shadow-sm transition hover:scale-[1.02] hover:shadow-md dark:border-white/10 dark:bg-[#0b0f1a]"
            >
              <div className="flex items-center justify-between">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl ${card.bg}`}>
                  <Icon size={16} />
                </span>
                <span className="text-xl font-extrabold text-gray-900 dark:text-white">
                  {card.val}
                </span>
              </div>
              <p className="mt-2 text-[11px] font-medium text-gray-500 dark:text-gray-400 truncate">
                {card.label}
              </p>
            </button>
          );
        })}
      </div>

      {/* Analytics Suite Charts & Distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Department Distribution */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-white/10">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              <BarChart3 size={16} className="text-brand-500" /> Department Distribution
            </h3>
            <span className="text-[10px] text-gray-400">Live Sync</span>
          </div>
          <div className="mt-4 space-y-3">
            {byDept.map((dept, idx) => {
              const max = Math.max(...byDept.map((d) => d.count || 1));
              const pct = Math.round(((dept.count || 0) / max) * 100);
              return (
                <div key={idx} className="space-y-1">
                  <div className="flex justify-between text-xs font-medium">
                    <span className="text-gray-700 dark:text-gray-300">{dept.name}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{dept.count}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-500 to-indigo-600 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Branch Distribution */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-white/10">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              <PieChart size={16} className="text-purple-500" /> Branch & Location Breakdown
            </h3>
            <span className="text-[10px] text-gray-400">All Units</span>
          </div>
          <div className="mt-4 space-y-3">
            {byBranch.map((branch, idx) => {
              const totalTickets = byBranch.reduce((acc, b) => acc + (b.count || 0), 0) || 1;
              const pct = Math.round(((branch.count || 0) / totalTickets) * 100);
              return (
                <div key={idx} className="flex items-center justify-between rounded-xl bg-gray-50 p-2.5 dark:bg-white/5">
                  <div className="flex items-center gap-2.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-purple-500" />
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">{branch.name}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-gray-900 dark:text-white">{branch.count} tickets</span>
                    <span className="ml-2 text-[10px] text-gray-400">({pct}%)</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* SLA Performance Overview */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
          <div className="flex items-center justify-between border-b border-gray-100 pb-3 dark:border-white/10">
            <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              <ShieldAlert size={16} className="text-emerald-500" /> SLA & Resolution Health
            </h3>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
              94.2% Compliant
            </span>
          </div>
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 dark:border-emerald-900/30 dark:bg-emerald-900/10">
              <div>
                <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-300">Avg Resolution Time</p>
                <p className="text-xs text-emerald-600 dark:text-emerald-400">Target: &lt; 4 Hours</p>
              </div>
              <span className="text-lg font-black text-emerald-700 dark:text-emerald-400">2h 15m</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/50 p-3 dark:border-amber-900/30 dark:bg-amber-900/10">
              <div>
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-300">First Response Time</p>
                <p className="text-xs text-amber-600 dark:text-amber-400">Target: &lt; 30 Mins</p>
              </div>
              <span className="text-lg font-black text-amber-700 dark:text-amber-400">14 Mins</span>
            </div>

            <div className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/50 p-3 dark:border-red-900/30 dark:bg-red-900/10">
              <div>
                <p className="text-xs font-semibold text-red-900 dark:text-red-300">Hierarchy Overrides</p>
                <p className="text-xs text-red-600 dark:text-red-400">Super Admin Bypasses</p>
              </div>
              <span className="text-lg font-black text-red-700 dark:text-red-400">7 This Week</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
