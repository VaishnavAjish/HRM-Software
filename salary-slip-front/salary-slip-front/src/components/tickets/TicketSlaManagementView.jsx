import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Save, RefreshCw, Loader2, Info, Plus, Trash2, Building2 } from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { priorityMeta } from "./ticketMeta";

/**
 * SLA targets, company-wide and per department.
 *
 * The tab has always been called "Department SLA Rules" but the data behind it
 * was keyed on priority alone, so Payroll and IT were held to identical targets
 * whatever an administrator set here. Rules now carry a department, and a
 * department with no override simply follows the company-wide set — which is
 * why the global block cannot be removed.
 */
export default function TicketSlaManagementView() {
  const { user } = useAuth();
  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [globalRules, setGlobalRules] = useState([]);
  const [overrides, setOverrides] = useState({});   // { department: rule[] }
  const [departments, setDepartments] = useState([]);
  const [priorities, setPriorities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newDepartment, setNewDepartment] = useState("");

  const requestRules = async () => {
    try {
      const res = await ticketApi.getSlaRules(accessToken, tokenType);
      if (res?.status) {
        setGlobalRules(res.data?.global ?? []);
        setOverrides(res.data?.overrides ?? {});
        setDepartments(res.data?.departments ?? []);
        setPriorities(res.data?.priorities ?? []);
        setDirty(false);
      }
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

  const updateGlobal = (index, field, value) => {
    setDirty(true);
    setGlobalRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const updateOverride = (department, index, field, value) => {
    setDirty(true);
    setOverrides((prev) => ({
      ...prev,
      [department]: prev[department].map((r, i) => (i === index ? { ...r, [field]: value } : r)),
    }));
  };

  // A new override starts as a copy of the global set, so an administrator
  // adjusts real numbers instead of filling a blank grid from nothing.
  const addOverride = () => {
    const department = newDepartment.trim();
    if (!department) return;

    if (overrides[department]) {
      toast.error(`${department} already has an override`);
      return;
    }

    setOverrides((prev) => ({
      ...prev,
      [department]: (globalRules.length ? globalRules : priorities.map((p) => ({ priority: p }))).map((rule) => ({
        department,
        priority: rule.priority,
        response_hours: rule.response_hours ?? 4,
        resolution_hours: rule.resolution_hours ?? 24,
        auto_escalate: Boolean(rule.auto_escalate),
        escalate_after_hours: rule.escalate_after_hours ?? 12,
      })),
    }));
    setNewDepartment("");
    setAdding(false);
    setDirty(true);
  };

  const removeOverride = async (department) => {
    if (!window.confirm(`Remove the ${department} override? It will follow the company-wide rules.`)) return;

    // Only saved overrides exist server-side; an unsaved one is dropped locally.
    const isPersisted = (overrides[department] || []).some((r) => r.id);

    if (!isPersisted) {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[department];
        return next;
      });
      return;
    }

    try {
      const res = await ticketApi.deleteSlaOverride(department, accessToken, tokenType);
      if (res?.status) {
        toast.success(res.message || "Override removed");
        await load();
      } else {
        toast.error(res?.message || "Failed to remove override");
      }
    } catch (err) {
      toast.error(err.message || "Failed to remove override");
    }
  };

  const save = async () => {
    const rules = [
      ...globalRules.map((r) => ({ ...r, department: "" })),
      ...Object.entries(overrides).flatMap(([department, list]) =>
        list.map((r) => ({ ...r, department })),
      ),
    ].map((r) => ({
      department: r.department,
      priority: r.priority,
      response_hours: Number(r.response_hours),
      resolution_hours: Number(r.resolution_hours),
      auto_escalate: Boolean(r.auto_escalate),
      escalate_after_hours: Number(r.escalate_after_hours),
    }));

    setSaving(true);
    try {
      const res = await ticketApi.updateSlaRules({ rules }, accessToken, tokenType);
      if (res?.status) {
        toast.success(res.message || "SLA rules saved");
        await load();
      } else {
        // The server rejects a response target later than resolution; showing
        // its message is more useful than a generic failure.
        toast.error(res?.message || "Failed to save SLA rules");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save SLA rules");
    } finally {
      setSaving(false);
    }
  };

  const available = departments.filter((d) => !overrides[d]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4 dark:border-white/10">
        <div>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Department SLA Rules</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            First-response and resolution targets, company-wide or per department.
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

      <p className="flex items-start gap-2 rounded-xl bg-blue-50 p-3 text-[11px] leading-relaxed text-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <Info size={14} className="mt-px shrink-0" />
        Changes apply to tickets raised from now on — tickets already open keep the target they
        were raised under, so past performance is judged against the rule that was in force. A
        department with no override follows the company-wide rules.
      </p>

      {loading ? (
        <div className="flex h-40 items-center justify-center rounded-2xl border border-gray-200 dark:border-white/10">
          <Loader2 className="animate-spin text-brand-500" size={20} />
        </div>
      ) : (
        <>
          <RuleTable
            title="Company-wide (default)"
            subtitle="Applies to every department that has no override of its own."
            rules={globalRules}
            onChange={updateGlobal}
          />

          {Object.entries(overrides).map(([department, rules]) => (
            <RuleTable
              key={department}
              title={department}
              subtitle={`Overrides the company-wide targets for ${department} tickets.`}
              rules={rules}
              onChange={(index, field, value) => updateOverride(department, index, field, value)}
              onRemove={() => removeOverride(department)}
            />
          ))}

          <div className="rounded-2xl border border-dashed border-gray-300 p-4 dark:border-white/10">
            {adding ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  list="sla-departments"
                  value={newDepartment}
                  onChange={(e) => setNewDepartment(e.target.value)}
                  placeholder="Department name"
                  className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs outline-none focus:border-brand-500 dark:border-white/10 dark:bg-slate-900 dark:text-white"
                />
                {/* Suggestions are the departments tickets actually use. */}
                <datalist id="sla-departments">
                  {available.map((d) => <option key={d} value={d} />)}
                </datalist>
                <button onClick={addOverride} disabled={!newDepartment.trim()} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-40">
                  Add override
                </button>
                <button onClick={() => { setAdding(false); setNewDepartment(""); }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:hover:bg-white/5">
                  Cancel
                </button>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:underline dark:text-brand-400">
                <Plus size={14} /> Add a department override
              </button>
            )}
          </div>
        </>
      )}

      <p className="text-[11px] leading-relaxed text-gray-400">
        “Auto escalate” and “escalate after” drive the scheduled sweep
        (<code className="font-mono">tickets:escalate-overdue</code>, every 15 minutes): an active
        ticket with no activity inside its window is escalated a level and its watchers notified.
        This needs Laravel’s scheduler running on the server.
      </p>
    </div>
  );
}

function RuleTable({ title, subtitle, rules, onChange, onRemove }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-white/10 dark:bg-[#0b0f1a]">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-white/10">
        <div>
          <h3 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
            <Building2 size={14} className="text-brand-500" /> {title}
          </h3>
          <p className="mt-0.5 text-[11px] text-gray-400">{subtitle}</p>
        </div>
        {onRemove && (
          <button
            onClick={onRemove}
            className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
          >
            <Trash2 size={13} /> Remove
          </button>
        )}
      </div>

      <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 uppercase tracking-wider text-gray-500 dark:bg-slate-900">
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
              <tr key={`${rule.department ?? ""}-${rule.priority}`} className="hover:bg-gray-50/50 dark:hover:bg-white/[0.02]">
                <td className="p-3.5">
                  <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] ${meta.colorCls}`}>{meta.label}</span>
                </td>
                <td className="p-3.5">
                  <input type="number" min="1" max="720" value={rule.response_hours}
                    onChange={(e) => onChange(idx, "response_hours", e.target.value)} className={numberCls} />
                </td>
                <td className="p-3.5">
                  <input type="number" min="1" max="2160" value={rule.resolution_hours}
                    onChange={(e) => onChange(idx, "resolution_hours", e.target.value)} className={numberCls} />
                </td>
                <td className="p-3.5">
                  <input type="checkbox" checked={Boolean(rule.auto_escalate)}
                    onChange={(e) => onChange(idx, "auto_escalate", e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                </td>
                <td className="p-3.5">
                  <input type="number" min="1" max="720" value={rule.escalate_after_hours}
                    onChange={(e) => onChange(idx, "escalate_after_hours", e.target.value)} className={numberCls} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </section>
  );
}

const numberCls =
  "w-24 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1 text-xs text-gray-900 outline-none focus:border-brand-500 dark:border-white/10 dark:bg-slate-900 dark:text-white";

const btnGhost =
  "inline-flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 dark:border-white/10 dark:bg-slate-900 dark:text-gray-200";
