import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";
import { organizationApi } from "../../services/organizationApi";

const selectClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

/**
 * Sets which employee this one reports to *within its own department* —
 * writes employee_organization_assignments.manager_user_id (already a
 * validated field on updateAssignment), which is what the Organization
 * view's tree nests by. Deliberately separate from the org-wide "Reporting"
 * view's reporting_relationships (MoveDialog/ConnectRelationshipDialog) —
 * that's a different, already-working concept; this one is scoped to "who's
 * this person's manager inside this department" so the picker only offers
 * the department's own employees and can cycle-check against them directly.
 */
export default function SetManagerDialog({ open, node, token, tokenType, run, onClose, onDone }) {
  const [peers, setPeers] = useState([]);
  const [loadingPeers, setLoadingPeers] = useState(true);
  const [managerId, setManagerId] = useState(node?.metadata?.managerUserId ? String(node.metadata.managerUserId) : "");
  const [busy, setBusy] = useState(false);

  const unitId = node?.metadata?.organizationUnitId;

  useEffect(() => {
    if (!open || !unitId) return undefined;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      setLoadingPeers(true);
      organizationApi.orgUnitAssignments({ organizationUnitId: unitId }, token, tokenType)
        .then((res) => { if (active) setPeers(res?.data || []); })
        .catch(() => { if (active) setPeers([]); })
        .finally(() => { if (active) setLoadingPeers(false); });
    });
    return () => { active = false; };
  }, [open, unitId, token, tokenType]);

  const byUserId = useMemo(() => {
    const map = new Map();
    peers.forEach((p) => { if (p.isPrimary && p.isActive) map.set(p.userId, p); });
    return map;
  }, [peers]);

  const options = useMemo(
    () => Array.from(byUserId.values()).filter((p) => p.userId !== node?.rawId),
    [byUserId, node],
  );

  if (!open || !node) return null;

  const wouldCycle = (candidateManagerId) => {
    let cursor = candidateManagerId;
    for (let hops = 0; hops < 100 && cursor != null; hops += 1) {
      if (cursor === node.rawId) return true;
      cursor = byUserId.get(cursor)?.managerUserId ?? null;
    }
    return false;
  };

  const confirm = async () => {
    const newManagerId = managerId ? Number(managerId) : null;
    if (newManagerId && wouldCycle(newManagerId)) {
      toast.error("That would make this employee manage their own manager — pick someone else");
      return;
    }
    const assignmentId = node.metadata?.assignmentId;
    if (!assignmentId) { toast.error("Could not find this employee's assignment record"); return; }
    const previousManagerId = node.metadata?.managerUserId ?? null;

    setBusy(true);
    try {
      await run({
        label: `Set manager for ${node.name}`,
        do: () => organizationApi.updateOrgUnitAssignment(assignmentId, { managerUserId: newManagerId }, token, tokenType),
        undo: () => organizationApi.updateOrgUnitAssignment(assignmentId, { managerUserId: previousManagerId }, token, tokenType),
      });
      toast.success("Manager updated");
      onDone(unitId);
      onClose();
    } catch (err) {
      toast.error(err.message || "Could not update manager");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Set Manager — ${node.name}`} size="sm">
      <div className="space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          Choose who <span className="font-semibold">{node.name}</span> reports to within{" "}
          <span className="font-semibold">{node.metadata?.department || "this department"}</span>.
        </p>
        <label className="block">
          <span className={labelClass}>Manager</span>
          <select
            className={selectClass}
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            disabled={loadingPeers}
          >
            <option value="">No manager (reports directly to department)</option>
            {options.map((p) => (
              <option key={p.userId} value={p.userId}>{p.userName}</option>
            ))}
          </select>
          {loadingPeers && <span className="mt-1 block text-xs text-gray-400">Loading this department's employees…</span>}
        </label>
      </div>
      <footer className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={confirm} disabled={busy || loadingPeers}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          Save
        </Button>
      </footer>
    </Modal>
  );
}
