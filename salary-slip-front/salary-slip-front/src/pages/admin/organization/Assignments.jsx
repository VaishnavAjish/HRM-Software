import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Users, Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Shield, Calendar,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

export default function AssignmentsPage() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [unitId, setUnitId] = useState("");
  const [assignments, setAssignments] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dialog, setDialog] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!token || !unitId) return;
    let active = true;
    Promise.all([
      organizationApi.orgUnitAssignments({ enterpriseId: unitId, status }, token, tokenType),
      organizationApi.legalEntityProfileCompanies(token, tokenType).catch(() => ({ data: [] })),
    ]).then(([assignmentsRes, companiesRes]) => {
      if (!active) return;
      setAssignments(assignmentsRes?.data ?? []);
      setCompanies(companiesRes?.data ?? []);
    }).catch((err) => toast.error(err.message || "Could not load assignments")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, unitId, status, refreshKey]);

  const changeFilter = (setter) => (value) => { setLoading(true); setter(value); };

  const run = async (work, message, after = () => {}) => {
    setBusy(true);
    try { await work(); toast.success(message); after(); reload(); } catch (err) { toast.error(err.message || "That did not work"); } finally { setBusy(false); }
  };

  const save = (payload) => run(
    () => dialog?.id
      ? organizationApi.updateOrgUnitAssignment(dialog.id, payload, token, tokenType)
      : organizationApi.createOrgUnitAssignment(payload, token, tokenType),
    dialog?.id ? "Assignment updated" : "Assignment created",
  );

  const companyOptions = useMemo(() => companies.map((c) => ({ id: c.id, name: c.name })), [companies]);
  const canManage = can("org.unit_assignment.create") || can("org.unit_assignment.update");

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Users size={20} /> Assignments
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Employee assignments to organization units with effective dating and primary designation.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search assignments"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search employee name or email…"
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

          <select
            aria-label="Select unit"
            className={`${inputClass} w-48`}
            value={unitId || ""}
            onChange={(e) => { setUnitId(e.target.value); reload(); }}
          >
            <option value="">Select organization unit</option>
            {companies.map((company) => (
              <optgroup label={company.name}>
                {organizationApi.orgUnits(
                  { enterpriseId: company.id }, token, tokenType
                ).then((res) => res?.data?.map((u) => ({ id: u.id, label: u.name })))}
              </optgroup>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            className={`${inputClass} w-36`}
            value={status}
            onChange={(e) => changeFilter(setStatus)(e.target.value)}
          >
            {STATUS_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
            {can("org.unit_assignment.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Assignment</Button>
            )}
          </div>
        </div>
      </Card>

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable rows={5} /></div>}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <Th>Employee</Th>
                  <Th>Emp Code</Th>
                  <Th>Org Unit</Th>
                  <Th>Assignment Type</Th>
                  <Th>Is Primary</Th>
                  <Th>Effective From</Th>
                  <Th>Effective To</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {assignments.length === 0 && (
                  <tr><td colSpan={8} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No assignments match these filters.
                  </td></tr>
                )}

                {assignments.map((assign) => (
                  <tr key={assign.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{assign.userName}</td>
                    <td className="px-4 py-3 font-mono text-gray-500 dark:text-gray-300">{assign.userEmpCode || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{assign.organizationUnitName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{assign.assignmentType || "—"}</td>
                    <td className="px-4 py-3">
                      {assign.isPrimary ? <Badge variant="blue"><Shield size={11} /> Primary</Badge> : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{assign.effectiveFrom || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{assign.effectiveTo || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("org.unit_assignment.update") && (
                          <Button size="sm" variant="ghost" onClick={() => setDialog(assign)}><Pencil size={14} /></Button>
                        )}
                        {can("org.unit_assignment.delete") && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.deleteOrgUnitAssignment(unitId, assign.id, token, tokenType), "Assignment deleted")}
                          >
                            <Trash2 size={14} className="text-red-600 dark:text-red-400" />
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

      {!canManage && !loading && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          Assignment management is restricted to administrators.
        </p>
      )}

      {dialog && (
        <Modal isOpen onClose={() => setDialog(null)} title={dialog?.id ? "Edit Assignment" : "Add Assignment"} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block"><span className={labelClass}>Employee *</span>
                <select className={inputClass} onChange={(e) => setDialog({...dialog, userId: e.target.value})}>
                  <option value="">Select employee</option>
                  {companies.map((c) => (
                    <optgroup label={c.name}>
                      {organizationApi.orgUnits({ enterpriseId: c.id }, token, tokenType).then((res) => res?.data?.map((u) => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      )))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block"><span className={labelClass}>Org Unit *</span>
                <select className={inputClass} onChange={(e) => setDialog({...dialog, organizationUnitId: e.target.value})}>
                  <option value="">Select unit</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>
              <label className="block"><span className={labelClass}>Assignment Type</span>
                <select className={inputClass} onChange={(e) => setDialog({...dialog, assignmentType: e.target.value})}>
                  <option value="">Select type</option>
                  <option value="employee">Employee</option>
                  <option value="contractor">Contractor</option>
                </select>
              </label>
              <label className="block"><span className={labelClass}>Is Primary</span>
                <select className={inputClass} onChange={(e) => setDialog({...dialog, isPrimary: e.target.value === "true"})}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block"><span className={labelClass}>Effective From *</span><input type="date" className={inputClass} onChange={(e) => setDialog({...dialog, effectiveFrom: e.target.value})} /></label>
              <label className="block"><span className={labelClass}>Effective To</span><input type="date" className={inputClass} onChange={(e) => setDialog({...dialog, effectiveTo: e.target.value})} /></label>
              <label className="block"><span className={labelClass}>Notes</span><textarea className={inputClass} rows={2} onChange={(e) => setDialog({...dialog, notes: e.target.value})} /></label>
            </div>
          </div>
          <footer className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={busy} onClick={() => save({ userId: dialog?.userId, organizationUnitId: dialog?.organizationUnitId, assignmentType: dialog?.assignmentType, isPrimary: dialog?.isPrimary, effectiveFrom: dialog?.effectiveFrom, effectiveTo: dialog?.effectiveTo, notes: dialog?.notes })}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              Save
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}