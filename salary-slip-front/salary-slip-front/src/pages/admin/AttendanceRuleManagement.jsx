import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, RefreshCw, ShieldCheck, X, Loader2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import { salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { COMPANY_OPTIONS } from "../../config/companyConfig";

/**
 * Attendance Engine Rebuild -- Rule Management (spec S32). The backend CRUD
 * (GET/POST/DELETE /v1/attendance/rules) and the Rule Simulator already
 * existed; this page was the missing piece -- an actual screen to CREATE and
 * RETIRE rules across the 5-level scope hierarchy (global -> company ->
 * branch -> department -> employee), rather than only being able to test
 * them via the simulator or seed them via AttendanceRuleExampleSeeder.
 *
 * Rules are versioned, never edited in place (spec S45) -- there is
 * deliberately no "edit" action here, only "New Rule" (always a fresh row)
 * and "Retire" (soft-disables an active rule, keeping history intact).
 */
const SCOPE_TYPES = [
  { value: "global", label: "Global", color: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  { value: "company", label: "Company", color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300" },
  { value: "branch", label: "Branch/Unit", color: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300" },
  { value: "department", label: "Department", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  { value: "employee", label: "Employee", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
];

const EMPTY_FORM = {
  scope_type: "company",
  company_code: "",
  unit: "",
  department: "",
  employee_user_id: "",
  name: "",
  grace_in_minutes: "",
  grace_out_minutes: "",
  half_day_threshold_minutes: "",
  full_day_minutes: "",
  minimum_work_minutes: "",
  overtime_enabled: true,
  overtime_after_minutes: "",
  break_policy: "first_last",
  effective_from: new Date().toISOString().slice(0, 10),
  change_reason: "",
};

function ScopeBadge({ scopeType }) {
  const cfg = SCOPE_TYPES.find((s) => s.value === scopeType) || SCOPE_TYPES[0];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${cfg.color}`}>{cfg.label}</span>;
}

export default function AttendanceRuleManagement() {
  const { user } = useAuth();
  const { isAllCompanies } = useCompany();

  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [scopeFilter, setScopeFilter] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [retiringId, setRetiringId] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await salaryApi.getAttendanceRules(
        { scope_type: scopeFilter || undefined, include_inactive: includeInactive ? 1 : undefined, per_page: 100 },
        user?.accessToken,
        user?.tokenType
      );
      const data = res?.data?.data || res?.data || [];
      setRules(Array.isArray(data) ? data : data.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load rules.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeFilter, includeInactive]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  async function handleSave() {
    if (form.scope_type === "company" && !form.company_code) return toast.error("Company scope requires a company.");
    if (form.scope_type === "branch" && !form.unit) return toast.error("Branch scope requires a unit.");
    if (form.scope_type === "department" && !form.department) return toast.error("Department scope requires a department name.");
    if (form.scope_type === "employee" && !form.employee_user_id) return toast.error("Employee scope requires an employee user ID.");
    if (!form.change_reason) return toast.error("A change reason is required — every rule change is audit-logged.");

    setSaving(true);
    try {
      const payload = { ...form };
      // strip empty-string numeric fields so validation's `nullable` applies instead of a cast error
      ["grace_in_minutes", "grace_out_minutes", "half_day_threshold_minutes", "full_day_minutes", "minimum_work_minutes", "overtime_after_minutes", "employee_user_id"].forEach((k) => {
        if (payload[k] === "") delete payload[k];
        else if (payload[k] !== undefined) payload[k] = Number(payload[k]);
      });
      await salaryApi.createAttendanceRule(payload, user?.accessToken, user?.tokenType);
      toast.success("Rule created.");
      setModalOpen(false);
      load();
    } catch (err) {
      toast.error(err.message || "Failed to create rule.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRetire(rule) {
    if (!window.confirm(`Retire this ${rule.scope_type} rule? Historical days that already used it are unaffected.`)) return;
    setRetiringId(rule.id);
    try {
      await salaryApi.retireAttendanceRule(rule.id, user?.accessToken, user?.tokenType);
      toast.success("Rule retired.");
      load();
    } catch (err) {
      toast.error(err.message || "Failed to retire rule.");
    } finally {
      setRetiringId(null);
    }
  }

  const sortedRules = useMemo(
    () => [...rules].sort((a, b) => (b.effective_from || "").localeCompare(a.effective_from || "")),
    [rules]
  );

  return (
    <div className="flex flex-col gap-5 min-h-screen pb-12 bg-gray-50/50 dark:bg-gray-950/50 text-gray-900 dark:text-gray-100">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 border-b border-gray-200/80 dark:border-gray-800 pb-3">
        <div>
          <h1 className="text-lg font-extrabold text-gray-900 dark:text-white flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-gray-400" /> Attendance Rule Management</h1>
          <p className="text-xs text-gray-400">Global → Company → Branch → Department → Employee — versioned, never edited in place</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 px-3 py-1.5 text-xs font-semibold">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={openCreate} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm">
            <Plus className="h-4 w-4" /> New Rule
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white/95 dark:bg-gray-900/95 p-3 shadow-sm flex flex-wrap items-end gap-2.5">
        <div>
          <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Scope</label>
          <select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
            <option value="">All scopes</option>
            {SCOPE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 pb-1.5">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Include retired rules
        </label>
      </div>

      <div className="rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-950">
            <tr>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Scope</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Target</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Name</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Grace In/Out</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">OT</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Effective</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Status</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">Loading…</td></tr>
            ) : sortedRules.length === 0 ? (
              <tr><td colSpan={8} className="py-12 text-center text-gray-400">No rules yet — everything falls back to hard defaults. Click "New Rule" to configure one.</td></tr>
            ) : (
              sortedRules.map((r) => (
                <tr key={r.id} className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${!r.is_active ? "opacity-50" : ""}`}>
                  <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800"><ScopeBadge scopeType={r.scope_type} /></td>
                  <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 text-gray-600 dark:text-gray-300">
                    {r.scope_type === "employee" ? (r.employee ? `${r.employee.name} (${r.employee.emp_code})` : `User #${r.employee_user_id}`)
                      : r.scope_type === "department" ? r.department
                      : r.scope_type === "branch" ? r.unit
                      : r.scope_type === "company" ? r.company_code
                      : "—"}
                  </td>
                  <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">{r.name || "—"}</td>
                  <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 font-mono">{r.grace_in_minutes ?? "—"}/{r.grace_out_minutes ?? "—"}m</td>
                  <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">{r.overtime_enabled ? "On" : "Off"}</td>
                  <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 text-gray-500">{r.effective_from}{r.effective_to ? ` → ${r.effective_to}` : ""}</td>
                  <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
                    <span className={`text-[10px] font-bold uppercase ${r.is_active ? "text-emerald-600" : "text-gray-400"}`}>{r.is_active ? "Active" : "Retired"}</span>
                  </td>
                  <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 text-right">
                    {r.is_active && (
                      <button onClick={() => handleRetire(r)} disabled={retiringId === r.id} className="text-gray-400 hover:text-red-500 disabled:opacity-50">
                        {retiringId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Attendance Rule" size="lg">
        <div className="flex flex-col gap-3 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Scope</label>
              <select value={form.scope_type} onChange={(e) => updateField("scope_type", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
                {SCOPE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Rule Name (optional)</label>
              <input value={form.name} onChange={(e) => updateField("name", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" placeholder="e.g. Engineering strict grace" />
            </div>
          </div>

          {form.scope_type === "company" && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Company</label>
              <select value={form.company_code} onChange={(e) => updateField("company_code", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" disabled={!isAllCompanies}>
                <option value="">Select…</option>
                {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          )}
          {form.scope_type === "branch" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Company</label>
                <select value={form.company_code} onChange={(e) => updateField("company_code", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
                  <option value="">Select…</option>
                  {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Unit</label>
                <input value={form.unit} onChange={(e) => updateField("unit", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
            </div>
          )}
          {form.scope_type === "department" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Company</label>
                <select value={form.company_code} onChange={(e) => updateField("company_code", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
                  <option value="">Select…</option>
                  {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Department</label>
                <input value={form.department} onChange={(e) => updateField("department", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
            </div>
          )}
          {form.scope_type === "employee" && (
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Employee User ID</label>
              <input value={form.employee_user_id} onChange={(e) => updateField("employee_user_id", e.target.value)} type="number" className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" placeholder="e.g. 42" />
            </div>
          )}

          <div className="grid grid-cols-4 gap-3">
            {[
              ["grace_in_minutes", "Grace In (m)"], ["grace_out_minutes", "Grace Out (m)"],
              ["half_day_threshold_minutes", "Half-Day Threshold (m)"], ["full_day_minutes", "Full-Day (m)"],
              ["minimum_work_minutes", "Minimum Work (m)"], ["overtime_after_minutes", "OT After (m)"],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">{label}</label>
                <input type="number" value={form[key]} onChange={(e) => updateField(key, e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
            ))}
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Break Policy</label>
              <select value={form.break_policy} onChange={(e) => updateField("break_policy", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
                <option value="first_last">First/Last punch</option>
                <option value="multi_punch">Multi-punch</option>
              </select>
            </div>
            <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300 pt-4">
              <input type="checkbox" checked={form.overtime_enabled} onChange={(e) => updateField("overtime_enabled", e.target.checked)} />
              Overtime Enabled
            </label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Effective From</label>
              <input type="date" value={form.effective_from} onChange={(e) => updateField("effective_from", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Change Reason (required, audit-logged)</label>
            <textarea value={form.change_reason} onChange={(e) => updateField("change_reason", e.target.value)} rows={2} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" placeholder="Why is this rule being added?" />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => setModalOpen(false)} className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 px-3.5 py-1.5 text-xs font-semibold">
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button onClick={handleSave} disabled={saving} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm disabled:opacity-60">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Create Rule
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
