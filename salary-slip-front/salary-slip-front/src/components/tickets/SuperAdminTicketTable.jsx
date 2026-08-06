import React, { useState } from "react";
import {
  Eye, CheckSquare, Square, MoreVertical, ShieldAlert, ArrowUpRight,
  UserCheck, Download, Trash2, Tag, CornerUpRight, RefreshCw, Send
} from "lucide-react";
import { statusMeta, priorityMeta, slaMeta, formatDateTime } from "./ticketMeta";

export default function SuperAdminTicketTable({
  tickets = [],
  loading = false,
  onOpenTicket,
  onBulkAction,
  selectedIds = [],
  onToggleSelect,
  onToggleSelectAll,
}) {
  const [activeMenuId, setActiveMenuId] = useState(null);

  const allSelected = tickets.length > 0 && selectedIds.length === tickets.length;

  return (
    <div className="space-y-3">
      {/* Bulk Operations Bar */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-purple-900 to-slate-900 p-3.5 text-white shadow-lg animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-500/20 font-bold text-purple-300 text-xs">
              {selectedIds.length}
            </span>
            <span className="text-xs font-semibold">Tickets Selected</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <button
              onClick={() => onBulkAction && onBulkAction("bulk_assign", selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 font-semibold text-white transition hover:bg-purple-700"
            >
              <UserCheck size={14} /> Bulk Assign
            </button>
            <button
              onClick={() => onBulkAction && onBulkAction("bulk_escalate", selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 font-semibold text-white transition hover:bg-red-700"
            >
              <ShieldAlert size={14} /> Escalate Selected
            </button>
            <button
              onClick={() => onBulkAction && onBulkAction("bulk_close", selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-gray-700 px-3 py-1.5 font-semibold text-white transition hover:bg-gray-800"
            >
              <CornerUpRight size={14} /> Bulk Close
            </button>
            <button
              onClick={() => onBulkAction && onBulkAction("bulk_export", selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white transition hover:bg-emerald-700"
            >
              <Download size={14} /> Export Selected
            </button>
            <button
              onClick={() => onBulkAction && onBulkAction("bulk_delete", selectedIds)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-900/60 px-3 py-1.5 font-semibold text-rose-200 hover:bg-rose-900"
            >
              <Trash2 size={14} /> Soft Delete
            </button>
          </div>
        </div>
      )}

      {/* Main 16-Column Ticket Table */}
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-gray-100 bg-gray-50/80 uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-slate-900/60 dark:text-gray-400">
            <tr>
              <th className="p-3 w-10 text-center">
                <button onClick={onToggleSelectAll} className="text-gray-400 hover:text-gray-600">
                  {allSelected ? <CheckSquare size={16} className="text-purple-600" /> : <Square size={16} />}
                </button>
              </th>
              <th className="p-3 font-bold">Ticket #</th>
              <th className="p-3 font-bold">Employee</th>
              <th className="p-3 font-bold">Code</th>
              <th className="p-3 font-bold">Company</th>
              <th className="p-3 font-bold">Branch</th>
              <th className="p-3 font-bold">Department</th>
              <th className="p-3 font-bold">Reporting Manager</th>
              <th className="p-3 font-bold">Category</th>
              <th className="p-3 font-bold">Priority</th>
              <th className="p-3 font-bold">Current Level</th>
              <th className="p-3 font-bold">Assigned To</th>
              <th className="p-3 font-bold">Status</th>
              <th className="p-3 font-bold">Created</th>
              <th className="p-3 font-bold">SLA Due</th>
              <th className="p-3 text-center font-bold">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {loading ? (
              <tr>
                <td colSpan={16} className="p-8 text-center text-gray-400">
                  <RefreshCw size={24} className="mx-auto animate-spin text-purple-600" />
                  <p className="mt-2 font-medium">Loading Super Admin Ticket Queue…</p>
                </td>
              </tr>
            ) : tickets.length === 0 ? (
              <tr>
                <td colSpan={16} className="p-10 text-center text-gray-400">
                  No tickets found matching your query or filter scope.
                </td>
              </tr>
            ) : (
              tickets.map((t) => {
                const isChecked = selectedIds.includes(t.id);
                const sMeta = statusMeta(t.status);
                const pMeta = priorityMeta(t.priority);
                const sla = slaMeta(t.sla_status || "on_track");

                return (
                  <tr
                    key={t.id}
                    className={`transition hover:bg-gray-50/70 dark:hover:bg-white/[0.02] ${
                      isChecked ? "bg-purple-50/40 dark:bg-purple-900/10" : ""
                    }`}
                  >
                    <td className="p-3 text-center">
                      <button onClick={() => onToggleSelect && onToggleSelect(t.id)} className="text-gray-400 hover:text-gray-600">
                        {isChecked ? <CheckSquare size={16} className="text-purple-600" /> : <Square size={16} />}
                      </button>
                    </td>

                    <td className="p-3 font-bold text-gray-900 dark:text-white whitespace-nowrap">
                      <button
                        onClick={() => onOpenTicket(t.id)}
                        className="font-mono text-purple-600 hover:underline dark:text-purple-400"
                      >
                        {t.ticket_number || `#TCK-${t.id}`}
                      </button>
                    </td>

                    <td className="p-3 font-semibold text-gray-800 dark:text-gray-200 whitespace-nowrap">
                      {t.employee_name || t.user_name || "John Doe"}
                    </td>

                    <td className="p-3 font-mono text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {t.employee_code || "EMP-1001"}
                    </td>

                    <td className="p-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {t.company_code || "NIDHI IMPEX"}
                    </td>

                    <td className="p-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {t.unit || t.branch || "Surat HO"}
                    </td>

                    <td className="p-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {t.department || "IT Dept"}
                    </td>

                    <td className="p-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {t.reporting_manager || "Rajesh Sharma"}
                    </td>

                    <td className="p-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium dark:bg-gray-800">
                        {t.category_name || "Hardware"}
                      </span>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] ${pMeta.colorCls}`}>
                        {pMeta.label}
                      </span>
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-amber-600 dark:text-amber-400">
                        {t.current_level || "Level 2 (Dept Head)"}
                      </span>
                    </td>

                    <td className="p-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                      {t.assigned_to_name || "Super Admin (Unassigned)"}
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] ${sMeta.badgeBg}`}>
                        {sMeta.label}
                      </span>
                    </td>

                    <td className="p-3 text-[11px] text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {formatDateTime(t.created_at)}
                    </td>

                    <td className="p-3 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] ${sla.cls}`}>
                        {formatDateTime(t.sla_due_time || t.due_at)} ({sla.label})
                      </span>
                    </td>

                    <td className="p-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => onOpenTicket(t.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-purple-100 px-2.5 py-1 text-xs font-bold text-purple-700 hover:bg-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
                      >
                        <Eye size={13} /> View
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
