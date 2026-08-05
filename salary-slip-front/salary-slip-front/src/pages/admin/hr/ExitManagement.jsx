import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, ArrowRight, RotateCcw, CalendarClock, Mail } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { StatCard } from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi, salaryApi } from "../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = {
  submitted: "yellow", approved: "blue", notice_period: "purple",
  cleared: "green", exited: "gray", withdrawn: "red",
};
const STATUS_LABEL = {
  submitted: "Submitted", approved: "Approved", notice_period: "Notice Period",
  cleared: "Cleared", exited: "Exited", withdrawn: "Withdrawn",
};
// Linear progression a resignation walks through; "withdrawn" is reachable
// from any non-terminal state via a separate action, not part of this chain.
const NEXT_STATUS = { submitted: "approved", approved: "notice_period", notice_period: "cleared", cleared: "exited" };
const TERMINAL_STATUSES = ["exited", "withdrawn"];

const EMPTY_FORM = { user_id: "", resignation_date: "", notice_period_days: "30", last_working_day: "", reason: "", notes: "" };

export default function ExitManagement() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [loading, setLoading] = useState(true);
  const [resignations, setResignations] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [actingId, setActingId] = useState(null);

  const load = () =>
    hrApi.getResignations(user?.accessToken, user?.tokenType, { ...companyScope, status: statusFilter || undefined, per_page: 100 })
      .then((res) => { if (res.status) setResignations(res.data?.data || res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load resignations"))
      .finally(() => setLoading(false));

  const reload = () => { setLoading(true); return load(); };

  useEffect(() => {
    if (!user?.accessToken) return;
    reload();
    salaryApi.getAllEmployees(user.accessToken, user.tokenType, { status: "Active", per_page: 100 }, companyScope?.companyId)
      .then((res) => setEmployees(res?.data?.users?.data ?? res?.data?.users ?? []))
      .catch(() => {});
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (user?.accessToken) reload(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const cards = {
    active: resignations.filter((r) => !TERMINAL_STATUSES.includes(r.status)).length,
    noticePeriod: resignations.filter((r) => r.status === "notice_period").length,
    exitedThisMonth: resignations.filter((r) => {
      if (r.status !== "exited" || !r.last_working_day) return false;
      const d = new Date(r.last_working_day), now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).length,
    withdrawn: resignations.filter((r) => r.status === "withdrawn").length,
  };

  const save = async () => {
    if (!form.user_id || !form.resignation_date || !form.reason.trim()) {
      toast.error("Employee, resignation date and reason are required");
      return;
    }
    setSaving(true);
    try {
      const res = await hrApi.storeResignation({
        ...form,
        last_working_day: form.last_working_day || undefined,
      }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Resignation recorded"); setModalOpen(false); setForm(EMPTY_FORM); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to record resignation");
    } finally {
      setSaving(false);
    }
  };

  const advance = async (r) => {
    const next = NEXT_STATUS[r.status];
    if (!next) return;
    setActingId(r.id);
    try {
      const res = await hrApi.updateResignationStatus(r.id, { status: next }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success(`Marked ${STATUS_LABEL[next]}`); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setActingId(null);
    }
  };

  const withdraw = async (r) => {
    if (!window.confirm(`Withdraw ${r.user?.name || "this"}'s resignation?`)) return;
    setActingId(r.id);
    try {
      const res = await hrApi.updateResignationStatus(r.id, { status: "withdrawn" }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Resignation withdrawn"); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to withdraw");
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Initiate a resignation and track it through notice period to exit</p>
        <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>Initiate Resignation</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Active Resignations" value={cards.active} icon={<ArrowRight size={20} />} color="yellow" />
        <StatCard title="In Notice Period" value={cards.noticePeriod} icon={<CalendarClock size={20} />} color="purple" />
        <StatCard title="Exited This Month" value={cards.exitedThisMonth} icon={<Mail size={20} />} color="gray" />
        <StatCard title="Withdrawn" value={cards.withdrawn} icon={<RotateCcw size={20} />} color="red" />
      </div>

      <div className="flex items-center gap-2">
        <select className={`${inputClass} w-auto`} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Statuses</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : resignations.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No resignations recorded yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Employee</th>
                  <th className="text-left px-4 py-3">Reason</th>
                  <th className="text-left px-4 py-3">Resignation Date</th>
                  <th className="text-left px-4 py-3">Last Working Day</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {resignations.map((r) => {
                  const next = NEXT_STATUS[r.status];
                  const busy = actingId === r.id;
                  const isTerminal = TERMINAL_STATUSES.includes(r.status);
                  return (
                    <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{r.user?.name}</p>
                        {r.user?.emp_code && <p className="text-xs text-gray-400">{r.user.emp_code}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 max-w-xs truncate" title={r.reason}>{r.reason}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.resignation_date}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.last_working_day || "—"}</td>
                      <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[r.status] || "gray"}>{STATUS_LABEL[r.status] || r.status}</Badge></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          {next && (
                            <button title={`Mark ${STATUS_LABEL[next]}`} disabled={busy} onClick={() => advance(r)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 disabled:opacity-40">
                              <ArrowRight size={13} /> {STATUS_LABEL[next]}
                            </button>
                          )}
                          {!isTerminal && (
                            <button title="Withdraw" disabled={busy} onClick={() => withdraw(r)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40">
                              <RotateCcw size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Initiate Resignation" size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Submit"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Employee" required full>
            <select className={inputClass} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
              <option value="">— Select employee —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name} {e.emp_code ? `(${e.emp_code})` : ""}</option>)}
            </select>
          </Field>
          <Field label="Resignation Date" required><input type="date" className={inputClass} value={form.resignation_date} onChange={(e) => setForm({ ...form, resignation_date: e.target.value })} /></Field>
          <Field label="Notice Period (days)"><input type="number" min="0" className={inputClass} value={form.notice_period_days} onChange={(e) => setForm({ ...form, notice_period_days: e.target.value })} /></Field>
          <Field label="Last Working Day" full>
            <input type="date" className={inputClass} value={form.last_working_day} onChange={(e) => setForm({ ...form, last_working_day: e.target.value })} />
            <p className="text-xs text-gray-400 mt-1">Leave blank to auto-calculate from resignation date + notice period</p>
          </Field>
          <Field label="Reason" required full><textarea rows={2} className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}

function Field({ label, required, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
