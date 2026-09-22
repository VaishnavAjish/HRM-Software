import { Eye } from "lucide-react";
import AttendanceStatusBadge, { AttendanceFlagChips } from "./AttendanceStatusBadge";

function fmtMinutes(mins) {
  if (mins === null || mins === undefined) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function fmtTime(dt) {
  if (!dt) return "—";
  return new Date(dt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * Attendance Engine Rebuild -- spec S29's redesigned table, reading from
 * `attendance_daily` rows (already-calculated, never computed client-side).
 */
export default function AttendanceTable({ rows, loading, onView, sortField, sortDirection, onSort }) {
  const headers = [
    { key: null, label: "Employee" },
    { key: "emp_code", label: "Code" },
    { key: null, label: "Department" },
    { key: null, label: "Shift" },
    { key: "first_punch_at", label: "First In" },
    { key: "last_punch_at", label: "Last Out" },
    { key: "worked_minutes", label: "Worked" },
    { key: "primary_status", label: "Status" },
    { key: null, label: "Source" },
    { key: null, label: "Actions" },
  ];

  if (loading) {
    return <div className="py-16 text-center text-sm text-gray-400">Loading attendance data...</div>;
  }
  if (!rows || rows.length === 0) {
    return <div className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">No attendance records for the current filters.</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead>
          <tr className="sticky top-0 z-10 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 uppercase tracking-wider font-bold text-[11px]">
            {headers.map((h) => (
              <th
                key={h.label}
                className={`py-3 px-3 ${h.key ? "cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60" : ""}`}
                onClick={() => h.key && onSort && onSort(h.key)}
              >
                {h.label} {h.key && sortField === h.key ? (sortDirection === "asc" ? "↑" : "↓") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
          {rows.map((r, idx) => (
            <tr key={r.id} className={idx % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/30 dark:bg-gray-900/40"}>
              <td className="py-2.5 px-3">
                <div className="font-semibold text-gray-900 dark:text-white">{r.user?.name || "—"}</div>
                <AttendanceFlagChips record={r} />
              </td>
              <td className="py-2.5 px-3 font-mono">{r.user?.emp_code || r.emp_code_raw || "—"}</td>
              <td className="py-2.5 px-3">{r.department || r.user?.department || "—"}</td>
              <td className="py-2.5 px-3">{r.shift?.name || "—"}</td>
              <td className="py-2.5 px-3 font-mono">{fmtTime(r.first_punch_at)}</td>
              <td className="py-2.5 px-3 font-mono">{fmtTime(r.last_punch_at)}</td>
              <td className="py-2.5 px-3 font-mono">{fmtMinutes(r.worked_minutes)}</td>
              <td className="py-2.5 px-3"><AttendanceStatusBadge status={r.primary_status} /></td>
              <td className="py-2.5 px-3 text-[11px] text-gray-500">{r.source}</td>
              <td className="py-2.5 px-3 text-right">
                <button
                  onClick={() => onView(r)}
                  className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                >
                  <Eye className="h-3.5 w-3.5" /> View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
