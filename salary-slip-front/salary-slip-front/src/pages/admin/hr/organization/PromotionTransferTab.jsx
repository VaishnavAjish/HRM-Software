import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, RefreshCw, Eye, Check, X, Clock, Power, ArrowRightLeft,
} from "lucide-react";
import Badge from "../../../../components/ui/Badge";
import Button from "../../../../components/ui/Button";
import Card from "../../../../components/ui/Card";
import Modal from "../../../../components/ui/Modal";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import UserPicker from "../../../../components/authorization/UserPicker";
import { useAuth } from "../../../../context/AuthContext";
import { useAuthorization } from "../../../../hooks/useAuthorization";
import { organizationApi } from "../../../../features/organization/services/organizationApi";
import { workforceApi } from "../../../../features/workforce/services/workforceApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_VARIANT = {
  draft: "gray",
  submitted: "blue",
  pending_approval: "yellow",
  approved: "green",
  scheduled: "yellow",
  applied: "green",
  rejected: "red",
  cancelled: "gray",
  failed: "red",
};

const EMPTY_FORM = {
  employeeId: "",
  currentAssignmentId: "",
  organizationUnitId: "",
  positionId: "",
  designationId: "",
  managerUserId: "",
  effectiveFrom: "",
  effectiveTo: "",
  reason: "",
  notes: "",
  organizationOwnerApproverId: "",
};

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

