import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  CalendarDays,
  Search,
  Eye,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Palmtree,
} from "lucide-react";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";

/**
 * Monthly Attendance View.
 *
 * Reads the same `/attendance/grid` data the legacy AttendanceView.jsx grid
 * uses (real punch-in/punch-out times, already populated for every synced
 * employee) instead of the new `/v1/attendance/monthly` engine, whose
 * `attendance_daily` table only fills in after someone runs
 * `POST /v1/attendance/recalculate` -- nothing schedules that job yet, so
 * that endpoint reliably comes back empty. This page trades the new
 * engine's calculated flags (late/OT/etc.) for data that's actually there.
 *
 * One compact grid row per employee for browsing. Searching down to a
 * single employee (or clicking "View" on a row) swaps the grid for a full
 * day-by-day report for that employee, with check-in/check-out per day.
 */
const STATUS_META = {
  present: {
    label: "Present",
    letter: "P",
    icon: CheckCircle2,
    cellCls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300",
    badgeCls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700",
  },
  absent: {
    label: "Absent",
    letter: "A",
    icon: XCircle,
    cellCls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
    badgeCls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700",
  },
  half_day: {
    label: "Half Day",
    letter: "H",
    icon: AlertCircle,
    cellCls: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300",
    badgeCls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700",
  },
  leave: {
    label: "Leave",
    letter: "L",
    icon: Palmtree,
    cellCls: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300",
    badgeCls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-300 dark:border-sky-700",
  },
  not_marked: {
    label: "Not Marked",
    letter: "·",
    icon: Clock,
    cellCls: "bg-gray-50 text-gray-300 dark:bg-gray-900 dark:text-gray-700",
    badgeCls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700",
  },
};

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

function weekdayLabel(year, month, day) {
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { weekday: "short" });
}

// Same identifier fallback chain the legacy AttendanceView.jsx grid uses --
// attendance rows can be keyed by emp_code, punching_no, form_no, or a
// `user_<id>` / raw id fallback for biometric-only punches.
function candidateKeys(emp) {
  const codeKey = String(emp.emp_code || emp.punching_no || emp.form_no || emp.id || "").trim();
  const trimmedKey = codeKey.replace(/^0+/, "");
  const punchingKey = emp.punching_no ? String(emp.punching_no).trim() : "";
  const formKey = emp.form_no ? String(emp.form_no).trim() : "";
  const userIdKey = emp.id ? `user_${emp.id}` : "";
  const rawIdKey = emp.id ? String(emp.id) : "";
  return [codeKey, trimmedKey, punchingKey, formKey, userIdKey, rawIdKey].filter(Boolean);
}

function lookup(map, keys) {
  for (const k of keys) {
    if (map[k]) return map[k];
  }
  return {};
}

