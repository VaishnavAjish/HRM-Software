import { useEffect, useState } from "react";
import { Plus, Users } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { useCompany } from "../../../../../context/CompanyContext";
import { salaryApi } from "../../../../../utils/api";
import Drawer from "../../../../../components/ui/Drawer";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import { formatClaimDate } from "../../../utils/formatters";

// NOTE: this is the Mediclaim admin workspace's Employees tab
// (`src/features/mediclaim/pages/admin/tabs/EmployeesTab.jsx`) — an
// unrelated file of the same name exists under
// `src/pages/admin/hr/onboarding/EmployeesTab.jsx` for onboarding. The two
// are not connected in any way.

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const PER_PAGE = 15;

const EMPTY_FORM = {
  employeeUserId: "",
  policyVersionId: "",
  status: "ACTIVE",
  effectiveFrom: "",
  effectiveTo: "",
};

function membersOf(enrollment) {
  return enrollment?.members || enrollment?.coveredMembers || enrollment?.covered_members || [];
}

/**
 * Company-wide enrollments (employee <-> policy version) list, with
 * drill-down into a member's covered-family list. There is no dedicated
 * "members for this enrollment" endpoint in the backend plan (B4's route
 * table has only `GET /me/members`, self-scoped) — covered members belong to
 * an enrollment via the `mediclaim_members.enrollment_id` FK (B1, table 11),
 * so the drill-down reads whatever the enrollment record itself returns
 * nested (`members`/`coveredMembers`), rather than inventing a second
 * network call to an endpoint that isn't in the plan.
 */
