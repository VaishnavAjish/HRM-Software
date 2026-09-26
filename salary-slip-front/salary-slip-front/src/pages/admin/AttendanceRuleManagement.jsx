import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Trash2, RefreshCw, ShieldCheck, X, Loader2, Clock, Search } from "lucide-react";
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
 *
 * A rule can now carry its own punch-in/punch-out schedule
 * (scheduled_start_time/scheduled_end_time) and a clock-time half-day cutoff
 * (half_day_cutoff_time), instead of only ever being duration/minutes based
 * -- see AttendanceStatusEngine/AttendanceRuleResolver on the backend for how
 * these resolve and get applied.
 *
 * Rendered as a tab inside AttendanceRawPunches.jsx (its own nav entry and
 * route were removed) -- no outer page wrapper/header of its own, so it
 * only ever appears alongside the Punch Ledger and Device Health tabs.
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
  scheduled_start_time: "",
  scheduled_end_time: "",
  grace_in_minutes: "10",
  grace_out_minutes: "0",
  half_day_cutoff_time: "",
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

/** "09:30" + "18:30" -> { minutes: 540, label: "9h 00m" }. Crosses midnight
 * (end <= start) is treated as an overnight shift, same as the backend. */
function computeWorkingHours(start, end) {
  if (!start || !end) return null;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if ([sh, sm, eh, em].some((n) => Number.isNaN(n))) return null;
  let minutes = eh * 60 + em - (sh * 60 + sm);
  if (minutes <= 0) minutes += 24 * 60;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { minutes, label: `${h}h ${String(m).padStart(2, "0")}m` };
}