export default function PromotionTransferTab() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [currentAssignment, setCurrentAssignment] = useState(null);
  const [loadingCurrentAssignment, setLoadingCurrentAssignment] = useState(false);

  const [units, setUnits] = useState([]);
  const [positions, setPositions] = useState([]);
  const [allPositions, setAllPositions] = useState([]);
  const [designations, setDesignations] = useState([]);

  const [activeChange, setActiveChange] = useState(null);
  const [activeItems, setActiveItems] = useState([]);

  const canCreate = can("org.change.create");
  const canSubmit = can("org.change.submit");
  const canApprove = can("org.change.approve");
  const canReject = can("org.change.reject");
  const canApply = can("org.change.apply");

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    organizationApi.orgChanges({ changeType: "promotion_transfer" }, token, tokenType)
      .then((res) => { if (active) setChanges(res?.data ?? []); })
      .catch((err) => toast.error(err.message || "Could not load promotion/transfer requests"))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, refreshKey]);

  useEffect(() => {
    if (!token || !showCreate) return undefined;
    let active = true;
    Promise.all([
      organizationApi.orgUnits({ includeInactive: false }, token, tokenType),
      organizationApi.globalPositions({}, token, tokenType),
      workforceApi.designation.list({}, token, tokenType),
    ]).then(([unitsRes, globalPosRes, wfDesigRes]) => {
      if (!active) return;
      setUnits(unitsRes?.data ?? []);
      const globalPosList = globalPosRes?.data ?? [];
      setAllPositions(globalPosList);
      setPositions(globalPosList);
      const wfList = wfDesigRes?.data ?? [];
      setDesignations(wfList.length > 0 ? wfList : globalPosList);
    }).catch((err) => toast.error(err.message || "Could not load form options"));
    return () => { active = false; };
  }, [token, tokenType, showCreate]);

  useEffect(() => {
    if (!token) return undefined;
    if (!form.organizationUnitId) {
      setPositions(allPositions);
      return undefined;
    }
    let active = true;
    organizationApi.orgUnitPositions(form.organizationUnitId, {}, token, tokenType)
      .then((res) => {
        if (!active) return;
        const list = res?.data ?? [];
        setPositions(list.length > 0 ? list : allPositions);
      })
      .catch(() => { if (active) setPositions(allPositions); });
    return () => { active = false; };
  }, [token, tokenType, form.organizationUnitId, allPositions]);

  useEffect(() => {
    if (!token || !form.employeeId) return undefined;
    let active = true;
    organizationApi.orgUnitAssignments({ userId: form.employeeId }, token, tokenType)
      .then((res) => {
        if (!active) return;
        const primary = (res?.data ?? []).find((a) => a.isPrimary) || (res?.data ?? [])[0] || null;
        setCurrentAssignment(primary);
        setForm((prev) => ({ ...prev, currentAssignmentId: primary?.id ?? "" }));
      })
      .catch(() => { if (active) setCurrentAssignment(null); })
      .finally(() => { if (active) setLoadingCurrentAssignment(false); });
    return () => { active = false; };
  }, [token, tokenType, form.employeeId]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setErrors({});
    setCurrentAssignment(null);
    setShowCreate(true);
  };

  const setField = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleEmployeeChange = (id) => {
    setField("employeeId")(id);
    if (!id) {
      setCurrentAssignment(null);
    } else {
      setLoadingCurrentAssignment(true);
    }
  };

  const handleUnitChange = (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, organizationUnitId: value, positionId: "" }));
    if (!value) setPositions([]);
  };

  const validate = () => {
    const next = {};
    if (!form.employeeId) next.employeeId = "Select the employee.";
    if (!form.organizationUnitId) next.organizationUnitId = "Select the target department / org unit.";
    if (!form.positionId) next.positionId = "Select the target position.";
    if (!form.designationId) next.designationId = "Select the target designation.";
    if (!form.managerUserId) next.managerUserId = "Select the target manager.";
    if (!form.effectiveFrom) next.effectiveFrom = "Effective date is required.";
    if (!form.reason || !form.reason.trim()) next.reason = "A reason is required.";
    if (!form.organizationOwnerApproverId) next.organizationOwnerApproverId = "An organization owner approver is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submitCreate = async (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    setBusy(true);
    try {
      await organizationApi.createPromotionTransfer({
        employeeId: Number(form.employeeId),
        currentAssignmentId: form.currentAssignmentId ? Number(form.currentAssignmentId) : undefined,
        organizationUnitId: Number(form.organizationUnitId),
        positionId: Number(form.positionId),
        designationId: form.designationId ? Number(form.designationId) : undefined,
        managerUserId: Number(form.managerUserId),
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
        reason: form.reason.trim(),
        notes: form.notes?.trim() || undefined,
        organizationOwnerApproverId: Number(form.organizationOwnerApproverId),
      }, token, tokenType);

      toast.success("Promotion/transfer request created as a draft.");
      setShowCreate(false);
      reload();
    } catch (err) {
      toast.error(err.message || "Could not create the promotion/transfer request.");
    } finally {
      setBusy(false);
    }
  };

  const run = async (work, message) => {
    setBusy(true);
    try {
      await work();
      toast.success(message);
      reload();
    } catch (err) {
      toast.error(err.message || "That did not work.");
    } finally {
      setBusy(false);
    }
  };

  const viewDetails = async (change) => {
    setActiveChange(change);
    setActiveItems([]);
    try {
      const res = await organizationApi.orgChangeItems(change.id, token, tokenType);
      setActiveItems(res?.data ?? []);
    } catch (err) {
      toast.error(err.message || "Could not load request details");
    }
  };

  const positionOptions = useMemo(() => positions, [positions]);

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <ArrowRightLeft size={18} /> Promotions & Transfers
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Move an employee to a new department, position or manager as of an effective date. Every
            move goes through approval before it changes the employee&apos;s live assignment.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reload} title="Refresh"><RefreshCw size={16} /></Button>
          {canCreate && (
            <Button onClick={openCreate}><Plus size={16} className="mr-2" /> New Promotion / Transfer</Button>
          )}
        </div>
      </div>

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable rows={5} /></div>}

        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th>Requested By</Th>
                  <Th>Created</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {changes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-gray-500 dark:text-gray-400">
                      No promotion or transfer requests yet.
                    </td>
                  </tr>
                )}

                {changes.map((change) => (
                  <tr key={change.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{change.name || "-"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={STATUS_VARIANT[change.status] || "gray"}>
                        <span className="capitalize">{change.status === "applied" ? "Approved" : change.status?.replace(/_/g, " ")}</span>
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{change.requestedBy || "-"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                      {change.createdAt ? new Date(change.createdAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => viewDetails(change)} title="View Details">
                        <Eye size={14} className="mr-1" /> View
                      </Button>
                      {change.status === "draft" && canSubmit && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="ml-1"
                          onClick={() => run(() => organizationApi.submitOrgChange(change.id, token, tokenType), "Submitted for approval")}
                        >
                          Submit
                        </Button>
                      )}
                      {(change.status === "submitted" || change.status === "pending_approval") && canApprove && (
                        <Button
                          variant="success"
                          size="sm"
                          className="ml-1"
                          onClick={() => run(() => organizationApi.approveOrgChange(change.id, null, token, tokenType), "Approved")}
                        >
                          <Check size={14} /> Approve
                        </Button>
                      )}
                      {(change.status === "submitted" || change.status === "pending_approval") && canReject && (
                        <Button
                          variant="danger"
                          size="sm"
                          className="ml-1"
                          onClick={() => {
                            const r = window.prompt("Reason for rejection:");
                            if (r) run(() => organizationApi.rejectOrgChange(change.id, { reason: r }, token, tokenType), "Rejected");
                          }}
                        >
                          <X size={14} /> Reject
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

      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Promotion / Transfer Request" size="lg">
        <form onSubmit={submitCreate} className="space-y-4">
          <UserPicker
            label="Employee *"
            required
            value={form.employeeId}
            onChange={handleEmployeeChange}
            token={token}
            tokenType={tokenType}
          />
          {errors.employeeId && <p className="text-xs text-red-600">{errors.employeeId}</p>}

          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            <span className="font-semibold">Current Assignment: </span>
            {loadingCurrentAssignment && "Loading..."}
            {!loadingCurrentAssignment && currentAssignment && (
              <span>{currentAssignment.organizationUnitName || "-"} - {currentAssignment.positionTitle || "No position"}</span>
            )}
            {!loadingCurrentAssignment && !currentAssignment && form.employeeId && "No active primary assignment on file - this will be their first."}
            {!form.employeeId && "Select an employee to see their current assignment."}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="pt-unit">Target Department / Org Unit *</label>
              <select
                id="pt-unit"
                className={inputClass}
                value={form.organizationUnitId}
                onChange={handleUnitChange}
              >
                <option value="">Select...</option>
                {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              {errors.organizationUnitId && <p className="mt-1 text-xs text-red-600">{errors.organizationUnitId}</p>}
            </div>

            <div>
              <label className={labelClass} htmlFor="pt-position">Target Position *</label>
              <select
                id="pt-position"
                className={inputClass}
                value={form.positionId}
                onChange={(e) => setField("positionId")(e.target.value)}
                
              >
                <option value="">Select...</option>
                {positionOptions.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
              {errors.positionId && <p className="mt-1 text-xs text-red-600">{errors.positionId}</p>}
            </div>

            <div>
              <label className={labelClass} htmlFor="pt-designation">Target Designation *</label>
              <select
                id="pt-designation"
                className={inputClass}
                value={form.designationId}
                onChange={(e) => setField("designationId")(e.target.value)}
              >
                <option value="">Select...</option>
                {designations.map((d) => <option key={d.id} value={d.id}>{d.title || d.name}</option>)}
              </select>
              {errors.designationId && <p className="mt-1 text-xs text-red-600">{errors.designationId}</p>}
            </div>

            <div>
              <label className={labelClass} htmlFor="pt-effective-from">Effective Date *</label>
              <input
                id="pt-effective-from"
                type="date"
                className={inputClass}
                value={form.effectiveFrom}
                onChange={(e) => setField("effectiveFrom")(e.target.value)}
              />
              {errors.effectiveFrom && <p className="mt-1 text-xs text-red-600">{errors.effectiveFrom}</p>}
            </div>
          </div>

          <UserPicker
            label="Target Manager *"
            required
            value={form.managerUserId}
            onChange={setField("managerUserId")}
            token={token}
            tokenType={tokenType}
          />
          {errors.managerUserId && <p className="text-xs text-red-600">{errors.managerUserId}</p>}

          <div>
            <label className={labelClass} htmlFor="pt-reason">Reason *</label>
            <textarea
              id="pt-reason"
              rows={2}
              className={inputClass}
              value={form.reason}
              onChange={(e) => setField("reason")(e.target.value)}
              placeholder="e.g. Promotion to Marketing Lead based on Q4 performance review"
            />
            {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason}</p>}
          </div>

          <div>
            <label className={labelClass} htmlFor="pt-notes">Notes</label>
            <textarea
              id="pt-notes"
              rows={2}
              className={inputClass}
              value={form.notes}
              onChange={(e) => setField("notes")(e.target.value)}
            />
          </div>

          <div>
            <UserPicker
              label="Organization Owner Approver *"
              required
              value={form.organizationOwnerApproverId}
              onChange={setField("organizationOwnerApproverId")}
              token={token}
              tokenType={tokenType}
            />
            {errors.organizationOwnerApproverId && <p className="mt-1 text-xs text-red-600">{errors.organizationOwnerApproverId}</p>}
          </div>

          <div className="flex justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Creating..." : "Create Draft"}</Button>
          </div>
        </form>
      </Modal>

      {activeChange && (
        <Modal isOpen onClose={() => setActiveChange(null)} title={`Details: ${activeChange.name}`} size="lg">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Badge variant={STATUS_VARIANT[activeChange.status] || "gray"}>
                <span className="capitalize">{activeChange.status?.replace(/_/g, " ")}</span>
              </Badge>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Requested by {activeChange.requestedBy || "-"}
              </span>
            </div>
            {activeItems.map((item) => {
              const vals = item.afterValues || {};
              const unit = units.find((u) => String(u.id) === String(vals.organizationUnitId));
              const pos = positions.find((p) => String(p.id) === String(vals.positionId));
              const desig = designations.find((d) => String(d.id) === String(vals.designationId));

              const deptName = vals.departmentName || unit?.name || null;
              const posTitle = vals.positionTitle || pos?.title || null;
              const desigTitle = vals.designationTitle || desig?.title || desig?.name || null;

              return (
                <div key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
                  <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 pb-2 dark:border-gray-700">
                    Assignment Details
                  </h4>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 text-sm">
                    {vals.employeeName && (
                      <div>
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Employee</span>
                        <p className="font-semibold text-gray-900 dark:text-white">{vals.employeeName}</p>
                      </div>
                    )}
                    {deptName && (
                      <div>
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Target Department / Org Unit</span>
                        <p className="font-semibold text-gray-900 dark:text-white">{deptName}</p>
                      </div>
                    )}
                    {posTitle && (
                      <div>
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Target Position</span>
                        <p className="font-semibold text-gray-900 dark:text-white">{posTitle}</p>
                      </div>
                    )}
                    {desigTitle && (
                      <div>
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Target Designation</span>
                        <p className="font-semibold text-gray-900 dark:text-white">{desigTitle}</p>
                      </div>
                    )}
                    {vals.managerName && (
                      <div>
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Target Manager</span>
                        <p className="font-semibold text-gray-900 dark:text-white">{vals.managerName}</p>
                      </div>
                    )}
                    {vals.effectiveFrom && (
                      <div>
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Effective Date</span>
                        <p className="font-semibold text-gray-900 dark:text-white">{vals.effectiveFrom}</p>
                      </div>
                    )}
                    {vals.reason && (
                      <div className="sm:col-span-2">
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Reason</span>
                        <p className="text-gray-800 dark:text-gray-200 mt-0.5">{vals.reason}</p>
                      </div>
                    )}
                    {vals.notes && (
                      <div className="sm:col-span-2">
                        <span className="block text-xs font-medium text-gray-500 dark:text-gray-400">Notes</span>
                        <p className="text-gray-600 dark:text-gray-400 mt-0.5">{vals.notes}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {activeItems.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">No items on this request.</p>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
