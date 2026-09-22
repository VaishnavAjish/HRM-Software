import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar,
} from "recharts";
import {
  Users, UserCheck, UserX, Clock, LogOut, TimerReset, Palmtree, FileWarning, RefreshCw,
  FileDown, FileText, ChevronDown,
} from "lucide-react";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";

/**
 * Attendance Engine Rebuild -- Reports & Dashboard (spec S71's "12 report
 * types" + dashboard analytics). A NEW page at a NEW route, reading the new
 * /v1/attendance/dashboard and /v1/attendance/reports/{type}(/export)
 * endpoints -- purely additive, no change to any existing page.
 */
const REPORT_TYPES = [
  { value: "daily", label: "Daily Attendance" },
  { value: "monthly_summary", label: "Monthly Summary" },
  { value: "late_comers", label: "Late Comers" },
  { value: "early_leavers", label: "Early Leavers" },
  { value: "absentees", label: "Absentees" },
  { value: "overtime", label: "Overtime" },
  { value: "missing_punch", label: "Missing Punch" },
  { value: "regularizations", label: "Regularizations" },
  { value: "leave_vs_attendance", label: "Leave vs Attendance" },
  { value: "department_summary", label: "Department Summary" },
  { value: "employee_register", label: "Employee Register" },
  { value: "reconciliation", label: "Sync Reconciliation" },
];

function KpiCard({ icon: Icon, label, value, cls }) {
  return (
    <div className="rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${cls}`}><Icon className="h-4.5 w-4.5" /></div>
      <div>
        <div className="text-lg font-extrabold text-gray-900 dark:text-white leading-none">{value ?? "—"}</div>
        <div className="text-[10px] font-semibold text-gray-400 uppercase mt-1">{label}</div>
      </div>
    </div>
  );
}

