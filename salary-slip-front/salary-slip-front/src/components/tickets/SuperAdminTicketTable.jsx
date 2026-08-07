import React, { useState, useMemo } from "react";
import {
  Search, Filter, ChevronDown, CheckSquare, Square, ShieldAlert,
  Clock, UserCheck, ArrowUpRight, CheckCircle2, CornerUpRight, Eye, RefreshCw
} from "lucide-react";
import { statusMeta, priorityMeta, slaMeta, formatDate, DEPARTMENTS } from "./ticketMeta";

export default function SuperAdminTicketTable({
  tickets = [],
  selectedIds = [],
  onToggleSelectAll,
  onToggleSelect,
  onSelectTicket,
  onBulkAction,
  onRefresh,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [levelFilter, setLevelFilter] = useState("All");

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Search text
      const matchesSearch =
        (t.ticket_number || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.subject || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.user?.name || t.employee_name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.assigned_to?.name || t.owner_name || "").toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      // Department filter
      if (deptFilter !== "All" && (t.department?.name || t.department || "") !== deptFilter) return false;

      // Priority filter
      if (priorityFilter !== "All" && (t.priority || "").toLowerCase() !== priorityFilter.toLowerCase()) return false;

      // Status filter
      if (statusFilter !== "All" && (t.status || "").toLowerCase() !== statusFilter.toLowerCase()) return false;

      // Level filter
      if (levelFilter !== "All" && String(t.current_level || 1) !== levelFilter) return false;

      return true;
    });
  }, [tickets, searchQuery, deptFilter, priorityFilter, statusFilter, levelFilter]);

  const allSelected = filteredTickets.length > 0 && filteredTickets.every((t) => selectedIds.includes(t.id));

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900 space-y-4 p-5 font-sans text-xs">
      {/* Search & Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 dark:border-gray-800 pb-4">
        <div className="flex flex-wrap items-center gap-2 flex-1">
          {/* Search Input */}
          <div className="relative min-w-[220px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search Ticket #, Employee, Owner..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800 py-2 pl-9 pr-3 text-xs text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-brand-500"
            />
          </div>

          {/* Department Filter */}
          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none"
          >
            <option value="All">All Departments</option>
            {DEPARTMENTS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          {/* Priority Filter */}
          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none"
          >
            <option value="All">All Priorities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
            <option value="critical">Critical</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none"
          >
            <option value="All">All Statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="accepted">Accepted</option>
            <option value="in_progress">In Progress</option>
            <option value="waiting_for_employee">Waiting Employee</option>
            <option value="escalated">Escalated</option>
            <option value="resolved">Resolved</option>
            <option value="closed">Closed</option>
          </select>

          {/* Hierarchy Level Filter */}
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none"
          >
            <option value="All">All Hierarchy Levels</option>
            <option value="1">Level 1 (Executive Desk)</option>
            <option value="2">Level 2 (Senior Exec)</option>
            <option value="3">Level 3 (Team Lead)</option>
            <option value="4">Level 4 (Dept Manager)</option>
            <option value="5">Level 5 (Dept Head)</option>
            <option value="6">Level 6 (HR Admin)</option>
            <option value="7">Level 7 (Super Admin)</option>
          </select>
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-2 bg-brand-50 dark:bg-brand-950/40 px-3 py-1.5 rounded-xl border border-brand-200 dark:border-brand-800 text-xs">
            <span className="font-bold text-brand-700 dark:text-brand-300">{selectedIds.length} Selected</span>
            <button
              onClick={() => onBulkAction && onBulkAction("escalate", selectedIds)}
              className="px-2.5 py-1 bg-rose-600 text-white font-bold rounded-lg hover:bg-rose-700"
            >
              Escalate Selected
            </button>
            <button
              onClick={() => onBulkAction && onBulkAction("resolve", selectedIds)}
              className="px-2.5 py-1 bg-emerald-600 text-white font-bold rounded-lg hover:bg-emerald-700"
            >
              Resolve Selected
            </button>
          </div>
        )}
      </div>

      {/* Live Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          <thead>
            <tr className="border-b border-gray-100 dark:border-gray-800 text-[11px] font-bold text-gray-400 uppercase">
              <th className="py-3 px-3 w-8">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
              </th>
              <th className="py-3 px-3">Ticket #</th>
              <th className="py-3 px-3">Employee</th>
              <th className="py-3 px-3">Department</th>
              <th className="py-3 px-3">Priority</th>
              <th className="py-3 px-3">Current Level</th>
              <th className="py-3 px-3">Current Owner</th>
              <th className="py-3 px-3">SLA Timer</th>
              <th className="py-3 px-3">Status</th>
              <th className="py-3 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800 text-gray-700 dark:text-gray-300">
            {filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-gray-400 font-semibold">
                  No helpdesk tickets match the selected filters.
                </td>
              </tr>
            ) : (
              filteredTickets.map((t) => {
                const sMeta = statusMeta(t.status);
                const pMeta = priorityMeta(t.priority);
                const isSelected = selectedIds.includes(t.id);
                const levelName = t.current_level_name || `Level ${t.current_level || 1}`;

                return (
                  <tr
                    key={t.id}
                    className={`hover:bg-gray-50/80 dark:hover:bg-gray-800/40 transition-colors ${
                      isSelected ? "bg-brand-50/30 dark:bg-brand-950/20" : ""
                    }`}
                  >
                    <td className="py-3 px-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect && onToggleSelect(t.id)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-brand-600 dark:text-brand-400">
                      {t.ticket_number || `TK-${t.id}`}
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-bold text-gray-900 dark:text-white">{t.user?.name || t.employee_name || "Employee"}</p>
                      <p className="text-[10px] text-gray-400">{t.user?.email || t.employee_code || "EMP-102"}</p>
                    </td>
                    <td className="py-3 px-3 font-semibold text-gray-700 dark:text-gray-300">
                      {t.department?.name || t.department || "IT"}
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] ${pMeta.colorCls}`}>
                        {pMeta.label}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-semibold text-purple-600 dark:text-purple-400">
                      {levelName}
                    </td>
                    <td className="py-3 px-3 font-medium text-gray-800 dark:text-gray-200">
                      {t.assigned_to?.name || t.owner_name || "Level 1 Desk"}
                    </td>
                    <td className="py-3 px-3">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                        <Clock size={12} /> {t.sla_remaining || "04h 12m"}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold ${sMeta.badgeBg}`}>
                        {sMeta.label}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <button
                        onClick={() => onSelectTicket && onSelectTicket(t.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs shadow-xs transition-all"
                      >
                        <Eye size={13} /> View Ticket
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
