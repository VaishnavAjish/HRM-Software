import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Pencil, Plus, ArrowRightLeft, Users, UserPlus, Trash2 } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";

function Row({ label, value }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-2 text-sm last:border-0 dark:border-gray-700">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className="font-medium text-gray-900 dark:text-white">{value}</span>
    </div>
  );
}

/**
 * Right-side slide-over for the node clicked on the canvas. Follows
 * Modal.jsx's overlay/portal conventions but anchors right instead of
 * centering, since it needs to stay open alongside the chart.
 */
export default function NodeDetailDrawer({ node, canManage, actions, employees, onClose }) {
  useEffect(() => {
    if (node) document.body.style.overflow = "hidden";
    else document.body.style.overflow = "";
    return () => { document.body.style.overflow = ""; };
  }, [node]);

  if (!node) return null;

  const data = node.data;
  const isDepartment = node.type === "department";
  const isPosition = node.type === "position";
  const isEmployee = node.type === "employee";

  return createPortal(
    <div className="fixed inset-0 z-[1100] flex justify-end bg-black/40" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-sm flex-col overflow-y-auto bg-white shadow-xl dark:bg-gray-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-200 p-4 dark:border-gray-700">
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{data.name}</h3>
            <p className="text-xs capitalize text-gray-500 dark:text-gray-400">{isPosition ? "Designation" : (data.title || data.type)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 p-4">
          <div>
            {data.isActive !== undefined && (
              <Badge variant={data.isActive ? "green" : "gray"}>{data.isActive ? "Active" : "Inactive"}</Badge>
            )}
          </div>

          <div>
            {isDepartment && (
              <>
                <Row label="Department Head" value={data.metadata?.managerName || "Not assigned"} />
                <Row label="Sub-Departments" value={data.spanOfControl || 0} />
                <Row label="Employees" value={data.employeeCount} />
                <Row label="Designations" value={data.metadata?.positionCount} />
                <Row label="Approved Headcount" value={data.approvedHeadcount} />
                <Row label="Vacant" value={data.vacancy} />
              </>
            )}
            {isPosition && (
              <>
                <Row label="Organization Unit" value={data.metadata?.organizationUnitName} />
                <Row label="Reports To" value={data.metadata?.reportsToTitle} />
                <Row label="Approved Headcount" value={data.approvedHeadcount} />
                <Row label="Filled" value={data.employeeCount} />
                <Row label="Vacant" value={data.vacancy} />
              </>
            )}
            {isEmployee && (
              <>
                <Row label="Email" value={data.metadata?.email} />
                <Row label="Department" value={data.metadata?.department} />
                <Row label="Direct Reports" value={data.reportCount ?? 0} />
              </>
            )}
          </div>

          {isDepartment && employees && (
            <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-400">Employees</p>
              {employees.loading && <p className="text-xs text-gray-400">Loading…</p>}
              {!employees.loading && employees.items.length === 0 && <p className="text-xs text-gray-400">No employees assigned.</p>}
              <ul className="space-y-1.5">
                {employees.items.map((a) => (
                  <li key={a.id} className="flex items-center justify-between text-sm">
                    <span className="text-gray-800 dark:text-gray-200">{a.userName}</span>
                    {a.isPrimary && <Badge variant="blue">Primary</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canManage && (
            <div className="space-y-2 border-t border-gray-100 pt-4 dark:border-gray-700">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Actions</p>
              <div className="grid grid-cols-2 gap-2">
                {(isDepartment || isPosition) && (
                  <Button variant="secondary" size="sm" onClick={() => actions.onEdit(node)}>
                    <Pencil size={13} /> Edit
                  </Button>
                )}
                {isDepartment && (
                  <>
                    <Button variant="secondary" size="sm" onClick={() => actions.onAddSubDepartment(node)}>
                      <Plus size={13} /> Add Sub-Department
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => actions.onAddPosition(node)}>
                      <Plus size={13} /> Add Designation
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => actions.onAddTeam(node)}>
                      <Plus size={13} /> Add Team
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => actions.onViewEmployees(node)}>
                      <Users size={13} /> View Employees
                    </Button>
                  </>
                )}
                {isPosition && (
                  <Button variant="secondary" size="sm" onClick={() => actions.onAssignEmployee(node)}>
                    <UserPlus size={13} /> Assign Employee
                  </Button>
                )}
                {(isDepartment || isEmployee) && (
                  <Button variant="secondary" size="sm" onClick={() => actions.onMove(node)}>
                    <ArrowRightLeft size={13} /> Move
                  </Button>
                )}
                {!isEmployee && (
                  <Button variant="danger" size="sm" onClick={() => actions.onDelete(node)}>
                    <Trash2 size={13} /> Delete
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
