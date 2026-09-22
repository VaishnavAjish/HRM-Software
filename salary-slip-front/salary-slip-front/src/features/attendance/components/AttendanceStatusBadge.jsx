import { CheckCircle2, XCircle, Clock, AlertCircle, Palmtree, CalendarOff, CalendarCheck, HelpCircle } from "lucide-react";

// Attendance Engine Rebuild -- mirrors AttendanceDaily::STATUS_* on the backend.
export const STATUS_CONFIG = {
  PRESENT: { label: "Present", icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700" },
  HALF_DAY: { label: "Half Day", icon: AlertCircle, cls: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-300 dark:border-purple-700" },
  ABSENT: { label: "Absent", icon: XCircle, cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-700" },
  MISSING_CHECKOUT: { label: "Missing Checkout", icon: AlertCircle, cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300 dark:border-orange-700" },
  MISSING_CHECKIN: { label: "Missing Check-in", icon: AlertCircle, cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-300 dark:border-orange-700" },
  WEEKLY_OFF: { label: "Weekly Off", icon: CalendarOff, cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-300 dark:border-slate-700" },
  HOLIDAY: { label: "Holiday", icon: CalendarCheck, cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border-sky-300 dark:border-sky-700" },
  HOLIDAY_WORKED: { label: "Holiday Worked", icon: CalendarCheck, cls: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border-sky-300 dark:border-sky-700" },
  ON_LEAVE: { label: "On Leave", icon: Palmtree, cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-300 dark:border-blue-700" },
  PENDING_REVIEW: { label: "Pending Review", icon: HelpCircle, cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-300 dark:border-amber-700" },
  NO_PUNCH: { label: "No Punch", icon: Clock, cls: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-300 dark:border-slate-700" },
  INVALID: { label: "Invalid", icon: XCircle, cls: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-300 dark:border-red-700" },
};

export default function AttendanceStatusBadge({ status, size = "sm" }) {
  const conf = STATUS_CONFIG[status] || { label: status || "Unknown", icon: HelpCircle, cls: "bg-slate-100 text-slate-600 border-slate-300" };
  const Icon = conf.icon;
  const pad = size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${pad} ${conf.cls}`}>
      <Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {conf.label}
    </span>
  );
}

export function AttendanceFlagChips({ record }) {
  if (!record) return null;
  const chips = [];
  if (record.is_late) chips.push(["Late" + (record.late_minutes ? ` +${record.late_minutes}m` : ""), "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800"]);
  if (record.is_early_exit) chips.push(["Early" + (record.early_exit_minutes ? ` -${record.early_exit_minutes}m` : ""), "text-orange-700 bg-orange-50 border-orange-200 dark:text-orange-300 dark:bg-orange-950/40 dark:border-orange-800"]);
  if (record.is_overtime) chips.push(["OT" + (record.overtime_minutes ? ` +${record.overtime_minutes}m` : ""), "text-indigo-700 bg-indigo-50 border-indigo-200 dark:text-indigo-300 dark:bg-indigo-950/40 dark:border-indigo-800"]);
  if (record.is_regularized) chips.push(["Regularized", "text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-300 dark:bg-teal-950/40 dark:border-teal-800"]);
  if (record.attendance_during_leave) chips.push(["Attendance During Leave", "text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40 dark:border-red-800"]);

  if (!chips.length) return null;

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map(([label, cls]) => (
        <span key={label} className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>
          {label}
        </span>
      ))}
    </div>
  );
}
