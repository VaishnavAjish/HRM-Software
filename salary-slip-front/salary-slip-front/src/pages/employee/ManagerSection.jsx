/* eslint-disable no-unused-vars */
import { useState, useEffect, useMemo, useRef } from "react";
import {
  Search,
  RefreshCw,
  Users,
  Eye,
  RotateCcw,
  ShieldAlert,
  Download,
  Columns as ColumnsIcon,
  Trash2,
  Filter,
  CheckCircle,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { salaryApi } from "../../utils/api";
import EmployeeDetailsModal from "../admin/AdminModals/EmployeeDetailsModal";
import Modal from "../../components/ui/Modal";
import Pagination from "../../components/ui/Pagination";
import { downloadCSV } from "../../utils/exportUtils";
import toast from "react-hot-toast";
import { getProfileCompletionPercentage } from "../../utils/profileCompletion";
import { isPhotoDeletedOrDummy } from "../../utils/photoStatus";
import { getEmployeePhotoUrl, mapEmployee } from "../admin/AdminModals/employee-helpers";
import { AlertCircle } from "lucide-react";

const ALL_COLUMNS = [
  { field: "profile", label: "PROFILE", defaultVisible: true },
  { field: "empCode", label: "EMP CODE", defaultVisible: true },
  { field: "name", label: "NAME", defaultVisible: true },
  { field: "gender", label: "GENDER", defaultVisible: true },
  { field: "email", label: "EMAIL", defaultVisible: false },
  { field: "mobileNo", label: "MOBILE", defaultVisible: false },
  { field: "dob", label: "DOB", defaultVisible: false },
  { field: "address", label: "ADDRESS", defaultVisible: false },
  { field: "department", label: "DEPARTMENT", defaultVisible: true },
  { field: "designation", label: "DESIGNATION", defaultVisible: true },
  { field: "city", label: "CITY", defaultVisible: false },
  { field: "district", label: "DISTRICT", defaultVisible: false },
  { field: "state", label: "STATE", defaultVisible: false },
  { field: "pin", label: "PIN", defaultVisible: false },
  { field: "aadharCardNo", label: "AADHAR CARD NO", defaultVisible: false },
  { field: "panCardNo", label: "PAN CARD NO", defaultVisible: false },
  { field: "bankName", label: "BANK NAME", defaultVisible: false },
  { field: "bankIfscCode", label: "BANK IFSC CODE", defaultVisible: false },
  { field: "bankAccountNo", label: "BANK ACCOUNT NO", defaultVisible: false },
  { field: "pfNo", label: "PF NO", defaultVisible: false },
  { field: "esiNo", label: "ESI NO", defaultVisible: false },
  { field: "joiningDate", label: "JOINING DATE", defaultVisible: false },
  { field: "resignationDate", label: "RESIGNATION DATE", defaultVisible: false },
  { field: "companyLabel", label: "COMPANY", defaultVisible: true },
  { field: "unit", label: "UNIT", defaultVisible: true },
  { field: "loginRole", label: "ROLE", defaultVisible: true },
  { field: "status", label: "STATUS", defaultVisible: true },
];

export default function ManagerSection() {
  const { user } = useAuth();
  const [isDeptHead, setIsDeptHead] = useState(true);

  useEffect(() => {
    if (user?.accessToken) {
      salaryApi.checkManagerStatus(user.accessToken, user.tokenType || "Bearer")
        .then((res) => {
          setIsDeptHead(Boolean(res?.is_manager));
        })
        .catch(() => {
          setIsDeptHead(false);
        });
    }
  }, [user?.accessToken, user?.tokenType]);

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedCompany, setSelectedCompany] = useState("all");
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [selectedGender, setSelectedGender] = useState("all");

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState([
    "profile", "empCode", "name", "gender", "department", "designation", "companyLabel", "unit", "loginRole", "status"
  ]);

  // Photo modal state
  const [photoModalRow, setPhotoModalRow] = useState(null);
  const modalPhotoUrl = photoModalRow
    ? getEmployeePhotoUrl(photoModalRow.photo || photoModalRow.user?.photo || photoModalRow.employee?.photo || photoModalRow.userPhoto || photoModalRow.userAvatar)
    : null;
  const [showColModal, setShowColModal] = useState(false);

  // Column filter popups state: { [field]: { operator: "contains", value: "" } }
  const [columnFilters, setColumnFilters] = useState({});
  const [activeFilterField, setActiveFilterField] = useState(null);
  const [filterOperator, setFilterOperator] = useState("contains");
  const [filterValue, setFilterValue] = useState("");
  const filterPopupRef = useRef(null);

  // Row Selection & Bulk Delete
  const [selectedIds, setSelectedIds] = useState([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [bulkDeleteLoading, setBulkDeleteLoading] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(15);

  // Modal state
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [reloadToken, setReloadToken] = useState(0);
  const [team, setTeam] = useState({ key: null, employees: [], stats: { total: 0, active: 0, inactive: 0 } });

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const filters = useMemo(() => ({
    search: searchTerm,
    status: statusFilter,
    department: selectedDept !== "all" ? selectedDept : "",
    company: selectedCompany !== "all" ? selectedCompany : "",
    unit: selectedUnit !== "all" ? selectedUnit : "",
    gender: selectedGender !== "all" ? selectedGender : "",
    limit: 1000,
  }), [searchTerm, statusFilter, selectedDept, selectedCompany, selectedUnit, selectedGender]);

  const requestKey = JSON.stringify([accessToken ?? "", tokenType, filters, reloadToken]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;

    salaryApi.getManagerTeam(accessToken, tokenType, filters)
      .then((res) => {
        if (cancelled) return;
        if (res?.status || res?.success) {
          const rawList = Array.isArray(res?.data)
            ? res.data
            : (Array.isArray(res?.data?.data) ? res.data.data : []);
          const teamData = rawList.map(mapEmployee);
          setTeam({
            key: requestKey,
            employees: teamData,
            stats: {
              total: res.total ?? res.meta?.total ?? teamData.length,
              active: res.active_count ?? teamData.filter(e => (e.status === 0 || e.status === "0" || e.statusLabel === "Active" || e.status === "Active")).length,
              inactive: res.inactive_count ?? teamData.filter(e => (e.status === 1 || e.status === "1" || e.statusLabel === "Inactive" || e.status === "Inactive")).length,
            },
          });
        } else {
          toast.error(res?.message || "Failed to load team employees.");
          setTeam((prev) => ({ ...prev, key: requestKey }));
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Error loading manager team:", err?.message);
        toast.error("Failed to load team data.");
        setTeam((prev) => ({ ...prev, key: requestKey }));
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType, filters, requestKey]);

  // Close column filter popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (filterPopupRef.current && !filterPopupRef.current.contains(event.target)) {
        setActiveFilterField(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const loading = !accessToken || team.key !== requestKey;
  const { employees, stats } = team;
  const fetchTeam = () => setReloadToken((n) => n + 1);

  // Helper to extract field value from employee
  const getFieldValue = (emp, field) => {
    switch (field) {
      case "profile":
        return `${getProfileCompletionPercentage(emp)}%`;
      case "empCode":
        return emp.empCode || emp.emp_code || "";
      case "name":
        return emp.name || emp.displayName || "";
      case "gender":
        return emp.gender || "";
      case "email":
        return emp.email || "";
      case "mobileNo":
        return emp.mobileNo || emp.mobile_no || emp.mobile || "";
      case "dob":
        return emp.dob || "";
      case "address":
        return emp.address || "";
      case "department":
        return emp.department || "";
      case "designation":
        return emp.designation || "";
      case "city":
        return emp.city || "";
      case "district":
        return emp.district || "";
      case "state":
        return emp.state || "";
      case "pin":
        return emp.pin || "";
      case "aadharCardNo":
        return emp.aadharCardNo || emp.aadhar_card_no || "";
      case "panCardNo":
        return emp.panCardNo || emp.pan_card_no || "";
      case "bankName":
        return emp.bankName || emp.bank_name || "";
      case "bankIfscCode":
        return emp.bankIfscCode || emp.bank_ifsc_code || "";
      case "bankAccountNo":
        return emp.bankAccountNo || emp.bank_account_no || "";
      case "pfNo":
        return emp.pfNo || emp.pf_no || "";
      case "esiNo":
        return emp.esiNo || emp.esi_no || "";
      case "joiningDate":
        return emp.joiningDate || emp.joining_date || "";
      case "resignationDate":
        return emp.resignationDate || emp.resignation_date || "";
      case "companyLabel":
        return emp.companyLabel || emp.company_code || emp.company || "";
      case "unit":
        return emp.unit || "";
      case "loginRole":
        return emp.loginRole === "superadmin" ? "Super Admin" : "Employee";
      case "status": {
        const isActive = emp.status === 0 || emp.status === "0" || emp.statusLabel === "Active" || emp.status === "Active";
        return isActive ? "Active" : "Inactive";
      }
      default:
        return emp[field] || "";
    }
  };

  // Apply per-column text filters
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      for (const [field, filter] of Object.entries(columnFilters)) {
        if (!filter || (!filter.value && filter.operator !== "isEmpty" && filter.operator !== "isNotEmpty")) continue;
        const val = String(getFieldValue(emp, field)).toLowerCase();
        const target = String(filter.value || "").toLowerCase();

        switch (filter.operator) {
          case "contains":
            if (!val.includes(target)) return false;
            break;
          case "equals":
            if (val !== target) return false;
            break;
          case "startsWith":
            if (!val.startsWith(target)) return false;
            break;
          case "endsWith":
            if (!val.endsWith(target)) return false;
            break;
          case "isEmpty":
            if (val.trim() !== "") return false;
            break;
          case "isNotEmpty":
            if (val.trim() === "") return false;
            break;
          default:
            if (!val.includes(target)) return false;
        }
      }
      return true;
    });
  }, [employees, columnFilters]);

  // Reset page to 1 whenever filters change
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentPage(1);
  }, [searchTerm, statusFilter, selectedDept, selectedCompany, selectedUnit, selectedGender, columnFilters]);

  // Paginated employees for current page
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * perPage;
    return filteredEmployees.slice(start, start + perPage);
  }, [filteredEmployees, currentPage, perPage]);

  // Extract unique dropdown options
  const departmentOptions = useMemo(() => {
    const depts = new Set();
    employees.forEach(e => { if (e.department) depts.add(e.department); });
    return Array.from(depts).sort();
  }, [employees]);

  const companyOptions = useMemo(() => {
    const comps = new Set();
    employees.forEach(e => {
      const c = e.companyLabel || e.company_code || e.company;
      if (c) comps.add(c);
    });
    return Array.from(comps).sort();
  }, [employees]);

  const unitOptions = useMemo(() => {
    const units = new Set();
    employees.forEach(e => { if (e.unit) units.add(e.unit); });
    return Array.from(units).sort();
  }, [employees]);

  // Visible column toggle
  const toggleColumnVisibility = (field) => {
    setVisibleColumns(prev =>
      prev.includes(field) ? prev.filter(f => f !== field) : [...prev, field]
    );
  };

  // Row selection handlers
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      const currentPageIds = paginatedEmployees.map(emp => emp.id || emp.empCode);
      setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageIds])));
    } else {
      const currentPageIds = new Set(paginatedEmployees.map(emp => emp.id || emp.empCode));
      setSelectedIds(prev => prev.filter(id => !currentPageIds.has(id)));
    }
  };

  const handleSelectRow = (e, id) => {
    e.stopPropagation();
    if (e.target.checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  const isAllSelected = paginatedEmployees.length > 0 && paginatedEmployees.every(emp => selectedIds.includes(emp.id || emp.empCode));
  const isSomeSelected = selectedIds.length > 0;

  // Bulk Delete action
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    setBulkDeleteLoading(true);
    try {
      if (salaryApi.deleteEmployees) {
        await salaryApi.deleteEmployees(selectedIds, accessToken, tokenType);
      } else {
        for (const id of selectedIds) {
          await salaryApi.deleteEmployee(id, accessToken, tokenType);
        }
      }
      toast.success(`Successfully deleted ${selectedIds.length} employee(s).`);
      setSelectedIds([]);
      setShowDeleteConfirm(false);
      fetchTeam();
    } catch (err) {
      console.error("Bulk delete error:", err);
      toast.error("Failed to delete selected employees.");
    } finally {
      setBulkDeleteLoading(false);
    }
  };

  // Export CSV handler
  const handleExportCSV = () => {
    if (filteredEmployees.length === 0) {
      toast.error("No data to export.");
      return;
    }
    const visibleColsObj = ALL_COLUMNS.filter(c => visibleColumns.includes(c.field));
    const csvRows = filteredEmployees.map(emp => {
      const row = {};
      visibleColsObj.forEach(col => {
        row[col.label] = getFieldValue(emp, col.field);
      });
      return row;
    });
    downloadCSV(csvRows, "Manager_Section_Employees");
    toast.success("CSV exported successfully.");
  };

  // Open Column Filter Popup
  const openFilterPopup = (e, field) => {
    e.stopPropagation();
    if (activeFilterField === field) {
      setActiveFilterField(null);
    } else {
      setActiveFilterField(field);
      setFilterOperator(columnFilters[field]?.operator || "contains");
      setFilterValue(columnFilters[field]?.value || "");
    }
  };

  const applyColumnFilter = (field) => {
    setColumnFilters(prev => ({
      ...prev,
      [field]: { operator: filterOperator, value: filterValue }
    }));
    setActiveFilterField(null);
  };

  const resetColumnFilter = (field) => {
    setColumnFilters(prev => {
      const copy = { ...prev };
      delete copy[field];
      return copy;
    });
    setActiveFilterField(null);
  };

  const handleRowClick = (emp) => {
    setSelectedEmployee(emp);
    setIsModalOpen(true);
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    setStatusFilter("all");
    setSelectedDept("all");
    setSelectedCompany("all");
    setSelectedUnit("all");
    setSelectedGender("all");
    setColumnFilters({});
    setSelectedIds([]);
  };

  if (!loading && !isDeptHead) {
    return (
      <div className="p-8 text-center min-h-[400px] flex items-center justify-center">
        <div className="mx-auto max-w-md rounded-2xl border border-amber-200 bg-amber-50 p-8 shadow-sm dark:border-amber-900/40 dark:bg-amber-950/30">
          <ShieldAlert className="mx-auto h-12 w-12 text-amber-500 mb-3" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Access Restricted</h2>
          <p className="mt-2 text-sm text-gray-600 dark:text-slate-300">
            The Manager Section is only available for employees assigned as a Department Head in <strong>HR → Organization → Departments</strong>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-70px)] p-1 sm:p-2 overflow-hidden">
      {/* CARD CONTAINER MATCHING VIEW EMPLOYEES EXACTLY */}
      <div className="flex-1 min-h-0 flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900 overflow-hidden">

        {/* SINGLE TOOLBAR BAR: FILTERS ON LEFT, ACTIONS ON RIGHT */}
        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3 p-3 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-slate-900">
          {/* Left side: Search, Status tabs, Department, Company, Unit, Gender, Counts */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Search Input */}
            <div className="relative w-48 sm:w-56">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <input
                type="text"
                placeholder="Search employee..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-9 pr-3 py-1.5 text-xs text-gray-900 outline-none transition focus:border-purple-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:border-purple-400"
              />
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-0.5 rounded-xl bg-gray-100 p-1 dark:bg-slate-800/80">
              {["all", "active", "inactive"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                    statusFilter === st
                      ? "bg-white text-purple-700 shadow dark:bg-purple-600 dark:text-white"
                      : "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            {/* Unit Dropdown */}
            <select
              value={selectedUnit}
              onChange={(e) => setSelectedUnit(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none transition focus:border-purple-500 dark:border-white/10 dark:bg-slate-950 dark:text-gray-300"
            >
              <option value="all">All Units</option>
              {unitOptions.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>

            {/* Gender Dropdown */}
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 outline-none transition focus:border-purple-500 dark:border-white/10 dark:bg-slate-950 dark:text-gray-300"
            >
              <option value="all">All Genders</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
            </select>

            {/* Reset Button */}
            <button
              onClick={handleResetFilters}
              className="flex items-center gap-1 rounded-xl border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800"
              title="Reset Filters"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>

            {/* Employee Counts */}
            <div className="text-xs font-medium text-gray-500 dark:text-slate-400 ml-1">
              <span className="font-bold text-gray-900 dark:text-white">
                {stats.total}
              </span>{" "}
              total employees{" "}
              <span className="text-green-600 font-bold dark:text-green-400">
                {stats.active} active
              </span>{" "}
              <span className="text-gray-400 font-bold">
                {stats.inactive} inactive
              </span>
            </div>
          </div>

          {/* Right side: Delete Selected, Export CSV, Columns, Refresh */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>

            <button
              onClick={() => setShowColModal(true)}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <ColumnsIcon className="h-3.5 w-3.5" />
              Columns
            </button>

            <button
              onClick={fetchTeam}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* TABLE CONTENT AREA */}
        <div className="flex-1 overflow-auto relative">
          <table className="w-full text-left text-xs">
            {/* Sticky Table Header */}
            <thead className="sticky top-0 z-20 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:bg-slate-950 dark:text-slate-400 border-b border-gray-200 dark:border-white/10 shadow-sm">
              <tr>
                {/* Select All Checkbox Column */}
                <th className="px-3 py-3 w-10 text-center bg-gray-50 dark:bg-slate-950">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-slate-900"
                  />
                </th>

                {/* Visible Column Headers with Column Filter icons */}
                {ALL_COLUMNS.filter(col => visibleColumns.includes(col.field)).map(col => {
                  const hasActiveFilter = Boolean(columnFilters[col.field]?.value || columnFilters[col.field]?.operator === "isEmpty" || columnFilters[col.field]?.operator === "isNotEmpty");
                  return (
                    <th
                      key={col.field}
                      className={`px-4 py-3 relative whitespace-nowrap bg-gray-50 dark:bg-slate-950 ${
                        col.field === "profile" ? "text-center w-24 min-w-[90px]" : ""
                      }`}
                    >
                      <div className={`flex items-center gap-1 ${col.field === "profile" ? "justify-center" : "justify-between"}`}>
                        <span>{col.label}</span>
                        {col.field !== "profile" && (
                          <button
                            onClick={(e) => openFilterPopup(e, col.field)}
                            className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-slate-800 transition ${
                              hasActiveFilter ? "text-purple-600 dark:text-purple-400 font-bold" : "text-gray-400 dark:text-slate-500"
                            }`}
                            title={`Filter ${col.label}`}
                          >
                            <Filter size={13} />
                          </button>
                        )}
                      </div>

                      {/* Column Filter Popup Modal */}
                      {col.field !== "profile" && activeFilterField === col.field && (
                        <div
                          ref={filterPopupRef}
                          onClick={(e) => e.stopPropagation()}
                          className="absolute left-0 top-full mt-1 z-50 w-56 rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-slate-800 dark:bg-slate-900 font-normal text-gray-900 dark:text-white normal-case tracking-normal"
                        >
                          <div className="space-y-2.5">
                            <select
                              value={filterOperator}
                              onChange={(e) => setFilterOperator(e.target.value)}
                              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-800 outline-none focus:border-purple-500 dark:border-slate-700 dark:bg-slate-950 dark:text-gray-200"
                            >
                              <option value="contains">Contains</option>
                              <option value="equals">Equals</option>
                              <option value="startsWith">Starts with</option>
                              <option value="endsWith">Ends with</option>
                              <option value="isEmpty">Is empty</option>
                              <option value="isNotEmpty">Is not empty</option>
                            </select>

                            {filterOperator !== "isEmpty" && filterOperator !== "isNotEmpty" && (
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                                <input
                                  type="text"
                                  placeholder="Q Filter..."
                                  value={filterValue}
                                  onChange={(e) => setFilterValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") applyColumnFilter(col.field);
                                  }}
                                  className="w-full rounded-lg border border-gray-200 bg-white pl-8 pr-2 py-1.5 text-xs text-gray-900 outline-none focus:border-purple-500 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                                />
                              </div>
                            )}

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                onClick={() => resetColumnFilter(col.field)}
                                className="rounded-lg border border-gray-200 px-3 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                Reset
                              </button>
                              <button
                                onClick={() => applyColumnFilter(col.field)}
                                className="rounded-lg bg-purple-600 px-3 py-1 text-xs font-semibold text-white shadow-sm hover:bg-purple-700"
                              >
                                Apply
                              </button>
                            </div>
                          </div>
                        </div>
                      )}
                    </th>
                  );
                })}

                <th className="px-4 py-3 text-center whitespace-nowrap bg-gray-50 dark:bg-slate-950">ACTIONS</th>
              </tr>
            </thead>

            {/* Scrollable Data Body */}
            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-3 py-3.5 text-center"><div className="h-4 w-4 mx-auto bg-gray-200 rounded dark:bg-slate-800" /></td>
                    {ALL_COLUMNS.filter(c => visibleColumns.includes(c.field)).map(c => (
                      <td key={c.field} className="px-4 py-3.5"><div className="h-4 w-20 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    ))}
                    <td className="px-4 py-3.5"><div className="h-4 w-10 mx-auto bg-gray-200 rounded dark:bg-slate-800" /></td>
                  </tr>
                ))
              ) : paginatedEmployees.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 2} className="px-4 py-12 text-center text-gray-400 dark:text-slate-500">
                    <Users className="mx-auto h-8 w-8 text-gray-300 dark:text-slate-600 mb-2" />
                    No employees found under your management.
                  </td>
                </tr>
              ) : (
                paginatedEmployees.map((emp) => {
                  const empId = emp.id || emp.empCode;
                  const isChecked = selectedIds.includes(empId);
                  const isActive = emp.status === 0 || emp.status === "0" || emp.statusLabel === "Active" || emp.status === "Active";

                  return (
                    <tr
                      key={empId}
                      onClick={() => handleRowClick(emp)}
                      className={`cursor-pointer transition ${
                        isChecked
                          ? "bg-purple-50/80 dark:bg-purple-950/40"
                          : "hover:bg-purple-50/40 dark:hover:bg-purple-950/20"
                      }`}
                    >
                      {/* Row Checkbox */}
                      <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => handleSelectRow(e, empId)}
                          className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500 dark:border-gray-600 dark:bg-slate-900"
                        />
                      </td>

                      {/* Visible Column Data Cells */}
                      {ALL_COLUMNS.filter(col => visibleColumns.includes(col.field)).map(col => {
                        if (col.field === "profile") {
                          const pct = getProfileCompletionPercentage(emp);
                          const photoUrl = getEmployeePhotoUrl(emp.photo || emp.user?.photo || emp.employee?.photo || emp.userPhoto || emp.userAvatar);
                          const initial = (emp.name || "?").trim().charAt(0).toUpperCase() || "?";

                          const barColorText =
                            pct === 100
                              ? "text-emerald-500"
                              : pct >= 75
                              ? "text-purple-500 dark:text-purple-400"
                              : pct >= 50
                              ? "text-amber-500"
                              : "text-red-500";

                          const badgeBg =
                            pct === 100
                              ? "bg-emerald-600 text-white border-white dark:border-gray-800"
                              : pct >= 75
                              ? "bg-purple-600 text-white border-white dark:border-gray-800"
                              : pct >= 50
                              ? "bg-amber-500 text-white border-white dark:border-gray-800"
                              : "bg-red-500 text-white border-white dark:border-gray-800";

                          // Radius r=17 -> circumference C = 2 * PI * 17 ≈ 106.81
                          const strokeDasharray = 106.81;
                          const strokeDashoffset = strokeDasharray - (pct / 100) * strokeDasharray;

                          return (
                            <td key={col.field} className="px-4 py-2 whitespace-nowrap text-center" onClick={(e) => e.stopPropagation()}>
                              <div className="flex h-full w-full items-center justify-center">
                                <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                                  <svg className="absolute inset-0 h-full w-full -rotate-90 transform" viewBox="0 0 40 40">
                                    <circle
                                      cx="20"
                                      cy="20"
                                      r="17"
                                      className="text-gray-200 dark:text-gray-700"
                                      strokeWidth="2.5"
                                      stroke="currentColor"
                                      fill="transparent"
                                    />
                                    <circle
                                      cx="20"
                                      cy="20"
                                      r="17"
                                      className={`${barColorText} transition-all duration-500`}
                                      strokeWidth="2.5"
                                      strokeDasharray={strokeDasharray}
                                      strokeDashoffset={strokeDashoffset}
                                      strokeLinecap="round"
                                      stroke="currentColor"
                                      fill="transparent"
                                    />
                                  </svg>

                                  <button
                                    type="button"
                                    onClick={() => setPhotoModalRow(emp)}
                                    className="group relative flex h-7 w-7 items-center justify-center overflow-hidden rounded-full bg-purple-100 font-bold text-[11px] text-purple-600 dark:bg-purple-900/30 dark:text-purple-300 transition-transform hover:scale-110"
                                    title={`View photo card for ${emp.name || "employee"}`}
                                  >
                                    <span>{initial}</span>
                                    {photoUrl && (
                                      <img
                                        src={photoUrl}
                                        alt={emp.name || "Photo"}
                                        className="absolute inset-0 h-full w-full rounded-full object-cover"
                                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                                      />
                                    )}
                                  </button>

                                  <span
                                    className={`absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 py-0.5 rounded-full text-[9px] font-extrabold leading-none border shadow-md whitespace-nowrap z-10 ${badgeBg}`}
                                  >
                                    {pct}%
                                  </span>
                                </div>
                              </div>
                            </td>
                          );
                        }

                        if (col.field === "empCode") {
                          return (
                            <td key={col.field} className="px-4 py-3 font-mono text-gray-600 dark:text-gray-300 font-semibold whitespace-nowrap">
                              {getFieldValue(emp, col.field) || "—"}
                            </td>
                          );
                        }

                        if (col.field === "name") {
                          return (
                            <td key={col.field} className="px-4 py-3 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                              {getFieldValue(emp, col.field) || "—"}
                            </td>
                          );
                        }

                        if (col.field === "loginRole") {
                          return (
                            <td key={col.field} className="px-4 py-3 text-gray-600 dark:text-gray-300 capitalize whitespace-nowrap">
                              {getFieldValue(emp, col.field)}
                            </td>
                          );
                        }

                        if (col.field === "status") {
                          return (
                            <td key={col.field} className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                  isActive
                                    ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-400"
                                    : "bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-400"
                                }`}
                              >
                                {isActive ? "Active" : "Inactive"}
                              </span>
                            </td>
                          );
                        }

                        return (
                          <td key={col.field} className="px-4 py-3 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                            {getFieldValue(emp, col.field) || "—"}
                          </td>
                        );
                      })}

                      {/* Actions Column */}
                      <td className="px-4 py-3 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => handleRowClick(emp)}
                          title="View Employee Details"
                          className="inline-flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-600 transition hover:bg-blue-100 dark:bg-blue-500/15 dark:text-blue-400 dark:hover:bg-blue-500/25"
                        >
                          <Eye size={13} />
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Fixed Footer with Pagination and Show Entries Dropdown */}
        <div className="shrink-0 px-4 py-1.5 border-t border-gray-100 dark:border-white/10 bg-white dark:bg-slate-900">
          <Pagination
            current={currentPage}
            total={filteredEmployees.length}
            pageSize={perPage}
            onChange={(page) => setCurrentPage(page)}
            onPageSizeChange={(size) => {
              setPerPage(size);
              setCurrentPage(1);
            }}
            pageSizeOptions={[10, 15, 25, 50, 100]}
          />
        </div>
      </div>

      {/* Select Visible Columns Modal */}
      <Modal
        isOpen={showColModal}
        onClose={() => setShowColModal(false)}
        title="Select Visible Columns"
        size="lg"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 p-1">
          {ALL_COLUMNS.map((col) => {
            const isVis = visibleColumns.includes(col.field);
            return (
              <button
                key={col.field}
                type="button"
                onClick={() => toggleColumnVisibility(col.field)}
                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${
                  isVis
                    ? "border-purple-500 bg-purple-50/60 dark:bg-purple-950/30"
                    : "border-gray-200 dark:border-slate-800 hover:border-gray-300 dark:hover:border-slate-700 bg-transparent"
                }`}
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                    isVis
                      ? "border-purple-600 bg-purple-600 text-white dark:border-purple-500 dark:bg-purple-500"
                      : "border-gray-300 bg-white dark:border-slate-700 dark:bg-slate-900"
                  }`}
                >
                  {isVis && <CheckCircle size={14} />}
                </div>
                <span className={`text-xs font-semibold ${
                  isVis
                    ? "text-purple-700 dark:text-purple-300"
                    : "text-gray-700 dark:text-slate-300"
                }`}>
                  {col.label}
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-6 flex justify-end">
          <button
            onClick={() => setShowColModal(false)}
            className="rounded-xl bg-purple-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700"
          >
            Apply & Close
          </button>
        </div>
      </Modal>



      {/* Read-Only Employee Details Modal */}
      {selectedEmployee && (
        <EmployeeDetailsModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedEmployee(null);
          }}
          selected={selectedEmployee}
          viewLoading={false}
          openEdit={null}
          hideEdit={true}
        />
      )}

      {/* Photo Popup Modal */}
      {photoModalRow && (
        <div
          onClick={() => setPhotoModalRow(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative bg-white dark:bg-gray-800 w-full max-w-md flex flex-col rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-gray-100 dark:border-gray-700"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80">
              <h3 className="text-base font-extrabold text-gray-900 dark:text-white flex items-center gap-2">
                <span>Employee Photo</span>
                {isPhotoDeletedOrDummy(photoModalRow) && (
                  <span className="px-2 py-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 rounded-full border border-red-200 dark:border-red-800">
                    Dummy Photo Detected (Locked)
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setPhotoModalRow(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200/60 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-200 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 flex flex-col items-center text-center">
              {/* Photo Display Box */}
              <div className="relative group flex items-center justify-center w-56 h-56 sm:w-64 sm:h-64 rounded-2xl bg-gradient-to-br from-purple-500/10 via-gray-100 to-purple-500/5 dark:from-purple-900/30 dark:via-gray-800 dark:to-gray-900 border-2 border-purple-500/20 shadow-inner overflow-hidden mb-4">
                {modalPhotoUrl && !isPhotoDeletedOrDummy(photoModalRow) ? (
                  <img
                    src={modalPhotoUrl}
                    alt={photoModalRow.name || "Employee"}
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-4">
                    <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center font-black text-3xl mb-2">
                      !
                    </div>
                    <p className="text-xs font-bold text-red-600 dark:text-red-400">
                      {isPhotoDeletedOrDummy(photoModalRow) ? "Dummy Photo Detected / Deleted" : "No Profile Photo"}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-1">Profile locked until photo uploaded</p>
                  </div>
                )}
              </div>

              {isPhotoDeletedOrDummy(photoModalRow) && (
                <div className="w-full mb-4 px-4 py-2.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-xl text-left flex items-start gap-2 text-xs text-red-700 dark:text-red-300 font-medium">
                  <AlertCircle size={16} className="shrink-0 text-red-500 mt-0.5" />
                  <span>
                    <strong>Dummy Photo Detected:</strong> Employee profile is currently locked. The employee will see a prompt to upload their original photo.
                  </span>
                </div>
              )}

              {/* Employee Info Details */}
              <h4 className="text-xl font-black tracking-tight text-gray-900 dark:text-white mb-1">
                {photoModalRow.name || "Unnamed Employee"}
              </h4>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3">
                {photoModalRow.email || "No email"}
              </p>

              {/* Metadata Grid */}
              <div className="w-full grid grid-cols-2 gap-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-left text-xs">
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Emp Code</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{photoModalRow.empCode || photoModalRow.emp_code || "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Department</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{photoModalRow.department || "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Designation</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{photoModalRow.designation || "—"}</span>
                </div>
                <div>
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Company</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    {photoModalRow.companyLabel || photoModalRow.companyId || photoModalRow.company_code || "—"}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 flex flex-wrap gap-2">
              {modalPhotoUrl && !isPhotoDeletedOrDummy(photoModalRow) && (
                <a
                  href={modalPhotoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/40 dark:hover:bg-purple-900/40 text-purple-600 dark:text-purple-300 text-xs font-bold rounded-xl transition-colors"
                >
                  View Full Image
                </a>
              )}
              <button
                type="button"
                onClick={() => setPhotoModalRow(null)}
                className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-bold rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
