import { useState, useEffect } from "react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { salaryApi } from "../../utils/api";
import { StatCard } from "../../components/ui/Card";
import { SkeletonCard } from "../../components/ui/Skeleton";
import {
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  Minus,
  BookOpen,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

const monthName = (m) => MONTH_NAMES[(parseInt(m) || 1) - 1];

const fmt = (n) =>
  n === null || n === undefined ? "—" : "₹" + Number(n).toLocaleString("en-IN");

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const { company, companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [dashData, setDashData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      setLoading(true);
      try {
        const res = await salaryApi.getEmployeeDashboard(
          user?.accessToken,
          user?.tokenType,
          companyId,
        );
        if (!cancelled) setDashData(res?.data ?? res ?? {});
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Failed to load dashboard");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (user?.accessToken) fetchData();
    return () => {
      cancelled = true;
    };
  }, [companyId, user]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  // ── Top-level fields from API ─────────────────────────────────────
  const backendUser = dashData?.user || user;
  const slipList = dashData?.recent_slips || dashData?.salary_list || [];
  const latestSlip = slipList[0] || {};

  const empName = latestSlip.emp_name || backendUser?.name || "—";
  const empCode = latestSlip.emp_code || backendUser?.emp_code || user?.empCode || "—";
  const mainDept = latestSlip.main_department || backendUser?.main_department || "—";
  const department = latestSlip.department || backendUser?.department || "—";
  
  // Try to use latest slip values, fallback to 0
  const netSalary = Number(latestSlip.net_payable ?? latestSlip.net_salary ?? 0);
  const unit = backendUser?.unit || latestSlip.unit || "—";
  const totalDeduct = Number(latestSlip.total_deduct ?? latestSlip.total_deduction ?? 0);
  const bookSalary = Number(latestSlip.gross_salary ?? latestSlip.a_gross ?? latestSlip.book_salary ?? latestSlip.salary ?? 0);

  // ── salary_list — deduplicate by month+year (keep first = newest) ─
  const salaryMap = new Map();
  slipList.forEach((s) => {
    const key = `${s.year}-${s.month}`;
    if (!salaryMap.has(key)) salaryMap.set(key, s);
  });

  const designation = latestSlip.designation || backendUser?.designation || "—";

  // Chart: reverse so oldest month is on the left
  const chartData = [...salaryMap.values()].reverse().map((s) => ({
    month: `${monthName(s.month)} '${String(s.year).slice(2)}`,
    salary: s.net_payable,
  }));

  // Recent slips: newest first, max 3
  const recentSlips = [...salaryMap.values()].slice(0, 3);

  if (loading)
    return (
      <div className="space-y-6">
        <div className="skeleton h-36 w-full rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="space-y-1.5">
                <div className="skeleton h-4 w-32 rounded" />
                <div className="skeleton h-3 w-20 rounded" />
              </div>
              <div className="skeleton w-5 h-5 rounded" />
            </div>
            <div className="skeleton h-48 w-full rounded-lg" />
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="skeleton h-4 w-28 rounded" />
              <div className="skeleton h-8 w-20 rounded-lg" />
            </div>
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      {/* Hero Banner */}
      <div className="bg-gradient-to-r from-brand-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
        <p className="text-brand-100 text-sm font-medium">{greeting} 👋</p>
        <h2 className="text-2xl font-bold mt-1">{empName}</h2>
        <p className="text-brand-200 text-sm mt-1">
          {[
            designation !== "—" ? designation : null,
            [mainDept, department].filter(d => d && d !== "—").join(" › ") || null,
            empCode !== "—" ? `Emp. Code: #${empCode}` : null
          ].filter(Boolean).join(" · ") || "—"}
        </p>
        <p className="text-brand-100 text-xs mt-1">Unit: {unit}</p>
        <p className="text-brand-100 text-xs mt-2 uppercase tracking-[0.22em]">
          {company?.label}
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-xs text-brand-200">Total Salary</p>
            <p className="font-bold text-lg">{fmt(bookSalary)}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-xs text-brand-200">Net Salary</p>
            <p className="font-bold text-lg">{fmt(netSalary)}</p>
          </div>
          <div className="bg-white/10 rounded-xl px-4 py-2">
            <p className="text-xs text-brand-200">Deductions</p>
            <p className="font-bold text-lg">{fmt(totalDeduct)}</p>
          </div>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Salary"
          value={fmt(bookSalary)}
          icon={<BookOpen size={22} />}
          color="green"
          subtitle="Total salary"
        />
        <StatCard
          title="Net Salary"
          value={fmt(netSalary)}
          icon={<DollarSign size={22} />}
          color="blue"
          subtitle="Total net payable"
        />
        <StatCard
          title="Total Deductions"
          value={fmt(totalDeduct)}
          icon={<Minus size={22} />}
          color="red"
          subtitle="PT + PF + ESI + others"
        />
      </div>

      {/* Chart + Recent Slips */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Salary History Chart */}
        <div className="xl:col-span-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Salary History
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Net payable per month
              </p>
            </div>
            <TrendingUp size={18} className="text-brand-600" />
          </div>
          {chartData.length > 0 ? (
            <div className="max-h-64 overflow-y-auto pr-2 space-y-3">
              {[...chartData].reverse().map((data, idx) => (
                <div key={idx} className="flex items-center justify-between p-3.5 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-brand-600 flex items-center justify-center font-bold text-sm tracking-wide">
                      {data.month.split(" ")[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">
                        {data.month}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Net Payable Salary
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900 dark:text-white text-base">
                      {fmt(data.salary)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-sm text-gray-500 dark:text-gray-400">
              No salary history available
            </div>
          )}
        </div>

        {/* Recent Payslips */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Recent Payslips
            </h3>
            <Link
              to="/employee/payslips"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition"
            >
              View All <ArrowUpRight size={12} />
            </Link>
          </div>

          <div className="space-y-3">
            {recentSlips.length === 0 && (
              <p className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
                No payslips available
              </p>
            )}
            {recentSlips.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/60 rounded-xl"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {monthName(s.month)} {s.year}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5 truncate">
                    {s.designation || backendUser?.designation || "—"} &middot; {s.paid_day ?? s.paid_days ?? 26} days paid
                  </p>
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400 mt-0.5">
                    {fmt(s.net_payable)}
                  </p>
                </div>
                <Badge variant="green">Paid</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