export default function AttendanceReportsCenter() {
  const { user } = useAuth();
  const { companyId, isAllCompanies } = useCompany();

  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId && companyId !== "all" ? companyId : "all-companies");
  const [dateFrom, setDateFrom] = useState(new Date(new Date().setDate(1)).toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(new Date().toISOString().slice(0, 10));

  const [dashboard, setDashboard] = useState(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const [reportType, setReportType] = useState("monthly_summary");
  const [employeeId, setEmployeeId] = useState("");
  const [reportData, setReportData] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null);

  const companyParam = selectedCompanyId === "all-companies" ? "" : selectedCompanyId;

  async function loadDashboard() {
    setLoadingDashboard(true);
    try {
      const res = await salaryApi.getAttendanceDashboard(
        { date_from: dateFrom, date_to: dateTo, company_code: companyParam },
        user?.accessToken,
        user?.tokenType
      );
      setDashboard(res?.data?.data || res?.data || null);
    } catch (err) {
      toast.error(err.message || "Failed to load dashboard.");
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function loadReport() {
    setLoadingReport(true);
    try {
      const res = await salaryApi.getAttendanceReport(
        reportType,
        { date_from: dateFrom, date_to: dateTo, company_code: companyParam, employee_id: employeeId || undefined },
        user?.accessToken,
        user?.tokenType
      );
      setReportData(res?.data?.data || res?.data || null);
    } catch (err) {
      toast.error(err.message || "Failed to load report.");
    } finally {
      setLoadingReport(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateFrom, dateTo, selectedCompanyId]);

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportType, dateFrom, dateTo, selectedCompanyId, employeeId]);

  async function handleExport(format) {
    if (reportType === "employee_register" && !employeeId) {
      toast.error("Employee Register needs an Employee ID — enter one first.");
      return;
    }
    setExportingFormat(format);
    try {
      await salaryApi.exportAttendanceReport(
        reportType,
        { date_from: dateFrom, date_to: dateTo, company_code: companyParam, employee_id: employeeId || undefined },
        user?.accessToken,
        user?.tokenType,
        format
      );
      toast.success(`${format.toUpperCase()} downloaded.`);
    } catch (err) {
      toast.error(err.message || `Failed to export as ${format.toUpperCase()}.`);
    } finally {
      setExportingFormat(null);
    }
  }

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  void activeCompanyConfig;

  const trendData = useMemo(() => {
    const t = dashboard?.trend;
    if (!t) return [];
    return Array.isArray(t) ? t : Object.values(t);
  }, [dashboard]);

  const statusBreakdown = useMemo(() => {
    const b = dashboard?.statusBreakdown;
    if (!b) return [];
    return Object.entries(b).map(([status, count]) => ({ status, count }));
  }, [dashboard]);

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-12 bg-gray-50/50 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200/80 dark:border-gray-800 pb-3">
        <div>
          <h1 className="text-lg font-extrabold text-gray-900 dark:text-white">Attendance Reports &amp; Dashboard</h1>
          <p className="text-xs text-gray-400">12 report types with CSV/PDF export, plus aggregate analytics — engine v1</p>
        </div>
        <button onClick={() => { loadDashboard(); loadReport(); }} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold">
          <RefreshCw className={`h-3.5 w-3.5 ${loadingDashboard || loadingReport ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 p-3 shadow-sm flex flex-wrap items-end gap-2.5">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Company</label>
          <select value={selectedCompanyId} onChange={(e) => setSelectedCompanyId(e.target.value)} disabled={!isAllCompanies} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs disabled:opacity-50">
            <option value="all-companies">Both Companies</option>
            {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">From</label>
          <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">To</label>
          <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
        </div>
      </div>

      {/* --------------------------------------------------------------- Dashboard */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
        <KpiCard icon={Users} label="Active Employees" value={dashboard?.kpis?.activeEmployees} cls="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" />
        <KpiCard icon={UserCheck} label="Present" value={dashboard?.kpis?.present} cls="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" />
        <KpiCard icon={UserX} label="Absent" value={dashboard?.kpis?.absent} cls="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" />
        <KpiCard icon={Clock} label="Late" value={dashboard?.kpis?.late} cls="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" />
        <KpiCard icon={LogOut} label="Early Exit" value={dashboard?.kpis?.earlyExit} cls="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" />
        <KpiCard icon={TimerReset} label="Overtime Hrs" value={dashboard?.kpis?.overtimeHours} cls="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300" />
        <KpiCard icon={Palmtree} label="On Leave" value={dashboard?.kpis?.onLeave} cls="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" />
        <KpiCard icon={FileWarning} label="Missing Punch" value={dashboard?.kpis?.missingPunch} cls="bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" />
        <KpiCard icon={FileText} label="Pending Regularizations" value={dashboard?.kpis?.pendingRegularizations} cls="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" />
        <KpiCard icon={Users} label="Total Records" value={dashboard?.kpis?.totalRecords} cls="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-sm">
          <h3 className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">Daily Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trendData}>
              <defs>
                <linearGradient id="presentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="absentGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Area type="monotone" dataKey="present" stroke="#10b981" fill="url(#presentGrad)" strokeWidth={2} />
              <Area type="monotone" dataKey="absent" stroke="#ef4444" fill="url(#absentGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-sm">
          <h3 className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={statusBreakdown}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="status" tick={{ fontSize: 9 }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip contentStyle={{ fontSize: 11, borderRadius: 8 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {dashboard?.topLateEmployees?.length > 0 && (
        <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-sm">
          <h3 className="text-xs font-bold text-gray-600 dark:text-gray-300 mb-2">Top Late Employees</h3>
          <div className="flex flex-wrap gap-2">
            {dashboard.topLateEmployees.map((t) => (
              <span key={t.user?.id} className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 text-[11px] font-semibold text-amber-800 dark:text-amber-300">
                {t.user?.name} <span className="text-amber-500">×{t.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* --------------------------------------------------------------- Report picker */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm">
        <div className="flex flex-wrap items-end gap-2.5 p-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Report Type</label>
            <div className="relative">
              <select value={reportType} onChange={(e) => setReportType(e.target.value)} className="appearance-none rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 pl-2 pr-7 py-1.5 text-xs font-semibold w-56">
                {REPORT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <ChevronDown className="h-3.5 w-3.5 absolute right-2 top-2 text-gray-400 pointer-events-none" />
            </div>
          </div>
          {reportType === "employee_register" && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Employee ID (required)</label>
              <input value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} placeholder="e.g. 42" className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs w-32" />
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <button onClick={() => handleExport("csv")} disabled={!!exportingFormat} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
              <FileDown className="h-3.5 w-3.5" /> {exportingFormat === "csv" ? "Exporting…" : "Export CSV"}
            </button>
            <button onClick={() => handleExport("pdf")} disabled={!!exportingFormat} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold disabled:opacity-60">
              <FileText className="h-3.5 w-3.5" /> {exportingFormat === "pdf" ? "Exporting…" : "Export PDF"}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 dark:bg-gray-950">
              <tr>
                {reportData?.columns && Object.values(reportData.columns).map((label) => (
                  <th key={label} className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800 whitespace-nowrap">{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loadingReport ? (
                <tr><td className="py-12 text-center text-gray-400">Loading…</td></tr>
              ) : !reportData?.rows?.length ? (
                <tr><td className="py-12 text-center text-gray-400">
                  {reportType === "employee_register" && !employeeId ? "Enter an Employee ID above to view this report." : "No records match this filter."}
                </td></tr>
              ) : (
                reportData.rows.map((row, i) => (
                  <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    {Object.keys(reportData.columns).map((key) => (
                      <td key={key} className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 whitespace-nowrap">
                        {typeof row[key] === "boolean" ? (row[key] ? "Yes" : "No") : (row[key] ?? "—")}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {reportData?.rows?.length > 0 && (
          <div className="p-2.5 text-[11px] text-gray-400 border-t border-gray-100 dark:border-gray-800">{reportData.rows.length} record(s)</div>
        )}
      </div>
    </div>
  );
}
