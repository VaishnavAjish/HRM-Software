import { useEffect, useState } from "react";
import { Users, ShieldCheck, Clock, IdCard, Sparkles, Search, RotateCcw } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import Drawer from "../../../../../components/ui/Drawer";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import MediclaimIdCard from "../../../components/MediclaimIdCard";
import { getEmployeePhotoUrl } from "../../../../../pages/admin/AdminModals/employee-helpers";
import { formatClaimDate } from "../../../utils/formatters";

// NOTE: this is the Mediclaim admin workspace's Employees tab
// (`src/features/mediclaim/pages/admin/tabs/EmployeesTab.jsx`) — an
// unrelated file of the same name exists under
// `src/pages/admin/hr/onboarding/EmployeesTab.jsx` for onboarding. The two
// are not connected in any way.

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const DEFAULT_PER_PAGE = 15;

const EMPTY_FORM = {
  policyVersionId: "",
  status: "ACTIVE",
  effectiveFrom: "",
  effectiveTo: "",
};

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "not_eligible", label: "Not Eligible" },
  { key: "pending", label: "Pending" },
  { key: "completed", label: "Completed" },
];

const STATUS_META = {
  not_eligible: { label: "Not Eligible", variant: "gray" },
  pending: { label: "Pending", variant: "yellow" },
  completed: { label: "Completed", variant: "green" },
};

function memberName(member) {
  return member?.fullName || member?.full_name || member?.name || "";
}

function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status || "—", variant: "gray" };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/**
 * Company-wide Mediclaim status across every active employee — driven by
 * `mediclaimApi.adminEmployees()` (`Admin\EmployeeController::index()`),
 * which starts from the `users` table itself rather than only listing
 * employees who already happen to have a `mediclaim_enrollments` row.
 * Enrollment (and the employee's own "self" member + card) is now
 * provisioned lazily the first time an eligible employee actually uses the
 * self-service module, so most eligible-but-untouched employees have no
 * enrollment at all yet — `mediclaimStatus` (not_eligible | pending |
 * completed) is what actually drives this screen, not enrollment existence.
 *
 * Clicking a row opens the full employee detail — coverage window, every
 * covered family member (including the auto-created "self" row), issued
 * cards, and change-request history — via `adminEmployeeDetail()`.
 */
