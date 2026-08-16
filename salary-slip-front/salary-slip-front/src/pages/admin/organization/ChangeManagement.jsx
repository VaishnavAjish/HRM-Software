import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Power, PowerOff, Shield,
  Building2, Clock, Check, X, AlertCircle, Eye, Calendar, Users,
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
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "scheduled", label: "Scheduled" },
  { value: "applied", label: "Applied" },
  { value: "cancelled", label: "Cancelled" },
];

const CHANGE_TYPES = [
  { value: "restructure", label: "Restructure" },
  { value: "merger", label: "Merger" },
  { value: "acquisition", label: "Acquisition" },
  { value: "divestiture", label: "Divestiture" },
  { value: "reorganization", label: "Reorganization" },
  { value: "relocation", label: "Relocation" },
  { value: "other", label: "Other" },
];

const CHANGE_ITEM_TYPES = [
  { value: "create_unit", label: "Create Unit" },
  { value: "update_unit", label: "Update Unit" },
  { value: "delete_unit", label: "Delete Unit" },
  { value: "move_unit", label: "Move Unit" },
  { value: "create_position", label: "Create Position" },
  { value: "update_position", label: "Update Position" },
  { value: "delete_position", label: "Delete Position" },
  { value: "assign_employee", label: "Assign Employee" },
  { value: "update_assignment", label: "Update Assignment" },
  { value: "remove_assignment", label: "Remove Assignment" },
];

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

