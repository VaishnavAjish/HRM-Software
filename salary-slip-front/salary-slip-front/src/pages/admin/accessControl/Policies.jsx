import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, Loader2, Save, Send, Undo2, Pencil } from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import StatusBadge from "../../../components/authorization/StatusBadge";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { policyApi } from "../../../utils/api";

const inputBase =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const inputClass = `w-full ${inputBase}`;

const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const BLANK = {
  code: "", name: "", description: "", effect: "ALLOW", actions: "", resources: "",
  scopeType: "COMPANY", scopeId: "", priority: 100, validFrom: "", validUntil: "",
  auditRequired: false, businessReason: "",
};

const asList = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);

export default function Policies() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [dialog, setDialog] = useState(null);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) return undefined;

    let active = true;

    policyApi
      .list(token, tokenType, statusFilter ? { status: statusFilter } : {})
      .then((res) => { if (active) setPolicies(res?.data ?? []); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load policies"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, statusFilter]);

  useEffect(() => load(), [load]);

  const refresh = () => {
    setLoading(true);
    load();
  };

  const set = (field) => (event) =>
    setForm((current) => ({
      ...current,
      [field]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));

  const openCreate = () => {
    setForm(BLANK);
    setDetail(null);
    setDialog("create");
  };

  const openEdit = async (policy) => {
    try {
      const res = await policyApi.get(policy.id, token, tokenType);
      const data = res?.data;
      setDetail(data);
      setForm({
        code: data.code,
        name: data.name,
        description: data.description ?? "",
        effect: data.effect,
        actions: (data.actions ?? []).join(", "),
        resources: (data.resources ?? []).join(", "),
        scopeType: data.scopeType,
        scopeId: data.scopeId ?? "",
        priority: data.priority,
        validFrom: data.validFrom ? String(data.validFrom).slice(0, 16) : "",
        validUntil: data.validUntil ? String(data.validUntil).slice(0, 16) : "",
        auditRequired: Boolean(data.auditRequired),
        businessReason: "",
      });
      setDialog("edit");
    } catch (err) {
      toast.error(err.message || "Could not load the policy");
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);

    const payload = {
      name: form.name,
      description: form.description || null,
      effect: form.effect,
      actions: asList(form.actions),
      resources: asList(form.resources),
      scopeType: form.scopeType,
      scopeId: form.scopeId || null,
      priority: Number(form.priority) || 100,
      validFrom: form.validFrom || null,
      validUntil: form.validUntil || null,
      auditRequired: form.auditRequired,
      businessReason: form.businessReason || null,
    };

    try {
      if (dialog === "create") {
        await policyApi.create({ ...payload, code: form.code }, token, tokenType);
        toast.success("Policy created as a draft");
      } else {
        await policyApi.update(detail.id, payload, token, tokenType);
        toast.success("Policy updated — it returns to draft until republished");
      }

      setDialog(null);
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not save the policy");
    } finally {
      setSaving(false);
    }
  };

  const publish = async (policy) => {
    const reason = window.prompt("Why is this policy being published? (10 characters minimum)");
    if (!reason) return;

    try {
      await policyApi.publish(policy.id, reason, token, tokenType);
      toast.success("Policy published");
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not publish the policy");
    }
  };

  const rollback = async (policy) => {
    const version = window.prompt(`Roll back to which version? (current is ${policy.version})`);
    if (!version) return;

    const reason = window.prompt("Why is this policy being rolled back? (10 characters minimum)");
    if (!reason) return;

    try {
      await policyApi.rollback(policy.id, Number(version), reason, token, tokenType);
      toast.success("Policy rolled back to a new draft");
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not roll the policy back");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Policies</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Rules the authorization engine evaluates after roles. Only published policies take effect.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className={inputBase}
            value={statusFilter}
            onChange={(event) => { setLoading(true); setStatusFilter(event.target.value); }}
          >
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="ARCHIVED">Archived</option>
          </select>

          {can("admin.policy.create") && (
            <Button onClick={openCreate}><Plus size={16} /> New Policy</Button>
          )}
        </div>
      </header>

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable /></div>}

        {!loading && policies.length === 0 && (
          <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">No policies yet.</p>
        )}

        {!loading && policies.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  {["Code", "Name", "Effect", "Scope", "Priority", "Version", "Status", "Actions"].map((head) => (
                    <th
                      key={head}
                      scope="col"
                      className={`px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 ${head === "Actions" ? "text-right" : ""}`}
                    >
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.id} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{policy.code}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{policy.name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={policy.effect === "DENY" ? "red" : "green"}>{policy.effect}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {policy.scopeType}{policy.scopeId ? ` · ${policy.scopeId}` : ""}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{policy.priority}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">v{policy.version}</td>
                    <td className="px-4 py-3"><StatusBadge status={policy.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {can("admin.policy.update") && policy.status !== "ARCHIVED" && (
                          <Button size="sm" variant="outline" onClick={() => openEdit(policy)}>
                            <Pencil size={14} /> Edit
                          </Button>
                        )}
                        {can("admin.policy.publish") && policy.status !== "PUBLISHED" && (
                          <Button size="sm" variant="secondary" onClick={() => publish(policy)}>
                            <Send size={14} /> Publish
                          </Button>
                        )}
                        {can("admin.policy.rollback") && policy.version > 1 && (
                          <Button size="sm" variant="outline" onClick={() => rollback(policy)}>
                            <Undo2 size={14} /> Roll back
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog && (
        <Modal
          isOpen
          onClose={() => setDialog(null)}
          size="xl"
          title={dialog === "create" ? "New policy" : `Edit ${detail?.code}`}
        >
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            {dialog === "create" && (
              <label className="block">
                <span className={labelClass}>Code *</span>
                <input
                  type="text" required className={inputClass}
                  pattern="[a-z0-9._-]+" placeholder="payroll.export.restrict"
                  value={form.code} onChange={set("code")}
                />
              </label>
            )}

            <label className="block">
              <span className={labelClass}>Name *</span>
              <input type="text" required className={inputClass} value={form.name} onChange={set("name")} />
            </label>

            <label className="block sm:col-span-2">
              <span className={labelClass}>Description</span>
              <textarea rows={2} className={inputClass} value={form.description} onChange={set("description")} />
            </label>

            <label className="block">
              <span className={labelClass}>Effect *</span>
              <select className={inputClass} value={form.effect} onChange={set("effect")}>
                <option value="ALLOW">Allow</option>
                <option value="DENY">Deny</option>
              </select>
            </label>

            <label className="block">
              <span className={labelClass}>Priority</span>
              <input type="number" min={1} max={1000} className={inputClass} value={form.priority} onChange={set("priority")} />
            </label>

            <label className="block sm:col-span-2">
              <span className={labelClass}>Actions (comma separated) *</span>
              <input
                type="text" required className={inputClass} placeholder="read, export"
                value={form.actions} onChange={set("actions")}
              />
            </label>

            <label className="block sm:col-span-2">
              <span className={labelClass}>Resources (comma separated) *</span>
              <input
                type="text" required className={inputClass} placeholder="hr.employee, payroll.payslip"
                value={form.resources} onChange={set("resources")}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Scope type *</span>
              <input type="text" required className={inputClass} value={form.scopeType} onChange={set("scopeType")} />
            </label>

            <label className="block">
              <span className={labelClass}>Scope id</span>
              <input type="text" className={inputClass} value={form.scopeId} onChange={set("scopeId")} />
            </label>

            <label className="block">
              <span className={labelClass}>Valid from</span>
              <input type="datetime-local" className={inputClass} value={form.validFrom} onChange={set("validFrom")} />
            </label>

            <label className="block">
              <span className={labelClass}>Valid until</span>
              <input type="datetime-local" className={inputClass} value={form.validUntil} onChange={set("validUntil")} />
            </label>

            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={form.auditRequired}
                onChange={set("auditRequired")}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">Require an audit entry on every decision</span>
            </label>

            <label className="block sm:col-span-2">
              <span className={labelClass}>Reason for this change</span>
              <textarea rows={2} className={inputClass} value={form.businessReason} onChange={set("businessReason")} />
            </label>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {dialog === "create" ? "Create draft" : "Save"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