export default function AttendanceMonthlyView() {
  const { user } = useAuth();
  const { companyId, isAllCompanies } = useCompany();

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId && companyId !== "all" ? companyId : "all-companies");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [attendanceDetails, setAttendanceDetails] = useState({});

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  async function load() {
    setLoading(true);
    try {
      const res = await salaryApi.getAttendanceGrid(user?.accessToken, user?.tokenType, {
        companyId: selectedCompanyId,
        unit: selectedUnit,
        month,
        year,
      });
      setEmployees(res?.data?.employees || []);
      setAttendanceMap(res?.data?.attendance || {});
      setAttendanceDetails(res?.data?.attendance_details || {});
    } catch (err) {
      toast.error(err.message || "Failed to load monthly attendance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, selectedCompanyId, selectedUnit, user?.accessToken, user?.tokenType]);

  function shiftMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m);
    setYear(y);
  }

  // One row per employee: resolved punch data for every day of the month,
  // plus present/absent/half-day/leave totals for the compact grid.
  const processedEmployees = useMemo(() => {
    return employees.map((emp) => {
      const keys = candidateKeys(emp);
      const empData = lookup(attendanceMap, keys);
      const empDetails = lookup(attendanceDetails, keys);

      const totals = { present: 0, absent: 0, half_day: 0, leave: 0 };
      dayNumbers.forEach((d) => {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const status = empData[dateStr];
        if (status && totals[status] !== undefined) totals[status] += 1;
      });

      return { ...emp, empData, empDetails, totals };
    });
  }, [employees, attendanceMap, attendanceDetails, dayNumbers, month, year]);

  // An exact emp_code match always wins (clicking "View" searches by exact
  // code), otherwise fall back to a loose name/code/department search.
  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return processedEmployees;

    const exact = processedEmployees.filter((e) => String(e.emp_code || "").toLowerCase() === q);
    if (exact.length === 1) return exact;

    return processedEmployees.filter((e) =>
      String(e.name || "").toLowerCase().includes(q) ||
      String(e.emp_code || "").toLowerCase().includes(q) ||
      String(e.department || "").toLowerCase().includes(q)
    );
  }, [processedEmployees, search]);

  const activeEmployee = filteredEmployees.length === 1 ? filteredEmployees[0] : null;

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-12 bg-gray-50/50 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200/80 dark:border-gray-800 pb-3">
        <div>
          <h1 className="text-lg font-extrabold text-gray-900 dark:text-white">Monthly Attendance View</h1>
          <p className="text-xs text-gray-400">One row per employee. Search or click "View" on a row for that employee's full day-by-day punch report.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => shiftMonth(-1)} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1.5">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="inline-flex items-center gap-1.5 text-sm font-bold min-w-[9rem] justify-center">
            <CalendarDays className="h-4 w-4 text-gray-400" /> {monthLabel(year, month)}
          </span>
          <button onClick={() => shiftMonth(1)} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-1.5">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold ml-2">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 p-3 shadow-sm flex flex-wrap items-end gap-2.5">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Company</label>
          <select value={selectedCompanyId} onChange={(e) => { setSelectedCompanyId(e.target.value); setSelectedUnit(""); }} disabled={!isAllCompanies} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs disabled:opacity-50">
            <option value="all-companies">Both Companies</option>
            {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Branch/Unit</label>
          <select value={selectedUnit} onChange={(e) => setSelectedUnit(e.target.value)} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
            <option value="">All Branches</option>
            {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Search Employee</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, code or department" className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 pl-8 pr-3 py-1.5 text-xs w-56" />
          </div>
        </div>
        {!activeEmployee && (
          <div className="ml-auto flex flex-wrap gap-3">
            {Object.entries(STATUS_META).map(([key, cfg]) => (
              <span key={key} className="inline-flex items-center gap-1 text-[10px] text-gray-500">
                <span className={`inline-flex h-4 w-5 items-center justify-center rounded text-[9px] font-bold ${cfg.cellCls}`}>{cfg.letter}</span>
                {cfg.label}
              </span>
            ))}
          </div>
        )}
      </div>

      {activeEmployee ? (
        <EmployeeMonthlyReport
          employee={activeEmployee}
          year={year}
          month={month}
          dayNumbers={dayNumbers}
          loading={loading}
          onBack={() => setSearch("")}
        />
      ) : (
        <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-x-auto">
          <table className="min-w-full text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-950 z-10">
              <tr>
                <th className="sticky left-0 bg-gray-50 dark:bg-gray-950 z-20 px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800 min-w-[11rem]">Employee</th>
                {dayNumbers.map((d) => (
                  <th key={d} className="px-1 py-2 text-center font-bold text-gray-400 border-b border-gray-200 dark:border-gray-800 w-8">{d}</th>
                ))}
                <th className="px-2 py-2 text-center font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800 min-w-[4.5rem]">Present</th>
                <th className="px-2 py-2 text-center font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800 min-w-[4.5rem]">Absent</th>
                <th className="px-2 py-2 text-center font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800 min-w-[3.5rem]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={dayNumbers.length + 3} className="py-12 text-center text-gray-400">Loading…</td></tr>
              ) : filteredEmployees.length === 0 ? (
                <tr><td colSpan={dayNumbers.length + 3} className="py-12 text-center text-gray-400">No employees match the current filters.</td></tr>
              ) : (
                filteredEmployees.map((emp) => (
                  <tr key={emp.id || emp.emp_code} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="sticky left-0 bg-white dark:bg-gray-900 z-10 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
                      <div className="font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[10rem]">{emp.name || "—"}</div>
                      <div className="text-[10px] text-gray-400">{emp.emp_code}{emp.department ? ` · ${emp.department}` : ""}</div>
                    </td>
                    {dayNumbers.map((d) => {
                      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                      const status = emp.empData[dateStr] || "not_marked";
                      const cfg = STATUS_META[status] || STATUS_META.not_marked;
                      const detail = emp.empDetails[dateStr];
                      const title = detail
                        ? `${cfg.label}${detail.check_in ? ` · In ${detail.check_in}` : ""}${detail.check_out ? ` · Out ${detail.check_out}` : ""}`
                        : cfg.label;
                      return (
                        <td key={d} className="px-0.5 py-1.5 text-center border-b border-gray-100 dark:border-gray-800">
                          <span title={title} className={`inline-flex h-5 w-6 items-center justify-center rounded text-[9px] font-bold ${cfg.cellCls}`}>
                            {cfg.letter}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-center border-b border-gray-100 dark:border-gray-800 font-semibold text-emerald-700 dark:text-emerald-400">{emp.totals.present}</td>
                    <td className="px-2 py-1.5 text-center border-b border-gray-100 dark:border-gray-800 font-semibold text-red-700 dark:text-red-400">{emp.totals.absent}</td>
                    <td className="px-2 py-1.5 text-center border-b border-gray-100 dark:border-gray-800">
                      <button
                        onClick={() => setSearch(String(emp.emp_code || ""))}
                        title="View full monthly punch report"
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-[10px] font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30"
                      >
                        <Eye className="h-3 w-3" /> View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="text-[11px] text-gray-400">
        {activeEmployee ? 1 : filteredEmployees.length} employee(s) shown for {monthLabel(year, month)}.
      </div>
    </div>
  );
}

function EmployeeMonthlyReport({ employee, year, month, dayNumbers, loading, onBack }) {
  const totals = employee.totals;
  const notMarked = dayNumbers.length - totals.present - totals.absent - totals.half_day - totals.leave;

  return (
    <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> All Employees
          </button>
          <div>
            <div className="font-bold text-gray-900 dark:text-white text-sm">{employee.name || "—"}</div>
            <div className="text-[11px] text-gray-400">
              Code: {employee.emp_code} {employee.department ? `· ${employee.department}` : ""} {employee.unit ? `· ${employee.unit}` : ""}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <SummaryChip label="Present" value={totals.present} cls="text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-800" />
          <SummaryChip label="Absent" value={totals.absent} cls="text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800" />
          <SummaryChip label="Half Day" value={totals.half_day} cls="text-purple-700 bg-purple-50 border-purple-200 dark:text-purple-300 dark:bg-purple-950/40 dark:border-purple-800" />
          <SummaryChip label="Leave" value={totals.leave} cls="text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950/40 dark:border-sky-800" />
          <SummaryChip label="Not Marked" value={notMarked} cls="text-slate-600 bg-slate-50 border-slate-200 dark:text-slate-400 dark:bg-slate-900/40 dark:border-slate-700" />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-gray-100/80 dark:bg-gray-800/80 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 uppercase tracking-wider font-bold text-[11px]">
              <th className="py-2.5 px-4">Date</th>
              <th className="py-2.5 px-3">Day</th>
              <th className="py-2.5 px-3">Status</th>
              <th className="py-2.5 px-3">Check-In</th>
              <th className="py-2.5 px-3">Check-Out</th>
              <th className="py-2.5 px-3">Work Hours</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center text-gray-400">Loading…</td></tr>
            ) : (
              dayNumbers.map((d) => {
                const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
                const status = employee.empData[dateStr] || "not_marked";
                const cfg = STATUS_META[status] || STATUS_META.not_marked;
                const detail = employee.empDetails[dateStr] || {};
                const StatusIcon = cfg.icon;
                const isWeekend = new Date(year, month - 1, d).getDay() === 0;

                return (
                  <tr key={d} className={isWeekend ? "bg-red-50/30 dark:bg-red-950/10" : ""}>
                    <td className="py-2 px-4 font-mono font-medium text-gray-700 dark:text-gray-300">
                      {String(d).padStart(2, "0")}/{String(month).padStart(2, "0")}/{year}
                    </td>
                    <td className={`py-2 px-3 ${isWeekend ? "text-red-500 font-semibold" : "text-gray-500"}`}>{weekdayLabel(year, month, d)}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${cfg.badgeCls}`}>
                        <StatusIcon className="h-3 w-3" />
                        {cfg.label}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] text-gray-700 dark:text-gray-300">{detail.check_in || "—"}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-gray-700 dark:text-gray-300">{detail.check_out || "—"}</td>
                    <td className="py-2 px-3 font-mono text-[11px] text-gray-700 dark:text-gray-300">
                      {detail.work_hours !== undefined && detail.work_hours !== null ? `${Number(detail.work_hours).toFixed(1)} hrs` : "—"}
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

function SummaryChip({ label, value, cls }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold ${cls}`}>
      {label}: <span className="font-bold">{value}</span>
    </span>
  );
}
