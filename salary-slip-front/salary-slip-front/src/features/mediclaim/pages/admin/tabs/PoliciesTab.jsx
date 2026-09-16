import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { useCompany } from "../../../../../context/CompanyContext";
import Drawer from "../../../../../components/ui/Drawer";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import ClaimsTable from "../../../components/ClaimsTable";
import { formatClaimDate } from "../../../utils/formatters";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const PER_PAGE = 15;

const EMPTY_FORM = {
  policyCode: "",
  companyCode: "",
  name: "",
  status: "ACTIVE",
  floaterLimitAmount: "300000",
  maxCoveredChildren: "2",
  childMaxAgeYears: "18",
  parentMaxAgeYears: "55",
  intimationRequiredForPlanned: true,
};

/**
 * Policy administration — the top-level policy record plus its versioned
 * rules JSON (see the backend plan's B1/B2: `{floater_limit_amount,
 * max_covered_children, child_max_age_years, parent_max_age_years,
 * intimation_required_for_planned}`). Create/update sends this rules shape
 * alongside the policy identity fields; version publish is a separate action
 * against whichever version is currently in `draft`.
 */
export default function PoliciesTab() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const { can } = useMediclaimAuthorization();

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [result, setResult] = useState({ key: null, rows: [], total: 0, error: null });
  const [page, setPage] = useState(1);
  const [selectedPolicy, setSelectedPolicy] = useState(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [syncedRows, setSyncedRows] = useState(result.rows);
  const requestKey = `${accessToken ?? ""}|${tokenType ?? ""}|${page}|${reloadToken}`;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [publishingId, setPublishingId] = useState(null);

  const canCreate = can("mediclaim.policy.create");
  const canUpdate = can("mediclaim.policy.update");
  const canPublish = can("mediclaim.policy.publish");

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.policies({ page, perPage: PER_PAGE }, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        const total = payload?.total ?? rows.length;
        setResult({ key: requestKey, rows, total, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setResult({ key: requestKey, rows: [], total: 0, error: err?.message || "Failed to load policies." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, page, requestKey]);

  if (syncedRows !== result.rows) {
    setSyncedRows(result.rows);
    if (selectedPolicy) {
      const refreshed = result.rows.find((r) => (r.id ?? r.policyId) === (selectedPolicy.id ?? selectedPolicy.policyId));
      if (refreshed) setSelectedPolicy(refreshed);
    }
  }

  const loading = result.key !== requestKey;
  const state = { loading, rows: result.rows, total: result.total, error: loading ? null : result.error };

  const load = () => setReloadToken((n) => n + 1);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, companyCode: companyScope?.companyId || "" });
    setFormError(null);
    setDrawerOpen(true);
  };

  const openEdit = (row) => {
    const rules = row.rules || row.currentVersion?.rules || {};
    setEditingId(row.id ?? row.policyId);
    setForm({
      policyCode: row.policyCode || row.policy_code || "",
      companyCode: row.companyCode || row.company_code || companyScope?.companyId || "",
      name: row.name || "",
      status: row.status || "ACTIVE",
      floaterLimitAmount: String(rules.floaterLimitAmount ?? rules.floater_limit_amount ?? "300000"),
      maxCoveredChildren: String(rules.maxCoveredChildren ?? rules.max_covered_children ?? "2"),
      childMaxAgeYears: String(rules.childMaxAgeYears ?? rules.child_max_age_years ?? "18"),
      parentMaxAgeYears: String(rules.parentMaxAgeYears ?? rules.parent_max_age_years ?? "55"),
      intimationRequiredForPlanned: rules.intimationRequiredForPlanned ?? rules.intimation_required_for_planned ?? true,
    });
    setFormError(null);
    setDrawerOpen(true);
  };

  const submit = async () => {
    if (!form.policyCode.trim()) {
      setFormError("Policy code is required.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Policy name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    const payload = {
      policyCode: form.policyCode.trim(),
      companyCode: form.companyCode || undefined,
      name: form.name.trim(),
      status: form.status,
      rules: {
        floaterLimitAmount: Number(form.floaterLimitAmount) || 0,
        maxCoveredChildren: Number(form.maxCoveredChildren) || 0,
        childMaxAgeYears: Number(form.childMaxAgeYears) || 0,
        parentMaxAgeYears: Number(form.parentMaxAgeYears) || 0,
        intimationRequiredForPlanned: Boolean(form.intimationRequiredForPlanned),
      },
    };

    try {
      if (editingId) {
        await mediclaimApi.updatePolicy(editingId, payload, user?.accessToken, user?.tokenType);
        toast.success("Policy updated");
      } else {
        await mediclaimApi.createPolicy(payload, user?.accessToken, user?.tokenType);
        toast.success("Policy created");
      }
      setDrawerOpen(false);
      load();
    } catch (err) {
      setFormError(err?.message || "Failed to save the policy.");
    } finally {
      setSaving(false);
    }
  };

  const publishVersion = async (policyId, versionId) => {
    setPublishingId(versionId);
    try {
      await mediclaimApi.publishPolicyVersion(policyId, versionId, user?.accessToken, user?.tokenType);
      toast.success("Policy version published");
      load();
    } catch (err) {
      toast.error(err?.message || "Failed to publish this policy version.");
    } finally {
      setPublishingId(null);
    }
  };

  const columns = [
    { key: "policyCode", label: "Code", render: (row) => row.policyCode || row.policy_code || "—" },
    { key: "name", label: "Name", render: (row) => row.name || "—" },
    { key: "company", label: "Company", render: (row) => row.companyCode || row.company_code || "—" },
    { key: "status", label: "Status", render: (row) => <Badge variant={String(row.status || "").toLowerCase() === "active" ? "green" : "gray"}>{row.status || "—"}</Badge> },
    { key: "versions", label: "Versions", render: (row) => (row.versions || []).length },
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
          Mediclaim policies and their versioned rules. Click a row to view and publish versions.
        </p>
        {canCreate && <Button size="sm" icon={<Plus size={14} />} onClick={openCreate}>New Policy</Button>}
      </div>

      <ClaimsTable
        columns={columns}
        rows={state.rows}
        loading={state.loading}
        error={state.error}
        emptyMessage="No Mediclaim policies have been created yet."
        getRowKey={(row) => row.id ?? row.policyId}
        onRowClick={setSelectedPolicy}
        page={page}
        perPage={PER_PAGE}
        total={state.total}
        onPageChange={setPage}
      />

      <Drawer
        isOpen={Boolean(selectedPolicy)}
        onClose={() => setSelectedPolicy(null)}
        title={selectedPolicy?.name || "Policy Versions"}
        subtitle={selectedPolicy?.policyCode || selectedPolicy?.policy_code}
        size="md"
      >
        {selectedPolicy && (
          (selectedPolicy.versions || []).length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">No versions recorded for this policy yet.</p>
          ) : (
            <div className="space-y-2">
              {(selectedPolicy.versions || []).map((version) => {
                const versionId = version.id ?? version.versionId;
                const versionStatus = String(version.status || "").toLowerCase();
                return (
                  <div key={versionId} className="flex items-center justify-between gap-2 rounded-lg border border-gray-100 px-3 py-2 text-sm dark:border-gray-700">
                    <div>
                      <p className="font-medium text-gray-800 dark:text-gray-100">
                        v{version.versionNumber ?? version.version_number}
                        <Badge className="ml-2" variant={versionStatus === "published" ? "green" : versionStatus === "archived" ? "gray" : "yellow"}>
                          {version.status || "—"}
                        </Badge>
                      </p>
                      <p className="text-xs text-gray-400">
                        Effective {formatClaimDate(version.effectiveFrom || version.effective_from)}
                        {(version.effectiveTo || version.effective_to) ? ` – ${formatClaimDate(version.effectiveTo || version.effective_to)}` : ""}
                      </p>
                    </div>
                    {canPublish && versionStatus === "draft" && (
                      <Button size="sm" variant="secondary" disabled={publishingId === versionId} onClick={() => publishVersion(selectedPolicy.id ?? selectedPolicy.policyId, versionId)}>
                        {publishingId === versionId ? "Publishing…" : "Publish"}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )
        )}
      </Drawer>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => !saving && setDrawerOpen(false)}
        title={editingId ? "Edit Policy" : "New Policy"}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Policy Code" required>
              <input className={inputClass} value={form.policyCode} onChange={(e) => setForm((f) => ({ ...f, policyCode: e.target.value }))} disabled={Boolean(editingId)} />
            </Field>
            <Field label="Company Code">
              <input className={inputClass} value={form.companyCode} onChange={(e) => setForm((f) => ({ ...f, companyCode: e.target.value }))} />
            </Field>
          </div>
          <Field label="Name" required>
            <input className={inputClass} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Status">
            <select className={inputClass} value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </select>
          </Field>

          <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">Current Version Rules</p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Floater Limit (₹)">
              <input type="number" min="0" className={inputClass} value={form.floaterLimitAmount} onChange={(e) => setForm((f) => ({ ...f, floaterLimitAmount: e.target.value }))} />
            </Field>
            <Field label="Max Covered Children">
              <input type="number" min="0" className={inputClass} value={form.maxCoveredChildren} onChange={(e) => setForm((f) => ({ ...f, maxCoveredChildren: e.target.value }))} />
            </Field>
            <Field label="Child Max Age (yrs)">
              <input type="number" min="0" className={inputClass} value={form.childMaxAgeYears} onChange={(e) => setForm((f) => ({ ...f, childMaxAgeYears: e.target.value }))} />
            </Field>
            <Field label="Parent Max Age (yrs)">
              <input type="number" min="0" className={inputClass} value={form.parentMaxAgeYears} onChange={(e) => setForm((f) => ({ ...f, parentMaxAgeYears: e.target.value }))} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
            <input
              type="checkbox"
              checked={Boolean(form.intimationRequiredForPlanned)}
              onChange={(e) => setForm((f) => ({ ...f, intimationRequiredForPlanned: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
            />
            Intimation required for planned admissions
          </label>

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
