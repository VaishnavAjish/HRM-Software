import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Ban, Check, Loader2, X } from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import StatusBadge from "../../../components/authorization/StatusBadge";
import { useAuth } from "../../../context/AuthContext";
import { accessLifecycleApi } from "../../../utils/api";

export default function MyDelegations() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [delegations, setDelegations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(() => {
    if (!token) return undefined;
    let active = true;

    accessLifecycleApi
      .myDelegations(token, tokenType)
      .then((res) => { if (active) setDelegations(res?.data ?? []); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load your delegations"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType]);

  useEffect(() => load(), [load]);

  const runAction = async (id, action, label) => {
    setBusyId(id);
    try {
      await action(id, token, tokenType);
      toast.success(label);
      setLoading(true);
      load();
    } catch (err) {
      toast.error(err.message || "Action failed");
    } finally {
      setBusyId(null);
    }
  };

  const revoke = (id) => {
    const reason = window.prompt("Why is this delegation being revoked?");
    if (!reason) return;
    setBusyId(id);
    accessLifecycleApi
      .revokeDelegation(id, reason, token, tokenType)
      .then(() => { toast.success("Delegation revoked"); setLoading(true); load(); })
      .catch((err) => toast.error(err.message || "Could not revoke the delegation"))
      .finally(() => setBusyId(null));
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Delegations</h1>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
          Access delegated to you needs your acceptance before it becomes active. You can also see
          and revoke access you have delegated to others.
        </p>
      </header>

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable /></div>}

        {!loading && delegations.length === 0 && (
          <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No delegations involve you right now.
          </p>
        )}

        {!loading && delegations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Direction</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Counterparty</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Permissions</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Window</th>
                  <th scope="col" className="px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">Status</th>
                  <th scope="col" className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {delegations.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {row.isDelegate ? "To me" : "From me"}
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-gray-100">
                      {row.isDelegate ? row.delegatorName : row.delegateName}
                    </td>
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
                      <div className="flex justify-end gap-2">
                        {row.status === "PENDING" && row.isDelegate && (
                          <>
                            <Button
                              size="sm" variant="outline" disabled={busyId === row.id}
                              onClick={() => runAction(row.id, accessLifecycleApi.acceptDelegation, "Delegation accepted")}
                            >
                              {busyId === row.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Accept
                            </Button>
                            <Button
                              size="sm" variant="outline" disabled={busyId === row.id}
                              onClick={() => runAction(row.id, accessLifecycleApi.declineDelegation, "Delegation declined")}
                            >
                              {busyId === row.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />} Decline
                            </Button>
                          </>
                        )}
                        {(row.status === "ACTIVE" || row.status === "PENDING") && row.isDelegator && (
                          <Button size="sm" variant="outline" disabled={busyId === row.id} onClick={() => revoke(row.id)}>
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
