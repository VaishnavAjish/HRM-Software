import { useState } from "react";
import toast from "react-hot-toast";
import { Beaker, Plus, X, Play, Loader2 } from "lucide-react";
import Modal from "../../../components/ui/Modal";
import { salaryApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";
import AttendanceStatusBadge from "./AttendanceStatusBadge";
import AttendanceRuleSummary from "./AttendanceRuleSummary";

/**
 * Attendance Engine Rebuild -- spec S33: "critical for testing rules before
 * production". Runs the real backend engine (POST /v1/attendance/simulate)
 * against hypothetical punch times -- writes nothing.
 */
export default function RuleSimulator({ isOpen, onClose, employees }) {
  const { user } = useAuth();
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [punches, setPunches] = useState(["09:00", "18:00"]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  function updatePunch(idx, value) {
    setPunches((prev) => prev.map((p, i) => (i === idx ? value : p)));
  }
  function addPunch() {
    setPunches((prev) => [...prev, ""]);
  }
  function removePunch(idx) {
    setPunches((prev) => prev.filter((_, i) => i !== idx));
  }

  async function runSimulation() {
    if (!employeeId) {
      toast.error("Select an employee first");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await salaryApi.simulateAttendanceRule(
        { employee_id: Number(employeeId), date, punches: punches.filter(Boolean) },
        user?.accessToken,
        user?.tokenType
      );
      setResult(res?.data || null);
    } catch (err) {
      toast.error(err.message || "Simulation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Attendance Rule Simulator" size="lg">
      <div className="flex flex-col gap-4 text-xs">
        <div className="flex items-start gap-3 rounded-xl bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-200/80 dark:border-violet-900/50 p-3">
          <Beaker className="h-5 w-5 text-violet-600 shrink-0" />
          <p className="text-gray-600 dark:text-gray-300">
            Test hypothetical punch times against an employee's real, currently-configured rules -- nothing is saved.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Employee</label>
            <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
              <option value="">Select employee...</option>
              {(employees || []).map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.emp_code})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Punch Times (HH:MM)</label>
          <div className="flex flex-col gap-1.5">
            {punches.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="time"
                  value={p}
                  onChange={(e) => updatePunch(idx, e.target.value)}
                  className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1 text-xs font-mono"
                />
                <button onClick={() => removePunch(idx)} className="text-gray-400 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <button onClick={addPunch} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 font-semibold w-fit">
              <Plus className="h-3.5 w-3.5" /> Add punch
            </button>
          </div>
        </div>

        <button
          onClick={runSimulation}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-600 to-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          Run Simulation
        </button>

        {result && (
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 p-3 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-900 dark:text-white">Result</span>
              <AttendanceStatusBadge status={result.result.primary_status} size="md" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                ["Worked", result.result.worked_minutes !== null ? `${Math.floor(result.result.worked_minutes / 60)}h ${result.result.worked_minutes % 60}m` : "—"],
                ["Late", result.result.is_late ? `${result.result.late_minutes}m` : "No"],
                ["Overtime", result.result.is_overtime ? `${result.result.overtime_minutes}m` : "No"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-gray-50 dark:bg-gray-900 p-2 text-center">
                  <div className="text-[10px] uppercase text-gray-400 font-semibold">{label}</div>
                  <div className="font-mono font-bold text-gray-900 dark:text-white">{value}</div>
                </div>
              ))}
            </div>
            <AttendanceRuleSummary snapshot={result.rule_breakdown} shift={result.shift} />
          </div>
        )}
      </div>
    </Modal>
  );
}
