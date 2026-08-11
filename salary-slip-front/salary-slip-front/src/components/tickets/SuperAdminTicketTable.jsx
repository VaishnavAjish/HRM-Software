import { useMemo, useState } from "react";
import { Search, Eye, Clock, Loader2, Trash2, Flame } from "lucide-react";
import {
  statusMeta, priorityMeta, slaMeta, slaLabel, formatDate,
  departmentsFrom, STATUS_ORDER, PRIORITY_ORDER,
} from "./ticketMeta";

/**
 * The ticket queue.
 *
 * Reads the field names the API actually returns — `employee`, `assignee`,
 * `department` (a string), `escalation_level`, `sla_status`. The previous
 * version read `t.user`, `t.assigned_to.name` and `t.current_level`, none of
 * which exist, and papered over every miss with a literal: "Employee",
 * "EMP-102", "IT", "Level 1 Desk", "04h 12m". A row with no assignee now says
 * Unassigned, because that is the truth and it is what an admin needs to see.
 */
export default function SuperAdminTicketTable({
  tickets = [],
  loading,
  onSelectTicket,
  onBulkAction,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
  onDeleteTicket,
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [slaFilter, setSlaFilter] = useState("All");

  // Departments come from the rows on screen, not a hard-coded list that may
  // name teams this company does not have.
  const departments = useMemo(() => departmentsFrom(tickets), [tickets]);

  const filteredTickets = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();

    return tickets.filter((t) => {
      if (needle) {
        const haystack = [t.ticket_number, t.subject, t.employee?.name, t.employee?.emp_code, t.assignee?.name]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      if (deptFilter !== "All" && (t.department || "") !== deptFilter) return false;
      if (priorityFilter !== "All" && t.priority !== priorityFilter) return false;
      if (statusFilter !== "All" && t.status !== statusFilter) return false;
      if (slaFilter !== "All" && (t.sla_status || "none") !== slaFilter) return false;

      return true;
    });
  }, [tickets, searchQuery, deptFilter, priorityFilter, statusFilter, slaFilter]);

  const allSelected = filteredTickets.length > 0 && filteredTickets.every((t) => selectedIds.includes(t.id));

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-56">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter loaded tickets…"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-8 pr-3 text-xs outline-none focus:border-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
            <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className={selectCls}>
              <option value="All">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={selectCls}>
              <option value="All">All Priorities</option>
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p}>{priorityMeta(p).label}</option>
              ))}
            </select>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={selectCls}>
              <option value="All">All Statuses</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{statusMeta(s).label}</option>
              ))}
            </select>

            <select value={slaFilter} onChange={(e) => setSlaFilter(e.target.value)} className={selectCls}>
              <option value="All">Any SLA state</option>
              <option value="on_track">On Track</option>
              <option value="at_risk">At Risk</option>
              <option value="breached">Breached</option>
              <option value="none">No target</option>
            </select>
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-2 text-xs dark:border-brand-800 dark:bg-brand-950/40">
            <span className="font-bold text-brand-700 dark:text-brand-300">{selectedIds.length} selected</span>
            <button
              onClick={() => onBulkAction && onBulkAction("escalate", selectedIds)}
              className="rounded-lg bg-rose-600 px-2.5 py-1.5 font-bold text-white hover:bg-rose-700"
            >
              Escalate
            </button>
            <button
              onClick={() => onBulkAction && onBulkAction("status", selectedIds, { status: "resolved" })}
              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 font-bold text-white hover:bg-emerald-700"
            >
              Resolve
            </button>
            <button
              onClick={() => onBulkAction && onBulkAction("close", selectedIds)}
              className="rounded-lg bg-gray-600 px-2.5 py-1.5 font-bold text-white hover:bg-gray-700"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-100 dark:border-gray-800">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-gray-50/80 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:bg-gray-800/60 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
              <th className="w-8 px-3.5 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={onToggleSelectAll}
                  className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                />
              </th>
              <th className="px-3.5 py-3">Ticket #</th>
              <th className="px-3.5 py-3">Employee</th>
              <th className="px-3.5 py-3">Department</th>
              <th className="px-3.5 py-3">Priority</th>
              <th className="px-3.5 py-3">Escalation</th>
              <th className="px-3.5 py-3">Assigned To</th>
              <th className="px-3.5 py-3">SLA</th>
              <th className="px-3.5 py-3">Created</th>
              <th className="px-3.5 py-3">Status</th>
              <th className="px-3.5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80 text-gray-700 dark:divide-gray-800/60 dark:text-gray-300">
            {loading ? (
              <tr>
                <td colSpan={11} className="py-12 text-center">
                  <Loader2 className="mx-auto animate-spin text-brand-500" size={20} />
                </td>
              </tr>
            ) : filteredTickets.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center font-semibold text-gray-400">
                  {tickets.length === 0
                    ? "No tickets in this view."
                    : "No tickets match the selected filters."}
                </td>
              </tr>
            ) : (
              filteredTickets.map((t) => {
                const s = statusMeta(t.status);
                const p = priorityMeta(t.priority);
                const sla = slaMeta(t.sla_status);
                const isSelected = selectedIds.includes(t.id);

                return (
                  <tr
                    key={t.id}
                    className={`group transition-all duration-150 hover:bg-brand-50/40 dark:hover:bg-gray-800/60 ${
                      isSelected ? "bg-brand-50/30 dark:bg-brand-950/20" : ""
                    }`}
                  >
                    <td className="px-3.5 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect && onToggleSelect(t.id)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3.5 py-3">
                      <span className="inline-flex items-center font-mono text-[11px] font-bold text-brand-600 bg-brand-50/80 border border-brand-200/60 dark:bg-brand-950/40 dark:text-brand-300 dark:border-brand-800/50 rounded-lg px-2.5 py-1 shadow-2xs group-hover:border-brand-300">
                        {t.ticket_number}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 text-[11px] font-bold text-white shadow-2xs">
                          {(t.employee?.name || "?").trim().charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 dark:text-white text-xs truncate max-w-[150px]">
                            {t.employee?.name || "—"}
                          </p>
                          {t.employee?.emp_code && (
                            <p className="text-[10px] text-gray-400 font-mono">{t.employee.emp_code}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3.5 py-3">
                      <span className="inline-flex items-center rounded-md bg-gray-100/80 px-2.5 py-1 text-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300 border border-gray-200/50 dark:border-gray-700/50">
                        {t.department || "—"}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold ${p.colorCls}`}>
                        {t.priority?.toLowerCase() === "urgent" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                        )}
                        {t.priority?.toLowerCase() === "high" && (
                          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        )}
                        {p.label}
                      </span>
                    </td>
                    <td className="px-3.5 py-3">
                      {t.escalation_level > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-extrabold text-rose-700 border border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800">
                          <Flame size={11} className="text-rose-500" /> Level {t.escalation_level}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-gray-600 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      {t.assignee?.name ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-100 text-[9px] font-bold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            {t.assignee.name.charAt(0).toUpperCase()}
                          </div>
                          <span>{t.assignee.name}</span>
                        </div>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-0.5 text-[10px] font-medium italic text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                          Unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-[10px] font-bold shadow-2xs ${sla.cls}`}>
                        <Clock size={11} /> {slaLabel(t)}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 font-medium text-gray-500 dark:text-gray-400 text-xs">{formatDate(t.created_at)}</td>
                    <td className="px-3.5 py-3">
                      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider shadow-2xs ${s.badgeBg}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-3.5 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onSelectTicket && onSelectTicket(t.id)}
                          className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all duration-150 hover:bg-brand-700 hover:shadow-md hover:scale-105 active:scale-95"
                        >
                          <Eye size={13} /> View
                        </button>
                        {String(t.status).toLowerCase() === "closed" && (
                          <button
                            onClick={() => onDeleteTicket && onDeleteTicket(t.id)}
                            className="inline-flex items-center gap-1 rounded-xl bg-rose-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-xs transition-all duration-150 hover:bg-rose-700 hover:shadow-md hover:scale-105 active:scale-95"
                            title="Delete Ticket"
                          >
                            <Trash2 size={13} /> Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Ticket Cards View */}
      <div className="space-y-3 md:hidden">
        {loading ? (
          <div className="py-10 text-center">
            <Loader2 className="mx-auto animate-spin text-brand-500" size={24} />
          </div>
        ) : filteredTickets.length === 0 ? (
          <p className="py-8 text-center text-xs font-semibold text-gray-400">
            {tickets.length === 0 ? "No tickets in this view." : "No tickets match the selected filters."}
          </p>
        ) : (
          filteredTickets.map((t) => {
            const s = statusMeta(t.status);
            const p = priorityMeta(t.priority);
            const sla = slaMeta(t.sla_status);
            const isSelected = selectedIds.includes(t.id);

            return (
              <div
                key={t.id}
                className={`rounded-2xl border p-4 space-y-3 transition ${
                  isSelected
                    ? "border-brand-300 bg-brand-50/50 dark:border-brand-800 dark:bg-brand-950/30"
                    : "border-gray-100 bg-gray-50/40 dark:border-gray-800 dark:bg-gray-800/40"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect && onToggleSelect(t.id)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="font-mono text-xs font-bold text-brand-600 dark:text-brand-400">
                      {t.ticket_number}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${s.badgeBg}`}>{s.label}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] ${p.colorCls}`}>{p.label}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Employee</p>
                    <p className="font-bold text-gray-900 dark:text-white">{t.employee?.name || "—"}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400">{t.department || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">Assigned To</p>
                    <p className="font-semibold text-gray-800 dark:text-gray-200">{t.assignee?.name || "Unassigned"}</p>
                    <span className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[10px] ${sla.cls}`}>
                      <Clock size={10} /> {slaLabel(t)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[10px] font-medium text-gray-400">{formatDate(t.created_at)}</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => onSelectTicket && onSelectTicket(t.id)}
                      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 text-xs font-bold text-white shadow-xs transition active:scale-95"
                    >
                      <Eye size={13} /> View Ticket
                    </button>
                    {String(t.status).toLowerCase() === "closed" && (
                      <button
                        onClick={() => onDeleteTicket && onDeleteTicket(t.id)}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-3 text-xs font-bold text-white shadow-xs transition active:scale-95"
                      >
                        <Trash2 size={13} /> Delete
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

const selectCls =
  "rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200";
