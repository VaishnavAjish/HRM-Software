import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { useCompany } from "../../../../../context/CompanyContext";
import { salaryApi } from "../../../../../utils/api";
import Drawer from "../../../../../components/ui/Drawer";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import { formatClaimDate } from "../../../utils/formatters";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

// The reviewer roles a Mediclaim claim is routed to (per the operational
// follow-ups list: "Assign at least one primary reviewer per required role
// (coordinator/committee/HR/director/settlement)"). Manager is deliberately
// excluded — manager assignment is derived from the reporting hierarchy
// (`assigned_manager_id`), never from `mediclaim_reviewer_assignments`.
const ROLE_OPTIONS = [
  { value: "COORDINATOR", label: "Coordinator" },
  { value: "COMMITTEE", label: "Committee" },
  { value: "HR_ELIGIBILITY", label: "HR Eligibility" },
  { value: "DIRECTOR", label: "Director" },
  { value: "SETTLEMENT", label: "Settlement" },
];

const EMPTY_FORM = { role: ROLE_OPTIONS[0].value, userId: "", isBackup: false, activeFrom: "", activeTo: "" };

function roleLabel(role) {
  return ROLE_OPTIONS.find((r) => r.value === role)?.label || role || "—";
}

/**
 * Primary/backup reviewer-assignment CRUD — who decides claims at each of
 * the four stage-assignable roles (plus Settlement), per company. The module
 * stays hidden company-wide until at least one active assignment exists per
 * required role (see the plan's `mediclaim_ready` gate in B5), so this
 * screen is what actually turns the feature on for real use.
 */
export default function ReviewersTab() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const { can } = useMediclaimAuthorization();

  const [state, setState] = useState({ loading: true, rows: [], error: null });
  const [employees, setEmployees] = useState([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const canAssign = can("mediclaim.reviewer_assignment.assign");

  const load = () => {
    if (!user?.accessToken) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    mediclaimApi.reviewerAssignments({}, user.accessToken, user.tokenType)
      .then((res) => {
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setState({ loading: false, rows, error: null });
      })
      .catch((err) => {
        setState({ loading: false, rows: [], error: err?.message || "Failed to load reviewer assignments." });
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);

    if (user?.accessToken && employees.length === 0) {
      salaryApi.getAllEmployees(user.accessToken, user.tokenType, { status: "Active", per_page: 200 }, companyScope?.companyId)
        .then((res) => {
          const rows = res?.data?.data || res?.data || [];
          setEmployees(rows.map((r) => ({ id: r.id, name: r.name })));
        })
        .catch(() => setEmployees([]));
    }
  };

  const openEdit = (row) => {
    setEditingId(row.id ?? row.assignmentId);
    setForm({
      role: row.role || ROLE_OPTIONS[0].value,
      userId: String(row.userId ?? row.user_id ?? ""),
      isBackup: row.isBackup ?? row.is_backup ?? false,
      activeFrom: row.activeFrom || row.active_from || "",
      activeTo: row.activeTo || row.active_to || "",
    });
    setFormError(null);
    setDrawerOpen(true);
    if (user?.accessToken && employees.length === 0) {
      salaryApi.getAllEmployees(user.accessToken, user.tokenType, { status: "Active", per_page: 200 }, companyScope?.companyId)
        .then((res) => {
          const rows = res?.data?.data || res?.data || [];
          setEmployees(rows.map((r) => ({ id: r.id, name: r.name })));
        })
        .catch(() => setEmployees([]));
    }
  };

  const submit = async () => {
    if (!form.userId) {
      setFormError("Select the reviewer.");
      return;
    }

    setSaving(true);
    setFormError(null);
    const payload = {
      role: form.role,
      userId: form.userId,
      isBackup: Boolean(form.isBackup),
      activeFrom: form.activeFrom || undefined,
      activeTo: form.activeTo || undefined,
      companyCode: companyScope?.companyId || undefined,
    };

    try {
      if (editingId) {
        await mediclaimApi.updateReviewerAssignment(editingId, payload, user?.accessToken, user?.tokenType);
        toast.success("Reviewer assignment updated");
      } else {
        await mediclaimApi.createReviewerAssignment(payload, user?.accessToken, user?.tokenType);
        toast.success("Reviewer assigned");
      }
      setDrawerOpen(false);
      load();
    } catch (err) {
      setFormError(err?.message || "Failed to save this reviewer assignment.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    const id = row.id ?? row.assignmentId;
    if (!window.confirm("Remove this reviewer assignment?")) return;
    setDeletingId(id);
    try {
      await mediclaimApi.deleteReviewerAssignment(id, user?.accessToken, user?.tokenType);
      toast.success("Reviewer assignment removed");
      load();
    } catch (err) {
      toast.error(err?.message || "Failed to remove this reviewer assignment.");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Primary and backup reviewers for each Mediclaim stage. At least one active, primary assignment per role is
          required before the module is available company-wide.
        </p>
        {canAssign && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>New Assignment</Button>}
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {state.loading ? (
          <p className="py-16 text-center text-sm text-gray-400">Loading…</p>
        ) : state.error ? (
          <p className="py-16 text-center text-sm text-red-500">{state.error}</p>
        ) : state.rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">
            No reviewer assignments yet — assign at least one primary reviewer per role to make the module available.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 text-left">Role</th>
                  <th className="px-4 py-3 text-left">Reviewer</th>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Active Dates</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {state.rows.map((row) => {
                  const id = row.id ?? row.assignmentId;
                  const isBackup = row.isBackup ?? row.is_backup;
                  return (
                    <tr key={id}>
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{roleLabel(row.role)}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{row.userName || row.user?.name || row.user_name || "—"}</td>
                      <td className="px-4 py-3"><Badge variant={isBackup ? "yellow" : "blue"}>{isBackup ? "Backup" : "Primary"}</Badge></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {formatClaimDate(row.activeFrom || row.active_from)} – {(row.activeTo || row.active_to) ? formatClaimDate(row.activeTo || row.active_to) : "Ongoing"}
                      </td>
                      <td className="px-4 py-3">
                        {canAssign && (
                          <div className="flex items-center justify-end gap-3">
                            <button type="button" onClick={() => openEdit(row)} className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">Edit</button>
                            <button type="button" disabled={deletingId === id} onClick={() => remove(row)} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50 dark:text-red-400">
                              {deletingId === id ? "Removing…" : "Delete"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title={editingId ? "Edit Reviewer Assignment" : "New Reviewer Assignment"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Role" required>
            <select className={inputClass} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
              {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
          <Field label="Reviewer" required>
            <select className={inputClass} value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))}>
              <option value="">— Select employee —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={form.isBackup}
              onChange={(e) => setForm((f) => ({ ...f, isBackup: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
            />
            Backup reviewer (routes to only when the primary is unavailable)
          </label>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Active From">
              <input type="date" className={inputClass} value={form.activeFrom} onChange={(e) => setForm((f) => ({ ...f, activeFrom: e.target.value }))} />
            </Field>
            <Field label="Active To">
              <input type="date" className={inputClass} value={form.activeTo} onChange={(e) => setForm((f) => ({ ...f, activeTo: e.target.value }))} />
            </Field>
          </div>
          {formError && <p className="text-xs text-red-500">{formError}</p>}
        </div>
      </Drawer>
    </div>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
