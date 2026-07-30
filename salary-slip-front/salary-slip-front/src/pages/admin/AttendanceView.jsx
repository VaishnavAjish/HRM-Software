import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Building2,
  Loader2,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Palmtree,
  CalendarDays as CalendarIcon,
} from "lucide-react";
import Modal from "../../components/ui/Modal";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const YEARS = ["2024", "2025", "2026", "2027", "2028", "2029", "2030"];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_CONFIG = {
  present:  { label: "P", short: "Present",  bg: "bg-emerald-500", bgLight: "bg-emerald-50 dark:bg-emerald-900/20", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800", ring: "ring-emerald-500/20", icon: CheckCircle2 },
  absent:   { label: "A", short: "Absent",   bg: "bg-red-500",     bgLight: "bg-red-50 dark:bg-red-900/20",     text: "text-red-700 dark:text-red-400",     border: "border-red-200 dark:border-red-800",     ring: "ring-red-500/20",     icon: XCircle },
  half_day: { label: "H", short: "Half Day", bg: "bg-amber-500",   bgLight: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800", ring: "ring-amber-500/20",   icon: Clock },
  leave:    { label: "L", short: "Leave",    bg: "bg-sky-500",     bgLight: "bg-sky-50 dark:bg-sky-900/20",     text: "text-sky-700 dark:text-sky-400",     border: "border-sky-200 dark:border-sky-800",     ring: "ring-sky-500/20",     icon: Palmtree },
};

function daysInMonth(month, year) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function getFirstDayOfWeek(month, year) {
  return new Date(Number(year), Number(month) - 1, 1).getDay();
}

export default function AttendanceView() {
  const { user } = useAuth();
  const { companyId, activeUnit, isAllCompanies } = useCompany();

  const [selectedCompanyId, setSelectedCompanyId] = useState(companyId !== "all" ? companyId : "");
  const [selectedUnit, setSelectedUnit] = useState(activeUnit || "");
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];
  const totalDays = daysInMonth(selectedMonth, selectedYear);
  const firstDay = getFirstDayOfWeek(selectedMonth, selectedYear);

  useEffect(() => {
    if (!selectedCompanyId) return undefined;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await salaryApi.getAttendanceGrid(user?.accessToken, user?.tokenType, {
          companyId: selectedCompanyId,
          unit: selectedUnit,
          month: selectedMonth,
          year: selectedYear,
        });
        if (cancelled) return;
        const emps = res?.data?.employees || [];
        setEmployees(emps);
        setAttendanceMap(res?.data?.attendance || {});
        // Auto-select first employee to pre-calculate if needed, though they now click to view
        if (emps.length > 0) {
          setSelectedEmployee((prev) => {
            if (prev && emps.some((e) => e.emp_code === prev.emp_code)) return prev;
            return emps[0];
          });
        } else {
          setSelectedEmployee(null);
        }
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Failed to load attendance");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedCompanyId, selectedUnit, selectedMonth, selectedYear, user?.accessToken, user?.tokenType]);

  const filteredEmployees = useMemo(() => {
    if (!searchQuery.trim()) return employees;
    const q = searchQuery.toLowerCase();
    return employees.filter(
      (emp) =>
        (emp.name || "").toLowerCase().includes(q) ||
        (emp.emp_code || "").toLowerCase().includes(q) ||
        (emp.department || "").toLowerCase().includes(q)
    );
  }, [employees, searchQuery]);

  // Calculate stats for selected employee
  const empStats = useMemo(() => {
    if (!selectedEmployee) return { present: 0, absent: 0, half_day: 0, leave: 0, unmarked: 0 };
    const empData = attendanceMap[selectedEmployee.emp_code] || {};
    const stats = { present: 0, absent: 0, half_day: 0, leave: 0, unmarked: 0 };
    const today = new Date();

    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const status = empData[dateStr];
      if (status && stats[status] !== undefined) {
        stats[status]++;
      } else {
        // Only count as unmarked if the date is in the past or today
        const d = new Date(Number(selectedYear), Number(selectedMonth) - 1, day);
        if (d <= today) {
          stats.unmarked++;
        }
      }
    }
    return stats;
  }, [selectedEmployee, attendanceMap, selectedMonth, selectedYear, totalDays]);

  // Calculate stats for the entire company/branch (Dashboard View)
  const dashboardStats = useMemo(() => {
    const stats = { present: 0, absent: 0, half_day: 0, leave: 0 };
    const dailyData = Array.from({ length: totalDays }, (_, i) => ({
      day: i + 1,
      present: 0,
      absent: 0,
      leave: 0,
    }));

    Object.values(attendanceMap).forEach((empData) => {
      for (let day = 1; day <= totalDays; day++) {
        const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const status = empData[dateStr];
        if (status && stats[status] !== undefined) {
          stats[status]++;
          if (status === "present" || status === "half_day") dailyData[day - 1].present++;
          if (status === "absent") dailyData[day - 1].absent++;
          if (status === "leave") dailyData[day - 1].leave++;
        }
      }
    });

    const totalMarked = stats.present + stats.absent + stats.half_day + stats.leave;
    const pieData = [
      { name: "Present", value: stats.present + stats.half_day, color: "#10b981" }, // emerald-500
      { name: "Absent", value: stats.absent, color: "#ef4444" }, // red-500
      { name: "Leave", value: stats.leave, color: "#0ea5e9" }, // sky-500
    ].filter((d) => d.value > 0);

    return { stats, dailyData, pieData, totalMarked };
  }, [attendanceMap, selectedMonth, selectedYear, totalDays]);

  // Build calendar grid
  const calendarCells = useMemo(() => {
    const cells = [];
    // Empty cells for days before month starts
    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: null, dateStr: null });
    }
    for (let day = 1; day <= totalDays; day++) {
      const dateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      cells.push({ day, dateStr });
    }
    return cells;
  }, [firstDay, totalDays, selectedMonth, selectedYear]);

  const navigateMonth = (direction) => {
    let m = parseInt(selectedMonth, 10);
    let y = parseInt(selectedYear, 10);
    m += direction;
    if (m > 12) { m = 1; y++; }
    if (m < 1) { m = 12; y--; }
    setSelectedMonth(String(m));
    setSelectedYear(String(y));
  };

  const today = new Date();
  const isToday = (day) => {
    return (
      day === today.getDate() &&
      parseInt(selectedMonth, 10) === today.getMonth() + 1 &&
      parseInt(selectedYear, 10) === today.getFullYear()
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 dark:border-white/10 dark:bg-white/[0.03]">
        <h4 className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400 mb-4">
          <Building2 size={13} /> Selection Options
        </h4>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
              Company <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedCompanyId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedCompanyId(nextId);
                const nextConf = getCompanyConfig(nextId);
                if (nextConf && !nextConf.units.includes(selectedUnit)) setSelectedUnit("");
              }}
              disabled={!isAllCompanies}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white disabled:opacity-50"
            >
              <option value="">Select Company</option>
              {COMPANY_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
              Branch/Unit
            </label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white"
            >
              <option value="">All Branches</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={String(idx + 1)}>{m}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-slate-400">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* ── Main Content ─────────────────────────────────── */}
      {!selectedCompanyId ? (
        <div className="rounded-2xl border border-gray-200 bg-white dark:bg-[#0b0f1a] dark:border-white/10 py-20 text-center">
          <CalendarIcon size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-400">Select a company to view attendance</p>
        </div>
      ) : loading ? (
        <div className="rounded-2xl border border-gray-200 bg-white dark:bg-[#0b0f1a] dark:border-white/10 py-20 flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-brand-500" />
        </div>
      ) : employees.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white dark:bg-[#0b0f1a] dark:border-white/10 py-20 text-center">
          <Users size={40} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-400">No employees found for this company/branch</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {/* Dashboard Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(STATUS_CONFIG).map(([key, config]) => {
              const IconComp = config.icon;
              return (
                <div
                  key={key}
                  className={`rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 dark:border-white/10 dark:bg-[#0b0f1a] shadow-sm flex flex-col justify-between`}
                >
                  <div className="flex items-center gap-2 sm:gap-3 mb-3">
                    <div className={`flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-xl ${config.bgLight} ${config.text}`}>
                      <IconComp size={18} />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-gray-500 uppercase tracking-wider dark:text-gray-400">{config.short}</span>
                  </div>
                  <div>
                    <p className={`text-2xl sm:text-3xl font-black ${config.text}`}>{dashboardStats.stats[key]}</p>
                    <p className="text-xs text-gray-400 mt-1">Total {config.short.toLowerCase()} days this month</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Employee List */}
          <div className="rounded-2xl border border-gray-200 bg-white dark:bg-[#0b0f1a] dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
            <div className="border-b border-gray-200 dark:border-white/10 px-4 sm:px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <h3 className="text-base font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-2">
                <Users size={18} className="text-brand-500" />
                Employee Attendance
                <span className="ml-2 rounded-full bg-gray-100 dark:bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                  {filteredEmployees.length} {filteredEmployees.length === 1 ? "Employee" : "Employees"}
                </span>
              </h3>
              <div className="relative w-full sm:w-64">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, code, dept..."
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white placeholder:text-gray-400"
                />
              </div>
            </div>

            {/* Mobile: stacked cards. The six-column table clipped the Leave
                count and the View button off the right edge on a phone. */}
            <ul className="divide-y divide-gray-100 dark:divide-white/5 md:hidden">
              {filteredEmployees.map((emp) => {
                const empAtt = attendanceMap[emp.emp_code] || {};
                const counts = [
                  { key: "present", label: "Present", value: Object.values(empAtt).filter((s) => s === "present").length, cls: "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400" },
                  { key: "absent", label: "Absent", value: Object.values(empAtt).filter((s) => s === "absent").length, cls: "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" },
                  { key: "half_day", label: "Half Day", value: Object.values(empAtt).filter((s) => s === "half_day").length, cls: "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" },
                  { key: "leave", label: "Leave", value: Object.values(empAtt).filter((s) => s === "leave").length, cls: "bg-sky-50 text-sky-600 dark:bg-sky-900/20 dark:text-sky-400" },
                ];

                return (
                  <li key={emp.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                        {(emp.name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-gray-900 dark:text-white break-words">{emp.name}</p>
                        <p className="text-[11px] font-mono text-gray-400">{emp.emp_code}</p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {counts.map((c) => (
                        <div key={c.key} className="text-center">
                          <span className={`block rounded-lg py-1 text-sm font-bold ${c.cls}`}>{c.value}</span>
                          <span className="mt-1 block text-[9px] font-bold uppercase tracking-wider text-gray-400">
                            {c.label}
                          </span>
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => {
                        setSelectedEmployee(emp);
                        setIsCalendarModalOpen(true);
                      }}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800"
                    >
                      <CalendarIcon size={12} /> View Calendar
                    </button>
                  </li>
                );
              })}
              {filteredEmployees.length === 0 && (
                <li className="py-12 text-center">
                  <Users size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm text-gray-400">No employees match your search</p>
                </li>
              )}
            </ul>

            <div className="hidden overflow-x-auto md:block">
              <table className="w-full text-left text-sm text-gray-600 dark:text-gray-300">
                <thead className="bg-gray-50/50 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:bg-white/[0.02] dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3 border-b border-gray-100 dark:border-white/10">Employee</th>
                    <th className="px-5 py-3 border-b border-gray-100 dark:border-white/10 text-center">Present</th>
                    <th className="px-5 py-3 border-b border-gray-100 dark:border-white/10 text-center">Absent</th>
                    <th className="px-5 py-3 border-b border-gray-100 dark:border-white/10 text-center">Half Day</th>
                    <th className="px-5 py-3 border-b border-gray-100 dark:border-white/10 text-center">Leave</th>
                    <th className="px-5 py-3 border-b border-gray-100 dark:border-white/10 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-white/5">
                  {filteredEmployees.map((emp) => {
                    const empAtt = attendanceMap[emp.emp_code] || {};
                    const presentCount = Object.values(empAtt).filter((s) => s === "present").length;
                    const absentCount = Object.values(empAtt).filter((s) => s === "absent").length;
                    const halfDayCount = Object.values(empAtt).filter((s) => s === "half_day").length;
                    const leaveCount = Object.values(empAtt).filter((s) => s === "leave").length;

                    return (
                      <tr
                        key={emp.id}
                        className="transition-colors hover:bg-gray-50/50 dark:hover:bg-white/[0.02]"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                              {(emp.name || "?").split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-bold text-gray-900 dark:text-white">{emp.name}</p>
                              <p className="text-[11px] font-mono text-gray-400">{emp.emp_code}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400">
                            {presentCount}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-bold text-red-600 dark:bg-red-900/20 dark:text-red-400">
                            {absentCount}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:bg-amber-900/20 dark:text-amber-400">
                            {halfDayCount}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className="inline-flex items-center justify-center rounded-full bg-sky-50 px-2.5 py-0.5 text-xs font-bold text-sky-600 dark:bg-sky-900/20 dark:text-sky-400">
                            {leaveCount}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          <button
                            onClick={() => {
                              setSelectedEmployee(emp);
                              setIsCalendarModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-600 transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900 dark:text-gray-300 dark:hover:bg-slate-800"
                          >
                            <CalendarIcon size={12} /> View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {filteredEmployees.length === 0 && (
                    <tr>
                      <td colSpan="6" className="py-12 text-center">
                        <Users size={32} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
                        <p className="text-sm text-gray-400">No employees match your search</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Modal */}
      <Modal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        title={selectedEmployee ? `${selectedEmployee.name} - Attendance Calendar` : "Attendance Calendar"}
        size="xl"
      >
        {selectedEmployee && (
          <div className="flex flex-col gap-5 py-2">
            {/* Summary Stats in Modal */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                const IconComp = config.icon;
                return (
                  <div
                    key={key}
                    className={`rounded-xl border ${config.border} ${config.bgLight} p-3`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`flex h-6 w-6 items-center justify-center rounded-lg ${config.bg} text-white`}>
                        <IconComp size={12} />
                      </div>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${config.text}`}>{config.short}</span>
                    </div>
                    <p className={`text-xl font-bold ${config.text}`}>{empStats[key]}</p>
                  </div>
                );
              })}
            </div>

            {/* Calendar */}
            <div className="rounded-2xl border border-gray-200 bg-white dark:bg-[#0b0f1a] dark:border-white/10 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-white/10 px-4 py-3 bg-gray-50 dark:bg-white/[0.02]">
                <button
                  onClick={() => navigateMonth(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:border-white/10 dark:bg-slate-900 dark:text-gray-400 dark:hover:bg-slate-800"
                >
                  <ChevronLeft size={14} />
                </button>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                  {MONTHS[parseInt(selectedMonth, 10) - 1]} {selectedYear}
                </h3>
                <button
                  onClick={() => navigateMonth(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:border-white/10 dark:bg-slate-900 dark:text-gray-400 dark:hover:bg-slate-800"
                >
                  <ChevronRight size={14} />
                </button>
              </div>

              <div className="grid grid-cols-7 border-b border-gray-200 dark:border-white/10 bg-gray-50 dark:bg-white/[0.02]">
                {DAY_NAMES.map((d) => (
                  <div
                    key={d}
                    className={`py-2 text-center text-[9px] font-bold uppercase tracking-wider ${
                      d === "Sun" ? "text-red-400" : "text-gray-400 dark:text-gray-500"
                    }`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7">
                {calendarCells.map((cell, idx) => {
                  if (!cell.day) {
                    return <div key={`empty-${idx}`} className="min-h-[52px] sm:min-h-[60px] border-b border-r border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-white/[0.01]" />;
                  }

                  const status = attendanceMap[selectedEmployee.emp_code]?.[cell.dateStr] || null;
                  const config = status ? STATUS_CONFIG[status] : null;
                  const todayHighlight = isToday(cell.day);
                  const dayOfWeek = new Date(Number(selectedYear), Number(selectedMonth) - 1, cell.day).getDay();
                  const isSunday = dayOfWeek === 0;

                  return (
                    <div
                      key={cell.day}
                      className={`relative min-h-[52px] sm:min-h-[80px] border-b border-r border-gray-100 dark:border-white/5 p-1 transition-all flex flex-col items-center justify-start pt-2 ${
                        todayHighlight
                          ? "bg-brand-50/50 dark:bg-brand-900/10 ring-1 ring-inset ring-brand-500/30"
                          : config
                            ? `${config.bgLight}`
                            : ""
                      }`}
                    >
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold mb-1 ${
                          todayHighlight
                            ? "bg-brand-500 text-white"
                            : isSunday
                              ? "text-red-400"
                              : "text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {cell.day}
                      </span>
                      {config && (
                        <div className={`flex items-center justify-center w-full px-1 py-0.5 rounded ${config.bg} bg-opacity-10 dark:bg-opacity-20`}>
                          <span className={`text-[8px] font-bold uppercase tracking-wider ${config.text} truncate`}>{config.label}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-2 bg-gray-50 dark:bg-white/[0.02]">
                {Object.entries(STATUS_CONFIG).map(([key, config]) => (
                  <div key={key} className="flex items-center gap-1 text-[9px] font-bold text-gray-500 dark:text-gray-400">
                    <span className={`h-2 w-2 rounded-full ${config.bg}`} />
                    {config.short} ({config.label})
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
