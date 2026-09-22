const FIELD_LABELS = {
  grace_in_minutes: "Grace In",
  grace_out_minutes: "Grace Out",
  half_day_threshold_minutes: "Half-Day Threshold",
  full_day_minutes: "Full-Day Minutes",
  minimum_work_minutes: "Minimum Work",
  overtime_enabled: "Overtime Enabled",
  overtime_after_minutes: "Overtime After",
  break_policy: "Break Policy",
  weekly_off_days: "Weekly Off Days",
  biometric_required: "Biometric Required",
};

const SCOPE_COLORS = {
  employee: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  department: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  branch: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  company: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  global: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  default: "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatValue(field, value) {
  if (value === null || value === undefined) return "—";
  if (field === "weekly_off_days" && Array.isArray(value)) return value.map((d) => DAY_NAMES[d]).join(", ") || "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/**
 * Attendance Engine Rebuild -- spec S6/S31: "make the applied rule visible
 * in attendance details" / "Rule Applied" breakdown. `snapshot` is a real
 * `attendance_daily.applied_rule_snapshot` value ({values, sources}).
 */
export default function AttendanceRuleSummary({ snapshot, shift }) {
  if (!snapshot) {
    return <div className="text-xs text-gray-400 italic">No rule snapshot recorded for this day.</div>;
  }

  const { values = {}, sources = {} } = snapshot;

  return (
    <div className="flex flex-col gap-2">
      {shift && (
        <div className="text-xs text-gray-600 dark:text-gray-300 mb-1">
          Shift: <span className="font-semibold text-gray-900 dark:text-white">{shift.name}</span>{" "}
          ({shift.start_time}–{shift.end_time}){shift.is_overnight ? " • overnight" : ""}
        </div>
      )}
      <div className="rounded-lg border border-gray-200 dark:border-gray-800 divide-y divide-gray-100 dark:divide-gray-800 overflow-hidden">
        {Object.entries(FIELD_LABELS).map(([field, label]) => (
          <div key={field} className="flex items-center justify-between px-3 py-1.5 text-xs">
            <span className="text-gray-500 dark:text-gray-400">{label}</span>
            <div className="flex items-center gap-2">
              <span className="font-mono font-semibold text-gray-900 dark:text-white">{formatValue(field, values[field])}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SCOPE_COLORS[sources[field]] || SCOPE_COLORS.default}`}>
                {sources[field] || "default"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
