import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  DollarSign,
  ArrowUpRight,
  Plus,
  Calendar,
} from "lucide-react";
import { StatCard } from "../../components/ui/Card";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig } from "../../config/companyConfig";
import { salaryApi } from "../../utils/api";
import toast from "react-hot-toast";
import ManageDepartmentsModal from "./AdminModals/ManageDepartmentsModal";
import { MonthYearPicker } from "../../components/ui/MonthYearPicker";

const fmt = (n) =>
  n === null || n === undefined ? "—" : "₹" + Number(n).toLocaleString("en-IN");

function toMonthYear(value) {
  if (!/^\d{4}-\d{2}$/.test(value || "")) {
    return "";
  }

  const [year, month] = value.split("-");
  return `${month}/${year}`;
}

function buildDashboardDateFilter(fromMonth, toMonth) {
  if (!fromMonth || !toMonth) return {};
  const from = toMonthYear(fromMonth);
  const to = toMonthYear(toMonth);
  if (!from || !to) return {};
  return { month: `${from}to${to}` };
}

export default function AdminDashboard() {
  const { user } = useAuth();
  const { companyId, companyScope, scopeKey, scopeLabel } = useCompany();
  const [loading, setLoading] = useState(false);

  const [employeesData, setEmployeesData] = useState([]);
  const [departmentHeadcountData, setDepartmentHeadcountData] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [fromMonth, setFromMonth] = useState("");
  const [toMonth, setToMonth] = useState("");
  const [isManageDeptModalOpen, setIsManageDeptModalOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      if (fromMonth && toMonth && fromMonth > toMonth) {
        return;
      }

      setLoading(true);
      try {
        const dashboardDateFilter = buildDashboardDateFilter(
          fromMonth,
          toMonth,
        );

        const dashRes = await salaryApi.getAdminDashboard(
          user?.accessToken,
          user?.tokenType,
          companyScope,
          dashboardDateFilter,
        );

        if (cancelled) return;

        // Process Dashboard Stats
        const dashData = dashRes?.data || {};
        setDashboardStats(dashData);
        const rawDepts =
          dashData.department_distribution || dashData.department || [];
        setDepartmentHeadcountData(
          rawDepts
            .filter((d) => (typeof d === "string" ? d : d.department))
            .map((d) =>
              typeof d === "string"
                ? { dept: d, count: 0, salary: 0 }
                : {
                    dept: d.department,
                    count: d.total_employees,
                    salary: d.total_net_payable,
                  },
            ),
        );

        // Process Recent Slips for the table
        const slips = (dashData.salary_slip || []).filter(item => item.emp_name);

        const mappedEmps = slips.map((item) => {
          const name = item.emp_name || "—";
          const avatar = name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2);
          return {
            id: item.id,
            name,
            role: item.designation || "—",
            department: item.department || "—",
            status: "Active",
            avatar,
            unit: item.unit || "-",
            companyLabel:
              getCompanyConfig(item.company_code || companyId)?.label || "-",
            net_payable: Number(item.net_payable ?? 0),
          };
        });

        setEmployeesData(mappedEmps);
      } catch (err) {
        if (!cancelled)
          toast.error(err.message || "Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (user?.accessToken) fetchData();
    return () => {
      cancelled = true;
    };
  }, [companyId, companyScope, fromMonth, scopeKey, toMonth, user]);

  const recentEmployees = employeesData.slice(0, 5);
  const totalDepartments = departmentHeadcountData.length || 0;
  const hasDateFilter = Boolean(fromMonth || toMonth);
  const invalidDateRange = Boolean(fromMonth && toMonth && fromMonth > toMonth);

  if (loading)
    return (
      <div className="space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <div className="skeleton h-6 w-32 rounded" />
            <div className="skeleton h-4 w-72 max-w-full rounded" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="skeleton h-12 w-[420px] max-w-full rounded-xl" />
            <div className="skeleton h-11 w-44 rounded-lg" />
            <div className="skeleton h-11 w-44 rounded-lg" />
            <div className="skeleton h-11 w-32 rounded-lg" />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, index) => (
            <div
              key={index}
              className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="skeleton h-3.5 w-28 rounded" />
                  <div className="skeleton h-7 w-36 rounded" />
                </div>
                <div className="skeleton h-11 w-11 rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-40 rounded" />
              </div>
              <div className="skeleton h-11 w-11 rounded-xl" />
            </div>
            <div className="skeleton mb-4 h-14 w-full rounded-xl" />
            <div className="space-y-2">
              {[...Array(5)].map((_, index) => (
                <div key={index} className="skeleton h-12 w-full rounded-lg" />
              ))}
            </div>
          </div>

          <div className="xl:col-span-2 rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="skeleton h-4 w-40 rounded" />
                <div className="skeleton h-3 w-56 rounded" />
              </div>
              <div className="skeleton h-9 w-24 rounded-lg" />
            </div>
            <SkeletonTable rows={5} />
          </div>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Overview of payroll &amp; workforce for {scopeLabel}
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-2 shadow-sm sm:flex-row sm:flex-wrap sm:items-center dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 px-1 text-sm font-semibold text-gray-600 dark:text-gray-300">
            <Calendar size={16} className="text-brand-600" />
            Date Range
          </div>
          <label className="sr-only" htmlFor="dashboard-from-month">
            From month
          </label>
          <MonthYearPicker
            value={fromMonth}
            onChange={setFromMonth}
            max={toMonth}
            placeholder="From month"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 sm:min-w-44 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            to
          </span>
          <label className="sr-only" htmlFor="dashboard-to-month">
            To month
          </label>
          <MonthYearPicker
            value={toMonth}
            onChange={setToMonth}
            min={fromMonth}
            placeholder="To month"
            className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 sm:min-w-44 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
          />
          {hasDateFilter && (
            <button
              type="button"
              onClick={() => {
                setFromMonth("");
                setToMonth("");
              }}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {invalidDateRange && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
          Select a valid date range. The start month must be before the end
          month.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        <StatCard
          title="Total Employees"
          value={dashboardStats?.total_employee ?? "—"}
          icon={<Users size={22} />}
          color="blue"
          // change={5}
          // subtitle="vs last month"
        />
        <StatCard
          title="Active Employees"
          value={dashboardStats?.active_employee ?? "—"}
          icon={<Users size={22} />}
          color="green"
          // subtitle="currently active"
        />
        <StatCard
          title="Total Salary Paid"
          value={
            dashboardStats?.total_salary_paid != null
              ? fmt(dashboardStats.total_salary_paid)
              : "—"
          }
          icon={<DollarSign size={22} />}
          color="purple"
          // change={3.2}
          // subtitle="April 2025"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex flex-col">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                By Department
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Workforce distribution
              </p>
            </div>
            <button
              onClick={() => setIsManageDeptModalOpen(true)}
              className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/25 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors cursor-pointer"
              title="Manage Departments"
            >
              <Plus size={19} />
            </button>
          </div>

          <div className="flex items-center justify-between rounded-xl bg-indigo-50 dark:bg-indigo-900/20 px-4 py-3 mb-4">
            <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
              Total Departments
            </span>
            <span className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
              {totalDepartments}
            </span>
          </div>

          <div className="space-y-2 overflow-y-auto max-h-72 pr-1 pb-2">
            {departmentHeadcountData.length === 0 && (
              <p className="text-center py-6 text-sm text-gray-400">
                No department data available
              </p>
            )}
            {departmentHeadcountData.map((dept, idx) => (
              <div
                key={dept?.dept}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 bg-gray-50 dark:bg-gray-700/40 hover:bg-indigo-50 dark:hover:bg-indigo-900/15 transition group"
              >
                <span className="w-6 h-6 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 text-xs font-bold flex items-center justify-center flex-shrink-0">
                  {idx + 1}
                </span>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition">
                    {dept?.dept}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {fmt(dept?.salary)}
                  </p>
                </div>

                <span className="text-xs font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/40 px-2 py-0.5 rounded-full flex-shrink-0">
                  {dept?.count} emp
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Recent Employees
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Latest employee records added to payroll
              </p>
            </div>
            <Link
              to="/admin/salary"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
            >
              View all <ArrowUpRight size={14} />
            </Link>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700">
            <div className="hidden md:grid grid-cols-[1.5fr_1fr_0.8fr_0.9fr] gap-4 bg-gray-50 dark:bg-gray-700/50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              <span>Employee</span>
              <span>Department</span>
              <span>Status</span>
              <span className="text-right">Net Salary</span>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {recentEmployees.length === 0 && (
                <p className="text-center py-8 text-sm text-gray-400">
                  No records found
                </p>
              )}
              {recentEmployees.map((emp) => {
                const netSalary = emp.net_payable;

                return (
                  <div
                    key={emp.id}
                    className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr_0.8fr_0.9fr] gap-3 md:gap-4 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700/40 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-brand-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {emp.avatar}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                          {emp.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {emp.role} · {emp.companyLabel} · {emp.unit}
                        </p>
                      </div>
                    </div>

                    <div className="flex md:items-center">
                      <span className="inline-flex w-fit items-center rounded-full bg-indigo-50 dark:bg-indigo-900/25 px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                        {emp.department || "—"}
                      </span>
                    </div>

                    <div className="flex md:items-center">
                      <span
                        className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          emp.status === "Active"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400"
                        }`}
                      >
                        {emp.status}
                      </span>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3">
                      <span className="md:hidden text-xs font-medium text-gray-400">
                        Net Salary
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {fmt(netSalary)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <ManageDepartmentsModal 
        isOpen={isManageDeptModalOpen} 
        onClose={() => setIsManageDeptModalOpen(false)} 
      />
    </div>
  );
}
