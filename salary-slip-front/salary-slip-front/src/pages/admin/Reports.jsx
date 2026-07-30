import {
  Download,
  TrendingUp,
} from "lucide-react";
import {
  salaryTrends,
  departmentHeadcount,
  employees,
  salaryRecords,
} from "../../data/mockData";
import Button from "../../components/ui/Button";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
} from "recharts";
import toast from "react-hot-toast";
import { downloadExcel, downloadTablePDF } from "../../utils/exportUtils";

const fmt = (n) => "₹" + (n / 100000).toFixed(1) + "L";

const deptSalary = departmentHeadcount.map((d) => ({
  dept: d.dept,
  avgSalary:
    employees
      .filter((e) => e.department === d.dept)
      .reduce((s, e) => s + e.basicSalary, 0) / (d.count || 1),
  count: d.count,
}));

const attendanceOverview = [
  { name: "Present", value: 82, color: "#22c55e" },
  { name: "Leave", value: 8, color: "#f59e0b" },
  { name: "Half Day", value: 6, color: "#3b82f6" },
  { name: "Absent", value: 4, color: "#ef4444" },
];

export default function Reports() {
  const handleExport = (name) => {
    if (name === "Salary Report") {
      const rows = salaryRecords.map((r) => ({
        "Emp Code": r.empCode,
        Name: r.name,
        Department: r.department,
        "Basic Salary": r.basicSalary,
        Allowances: r.allowances,
        Bonus: r.bonus,
        Deductions: r.deductions,
        "Net Salary": r.netSalary,
        Month: r.month,
        Status: r.status,
      }));
      downloadExcel(rows, "salary-report");
    } else if (name === "Employee Report") {
      const rows = employees.map((e) => ({
        "Emp Code": e.empCode,
        Name: e.name,
        Department: e.department,
        Role: e.role,
        Email: e.email,
        Phone: e.phone,
        "Join Date": e.joinDate,
        Status: e.status,
        "Basic Salary": e.basicSalary,
      }));
      downloadExcel(rows, "employee-report");
    } else if (name === "Attendance Report") {
      downloadTablePDF({
        title: "Attendance Overview Report",
        subtitle: "April 2025",
        columns: ["Status", "Percentage"],
        rows: attendanceOverview.map((a) => [a.name, `${a.value}%`]),
        filename: "attendance-report",
      });
    }
    toast.success(`${name} downloaded successfully`);
  };

  return (
    <div className="space-y-6">
      {/* Export buttons */}
      <div className="flex flex-wrap gap-3">
        {["Salary Report", "Attendance Report", "Employee Report"].map((r) => (
          <Button
            key={r}
            variant="secondary"
            size="sm"
            icon={<Download size={14} />}
            onClick={() => handleExport(r)}
          >
            {r}
          </Button>
        ))}
      </div>

      {/* Salary Trend */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Monthly Salary Trend
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Last 6 months payroll overview
            </p>
          </div>
          <TrendingUp size={20} className="text-brand-600" />
        </div>
        <ResponsiveContainer width="100%" height={250}>
          <AreaChart data={salaryTrends}>
            <defs>
              <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 12, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={fmt}
              tick={{ fontSize: 11, fill: "#94a3b8" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              formatter={(v) => [
                "₹" + v.toLocaleString("en-IN"),
                "Total Salary",
              ]}
              contentStyle={{ borderRadius: "10px", fontSize: 12 }}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#grad1)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Two charts row */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Dept avg salary */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            Avg Salary by Department
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            Average basic salary per department
          </p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={deptSalary}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis
                dataKey="dept"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => "₹" + (v / 1000).toFixed(0) + "K"}
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(v) => [
                  "₹" + v.toLocaleString("en-IN"),
                  "Avg Salary",
                ]}
                contentStyle={{ borderRadius: "10px", fontSize: 12 }}
              />
              <Bar dataKey="avgSalary" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Attendance */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
            Attendance Distribution
          </h3>
          <p className="text-sm text-gray-500 mb-4">April 2025 overview</p>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={attendanceOverview}
                cx="50%"
                cy="50%"
                outerRadius={75}
                dataKey="value"
                labelLine={false}
                label={({
                  cx,
                  cy,
                  midAngle,
                  innerRadius,
                  outerRadius,
                  value,
                }) => {
                  const RADIAN = Math.PI / 180;
                  const r = innerRadius + (outerRadius - innerRadius) * 0.55;
                  const x = cx + r * Math.cos(-midAngle * RADIAN);
                  const y = cy + r * Math.sin(-midAngle * RADIAN);
                  return value > 4 ? (
                    <text
                      x={x}
                      y={y}
                      fill="white"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={11}
                      fontWeight="bold"
                    >
                      {value}%
                    </text>
                  ) : null;
                }}
              >
                {attendanceOverview.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(v, n) => [`${v}%`, n]}
                contentStyle={{ borderRadius: "10px", fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
          {/* Custom legend below chart */}
          <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-3">
            {attendanceOverview.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1.5">
                <span
                  className="w-3 h-3 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {entry.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="font-semibold text-gray-900 dark:text-white">
            Department Summary
          </h3>
        </div>
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
              {["Department", "Headcount", "Avg Salary", "Total Payroll"].map(
                (h) => (
                  <th
                    key={h}
                    className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {deptSalary.map((d) => (
              <tr
                key={d.dept}
                className="hover:bg-gray-50 dark:hover:bg-gray-750 transition"
              >
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                  {d.dept}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                  {d.count}
                </td>
                <td className="px-5 py-3.5 text-sm text-gray-600 dark:text-gray-300">
                  ₹{Math.round(d.avgSalary).toLocaleString("en-IN")}
                </td>
                <td className="px-5 py-3.5 text-sm font-medium text-gray-900 dark:text-white">
                  ₹{Math.round(d.avgSalary * d.count).toLocaleString("en-IN")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
