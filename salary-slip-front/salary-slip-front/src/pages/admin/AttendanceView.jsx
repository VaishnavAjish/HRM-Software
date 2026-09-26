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
  ChevronDown,
  UserCheck,
  UserX,
  AlertCircle,
  Fingerprint,
  Server,
  UserCog,
  Settings as SettingsIcon,
} from "lucide-react";
import Modal from "../../components/ui/Modal";
import MapAttendanceModal from "../../components/admin/MapAttendanceModal";
import EsslSettingsModal from "../../components/admin/EsslSettingsModal";
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

// 28 Connected eSSL Biometric Device Serials
const ESSL_DEVICES = [
  "TDBD254500578", "TDBD253600396", "TDBD253600373", "CPAK232160545",
  "TDBD253600369", "TDBD253600390", "CRJP230760314", "CPAK222560309",
  "JYK8234700169", "TDBD240400272", "TDBD240400401", "NES1260500255",
  "CPAK222560310", "NES1260500183", "CPAK222560312", "CPAK222560451",
  "CRJP230760340", "CPAK222560320", "CPAK222560658", "CRJP230760331",
  "TDBD260200086", "TDBD260200491", "CPAK222560653", "CPAK223760033",
  "CPAK223760603", "CPAK222560306", "CPAK222560307", "CPAK222560447"
];

