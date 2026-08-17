import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import Card from "../../../components/ui/Card";

const DONUT_COLORS = ["#4f46e5", "#0ea5e9", "#22c55e", "#f59e0b", "#94a3b8", "#ec4899", "#8b5cf6"];

function StatusBar({ label, value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
        <span>{label}</span>
        <span className="font-semibold text-gray-900 dark:text-white">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-gray-100 dark:bg-gray-700">
        <div className="h-1.5 rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
    </div>
  );
}

export default function InsightsPanel({ chart, summary, activity, loading, onViewAllActivity }) {
  const donutData = useMemo(() => {
    const departments = (chart?.nodes || []).filter((n) => n.type === "department" && (n.employeeCount || 0) > 0);
    const sorted = [...departments].sort((a, b) => (b.employeeCount || 0) - (a.employeeCount || 0));
    const top = sorted.slice(0, 5);
    const rest = sorted.slice(5);
    const restTotal = rest.reduce((sum, n) => sum + (n.employeeCount || 0), 0);
    const rows = top.map((n) => ({ name: n.name, value: n.employeeCount || 0 }));
    if (restTotal > 0) rows.push({ name: "Others", value: restTotal });
    return rows;
  }, [chart]);

  // Real employee count comes from department assignments (donutData), not
  // summary.filledHeadcount — that field is position-based and legitimately
  // stays at 0 until real positions/headcount targets exist.
  const total = donutData.reduce((sum, r) => sum + r.value, 0);

  return (
    <div className="space-y-4">
      <Card padding={false} className="p-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Organization Insights</h3>

        <div className="mt-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Headcount by Department
          </p>
          {donutData.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">No headcount data yet.</p>
          ) : (
            <div className="relative">
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={72} paddingAngle={2}>
                    {donutData.map((entry, i) => (
                      <Cell key={entry.name} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, name]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-bold text-gray-900 dark:text-white">{total}</span>
                <span className="text-[10px] uppercase tracking-wide text-gray-400">Total</span>
              </div>
            </div>
          )}
          <ul className="mt-2 space-y-1">
            {donutData.map((row, i) => (
              <li key={row.name} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-300">
                <span className="flex items-center gap-1.5 truncate">
                  <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                  <span className="truncate">{row.name}</span>
                </span>
                <span>{row.value} ({total > 0 ? Math.round((row.value / total) * 100) : 0}%)</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      {summary && (
        <Card padding={false} className="space-y-3 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Position Status</p>
          <StatusBar label="Filled" value={summary.filledHeadcount ?? 0} max={summary.approvedHeadcount || 1} color="#22c55e" />
          <StatusBar label="Vacant" value={summary.vacantHeadcount ?? 0} max={summary.approvedHeadcount || 1} color="#f59e0b" />
          <StatusBar label="Frozen" value={summary.frozenCount ?? 0} max={summary.approvedHeadcount || 1} color="#0ea5e9" />
          <StatusBar label="Approved" value={summary.approvedHeadcount ?? 0} max={summary.approvedHeadcount || 1} color="#4f46e5" />
        </Card>
      )}

      <Card padding={false} className="p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">Recent Changes</p>
          {onViewAllActivity && (
            <button type="button" onClick={onViewAllActivity} className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400">
              View All
            </button>
          )}
        </div>
        <ul className="mt-2 space-y-3">
          {loading && <li className="text-xs text-gray-400">Loading…</li>}
          {!loading && activity.length === 0 && <li className="text-xs text-gray-400">No recent changes.</li>}
          {activity.map((item) => (
            <li key={item.id} className="text-xs">
              <p className="text-gray-800 dark:text-gray-200">{item.description}</p>
              <p className="mt-0.5 text-gray-400">
                {item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}
                {item.actorName ? ` · by ${item.actorName}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