export default function EmployeesTab() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const { can } = useMediclaimAuthorization();

  const [state, setState] = useState({ loading: true, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [selectedEnrollment, setSelectedEnrollment] = useState(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [employees, setEmployees] = useState([]);
  const [policyVersionOptions, setPolicyVersionOptions] = useState([]);

  const canCreate = can("mediclaim.enrollment.create");
  const canUpdate = can("mediclaim.enrollment.update");

  const load = () => {
    if (!user?.accessToken) return;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    mediclaimApi.enrollments({ page, perPage: PER_PAGE }, user.accessToken, user.tokenType)
      .then((res) => {
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setState({ loading: false, rows, total, error: null });
      })
      .catch((err) => {
        setState({ loading: false, rows: [], total: 0, error: err?.message || "Failed to load enrollments." });
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDrawerOpen(true);

    if (user?.accessToken) {
      salaryApi.getAllEmployees(user.accessToken, user.tokenType, { status: "Active", per_page: 200 }, companyScope?.companyId)
        .then((res) => {
          const rows = res?.data?.data || res?.data || [];
          setEmployees(rows.map((r) => ({ id: r.id, name: r.name })));
        })
        .catch(() => setEmployees([]));

      mediclaimApi.policies({}, user.accessToken, user.tokenType)
        .then((res) => {
          const payload = res?.data;
          const policies = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
          const options = policies.flatMap((policy) =>
            (policy.versions || []).map((version) => ({
              id: version.id ?? version.versionId,
              label: `${policy.name || policy.policyCode || policy.policy_code || "Policy"} — v${version.versionNumber ?? version.version_number ?? "?"}`,
            })),
          );
          setPolicyVersionOptions(options);
        })
        .catch(() => setPolicyVersionOptions([]));
    }
  };

  const openEdit = (row) => {
    setEditingId(row.id ?? row.enrollmentId);
    setForm({
      employeeUserId: String(row.employeeUserId ?? row.employee_user_id ?? ""),
      policyVersionId: String(row.policyVersionId ?? row.policy_version_id ?? ""),
      status: row.status || "ACTIVE",
      effectiveFrom: row.effectiveFrom || row.effective_from || "",
      effectiveTo: row.effectiveTo || row.effective_to || "",
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const submit = async () => {
    if (!editingId && !form.employeeUserId) {
      setFormError("Select the employee to enroll.");
      return;
    }
    if (!form.policyVersionId) {
      setFormError("Select the policy version.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        employeeUserId: form.employeeUserId || undefined,
        policyVersionId: form.policyVersionId,
        status: form.status,
        effectiveFrom: form.effectiveFrom || undefined,
        effectiveTo: form.effectiveTo || undefined,
      };
      if (editingId) {
        await mediclaimApi.updateEnrollment(editingId, payload, user?.accessToken, user?.tokenType);
        toast.success("Enrollment updated");
      } else {
        await mediclaimApi.createEnrollment(payload, user?.accessToken, user?.tokenType);
        toast.success("Enrollment created");
      }
      setDrawerOpen(false);
      load();
    } catch (err) {
      setFormError(err?.message || "Failed to save the enrollment.");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { key: "employee", label: "Employee", render: (row) => row.employeeName || row.employee?.name || row.employee_snapshot?.name || "—" },
    { key: "policy", label: "Policy", render: (row) => row.policyName || row.policy?.name || row.policyVersion?.policy?.name || row.policyCode || "—" },
    { key: "status", label: "Status", render: (row) => <Badge variant={String(row.status || "").toLowerCase() === "active" ? "green" : "gray"}>{row.status || "—"}</Badge> },
    { key: "effective", label: "Effective", render: (row) => `${formatClaimDate(row.effectiveFrom || row.effective_from)} – ${formatClaimDate(row.effectiveTo || row.effective_to) || "Ongoing"}` },
    { key: "members", label: "Members", render: (row) => membersOf(row).length },
    {
      key: "actions",
      label: "",
      headerClassName: "text-right",
      className: "text-right",
      render: (row) => canUpdate && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openEdit(row); }}
          className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          Edit
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Every employee enrolled in a Mediclaim policy version, company-wide. Click a row to view covered members.
        </p>
        {canCreate && (
          <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>New Enrollment</Button>
        )}
      </div>

      <ClaimsTable
        columns={columns}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage="No employees are enrolled yet."
        getRowKey={(row) => row.id ?? row.enrollmentId}
        onRowClick={setSelectedEnrollment}
        page={page}
        perPage={PER_PAGE}
        total={state.total}
        onPageChange={setPage}
      />

      <Drawer
        isOpen={Boolean(selectedEnrollment)}
        onClose={() => setSelectedEnrollment(null)}
        title={selectedEnrollment?.employeeName || selectedEnrollment?.employee?.name || "Enrollment"}
        subtitle="Covered family members"
        size="md"
      >
        {selectedEnrollment && (
          <div className="space-y-3">
            <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900/30">
              <p className="text-gray-500 dark:text-gray-400">
                Policy: <span className="font-medium text-gray-800 dark:text-gray-100">{selectedEnrollment.policyName || selectedEnrollment.policy?.name || selectedEnrollment.policyVersion?.policy?.name || selectedEnrollment.policy_version?.policy?.name || "—"}</span>
              </p>
              <p className="mt-1 text-gray-500 dark:text-gray-400">
                Status: <Badge variant={String(selectedEnrollment.status || "").toLowerCase() === "active" ? "green" : "gray"}>{selectedEnrollment.status || "—"}</Badge>
              </p>
            </div>

            {membersOf(selectedEnrollment).length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Users size={28} className="text-gray-300 dark:text-gray-600" />
                <p className="text-sm text-gray-500 dark:text-gray-400">No covered members recorded for this enrollment yet.</p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-gray-100 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500 dark:bg-gray-700/50 dark:text-gray-400">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">Relationship</th>
                      <th className="px-3 py-2 text-left">Date of Birth</th>
                      <th className="px-3 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {membersOf(selectedEnrollment).map((member) => (
                      <tr key={member.id}>
                        <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{member.fullName || member.full_name || member.name}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{member.relationshipType || member.relationship_type}</td>
                        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatClaimDate(member.dateOfBirth || member.date_of_birth)}</td>
                        <td className="px-3 py-2"><Badge variant={member.status === "active" ? "green" : "gray"}>{member.status || "—"}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title={editingId ? "Edit Enrollment" : "New Enrollment"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          {!editingId && (
            <Field label="Employee" required>
              <select className={inputClass} value={form.employeeUserId} onChange={(e) => setForm((f) => ({ ...f, employeeUserId: e.target.value }))}>
                <option value="">— Select employee —</option>
                {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Policy Version" required>
            <select className={inputClass} value={form.policyVersionId} onChange={(e) => setForm((f) => ({ ...f, policyVersionId: e.target.value }))}>
              <option value="">— Select policy version —</option>
              {policyVersionOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className={inputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Effective From">
              <input type="date" className={inputClass} value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
            </Field>
            <Field label="Effective To">
              <input type="date" className={inputClass} value={form.effectiveTo} onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))} />
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
