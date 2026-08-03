import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, CheckCircle2, Send, Trash2, Pencil, Users as UsersIcon } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = {
  draft: "gray", pending_approval: "yellow", approved: "blue",
  posted: "green", on_hold: "yellow", closed: "gray", cancelled: "red",
};

const EMPTY_FORM = {
  title: "", designation: "", employment_type: "full_time", openings: 1,
  priority: "medium", min_experience: "", max_experience: "", salary_min: "",
  salary_max: "", description: "", requirements: "", target_closing_date: "",
};

export default function HiringProcess() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [loading, setLoading] = useState(true);
  const [requisitions, setRequisitions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [timelineFor, setTimelineFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await hrApi.getRequisitions(user?.accessToken, user?.tokenType, companyScope);
      if (res.status) setRequisitions(res.data?.data || res.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load requisitions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (user?.accessToken) load(); }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
      if (res.status) {
        toast.success(res.message || "Saved");
        setModalOpen(false);
        load();
      }
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
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  const approve = async (id) => {
    try {
      const res = await hrApi.approveRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition approved"); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to approve");
    }
  };

  const submitForApproval = async (r) => {
    try {
      const res = await hrApi.updateRequisition(r.id, { status: "pending_approval" }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Submitted for approval"); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to submit");
    }
  };

  const publish = async (id) => {
    try {
      const res = await hrApi.publishRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition posted"); load(); }
    } catch (err) {
      toast.error(err.message || "Failed to publish");
    }
  };

  const viewTimeline = async (r) => {
    try {
      const res = await hrApi.getRequisition(r.id, user?.accessToken, user?.tokenType);
      if (res.status) setTimelineFor(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to load requisition detail");
    }
  };

  const rows = useMemo(() => requisitions, [requisitions]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Hiring Process</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Requisition → Approval → Posting → Applications → Selection → Joining
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>New Requisition</Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : rows.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No job requisitions yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Title</th>
                  <th className="text-left px-4 py-3">Department</th>
                  <th className="text-left px-4 py-3">Openings</th>
                  <th className="text-left px-4 py-3">Priority</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Candidates</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.title}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.department?.name || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.openings}</td>
                    <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{r.priority}</td>
                    <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[r.status] || "gray"}>{r.status?.replace("_", " ")}</Badge></td>
                    <td className="px-4 py-3">
                      <button onClick={() => viewTimeline(r)} className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 hover:underline">
                        <UsersIcon size={14} /> {r.candidates_count ?? 0}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {r.status === "draft" && (
                          <button title="Submit for approval" onClick={() => submitForApproval(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <Send size={15} />
                          </button>
                        )}
                        {r.status === "pending_approval" && (
                          <button title="Approve" onClick={() => approve(r.id)} className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20">
                            <CheckCircle2 size={15} />
                          </button>
                        )}
                        {r.status === "approved" && (
                          <button title="Post" onClick={() => publish(r.id)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20">
                            <Send size={15} />
                          </button>
                        )}
                        <button title="Edit" onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <Pencil size={15} />
                        </button>
                        <button title="Delete" onClick={() => remove(r.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

      <Modal isOpen={!!timelineFor} onClose={() => setTimelineFor(null)} title={`Candidates — ${timelineFor?.title || ""}`} size="lg">
        <div className="space-y-3">
          {(!timelineFor?.candidates || timelineFor.candidates.length === 0) && (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No candidates linked to this requisition yet</p>
          )}
          {(timelineFor?.candidates || []).map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 dark:border-gray-700 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">{c.current_designation || "—"} · {c.experience_years ?? 0} yrs</p>
              </div>
              <Badge variant="blue">{(c.stage || "").replace("_", " ")}</Badge>
            </div>
          ))}
        </div>
      </Modal>
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
