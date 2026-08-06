import React, { useState } from "react";
import toast from "react-hot-toast";
import { Clock, ShieldAlert, Save, RefreshCw } from "lucide-react";

export default function TicketSlaManagementView() {
  const [saving, setSaving] = useState(false);
  const [slaConfig, setSlaConfig] = useState([
    { priority: "urgent", response_hours: 1, resolution_hours: 4, auto_escalate: true, escalation_timeout: "2 Hours" },
    { priority: "high", response_hours: 2, resolution_hours: 8, auto_escalate: true, escalation_timeout: "4 Hours" },
    { priority: "medium", response_hours: 4, resolution_hours: 24, auto_escalate: true, escalation_timeout: "12 Hours" },
    { priority: "low", response_hours: 8, resolution_hours: 48, auto_escalate: false, escalation_timeout: "24 Hours" },
  ]);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      toast.success("SLA Management & Escalation Matrix saved successfully!");
    }, 800);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between border-b border-gray-200 pb-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">SLA Management & Escalation Matrix</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Define SLA thresholds, first response targets, and automatic escalation timeouts per priority.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg hover:bg-purple-700 disabled:opacity-50"
        >
          {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          Save SLA Configuration
        </button>
      </header>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-gray-100 bg-gray-50 uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-slate-900">
            <tr>
              <th className="p-3.5 font-bold">Priority Level</th>
              <th className="p-3.5 font-bold">First Response Target</th>
              <th className="p-3.5 font-bold">Resolution Target</th>
              <th className="p-3.5 font-bold">Auto Escalation</th>
              <th className="p-3.5 font-bold">Escalation Timeout</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {slaConfig.map((item, idx) => (
              <tr key={idx} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                <td className="p-3.5 font-bold uppercase text-purple-600 dark:text-purple-400">
                  {item.priority}
                </td>
                <td className="p-3.5">
                  <input
                    type="number"
                    value={item.response_hours}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSlaConfig((prev) => prev.map((p, i) => i === idx ? { ...p, response_hours: val } : p));
                    }}
                    className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  /> <span className="text-gray-400">Hours</span>
                </td>
                <td className="p-3.5">
                  <input
                    type="number"
                    value={item.resolution_hours}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSlaConfig((prev) => prev.map((p, i) => i === idx ? { ...p, resolution_hours: val } : p));
                    }}
                    className="w-24 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-900 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                  /> <span className="text-gray-400">Hours</span>
                </td>
                <td className="p-3.5">
                  <input
                    type="checkbox"
                    checked={item.auto_escalate}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setSlaConfig((prev) => prev.map((p, i) => i === idx ? { ...p, auto_escalate: checked } : p));
                    }}
                    className="h-4 w-4 rounded text-purple-600 focus:ring-purple-500"
                  />
                </td>
                <td className="p-3.5 font-medium text-gray-700 dark:text-gray-300">
                  {item.escalation_timeout}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
