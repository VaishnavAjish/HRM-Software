import { Fingerprint } from "lucide-react";

/**
 * Attendance Engine Rebuild -- spec S30's raw punch timeline: every raw
 * scan for the day, first/last/intermediate visually distinguished,
 * DUPLICATE-status punches shown greyed-out (never hidden -- spec S66,
 * raw history is never deleted from the UI either).
 */
export default function PunchTimeline({ punches }) {
  if (!punches || punches.length === 0) {
    return <div className="text-xs text-gray-400 italic py-4 text-center">No raw punches recorded for this day.</div>;
  }

  const validIdx = punches.map((p, i) => (p.status === "VALID" ? i : -1)).filter((i) => i >= 0);
  const firstValid = validIdx[0];
  const lastValid = validIdx[validIdx.length - 1];

  return (
    <div className="flex flex-col gap-0">
      {punches.map((p, idx) => {
        const isDup = p.status === "DUPLICATE";
        const role = idx === firstValid ? "First Punch" : idx === lastValid ? "Last Punch" : isDup ? "Duplicate" : "Intermediate";
        return (
          <div key={p.id} className="flex items-start gap-3 relative pb-4 last:pb-0">
            <div className="flex flex-col items-center">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center shrink-0 ${isDup ? "bg-gray-200 dark:bg-gray-800" : idx === firstValid || idx === lastValid ? "bg-brand-600 text-white" : "bg-brand-100 dark:bg-brand-900/50 text-brand-700 dark:text-brand-300"}`}>
                <Fingerprint className="h-3.5 w-3.5" />
              </div>
              {idx < punches.length - 1 && <div className="w-px flex-1 bg-gray-200 dark:bg-gray-800 mt-1" />}
            </div>
            <div className={`flex-1 min-w-0 ${isDup ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-semibold text-gray-900 dark:text-white">
                  {new Date(p.punch_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{role}</span>
                {isDup && <span className="text-[10px] rounded bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 text-gray-500">Duplicate</span>}
              </div>
              <div className="text-[11px] text-gray-400 mt-0.5">
                {p.device?.name || p.device?.serial_number || p.device_serial || "Unknown device"}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
