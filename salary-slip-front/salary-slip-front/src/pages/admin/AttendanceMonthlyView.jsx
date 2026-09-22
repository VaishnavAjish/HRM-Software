import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { ChevronLeft, ChevronRight, RefreshCw, CalendarDays } from "lucide-react";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";

/**
 * Attendance Engine Rebuild -- Monthly Attendance View (spec S34).
 * A NEW page at a NEW route, reading /v1/attendance/monthly (the calculated
 * layer). Does not touch the legacy AttendanceView.jsx grid at all.
 *
 * One row per employee, one compact cell per calendar day. Cells intentionally
 * do not open the full detail drawer here -- the monthly endpoint returns a
 * lightweight per-day projection (status + flags + worked_minutes only, no
 * attendance_daily id) by design, to keep a 31-day x N-employee response
 * small; use the Control Center's daily table + drawer for full per-day detail.
 */
const CELL_CONFIG = {
  PRESENT: { label: "P", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300" },
  HALF_DAY: { label: "H", cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/50 dark:text-purple-300" },
  ABSENT: { label: "A", cls: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300" },
  MISSING_CHECKOUT: { label: "MC", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300" },
  MISSING_CHECKIN: { label: "MC", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300" },
  WEEKLY_OFF: { label: "WO", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
  HOLIDAY: { label: "HO", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300" },
  HOLIDAY_WORKED: { label: "HW", cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-300" },
  ON_LEAVE: { label: "L", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300" },
  PENDING_REVIEW: { label: "?", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300" },
};
const EMPTY_CELL_CLS = "bg-gray-50 text-gray-300 dark:bg-gray-900 dark:text-gray-700";

function monthLabel(year, month) {
  return new Date(year, month - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
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

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayNumbers = useMemo(() => Array.from({ length: daysInMonth }, (_, i) => i + 1), [daysInMonth]);

  async function load() {
    setLoading(true);
    try {
      const res = await salaryApi.getAttendanceMonthly(
        {
          month,
          year,
          company_code: selectedCompanyId === "all-companies" ? "" : selectedCompanyId,
          unit: selectedUnit,
        },
        user?.accessToken,
        user?.tokenType
      );
      const payload = res?.data?.data || res?.data || {};
      setEmployees(Array.isArray(payload.employees) ? payload.employees : []);
    } catch (err) {
      toast.error(err.message || "Failed to load monthly attendance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year, selectedCompanyId, selectedUnit]);

  function shiftMonth(delta) {
    let m = month + delta;
    let y = year;
    if (m > 12) { m = 1; y += 1; }
    if (m < 1) { m = 12; y -= 1; }
    setMonth(m);
    setYear(y);
  }

  const filteredEmployees = useMemo(() => {
    if (!search.trim()) return employees;
    const q = search.trim().toLowerCase();
    return employees.filter((e) => (e.user?.name || "").toLowerCase().includes(q) || (e.user?.emp_code || "").toLowerCase().includes(q));
  }, [employees, search]);

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-12 bg-gray-50/50 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200/80 dark:border-gray-800 pb-3">
        <div>
          <h1 className="text-lg font-extrabold text-gray-900 dark:text-white">Monthly Attendance View</h1>
          <p className="text-xs text-gray-400">One row per employee, calculated status per calendar day — engine v1</p>
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
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or emp code" className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs w-48" />
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {Object.entries(CELL_CONFIG).map(([key, cfg]) => (
            <span key={key} className="inline-flex items-center gap-1 text-[10px] text-gray-500">
              <span className={`inline-flex h-4 w-5 items-center justify-center rounded text-[9px] font-bold ${cfg.cls}`}>{cfg.label}</span>
              {key.replace(/_/g, " ")}
            </span>
          ))}
        </div>
      </div>

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
              <th className="px-2 py-2 text-center font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800 min-w-[4.5rem]">OT (m)</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={dayNumbers.length + 4} className="py-12 text-center text-gray-400">Loading…</td></tr>
            ) : filteredEmployees.length === 0 ? (
              <tr><td colSpan={dayNumbers.length + 4} className="py-12 text-center text-gray-400">No attendance calculated for this month yet. Run recalculation first.</td></tr>
            ) : (
              filteredEmployees.map((emp) => (
                <tr key={emp.user?.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="sticky left-0 bg-white dark:bg-gray-900 z-10 px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
                    <div className="font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[10rem]">{emp.user?.name || "—"}</div>
                    <div className="text-[10px] text-gray-400">{emp.user?.emp_code}</div>
                  </td>
                  {dayNumbers.map((d) => {
                    const day = emp.days?.[String(d)];
                    const cfg = day ? CELL_CONFIG[day.status] : null;
                    const title = day ? `${day.status}${day.is_late ? " · Late" : ""}${day.is_overtime ? " · OT" : ""}${day.worked_minutes != null ? ` · ${Math.round(day.worked_minutes / 6) / 10}h` : ""}` : "No data";
                    return (
                      <td key={d} className="px-0.5 py-1.5 text-center border-b border-gray-100 dark:border-gray-800">
                        <span title={title} className={`inline-flex h-5 w-6 items-center justify-center rounded text-[9px] font-bold ${cfg ? cfg.cls : EMPTY_CELL_CLS}`}>
                          {cfg ? cfg.label : "·"}
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center border-b border-gray-100 dark:border-gray-800 font-semibold text-emerald-700 dark:text-emerald-400">{emp.totals?.present ?? 0}</td>
                  <td className="px-2 py-1.5 text-center border-b border-gray-100 dark:border-gray-800 font-semibold text-red-700 dark:text-red-400">{emp.totals?.absent ?? 0}</td>
                  <td className="px-2 py-1.5 text-center border-b border-gray-100 dark:border-gray-800 font-semibold text-indigo-700 dark:text-indigo-400">{emp.totals?.overtime_minutes ?? 0}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="text-[11px] text-gray-400">{filteredEmployees.length} employee(s) shown for {monthLabel(year, month)}.</div>
    </div>
  );
}
