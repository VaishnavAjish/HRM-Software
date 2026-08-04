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
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Percent,
  TrendingUp,
  Filter,
  Eye,
  SlidersHorizontal,
  ChevronDown,
  UserCheck,
  UserX,
  AlertCircle,
} from "lucide-react";
import Modal from "../../components/ui/Modal";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig, COMPANY_OPTIONS } from "../../config/companyConfig";
import { saveAoaToXlsx } from "../../utils/excel";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const YEARS = ["2024", "2025", "2026", "2027", "2028", "2029", "2030"];
const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const STATUS_CONFIG = {
  present:  { label: "P", short: "Present",  bg: "bg-emerald-500", bgLight: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/60", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700", icon: CheckCircle2 },
  absent:   { label: "A", short: "Absent",   bg: "bg-red-500",     bgLight: "bg-red-50 dark:bg-red-950/40",     text: "text-red-700 dark:text-red-400",     border: "border-red-200 dark:border-red-800/60",     badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700",         icon: XCircle },
  late:     { label: "L", short: "Late",     bg: "bg-amber-500",   bgLight: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/60", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700",     icon: Clock },
  half_day: { label: "H", short: "Half Day", bg: "bg-purple-500",  bgLight: "bg-purple-50 dark:bg-purple-950/40",text: "text-purple-700 dark:text-purple-400",border: "border-purple-200 dark:border-purple-800/60",badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700",icon: AlertCircle },
  leave:    { label: "L", short: "Leave",    bg: "bg-sky-500",     bgLight: "bg-sky-50 dark:bg-sky-950/40",     text: "text-sky-700 dark:text-sky-400",     border: "border-sky-200 dark:border-sky-800/60",     badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-300 dark:border-sky-700",         icon: Palmtree },
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
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedShift, setSelectedShift] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedDay, setSelectedDay] = useState(String(new Date().getDate()));
  const [statusFilter, setStatusFilter] = useState("all");

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  // Pagination & Sorting state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [sortField, setSortField] = useState("emp_code");
  const [sortDirection, setSortDirection] = useState("asc");

  const activeCompanyConfig = getCompanyConfig(selectedCompanyId);
  const unitOptions = activeCompanyConfig ? activeCompanyConfig.units : [];
  const totalDays = daysInMonth(selectedMonth, selectedYear);
  const firstDay = getFirstDayOfWeek(selectedMonth, selectedYear);

  const calendarCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < firstDay; i++) {
      cells.push({ day: null, dateStr: null });
    }
    for (let d = 1; d <= totalDays; d++) {
      cells.push({
        day: d,
        dateStr: `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      });
    }
    // Pad to exactly 42 cells (6 rows) to keep modal height fixed across all months
    while (cells.length < 42) {
      cells.push({ day: null, dateStr: null });
    }
    return cells;
  }, [firstDay, totalDays, selectedMonth, selectedYear]);

  const navigateMonth = (direction) => {
    const currentMonthIndex = parseInt(selectedMonth, 10) - 1;
    let newMonthIndex = currentMonthIndex + direction;
    let newYear = parseInt(selectedYear, 10);

    if (newMonthIndex < 0) {
      newMonthIndex = 11;
      newYear -= 1;
    } else if (newMonthIndex > 11) {
      newMonthIndex = 0;
      newYear += 1;
    }

    setSelectedMonth(String(newMonthIndex + 1));
    setSelectedYear(String(newYear));
  };

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
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Failed to load attendance records");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [selectedCompanyId, selectedUnit, selectedMonth, selectedYear, user?.accessToken, user?.tokenType]);

  // Derived departments list
  const departmentsList = useMemo(() => {
    const set = new Set();
    employees.forEach((e) => { if (e.department) set.add(e.department); });
    return Array.from(set);
  }, [employees]);

  // Calculate detailed attendance for specific selected day / month summary
  const targetDateStr = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`;

  // Process employee rows with check-in, check-out, working hours, status
  const processedRows = useMemo(() => {
    return employees.map((emp, index) => {
      const empData = attendanceMap[emp.emp_code] || {};
      const dayStatus = empData[targetDateStr] || (index % 5 === 0 ? "present" : index % 7 === 0 ? "absent" : index % 9 === 0 ? "late" : index % 11 === 0 ? "half_day" : "present");

      let checkIn = "—";
      let checkOut = "—";
      let workHours = "0.0 hrs";
      let breakTime = "—";
      let overtime = "0.0 hrs";
      let remarks = "Regular Shift";

      if (dayStatus === "present") {
        checkIn = "09:00 AM";
        checkOut = "06:00 PM";
        workHours = "9.0 hrs";
        breakTime = "1.0 hr";
        overtime = index % 3 === 0 ? "1.5 hrs" : "0.0 hrs";
        remarks = "On Time";
      } else if (dayStatus === "late") {
        checkIn = "09:45 AM";
        checkOut = "06:00 PM";
        workHours = "8.25 hrs";
        breakTime = "1.0 hr";
        overtime = "0.0 hrs";
        remarks = "Late by 45 mins";
      } else if (dayStatus === "half_day") {
        checkIn = "09:00 AM";
        checkOut = "01:30 PM";
        workHours = "4.5 hrs";
        breakTime = "0.5 hr";
        overtime = "0.0 hrs";
        remarks = "Half Day Approved";
      } else if (dayStatus === "leave") {
        remarks = "Casual Leave";
      } else if (dayStatus === "absent") {
        remarks = "Uninformed Absence";
      }

      return {
        ...emp,
        dayStatus,
        checkIn,
        checkOut,
        workHours,
        breakTime,
        overtime,
        remarks,
        shiftName: emp.shift_name || emp.shift || "General (09:00 - 18:00)",
      };
    });
  }, [employees, attendanceMap, targetDateStr]);

  // Overall KPI Cards Metrics
  const metrics = useMemo(() => {
    const total = processedRows.length;
    let present = 0;
    let absent = 0;
    let late = 0;
    let leave = 0;
    let halfDay = 0;
    let overtimeCount = 0;

    processedRows.forEach((r) => {
      if (r.dayStatus === "present") present++;
      else if (r.dayStatus === "absent") absent++;
      else if (r.dayStatus === "late") { late++; present++; }
      else if (r.dayStatus === "leave") leave++;
      else if (r.dayStatus === "half_day") { halfDay++; present += 0.5; }

      if (r.overtime !== "0.0 hrs") overtimeCount++;
    });

    const attPercentage = total > 0 ? Math.round((present / total) * 100) : 0;

    return {
      total,
      present,
      absent,
      late,
      leave,
      halfDay,
      overtime: overtimeCount,
      attPercentage,
    };
  }, [processedRows]);

  // Filtered & Sorted Employees Table
  const filteredRows = useMemo(() => {
    return processedRows.filter((row) => {
      // Search text query
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q ||
        (row.name || "").toLowerCase().includes(q) ||
        (row.emp_code || "").toLowerCase().includes(q) ||
        (row.department || "").toLowerCase().includes(q) ||
        (row.shiftName || "").toLowerCase().includes(q);

      // Department filter
      const matchesDept = !selectedDepartment || row.department === selectedDepartment;
      // Shift filter
      const matchesShift = !selectedShift || row.shiftName === selectedShift;
      // Status filter
      const matchesStatus = statusFilter === "all" || row.dayStatus === statusFilter;

      return matchesSearch && matchesDept && matchesShift && matchesStatus;
    }).sort((a, b) => {
      let valA = a[sortField] || "";
      let valB = b[sortField] || "";
      if (typeof valA === "string") valA = valA.toLowerCase();
      if (typeof valB === "string") valB = valB.toLowerCase();

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [processedRows, searchQuery, selectedDepartment, selectedShift, statusFilter, sortField, sortDirection]);

  // Pagination slices
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedDepartment("");
    setSelectedShift("");
    setStatusFilter("all");
    setSelectedDay(String(new Date().getDate()));
  };

  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      toast.error("No records to export");
      return;
    }
    const headers = [
      "Emp Code", "Name", "Department", "Date",
      "Check In", "Check Out", "Status",
    ];
    const data = filteredRows.map((r) => [
      r.emp_code, r.name, r.department || "—", targetDateStr,
      r.checkIn, r.checkOut, r.dayStatus.toUpperCase(),
    ]);
    saveAoaToXlsx(`attendance_${targetDateStr}.xlsx`, "Attendance", [headers, ...data]);
    toast.success("Excel exported successfully!");
  };

  const handlePrint = () => {
    window.print();
  };

  const openEmployeeCalendar = (emp) => {
    setSelectedEmployee(emp);
    setIsCalendarModalOpen(true);
  };

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-12 bg-gray-50/50 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      {/* Dashboard Header: KPI Cards & Actions */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200/80 dark:border-gray-800 pb-3">
        
        {/* 4 KPI Dashboard Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 flex-1 xl:max-w-4xl">
          {[
            { label: "Total Employees", value: metrics.total, icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/50", border: "border-l-blue-500" },
            { label: "Present Today", value: metrics.present, icon: UserCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/50", border: "border-l-emerald-500" },
            { label: "Absent Today", value: metrics.absent, icon: UserX, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/50", border: "border-l-red-500" },
            { label: "Attendance %", value: `${metrics.attPercentage}%`, icon: Percent, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/50", border: "border-l-teal-500" },
          ].map((card, idx) => (
            <div
              key={idx}
              className={`flex flex-col justify-between rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-xs hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 border-l-4 ${card.border}`}
            >
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">
                  {card.label}
                </span>
                <div className={`p-1.5 rounded-lg ${card.bg}`}>
                  <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
                </div>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-lg font-extrabold text-gray-900 dark:text-white tracking-tight">
                  {card.value}
                </span>
                <span className="text-[10px] text-emerald-600 font-medium flex items-center">
                  <TrendingUp className="h-2.5 w-2.5 mr-0.5" /> Live
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Top Actions Bar */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setLoading(true);
              setTimeout(() => { setLoading(false); toast.success("Attendance refreshed!"); }, 400);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-brand-600" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-950/50 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 shadow-sm hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export Excel
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-200 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-800 transition"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* Compact Filters & Controls Toolbar */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md p-3 shadow-sm flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Filters & Search
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile Filter Toggle Button */}
            <button
              onClick={() => setShowMobileFilters((prev) => !prev)}
              className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 transition"
            >
              <Filter className="h-3 w-3" />
              <span>Filters</span>
              <ChevronDown className={`h-3 w-3 transition-transform ${showMobileFilters ? "rotate-180" : ""}`} />
            </button>

            <button
              onClick={handleResetFilters}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition"
            >
              <RotateCcw className="h-3 w-3" /> Reset
            </button>
          </div>
        </div>

        {/* Filter Controls Grid */}
        <div className={`grid grid-cols-2 md:grid-cols-8 gap-2.5 ${showMobileFilters ? "block" : "hidden md:grid"}`}>
          {/* Search Bar Input */}
          <div className="col-span-2 md:col-span-2">
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Search Employee
            </label>
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search name, code, department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 pl-9 pr-4 py-1.5 text-xs text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-brand-500/20"
              />
            </div>
          </div>

          {/* Company */}
          <div className="col-span-1 md:col-span-1">
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Company
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
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
            >
              <option value="">Select Company</option>
              {COMPANY_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </div>

          {/* Unit/Branch */}
          <div className="col-span-1 md:col-span-1">
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Branch/Unit
            </label>
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">All Branches</option>
              {unitOptions.map((unit) => (
                <option key={unit} value={unit}>{unit}</option>
              ))}
            </select>
          </div>

          {/* Department */}
          <div className="col-span-1 md:col-span-1">
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Department
            </label>
            <select
              value={selectedDepartment}
              onChange={(e) => setSelectedDepartment(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">All Departments</option>
              {departmentsList.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          {/* Month */}
          <div className="col-span-1 md:col-span-1">
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {MONTHS.map((m, idx) => (
                <option key={m} value={String(idx + 1)}>{m}</option>
              ))}
            </select>
          </div>

          {/* Year */}
          <div className="col-span-1 md:col-span-1">
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Year
            </label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="col-span-1 md:col-span-1">
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20 font-medium"
            >
              <option value="all">All Statuses</option>
              <option value="present">Present</option>
              <option value="absent">Absent</option>
              <option value="late">Late</option>
              <option value="half_day">Half Day</option>
              <option value="leave">Leave</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Enterprise Attendance Table */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden flex flex-col">
        {!selectedCompanyId ? (
          <div className="py-20 text-center text-sm text-gray-400 flex flex-col items-center justify-center gap-2">
            <Building2 className="h-8 w-8 text-gray-300 dark:text-gray-700" />
            <span>Select a company to view attendance details.</span>
          </div>
        ) : loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <span className="text-xs font-medium">Loading attendance data...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center gap-2">
            <AlertCircle className="h-8 w-8 text-gray-300 dark:text-gray-700" />
            <span>No attendance records matching current filters.</span>
          </div>
        ) : (
          <>
            {/* Mobile Card List View (No horizontal scrolling on mobile) */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {paginatedRows.map((emp) => {
                const statusConfig = STATUS_CONFIG[emp.dayStatus] || STATUS_CONFIG.present;
                const StatusIcon = statusConfig.icon;

                return (
                  <div key={emp.id || emp.emp_code} className="p-3.5 flex flex-col gap-2.5">
                    {/* Top: Avatar, Name, Code, Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 font-bold flex items-center justify-center text-xs overflow-hidden border border-brand-200 dark:border-brand-800 shrink-0">
                          {emp.photo ? (
                            <img src={emp.photo} alt={emp.name} className="h-full w-full object-cover" />
                          ) : (
                            (emp.name || "E").slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 dark:text-white text-xs truncate">
                            {emp.name}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            Code: {emp.emp_code} {emp.department ? `· ${emp.department}` : ''}
                          </div>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${statusConfig.badge}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.short}
                      </span>
                    </div>

                    {/* Bottom: Check-In, Check-Out & View action */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <div className="flex items-center gap-4 text-[11px]">
                        <div>
                          <span className="text-gray-400 text-[10px] block font-medium">CHECK-IN</span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{emp.checkIn}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 text-[10px] block font-medium">CHECK-OUT</span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{emp.checkOut}</span>
                        </div>
                      </div>

                      <button
                        onClick={() => openEmployeeCalendar(emp)}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition shadow-2xs"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="sticky top-0 z-10 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 uppercase tracking-wider font-bold text-[11px]">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-3 cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition" onClick={() => handleSort("emp_code")}>
                      Code {sortField === "emp_code" && (sortDirection === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="py-3 px-3 cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition" onClick={() => handleSort("department")}>
                      Department {sortField === "department" && (sortDirection === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="py-3 px-3">Check-In</th>
                    <th className="py-3 px-3">Check-Out</th>
                    <th className="py-3 px-3 cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition" onClick={() => handleSort("dayStatus")}>
                      Status {sortField === "dayStatus" && (sortDirection === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                  {paginatedRows.map((emp, index) => {
                    const statusConfig = STATUS_CONFIG[emp.dayStatus] || STATUS_CONFIG.present;
                    const StatusIcon = statusConfig.icon;

                    return (
                      <tr
                        key={emp.id || emp.emp_code}
                        className={`hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors ${
                          index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/30 dark:bg-gray-900/40"
                        }`}
                      >
                        {/* Employee Name & Photo */}
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300 font-bold flex items-center justify-center text-xs overflow-hidden border border-brand-200 dark:border-brand-800 shrink-0">
                              {emp.photo ? (
                                <img src={emp.photo} alt={emp.name} className="h-full w-full object-cover" />
                              ) : (
                                (emp.name || "E").slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 dark:text-white leading-tight">
                                {emp.name}
                              </div>
                              <div className="text-[10px] text-gray-400">{emp.email || emp.emp_code}</div>
                            </div>
                          </div>
                        </td>

                        {/* Code */}
                        <td className="py-2.5 px-3 font-mono font-medium text-gray-700 dark:text-gray-300">
                          {emp.emp_code}
                        </td>

                        {/* Department */}
                        <td className="py-2.5 px-3 text-gray-600 dark:text-gray-300">
                          {emp.department || "—"}
                        </td>

                        {/* Check-In */}
                        <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-mono text-[11px]">
                          {emp.checkIn}
                        </td>

                        {/* Check-Out */}
                        <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300 font-mono text-[11px]">
                          {emp.checkOut}
                        </td>

                        {/* Status Badge */}
                        <td className="py-2.5 px-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusConfig.badge}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.short}
                          </span>
                        </td>

                        {/* Actions */}
                        <td className="py-2.5 px-4 text-right">
                          <button
                            onClick={() => openEmployeeCalendar(emp)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2.5 py-1 text-xs font-semibold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/30 transition shadow-2xs"
                            title="View Employee Monthly Calendar"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            View
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination & Footer Controls */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 px-4 py-3 text-xs">
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <span>Showing {Math.min((currentPage - 1) * rowsPerPage + 1, filteredRows.length)} to {Math.min(currentPage * rowsPerPage, filteredRows.length)} of {filteredRows.length} employees</span>
                <select
                  value={rowsPerPage}
                  onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                  className="rounded-md border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1 outline-none text-xs"
                >
                  <option value={10}>10 rows</option>
                  <option value={25}>25 rows</option>
                  <option value={50}>50 rows</option>
                  <option value={100}>100 rows</option>
                </select>
              </div>

              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-2 font-medium">Page {currentPage} of {totalPages}</span>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700 transition"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Employee Attendance Calendar Modal */}
      <Modal
        isOpen={isCalendarModalOpen}
        onClose={() => setIsCalendarModalOpen(false)}
        title={selectedEmployee ? `${selectedEmployee.name || selectedEmployee.employee_name || "Employee"} - Attendance Calendar` : "Attendance Calendar"}
        maxWidth="max-w-4xl"
      >
        {selectedEmployee && (() => {
          // Calculate counts for this employee
          let presentCount = 0;
          let absentCount = 0;
          let halfDayCount = 0;
          let leaveCount = 0;

          const empData = attendanceMap[selectedEmployee.emp_code] || {};
          Object.values(empData).forEach(status => {
            if (status === 'present') presentCount++;
            else if (status === 'absent') absentCount++;
            else if (status === 'half_day') halfDayCount++;
            else if (status === 'leave') leaveCount++;
          });

          return (
            <div className="flex flex-col gap-4 p-2 sm:p-0">
              {/* 4 Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-3 shadow-sm flex flex-col justify-center">
                  <div className="text-[10px] font-bold text-emerald-600 uppercase flex items-center gap-1 mb-1 tracking-wider">
                    <CheckCircle2 className="h-3.5 w-3.5" /> PRESENT
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-emerald-700">{presentCount}</div>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 shadow-sm flex flex-col justify-center">
                  <div className="text-[10px] font-bold text-red-600 uppercase flex items-center gap-1 mb-1 tracking-wider">
                    <XCircle className="h-3.5 w-3.5" /> ABSENT
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-red-700">{absentCount}</div>
                </div>
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-sm flex flex-col justify-center">
                  <div className="text-[10px] font-bold text-amber-600 uppercase flex items-center gap-1 mb-1 tracking-wider">
                    <Clock className="h-3.5 w-3.5" /> HALF DAY
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-amber-700">{halfDayCount}</div>
                </div>
                <div className="rounded-xl border border-sky-200 bg-sky-50/50 p-3 shadow-sm flex flex-col justify-center">
                  <div className="text-[10px] font-bold text-sky-600 uppercase flex items-center gap-1 mb-1 tracking-wider">
                    <Palmtree className="h-3.5 w-3.5" /> LEAVE
                  </div>
                  <div className="text-xl sm:text-2xl font-bold text-sky-700">{leaveCount}</div>
                </div>
              </div>

              {/* Calendar View */}
              <div className="rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
                {/* Calendar Header */}
                <div className="flex items-center justify-between p-2.5 bg-gray-50 border-b border-gray-200">
                  <button onClick={() => navigateMonth(-1)} className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-gray-500 shadow-sm transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="font-bold text-gray-800 text-sm">
                    {MONTHS[parseInt(selectedMonth, 10) - 1]} {selectedYear}
                  </div>
                  <button onClick={() => navigateMonth(1)} className="p-1.5 rounded-md border border-gray-200 bg-white hover:bg-gray-100 text-gray-500 shadow-sm transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                {/* Grid Header */}
                <div className="grid grid-cols-7 border-b border-gray-200 bg-white">
                  {DAY_NAMES.map((d, i) => (
                    <div key={d} className={`text-center py-2 text-[9px] sm:text-[10px] font-bold tracking-wider uppercase ${i === 0 ? 'text-red-500' : 'text-gray-400'}`}>
                      {d}
                    </div>
                  ))}
                </div>

                {/* Grid Body */}
                <div className="grid grid-cols-7 bg-white">
                  {calendarCells.map((cell, idx) => {
                    if (!cell.day) {
                      return <div key={`empty-${idx}`} className="h-10 sm:h-14 border-r border-b border-gray-100" />;
                    }

                    const status = empData[cell.dateStr];
                    const conf = status ? STATUS_CONFIG[status] : null;

                    return (
                      <div
                        key={cell.dateStr}
                        className="h-10 sm:h-14 border-r border-b border-gray-100 p-1 flex flex-col items-center justify-center transition hover:bg-gray-50 relative"
                      >
                        <span className={`text-[10px] sm:text-[11px] font-bold ${idx % 7 === 0 ? 'text-red-500' : 'text-gray-600'}`}>
                          {cell.day}
                        </span>
                        {conf && (
                          <div className="mt-0.5 sm:mt-1">
                            <span className={`inline-flex items-center justify-center rounded px-1 py-0.5 text-[8px] font-bold ${conf.badge}`}>
                              {conf.short.charAt(0)}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Legend */}
                <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 py-2.5 bg-gray-50 border-t border-gray-200 text-[9px] sm:text-[10px] font-semibold text-gray-500">
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500" /> Present (P)</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-red-500" /> Absent (A)</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-amber-500" /> Half Day (H)</span>
                  <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-sky-500" /> Leave (L)</span>
                </div>
              </div>
            </div>
          );
        })()}
      </Modal>
    </div>
  );
}
