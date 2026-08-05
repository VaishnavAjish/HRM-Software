import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Check, Plus, Loader2, Send, X, Ban } from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import StatusBadge, { ApprovalChain } from "../../../components/authorization/StatusBadge";
import UserPicker from "../../../components/authorization/UserPicker";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { accessLifecycleApi } from "../../../utils/api";

const inputBase =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const inputClass = `w-full ${inputBase}`;

const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const BLANK = {
  targetUserId: "", permissionCode: "", scopeType: "COMPANY", scopeId: "",
  requestedUntil: "", businessReason: "",
};

export default function AccessRequests() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) return undefined;

    let active = true;

    accessLifecycleApi
      .listRequests(token, tokenType, statusFilter ? { status: statusFilter } : {})
      .then((res) => { if (active) setRequests(res?.data ?? []); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load access requests"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, statusFilter]);

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
      await accessLifecycleApi.createRequest({
        targetUserId: form.targetUserId ? Number(form.targetUserId) : null,
        permissionCode: form.permissionCode || null,
        scopeType: form.scopeType,
        scopeId: form.scopeId || null,
        requestedUntil: form.requestedUntil || null,
        businessReason: form.businessReason,
      }, token, tokenType);

      toast.success("Access request raised");
      setForm(BLANK);
      setShowForm(false);
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not raise the request");
    } finally {
      setSaving(false);
    }
  };

  const decide = async (id, action, prompt) => {
    const decisionReason = window.prompt(prompt);
    if (!decisionReason) return;

    try {
      await accessLifecycleApi.decideRequest(id, action, { decisionReason }, token, tokenType);
      toast.success("Decision recorded");
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not record the decision");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Access Requests</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Ask for access you do not hold. Every request walks a manager, resource owner and security approval.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            className={inputBase}
            value={statusFilter}
            onChange={(event) => { setLoading(true); setStatusFilter(event.target.value); }}
          >
            <option value="">All statuses</option>
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="REVOKED">Revoked</option>
          </select>

          <Button onClick={() => setShowForm((open) => !open)}>
            <Plus size={16} /> New Request
          </Button>
        </div>
      </header>

      {showForm && (
        <Card>
          <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <UserPicker
              label="Access for (leave blank for yourself)"
              value={form.targetUserId}
              onChange={(id) => setForm((current) => ({ ...current, targetUserId: id }))}
              token={token}
              tokenType={tokenType}
            />

            <label className="block">
              <span className={labelClass}>Permission code</span>
              <input
                type="text" className={inputClass} placeholder="hr.employee.read"
                value={form.permissionCode} onChange={set("permissionCode")}
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
              <span className={labelClass}>Needed until</span>
              <input type="datetime-local" className={inputClass} value={form.requestedUntil} onChange={set("requestedUntil")} />
            </label>

            <label className="block sm:col-span-2">
              <span className={labelClass}>Business reason *</span>
              <textarea
                required minLength={10} rows={2} className={inputClass}
                value={form.businessReason} onChange={set("businessReason")}
              />
            </label>

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Submit
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </form>
        </Card>
      )}

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable /></div>}

        {!loading && requests.length === 0 && (
          <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">No access requests yet.</p>
        )}

        {!loading && requests.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  {["Requester", "For", "Asking for", "Scope", "Approvals", "Status", "Actions"].map((head) => (
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
                {requests.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">{row.requesterName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{row.targetName}</td>
                    <td className="px-4 py-3">
                      {row.roleName
                        ? <span className="text-gray-900 dark:text-gray-100">{row.roleName}</span>
                        : <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-700">{row.permissionCode}</code>}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">
                      {row.scopeType}{row.scopeId ? ` · ${row.scopeId}` : ""}
                    </td>
                    <td className="px-4 py-3"><ApprovalChain approvals={row.approvals} /></td>
                    <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1.5">
                        {row.status === "PENDING" && can("admin.access_request.approve") && (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => decide(row.id, "approve", "Why is this approved?")}
                            >
                              <Check size={14} /> Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => decide(row.id, "reject", "Why is this rejected?")}
                            >
                              <X size={14} /> Reject
                            </Button>
                          </>
                        )}
                        {row.status === "APPROVED" && can("admin.access_request.revoke") && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => decide(row.id, "revoke", "Why is this access being revoked?")}
                          >
                            <Ban size={14} /> Revoke
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
    </div>
  );
}
