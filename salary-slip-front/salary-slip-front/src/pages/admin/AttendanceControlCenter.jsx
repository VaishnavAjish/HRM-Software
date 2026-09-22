import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { RotateCcw, Beaker, RefreshCw, Fingerprint, Loader2, Building2 } from "lucide-react";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";
import AttendanceKpiGrid from "../../features/attendance/components/AttendanceKpiGrid";
import AttendanceTable from "../../features/attendance/components/AttendanceTable";
import AttendanceDetailDrawer from "../../features/attendance/components/AttendanceDetailDrawer";
import RuleSimulator from "../../features/attendance/components/RuleSimulator";

/**
 * Attendance Engine Rebuild -- "Daily Attendance Control Center" (spec S28,
 * S70). A NEW page at a NEW route -- the existing /admin/attendance page
 * (AttendanceView.jsx) is completely untouched and keeps working. This page
 * reads from the new /v1/attendance/* endpoints (the calculated
 * `attendance_daily` layer), not the legacy /attendance/grid endpoint.
 *
 * Deliberately does not yet reimplement every S28-S54 UI requirement. The
 * monthly grid (AttendanceMonthlyView.jsx) and raw-punches + device-health
 * page (AttendanceRawPunches.jsx) are now separate screens, both built and
 * linked from the same "Attendance" nav group. The 12 report types,
 * dashboard analytics/charts, and the employee self-service attendance
 * profile view are still not built -- see the delivery report for exactly
 * what is and isn't covered.
 */
export default function AttendanceControlCenter() {
  const { user } = useAuth();
  const { companyId, isAllCompanies } = useCompany();

  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId && companyId !== "all" ? companyId : "all-companies");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState(null);
  const [sortField, setSortField] = useState("emp_code");
  const [sortDirection, setSortDirection] = useState("asc");

  const [rows, setRows] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [employees, setEmployees] = useState([]);

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];

  async function load() {
    setLoading(true);
    try {
      const res = await salaryApi.getAttendanceDaily(
        {
          date,
          company_code: selectedCompanyId === "all-companies" ? "" : selectedCompanyId,
          unit: selectedUnit,
          status: statusFilter || "",
          per_page: 200,
        },
        user?.accessToken,
        user?.tokenType
      );
      const data = res?.data?.data || res?.data || [];
      setRows(Array.isArray(data) ? data : data.data || []);
      setMeta(res?.data?.meta || null);
      setEmployees((Array.isArray(data) ? data : data.data || []).map((r) => r.user).filter(Boolean));
    } catch (err) {
      toast.error(err.message || "Failed to load attendance data. If this is the first run, ask an admin to run POST /v1/attendance/recalculate for this date first.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, selectedCompanyId, selectedUnit, statusFilter]);

  const totals = useMemo(() => {
    const t = { total: rows.length, present: 0, absent: 0, half_day: 0, on_leave: 0, weekly_off: 0, holiday: 0, holiday_worked: 0, late: 0, early_exit: 0, missing_punch: 0, overtime: 0 };
    rows.forEach((r) => {
      if (r.primary_status === "PRESENT") t.present++;
      else if (r.primary_status === "ABSENT") t.absent++;
      else if (r.primary_status === "HALF_DAY") t.half_day++;
      else if (r.primary_status === "ON_LEAVE") t.on_leave++;
      else if (r.primary_status === "WEEKLY_OFF") t.weekly_off++;
      else if (r.primary_status === "HOLIDAY") t.holiday++;
      else if (r.primary_status === "HOLIDAY_WORKED") t.holiday_worked++;
      else if (r.primary_status === "MISSING_CHECKOUT" || r.primary_status === "MISSING_CHECKIN") t.missing_punch++;
      if (r.is_late) t.late++;
      if (r.is_early_exit) t.early_exit++;
      if (r.is_overtime) t.overtime++;
    });
    return t;
  }, [rows]);

  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      const valA = sortField === "emp_code" ? (a.user?.emp_code || a.emp_code_raw || "") : a[sortField] ?? "";
      const valB = sortField === "emp_code" ? (b.user?.emp_code || b.emp_code_raw || "") : b[sortField] ?? "";
      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [rows, sortField, sortDirection]);

  function handleSort(field) {
    if (sortField === field) setSortDirection((p) => (p === "asc" ? "desc" : "asc"));
    else { setSortField(field); setSortDirection("asc"); }
  }

  async function handleSyncAndRecalculate() {
    setSyncing(true);
    try {
      const syncRes = await salaryApi.syncEsslAttendance(
        { month: Number(date.slice(5, 7)), year: Number(date.slice(0, 4)), start_date: date, end_date: date, company_code: selectedCompanyId === "all-companies" ? "" : selectedCompanyId },
        user?.accessToken,
        user?.tokenType
      );
      if (!syncRes?.status) throw new Error(syncRes?.message || "Sync failed");
      toast.success(syncRes.message || "Biometric sync complete");

      setRecalculating(true);
      await salaryApi.recalculateAttendance(
        { company_code: selectedCompanyId === "all-companies" ? "" : selectedCompanyId, unit: selectedUnit || undefined, date },
        user?.accessToken,
        user?.tokenType
      );
      toast.success("Attendance recalculated from raw punches");
      await load();
    } catch (err) {
      toast.error(err.message || "Sync/recalculate failed");
    } finally {
      setSyncing(false);
      setRecalculating(false);
    }
  }

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-12 bg-gray-50/50 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200/80 dark:border-gray-800 pb-3">
        <div>
          <h1 className="text-lg font-extrabold text-gray-900 dark:text-white">Attendance Control Center</h1>
          <p className="text-xs text-gray-400">Calculated from raw biometric punches, shift &amp; rule hierarchy — engine v1</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setSimulatorOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50 dark:bg-violet-950/50 px-3 py-1.5 text-xs font-semibold text-violet-700 dark:text-violet-300"
          >
            <Beaker className="h-3.5 w-3.5" /> Rule Simulator
          </button>
          <button
            onClick={handleSyncAndRecalculate}
            disabled={syncing || recalculating}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60"
          >
            {syncing || recalculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
            {syncing ? "Syncing..." : recalculating ? "Recalculating..." : "Sync &amp; Recalculate"}
          </button>
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      <AttendanceKpiGrid totals={totals} activeStatus={statusFilter} onFilter={(k) => setStatusFilter((prev) => (prev === k ? null : k))} />

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
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Date</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
        </div>
        {statusFilter && (
          <button onClick={() => setStatusFilter(null)} className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 ml-auto">
            <RotateCcw className="h-3 w-3" /> Clear status filter ({statusFilter})
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden">
        {!selectedCompanyId ? (
          <div className="py-20 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
            <Building2 className="h-8 w-8 text-gray-300" /> Select a company to view attendance.
          </div>
        ) : (
          <AttendanceTable
            rows={sortedRows}
            loading={loading}
            onView={(r) => setDetailId(r.id)}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={handleSort}
          />
        )}
      </div>

      {meta && (
        <div className="text-[11px] text-gray-400">
          Showing {rows.length} of {meta.total ?? rows.length} record(s) for {date}.
        </div>
      )}

      <AttendanceDetailDrawer recordId={detailId} onClose={() => setDetailId(null)} />
      <RuleSimulator isOpen={simulatorOpen} onClose={() => setSimulatorOpen(false)} employees={employees} />
    </div>
  );
}
