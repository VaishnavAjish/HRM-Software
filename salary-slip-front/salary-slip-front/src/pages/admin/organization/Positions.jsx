import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Shield, Building2, Briefcase,
  Snowflake, PlayCircle, ChevronDown, ChevronRight, UserPlus, UserRound,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { organizationApi } from "../../../features/organization/services/organizationApi";
import { departmentApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const POSITION_TYPES = [
  { value: "executive", label: "Executive" },
  { value: "manager", label: "Manager" },
  { value: "staff", label: "Staff" },
  { value: "intern", label: "Intern" },
  { value: "contractor", label: "Contractor" },
];

const POSITION_STATUSES = [
  { value: "open", label: "Open" },
  { value: "filled", label: "Filled" },
  { value: "partially_filled", label: "Partially Filled" },
  { value: "approved", label: "Approved" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "draft", label: "Draft" },
  { value: "frozen", label: "Frozen" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

// Reports To is real hierarchy data (reportsToPositionId) — walked into an
// actual tree instead of a flat list with a "Reports To" text column, so a
// department's designations read as a chain instead of something pieced
// together by eye across unsorted rows.
function buildPositionForest(positions) {
  const byParent = new Map();
  const ids = new Set(positions.map((p) => p.id));
  positions.forEach((p) => {
    const parentId = p.reportsToPositionId && ids.has(p.reportsToPositionId) ? p.reportsToPositionId : null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(p);
  });
  return byParent;
}

// Departments carry real parent/child hierarchy (parentId, from Company &
// Unit's sub-department feature) — flattened here into parent-then-children
// order with a depth for each row, so a sub-department renders directly
// under its parent instead of alphabetized in with every other department.
function orderDepartmentsAsTree(depts) {
  const ids = new Set(depts.map((d) => d.id));
  const byParent = new Map();
  depts.forEach((d) => {
    const parentId = d.parentId && ids.has(d.parentId) ? d.parentId : null;
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(d);
  });
  const ordered = [];
  const visit = (parentId, depth, visited) => {
    (byParent.get(parentId) || []).forEach((d) => {
      if (visited.has(d.id)) return;
      const nextVisited = new Set(visited).add(d.id);
      ordered.push({ dept: d, depth });
      visit(d.id, depth + 1, nextVisited);
    });
  };
  visit(null, 0, new Set());
  return ordered;
}

function StatusBadge({ status, freezeReason }) {
  return (
    <div>
      <Badge variant={status === "frozen" ? "yellow" : status === "closed" || status === "cancelled" ? "red" : "green"}>
        <span className="capitalize">{(status || "—").replace(/_/g, " ")}</span>
      </Badge>
      {status === "frozen" && freezeReason && (
        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{freezeReason}</p>
      )}
    </div>
  );
}

function DesignationRows({ positions, depth, parentId, visited, can, onEdit, onFreeze, onRelease, onDelete, onAssign, onView }) {
  const forest = useMemo(() => buildPositionForest(positions), [positions]);
  const children = forest.get(parentId) || [];

  return children.flatMap((pos) => {
    if (visited.has(pos.id)) return [];
    const nextVisited = new Set(visited).add(pos.id);
    return [
      <tr key={pos.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
          <button
            type="button"
            onClick={() => onView(pos)}
            title="View employees in this designation"
            style={{ paddingLeft: `${depth * 18}px` }}
            className="inline-flex items-center gap-1.5 text-left hover:text-brand-600 hover:underline dark:hover:text-brand-400"
          >
            {depth > 0 && <span className="text-gray-300 dark:text-gray-600">└</span>}
            {pos.title}
          </button>
        </td>
        <td className="px-3 py-2 font-mono text-xs text-gray-500 dark:text-gray-300">{pos.code || "—"}</td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-300"><span className="capitalize">{pos.type || "—"}</span></td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{pos.approvedHeadcount ?? 0}</td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{pos.filledHeadcount ?? 0}</td>
        <td className="px-3 py-2">
          <span className={pos.vacantHeadcount > 0 ? "font-semibold text-amber-600 dark:text-amber-400" : "text-gray-600 dark:text-gray-300"}>
            {pos.vacantHeadcount ?? 0}
          </span>
        </td>
        <td className="px-3 py-2"><StatusBadge status={pos.status} freezeReason={pos.freezeReason} /></td>
        <td className="px-3 py-2 text-right">
          <div className="flex justify-end gap-1">
            {can("org.unit_assignment.create") && (
              <Button size="sm" variant="ghost" title="Assign employee" onClick={() => onAssign(pos)}>
                <UserPlus size={13} />
              </Button>
            )}
            {can("org.unit_position.update") && pos.status !== "frozen" && (
              <Button size="sm" variant="ghost" title="Freeze designation" onClick={() => onFreeze(pos)}>
                <Snowflake size={13} />
              </Button>
            )}
            {can("org.unit_position.update") && pos.status === "frozen" && (
              <Button size="sm" variant="ghost" title="Release designation" onClick={() => onRelease(pos)}>
                <PlayCircle size={13} className="text-green-600 dark:text-green-400" />
              </Button>
            )}
            {can("org.unit_position.update") && (
              <Button size="sm" variant="ghost" title="Edit" onClick={() => onEdit(pos)}><Pencil size={13} /></Button>
            )}
            {can("org.unit_position.delete") && (
              <Button size="sm" variant="ghost" title="Delete" onClick={() => onDelete(pos)}>
                <Trash2 size={13} className="text-red-600 dark:text-red-400" />
              </Button>
            )}
          </div>
        </td>
      </tr>,
      <DesignationRows
        key={`${pos.id}-children`}
        positions={positions} depth={depth + 1} parentId={pos.id} visited={nextVisited}
        can={can} onEdit={onEdit} onFreeze={onFreeze} onRelease={onRelease} onDelete={onDelete} onAssign={onAssign} onView={onView}
      />,
    ];
  });
}

function DepartmentCard({ dept, depth = 0, expanded, onToggle, positions, loading, can, onAdd, onEdit, onFreeze, onRelease, onDelete, onAssign, onView }) {
  return (
    <Card padding={false} className={`overflow-hidden ${depth > 0 ? "border-l-2 border-l-indigo-200 dark:border-l-indigo-800" : ""}`}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 p-4 text-left hover:bg-gray-50/70 dark:hover:bg-gray-700/30"
      >
        {expanded ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />}
        {depth > 0 && <span className="flex-shrink-0 text-gray-300 dark:text-gray-600">└</span>}
        <div className={`flex flex-shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300 ${depth > 0 ? "h-7 w-7" : "h-9 w-9"}`}>
          <Building2 size={depth > 0 ? 13 : 16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-semibold text-gray-900 dark:text-white ${depth > 0 ? "text-sm" : ""}`}>{dept.name}</p>
            {dept.companyName && (
              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {dept.companyName}
              </span>
            )}
            {depth > 0 && dept.parentName && (
              <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                Sub-dept of {dept.parentName}
              </span>
            )}
          </div>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <UserRound size={12} className="flex-shrink-0" />
            {dept.managerName ? `Head: ${dept.managerName}` : "No department head assigned"}
          </p>
        </div>
        <div className="flex-shrink-0 text-right text-xs text-gray-500 dark:text-gray-400">
          <span className="font-semibold text-gray-900 dark:text-white">{dept.positionCount ?? 0}</span> designation{dept.positionCount === 1 ? "" : "s"}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center justify-end gap-2 p-2">
            {can("org.unit_position.create") && (
              <Button size="sm" onClick={onAdd}><Plus size={14} /> Add Designation</Button>
            )}
          </div>
          {loading && <div className="p-6 text-center text-xs text-gray-400">Loading…</div>}
          {!loading && positions && positions.length === 0 && (
            <p className="p-6 text-center text-xs text-gray-400">No designations in this department yet.</p>
          )}
          {!loading && positions && positions.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-200 bg-gray-50 text-[11px] font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                  <tr>
                    <th className="px-3 py-2">Title</th>
                    <th className="px-3 py-2">Code</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Approved</th>
                    <th className="px-3 py-2">Filled</th>
                    <th className="px-3 py-2">Vacant</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  <DesignationRows
                    positions={positions} depth={0} parentId={null} visited={new Set()}
                    can={can} onEdit={onEdit} onFreeze={onFreeze} onRelease={onRelease} onDelete={onDelete} onAssign={onAssign} onView={onView}
                  />
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function DesignationDialog({ dept, editing, allPositions, busy, onSave, onClose }) {
  const isEdit = Boolean(editing);
  const [form, setForm] = useState({
    title: editing?.title ?? "",
    code: editing?.code ?? "",
    type: editing?.type ?? "staff",
    approvedHeadcount: editing?.approvedHeadcount ?? 1,
    budgetedHeadcount: editing?.budgetedHeadcount ?? editing?.approvedHeadcount ?? 1,
    status: editing?.status ?? "open",
    reportsToPositionId: editing?.reportsToPositionId ?? "",
  });
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Modal isOpen onClose={onClose} title={`${isEdit ? "Edit" : "Add"} Designation — ${dept.name}`} size="lg">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2"><span className={labelClass}>Title *</span>
          <input className={inputClass} value={form.title} onChange={(e) => set({ title: e.target.value })} />
        </label>
        <label className="block"><span className={labelClass}>Code</span>
          <input className={inputClass} value={form.code} onChange={(e) => set({ code: e.target.value })} placeholder="Auto-generated if empty" />
        </label>
        <label className="block"><span className={labelClass}>Type</span>
          <select className={inputClass} value={form.type} onChange={(e) => set({ type: e.target.value })}>
            {POSITION_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </label>
        <label className="block"><span className={labelClass}>Approved Headcount</span>
          <input type="number" min="0" className={inputClass} value={form.approvedHeadcount} onChange={(e) => set({ approvedHeadcount: Number(e.target.value) })} />
        </label>
        <label className="block"><span className={labelClass}>Budgeted Headcount</span>
          <input type="number" min="0" className={inputClass} value={form.budgetedHeadcount} onChange={(e) => set({ budgetedHeadcount: Number(e.target.value) })} />
        </label>
        <label className="block"><span className={labelClass}>Reports To</span>
          <select className={inputClass} value={form.reportsToPositionId} onChange={(e) => set({ reportsToPositionId: e.target.value })}>
            <option value="">None (top of department)</option>
            {allPositions.filter((p) => p.id !== editing?.id).map((p) => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        </label>
        <label className="block"><span className={labelClass}>Status</span>
          <select className={inputClass} value={form.status} onChange={(e) => set({ status: e.target.value })}>
            {POSITION_STATUSES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
      </div>
      <footer className="mt-4 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button
          disabled={busy || !form.title.trim()}
          onClick={() => onSave({
            title: form.title.trim(),
            code: form.code || undefined,
            type: form.type,
            approvedHeadcount: form.approvedHeadcount,
            budgetedHeadcount: form.budgetedHeadcount,
            status: form.status,
            reportsToPositionId: form.reportsToPositionId || null,
          })}
        >
          {busy && <Loader2 size={16} className="animate-spin" />}
          {isEdit ? "Save" : "Create"}
        </Button>
      </footer>
    </Modal>
  );
}

// One search-pick-submit-close cycle per person was the real complaint.
// This is a single scrollable, checkable list of real employees (name +
// code, searchable) — check as many as needed, one "Assign" click for all
// of them, dialog stays open afterward so the next batch doesn't need a
// fresh open/search either.
function AssignEmployeeDialog({ dept, position, token, tokenType, busy, onAssignBatch, onClose }) {
  const [allUsers, setAllUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [search, setSearch] = useState("");
  const [searchedUsers, setSearchedUsers] = useState(null);
  const [searching, setSearching] = useState(false);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [assigned, setAssigned] = useState([]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    departmentApi.eligibleUsers({}, token, tokenType)
      .then((res) => { if (active) setAllUsers(res?.data ?? []); })
      .catch(() => { if (active) setAllUsers([]); })
      .finally(() => { if (active) setLoadingUsers(false); });
    return () => { active = false; };
  }, [token, tokenType]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) return undefined;
    let active = true;
    Promise.resolve().then(() => { if (active) setSearching(true); });
    const timer = setTimeout(() => {
      departmentApi.eligibleUsers({ search: term }, token, tokenType)
        .then((res) => { if (active) setSearchedUsers(res?.data ?? []); })
        .catch(() => { if (active) setSearchedUsers([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [search, token, tokenType]);

  const displayedUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (term.length >= 2) return searchedUsers ?? [];
    if (term.length === 0) return allUsers;
    return allUsers.filter((u) =>
      u.name?.toLowerCase().includes(term) || u.emp_code?.toLowerCase().includes(term) || u.email?.toLowerCase().includes(term));
  }, [search, allUsers, searchedUsers]);

  const toggle = (id) => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const submit = async () => {
    if (selectedIds.size === 0) return;
    const rows = Array.from(selectedIds).map((id) => ({ userId: id, effectiveFrom }));
    const results = await onAssignBatch(rows);
    setAssigned((prev) => [...prev, ...results]);
    setSelectedIds(new Set());
  };

  return (
    <Modal isOpen onClose={onClose} title={`Assign Employees — ${position.title}`} size="lg">
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Assigning to <span className="font-semibold text-gray-900 dark:text-white">{position.title}</span> in{" "}
          <span className="font-semibold text-gray-900 dark:text-white">{dept.name}</span>.
        </p>

        {assigned.length > 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-xs text-green-700 dark:border-green-800 dark:bg-green-900/20 dark:text-green-400">
            Assigned this session: {assigned.map((a) => a.label).join(", ")}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2">
          <div className="relative flex-1">
            <span className={labelClass}>Search</span>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                className={`${inputClass} pl-8`}
                placeholder="Search by name, employee code, or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <label className="block w-40 flex-shrink-0">
            <span className={labelClass}>Effective From</span>
            <input type="date" className={inputClass} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
          </label>
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {(loadingUsers || searching) && <p className="p-4 text-center text-xs text-gray-400">Loading…</p>}
          {!loadingUsers && !searching && displayedUsers.length === 0 && (
            <p className="p-4 text-center text-xs text-gray-400">No employees match.</p>
          )}
          {!loadingUsers && !searching && displayedUsers.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-center gap-3 border-b border-gray-100 px-3 py-2 last:border-0 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40"
            >
              <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggle(u.id)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900 dark:text-white">
                  {u.name}
                  {u.emp_code && <span className="ml-1.5 font-mono text-xs font-normal text-gray-400">#{u.emp_code}</span>}
                </span>
                {(u.designation || u.department) && (
                  <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                    {[u.designation, u.department].filter(Boolean).join(" · ")}
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>
      </div>
      <footer className="mt-4 flex items-center justify-between gap-2">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : ""}
        </span>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>Done</Button>
          <Button disabled={busy || selectedIds.size === 0} onClick={submit}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            Assign {selectedIds.size > 1 ? `(${selectedIds.size})` : ""}
          </Button>
        </div>
      </footer>
    </Modal>
  );
}

// Employees list for a single designation, scoped by both department and
// position — relies on the controller's positionId/organizationUnitId
// filter passthrough actually reaching the service (previously only the
// department filter key was silently dropped; fixed alongside this dialog).
function ViewEmployeesDialog({ dept, position, token, tokenType, onAssign, onClose }) {
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    Promise.resolve().then(() => { if (active) setLoading(true); });
    organizationApi.orgUnitAssignments(
      { organizationUnitId: dept.id, positionId: position.id },
      token, tokenType,
    )
      .then((res) => { if (active) setEmployees(res?.data ?? []); })
      .catch(() => { if (active) setEmployees([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [dept.id, position.id, token, tokenType]);

  return (
    <Modal isOpen onClose={onClose} title={`Employees — ${position.title}`} size="lg">
      <div className="space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          <span className="font-semibold text-gray-900 dark:text-white">{position.title}</span> in{" "}
          <span className="font-semibold text-gray-900 dark:text-white">{dept.name}</span> —{" "}
          {position.filledHeadcount ?? 0} filled, {position.vacantHeadcount ?? 0} vacant of {position.approvedHeadcount ?? 0} approved.
        </p>

        <div className="max-h-96 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
          {loading && <p className="p-4 text-center text-xs text-gray-400">Loading…</p>}
          {!loading && employees.length === 0 && (
            <p className="p-4 text-center text-xs text-gray-400">No employees currently assigned to this designation.</p>
          )}
          {!loading && employees.map((emp) => (
            <div
              key={emp.id}
              className="flex items-center gap-3 border-b border-gray-100 px-3 py-2.5 last:border-0 dark:border-gray-700"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
                <UserRound size={14} />
              </div>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-gray-900 dark:text-white">
                  {emp.userName || `User #${emp.userId}`}
                  {emp.userEmpCode && <span className="ml-1.5 font-mono text-xs font-normal text-gray-400">#{emp.userEmpCode}</span>}
                  {emp.isPrimary && <Badge variant="blue" className="ml-1.5">Primary</Badge>}
                </span>
                <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                  Since {emp.effectiveFrom || "—"}
                  {emp.managerName && ` · Reports to ${emp.managerName}`}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <footer className="mt-4 flex justify-end gap-2">
        {onAssign && <Button variant="secondary" onClick={onAssign}><UserPlus size={14} /> Assign more</Button>}
        <Button onClick={onClose}>Close</Button>
      </footer>
    </Modal>
  );
}

export default function PositionsPage() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [departments, setDepartments] = useState([]);
  const [deptsLoading, setDeptsLoading] = useState(true);
  const [expandedDeptId, setExpandedDeptId] = useState(null);
  const [positionsByDept, setPositionsByDept] = useState(() => new Map());
  const [loadingDeptId, setLoadingDeptId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [summary, setSummary] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [assignDialog, setAssignDialog] = useState(null);
  const [viewDialog, setViewDialog] = useState(null);

  // Designations, their headcounts, and their employee lists all live in
  // organization_units/organization_positions/employee_organization_assignments
  // — tables that only get populated FROM users.department/users.designation
  // by this same sync the Org Chart tab runs. Previously this page never
  // triggered it itself, so opening Designations without having visited Org
  // Chart first showed stale or empty data. Running it here first (best
  // effort — still load whatever already exists if it fails) is what makes
  // "fetched automatic" actually true regardless of which tab someone opens.
  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    organizationApi.syncLegacyDepartments(token, tokenType)
      .catch(() => {})
      .then(() => (active ? organizationApi.orgUnits({}, token, tokenType) : null))
      .then((res) => { if (active && res) setDepartments((res.data ?? []).filter((u) => u.type === "department")); })
      .catch(() => { if (active) setDepartments([]); })
      .finally(() => { if (active) setDeptsLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, refreshKey]);

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    organizationApi.headcountSummary({}, token, tokenType)
      .then((res) => { if (active) setSummary(res?.data?.totals ?? null); })
      .catch(() => {});
    return () => { active = false; };
  }, [token, tokenType, refreshKey]);

  const loadDeptPositions = (deptId) => {
    setLoadingDeptId(deptId);
    organizationApi.orgUnitPositions(deptId, {}, token, tokenType)
      .then((res) => setPositionsByDept((prev) => new Map(prev).set(deptId, res?.data ?? [])))
      .catch((err) => toast.error(err.message || "Could not load designations"))
      .finally(() => setLoadingDeptId((id) => (id === deptId ? null : id)));
  };

  const toggleDept = (deptId) => {
    const willExpand = expandedDeptId !== deptId;
    setExpandedDeptId(willExpand ? deptId : null);
    if (willExpand && !positionsByDept.has(deptId)) loadDeptPositions(deptId);
  };

  const reload = () => setRefreshKey((v) => v + 1);

  const run = async (work, message) => {
    setBusy(true);
    try { await work(); toast.success(message); } catch (err) { toast.error(err.message || "That did not work"); throw err; } finally { setBusy(false); }
  };

  const saveDesignation = async (payload) => {
    const deptId = dialog.dept.id;
    try {
      await run(
        () => dialog.editing
          ? organizationApi.updateOrgUnitPosition(deptId, dialog.editing.id, payload, token, tokenType)
          : organizationApi.createOrgUnitPosition(deptId, payload, token, tokenType),
        dialog.editing ? "Designation updated" : "Designation created",
      );
      setDialog(null);
      loadDeptPositions(deptId);
      reload();
    } catch { /* toast already shown by run() */ }
  };

  const freezePosition = (dept, pos) => {
    const reason = window.prompt("Why is this designation being frozen?");
    if (!reason) return;
    run(() => organizationApi.freezeOrgUnitPosition(dept.id, pos.id, reason, token, tokenType), "Designation frozen")
      .then(() => loadDeptPositions(dept.id)).catch(() => {});
  };

  const releasePosition = (dept, pos) => {
    run(() => organizationApi.releaseOrgUnitPosition(dept.id, pos.id, token, tokenType), "Designation released")
      .then(() => loadDeptPositions(dept.id)).catch(() => {});
  };

  const deletePosition = (dept, pos) => {
    if (!window.confirm(`Delete "${pos.title}"? This cannot be undone.`)) return;
    run(() => organizationApi.deleteOrgUnitPosition(dept.id, pos.id, token, tokenType), "Designation deleted")
      .then(() => { loadDeptPositions(dept.id); reload(); }).catch(() => {});
  };

  // Processes every queued row from one dialog session, one API call each
  // (the backend has no bulk-assign endpoint) but without closing/reopening
  // the dialog or re-searching between people — that round trip was the
  // actual "takes too much time" complaint, not the number of requests.
  const assignEmployeeBatch = async (rows) => {
    const { dept, position } = assignDialog;
    setBusy(true);
    const succeeded = [];
    for (const row of rows) {
      try {
        const res = await organizationApi.createOrgUnitAssignment({
          userId: row.userId, organizationUnitId: dept.id, positionId: position.id,
          assignmentType: "primary", isPrimary: true, effectiveFrom: row.effectiveFrom,
        }, token, tokenType);
        succeeded.push({ label: res?.data?.userName || `User #${row.userId}` });
      } catch (err) {
        toast.error(err.message || `Could not assign user #${row.userId}`);
      }
    }
    setBusy(false);
    if (succeeded.length > 0) {
      toast.success(`${succeeded.length} employee${succeeded.length === 1 ? "" : "s"} assigned`);
      loadDeptPositions(dept.id);
    }
    return succeeded;
  };

  const filteredDepartments = useMemo(() => {
    if (!search.trim()) return departments;
    const term = search.toLowerCase();
    return departments.filter((d) => d.name?.toLowerCase().includes(term));
  }, [departments, search]);

  const grouped = useMemo(() => {
    const byCompany = new Map();
    const other = [];
    filteredDepartments.forEach((d) => {
      if (d.companyId != null) {
        const key = d.companyName || `Company ${d.companyId}`;
        if (!byCompany.has(key)) byCompany.set(key, []);
        byCompany.get(key).push(d);
      } else {
        other.push(d);
      }
    });
    const groups = Array.from(byCompany.entries()).map(([label, depts]) => ({ label, depts: orderDepartmentsAsTree(depts) }));
    if (other.length > 0) groups.push({ label: "Unassigned", depts: orderDepartmentsAsTree(other) });
    return groups;
  }, [filteredDepartments]);

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Briefcase size={20} /> Designations
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Every department, with its designations and their reporting hierarchy — expand a department to manage them.
        </p>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Designations", value: summary.positionCount },
            { label: "Approved", value: summary.approvedHeadcount },
            { label: "Budgeted", value: summary.budgetedHeadcount },
            { label: "Filled", value: summary.filledHeadcount },
            { label: "Vacant", value: summary.vacantHeadcount },
            { label: "Frozen", value: summary.frozenCount },
          ].map((tile) => (
            <Card key={tile.label} padding={false} className="p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{tile.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{tile.value ?? 0}</p>
            </Card>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            aria-label="Search departments"
            className={`${inputClass} w-64 pl-8`}
            placeholder="Search department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
      </div>

      {deptsLoading && <p className="text-sm text-gray-400">Loading departments…</p>}

      {!deptsLoading && grouped.length === 0 && (
        <Card><p className="p-6 text-center text-sm text-gray-500 dark:text-gray-400">No departments match this search.</p></Card>
      )}

      {!deptsLoading && grouped.map((group) => (
        <div key={group.label} className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{group.label}</h2>
          <div className="space-y-2">
            {group.depts.map(({ dept, depth }) => (
              <div key={dept.id} style={{ marginLeft: depth * 24 }}>
                <DepartmentCard
                  dept={dept}
                  depth={depth}
                  expanded={expandedDeptId === dept.id}
                  onToggle={() => toggleDept(dept.id)}
                  positions={positionsByDept.get(dept.id)}
                  loading={loadingDeptId === dept.id}
                  can={can}
                  onAdd={() => setDialog({ dept, editing: null })}
                  onEdit={(pos) => setDialog({ dept, editing: pos })}
                  onFreeze={(pos) => freezePosition(dept, pos)}
                  onRelease={(pos) => releasePosition(dept, pos)}
                  onDelete={(pos) => deletePosition(dept, pos)}
                  onAssign={(pos) => setAssignDialog({ dept, position: pos })}
                  onView={(pos) => setViewDialog({ dept, position: pos })}
                />
              </div>
            ))}
          </div>
        </div>
      ))}

      {!can("org.unit_position.create") && !can("org.unit_position.update") && !deptsLoading && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          Designation management is restricted to administrators.
        </p>
      )}

      {dialog && (
        <DesignationDialog
          dept={dialog.dept}
          editing={dialog.editing}
          allPositions={positionsByDept.get(dialog.dept.id) || []}
          busy={busy}
          onSave={saveDesignation}
          onClose={() => setDialog(null)}
        />
      )}

      {assignDialog && (
        <AssignEmployeeDialog
          dept={assignDialog.dept}
          position={assignDialog.position}
          token={token}
          tokenType={tokenType}
          busy={busy}
          onAssignBatch={assignEmployeeBatch}
          onClose={() => setAssignDialog(null)}
        />
      )}

      {viewDialog && (
        <ViewEmployeesDialog
          dept={viewDialog.dept}
          position={viewDialog.position}
          token={token}
          tokenType={tokenType}
          onAssign={can("org.unit_assignment.create") ? () => {
            setAssignDialog({ dept: viewDialog.dept, position: viewDialog.position });
            setViewDialog(null);
          } : null}
          onClose={() => setViewDialog(null)}
        />
      )}
    </div>
  );
}
