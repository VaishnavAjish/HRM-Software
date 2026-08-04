import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Ban, Loader2, ShieldAlert, Siren } from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import StatusBadge from "../../../components/authorization/StatusBadge";
import UserPicker from "../../../components/authorization/UserPicker";
import { useAuth } from "../../../context/AuthContext";
import { accessLifecycleApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const BLANK = {
  userId: "", permissionCodes: "", scopeType: "COMPANY", scopeId: "",
  validUntil: "", reason: "",
};

const formatDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
};

export default function EmergencyAccess() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [grants, setGrants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) return undefined;

    let active = true;

    accessLifecycleApi
      .listEmergencyGrants(token, tokenType)
      .then((res) => { if (active) setGrants(res?.data ?? []); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load emergency grants"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType]);

  useEffect(() => load(), [load]);

  const refresh = () => {
    setLoading(true);
    load();
  };

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      await accessLifecycleApi.createEmergencyGrant({
        userId: Number(form.userId),
        permissionCodes: form.permissionCodes.split(",").map((code) => code.trim()).filter(Boolean),
        scopeType: form.scopeType,
        scopeId: form.scopeId || null,
        validUntil: form.validUntil,
        reason: form.reason,
      }, token, tokenType);

      toast.success("Emergency access granted");
      setForm(BLANK);
      setShowForm(false);
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not grant emergency access");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id) => {
    const reason = window.prompt("Why is this grant being revoked?");
    if (!reason) return;

    try {
      await accessLifecycleApi.revokeEmergencyGrant(id, reason, token, tokenType);
      toast.success("Grant revoked");
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not revoke the grant");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Emergency Access</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Time-boxed break-glass grants. Every one expires within 24 hours and is written to the audit log.
          </p>
        </div>
        <Button onClick={() => setShowForm((open) => !open)}>
          <Siren size={16} /> Grant Emergency Access
        </Button>
      </header>

      <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="flex gap-3">
          <ShieldAlert size={18} className="mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Break-glass access bypasses the normal approval chain. Grant it only during an incident,
            name the incident in the reason, and revoke it as soon as the work is done.
          </p>
        </div>
      </Card>

      {showForm && (
        <Card>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <UserPicker
              label="Grant to"
              required
              value={form.userId}
              onChange={(id) => setForm((current) => ({ ...current, userId: id }))}
              token={token}
              tokenType={tokenType}
            />

            <label className="block">
              <span className={labelClass}>Scope type *</span>
              <input type="text" required className={inputClass} value={form.scopeType} onChange={set("scopeType")} />
            </label>

            <label className="block sm:col-span-2">
              <span className={labelClass}>Permission codes (comma separated) *</span>
              <input
                type="text" required className={inputClass}
                placeholder="payroll.payslip.read, hr.employee.read"
                value={form.permissionCodes} onChange={set("permissionCodes")}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Scope id</span>
              <input type="text" className={inputClass} value={form.scopeId} onChange={set("scopeId")} />
            </label>

            <label className="block">
              <span className={labelClass}>Valid until * (24 hours maximum)</span>
              <input type="datetime-local" required className={inputClass} value={form.validUntil} onChange={set("validUntil")} />
            </label>

            <label className="block sm:col-span-2">
              <span className={labelClass}>Incident and reason * (20 characters minimum)</span>
              <textarea
                required minLength={20} rows={3} className={inputClass}
                value={form.reason} onChange={set("reason")}
              />
            </label>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" variant="danger" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Siren size={16} />}
                Grant
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable /></div>}

        {!loading && grants.length === 0 && (
          <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">No emergency grants recorded.</p>
        )}

        {!loading && grants.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  {["Holder", "Approved by", "Permissions", "Window", "Status", "Actions"].map((head) => (
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
                {grants.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{row.holderName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.approverName || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {row.permissionCodes.map((code) => (
                          <code key={code} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">
                            {code}
                          </code>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {formatDate(row.validFrom)} – {formatDate(row.validUntil)}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-right">
                      {row.status === "ACTIVE" && (
                        <Button size="sm" variant="outline" onClick={() => revoke(row.id)}>
                          <Ban size={14} /> Revoke
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
