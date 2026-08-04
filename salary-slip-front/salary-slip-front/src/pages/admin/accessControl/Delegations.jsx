import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Ban, Plus, Loader2, UserCheck } from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import StatusBadge from "../../../components/authorization/StatusBadge";
import UserPicker from "../../../components/authorization/UserPicker";
import { useAuth } from "../../../context/AuthContext";
import { accessLifecycleApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const BLANK = {
  delegateId: "", permissionCodes: "", scopeType: "COMPANY", scopeId: "",
  validFrom: "", validUntil: "", reason: "",
};

export default function Delegations() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) return undefined;
    let active = true;

    accessLifecycleApi
      .listDelegations(token, tokenType)
      .then((res) => { if (active) setDelegations(res?.data ?? []); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load delegations"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType]);

  useEffect(() => load(), [load]);

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      await accessLifecycleApi.createDelegation({
        delegateId: Number(form.delegateId),
        permissionCodes: form.permissionCodes.split(",").map((c) => c.trim()).filter(Boolean),
        scopeType: form.scopeType,
        scopeId: form.scopeId || null,
        validFrom: form.validFrom,
        validUntil: form.validUntil,
        reason: form.reason,
      }, token, tokenType);

      toast.success("Delegation created");
      setForm(BLANK);
      setShowForm(false);
      setLoading(true);
      load();
    } catch (err) {
      toast.error(err.message || "Could not create the delegation");
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id) => {
    const reason = window.prompt("Why is this delegation being revoked?");
    if (!reason) return;

    try {
      await accessLifecycleApi.revokeDelegation(id, reason, token, tokenType);
      toast.success("Delegation revoked");
      setLoading(true);
      load();
    } catch (err) {
      toast.error(err.message || "Could not revoke the delegation");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Delegations</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Hand your own access to someone else for a fixed period. You cannot delegate what you do not hold.
          </p>
        </div>
        <Button onClick={() => setShowForm((open) => !open)}>
          <Plus size={16} className="mr-2" /> New Delegation
        </Button>
      </header>

      {showForm && (
        <Card>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <UserPicker
              label="Delegate"
              required
              value={form.delegateId}
              onChange={(id) => setForm((f) => ({ ...f, delegateId: id }))}
              token={token}
              tokenType={tokenType}
            />

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Scope type</span>
              <input type="text" required className={inputClass} value={form.scopeType} onChange={set("scopeType")} />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Permission codes (comma separated)
              </span>
              <input
                type="text" required className={inputClass}
                placeholder="hr.employee.read, hr.employee.update"
                value={form.permissionCodes} onChange={set("permissionCodes")}
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Valid from</span>
              <input type="datetime-local" required className={inputClass} value={form.validFrom} onChange={set("validFrom")} />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Valid until</span>
              <input type="datetime-local" required className={inputClass} value={form.validUntil} onChange={set("validUntil")} />
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">Reason</span>
              <textarea required minLength={10} rows={2} className={inputClass} value={form.reason} onChange={set("reason")} />
            </label>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="mr-2 animate-spin" /> : <UserCheck size={16} className="mr-2" />}
                Create
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable /></div>}

        {!loading && delegations.length === 0 && (
          <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">No delegations yet.</p>
        )}

        {!loading && delegations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">From</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">To</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Permissions</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Window</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {delegations.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{row.delegatorName}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{row.delegateName}</td>
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
                      {new Date(row.validFrom).toLocaleDateString()} – {new Date(row.validUntil).toLocaleDateString()}
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
