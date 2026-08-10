import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, ArrowRight, RotateCcw, CalendarClock, Mail, UserX, Clock, FileCheck, CheckCircle2, ShieldAlert } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { StatCard } from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi, salaryApi } from "../../../utils/api";

const inputClass = "w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3.5 py-2.5 text-xs font-medium text-gray-900 dark:text-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all";

const STATUS_VARIANT = {
  submitted: "yellow", approved: "blue", notice_period: "purple",
  cleared: "green", exited: "gray", withdrawn: "red",
};
const STATUS_LABEL = {
  submitted: "Submitted", approved: "Approved", notice_period: "Notice Period",
  cleared: "Cleared", exited: "Exited", withdrawn: "Withdrawn",
};

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
  }, [user, scopeKey]);

  useEffect(() => { if (user?.accessToken) reload(); }, [statusFilter]);

  const resignedUserIds = new Set(
    resignations.filter((r) => r.status !== "withdrawn").map((r) => r.user_id ?? r.user?.id)
  );
  const selectableEmployees = employees.filter((e) => !resignedUserIds.has(e.id));

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
      if (res.status) { toast.success(`Moved to ${STATUS_LABEL[next]}`); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    } finally {
      setActingId(null);
    }
  };

  const withdraw = async (r) => {
    const isExited = r.status === "exited";
    if (!window.confirm(isExited ? "Revoke this resignation and make the employee active again?" : "Withdraw this resignation request?")) return;
    setActingId(r.id);
    try {
      const res = await hrApi.updateResignationStatus(r.id, { status: "withdrawn" }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success(isExited ? "Resignation revoked" : "Resignation withdrawn"); reload(); }
    } catch (err) {
      toast.error(err.message || (isExited ? "Failed to revoke resignation" : "Failed to withdraw resignation"));
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6 pb-12 font-sans text-gray-900 dark:text-gray-100">
      {/* Top Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2 text-xs font-semibold text-gray-700 dark:text-gray-200 outline-none shadow-sm"
          >
            <option value="">All Statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
          <Button icon={<Plus size={15} />} onClick={() => setModalOpen(true)}>Record Resignation</Button>
        </div>
      </div>

      {/* Analytics Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Offboardings" value={cards.active} icon={<UserX size={20} />} color="yellow" />
        <StatCard title="In Notice Period" value={cards.noticePeriod} icon={<CalendarClock size={20} />} color="purple" />
        <StatCard title="Exited This Month" value={cards.exitedThisMonth} icon={<CheckCircle2 size={20} />} color="blue" />
        <StatCard title="Withdrawn Requests" value={cards.withdrawn} icon={<RotateCcw size={20} />} color="gray" />
      </div>

      {/* Main Resignation Table */}
      {loading ? (
        <SkeletonTable rows={6} />
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-3xl border border-gray-200/80 dark:border-gray-800 shadow-sm overflow-hidden">
          {resignations.length === 0 ? (
            <div className="py-16 text-center">
              <UserX size={28} className="mx-auto text-gray-300 dark:text-gray-600 mb-2" />
              <p className="text-sm font-bold text-gray-700 dark:text-gray-300">No resignation records found</p>
              <p className="text-xs text-gray-400 mt-1">Record a resignation when an employee initiates their exit process.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50/80 uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-800/50 dark:text-gray-400">
                  <tr>
                    <th className="px-5 py-3.5 font-semibold">Employee</th>
                    <th className="px-4 py-3.5 font-semibold">Resignation Date</th>
                    <th className="px-4 py-3.5 font-semibold">Notice (Days)</th>
                    <th className="px-4 py-3.5 font-semibold">Last Working Day</th>
                    <th className="px-4 py-3.5 font-semibold">Status</th>
                    <th className="px-4 py-3.5 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {resignations.map((r) => {
                    const empName = r.user?.name || "Employee";
                    const isBusy = actingId === r.id;
                    const next = NEXT_STATUS[r.status];
                    return (
                      <tr key={r.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-bold text-gray-900 dark:text-white">{empName}</p>
                          <p className="text-[11px] text-gray-400 truncate max-w-xs">{r.reason}</p>
                        </td>
                        <td className="px-4 py-3.5 font-medium text-gray-700 dark:text-gray-300">
                          {r.resignation_date ? new Date(r.resignation_date).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3.5 font-bold text-gray-800 dark:text-gray-200">
                          {r.notice_period_days} days
                        </td>
                        <td className="px-4 py-3.5 font-medium text-gray-700 dark:text-gray-300">
                          {r.last_working_day ? new Date(r.last_working_day).toLocaleDateString() : "—"}
                        </td>
                        <td className="px-4 py-3.5">
                          <Badge variant={STATUS_VARIANT[r.status] || "gray"}>
                            {STATUS_LABEL[r.status] || r.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            {next && (
                              <button
                                disabled={isBusy}
                                onClick={() => advance(r)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/40 dark:text-brand-400 font-semibold hover:bg-brand-100 transition-all text-[11px]"
                              >
                                {STATUS_LABEL[next]} <ArrowRight size={12} />
                              </button>
                            )}
                            {r.status !== "withdrawn" && (
                              <button
                                disabled={isBusy}
                                onClick={() => withdraw(r)}
                                className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:text-rose-600 hover:border-rose-200 dark:border-gray-700 transition-all text-[11px]"
                              >
                                {r.status === "exited" ? "Revoke" : "Withdraw"}
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
      )}

      {/* Record Resignation Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Record Employee Resignation"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Record Exit"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Employee</label>
            <select className={inputClass} value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
              <option value="">— Select employee —</option>
              {selectableEmployees.map((e) => (
                <option key={e.id} value={e.id}>{e.name} ({e.department || "General"})</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Resignation Date</label>
              <input type="date" className={inputClass} value={form.resignation_date} onChange={(e) => setForm({ ...form, resignation_date: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Notice Period (Days)</label>
              <input type="number" className={inputClass} value={form.notice_period_days} onChange={(e) => setForm({ ...form, notice_period_days: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Last Working Day</label>
            <input type="date" className={inputClass} value={form.last_working_day} onChange={(e) => setForm({ ...form, last_working_day: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">Reason for Leaving</label>
            <textarea rows={3} className={inputClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="State resignation reason..." />
          </div>
        </div>
      </Modal>
    </div>
  );
}
