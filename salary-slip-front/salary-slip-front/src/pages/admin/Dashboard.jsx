import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  DollarSign,
  ArrowUpRight,
  Plus,
  Building2,
  Clock
} from "lucide-react";
import { StatCard } from "../../components/ui/Card";
import { SkeletonTable } from "../../components/ui/Skeleton";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { salaryApi, rbacApi } from "../../utils/api";
import toast from "react-hot-toast";
import ManageDepartmentsModal from "./AdminModals/ManageDepartmentsModal";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#0ea5e9", "#a855f7"];

const fmt = (n) =>
  n === null || n === undefined ? "—" : "₹" + Number(n).toLocaleString("en-IN");

export default function AdminDashboard() {
  const { user } = useAuth();
  const { companyId, companyScope, scopeKey } = useCompany();
  const [loading, setLoading] = useState(false);

  const [departmentHeadcountData, setDepartmentHeadcountData] = useState([]);
  const [dashboardStats, setDashboardStats] = useState(null);
  const [isManageDeptModalOpen, setIsManageDeptModalOpen] = useState(false);
  const [settings, setSettings] = useState({});

  useEffect(() => {
    let cancelled = false;

    async function fetchData() {
      setLoading(true);
      try {
        const [dashRes, settingsRes] = await Promise.all([
          salaryApi.getAdminDashboard(
            user?.accessToken,
            user?.tokenType,
            companyScope,
          ),
          rbacApi.getSettings(user?.accessToken, user?.tokenType, "main_dashboard").catch(() => ({ status: false }))
        ]);

        if (cancelled) return;

        if (settingsRes.status) {
          const map = {};
          (settingsRes.data || []).forEach((s) => {
            map[s.key] = s.value !== "false";
          });
          setSettings(map);
        }

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
  }, [companyId, companyScope, scopeKey, user]);

  const totalDepartments = departmentHeadcountData.length || 0;

  const isVisible = (key, defaultVal = true) => {
    return settings[key] !== undefined ? settings[key] : defaultVal;
  };

  const todayStr = new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  }).format(new Date());

  let lastMonthSalary = 0;
  let chartData = [];
  if (dashboardStats?.monthly_stats && Array.isArray(dashboardStats.monthly_stats)) {
    // Backend returns descending (newest first). Let's pick the first one for "Last Month".
    if (dashboardStats.monthly_stats.length > 0) {
      lastMonthSalary = Number(dashboardStats.monthly_stats[0].total_net || 0);
    }
    // For chart, reverse it so it goes oldest -> newest
    chartData = [...dashboardStats.monthly_stats].reverse().map(s => ({
      name: `${s.month}/${String(s.year).slice(2)}`,
      salary: Number(s.total_net) || 0
    }));
  } else {
      // Fallback if no monthlyStats
      lastMonthSalary = Number(dashboardStats?.total_salary_paid || 0);
  }

  const deptChartData = departmentHeadcountData.map(d => ({
    name: d.dept,
    value: Number(d.count)
  }));

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

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => (
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
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {isVisible("main_dashboard.show_current_date") && (
          <StatCard
            title="Today's Date"
            value={todayStr}
            icon={<Clock size={22} />}
            color="indigo"
          />
        )}
        {isVisible("main_dashboard.show_employee_count") && (
          <StatCard
            title="Total Employees"
            value={dashboardStats?.total_employee ?? "—"}
            icon={<Users size={22} />}
            color="blue"
          />
        )}
        {isVisible("main_dashboard.show_departments") && (
          <StatCard
            title="Departments"
            value={totalDepartments}
            icon={<Building2 size={22} />}
            color="green"
          />
        )}
        {isVisible("main_dashboard.show_total_salary") && (
          <StatCard
            title="Latest Monthly Salary"
            value={
              lastMonthSalary
                ? fmt(lastMonthSalary)
                : "—"
            }
            icon={<DollarSign size={22} />}
            color="purple"
          />
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Left Column: Charts */}
        <div className="xl:col-span-2 space-y-6">
            
          {/* Salary Trend Chart */}
          {isVisible("main_dashboard.show_salary_trend_chart") && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
                <div className="mb-6">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">Salary Trend</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Total net payable over the last year</p>
                </div>
                <div className="h-72 w-full text-sm">
                {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} dy={10} />
                        <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} tickFormatter={(val) => `₹${(val/1000).toFixed(0)}k`} />
                        <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                        formatter={(value) => [`₹${Number(value).toLocaleString("en-IN")}`, "Total Paid"]}
                        />
                        <Line type="monotone" dataKey="salary" stroke="#6366f1" strokeWidth={3} dot={{r: 4, strokeWidth: 2, fill: '#fff'}} activeDot={{r: 6}} />
                    </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex items-center justify-center h-full text-sm text-gray-500 dark:text-gray-400">No chart data available</div>
                )}
                </div>
            </div>
          )}

          {/* Recent Batches Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Salary Details
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Last three months
                </p>
              </div>
              <Link
                to="/admin/salary/upload"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition shadow-sm"
              >
                Upload <ArrowUpRight size={16} />
              </Link>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700">
              <div className="hidden md:grid grid-cols-[1fr_1fr_1fr_1fr] gap-4 bg-gray-50/80 dark:bg-gray-700/50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <span>Month</span>
                <span>Year</span>
                <span>Total Net</span>
                <span className="text-right">Total Gross</span>
              </div>

              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {(!dashboardStats?.monthly_stats || dashboardStats.monthly_stats.length === 0) && (
                  <p className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                    No salary details found
                  </p>
                )}
                {(dashboardStats?.monthly_stats || []).slice(0, 3).map((stat, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 md:grid-cols-[1fr_1fr_1fr_1fr] gap-3 md:gap-4 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                        {new Date(0, Number(stat.month) - 1).toLocaleString('default', { month: 'long' })}
                      </p>
                    </div>
                    
                    <div className="flex md:items-center">
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {stat.year}
                      </p>
                    </div>

                    <div className="flex md:items-center">
                      <span className="inline-flex w-fit items-center rounded-full bg-emerald-50 dark:bg-emerald-900/25 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-100 dark:border-emerald-800/50">
                        {fmt(stat.total_net)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3">
                      <span className="md:hidden text-xs font-medium text-gray-400">
                        Total Gross
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {fmt(stat.total_gross || stat.total_net)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Widgets */}
        <div className="space-y-6">
            
          {/* Department Headcount Chart */}
          {isVisible("main_dashboard.show_department_chart") && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm">
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Workforce Distribution</h3>
                {deptChartData.length > 0 ? (() => {
                  // Take top 6 by value, group rest as "Others"
                  const sorted = [...deptChartData].sort((a, b) => b.value - a.value);
                  const top6 = sorted.slice(0, 6);
                  const othersTotal = sorted.slice(6).reduce((s, d) => s + d.value, 0);
                  const pieData = othersTotal > 0 ? [...top6, { name: "Others", value: othersTotal }] : top6;
                  const colors = [...PIE_COLORS, "#64748b"];
                  return (
                    <>
                      <div style={{ height: 220, width: "100%" }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={pieData}
                              cx="50%"
                              cy="50%"
                              innerRadius={60}
                              outerRadius={85}
                              paddingAngle={4}
                              dataKey="value"
                            >
                              {pieData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)" }}
                              formatter={(value, name) => [value + " emp", name]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      {/* Custom legend outside chart */}
                      <div className="grid grid-cols-2 gap-1.5 mt-3">
                        {pieData.map((entry, index) => (
                          <div key={entry.name} className="flex items-center gap-2 min-w-0">
                            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colors[index % colors.length] }} />
                            <span className="text-xs text-gray-600 dark:text-gray-400 truncate">{entry.name}</span>
                            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 ml-auto">{entry.value}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })() : (
                    <div className="flex items-center justify-center h-48 text-sm text-gray-500 dark:text-gray-400">No department data</div>
                )}
            </div>
          )}


          {/* Department List */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6 shadow-sm flex flex-col">
            <div className="flex items-start justify-between gap-3 mb-6">
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                  Departments
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  Detailed distribution
                </p>
              </div>
              <button
                onClick={() => setIsManageDeptModalOpen(true)}
                className="p-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors cursor-pointer border border-gray-200 dark:border-gray-600"
                title="Manage Departments"
              >
                <Plus size={18} />
              </button>
            </div>

            <div className="space-y-2 overflow-y-auto max-h-[400px] pr-1 pb-2">
              {departmentHeadcountData.length === 0 && (
                <p className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                  No department data available
                </p>
              )}
              {departmentHeadcountData.map((dept, idx) => (
                <div
                  key={dept?.dept}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 bg-gray-50/50 dark:bg-gray-700/20 hover:bg-indigo-50 dark:hover:bg-indigo-900/15 transition group border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800/50"
                >
                  <span className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-sm font-bold flex items-center justify-center flex-shrink-0">
                    {idx + 1}
                  </span>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 truncate group-hover:text-indigo-700 dark:group-hover:text-indigo-300 transition">
                      {dept?.dept}
                    </p>

                  </div>

                  <span className="text-xs font-bold text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-800 shadow-sm border border-gray-100 dark:border-gray-700 px-2.5 py-1 rounded-full flex-shrink-0">
                    {dept?.count} emp
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ManageDepartmentsModal 
        isOpen={isManageDeptModalOpen} 
        onClose={() => {
          setIsManageDeptModalOpen(false);
          fetchData();
        }} 
      />
    </div>
  );
}
