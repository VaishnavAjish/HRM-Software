import { useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Building2, Briefcase, Users, GitBranch } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";
import UserPicker from "../../../../components/authorization/UserPicker";
import { organizationApi } from "../../services/organizationApi";
import { departmentApi } from "../../../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const KIND_OPTIONS = [
  { key: "department", label: "Department", icon: Building2, desc: "A department under a company or parent unit." },
  { key: "team", label: "Team", icon: Building2, desc: "A team or section under a department." },
  { key: "position", label: "Position", icon: Briefcase, desc: "A role with approved headcount inside a unit." },
  { key: "assignment", label: "Employee Assignment", icon: Users, desc: "Assign an employee to an organization unit." },
  { key: "reporting", label: "Reporting Relationship", icon: GitBranch, desc: "Set who an employee reports to." },
];

/**
 * "+ Add" everywhere in the chart (toolbar, tree panel, node quick-add,
 * drawer actions) opens this same picker → form flow, per the spec's
 * "editing must not require understanding graph software" requirement.
 */
export default function AddItemDialog({
  open, initialKind, initialUnitId, initialManagerId, editNode, orgUnits, companies, positions = [], token, tokenType, canCreate, run, onClose, onDone,
}) {
  const isEdit = Boolean(editNode);
  const [kind, setKind] = useState(isEdit ? editNode.type : (initialKind || null));
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(() => (isEdit ? {
    name: editNode.data.name,
    code: editNode.data.code,
    type: editNode.data.type,
    parentId: editNode.data.metadata?.parentId || "",
    companyId: editNode.data.metadata?.companyId || "",
    unitId: editNode.data.metadata?.organizationUnitId || "",
    title: editNode.data.name,
    approvedHeadcount: editNode.data.approvedHeadcount ?? 1,
    reportsToPositionId: editNode.data.metadata?.reportsToPositionId || "",
    managerUserId: editNode.data.metadata?.managerUserId || "",
  } : {
    type: initialKind === "team" ? "team" : "department",
    parentId: initialUnitId || "",
    unitId: initialUnitId || "",
    managerId: initialManagerId || "",
    isPrimary: true,
    effectiveFrom: new Date().toISOString().slice(0, 10),
  }));

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  const unitOptions = useMemo(() => orgUnits.filter((u) => u.status === "active"), [orgUnits]);

  if (!open) return null;

  const close = () => { setKind(isEdit ? editNode.type : null); onClose(); };

  const submit = async () => {
    setBusy(true);
    try {
      if (isEdit && kind === "department") {
        const before = { name: editNode.data.name, code: editNode.data.code, type: editNode.data.type, parentId: editNode.data.metadata?.parentId || null };
        const beforeManagerUserId = editNode.data.metadata?.managerUserId || null;
        const rawId = editNode.data.rawId;
        // The department head has to be written to the legacy Department
        // record (Company & Unit), not just organization_units — the chart's
        // own sync re-derives manager_user_id from departments.manager_id
        // every 60s, so writing only to the org unit would get silently
        // reverted by the next sync cycle.
        const legacyDepartmentId = editNode.data.metadata?.legacyDepartmentId;
        const companyCode = editNode.data.metadata?.companyCode;

        await run({
          label: `Edit ${before.name}`,
          do: async () => {
            await organizationApi.updateOrgUnit(rawId, { name: form.name, code: form.code, type: form.type, parentId: form.parentId || null }, token, tokenType);
            if (legacyDepartmentId) {
              await departmentApi.updateDepartment(legacyDepartmentId, {
                name: form.name, company_code: companyCode, manager_id: form.managerUserId || null,
              }, token, tokenType);
            }
          },
          undo: async () => {
            await organizationApi.updateOrgUnit(rawId, before, token, tokenType);
            if (legacyDepartmentId) {
              await departmentApi.updateDepartment(legacyDepartmentId, {
                name: before.name, company_code: companyCode, manager_id: beforeManagerUserId,
              }, token, tokenType);
            }
          },
        });
        toast.success("Updated");
      } else if (isEdit && kind === "position") {
        const before = {
          title: editNode.data.name,
          code: editNode.data.code,
          approvedHeadcount: editNode.data.approvedHeadcount,
          reportsToPositionId: editNode.data.metadata?.reportsToPositionId || null,
        };
        const rawId = editNode.data.rawId;
        const unitId = editNode.data.metadata?.organizationUnitId;
        await run({
          label: `Edit ${before.title}`,
          do: () => organizationApi.updateOrgUnitPosition(unitId, rawId, {
            title: form.title,
            code: form.code,
            approvedHeadcount: Number(form.approvedHeadcount),
            reportsToPositionId: form.reportsToPositionId || null,
          }, token, tokenType),
          undo: () => organizationApi.updateOrgUnitPosition(unitId, rawId, before, token, tokenType),
        });
        toast.success("Updated");
      } else if (kind === "department" || kind === "team") {
        await run({
          label: `Create ${form.type}`,
          do: async () => {
            const res = await organizationApi.createOrgUnit({
              name: form.name,
              code: form.code || undefined,
              type: form.type,
              parentId: form.parentId || undefined,
              companyId: form.companyId || undefined,
              status: "active",
            }, token, tokenType);
            form._createdId = res?.data?.id;
          },
          undo: async () => {
            if (form._createdId) await organizationApi.deleteOrgUnit(form._createdId, token, tokenType);
          },
        });
        toast.success(`${form.type === "team" ? "Team" : "Department"} created`);
      } else if (kind === "position") {
        await run({
          label: "Create position",
          do: async () => {
            const res = await organizationApi.createOrgUnitPosition(form.unitId, {
              title: form.title,
              code: form.code || undefined,
              approvedHeadcount: Number(form.approvedHeadcount || 1),
              reportsToPositionId: form.reportsToPositionId || undefined,
              status: "open",
            }, token, tokenType);
            form._createdId = res?.data?.id;
          },
          undo: async () => {
            if (form._createdId) await organizationApi.deleteOrgUnitPosition(form.unitId, form._createdId, token, tokenType);
          },
        });
        toast.success("Position created");
      } else if (kind === "assignment") {
        await run({
          label: "Create assignment",
          do: async () => {
            const res = await organizationApi.createOrgUnitAssignment({
              userId: form.userId,
              organizationUnitId: form.unitId,
              assignmentType: form.assignmentType || "primary",
              isPrimary: form.isPrimary,
              effectiveFrom: form.effectiveFrom,
            }, token, tokenType);
            form._createdId = res?.data?.id;
          },
          undo: async () => {
            if (form._createdId) await organizationApi.deleteOrgUnitAssignment(form._createdId, token, tokenType);
          },
        });
        toast.success("Employee assigned");
      } else if (kind === "reporting") {
        await run({
          label: "Create reporting relationship",
          do: async () => {
            const res = await organizationApi.createReportingRelationship({
              employeeId: form.employeeId,
              managerId: form.managerId,
              relationshipType: form.relationshipType || "primary",
              effectiveFrom: form.effectiveFrom,
            }, token, tokenType);
            form._createdId = res?.data?.id;
          },
          undo: async () => {
            if (form._createdId) await organizationApi.deleteReportingRelationship(form._createdId, token, tokenType);
          },
        });
        toast.success("Reporting relationship created");
      }
      onDone();
      close();
    } catch (err) {
      toast.error(err.message || "That did not work");
    } finally {
      setBusy(false);
    }
  };

  if (!kind) {
    return (
      <Modal isOpen onClose={close} title="Add to Organization" size="sm">
        <div className="space-y-2">
          {KIND_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              disabled={!canCreate(opt.key)}
              onClick={() => setKind(opt.key)}
              className="flex w-full items-start gap-3 rounded-lg border border-gray-200 p-3 text-left hover:border-brand-400 hover:bg-brand-50/50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-gray-700 dark:hover:bg-brand-900/10"
            >
              <opt.icon size={18} className="mt-0.5 text-brand-600" />
              <span>
                <span className="block text-sm font-semibold text-gray-900 dark:text-white">{opt.label}</span>
                <span className="block text-xs text-gray-500 dark:text-gray-400">{opt.desc}</span>
              </span>
            </button>
          ))}
        </div>
      </Modal>
    );
  }

  return (
    <Modal isOpen onClose={close} title={`${isEdit ? "Edit" : "Add"} ${KIND_OPTIONS.find((o) => o.key === kind)?.label || ""}`} size="lg">
      <div className="space-y-4">
        {(kind === "department" || kind === "team") && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block"><span className={labelClass}>Name *</span>
              <input className={inputClass} value={form.name || ""} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="block"><span className={labelClass}>Code</span>
              <input className={inputClass} value={form.code || ""} onChange={(e) => set({ code: e.target.value })} />
            </label>
            <label className="block"><span className={labelClass}>Type</span>
              <select className={inputClass} value={form.type} onChange={(e) => set({ type: e.target.value })}>
                <option value="department">Department</option>
                <option value="team">Team</option>
                <option value="section">Section</option>
                <option value="sub_department">Sub-department</option>
              </select>
            </label>
            {!isEdit && (
              <label className="block"><span className={labelClass}>Company</span>
                <select className={inputClass} value={form.companyId || ""} onChange={(e) => set({ companyId: e.target.value })}>
                  <option value="">Select company</option>
                  {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </label>
            )}
            <label className="block sm:col-span-2"><span className={labelClass}>Parent Unit</span>
              <select className={inputClass} value={form.parentId || ""} onChange={(e) => set({ parentId: e.target.value })}>
                <option value="">None (top-level)</option>
                {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            {isEdit && kind === "department" && (
              <div className="sm:col-span-2">
                {editNode.data.metadata?.managerName && (
                  <p className="mb-1 text-xs text-gray-500 dark:text-gray-400">
                    Currently: <span className="font-medium text-gray-700 dark:text-gray-200">{editNode.data.metadata.managerName}</span>
                    {" — search below to replace, or clear to unassign."}
                  </p>
                )}
                <UserPicker
                  label="Department Head"
                  value={form.managerUserId || ""}
                  onChange={(id) => set({ managerUserId: id })}
                  token={token}
                  tokenType={tokenType}
                />
                <p className="mt-1 text-xs text-gray-400">
                  Writes to the same manager Company &amp; Unit &gt; Departments uses — for multiple managers on
                  one department, use the Department Managers tab.
                </p>
              </div>
            )}
          </div>
        )}

        {kind === "position" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block"><span className={labelClass}>Title *</span>
              <input className={inputClass} value={form.title || ""} onChange={(e) => set({ title: e.target.value })} />
            </label>
            <label className="block"><span className={labelClass}>Code</span>
              <input className={inputClass} value={form.code || ""} onChange={(e) => set({ code: e.target.value })} />
            </label>
            {!isEdit && (
              <label className="block"><span className={labelClass}>Organization Unit *</span>
                <select className={inputClass} value={form.unitId || ""} onChange={(e) => set({ unitId: e.target.value })}>
                  <option value="">Select unit</option>
                  {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </label>
            )}
            <label className="block"><span className={labelClass}>Approved Headcount</span>
              <input type="number" min="1" className={inputClass} value={form.approvedHeadcount ?? 1} onChange={(e) => set({ approvedHeadcount: e.target.value })} />
            </label>
            <label className="block"><span className={labelClass}>Reports To</span>
              <select className={inputClass} value={form.reportsToPositionId || ""} onChange={(e) => set({ reportsToPositionId: e.target.value })}>
                <option value="">None (top of unit)</option>
                {positions
                  .filter((p) => p.metadata?.organizationUnitId === Number(isEdit ? editNode.data.metadata?.organizationUnitId : form.unitId) && p.id !== editNode?.id)
                  .map((p) => <option key={p.id} value={p.id.replace("position_", "")}>{p.name}</option>)}
              </select>
            </label>
          </div>
        )}

        {kind === "assignment" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UserPicker label="Employee" required value={form.userId || ""} onChange={(id) => set({ userId: id })} token={token} tokenType={tokenType} />
            <label className="block"><span className={labelClass}>Organization Unit *</span>
              <select className={inputClass} value={form.unitId || ""} onChange={(e) => set({ unitId: e.target.value })}>
                <option value="">Select unit</option>
                {unitOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
            <label className="block"><span className={labelClass}>Effective From *</span>
              <input type="date" className={inputClass} value={form.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
            </label>
            <label className="block"><span className={labelClass}>Primary Assignment</span>
              <select className={inputClass} value={form.isPrimary ? "true" : "false"} onChange={(e) => set({ isPrimary: e.target.value === "true" })}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </label>
          </div>
        )}

        {kind === "reporting" && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <UserPicker label="Employee" required value={form.employeeId || ""} onChange={(id) => set({ employeeId: id })} token={token} tokenType={tokenType} />
            <UserPicker label="Manager" required value={form.managerId || ""} onChange={(id) => set({ managerId: id })} token={token} tokenType={tokenType} />
            <label className="block"><span className={labelClass}>Relationship Type</span>
              <select className={inputClass} value={form.relationshipType || "primary"} onChange={(e) => set({ relationshipType: e.target.value })}>
                <option value="primary">Primary Manager</option>
                <option value="functional">Functional Manager</option>
                <option value="project">Project Manager</option>
              </select>
            </label>
            <label className="block"><span className={labelClass}>Effective From *</span>
              <input type="date" className={inputClass} value={form.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
            </label>
          </div>
        )}
      </div>
      <footer className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={close} disabled={busy}>Cancel</Button>
        <Button onClick={submit} disabled={busy}>
          {busy && <Loader2 size={16} className="animate-spin" />}
          {isEdit ? "Save" : "Create"}
        </Button>
      </footer>
    </Modal>
  );
}