const STATUS_CONFIG = {
  present:  { label: "P", short: "Present",  bg: "bg-emerald-500", bgLight: "bg-emerald-50 dark:bg-emerald-950/40", text: "text-emerald-700 dark:text-emerald-400", border: "border-emerald-200 dark:border-emerald-800/60", badge: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700", icon: CheckCircle2 },
  absent:   { label: "A", short: "Absent",   bg: "bg-red-500",     bgLight: "bg-red-50 dark:bg-red-950/40",     text: "text-red-700 dark:text-red-400",     border: "border-red-200 dark:border-red-800/60",     badge: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700",         icon: XCircle },
  late:     { label: "L", short: "Late",     bg: "bg-amber-500",   bgLight: "bg-amber-50 dark:bg-amber-950/40", text: "text-amber-700 dark:text-amber-400", border: "border-amber-200 dark:border-amber-800/60", badge: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700",     icon: Clock },
  half_day: { label: "H", short: "Half Day", bg: "bg-purple-500",  bgLight: "bg-purple-50 dark:bg-purple-950/40",text: "text-purple-700 dark:text-purple-400",border: "border-purple-200 dark:border-purple-800/60",badge: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border border-purple-300 dark:border-purple-700",icon: AlertCircle },
  leave:    { label: "L", short: "Leave",    bg: "bg-sky-500",     bgLight: "bg-sky-50 dark:bg-sky-950/40",     text: "text-sky-700 dark:text-sky-400",     border: "border-sky-200 dark:border-sky-800/60",     badge: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border border-sky-300 dark:border-sky-700",         icon: Palmtree },
  not_marked: { label: "-", short: "Not Marked", bg: "bg-slate-400", bgLight: "bg-slate-50 dark:bg-slate-900/40", text: "text-slate-500 dark:text-slate-400", border: "border-slate-200 dark:border-slate-800", badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700", icon: Clock },
};

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "present", label: "Present" },
  { key: "absent", label: "Absent" },
  { key: "late", label: "Late" },
  { key: "half_day", label: "Half Day" },
  { key: "leave", label: "On Leave" },
  { key: "not_marked", label: "Not Marked" },
];

// Derives a short operational-exception label from data the row already
// carries (real check-in/out presence + computed status) -- never invents
// values the backend didn't produce (e.g. no fabricated "late by N min").
function getExceptionInfo(row) {
  if (row.dayStatus === "late") {
    return { text: "Late arrival", className: "text-amber-600 dark:text-amber-400" };
  }
  if (row.dayStatus === "half_day") {
    return { text: "Half day", className: "text-purple-600 dark:text-purple-400" };
  }
  if (row.checkIn !== "—" && row.checkOut === "—") {
    return { text: "Missing checkout", className: "text-red-600 dark:text-red-400" };
  }
  if (row.checkIn === "—" && row.checkOut !== "—") {
    return { text: "Missing check-in", className: "text-red-600 dark:text-red-400" };
  }
  return null;
}

function daysInMonth(month, year) {
  return new Date(Number(year), Number(month), 0).getDate();
}

function getFirstDayOfWeek(month, year) {
  return new Date(Number(year), Number(month) - 1, 1).getDay();
}

export default function AttendanceView() {
  const { user } = useAuth();
  const { companyId, activeUnit, isAllCompanies } = useCompany();

  const [selectedCompanyId, setSelectedCompanyId] = useState(
    companyId && companyId !== "all" ? companyId : "all-companies"
  );
  const [selectedUnit, setSelectedUnit] = useState(activeUnit || "");
  const [selectedDepartment, setSelectedDepartment] = useState("");
  const [selectedShift, setSelectedShift] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(String(new Date().getMonth() + 1));
  const [selectedYear, setSelectedYear] = useState(String(new Date().getFullYear()));
  const [selectedDay, setSelectedDay] = useState(String(new Date().getDate()));
  const [statusFilter, setStatusFilter] = useState("all");
  const [onlyUploaded, setOnlyUploaded] = useState(false);

  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [attendanceMap, setAttendanceMap] = useState({});
  const [attendanceDetails, setAttendanceDetails] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isCalendarModalOpen, setIsCalendarModalOpen] = useState(false);
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [isMapModalOpen, setIsMapModalOpen] = useState(false);
  const [isEsslSettingsOpen, setIsEsslSettingsOpen] = useState(false);

  // Biometric eSSL Sync Modal States
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);
  const [syncMonth, setSyncMonth] = useState(String(new Date().getMonth() + 1));
  const [syncYear, setSyncYear] = useState(String(new Date().getFullYear()));
  const [syncStartDate, setSyncStartDate] = useState("");
  const [syncEndDate, setSyncEndDate] = useState("");
  const [showDevicesList, setShowDevicesList] = useState(false);

  // Per-employee export modal state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [selectedExportEmp, setSelectedExportEmp] = useState(null);
  const [exportMonth, setExportMonth] = useState(String(new Date().getMonth() + 1));
  const [exportDay, setExportDay] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  // Pagination & Sorting state
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [sortField, setSortField] = useState("name");
  const [sortDirection, setSortDirection] = useState("asc");

  // Keep selectedCompanyId in sync when company context changes
  useEffect(() => {
    if (companyId && companyId !== "all") {
      setSelectedCompanyId(companyId);
    } else if (!selectedCompanyId) {
      setSelectedCompanyId("all-companies");
    }
  }, [companyId]);

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

  const loadAttendance = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      const res = await salaryApi.getAttendanceGrid(user?.accessToken, user?.tokenType, {
        companyId: selectedCompanyId === "all-companies" ? "" : selectedCompanyId,
        unit: selectedUnit,
        month: selectedMonth,
        year: selectedYear,
        only_uploaded: onlyUploaded ? 1 : 0,
      });
      const emps = res?.data?.employees || [];
      setEmployees(emps);
      setAttendanceMap(res?.data?.attendance || {});
      setAttendanceDetails(res?.data?.attendance_details || {});
    } catch (err) {
      toast.error(err.message || "Failed to load attendance records");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAttendance();
  }, [selectedCompanyId, selectedUnit, selectedMonth, selectedYear, onlyUploaded, user?.accessToken, user?.tokenType]);

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
    return employees.map((emp) => {
      const codeKey = String(emp.emp_code || emp.punching_no || emp.form_no || emp.id || "").trim();
      const trimmedKey = codeKey.replace(/^0+/, "");
      const punchingKey = emp.punching_no ? String(emp.punching_no).trim() : "";
      const formKey = emp.form_no ? String(emp.form_no).trim() : "";
      const userIdKey = emp.id ? `user_${emp.id}` : "";
      const rawIdKey = emp.id ? String(emp.id) : "";

      const empData = attendanceMap[codeKey]
        || (trimmedKey && attendanceMap[trimmedKey])
        || (punchingKey && attendanceMap[punchingKey])
        || (formKey && attendanceMap[formKey])
        || (userIdKey && attendanceMap[userIdKey])
        || (rawIdKey && attendanceMap[rawIdKey])
        || {};

      const empDetails = attendanceDetails[codeKey]?.[targetDateStr]
        || (trimmedKey && attendanceDetails[trimmedKey]?.[targetDateStr])
        || (punchingKey && attendanceDetails[punchingKey]?.[targetDateStr])
        || (formKey && attendanceDetails[formKey]?.[targetDateStr])
        || (userIdKey && attendanceDetails[userIdKey]?.[targetDateStr])
        || (rawIdKey && attendanceDetails[rawIdKey]?.[targetDateStr])
        || {};

      const dayStatus = empDetails.status || empData[targetDateStr] || "not_marked";

      let checkIn = empDetails.check_in || "—";
      let checkOut = empDetails.check_out || "—";
      // The backend stores work_hours as an already-suffixed string (e.g.
      // "7.50 hrs") for eSSL-synced rows -- Number() on that returns NaN
      // because of the trailing text, where parseFloat() correctly reads
      // just the leading numeric part.
      const workHoursNum = empDetails.work_hours !== undefined && empDetails.work_hours !== null
        ? parseFloat(empDetails.work_hours)
        : NaN;
      let workHours = !Number.isNaN(workHoursNum) ? `${workHoursNum.toFixed(1)} hrs` : "—";
      let deviceSerial = empDetails.device_serial || null;
      let breakTime = "—";
      let overtime = "0.0 hrs";

      if (!Number.isNaN(workHoursNum) && workHoursNum > 8) {
        overtime = `${(workHoursNum - 8).toFixed(1)} hrs`;
      }

      let remarks;
      if (dayStatus === "present") {
        remarks = "Present";
      } else if (dayStatus === "late") {
        remarks = "Late Arrival";
      } else if (dayStatus === "half_day") {
        remarks = "Half Day";
      } else if (dayStatus === "leave") {
        remarks = "Leave Approved";
      } else if (dayStatus === "absent") {
        remarks = "Absent";
      } else {
        remarks = "Not Marked";
      }

      // Calculate monthly summary metrics for this employee
      let monthPresents = 0;
      let monthHalfDays = 0;
      let monthLeaves = 0;
      let monthAbsents = 0;
      Object.values(empData).forEach((st) => {
        if (st === "present" || st === "late") monthPresents++;
        else if (st === "half_day") { monthHalfDays++; monthPresents += 0.5; }
        else if (st === "leave") monthLeaves++;
        else if (st === "absent") monthAbsents++;
      });

      const displayCode = emp.emp_code || emp.punching_no || emp.form_no || (emp.id ? `EMP-${emp.id}` : "—");

      return {
        ...emp,
        emp_code: displayCode,
        raw_emp_code: emp.emp_code,
        dayStatus,
        checkIn,
        checkOut,
        workHours,
        deviceSerial,
        breakTime,
        overtime,
        remarks,
        monthPresents,
        monthHalfDays,
        monthLeaves,
        monthAbsents,
        shiftName: emp.shift_name || emp.shift || "—",
      };
    });
  }, [employees, attendanceMap, attendanceDetails, targetDateStr]);

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

  // Rows matching search/department/shift, BEFORE the status tab filter --
  // used both as the base for the table and to compute stable status-tab
  // counts that don't collapse to zero once a tab other than "All" is active.
  const baseFilteredRows = useMemo(() => {
    const q = String(searchQuery || "").toLowerCase().trim();
    return processedRows.filter((row) => {
      const matchesSearch = !q ||
        String(row.name || "").toLowerCase().includes(q) ||
        String(row.emp_code || "").toLowerCase().includes(q) ||
        String(row.punching_no || "").toLowerCase().includes(q) ||
        String(row.form_no || "").toLowerCase().includes(q) ||
        String(row.id || "").toLowerCase().includes(q) ||
        String(row.department || "").toLowerCase().includes(q) ||
        String(row.shiftName || "").toLowerCase().includes(q) ||
        // Manually mapped punching codes (Map Attendance) don't live on any
        // of the employee's own fields above, so a code that only resolves
        // via that mapping was otherwise unsearchable even though it now
        // shows correct attendance.
        (Array.isArray(row.mapped_codes) && row.mapped_codes.some((c) => String(c).toLowerCase().includes(q)));

      const matchesDept = !selectedDepartment || row.department === selectedDepartment;
      const matchesShift = !selectedShift || row.shiftName === selectedShift;

      return matchesSearch && matchesDept && matchesShift;
    });
  }, [processedRows, searchQuery, selectedDepartment, selectedShift]);

  // Counts per status for the quick-filter tabs (reflects search/dept/shift
  // filters but not the tab selection itself, so switching tabs doesn't
  // change the other tabs' numbers).
  const statusCounts = useMemo(() => {
    const counts = { all: baseFilteredRows.length, present: 0, absent: 0, late: 0, half_day: 0, leave: 0, not_marked: 0 };
    baseFilteredRows.forEach((r) => {
      counts[r.dayStatus] = (counts[r.dayStatus] || 0) + 1;
    });
    return counts;
  }, [baseFilteredRows]);

  // Filtered & Sorted Employees Table
  const filteredRows = useMemo(() => {
    return baseFilteredRows
      .filter((row) => statusFilter === "all" || row.dayStatus === statusFilter)
      .sort((a, b) => {
        let valA = a[sortField] ?? "";
        let valB = b[sortField] ?? "";
        if (typeof valA !== "string") valA = String(valA);
        if (typeof valB !== "string") valB = String(valB);
        valA = valA.toLowerCase();
        valB = valB.toLowerCase();

        if (valA < valB) return sortDirection === "asc" ? -1 : 1;
        if (valA > valB) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
  }, [baseFilteredRows, statusFilter, sortField, sortDirection]);

  // Pagination slices
  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredRows.slice(start, start + rowsPerPage);
  }, [filteredRows, currentPage, rowsPerPage]);

  const totalPages = Math.ceil(filteredRows.length / rowsPerPage) || 1;

  const handleSyncEssl = async () => {
    setIsSyncing(true);
    setSyncResult(null);
    try {
      const payload = {
        month: parseInt(syncMonth, 10),
        year: parseInt(syncYear, 10),
        company_code: selectedCompanyId === "all-companies" ? "" : selectedCompanyId,
        start_date: syncStartDate || undefined,
        end_date: syncEndDate || undefined,
      };
      const res = await salaryApi.syncEsslAttendance(payload, user?.accessToken, user?.tokenType);
      if (res?.status) {
        setSyncResult(res);
        toast.success(res.message || "eSSL Biometric attendance synced successfully!");
        await loadAttendance();
      } else {
        toast.error(res?.message || "Failed to sync eSSL Biometric attendance");
      }
    } catch (err) {
      toast.error(err.message || "Error syncing eSSL biometric attendance");
    } finally {
      setIsSyncing(false);
    }
  };

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
    setOnlyUploaded(false);
    setSelectedDay(String(new Date().getDate()));
  };

  const handleExportExcel = () => {
    if (filteredRows.length === 0) {
      toast.error("No records to export");
      return;
    }
    const headers = [
      "Emp Code", "Name", "Department", "Date",
      "Check In", "Check Out", "Work Hours", "Status",
    ];
    const data = filteredRows.map((r) => [
      r.emp_code, r.name, r.department || "—", targetDateStr,
      r.checkIn, r.checkOut, r.workHours, r.dayStatus.toUpperCase(),
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

  const openExportModal = (emp) => {
    setSelectedExportEmp(emp);
    setExportMonth(selectedMonth);
    setExportDay("");
    setIsExportModalOpen(true);
  };

  const exportDaysInMonth = useMemo(() => {
    const mNum = parseInt(exportMonth || selectedMonth, 10);
    const yNum = parseInt(selectedYear, 10);
    if (Number.isNaN(mNum) || Number.isNaN(yNum)) return 31;
    return new Date(yNum, mNum, 0).getDate();
  }, [exportMonth, selectedMonth, selectedYear]);

  const handleExportSingleEmployee = async () => {
    if (!selectedExportEmp) return;
    setIsExporting(true);

    try {
      const targetMonth = exportMonth || selectedMonth;
      const targetYear = selectedYear;

      let detailsMap = attendanceDetails;
      let mapData = attendanceMap;

      if (targetMonth !== selectedMonth || targetYear !== selectedYear) {
        const res = await salaryApi.getAttendanceGrid(user?.accessToken, user?.tokenType, {
          companyId: selectedCompanyId === "all-companies" ? "" : selectedCompanyId,
          unit: selectedUnit,
          month: targetMonth,
          year: targetYear,
          only_uploaded: onlyUploaded ? 1 : 0,
        });
        if (res?.data) {
          detailsMap = res.data.attendance_details || {};
          mapData = res.data.attendance || {};
        }
      }

      const codeKey = String(selectedExportEmp.emp_code || selectedExportEmp.punching_no || selectedExportEmp.form_no || selectedExportEmp.id || "").trim();
      const trimmedKey = codeKey.replace(/^0+/, "");
      const punchingKey = selectedExportEmp.punching_no ? String(selectedExportEmp.punching_no).trim() : "";
      const formKey = selectedExportEmp.form_no ? String(selectedExportEmp.form_no).trim() : "";
      const userIdKey = selectedExportEmp.id ? `user_${selectedExportEmp.id}` : "";
      const rawIdKey = selectedExportEmp.id ? String(selectedExportEmp.id) : "";

      const empDetailsByDate = detailsMap[codeKey]
        || (trimmedKey && detailsMap[trimmedKey])
        || (punchingKey && detailsMap[punchingKey])
        || (formKey && detailsMap[formKey])
        || (userIdKey && detailsMap[userIdKey])
        || (rawIdKey && detailsMap[rawIdKey])
        || {};

      const empStatusByDate = mapData[codeKey]
        || (trimmedKey && mapData[trimmedKey])
        || (punchingKey && mapData[punchingKey])
        || (formKey && mapData[formKey])
        || (userIdKey && mapData[userIdKey])
        || (rawIdKey && mapData[rawIdKey])
        || {};

      const mNum = parseInt(targetMonth, 10);
      const yNum = parseInt(targetYear, 10);
      const daysInMonth = new Date(yNum, mNum, 0).getDate();

      let daysToExport = [];
      if (exportDay) {
        daysToExport = [parseInt(exportDay, 10)];
      } else {
        daysToExport = Array.from({ length: daysInMonth }, (_, i) => i + 1);
      }

      const headers = [
        "Date",
        "Day",
        "Employee Code",
        "Employee Name",
        "Department",
        "Shift",
        "Check-In",
        "Check-Out",
        "Work Hours",
        "Status",
        "Remarks",
      ];

      const rows = daysToExport.map((dayNum) => {
        const dateStr = `${yNum}-${String(mNum).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        const dateObj = new Date(yNum, mNum - 1, dayNum);
        const dayName = DAY_NAMES[dateObj.getDay()] || "";

        const detail = empDetailsByDate[dateStr] || {};
        const statusVal = detail.status || empStatusByDate[dateStr] || "not_marked";

        const checkIn = detail.check_in || "-";
        const checkOut = detail.check_out || "-";

        const whNum = detail.work_hours !== undefined && detail.work_hours !== null ? parseFloat(detail.work_hours) : NaN;
        const workHours = !Number.isNaN(whNum) ? `${whNum.toFixed(1)} hrs` : "-";

        let statusLabel = "Not Marked";
        let remarks = "Not Marked";
        if (statusVal === "present") { statusLabel = "Present"; remarks = "Present"; }
        else if (statusVal === "late") { statusLabel = "Late"; remarks = "Late Arrival"; }
        else if (statusVal === "half_day") { statusLabel = "Half Day"; remarks = "Half Day"; }
        else if (statusVal === "leave") { statusLabel = "Leave"; remarks = "Leave Approved"; }
        else if (statusVal === "absent") { statusLabel = "Absent"; remarks = "Absent"; }

        return [
          dateStr,
          dayName,
          selectedExportEmp.emp_code || "-",
          selectedExportEmp.name || "-",
          selectedExportEmp.department || "-",
          selectedExportEmp.shiftName || selectedExportEmp.shift || "-",
          checkIn,
          checkOut,
          workHours,
          statusLabel,
          remarks,
        ];
      });

      const monthName = MONTHS[mNum - 1] || `Month_${mNum}`;
      const cleanEmpCode = String(selectedExportEmp.emp_code || "EMP").replace(/[^a-zA-Z0-9_-]/g, "_");
      const cleanEmpName = String(selectedExportEmp.name || "Employee").replace(/[^a-zA-Z0-9_-]/g, "_");

      const filename = exportDay
        ? `Attendance_${cleanEmpCode}_${cleanEmpName}_${monthName}_Day_${exportDay}_${yNum}.xlsx`
        : `Attendance_${cleanEmpCode}_${cleanEmpName}_${monthName}_${yNum}.xlsx`;

      await saveAoaToXlsx(filename, "Attendance Data", [headers, ...rows]);
      toast.success(`Exported attendance data for ${selectedExportEmp.name || selectedExportEmp.emp_code}!`);
      setIsExportModalOpen(false);
    } catch (err) {
      toast.error(err.message || "Failed to export attendance data");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full min-h-0 bg-gray-50/60 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      {/* Page Header */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-indigo-600 p-2.5 text-white shadow-sm shrink-0">
            <Fingerprint className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
              Attendance Management
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 max-w-md">
              Monitor workforce attendance, biometric punches and attendance exceptions.
            </p>
          </div>
        </div>

        {/* Actions: one primary, rest ghost/outline */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setSyncMonth(selectedMonth);
              setSyncYear(selectedYear);
              setSyncResult(null);
              setIsSyncModalOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:shadow transition active:scale-95"
          >
            <Fingerprint className="h-4 w-4 text-blue-200" />
            <span>Sync eSSL Biometric</span>
            <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold">28 Machines</span>
          </button>

          <button
            onClick={() => setIsMapModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          >
            <UserCog className="h-3.5 w-3.5" />
            Map Attendance
          </button>

          <button
            onClick={() => {
              loadAttendance();
              toast.success("Attendance refreshed!");
            }}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-indigo-600" : ""}`} />
            Refresh
          </button>
          <button
            onClick={handleExportExcel}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Export
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          >
            <Printer className="h-3.5 w-3.5" />
            Print
          </button>
          <button
            onClick={() => setIsEsslSettingsOpen(true)}
            title="eSSL Biometric Connection Settings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
          >
            <SettingsIcon className="h-3.5 w-3.5" />
            Settings
          </button>
        </div>
      </div>

      {/* Compact Summary: all 8 KPIs in a single row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2.5">
        {[
          { label: "Total Employees", value: metrics.total, icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/50" },
          { label: "Present Today", value: metrics.present, icon: UserCheck, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/50" },
          { label: "Absent Today", value: metrics.absent, icon: UserX, color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/50" },
          { label: "Attendance %", value: `${metrics.attPercentage}%`, icon: Percent, color: "text-teal-600 dark:text-teal-400", bg: "bg-teal-50 dark:bg-teal-950/50" },
          { label: "Late Arrivals", value: metrics.late, icon: Clock, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/40" },
          { label: "Half Day", value: metrics.halfDay, icon: AlertCircle, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-950/40" },
          { label: "On Leave", value: metrics.leave, icon: Palmtree, color: "text-sky-600 dark:text-sky-400", bg: "bg-sky-50 dark:bg-sky-950/40" },
          { label: "With Overtime", value: metrics.overtime, icon: TrendingUp, color: "text-indigo-600 dark:text-indigo-400", bg: "bg-indigo-50 dark:bg-indigo-950/40" },
        ].map((card, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-2.5 shadow-xs min-w-0"
          >
            <div className={`p-1.5 rounded-lg ${card.bg} shrink-0`}>
              <card.icon className={`h-3.5 w-3.5 ${card.color}`} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 truncate">
                {card.label}
              </div>
              <div className="text-base font-bold text-gray-900 dark:text-white tracking-tight leading-tight truncate">
                {card.value}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Compact Filters Panel */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 backdrop-blur-md p-4 shadow-sm flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search employee, code or department..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 pl-9 pr-4 py-2 text-xs text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>

          {/* Mobile Filter Toggle Button */}
          <button
            onClick={() => setShowMobileFilters((prev) => !prev)}
            className="md:hidden inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 transition"
          >
            <Filter className="h-3 w-3" />
            <span>Filters</span>
            <ChevronDown className={`h-3 w-3 transition-transform ${showMobileFilters ? "rotate-180" : ""}`} />
          </button>

          <label className="hidden md:inline-flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none whitespace-nowrap">
            <input
              type="checkbox"
              checked={onlyUploaded}
              onChange={(e) => setOnlyUploaded(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-[11px]">Only with logs</span>
          </label>

          <button
            onClick={handleResetFilters}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 transition whitespace-nowrap"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>

        {/* Filter Controls Grid */}
        <div className={`grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5 ${showMobileFilters ? "block" : "hidden md:grid"}`}>
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
              <option value="all-companies">Both Companies (All)</option>
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

          {/* Day */}
          <div className="col-span-1 md:col-span-1">
            <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
              Day
            </label>
            <select
              value={selectedDay}
              onChange={(e) => setSelectedDay(e.target.value)}
              className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20 font-medium"
            >
              {Array.from({ length: totalDays }, (_, i) => i + 1).map((d) => (
                <option key={d} value={String(d)}>
                  Day {d} {Number(selectedDay) === d && d === new Date().getDate() && Number(selectedMonth) === new Date().getMonth() + 1 && Number(selectedYear) === new Date().getFullYear() ? "(Today)" : ""}
                </option>
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

      {/* Attendance Status Tabs (quick filters) */}
      <div className="flex flex-wrap items-center gap-1.5">
        {STATUS_TABS.map((tab) => {
          const isActive = statusFilter === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setStatusFilter(tab.key);
                setCurrentPage(1);
              }}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                isActive
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
            >
              {tab.label}
              <span className={`text-[10px] font-bold ${isActive ? "text-indigo-100" : "text-gray-400 dark:text-gray-500"}`}>
                {statusCounts[tab.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Enterprise Attendance Table -- this card owns the only
          scrollbar on this page: it fills the remaining viewport height and
          scrolls its own body, so the header/summary/filters/tabs above
          never scroll away and the page itself never needs a scrollbar. */}
      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        {!selectedCompanyId ? (
          <div className="flex-1 min-h-0 py-20 text-center text-sm text-gray-400 flex flex-col items-center justify-center gap-2">
            <Building2 className="h-8 w-8 text-gray-300 dark:text-gray-700" />
            <span>Select a company to view attendance details.</span>
          </div>
        ) : loading ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-gray-400 gap-2">
            <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
            <span className="text-xs font-medium">Loading attendance data...</span>
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="flex-1 min-h-0 text-center text-sm text-gray-500 dark:text-gray-400 flex flex-col items-center justify-center gap-2">
            <AlertCircle className="h-8 w-8 text-gray-300 dark:text-gray-700" />
            <span>No attendance records matching current filters.</span>
          </div>
        ) : (
          <>
            {/* Scrollable body: mobile cards + desktop table share this single
                scroll region so the sticky table header works correctly and
                the outer page never grows past the viewport. */}
            <div className="flex-1 min-h-0 overflow-auto">
            {/* Mobile Card List View (No horizontal scrolling on mobile) */}
            <div className="sm:hidden divide-y divide-gray-100 dark:divide-gray-800">
              {paginatedRows.map((emp) => {
                const statusConfig = STATUS_CONFIG[emp.dayStatus] || STATUS_CONFIG.present;
                const StatusIcon = statusConfig.icon;
                const exception = getExceptionInfo(emp);

                return (
                  <div key={emp.id || emp.emp_code} className="p-3.5 flex flex-col gap-2.5">
                    {/* Top: Avatar, Name, Code, Status */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs overflow-hidden border border-indigo-200 dark:border-indigo-800 shrink-0">
                          {emp.photo ? (
                            <img src={emp.photo} alt={emp.name} className="h-full w-full object-cover" />
                          ) : (
                            (emp.name || "E").slice(0, 2).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                            {emp.name}
                          </div>
                          <div className="text-[10px] text-gray-400 font-mono">
                            #{emp.emp_code} {emp.department ? `· ${emp.department}` : ''}
                          </div>
                        </div>
                      </div>

                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${statusConfig.badge}`}>
                        <StatusIcon className="h-3 w-3" />
                        {statusConfig.short}
                      </span>
                    </div>

                    {/* Bottom: Check-In, Check-Out, Work Hours & View action */}
                    <div className="flex items-center justify-between pt-1 text-xs">
                      <div className="flex items-center gap-3 text-[11px]">
                        <div>
                          <span className="text-gray-400 text-[10px] block font-medium">IN</span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{emp.checkIn}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 text-[10px] block font-medium">OUT</span>
                          <span className="font-mono font-medium text-gray-700 dark:text-gray-300">{emp.checkOut}</span>
                        </div>
                        <div>
                          <span className="text-gray-400 text-[10px] block font-medium">HOURS</span>
                          <span className="font-mono font-medium text-indigo-600 dark:text-indigo-400">{emp.workHours}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => openExportModal(emp)}
                          aria-label="Export attendance"
                          title="Export attendance"
                          className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                        >
                          <FileSpreadsheet className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => openEmployeeCalendar(emp)}
                          aria-label="View attendance details"
                          title="View attendance details"
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 transition"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </button>
                      </div>
                    </div>

                    {exception && (
                      <div className={`text-[11px] font-medium ${exception.className}`}>
                        {exception.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Desktop Table View -- lives directly in the single scroll
                region above (no nested overflow wrapper) so its sticky
                <thead> sticks to that region instead of to itself. */}
            <table className="hidden sm:table w-full text-left text-xs border-collapse">
                <colgroup>
                  <col className="w-[36%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[11%]" />
                  <col className="w-[12%]" />
                  <col className="w-[8%]" />
                </colgroup>
                <thead>
                  <tr className="sticky top-0 z-10 bg-gray-100/80 dark:bg-gray-800/80 backdrop-blur border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 uppercase tracking-wider font-bold text-[11px]">
                    <th className="py-3 px-4 cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition" onClick={() => handleSort("name")}>
                      Employee {sortField === "name" && (sortDirection === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="py-3 px-3">Check-In</th>
                    <th className="py-3 px-3">Check-Out</th>
                    <th className="py-3 px-3">Work Hours</th>
                    <th className="py-3 px-3 cursor-pointer hover:bg-gray-200/60 dark:hover:bg-gray-700/60 transition" onClick={() => handleSort("dayStatus")}>
                      Status {sortField === "dayStatus" && (sortDirection === "asc" ? "↑" : "↓")}
                    </th>
                    <th className="py-3 px-3">Exception</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
                  {paginatedRows.map((emp, index) => {
                    const statusConfig = STATUS_CONFIG[emp.dayStatus] || STATUS_CONFIG.present;
                    const StatusIcon = statusConfig.icon;
                    const exception = getExceptionInfo(emp);

                    return (
                      <tr
                        key={emp.id || emp.emp_code}
                        className={`hover:bg-gray-50/80 dark:hover:bg-gray-800/50 transition-colors ${
                          index % 2 === 0 ? "bg-white dark:bg-gray-900" : "bg-gray-50/30 dark:bg-gray-900/40"
                        }`}
                      >
                        {/* Employee identity: name is the dominant element, code + dept secondary */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold flex items-center justify-center text-xs overflow-hidden border border-indigo-200 dark:border-indigo-800 shrink-0">
                              {emp.photo ? (
                                <img src={emp.photo} alt={emp.name} className="h-full w-full object-cover" />
                              ) : (
                                (emp.name || "E").slice(0, 2).toUpperCase()
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-[14px] text-gray-900 dark:text-white leading-tight truncate">
                                {emp.name}
                              </div>
                              <div className="text-[11px] text-gray-400 font-mono truncate">
                                #{emp.emp_code}{emp.department ? ` · ${emp.department}` : ''}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Check-In */}
                        <td className="py-3.5 px-3 text-gray-700 dark:text-gray-300 font-mono text-[12px]">
                          {emp.checkIn}
                        </td>

                        {/* Check-Out */}
                        <td className="py-3.5 px-3 text-gray-700 dark:text-gray-300 font-mono text-[12px]">
                          {emp.checkOut}
                        </td>

                        {/* Work Hours */}
                        <td className="py-3.5 px-3 font-mono text-[12px] text-gray-700 dark:text-gray-300">
                          {emp.workHours}
                          {emp.overtime && emp.overtime !== "0.0 hrs" && (
                            <span className="ml-1 text-[10px] text-amber-600 font-medium">({emp.overtime} OT)</span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3.5 px-3">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusConfig.badge}`}>
                            <StatusIcon className="h-3 w-3" />
                            {statusConfig.short}
                          </span>
                        </td>

                        {/* Exception */}
                        <td className="py-3.5 px-3 text-[12px]">
                          {exception ? (
                            <span className={`font-medium ${exception.className}`}>{exception.text}</span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>

                        {/* Actions: primary View + a minimal secondary Export icon */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              onClick={() => openExportModal(emp)}
                              aria-label="Export attendance"
                              title="Export attendance"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition"
                            >
                              <FileSpreadsheet className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openEmployeeCalendar(emp)}
                              aria-label="View attendance details"
                              title="View attendance details"
                              className="inline-flex items-center justify-center h-7 w-7 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                          </div>
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
        size="xl"
      >
        {selectedEmployee && (() => {
          // Calculate counts for this employee
          let presentCount = 0;
          let absentCount = 0;
          let halfDayCount = 0;
          let leaveCount = 0;

          const codeKey = String(selectedEmployee.emp_code || selectedEmployee.punching_no || selectedEmployee.form_no || selectedEmployee.id || "").trim();
          const trimmedKey = codeKey.replace(/^0+/, "");
          const punchingKey = selectedEmployee.punching_no ? String(selectedEmployee.punching_no).trim() : "";
          const formKey = selectedEmployee.form_no ? String(selectedEmployee.form_no).trim() : "";
          const userIdKey = selectedEmployee.id ? `user_${selectedEmployee.id}` : "";
          const rawIdKey = selectedEmployee.id ? String(selectedEmployee.id) : "";

          const empData = attendanceMap[codeKey]
            || (trimmedKey && attendanceMap[trimmedKey])
            || (punchingKey && attendanceMap[punchingKey])
            || (formKey && attendanceMap[formKey])
            || (userIdKey && attendanceMap[userIdKey])
            || (rawIdKey && attendanceMap[rawIdKey])
            || {};

          const empDetailsByDate = attendanceDetails[codeKey]
            || (trimmedKey && attendanceDetails[trimmedKey])
            || (punchingKey && attendanceDetails[punchingKey])
            || (formKey && attendanceDetails[formKey])
            || (userIdKey && attendanceDetails[userIdKey])
            || (rawIdKey && attendanceDetails[rawIdKey])
            || {};

          Object.values(empData).forEach(status => {
            if (status === 'present' || status === 'late') presentCount++;
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
                      return <div key={`empty-${idx}`} className="h-14 sm:h-20 border-r border-b border-gray-100" />;
                    }

                    const status = empData[cell.dateStr];
                    const conf = status ? STATUS_CONFIG[status] : null;
                    const detail = empDetailsByDate[cell.dateStr];
                    const hasPunches = detail && (detail.check_in || detail.check_out);

                    return (
                      <div
                        key={cell.dateStr}
                        title={hasPunches ? `In: ${detail.check_in || "—"}  Out: ${detail.check_out || "—"}` : undefined}
                        className="h-14 sm:h-20 border-r border-b border-gray-100 p-1 flex flex-col items-center justify-center gap-0.5 transition hover:bg-gray-50 relative"
                      >
                        <span className={`text-[10px] sm:text-[11px] font-bold ${idx % 7 === 0 ? 'text-red-500' : 'text-gray-600'}`}>
                          {cell.day}
                        </span>
                        {conf && (
                          <span className={`inline-flex items-center justify-center rounded px-1 py-0.5 text-[8px] font-bold ${conf.badge}`}>
                            {conf.short.charAt(0)}
                          </span>
                        )}
                        {hasPunches && (
                          <div className="flex flex-col items-center leading-none">
                            <span className="text-[7px] sm:text-[8px] font-mono font-semibold text-emerald-600">
                              {detail.check_in ? detail.check_in.slice(0, 5) : "--:--"}
                            </span>
                            <span className="text-[7px] sm:text-[8px] font-mono font-semibold text-red-500">
                              {detail.check_out ? detail.check_out.slice(0, 5) : "--:--"}
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

      {/* eSSL Biometric Attendance Synchronization Modal */}
      <Modal
        isOpen={isSyncModalOpen}
        onClose={() => !isSyncing && setIsSyncModalOpen(false)}
        title="eSSL Biometric Attendance Sync"
        size="lg"
      >
        <div className="flex flex-col gap-4 text-xs text-gray-700 dark:text-gray-300">
          {/* Header Info Banner */}
          <div className="flex items-start gap-3 rounded-xl bg-gradient-to-br from-blue-500/10 via-indigo-500/10 to-purple-500/10 border border-blue-200/80 dark:border-blue-900/50 p-3.5">
            <div className="rounded-lg bg-blue-600 p-2 text-white shrink-0 shadow-sm">
              <Fingerprint className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-900 dark:text-white text-sm">
                  eSSL SOAP WebAPIService
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-950 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  28 Devices Online
                </span>
              </div>
              <p className="mt-1 text-gray-500 dark:text-gray-400 text-[11px] leading-relaxed">
                Connects directly to the enterprise biometric cloud server (<code className="font-mono text-[10px] bg-white/80 dark:bg-gray-800 px-1 py-0.5 rounded">/WebAPIService.asmx</code>) to pull timestamped punches, calculate daily check-in, check-out, duration, and update company attendance records.
              </p>
            </div>
          </div>

          {/* Sync Timeframe Configuration */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-3.5 flex flex-col gap-3">
            <span className="font-bold text-gray-900 dark:text-white text-xs uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
              Target Sync Timeframe
            </span>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
                  Month
                </label>
                <select
                  value={syncMonth}
                  onChange={(e) => setSyncMonth(e.target.value)}
                  disabled={isSyncing}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  {MONTHS.map((m, idx) => (
                    <option key={m} value={String(idx + 1)}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
                  Year
                </label>
                <select
                  value={syncYear}
                  onChange={(e) => setSyncYear(e.target.value)}
                  disabled={isSyncing}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  {YEARS.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
                  Start Date (Optional)
                </label>
                <input
                  type="date"
                  value={syncStartDate}
                  onChange={(e) => setSyncStartDate(e.target.value)}
                  disabled={isSyncing}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 dark:text-gray-500 mb-1">
                  End Date (Optional)
                </label>
                <input
                  type="date"
                  value={syncEndDate}
                  onChange={(e) => setSyncEndDate(e.target.value)}
                  disabled={isSyncing}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2.5 py-1 text-xs outline-none focus:ring-2 focus:ring-brand-500/20"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-gray-200/60 dark:border-gray-800 text-[11px]">
              <span className="text-gray-500 dark:text-gray-400">
                Company Scope: <strong className="text-gray-900 dark:text-white">{selectedCompanyId === "all-companies" ? "Both Companies" : (activeCompanyConfig?.label || selectedCompanyId)}</strong>
              </span>
              <button
                type="button"
                onClick={() => setShowDevicesList((p) => !p)}
                className="text-brand-600 dark:text-brand-400 hover:underline font-medium inline-flex items-center gap-1"
              >
                <Server className="h-3 w-3" />
                {showDevicesList ? "Hide Devices List" : "View 28 Machine Serials"}
              </button>
            </div>

            {/* Collapsible Devices List */}
            {showDevicesList && (
              <div className="mt-2 p-2.5 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 max-h-36 overflow-y-auto">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 font-mono text-[10px]">
                  {ESSL_DEVICES.map((sn, i) => (
                    <div key={sn} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300">
                      <span className="text-gray-400 text-[9px]">#{i + 1}</span>
                      <span className="truncate">{sn}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sync Results Summary (if finished) */}
          {syncResult && (
            <div className="rounded-xl border border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/30 p-3.5 flex flex-col gap-2 animate-fadeIn">
              <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Sync Summary Results</span>
              </div>
              <p className="text-emerald-700 dark:text-emerald-400 text-[11px]">
                {syncResult.message}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                <div className="bg-white/80 dark:bg-gray-900/60 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                  <div className="text-[9px] uppercase font-sans text-gray-500 font-bold">Total Punches</div>
                  <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{syncResult.total_punches ?? 0}</div>
                </div>
                <div className="bg-white/80 dark:bg-gray-900/60 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                  <div className="text-[9px] uppercase font-sans text-gray-500 font-bold">Records Synced</div>
                  <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{syncResult.records_synced ?? 0}</div>
                </div>
                <div className="bg-white/80 dark:bg-gray-900/60 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                  <div className="text-[9px] uppercase font-sans text-gray-500 font-bold">Active Employees</div>
                  <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{syncResult.unique_employees ?? 0}</div>
                </div>
                <div className="bg-white/80 dark:bg-gray-900/60 p-2 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                  <div className="text-[9px] uppercase font-sans text-gray-500 font-bold">Machines Scanned</div>
                  <div className="text-base font-bold text-emerald-700 dark:text-emerald-300">{syncResult.devices_count ?? 28}</div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200 dark:border-gray-800">
            <button
              type="button"
              onClick={() => setIsSyncModalOpen(false)}
              disabled={isSyncing}
              className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition disabled:opacity-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSyncEssl}
              disabled={isSyncing}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-4 py-2 text-xs font-semibold text-white shadow hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 transition active:scale-95 disabled:opacity-60"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Syncing 28 eSSL Machines...</span>
                </>
              ) : (
                <>
                  <Fingerprint className="h-4 w-4" />
                  <span>Start Biometric Sync</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>

      {/* Employee <-> Punching Code Mapping Modal (single + bulk Excel) */}
      <MapAttendanceModal
        isOpen={isMapModalOpen}
        onClose={() => setIsMapModalOpen(false)}
        employees={employees}
        companyId={selectedCompanyId === "all-companies" ? "" : selectedCompanyId}
        deviceSerials={ESSL_DEVICES}
      />

      <EsslSettingsModal
        isOpen={isEsslSettingsOpen}
        onClose={() => setIsEsslSettingsOpen(false)}
      />


      {/* Employee Per-Entry Attendance Export Modal */}
      <Modal
        isOpen={isExportModalOpen}
        onClose={() => !isExporting && setIsExportModalOpen(false)}
        title="Export Employee Attendance Data"
        size="sm"
      >
        {selectedExportEmp && (
          <div className="flex flex-col gap-4 text-xs text-gray-700 dark:text-gray-300">
            {/* Employee Banner */}
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 p-3">
              <div className="rounded-lg bg-emerald-600 p-2 text-white shrink-0 shadow-sm">
                <FileSpreadsheet className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-gray-900 dark:text-white text-sm truncate">
                  {selectedExportEmp.name}
                </div>
                <div className="text-[11px] text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-0.5">
                  <span>Code: <strong className="text-gray-700 dark:text-gray-300 font-mono">{selectedExportEmp.emp_code}</strong></span>
                  {selectedExportEmp.department && (
                    <>
                      <span>•</span>
                      <span>Dept: <strong className="text-gray-700 dark:text-gray-300">{selectedExportEmp.department}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Select Month & Day Inputs */}
            <div className="grid grid-cols-2 gap-3 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/50 dark:bg-gray-900/50 p-3.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                  Month
                </label>
                <select
                  value={exportMonth}
                  onChange={(e) => {
                    const newM = e.target.value;
                    setExportMonth(newM);
                    const maxD = new Date(parseInt(selectedYear, 10), parseInt(newM, 10), 0).getDate();
                    if (exportDay && parseInt(exportDay, 10) > maxD) {
                      setExportDay("");
                    }
                  }}
                  disabled={isExporting}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {MONTHS.map((m, idx) => (
                    <option key={m} value={String(idx + 1)}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">
                  Day (Optional)
                </label>
                <select
                  value={exportDay}
                  onChange={(e) => setExportDay(e.target.value)}
                  disabled={isExporting}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="">All Days (Entire Month)</option>
                  {Array.from({ length: exportDaysInMonth }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={String(d)}>Day {d}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="text-[11px] text-gray-500 dark:text-gray-400 italic">
              {exportDay
                ? `Will export attendance for Day ${exportDay} of ${MONTHS[parseInt(exportMonth, 10) - 1]} ${selectedYear}.`
                : `Will export complete attendance data for all ${exportDaysInMonth} days of ${MONTHS[parseInt(exportMonth, 10) - 1]} ${selectedYear}.`}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-gray-200 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setIsExportModalOpen(false)}
                disabled={isExporting}
                className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-xs font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-750 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExportSingleEmployee}
                disabled={isExporting}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-4 py-2 text-xs font-semibold text-white shadow hover:from-emerald-700 hover:to-teal-700 transition active:scale-95 disabled:opacity-60"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating Excel...</span>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="h-4 w-4" />
                    <span>Export to Excel</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}