export default function ChangeManagementPage() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [changes, setChanges] = useState([]);
  const [dialog, setDialog] = useState(null);
  const [activeChange, setActiveChange] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [impactChange, setImpactChange] = useState(null);
  const [impact, setImpact] = useState(null);
  const [impactLoading, setImpactLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [changeType, setChangeType] = useState("ALL");

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    organizationApi.orgChanges(
      { search, status, change_type: setChangeType === "ALL" ? undefined : setChangeType },
      token, tokenType,
    ).then((res) => {
      if (!active) return;
      setChanges(res?.data ?? []);
    }).catch((err) => toast.error(err.message || "Could not load changes")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, search, status, changeType, refreshKey]);

  const changeFilter = (setter) => (value) => { setLoading(true); setter(value); };

  const run = async (work, message, after = () => {}) => {
    setBusy(true);
    try { await work(); toast.success(message); after(); reload(); } catch (err) { toast.error(err.message || "That did not work"); } finally { setBusy(false); }
  };

  const saveChange = (payload) => run(
    () => dialog?.id
      ? organizationApi.updateOrgChange(dialog.id, payload, token, tokenType)
      : organizationApi.createOrgChange(payload, token, tokenType),
    dialog?.id ? "Change updated" : "Change created",
  );

  const companyOptions = useMemo(() => [], []);
  const canManage = can("org.change.create") || can("org.change.update");

  const handleStatusToggle = (change) => run(
    () => organizationApi.approveOrgChange(change.id, null, token, tokenType), // simplified - would need comments
    "Change status updated",
  );

  const canApprove = can("org.change.approve");
  const canReject = can("org.change.reject");

  const viewImpact = async (change) => {
    setImpactChange(change);
    setImpact(null);
    setImpactLoading(true);
    try {
      const res = await organizationApi.orgChangeImpact(change.id, token, tokenType);
      setImpact(res?.data ?? null);
    } catch (err) {
      toast.error(err.message || "Could not load impact analysis");
      setImpactChange(null);
    } finally {
      setImpactLoading(false);
    }
  };

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Building2 size={20} /> Change Management
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Draft → submit → approve/reject → schedule → apply workflow for restructures and reorganizations.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search changes"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search change code or name…"
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

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

          <select
            aria-label="Filter by change type"
            className={`${inputClass} w-36`}
            value={changeType === "ALL" ? "" : changeType}
            onChange={(e) => setChangeType(e.target.value)}
          >
            <option value="ALL">All Types</option>
            {CHANGE_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
            {can("org.change.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Change</Button>
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
                  <Th>Change Code</Th>
                  <Th>Name</Th>
                  <Th>Type</Th>
                  <Th>Status</Th>
                  <Th>Effective From</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {changes.length === 0 && (
                  <tr><td colSpan={6} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No changes match these filters.
                  </td></tr>
                )}

                {changes.map((change) => (
                  <tr key={change.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 font-mono text-gray-500 dark:text-gray-300">{change.code || "—"}</td>
                    <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">{change.name || "—"}</td>
                    <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{change.changeType || "—"}</td>
                    <td className="px-4 py-3">
                      <Badge variant={change.status === "approved" ? "green" : change.status === "rejected" ? "red" : change.status === "scheduled" ? "yellow" : "blue"}>
                        {change.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{change.effectiveFrom || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("org.change.read") && (
                          <Button size="sm" variant="ghost" onClick={() => setActiveChange(change)}><Eye size={14} /></Button>
                        )}
                        {can("org.change.read") && change.itemCount > 0 && (
                          <Button size="sm" variant="ghost" onClick={() => viewImpact(change)} title="Impact analysis">
                            <Users size={14} /> Impact
                          </Button>
                        )}
                        {canApprove && change.status !== "approved" && change.status !== "rejected" && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.approveOrgChange(change.id, null, token, tokenType), "Change approved")}
                          >
                            <Check size={14} /> Approve
                          </Button>
                        )}
                        {canReject && change.status !== "approved" && change.status !== "rejected" && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.rejectOrgChange(change.id, "User rejected", token, tokenType), "Change rejected")}
                          >
                            <X size={14} /> Reject
                          </Button>
                        )}
                        {change.status === "draft" && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.submitOrgChange(change.id, token, tokenType), "Change submitted")}
                          >
                            <Clock size={14} /> Submit
                          </Button>
                        )}
                        {change.status === "submitted" && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.scheduleOrgChange(change.id, new Date().toISOString().split("T")[0], token, tokenType), "Change scheduled")}
                          >
                            <Calendar size={14} /> Schedule
                          </Button>
                        )}
                        {change.status === "scheduled" && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.applyOrgChange(change.id, token, tokenType), "Change applied")}
                          >
                            <Power size={14} /> Apply
                          </Button>
                        )}
                        {change.status !== "cancelled" && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.cancelOrgChange(change.id, token, tokenType), "Change cancelled")}
                          >
                            <AlertCircle size={14} /> Cancel
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
          Change management is restricted to administrators.
        </p>
      )}

      {activeChange && (
        <Modal isOpen onClose={() => setActiveChange(null)} title={`Change Details: ${activeChange.code || "—"}`} size="lg">
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Code</span>
                <p className="mt-1 font-mono text-gray-900 dark:text-white">{activeChange.code || "—"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Name</span>
                <p className="mt-1 text-gray-900 dark:text-white">{activeChange.name || "—"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Type</span>
                <p className="mt-1 capitalize text-gray-600 dark:text-gray-300">{activeChange.changeType || "—"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Status</span>
                <p className="mt-1">
                  <Badge variant={activeChange.status === "approved" ? "green" : activeChange.status === "rejected" ? "red" : activeChange.status === "scheduled" ? "yellow" : "blue"}>
                    {activeChange.status}
                  </Badge>
                </p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Effective From</span>
                <p className="mt-1 text-gray-600 dark:text-gray-300">{activeChange.effectiveFrom || "—"}</p>
              </div>
              <div>
                <span className="font-medium text-gray-500 dark:text-gray-400">Description</span>
                <p className="mt-1 text-gray-600 dark:text-gray-300 truncate" style={{ maxHeight: "100px", overflow: "auto" }}>{activeChange.description || "—"}</p>
              </div>
            </div>
            {activeChange.items && activeChange.items.length > 0 && (
              <div>
                <h4 className="font-semibold text-gray-600 dark:text-gray-300">Items ({activeChange.items.length})</h4>
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr>
                      <Th>Item Type</Th>
                      <Th>Target Type</Th>
                      <Th>Target</Th>
                      <Th>Status</Th>
                      <Th>Actions</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeChange.items.map((item) => (
                      <tr key={item.id} className="border-b border-gray-200 dark:border-gray-700/40">
                        <td className="px-4 py-3 capitalize text-gray-500 dark:text-gray-300">{item.itemType}</td>
                        <td className="px-4 py-3 capitalize text-gray-500 dark:text-gray-300">{item.targetType}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{item.targetId || "—"}</td>
                        <td className="px-4 py-3">
                          <Badge variant={item.status === "error" ? "red" : item.status || "—"}>{item.status || "—"}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right"></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
              <h4 className="font-semibold text-gray-600 dark:text-gray-300">Approval Chain</h4>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {activeChange.approvals?.length > 0 ? (
                  <span>{activeChange.approvals.map((a) => `${a.name} (${a.role})`).join(", ")}</span>
                ) : (
                  <span className="text-gray-400">No approvals recorded</span>
                )}
              </p>
            </div>
          </div>
        </Modal>
      )}

      {impactChange && (
        <Modal
          isOpen
          onClose={() => { setImpactChange(null); setImpact(null); }}
          title={`Impact Analysis: ${impactChange.code || impactChange.name || "—"}`}
          size="lg"
        >
          <div className="p-4 space-y-4">
            {impactLoading && (
              <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
                <Loader2 size={18} className="mr-2 animate-spin" /> Calculating impact…
              </div>
            )}
            {!impactLoading && impact && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{impact.totals?.employees ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Employees</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{impact.totals?.positions ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Positions</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{impact.totals?.childUnits ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Child Units</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 p-3 text-center dark:border-gray-700">
                    <p className="text-2xl font-bold text-gray-900 dark:text-white">{impact.totals?.reportingRelationships ?? 0}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Reporting Links</p>
                  </div>
                </div>

                {(impact.totals?.employees ?? 0) > 0 && (
                  <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-3 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
                    <AlertCircle size={14} className="mt-0.5 shrink-0" />
                    Applying this request will directly affect {impact.totals.employees} employee record(s). Review each item below before approving.
                  </p>
                )}

                <div>
                  <h4 className="mb-2 font-semibold text-gray-600 dark:text-gray-300">Per-Item Breakdown</h4>
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr>
                        <Th>Item Type</Th>
                        <Th>Target</Th>
                        <Th>Employees</Th>
                        <Th>Positions</Th>
                        <Th>Child Units</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {(impact.items ?? []).map((entry) => (
                        <tr key={entry.itemId} className="border-b border-gray-200 dark:border-gray-700/40">
                          <td className="px-4 py-2 capitalize text-gray-500 dark:text-gray-300">{entry.itemType?.replace(/_/g, " ")}</td>
                          <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{entry.targetType} #{entry.targetId ?? "—"}</td>
                          <td className="px-4 py-2 text-gray-900 dark:text-white">{entry.affected?.employeeCount ?? 0}</td>
                          <td className="px-4 py-2 text-gray-900 dark:text-white">{entry.affected?.positionCount ?? 0}</td>
                          <td className="px-4 py-2 text-gray-900 dark:text-white">{entry.affected?.childUnitCount ?? 0}</td>
                        </tr>
                      ))}
                      {(impact.items ?? []).length === 0 && (
                        <tr><td colSpan={5} className="p-4 text-center text-gray-400">No items on this request.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}