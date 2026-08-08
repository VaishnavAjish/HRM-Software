import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Save, RefreshCw, Loader2, Info } from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { priorityMeta } from "./ticketMeta";

/**
 * SLA targets per priority.
 *
 * Loads from and writes to /api/tickets/sla-rules. The previous version held
 * the four rows in component state, saved them with a timer and a success
 * toast, and lost every edit on refresh — while the ticket queue showed
 * countdowns that had nothing to do with the numbers being "saved" here.
 */
export default function TicketSlaManagementView() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const requestRules = async () => {
    try {
      const res = await ticketApi.getSlaRules(accessToken, tokenType);
      if (res?.status) setRules(res.data || []);
    } finally {
      setLoading(false);
    }
  };

  const load = () =>
    requestRules().catch((err) => toast.error(err.message || "Failed to load SLA rules"));

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const update = (index, field, value) => {
    setDirty(true);
    setRules((prev) => prev.map((rule, i) => (i === index ? { ...rule, [field]: value } : rule)));
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await ticketApi.updateSlaRules(
        {
          rules: rules.map((rule) => ({
            priority: rule.priority,
            response_hours: Number(rule.response_hours),
            resolution_hours: Number(rule.resolution_hours),
            auto_escalate: Boolean(rule.auto_escalate),
            escalate_after_hours: Number(rule.escalate_after_hours),
          })),
        },
        accessToken,
        tokenType,
      );

      if (res?.status) {
        setRules(res.data || rules);
        setDirty(false);
        toast.success(res.message || "SLA rules saved");
      } else {
        toast.error(res?.message || "Failed to save SLA rules");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save SLA rules");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">SLA Rules</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            First-response and resolution targets per priority.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading || saving} className={btnGhost} title="Reload">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={save}
            disabled={saving || loading || !dirty}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? "Saving…" : dirty ? "Save changes" : "Saved"}
          </button>
        </div>
      </header>

      {/* Stating the rule that actually governs existing tickets, because the
          alternative is an admin assuming a change is retroactive. */}
      <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <Info size={14} className="mt-px shrink-0" />
        Changes apply to tickets raised from now on. Tickets already open keep the target they
        were raised under, so past performance is judged against the rule that was in force.
      </p>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0b0f1a]">
        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="animate-spin text-brand-500" size={20} />
          </div>
        ) : rules.length === 0 ? (
          <p className="px-4 py-12 text-center text-xs text-gray-400">
            No SLA rules are configured.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-100 bg-gray-50 uppercase tracking-wider text-gray-500 dark:border-white/10 dark:bg-slate-900">
              <tr>
                <th className="p-3.5 font-bold">Priority</th>
                <th className="p-3.5 font-bold">First Response (hrs)</th>
                <th className="p-3.5 font-bold">Resolution (hrs)</th>
                <th className="p-3.5 font-bold">Auto Escalate</th>
                <th className="p-3.5 font-bold">Escalate After (hrs)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-white/10">
              {rules.map((rule, idx) => {
                const meta = priorityMeta(rule.priority);
                return (
                  <tr key={rule.priority} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                    <td className="p-3.5">
                      <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] ${meta.colorCls}`}>
                        {meta.label}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={rule.response_hours}
                        onChange={(e) => update(idx, "response_hours", e.target.value)}
                        className={numberCls}
                      />
                    </td>
                    <td className="p-3.5">
                      <input
                        type="number"
                        min="1"
                        max="2160"
                        value={rule.resolution_hours}
                        onChange={(e) => update(idx, "resolution_hours", e.target.value)}
                        className={numberCls}
                      />
                    </td>
                    <td className="p-3.5">
                      <input
                        type="checkbox"
                        checked={Boolean(rule.auto_escalate)}
                        onChange={(e) => update(idx, "auto_escalate", e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="p-3.5">
                      <input
                        type="number"
                        min="1"
                        max="720"
                        value={rule.escalate_after_hours}
                        onChange={(e) => update(idx, "escalate_after_hours", e.target.value)}
                        className={numberCls}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Said plainly rather than implied by a toggle that appears to do more
          than it does. */}
      <p className="text-[11px] leading-relaxed text-gray-400">
        “Auto escalate” and “escalate after” are stored against each priority and drive the
        escalation targets shown on a ticket. Escalation is raised from the ticket itself or in
        bulk from the queue; unattended tickets are not yet escalated on a timer.
      </p>
    </div>
  );
}

const numberCls =
  "w-24 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-slate-900 dark:text-white";

const btnGhost =
  "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200";