export default function EmployeesTab() {
  const { user } = useAuth();
  const { can } = useMediclaimAuthorization();

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null, departments: [], statusCounts: {} });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PER_PAGE);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const requestKey = JSON.stringify([
    accessToken ?? "", tokenType ?? "", page, perPage, statusFilter, debouncedSearch, departmentFilter, reloadToken,
  ]);

  // Debounce the search box so typing doesn't fire a request per keystroke —
  // the backend re-scans every company-scoped employee on each call (see
  // `Admin\EmployeeController::index()`'s docblock on why status can't be
  // pushed into SQL), so this matters more here than on a plain DB query.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const [detail, setDetail] = useState({ open: false, loading: false, data: null, error: null, employeeName: "" });

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);

  const [policyVersionOptions, setPolicyVersionOptions] = useState([]);
  const [bulkIssuing, setBulkIssuing] = useState(false);

  const canIssue = can("mediclaim.enrollment.create");
  const canUpdate = can("mediclaim.enrollment.update");

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.adminEmployees(
      {
        page,
        perPage,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: debouncedSearch || undefined,
        department: departmentFilter || undefined,
      },
      accessToken,
      tokenType,
    )
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        const departments = Array.isArray(payload?.departments) ? payload.departments : [];
        const statusCounts = payload?.statusCounts && typeof payload.statusCounts === "object" ? payload.statusCounts : {};
        setResult({ key: requestKey, rows, total, error: null, departments, statusCounts });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load employees.", departments: [], statusCounts: {} });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, page, perPage, statusFilter, debouncedSearch, departmentFilter, requestKey]);

  const loading = result.key !== requestKey;
  const state = { loading, rows: result.rows, total: result.total, error: loading ? null : result.error };
  const departmentOptions = result.departments;
  const statusCounts = result.statusCounts;
  const hasActiveFilters = statusFilter !== "all" || Boolean(search) || Boolean(departmentFilter);

  const resetFilters = () => {
    setStatusFilter("all");
    setSearch("");
    setDepartmentFilter("");
    setPage(1);
  };

  const load = () => setReloadToken((n) => n + 1);

  const openDetail = (row) => {
    setDetail({ open: true, loading: true, data: null, error: null, employeeName: row.name });
    mediclaimApi.adminEmployeeDetail(row.id, user?.accessToken, user?.tokenType)
      .then((res) => setDetail((prev) => ({ ...prev, loading: false, data: res?.data, error: null })))
      .catch((err) => setDetail((prev) => ({ ...prev, loading: false, error: err?.message || "Failed to load employee details." })));
  };

  // Provisions coverage + a card for every eligible employee, company-wide,
  // right now — rather than waiting for each one to individually open the
  // module. Safe to run more than once: already-provisioned employees are
  // cheap no-ops on the backend.
  const runBulkIssue = async () => {
    setBulkIssuing(true);
    try {
      const res = await mediclaimApi.bulkIssueEmployeeCards(user?.accessToken, user?.tokenType);
      const summary = res?.data || {};
      toast.success(
        `Processed ${summary.processed ?? 0}: ${summary.issued ?? 0} issued now, `
        + `${summary.alreadyIssued ?? 0} already had a card`
        + (summary.failed ? `, ${summary.failed} failed (see Audit History)` : "")
      );
      load();
    } catch (err) {
      toast.error(err?.message || "Failed to issue Mediclaim cards.");
    } finally {
      setBulkIssuing(false);
    }
  };

  // Enrollment is now provisioned automatically the first time an eligible
  // employee opens the module (see `PolicyEligibilityService::
  // resolveOrCreateEnrollment()`), so there's no "New Enrollment" creation
  // flow here anymore — this drawer only ever edits an enrollment that
  // already exists, opened from within the employee detail panel below.
  const openEditEnrollment = (enrollment) => {
    setEditingId(enrollment.id ?? enrollment.enrollmentId);
    setForm({
      policyVersionId: String(enrollment.policyVersionId ?? enrollment.policy_version_id ?? ""),
      status: enrollment.status || "ACTIVE",
      effectiveFrom: enrollment.effectiveFrom || enrollment.effective_from || "",
      effectiveTo: enrollment.effectiveTo || enrollment.effective_to || "",
    });
    setFormError(null);
    setDrawerOpen(true);

    if (user?.accessToken) {
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

  const submit = async () => {
    if (!form.policyVersionId) {
      setFormError("Select the policy version.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        policyVersionId: form.policyVersionId,
        status: form.status,
        effectiveFrom: form.effectiveFrom || undefined,
        effectiveTo: form.effectiveTo || undefined,
      };
      await mediclaimApi.updateEnrollment(editingId, payload, user?.accessToken, user?.tokenType);
      toast.success("Enrollment updated");
      setDrawerOpen(false);
      load();
      if (detail.open && detail.data?.employee?.id) {
        openDetail({ id: detail.data.employee.id, name: detail.employeeName });
      }
    } catch (err) {
      setFormError(err?.message || "Failed to save the enrollment.");
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    {
      key: "employee",
      label: "Employee",
      render: (row) => (
        <div>
          <p className="font-medium text-gray-900 dark:text-white">{row.name || "—"}</p>
          <p className="text-xs text-gray-400">{row.empCode} {row.department ? `· ${row.department}` : ""}</p>
        </div>
      ),
    },
    { key: "status", label: "Status", render: (row) => <StatusBadge status={row.mediclaimStatus} /> },
    {
      key: "eligibility",
      label: "Eligibility",
      render: (row) => row.eligibility?.eligible
        ? <span className="text-xs text-gray-500 dark:text-gray-400">Since {formatClaimDate(row.eligibility?.eligible_from)}</span>
        : <span className="text-xs text-amber-600 dark:text-amber-400">{row.eligibility?.days_remaining ?? 0} day(s) left</span>,
    },
    { key: "members", label: "Members", render: (row) => row.activeMembersCount ?? 0 },
    {
      key: "policy",
      label: "Policy",
      render: (row) => row.enrollment?.policyVersion?.policy?.name || row.enrollment?.policy_version?.policy?.name || "—",
    },
  ];

  const headerContent = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search name, code, email…"
            className="w-full rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>

        <select
          value={departmentFilter}
          onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2.5 py-1.5 text-xs text-gray-700 dark:text-gray-200"
        >
          <option value="">All Departments</option>
          {departmentOptions.map((dept) => (
            <option key={dept} value={dept}>{dept}</option>
          ))}
        </select>

        <div className="mx-1 hidden h-5 w-px bg-gray-200 dark:bg-white/10 sm:block" />

        <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/50">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setStatusFilter(tab.key); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                statusFilter === tab.key
                  ? "bg-white text-brand-600 shadow-sm dark:bg-gray-800 dark:text-brand-400"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400"
              }`}
            >
              {tab.label} ({statusCounts[tab.key] ?? 0})
            </button>
          ))}
        </div>

        {hasActiveFilters && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-white/5"
          >
            <RotateCcw size={12} /> Reset
          </button>
        )}
      </div>

      {canIssue && (
        <Button
          size="sm"
          variant="secondary"
          icon={<Sparkles size={14} />}
          onClick={runBulkIssue}
          disabled={bulkIssuing}
        >
          {bulkIssuing ? "Issuing…" : "Issue Mediclaim to All Eligible Employees"}
        </Button>
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ClaimsTable
        columns={columns}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage="No employees match this filter."
        headerContent={headerContent}
        getRowKey={(row) => row.id}
        onRowClick={openDetail}
        page={page}
        perPage={perPage}
        total={state.total}
        onPageChange={setPage}
        onPageSizeChange={(size) => { setPerPage(size); setPage(1); }}
        fillHeight
      />

      <Drawer
        isOpen={detail.open}
        onClose={() => setDetail({ open: false, loading: false, data: null, error: null, employeeName: "" })}
        title={detail.employeeName || "Employee"}
        subtitle="Mediclaim profile"
        size="lg"
      >
        {detail.loading ? (
          <p className="py-10 text-center text-sm text-gray-400">Loading…</p>
        ) : detail.error ? (
          <p className="py-10 text-center text-sm text-red-500">{detail.error}</p>
        ) : detail.data ? (
          <EmployeeDetailPanel
            data={detail.data}
            canUpdate={canUpdate}
            onEditEnrollment={openEditEnrollment}
          />
        ) : null}
      </Drawer>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title="Edit Enrollment"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
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

function EmployeeDetailPanel({ data, canUpdate, onEditEnrollment }) {
  const employee = data.employee || {};
  const enrollment = data.enrollment;
  const members = data.members || [];
  const cards = data.cards || [];
  const changeRequests = data.changeRequests || [];
  const eligibility = employee.eligibility;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs dark:border-gray-700 dark:bg-gray-900/30">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{employee.name}</p>
          <StatusBadge status={employee.mediclaimStatus} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-gray-500 dark:text-gray-400 sm:grid-cols-3">
          <p>Code: <span className="text-gray-700 dark:text-gray-200">{employee.empCode || "—"}</span></p>
          <p>Department: <span className="text-gray-700 dark:text-gray-200">{employee.department || "—"}</span></p>
          <p>Designation: <span className="text-gray-700 dark:text-gray-200">{employee.designation || "—"}</span></p>
          <p>Company: <span className="text-gray-700 dark:text-gray-200">{employee.companyCode || "—"}</span></p>
          <p>Joined: <span className="text-gray-700 dark:text-gray-200">{formatClaimDate(employee.joiningDate) || "—"}</span></p>
          <p>Mobile: <span className="text-gray-700 dark:text-gray-200">{employee.mobileNumber || "—"}</span></p>
        </div>
        {eligibility && !eligibility.eligible && (
          <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-amber-50 px-2 py-1.5 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            <Clock size={12} />
            Becomes eligible in {eligibility.days_remaining} day(s), on {formatClaimDate(eligibility.eligible_from)}.
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <ShieldCheck size={15} /> Coverage
          </p>
          {enrollment && canUpdate && (
            <button
              type="button"
              onClick={() => onEditEnrollment(enrollment)}
              className="text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400"
            >
              Edit Enrollment
            </button>
          )}
        </div>
        {enrollment ? (
          <div className="rounded-xl border border-gray-100 bg-white p-3 text-xs dark:border-gray-700 dark:bg-gray-800">
            <p className="text-gray-500 dark:text-gray-400">
              Policy: <span className="font-medium text-gray-800 dark:text-gray-100">
                {enrollment.policyVersion?.policy?.name || enrollment.policy_version?.policy?.name || "—"}
              </span>
            </p>
            <p className="mt-1 text-gray-500 dark:text-gray-400">
              Status: <Badge variant={String(enrollment.status || "").toLowerCase() === "active" ? "green" : "gray"}>{enrollment.status || "—"}</Badge>
              <span className="ml-3">Enrolled: {formatClaimDate(enrollment.enrolledAt || enrollment.enrolled_at)}</span>
            </p>
          </div>
        ) : (
          <p className="text-xs text-gray-400">No enrollment on file yet — coverage begins automatically once the employee opens the Mediclaim module.</p>
        )}
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <Users size={15} /> Family Members ({members.length})
        </p>
        {members.length === 0 ? (
          <p className="text-xs text-gray-400">No covered members recorded yet.</p>
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
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{memberName(member)}</td>
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

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <IdCard size={15} /> Mediclaim Cards ({cards.length})
        </p>
        {cards.length === 0 ? (
          <p className="text-xs text-gray-400">No card issued yet. A card for the employee is generated automatically once they submit their family member details.</p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {cards.map((card) => {
              const member = members.find((m) => String(m.id) === String(card.memberId || card.member_id));
              const relationship = member?.relationshipType || member?.relationship_type || "";
              const isSelf = String(relationship).toLowerCase() === "self";
              return (
                <MediclaimIdCard
                  key={card.id}
                  card={card}
                  name={member ? memberName(member) : "—"}
                  relationship={relationship}
                  photoUrl={isSelf ? getEmployeePhotoUrl(employee.photo) : ""}
                  // Every family member's card carries the sponsoring
                  // employee's own code, not just the self card — that's
                  // what HR/hospitals actually look coverage up by.
                  employeeCode={employee.empCode}
                  companyCode={employee.companyCode}
                  department={isSelf ? employee.department : undefined}
                  designation={isSelf ? employee.designation : undefined}
                />
              );
            })}
          </div>
        )}
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Change Request History</p>
        {changeRequests.length === 0 ? (
          <p className="text-xs text-gray-400">No changes submitted yet.</p>
        ) : (
          <div className="space-y-1.5">
            {changeRequests.map((request) => (
              <div key={request.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-xs dark:border-gray-700">
                <div>
                  <p className="font-medium text-gray-800 dark:text-gray-100">
                    {request.requestType || request.request_type} — {
                      request.proposedValues?.full_name || request.proposed_values?.full_name
                        || memberName(request.member) || "—"
                    }
                  </p>
                  <p className="text-gray-400">{formatClaimDate(request.createdAt || request.created_at)}</p>
                </div>
                <Badge variant={request.status === "approved" ? "green" : request.status === "rejected" ? "red" : "yellow"}>{request.status || "—"}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
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
