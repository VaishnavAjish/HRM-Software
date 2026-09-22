import { Users, UserCheck, UserX, Percent, Clock, LogOut, AlertCircle, Palmtree, TrendingUp } from "lucide-react";

/**
 * Attendance Engine Rebuild -- spec S28/S51: primary + secondary KPI rows,
 * each card clickable to filter the table (onFilter). Attendance % here
 * uses an EXPLICIT denominator (applicable = total - weekly_off - holiday,
 * spec S12) shown in the card's subtitle rather than silently dividing by
 * total headcount.
 */
export default function AttendanceKpiGrid({ totals, onFilter, activeStatus }) {
  const t = totals || {};
  const applicable = Math.max(0, (t.total || 0) - (t.weekly_off || 0) - (t.holiday || 0) - (t.on_leave || 0));
  const presentLike = (t.present || 0) + (t.half_day || 0) + (t.holiday_worked || 0);
  const pct = applicable > 0 ? Math.round((presentLike / applicable) * 100) : 0;

  const primary = [
    { key: null, label: "Total Employees", value: t.total ?? 0, icon: Users, color: "blue" },
    { key: "PRESENT", label: "Present", value: presentLike, icon: UserCheck, color: "emerald" },
    { key: "ABSENT", label: "Absent", value: t.absent ?? 0, icon: UserX, color: "red" },
    { key: null, label: "Attendance %", value: `${pct}%`, sub: `${presentLike}/${applicable} applicable`, icon: Percent, color: "teal" },
  ];
  const secondary = [
    { key: "late", label: "Late", value: t.late ?? 0, icon: Clock, color: "amber" },
    { key: "early", label: "Early Exit", value: t.early_exit ?? 0, icon: LogOut, color: "orange" },
    { key: "HALF_DAY", label: "Half Day", value: t.half_day ?? 0, icon: AlertCircle, color: "purple" },
    { key: "ON_LEAVE", label: "Leave", value: t.on_leave ?? 0, icon: Palmtree, color: "sky" },
    { key: "MISSING_CHECKOUT", label: "Missing Punch", value: t.missing_punch ?? 0, icon: AlertCircle, color: "rose" },
    { key: "overtime", label: "Overtime", value: t.overtime ?? 0, icon: TrendingUp, color: "indigo" },
  ];

  const colorMap = {
    blue: "border-l-blue-500 bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400",
    emerald: "border-l-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400",
    red: "border-l-red-500 bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400",
    teal: "border-l-teal-500 bg-teal-50 dark:bg-teal-950/50 text-teal-600 dark:text-teal-400",
    amber: "border-l-amber-500 bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400",
    orange: "border-l-orange-500 bg-orange-50 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400",
    purple: "border-l-purple-500 bg-purple-50 dark:bg-purple-950/50 text-purple-600 dark:text-purple-400",
    sky: "border-l-sky-500 bg-sky-50 dark:bg-sky-950/50 text-sky-600 dark:text-sky-400",
    rose: "border-l-rose-500 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400",
    indigo: "border-l-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400",
  };

  function Card({ card }) {
    const active = card.key && activeStatus === card.key;
    return (
      <button
        type="button"
        onClick={() => card.key && onFilter && onFilter(card.key)}
        className={`text-left flex flex-col justify-between rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 p-3 shadow-xs border-l-4 transition-all ${colorMap[card.color]} ${card.key ? "hover:shadow-md hover:-translate-y-0.5 cursor-pointer" : "cursor-default"} ${active ? "ring-2 ring-brand-500" : ""}`}
      >
        <div className="flex items-center justify-between gap-1 mb-1">
          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 truncate">{card.label}</span>
          <card.icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-lg font-extrabold text-gray-900 dark:text-white tracking-tight">{card.value}</span>
        {card.sub && <span className="text-[10px] text-gray-400 mt-0.5">{card.sub}</span>}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {primary.map((c) => <Card key={c.label} card={c} />)}
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
        {secondary.map((c) => <Card key={c.label} card={c} />)}
      </div>
    </div>
  );
}
