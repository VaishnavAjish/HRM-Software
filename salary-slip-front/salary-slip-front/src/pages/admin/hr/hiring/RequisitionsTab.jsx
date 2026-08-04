import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, CheckCircle2, Send, Pencil, Trash2, Copy, Archive,
  Columns3, ChevronDown,
} from "lucide-react";
import Button from "../../../../components/ui/Button";
import Badge from "../../../../components/ui/Badge";
import Modal from "../../../../components/ui/Modal";
import Pagination from "../../../../components/ui/Pagination";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { hrApi } from "../../../../utils/api";
import { downloadExcel, downloadCSV } from "../../../../utils/exportUtils";
import useHrFilters from "./useHrFilters";
import HiringFilterBar from "./HiringFilterBar";
import { runBulk } from "./bulkActions";
import RequisitionDrawer from "./RequisitionDrawer";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "posted", label: "Posted" },
  { value: "on_hold", label: "On Hold" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];
const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
];
const STATUS_VARIANT = {
  draft: "gray", pending_approval: "yellow", approved: "blue",
  posted: "green", on_hold: "yellow", closed: "gray", cancelled: "red",
};
const PRIORITY_VARIANT = { low: "gray", medium: "blue", high: "yellow", urgent: "red" };

const ALL_COLUMNS = [
  { key: "department", label: "Department" },
  { key: "hiringManager", label: "Hiring Manager" },
  { key: "openings", label: "Openings" },
  { key: "candidates", label: "Candidates" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
  { key: "targetJoining", label: "Target Joining" },
  { key: "progress", label: "Progress" },
];
const VISIBLE_COLS_KEY = "hr_req_visible_columns";

const EMPTY_FORM = {
  title: "", designation: "", employment_type: "full_time", openings: 1,
  priority: "medium", min_experience: "", max_experience: "", salary_min: "",
  salary_max: "", description: "", requirements: "", target_closing_date: "",
};

export default function RequisitionsTab({ departments = [], people = [] }) {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const hr = useHrFilters("requisitions");

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState(null);

  const [visibleCols, setVisibleCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VISIBLE_COLS_KEY)) || ALL_COLUMNS.map((c) => c.key); }
    catch { return ALL_COLUMNS.map((c) => c.key); }
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const toggleCol = (key) => {
    const next = visibleCols.includes(key) ? visibleCols.filter((k) => k !== key) : [...visibleCols, key];
    setVisibleCols(next);
    try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const isVisible = (key) => visibleCols.includes(key);

  const load = () => {
    setLoading(true);
    hrApi.getRequisitions(user?.accessToken, user?.tokenType, {
      ...companyScope,
      page, per_page: perPage,
      search: hr.debouncedSearch || undefined,
      department_id: hr.filters.departmentId || undefined,
      status: hr.filters.status || undefined,
    })
      .then((res) => {
        if (!res.status) return;
        const payload = res.data;
        setRows(payload?.data || []);
        setTotal(payload?.total ?? (payload?.data?.length || 0));
      })
      .catch((err) => toast.error(err.message || "Failed to load requisitions"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(1); }, [hr.debouncedSearch, hr.filters.departmentId, hr.filters.status, scopeKey]);
  useEffect(() => { if (user?.accessToken) load(); }, [user, scopeKey, page, perPage, hr.debouncedSearch, hr.filters.departmentId, hr.filters.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // hiringManager / priority / date / sort have no server-side filter on this
  // endpoint — applied to the current page only, a known limit at very large
  // scale rather than a fabricated "it filters everything" claim.
  const visibleRows = useMemo(() => {
    let r = [...rows];
    if (hr.filters.hiringManagerId) r = r.filter((x) => String(x.requested_by) === String(hr.filters.hiringManagerId));
    if (hr.filters.priority) r = r.filter((x) => x.priority === hr.filters.priority);
    if (hr.filters.dateFrom) r = r.filter((x) => x.created_at && x.created_at >= hr.filters.dateFrom);
    if (hr.filters.dateTo) r = r.filter((x) => x.created_at && x.created_at <= hr.filters.dateTo);
    if (hr.filters.sort === "oldest") r.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (hr.filters.sort === "name") r.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    return r;
  }, [rows, hr.filters.hiringManagerId, hr.filters.priority, hr.filters.dateFrom, hr.filters.dateTo, hr.filters.sort]);

  const openCreate = () => { setEditing(null); setForm(EMPTY_FORM); setModalOpen(true); };
  const openEdit = (r) => {
    setEditing(r);
    setForm({
      title: r.title || "", designation: r.designation || "", employment_type: r.employment_type || "full_time",
      openings: r.openings || 1, priority: r.priority || "medium", min_experience: r.min_experience ?? "",
      max_experience: r.max_experience ?? "", salary_min: r.salary_min ?? "", salary_max: r.salary_max ?? "",
      description: r.description || "", requirements: r.requirements || "", target_closing_date: r.target_closing_date || "",
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    setSaving(true);
    try {
      const res = editing
        ? await hrApi.updateRequisition(editing.id, form, user?.accessToken, user?.tokenType)
        : await hrApi.storeRequisition(form, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success(res.message || "Saved"); setModalOpen(false); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to save requisition");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this requisition?")) return;
    try {
      const res = await hrApi.deleteRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition deleted"); load(); }
    } catch (err) { toast.error(err.message || "Failed to delete"); }
  };

  const approve = async (id) => {
    try {
      const res = await hrApi.approveRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition approved"); load(); }
    } catch (err) { toast.error(err.message || "Failed to approve"); }
  };

  const submitForApproval = async (r) => {
    try {
      const res = await hrApi.updateRequisition(r.id, { status: "pending_approval" }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Submitted for approval"); load(); }
    } catch (err) { toast.error(err.message || "Failed to submit"); }
  };

  const publish = async (id) => {
    try {
      const res = await hrApi.publishRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition posted"); load(); }
    } catch (err) { toast.error(err.message || "Failed to publish"); }
  };

  const duplicate = async (r) => {
    try {
      const res = await hrApi.storeRequisition({
        title: `${r.title} (Copy)`, designation: r.designation, employment_type: r.employment_type,
        openings: r.openings, priority: r.priority, min_experience: r.min_experience, max_experience: r.max_experience,
        salary_min: r.salary_min, salary_max: r.salary_max, description: r.description, requirements: r.requirements,
      }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Duplicated as a new draft"); load(); }
    } catch (err) { toast.error(err.message || "Failed to duplicate"); }
  };

  const archive = async (id) => {
    if (!window.confirm("Close this requisition?")) return;
    try {
      const res = await hrApi.updateRequisition(id, { status: "closed" }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition closed"); load(); }
    } catch (err) { toast.error(err.message || "Failed to close"); }
  };

  const bulkClose = () => runBulk(
    hr.selectedIds,
    (id) => hrApi.updateRequisition(id, { status: "closed" }, user?.accessToken, user?.tokenType),
    { successLabel: "closed", onDone: () => { hr.clearSelected(); load(); } },
  );

  const bulkAssignManager = async (managerId) => {
    if (!managerId) return;
    await runBulk(
      hr.selectedIds,
      (id) => hrApi.updateRequisition(id, { requested_by: managerId }, user?.accessToken, user?.tokenType),
      { successLabel: "assigned", onDone: () => { hr.clearSelected(); load(); } },
    );
  };

  const bulkExport = (format) => {
    const selected = visibleRows.filter((r) => hr.selectedIds.includes(r.id));
    const exportRows = selected.map((r) => ({
      Title: r.title, Department: r.department?.name || "—", "Hiring Manager": r.requestedBy?.name || "—",
      Openings: r.openings, Candidates: r.candidates_count ?? 0, Priority: r.priority, Status: r.status,
      Created: r.created_at, "Target Joining": r.target_closing_date || "—",
    }));
    if (format === "excel") downloadExcel(exportRows, "requisitions");
    else downloadCSV(exportRows, "requisitions");
  };

  const viewDrawer = async (r) => {
    setDrawerTarget(r);
    try {
      const res = await hrApi.getRequisition(r.id, user?.accessToken, user?.tokenType);
      if (res.status) setDrawerTarget(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to load requisition detail");
    }
  };

  const allOnPageSelected = visibleRows.length > 0 && visibleRows.every((r) => hr.selectedIds.includes(r.id));

  return (
    <div className="space-y-4">
      <HiringFilterBar
        hr={hr}
        fields={["search", "department", "hiringManager", "status", "priority", "date", "sort"]}
        departments={departments}
        people={people}
        statusOptions={STATUS_OPTIONS}
        priorityOptions={PRIORITY_OPTIONS}
        bulkBar={
          <>
            <button onClick={bulkClose} className="text-xs font-semibold text-red-600 hover:underline">Close</button>
            <button onClick={() => bulkExport("excel")} className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:underline">Export Excel</button>
            <button onClick={() => bulkExport("csv")} className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:underline">Export CSV</button>
            <select
              className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1"
              value=""
              onChange={(e) => bulkAssignManager(e.target.value)}
            >
              <option value="">Assign Hiring Manager…</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </>
        }
      />

      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setColMenuOpen(!colMenuOpen)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5"
          >
            <Columns3 size={14} /> Columns <ChevronDown size={12} />
          </button>
          {colMenuOpen && (
            <div className="absolute z-30 mt-1 left-0 w-52 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg p-2 space-y-1">
              {ALL_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-xs px-1 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={isVisible(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>New Requisition</Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={8} /></div>
        ) : visibleRows.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No job requisitions match these filters</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={() => hr.setAllSelected(allOnPageSelected ? [] : visibleRows.map((r) => r.id))}
                    />
                  </th>
                  <th className="text-left px-4 py-3">Job Title</th>
                  {isVisible("department") && <th className="text-left px-4 py-3">Department</th>}
                  {isVisible("hiringManager") && <th className="text-left px-4 py-3">Hiring Manager</th>}
                  {isVisible("openings") && <th className="text-left px-4 py-3">Openings</th>}
                  {isVisible("candidates") && <th className="text-left px-4 py-3">Candidates</th>}
                  {isVisible("priority") && <th className="text-left px-4 py-3">Priority</th>}
                  {isVisible("status") && <th className="text-left px-4 py-3">Status</th>}
                  {isVisible("created") && <th className="text-left px-4 py-3">Created</th>}
                  {isVisible("targetJoining") && <th className="text-left px-4 py-3">Target Joining</th>}
                  {isVisible("progress") && <th className="text-left px-4 py-3">Progress</th>}
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {visibleRows.map((r) => (
                  <tr key={r.id} className="group hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={hr.selectedIds.includes(r.id)} onChange={() => hr.toggleSelected(r.id)} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => viewDrawer(r)} className="font-medium text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 text-left">
                        {r.title}
                      </button>
                    </td>
                    {isVisible("department") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.department?.name || "—"}</td>}
                    {isVisible("hiringManager") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.requestedBy?.name || "—"}</td>}
                    {isVisible("openings") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.openings}</td>}
                    {isVisible("candidates") && (
                      <td className="px-4 py-3">
                        <button onClick={() => viewDrawer(r)} className="text-brand-600 dark:text-brand-400 hover:underline">
                          {r.candidates_count ?? 0}
                        </button>
                      </td>
                    )}
                    {isVisible("priority") && <td className="px-4 py-3"><Badge variant={PRIORITY_VARIANT[r.priority] || "gray"}>{r.priority}</Badge></td>}
                    {isVisible("status") && <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[r.status] || "gray"}>{r.status?.replace("_", " ")}</Badge></td>}
                    {isVisible("created") && <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>}
                    {isVisible("targetJoining") && <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.target_closing_date || "—"}</td>}
                    {isVisible("progress") && (
                      <td className="px-4 py-3 w-28">
                        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" title="Applications received vs. openings">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{ width: `${Math.min(100, ((r.candidates_count ?? 0) / Math.max(1, r.openings)) * 100)}%` }}
                          />
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                        {r.status === "draft" && (
                          <button title="Submit for approval" onClick={() => submitForApproval(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Send size={14} /></button>
                        )}
                        {r.status === "pending_approval" && (
                          <button title="Approve" onClick={() => approve(r.id)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20"><CheckCircle2 size={14} /></button>
                        )}
                        {r.status === "approved" && (
                          <button title="Post" onClick={() => publish(r.id)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"><Send size={14} /></button>
                        )}
                        <button title="Edit" onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={14} /></button>
                        <button title="Duplicate" onClick={() => duplicate(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Copy size={14} /></button>
                        {!["closed", "cancelled"].includes(r.status) && (
                          <button title="Archive / Close" onClick={() => archive(r.id)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Archive size={14} /></button>
                        )}
                        <button title="Delete" onClick={() => remove(r.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4">
          <Pagination current={page} total={total} pageSize={perPage} onChange={setPage} onPageSizeChange={setPerPage} />
        </div>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? "Edit Requisition" : "New Requisition"} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Title" required><input className={inputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Designation"><input className={inputClass} value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
          <Field label="Employment Type">
            <select className={inputClass} value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contract">Contract</option>
              <option value="intern">Intern</option>
            </select>
          </Field>
          <Field label="Openings"><input type="number" min="1" className={inputClass} value={form.openings} onChange={(e) => setForm({ ...form, openings: e.target.value })} /></Field>
          <Field label="Priority">
            <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Target Closing Date"><input type="date" className={inputClass} value={form.target_closing_date || ""} onChange={(e) => setForm({ ...form, target_closing_date: e.target.value })} /></Field>
          <Field label="Min Experience (yrs)"><input type="number" step="0.5" className={inputClass} value={form.min_experience} onChange={(e) => setForm({ ...form, min_experience: e.target.value })} /></Field>
          <Field label="Max Experience (yrs)"><input type="number" step="0.5" className={inputClass} value={form.max_experience} onChange={(e) => setForm({ ...form, max_experience: e.target.value })} /></Field>
          <Field label="Salary Min"><input type="number" className={inputClass} value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} /></Field>
          <Field label="Salary Max"><input type="number" className={inputClass} value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} /></Field>
          <Field label="Description" full><textarea rows={3} className={inputClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Requirements" full><textarea rows={3} className={inputClass} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} /></Field>
        </div>
      </Modal>

      <RequisitionDrawer
        requisition={drawerTarget}
        onClose={() => setDrawerTarget(null)}
        onEdit={(r) => { setDrawerTarget(null); openEdit(r); }}
      />
    </div>
  );
}

function Field({ label, required, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
