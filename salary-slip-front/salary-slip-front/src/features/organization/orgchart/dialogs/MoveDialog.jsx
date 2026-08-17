import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";
import UserPicker from "../../../../components/authorization/UserPicker";
import { organizationApi } from "../../services/organizationApi";
import { parseNodeId } from "../nodeId";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

/**
 * Move Department (reparent, guarded server-side by the existing
 * resolveParent() cycle check) and Move Employee (manager change — end the
 * current active primary reporting_relationship, create a new one; there is
 * no single transactional "transfer" endpoint, see the plan's "Known
 * limitations") both flow through here, since both are "change this node's
 * place in the hierarchy" in the spec's sense.
 */
export default function MoveDialog({ open, node, orgUnits, token, tokenType, run, onClose, onDone }) {
  const [targetId, setTargetId] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const isDepartment = node?.type === "department";
  const isEmployee = node?.type === "employee";

  const unitOptions = useMemo(
    () => orgUnits.filter((u) => u.status === "active" && u.id !== node?.data?.rawId),
    [orgUnits, node],
  );

  if (!open || !node) return null;

  const { rawId } = parseNodeId(node.id);
  const currentParentLabel = isDepartment
    ? orgUnits.find((u) => u.id === node.data.metadata?.parentId)?.name
    : null;

  const impact = isDepartment
    ? [
      `${node.data.employeeCount ?? 0} employees`,
      `${node.data.metadata?.positionCount ?? 0} positions`,
      node.data.hasChildren ? "Has sub-units" : null,
    ].filter(Boolean)
    : [];

  const confirm = async () => {
    if (!targetId) { toast.error("Choose a destination first"); return; }
    setBusy(true);
    try {
      if (isDepartment) {
        const unit = orgUnits.find((u) => u.id === rawId);
        const previousParentId = unit?.parentId ?? null;
        await run({
          label: `Move ${node.data.name}`,
          do: () => organizationApi.updateOrgUnit(rawId, { parentId: targetId }, token, tokenType),
          undo: () => organizationApi.updateOrgUnit(rawId, { parentId: previousParentId }, token, tokenType),
        });
        toast.success("Department moved");
      } else if (isEmployee) {
        const res = await organizationApi.reportingRelationships(
          { employeeId: rawId, relationshipType: "primary" }, token, tokenType,
        );
        const current = (res?.data || []).find((r) => r.isActive);

        await run({
          label: `Change manager for ${node.data.name}`,
          do: async () => {
            if (current) await organizationApi.deleteReportingRelationship(current.id, token, tokenType);
            const created = await organizationApi.createReportingRelationship({
              employeeId: rawId,
              managerId: targetId,
              relationshipType: "primary",
              effectiveFrom: effectiveDate,
            }, token, tokenType);
            node.data._newRelationshipId = created?.data?.id;
          },
          undo: async () => {
            if (node.data._newRelationshipId) {
              await organizationApi.deleteReportingRelationship(node.data._newRelationshipId, token, tokenType);
            }
            if (current) {
              await organizationApi.createReportingRelationship({
                employeeId: rawId,
                managerId: current.managerId,
                relationshipType: "primary",
                effectiveFrom: current.effectiveFrom,
              }, token, tokenType);
            }
          },
        });
        toast.success("Manager changed");
      }
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message || "That did not work");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`Move ${node.data.name}`} size="sm">
      <div className="space-y-3">
        {currentParentLabel && (
          <p className="text-xs text-gray-500 dark:text-gray-400">Current parent: <span className="font-medium text-gray-700 dark:text-gray-200">{currentParentLabel}</span></p>
        )}
        {isDepartment && (
          <label className="block"><span className={labelClass}>New Parent *</span>
            <select className={inputClass} value={targetId} onChange={(e) => setTargetId(e.target.value)}>
              <option value="">Select new parent</option>
              {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </label>
        )}
        {isEmployee && (
          <UserPicker label="New Manager" required value={targetId} onChange={setTargetId} token={token} tokenType={tokenType} />
        )}
        {impact.length > 0 && (
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-700/50 dark:text-gray-300">
            <p className="mb-1 font-medium text-gray-500 dark:text-gray-400">Impact</p>
            <ul className="space-y-0.5">{impact.map((line) => <li key={line}>{line}</li>)}</ul>
          </div>
        )}
        <label className="block"><span className={labelClass}>Effective Date</span>
          <input type="date" className={inputClass} value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
        </label>
      </div>
      <footer className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={confirm} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          Confirm Move
        </Button>
      </footer>
    </Modal>
  );
}