function fmtTime(t) {
  return t ? t.slice(0, 5) : null;
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

  // Department picker (fetched per selected company) and employee
  // search-select (fetched once, filtered client-side) for the "department"
  // and "employee" scopes -- replacing a free-text department name and a
  // raw numeric user id, neither of which an admin could fill in reliably.
  const [departments, setDepartments] = useState([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [employeesList, setEmployeesList] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(false);
  const [empQuery, setEmpQuery] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState(null);

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

  useEffect(() => {
    if (!modalOpen || form.scope_type !== "department" || !form.company_code) return;
    setDepartmentsLoading(true);
    salaryApi
      .getDepartments(user?.accessToken, user?.tokenType, form.company_code)
      .then((res) => setDepartments((res?.data || []).map((d) => (typeof d === "string" ? d : d.name)).filter(Boolean)))
      .catch(() => setDepartments([]))
      .finally(() => setDepartmentsLoading(false));
  }, [modalOpen, form.scope_type, form.company_code, user?.accessToken, user?.tokenType]);

  useEffect(() => {
    if (!modalOpen || form.scope_type !== "employee") return;
    setEmployeesLoading(true);
    salaryApi
      .getAllEmployees(user?.accessToken, user?.tokenType, { limit: 2000 }, form.company_code || undefined)
      .then((res) => setEmployeesList(res?.data?.users?.data ?? res?.data?.users ?? []))
      .catch(() => setEmployeesList([]))
      .finally(() => setEmployeesLoading(false));
  }, [modalOpen, form.scope_type, form.company_code, user?.accessToken, user?.tokenType]);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setSelectedEmployee(null);
    setEmpQuery("");
    setModalOpen(true);
  }

  const workingHours = useMemo(
    () => computeWorkingHours(form.scheduled_start_time, form.scheduled_end_time),
    [form.scheduled_start_time, form.scheduled_end_time]
  );

  const employeeMatches = useMemo(() => {
    const q = empQuery.trim().toLowerCase();
    if (!q) return [];
    return employeesList
      .filter(
        (e) =>
          String(e.name || "").toLowerCase().includes(q) ||
          String(e.emp_code || "").toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [employeesList, empQuery]);

  async function handleSave() {
    if (form.scope_type !== "global" && !form.company_code) return toast.error("Select a company for this scope.");
    if (form.scope_type === "branch" && !form.unit) return toast.error("Branch scope requires a unit.");
    if (form.scope_type === "department" && !form.department) return toast.error("Select a department.");
    if (form.scope_type === "employee" && !form.employee_user_id) return toast.error("Search and select an employee.");
    if (!form.change_reason) return toast.error("A change reason is required — every rule change is audit-logged.");

    setSaving(true);
    try {
      const payload = { ...form };
      // strip empty-string numeric fields so validation's `nullable` applies instead of a cast error
      ["grace_in_minutes", "grace_out_minutes", "half_day_threshold_minutes", "full_day_minutes", "minimum_work_minutes", "overtime_after_minutes", "employee_user_id"].forEach((k) => {
        if (payload[k] === "") delete payload[k];
        else if (payload[k] !== undefined) payload[k] = Number(payload[k]);
      });
      // Clock-time fields: blank means "don't set this", never send an empty string.
      ["scheduled_start_time", "scheduled_end_time", "half_day_cutoff_time"].forEach((k) => {
        if (!payload[k]) delete payload[k];
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-extrabold text-gray-900 dark:text-white flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-gray-400" /> Attendance Rule Management</h2>
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
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Punch In/Out</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Half-Day</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">OT</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Effective</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800">Status</th>
              <th className="px-3 py-2 text-left font-bold text-gray-500 border-b border-gray-200 dark:border-gray-800"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="py-12 text-center text-gray-400">Loading…</td></tr>
            ) : sortedRules.length === 0 ? (
              <tr><td colSpan={9} className="py-12 text-center text-gray-400">No rules yet — everything falls back to hard defaults. Click "New Rule" to configure one.</td></tr>
            ) : (
              sortedRules.map((r) => {
                const start = fmtTime(r.scheduled_start_time);
                const end = fmtTime(r.scheduled_end_time);
                const halfCutoff = fmtTime(r.half_day_cutoff_time);
                return (
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
                    <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800 font-mono">
                      {start && end ? (
                        <>
                          {start} → {end}
                          <div className="text-[10px] text-gray-400 font-sans">grace {r.grace_in_minutes ?? 0}/{r.grace_out_minutes ?? 0}m</div>
                        </>
                      ) : "—"}
                    </td>
                    <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-800">
                      {halfCutoff ? (
                        <span className="font-mono">after {halfCutoff}</span>
                      ) : r.half_day_threshold_minutes ? (
                        <span className="font-mono">&lt;{r.half_day_threshold_minutes}m</span>
                      ) : "—"}
                    </td>
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
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="New Attendance Rule" size="xl">
        <div className="flex flex-col gap-4 text-xs">
          {/* Scope & Target */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3.5 flex flex-col gap-3">
            <span className="text-[11px] font-bold uppercase text-gray-500">Scope &amp; Target</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Scope</label>
                <select
                  value={form.scope_type}
                  onChange={(e) => {
                    updateField("scope_type", e.target.value);
                    setSelectedEmployee(null);
                    setEmpQuery("");
                  }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs"
                >
                  {SCOPE_TYPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Rule Name (optional)</label>
                <input value={form.name} onChange={(e) => updateField("name", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" placeholder="e.g. Engineering strict grace" />
              </div>
            </div>

            {form.scope_type !== "global" && (
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Company</label>
                <select
                  value={form.company_code}
                  onChange={(e) => {
                    updateField("company_code", e.target.value);
                    updateField("department", "");
                  }}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs"
                  disabled={!isAllCompanies}
                >
                  <option value="">Select…</option>
                  {COMPANY_OPTIONS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            )}
            {form.scope_type === "branch" && (
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Unit</label>
                <input value={form.unit} onChange={(e) => updateField("unit", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
            )}
            {form.scope_type === "department" && (
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Department</label>
                <select
                  value={form.department}
                  onChange={(e) => updateField("department", e.target.value)}
                  disabled={!form.company_code || departmentsLoading}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs disabled:opacity-50"
                >
                  <option value="">{!form.company_code ? "Select a company first…" : departmentsLoading ? "Loading…" : "Select…"}</option>
                  {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}
            {form.scope_type === "employee" && (
              <div className="relative">
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Employee</label>
                {selectedEmployee ? (
                  <div className="flex items-center justify-between rounded-lg border border-brand-200 dark:border-brand-800 bg-brand-50 dark:bg-brand-950/40 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="font-semibold text-gray-800 dark:text-gray-100 truncate">{selectedEmployee.name}</div>
                      <div className="text-[10px] text-gray-400">Code: {selectedEmployee.emp_code} {selectedEmployee.department ? `· ${selectedEmployee.department}` : ""}</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedEmployee(null);
                        updateField("employee_user_id", "");
                      }}
                      className="text-gray-400 hover:text-gray-600 shrink-0"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                      <input
                        value={empQuery}
                        onChange={(e) => setEmpQuery(e.target.value)}
                        disabled={!form.company_code || employeesLoading}
                        placeholder={!form.company_code ? "Select a company first…" : employeesLoading ? "Loading employees…" : "Search name or code…"}
                        className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 pl-8 pr-3 py-2 text-xs outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
                      />
                    </div>
                    {employeeMatches.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg">
                        {employeeMatches.map((e) => (
                          <button
                            key={e.id}
                            onClick={() => {
                              setSelectedEmployee(e);
                              setEmpQuery("");
                              updateField("employee_user_id", e.id);
                            }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                          >
                            <div className="font-medium text-gray-800 dark:text-gray-100">{e.name}</div>
                            <div className="text-[10px] text-gray-400">Code: {e.emp_code} {e.department ? `· ${e.department}` : ""}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Schedule */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3.5 flex flex-col gap-3">
            <span className="text-[11px] font-bold uppercase text-gray-500 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Schedule</span>
            <div className="grid grid-cols-3 gap-3 items-end">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Punch-In Time</label>
                <input type="time" value={form.scheduled_start_time} onChange={(e) => updateField("scheduled_start_time", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Punch-Out Time</label>
                <input type="time" value={form.scheduled_end_time} onChange={(e) => updateField("scheduled_end_time", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
              <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-3 py-1.5 text-xs">
                <span className="block text-[10px] font-bold uppercase text-gray-400">Working Hours</span>
                <span className="font-mono font-semibold text-gray-700 dark:text-gray-200">{workingHours ? workingHours.label : "—"}</span>
              </div>
            </div>
            <p className="text-[10px] text-gray-400">Leave both blank to fall back to the employee's assigned Shift, if any.</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Grace In (m)</label>
                <input type="number" value={form.grace_in_minutes} onChange={(e) => updateField("grace_in_minutes", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Grace Out (m)</label>
                <input type="number" value={form.grace_out_minutes} onChange={(e) => updateField("grace_out_minutes", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
            </div>
          </div>

          {/* Half-Day Rule */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3.5 flex flex-col gap-3">
            <span className="text-[11px] font-bold uppercase text-gray-500">Half-Day Rule</span>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Mark Half-Day if Punch-In is After</label>
              <input type="time" value={form.half_day_cutoff_time} onChange={(e) => updateField("half_day_cutoff_time", e.target.value)} className="w-full sm:w-48 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              <p className="text-[10px] text-gray-400 mt-1">e.g. 11:00 — anyone punching in after this clock time is Half Day for that day, however many hours they end up working.</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Minimum Work (m)</label>
                <input type="number" value={form.minimum_work_minutes} onChange={(e) => updateField("minimum_work_minutes", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Half-Day Below (m worked)</label>
                <input type="number" value={form.half_day_threshold_minutes} onChange={(e) => updateField("half_day_threshold_minutes", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Full-Day At (m worked)</label>
                <input type="number" value={form.full_day_minutes} onChange={(e) => updateField("full_day_minutes", e.target.value)} className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs" />
              </div>
            </div>
            <p className="text-[10px] text-gray-400">
              These minutes-worked thresholds still apply alongside the punch-in cutoff above — whichever rule marks the day
              Half-Day (or Absent) first wins.
            </p>
          </div>

          {/* Overtime */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3.5 flex flex-col gap-3">
            <span className="text-[11px] font-bold uppercase text-gray-500">Overtime</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 dark:text-gray-300">
                <input type="checkbox" checked={form.overtime_enabled} onChange={(e) => updateField("overtime_enabled", e.target.checked)} />
                Eligible for Overtime
              </label>
              <div className="flex-1">
                <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">OT After (m worked)</label>
                <input
                  type="number"
                  value={form.overtime_after_minutes}
                  onChange={(e) => updateField("overtime_after_minutes", e.target.value)}
                  disabled={!form.overtime_enabled}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs disabled:opacity-50"
                  placeholder="defaults to Full-Day (m)"
                />
              </div>
            </div>
            <p className="text-[10px] text-gray-400">
              Untick "Eligible for Overtime" for this scope (e.g. a specific department or employee) to make sure they never
              accrue OT, regardless of hours worked.
            </p>
            <div>
              <label className="block text-[10px] font-bold uppercase text-gray-400 mb-1">Break Policy</label>
              <select value={form.break_policy} onChange={(e) => updateField("break_policy", e.target.value)} className="w-full sm:w-48 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 px-2 py-1.5 text-xs">
                <option value="first_last">First/Last punch</option>
                <option value="multi_punch">Multi-punch</option>
              </select>
            </div>
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
