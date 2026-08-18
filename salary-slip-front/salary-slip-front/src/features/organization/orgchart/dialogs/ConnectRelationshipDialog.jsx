import { useState } from "react";
import toast from "react-hot-toast";
import { Loader2 } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";
import { organizationApi } from "../../services/organizationApi";
import { parseNodeId } from "../nodeId";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

/**
 * Dragging a connection between two employee nodes, or using a position
 * node's "Reports To" action, both land here. `sourceId`/`targetId` follow
 * the chart's own edge convention (source = manager/parent, target =
 * employee/child position) — see OrganizationChartService.
 */
export default function ConnectRelationshipDialog({ open, sourceNode, targetNode, token, tokenType, run, onClose, onDone }) {
  const [relationshipType, setRelationshipType] = useState("primary");
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  if (!open || !sourceNode || !targetNode) return null;

  const sourceParsed = parseNodeId(sourceNode.id);
  const targetParsed = parseNodeId(targetNode.id);
  const isEmployeePair = sourceParsed.kind === "user" && targetParsed.kind === "user";
  const isPositionPair = sourceParsed.kind === "position" && targetParsed.kind === "position";

  const confirm = async () => {
    setBusy(true);
    try {
      if (isEmployeePair) {
        await run({
          label: `Connect ${targetNode.data.name} → ${sourceNode.data.name}`,
          do: async () => {
            const created = await organizationApi.createReportingRelationship({
              employeeId: targetParsed.rawId,
              managerId: sourceParsed.rawId,
              relationshipType,
              effectiveFrom,
            }, token, tokenType);
            targetNode.data._newRelationshipId = created?.data?.id;
          },
          undo: async () => {
            if (targetNode.data._newRelationshipId) {
              await organizationApi.deleteReportingRelationship(targetNode.data._newRelationshipId, token, tokenType);
            }
          },
        });
        toast.success("Reporting relationship created");
      } else if (isPositionPair) {
        const previousReportsTo = targetNode.data.metadata?.reportsToPositionId ?? null;
        await run({
          label: `Connect ${targetNode.data.name} reports to ${sourceNode.data.name}`,
          do: () => organizationApi.updateOrgUnitPosition(
            targetNode.data.metadata?.organizationUnitId, targetParsed.rawId,
            { reportsToPositionId: sourceParsed.rawId }, token, tokenType,
          ),
          undo: () => organizationApi.updateOrgUnitPosition(
            targetNode.data.metadata?.organizationUnitId, targetParsed.rawId,
            { reportsToPositionId: previousReportsTo }, token, tokenType,
          ),
        });
        toast.success("Designation reporting line updated");
      } else {
        toast.error("Connections are only supported between two employees or two positions");
        setBusy(false);
        return;
      }
      onDone();
      onClose();
    } catch (err) {
      toast.error(err.message || "That connection was refused");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Reporting Relationship" size="sm">
      <div className="space-y-3">
        <p className="text-sm text-gray-700 dark:text-gray-200">
          <span className="font-semibold">{targetNode.data.name}</span> reports to{" "}
          <span className="font-semibold">{sourceNode.data.name}</span>
        </p>
        {isEmployeePair && (
          <label className="block"><span className={labelClass}>Relationship Type</span>
            <select className={inputClass} value={relationshipType} onChange={(e) => setRelationshipType(e.target.value)}>
              <option value="primary">Primary Manager</option>
              <option value="functional">Functional Manager</option>
              <option value="project">Project Manager</option>
            </select>
          </label>
        )}
        <label className="block"><span className={labelClass}>Effective From</span>
          <input type="date" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </label>
      </div>
      <footer className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={confirm} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          Connect
        </Button>
      </footer>
    </Modal>
  );
}
