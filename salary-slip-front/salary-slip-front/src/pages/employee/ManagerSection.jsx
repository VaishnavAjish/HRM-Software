import { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  RefreshCw,
  Users,
  Building2,
  Building,
  User,
  Filter,
  Eye,
  RotateCcw,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { salaryApi } from "../../utils/api";
import EmployeeDetailsModal from "../admin/AdminModals/EmployeeDetailsModal";
import toast from "react-hot-toast";

export default function ManagerSection() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

  // Filters state
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedDept, setSelectedDept] = useState("all");
  const [selectedCompany, setSelectedCompany] = useState("all");
  const [selectedUnit, setSelectedUnit] = useState("all");
  const [selectedGender, setSelectedGender] = useState("all");

  // Modal state
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [viewLoading, setViewLoading] = useState(false);

  const fetchTeam = useCallback(async () => {
    if (!user?.accessToken) return;
    setLoading(true);
    try {
      const filters = {
        search: searchTerm,
        status: statusFilter,
        department: selectedDept !== "all" ? selectedDept : "",
        company: selectedCompany !== "all" ? selectedCompany : "",
        unit: selectedUnit !== "all" ? selectedUnit : "",
        gender: selectedGender !== "all" ? selectedGender : "",
      };

      const res = await salaryApi.getManagerTeam(
        user.accessToken,
        user.tokenType || "Bearer",
        filters
      );

      if (res?.status || res?.success) {
        const teamData = Array.isArray(res?.data)
          ? res.data
          : (Array.isArray(res?.data?.data) ? res.data.data : []);
        setEmployees(teamData);
        setStats({
          total: res.total ?? res.meta?.total ?? teamData.length,
          active: res.active_count ?? teamData.filter(e => (e.status === 0 || e.status === "0" || e.statusLabel === "Active" || e.status === "Active")).length,
          inactive: res.inactive_count ?? teamData.filter(e => (e.status === 1 || e.status === "1" || e.statusLabel === "Inactive" || e.status === "Inactive")).length,
        });
      } else {
        toast.error(res?.message || "Failed to load team employees.");
      }
    } catch (err) {
      console.error("Error loading manager team:", err);
      toast.error("Failed to load team data.");
    } finally {
      setLoading(false);
    }
  }, [
    user?.accessToken,
    user?.tokenType,
    searchTerm,
    statusFilter,
    selectedDept,
    selectedCompany,
    selectedUnit,
    selectedGender,
  ]);

  useEffect(() => {
    fetchTeam();
  }, [fetchTeam]);

  // Extract unique filter dropdown options from loaded employees
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
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      {/* Header Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Users className="h-7 w-7 text-purple-600 dark:text-purple-400" />
            Manager Section
          </h1>
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
            View team employees reporting under your management
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchTeam}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200 dark:hover:bg-slate-800"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter and Stats Controls */}
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-slate-900 space-y-4">
        {/* Top filter row: Search & Status tabs & Counter */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          {/* Search bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search employee..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 pl-10 pr-4 py-2 text-sm text-gray-900 outline-none transition focus:border-purple-500 focus:bg-white dark:border-white/10 dark:bg-slate-950 dark:text-white dark:focus:border-purple-400"
            />
          </div>

          {/* Status Tabs */}
          <div className="flex items-center gap-1 rounded-xl bg-gray-100 p-1 dark:bg-slate-800/80">
            {["all", "active", "inactive"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`rounded-lg px-4 py-1.5 text-xs font-semibold capitalize transition ${
                  statusFilter === st
                    ? "bg-white text-purple-700 shadow dark:bg-purple-600 dark:text-white"
                    : "text-gray-600 hover:text-gray-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Employee Count Indicator */}
          <div className="text-xs font-medium text-gray-500 dark:text-slate-400">
            <span className="font-bold text-gray-900 dark:text-white">{stats.total}</span> total employees{" "}
            <span className="font-bold text-green-600 dark:text-green-400">{stats.active} active</span>{" "}
            <span className="font-bold text-gray-400 dark:text-slate-500">{stats.inactive} inactive</span>
          </div>
        </div>

        {/* Dropdown Filters row */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-5">
          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={(e) => setSelectedDept(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none transition focus:border-purple-500 dark:border-white/10 dark:bg-slate-950 dark:text-gray-300"
          >
            <option value="all">All Departments</option>
            {departmentOptions.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          {/* Company Filter */}
          <select
            value={selectedCompany}
            onChange={(e) => setSelectedCompany(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none transition focus:border-purple-500 dark:border-white/10 dark:bg-slate-950 dark:text-gray-300"
          >
            <option value="all">All Companies</option>
            {companyOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Unit Filter */}
          <select
            value={selectedUnit}
            onChange={(e) => setSelectedUnit(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none transition focus:border-purple-500 dark:border-white/10 dark:bg-slate-950 dark:text-gray-300"
          >
            <option value="all">All Units</option>
            {unitOptions.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>

          {/* Gender Filter */}
          <select
            value={selectedGender}
            onChange={(e) => setSelectedGender(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700 outline-none transition focus:border-purple-500 dark:border-white/10 dark:bg-slate-950 dark:text-gray-300"
          >
            <option value="all">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
          </select>

          {/* Reset Filters button */}
          <button
            onClick={handleResetFilters}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600 transition hover:bg-gray-100 dark:border-white/10 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:bg-slate-950 dark:text-slate-400 border-b border-gray-200 dark:border-white/10">
              <tr>
                <th className="px-4 py-3.5">EMP CODE</th>
                <th className="px-4 py-3.5">NAME</th>
                <th className="px-4 py-3.5">GENDER</th>
                <th className="px-4 py-3.5">DEPARTMENT</th>
                <th className="px-4 py-3.5">DESIGNATION</th>
                <th className="px-4 py-3.5">COMPANY</th>
                <th className="px-4 py-3.5">UNIT</th>
                <th className="px-4 py-3.5">ROLE</th>
                <th className="px-4 py-3.5">STATUS</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-white/5">
              {loading ? (
                Array.from({ length: 5 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse">
                    <td className="px-4 py-4"><div className="h-4 w-16 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-32 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-12 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-24 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-16 bg-gray-200 rounded dark:bg-slate-800" /></td>
                    <td className="px-4 py-4"><div className="h-4 w-14 bg-gray-200 rounded dark:bg-slate-800" /></td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400 dark:text-slate-500">
                    <Users className="mx-auto h-8 w-8 text-gray-300 dark:text-slate-600 mb-2" />
                    No employees found under your management.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => {
                  const isActive = emp.status === 0 || emp.status === "0" || emp.statusLabel === "Active" || emp.status === "Active";

                  return (
                    <tr
                      key={emp.id || emp.empCode}
                      onClick={() => handleRowClick(emp)}
                      className="cursor-pointer transition hover:bg-purple-50/50 dark:hover:bg-purple-950/20"
                    >
                      <td className="px-4 py-3.5 font-mono text-gray-600 dark:text-gray-300 font-semibold">
                        {emp.empCode || emp.emp_code || "—"}
                      </td>

                      <td className="px-4 py-3.5 font-medium text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <span>{emp.name || emp.displayName || "—"}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {emp.gender || "—"}
                      </td>

                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {emp.department || "—"}
                      </td>

                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {emp.designation || "—"}
                      </td>

                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {emp.companyLabel || emp.company_code || emp.company || "—"}
                      </td>

                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300">
                        {emp.unit || "—"}
                      </td>

                      <td className="px-4 py-3.5 text-gray-600 dark:text-gray-300 capitalize">
                        {emp.loginRole === "superadmin" ? "Super Admin" : "Employee"}
                      </td>

                      <td className="px-4 py-3.5">
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
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Read-Only Employee Details Modal */}
      {selectedEmployee && (
        <EmployeeDetailsModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedEmployee(null);
          }}
          selected={selectedEmployee}
          viewLoading={viewLoading}
          openEdit={null}
          hideEdit={true}
        />
      )}
    </div>
  );
}
