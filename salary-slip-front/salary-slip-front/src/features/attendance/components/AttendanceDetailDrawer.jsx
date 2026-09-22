import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import Modal from "../../../components/ui/Modal";
import { salaryApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";
import AttendanceStatusBadge, { AttendanceFlagChips } from "./AttendanceStatusBadge";
import PunchTimeline from "./PunchTimeline";
import AttendanceRuleSummary from "./AttendanceRuleSummary";

function fmtMinutes(mins) {
  if (mins === null || mins === undefined) return "—";
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/**
 * Attendance Engine Rebuild -- spec S30/S31: Employee Profile + Attendance
 * Summary + Rule Applied breakdown + Raw Punch Timeline, in one drawer.
 */
export default function AttendanceDetailDrawer({ recordId, onClose }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!recordId) return;
    let cancelled = false;
    setLoading(true);
    salaryApi
      .getAttendanceDetails(recordId, user?.accessToken, user?.tokenType)
      .then((res) => { if (!cancelled) setData(res?.data || null); })
      .catch((err) => toast.error(err.message || "Failed to load attendance details"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recordId, user?.accessToken, user?.tokenType]);

  const daily = data?.attendance;

  return (
    <Modal isOpen={!!recordId} onClose={onClose} title="Attendance Details" size="lg">
      {loading ? (
        <div className="py-16 text-center text-sm text-gray-400">Loading...</div>
      ) : !daily ? (
        <div className="py-16 text-center text-sm text-gray-400">Record not found.</div>
      ) : (
        <div className="flex flex-col gap-5 text-sm">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-bold text-gray-900 dark:text-white">{daily.user?.name}</div>
              <div className="text-xs text-gray-400">
                {daily.user?.emp_code} &middot; {daily.department || "—"} &middot; {daily.unit || "—"} &middot; {daily.attendance_date}
              </div>
            </div>
            <AttendanceStatusBadge status={daily.primary_status} size="md" />
          </div>
          <AttendanceFlagChips record={daily} />

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Attendance Summary</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {[
                ["Check In", daily.first_punch_at ? new Date(daily.first_punch_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"],
                ["Check Out", daily.last_punch_at ? new Date(daily.last_punch_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"],
                ["Worked", fmtMinutes(daily.worked_minutes)],
                ["Break", fmtMinutes(daily.break_minutes)],
                ["Late", daily.is_late ? `${daily.late_minutes} min` : "No"],
                ["Early Exit", daily.is_early_exit ? `${daily.early_exit_minutes} min` : "No"],
                ["Overtime", daily.is_overtime ? `${daily.overtime_minutes} min` : "No"],
                ["Punch Count", daily.punch_count],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-gray-200 dark:border-gray-800 p-2">
                  <div className="text-[10px] uppercase text-gray-400 font-semibold">{label}</div>
                  <div className="font-mono font-bold text-gray-900 dark:text-white">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {daily.regularization && (
            <div className="rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/50 dark:bg-teal-950/30 p-3 text-xs">
              <div className="font-bold text-teal-800 dark:text-teal-300 mb-1">Regularization applied</div>
              <div className="text-teal-700 dark:text-teal-400">{daily.regularization.reason}</div>
              <div className="text-gray-500 mt-1">
                Requested by {daily.regularization.requested_by?.name}, approved by {daily.regularization.approved_by?.name}
              </div>
            </div>
          )}

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Rule Applied</h4>
            <AttendanceRuleSummary snapshot={daily.applied_rule_snapshot} shift={daily.shift} />
          </div>

          <div>
            <h4 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Raw Punch Timeline</h4>
            <PunchTimeline punches={data.punch_timeline} />
          </div>
        </div>
      )}
    </Modal>
  );
}
