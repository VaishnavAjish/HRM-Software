import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { Plus, Briefcase, GraduationCap, User2 } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const COLUMNS = [
  { key: "applied", label: "Applied" },
  { key: "screening", label: "Screening" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "hr_interview", label: "HR Interview" },
  { key: "technical_interview", label: "Technical Interview" },
  { key: "final_interview", label: "Final Interview" },
  { key: "selected", label: "Selected" },
  { key: "offer_sent", label: "Offer Sent" },
  { key: "offer_accepted", label: "Offer Accepted" },
  { key: "rejected", label: "Rejected" },
  { key: "on_hold", label: "On Hold" },
];

const PRIORITY_VARIANT = { high: "red", medium: "yellow", low: "gray" };

const EMPTY_FORM = {
  requisition_id: "", name: "", email: "", phone: "", experience_years: "",
  current_company: "", current_designation: "", skills: "", source: "other", priority: "medium", notes: "",
};

export default function CandidatePipeline() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [columns, setColumns] = useState({});
  const [loading, setLoading] = useState(true);
  const [requisitions, setRequisitions] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [activeCandidate, setActiveCandidate] = useState(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  /**
   * Raises no spinner of its own — every state update happens in a promise
   * continuation. `loading` starts true, so the mount fetch needs none, and
   * turning it on from the effect was a synchronous setState that cost a
   * cascading render before the request had even been sent. Callers refetching
   * over an already-rendered board use reload().
   */
  const load = () =>
    hrApi
      .getPipeline(user?.accessToken, user?.tokenType, companyScope)
      .then((res) => {
        if (res.status) setColumns(res.data || {});
      })
      .catch((err) => toast.error(err.message || "Failed to load pipeline"))
      .finally(() => setLoading(false));

  const reload = () => {
    setLoading(true);
    return load();
  };

  useEffect(() => {
    if (!user?.accessToken) return;
    load();
    hrApi.getRequisitions(user.accessToken, user.tokenType, { ...companyScope, status: "approved,posted", per_page: 100 })
      .then((res) => res.status && setRequisitions(res.data?.data || res.data || []))
      .catch(() => {});
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const allCandidates = useMemo(() => Object.values(columns).flat(), [columns]);

  const handleDragStart = (event) => {
    const candidate = allCandidates.find((c) => String(c.id) === String(event.active.id));
    setActiveCandidate(candidate || null);
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    setActiveCandidate(null);
    if (!over) return;
    const candidateId = active.id;
    const toStage = over.id;
    const fromStage = Object.keys(columns).find((stage) => columns[stage].some((c) => String(c.id) === String(candidateId)));
    if (!fromStage || fromStage === toStage) return;

    setColumns((prev) => {
      const moved = prev[fromStage].find((c) => String(c.id) === String(candidateId));
      return {
        ...prev,
        [fromStage]: prev[fromStage].filter((c) => String(c.id) !== String(candidateId)),
        [toStage]: [{ ...moved, stage: toStage }, ...(prev[toStage] || [])],
      };
    });

    try {
      const res = await hrApi.moveCandidateStage(candidateId, { to_stage: toStage }, user?.accessToken, user?.tokenType);
      if (!res.status) throw new Error(res.message);
    } catch (err) {
      toast.error(err.message || "Failed to move candidate");
      reload();
    }
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Candidate name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        requisition_id: form.requisition_id || null,
        experience_years: form.experience_years || null,
        skills: form.skills ? form.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };
      const res = await hrApi.storeCandidate(payload, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success("Candidate added");
        setModalOpen(false);
        setForm(EMPTY_FORM);
        reload();
      }
    } catch (err) {
      toast.error(err.message || "Failed to add candidate");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Drag a card to move a candidate to the next stage</p>
        <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>Add Candidate</Button>
      </div>

      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {COLUMNS.map((c) => <div key={c.key} className="skeleton h-96 w-72 flex-shrink-0 rounded-2xl" />)}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {COLUMNS.map((col) => (
              <KanbanColumn key={col.key} column={col} candidates={columns[col.key] || []} />
            ))}
          </div>
          <DragOverlay>{activeCandidate ? <CandidateCard candidate={activeCandidate} dragging /> : null}</DragOverlay>
        </DndContext>
      )}

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Add Candidate" size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Add Candidate"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Name" required><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Requisition">
            <select className={inputClass} value={form.requisition_id} onChange={(e) => setForm({ ...form, requisition_id: e.target.value })}>
              <option value="">— None —</option>
              {requisitions.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
          </Field>
          <Field label="Email"><input type="email" className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
          <Field label="Experience (yrs)"><input type="number" step="0.5" className={inputClass} value={form.experience_years} onChange={(e) => setForm({ ...form, experience_years: e.target.value })} /></Field>
          <Field label="Priority">
            <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
              <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
            </select>
          </Field>
          <Field label="Current Company"><input className={inputClass} value={form.current_company} onChange={(e) => setForm({ ...form, current_company: e.target.value })} /></Field>
          <Field label="Current Designation"><input className={inputClass} value={form.current_designation} onChange={(e) => setForm({ ...form, current_designation: e.target.value })} /></Field>
          <Field label="Source">
            <select className={inputClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="referral">Referral</option><option value="job_portal">Job Portal</option><option value="linkedin">LinkedIn</option><option value="walk_in">Walk-in</option><option value="other">Other</option>
            </select>
          </Field>
          <Field label="Skills (comma separated)"><input className={inputClass} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
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

function KanbanColumn({ column, candidates }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-2xl border ${isOver ? "border-brand-400 bg-brand-50/50 dark:bg-brand-900/10" : "border-gray-200 dark:border-gray-700"} bg-gray-50 dark:bg-gray-800/60 flex flex-col max-h-[calc(100vh-260px)]`}
    >
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{column.label}</span>
        <Badge variant="gray">{candidates.length}</Badge>
      </div>
      <div className="p-2 space-y-2 overflow-y-auto">
        {candidates.map((c) => <DraggableCandidateCard key={c.id} candidate={c} />)}
        {candidates.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No candidates</p>}
      </div>
    </div>
  );
}

function DraggableCandidateCard({ candidate }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: candidate.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.4 : 1 } : undefined;
  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <CandidateCard candidate={candidate} />
    </div>
  );
}

function CandidateCard({ candidate, dragging }) {
  return (
    <div className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-3 cursor-grab active:cursor-grabbing ${dragging ? "shadow-2xl" : "shadow-sm"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{candidate.name}</p>
        <Badge variant={PRIORITY_VARIANT[candidate.priority] || "gray"}>{candidate.priority}</Badge>
      </div>
      {candidate.requisition?.title && (
        <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1"><Briefcase size={12} /> {candidate.requisition.title}</p>
      )}
      <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1"><GraduationCap size={12} /> {candidate.experience_years ?? 0} yrs · {candidate.current_designation || "—"}</p>
      {candidate.recruiter?.name && (
        <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mt-1"><User2 size={12} /> {candidate.recruiter.name}</p>
      )}
      {Array.isArray(candidate.skills) && candidate.skills.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {candidate.skills.slice(0, 3).map((s) => (
            <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">{s}</span>
          ))}
        </div>
      )}
    </div>
  );
}
