import { useEffect, useMemo, useState, useCallback } from "react";
import toast from "react-hot-toast";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  Plus,
  Briefcase,
  GraduationCap,
  User2,
  ChevronRight,
  CheckCircle2,
  Circle,
  ArrowRight,
  XCircle,
  PauseCircle,
  Mail,
  Phone as PhoneIcon,
  MapPin,
  Clock,
  Pencil,
  Trash2,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/* ─────────────────── Pipeline stage definitions ─────────────────── */

/** Ordered main-flow stages (excludes terminal ones) */
const MAIN_STAGES = [
  { key: "applied",              label: "Applied",              color: "#6366f1" },
  { key: "screening",            label: "Screening",            color: "#8b5cf6" },
  { key: "shortlisted",          label: "Shortlisted",          color: "#0ea5e9" },
  { key: "hr_interview",         label: "HR Interview",         color: "#06b6d4" },
  { key: "technical_interview",  label: "Tech Interview",       color: "#10b981" },
  { key: "final_interview",      label: "Final Interview",      color: "#f59e0b" },
  { key: "selected",             label: "Selected",             color: "#22c55e" },
  { key: "offer_sent",           label: "Offer Sent",           color: "#84cc16" },
  { key: "offer_accepted",       label: "Offer Accepted",       color: "#16a34a" },
];

const TERMINAL_STAGES = [
  { key: "rejected", label: "Rejected", color: "#ef4444" },
  { key: "on_hold",  label: "On Hold",  color: "#f59e0b" },
];

const ALL_COLUMNS = [...MAIN_STAGES, ...TERMINAL_STAGES];

const STAGE_INDEX = Object.fromEntries(MAIN_STAGES.map((s, i) => [s.key, i]));

const PRIORITY_VARIANT  = { high: "red", medium: "yellow", low: "gray" };
const PRIORITY_DOT      = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

const EMPTY_FORM = {
  requisition_id: "", name: "", email: "", phone: "", experience_years: "",
  current_company: "", current_designation: "", skills: "", source: "other",
  priority: "medium", notes: "",
};

/* ─────────────────── Helpers ─────────────────── */

function stageLabel(key) {
  return ALL_COLUMNS.find((s) => s.key === key)?.label ?? key;
}

function stageColor(key) {
  return ALL_COLUMNS.find((s) => s.key === key)?.color ?? "#6b7280";
}

function nextMainStage(currentKey) {
  const idx = STAGE_INDEX[currentKey];
  if (idx === undefined || idx >= MAIN_STAGES.length - 1) return null;
  return MAIN_STAGES[idx + 1];
}

/* ─────────────────── Root component ─────────────────── */

export default function CandidatePipeline() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();

  const [columns,        setColumns]        = useState({});
  const [loading,        setLoading]         = useState(true);
  const [requisitions,   setRequisitions]    = useState([]);
  const [addOpen,        setAddOpen]         = useState(false);
  const [form,           setForm]            = useState(EMPTY_FORM);
  const [saving,         setSaving]          = useState(false);
  const [activeCard,     setActiveCard]      = useState(null); // dragging ghost
  const [detailCandidate, setDetailCandidate] = useState(null); // detail modal
  const [advancing,      setAdvancing]       = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  /* ── data loading ── */
  const load = useCallback(() =>
    hrApi
      .getPipeline(user?.accessToken, user?.tokenType, companyScope)
      .then((res) => { if (res.status) setColumns(res.data || {}); })
      .catch((err) => toast.error(err.message || "Failed to load pipeline"))
      .finally(() => setLoading(false)),
  [user, companyScope]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => { setLoading(true); load(); };

  useEffect(() => {
    if (!user?.accessToken) return;
    load();
    hrApi
      .getRequisitions(user.accessToken, user.tokenType, { ...companyScope, status: "approved,posted", per_page: 100 })
      .then((res) => res.status && setRequisitions(res.data?.data || res.data || []))
      .catch(() => {});
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── derived list of all candidates ── */
  const allCandidates = useMemo(() => Object.values(columns).flat(), [columns]);

  /* ── drag handlers ── */
  const handleDragStart = ({ active }) => {
    setActiveCard(allCandidates.find((c) => String(c.id) === String(active.id)) || null);
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveCard(null);
    if (!over) return;
    const candidateId = active.id;
    const toStage     = over.id;
    const fromStage   = Object.keys(columns).find((s) =>
      columns[s].some((c) => String(c.id) === String(candidateId))
    );
    if (!fromStage || fromStage === toStage) return;

    // optimistic update
    setColumns((prev) => {
      const moved = prev[fromStage].find((c) => String(c.id) === String(candidateId));
      return {
        ...prev,
        [fromStage]: prev[fromStage].filter((c) => String(c.id) !== String(candidateId)),
        [toStage]:   [{ ...moved, stage: toStage }, ...(prev[toStage] || [])],
      };
    });

    // also keep detail modal in sync
    setDetailCandidate((prev) =>
      prev && String(prev.id) === String(candidateId) ? { ...prev, stage: toStage } : prev
    );

    try {
      const res = await hrApi.moveCandidateStage(candidateId, { to_stage: toStage }, user?.accessToken, user?.tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success(`Moved to ${stageLabel(toStage)}`);
    } catch (err) {
      toast.error(err.message || "Failed to move candidate");
      reload();
    }
  };

  /* ── advance from detail modal ── */
  const advanceTo = async (candidateId, toStage) => {
    setAdvancing(true);
    const fromStage = Object.keys(columns).find((s) =>
      columns[s].some((c) => String(c.id) === String(candidateId))
    );

    // optimistic
    setColumns((prev) => {
      if (!fromStage) return prev;
      const moved = prev[fromStage].find((c) => String(c.id) === String(candidateId));
      return {
        ...prev,
        [fromStage]: prev[fromStage].filter((c) => String(c.id) !== String(candidateId)),
        [toStage]:   [{ ...moved, stage: toStage }, ...(prev[toStage] || [])],
      };
    });
    setDetailCandidate((prev) => prev ? { ...prev, stage: toStage } : prev);

    try {
      const res = await hrApi.moveCandidateStage(candidateId, { to_stage: toStage }, user?.accessToken, user?.tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success(`Moved to ${stageLabel(toStage)}`);
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
      reload();
    } finally {
      setAdvancing(false);
    }
  };

  /* ── add candidate ── */
  const saveCandidate = async () => {
    if (!form.name.trim()) { toast.error("Candidate name is required"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        requisition_id:   form.requisition_id || null,
        experience_years: form.experience_years || null,
        skills: form.skills ? form.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
      };
      const res = await hrApi.storeCandidate(payload, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success("Candidate added");
        setAddOpen(false);
        setForm(EMPTY_FORM);
        reload();
      }
    } catch (err) {
      toast.error(err.message || "Failed to add candidate");
    } finally {
      setSaving(false);
    }
  };

  /* ── delete candidate ── */
  const deleteCandidate = async (id) => {
    if (!window.confirm("Delete this candidate?")) return;
    try {
      const res = await hrApi.deleteCandidate(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Candidate removed"); setDetailCandidate(null); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  /* ── open detail (click on card) ── */
  const openDetail = (candidate) => setDetailCandidate(candidate);
  const closeDetail = () => setDetailCandidate(null);

  /* ─────────── render ─────────── */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Drag cards between columns or click a card to advance through stages
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Add Candidate</Button>
      </div>

      {/* Kanban board */}
      {loading ? (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {ALL_COLUMNS.map((c) => (
            <div key={c.key} className="skeleton h-96 w-72 flex-shrink-0 rounded-2xl" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {ALL_COLUMNS.map((col) => (
              <KanbanColumn
                key={col.key}
                column={col}
                candidates={columns[col.key] || []}
                onOpenDetail={openDetail}
                onAdvance={advanceTo}
                user={user}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={null}>
            {activeCard ? <CandidateCard candidate={activeCard} dragging /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* ── Add Candidate Modal ── */}
      <Modal
        isOpen={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Candidate"
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={saveCandidate} disabled={saving}>{saving ? "Saving..." : "Add Candidate"}</Button>
          </div>
        }
      >
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
              <option value="referral">Referral</option>
              <option value="job_portal">Job Portal</option>
              <option value="linkedin">LinkedIn</option>
              <option value="walk_in">Walk-in</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Skills (comma separated)"><input className={inputClass} value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>

      {/* ── Candidate Detail / Stage Tracker Modal ── */}
      {detailCandidate && (
        <CandidateDetailModal
          candidate={detailCandidate}
          onClose={closeDetail}
          onAdvance={advanceTo}
          onDelete={deleteCandidate}
          advancing={advancing}
        />
      )}
    </div>
  );
}

/* ─────────────────── Kanban Column ─────────────────── */

function KanbanColumn({ column, candidates, onOpenDetail, onAdvance, user }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const isTerminal = ["rejected", "on_hold"].includes(column.key);

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 rounded-2xl border transition-colors ${
        isOver
          ? "border-brand-400 bg-brand-50/40 dark:bg-brand-900/10"
          : "border-gray-200 dark:border-gray-700"
      } bg-gray-50 dark:bg-gray-800/60 flex flex-col max-h-[calc(100vh-240px)]`}
    >
      {/* Column header */}
      <div className="px-4 py-3 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: column.color }}
          />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">{column.label}</span>
        </div>
        <Badge variant="gray">{candidates.length}</Badge>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2 overflow-y-auto flex-1">
        {candidates.map((c) => (
          <DraggableCandidateCard
            key={c.id}
            candidate={c}
            isTerminal={isTerminal}
            onOpenDetail={onOpenDetail}
            onAdvance={onAdvance}
          />
        ))}
        {candidates.length === 0 && (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-8">No candidates</p>
        )}
      </div>
    </div>
  );
}

/* ─────────────────── Draggable wrapper ─────────────────── */

function DraggableCandidateCard({ candidate, isTerminal, onOpenDetail, onAdvance }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: candidate.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.35 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style}>
      <CandidateCard
        candidate={candidate}
        isTerminal={isTerminal}
        dragHandleProps={{ ...listeners, ...attributes }}
        onOpenDetail={onOpenDetail}
        onAdvance={onAdvance}
      />
    </div>
  );
}

/* ─────────────────── Candidate Card ─────────────────── */

function CandidateCard({ candidate, dragging, isTerminal, dragHandleProps = {}, onOpenDetail, onAdvance }) {
  const next = !isTerminal ? nextMainStage(candidate.stage) : null;
  const currentIdx = STAGE_INDEX[candidate.stage];
  const totalMain  = MAIN_STAGES.length;
  const isMain     = currentIdx !== undefined;

  const handleCardClick = (e) => {
    // Don't open detail if clicking the advance button
    if (e.defaultPrevented) return;
    if (onOpenDetail) onOpenDetail(candidate);
  };

  const handleAdvanceClick = (e) => {
    e.preventDefault(); // prevent card click propagating
    if (next && onAdvance) onAdvance(candidate.id, next.key);
  };

  return (
    <div
      className={`rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden
        ${dragging ? "shadow-2xl ring-2 ring-brand-400" : "shadow-sm hover:shadow-md hover:border-brand-300 dark:hover:border-brand-600"}
        transition-all duration-150`}
    >
      {/* Drag handle + info area (click to open detail) */}
      <div
        className="p-3 cursor-pointer"
        onClick={handleCardClick}
        {...dragHandleProps}
      >
        {/* Name + priority */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[candidate.priority] || "bg-gray-400"}`} />
            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{candidate.name}</p>
          </div>
          <Badge variant={PRIORITY_VARIANT[candidate.priority] || "gray"} className="flex-shrink-0 text-[10px]">
            {candidate.priority}
          </Badge>
        </div>

        {/* Requisition */}
        {candidate.requisition?.title && (
          <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1 truncate">
            <Briefcase size={11} className="flex-shrink-0" />
            {candidate.requisition.title}
          </p>
        )}

        {/* Experience */}
        <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2">
          <GraduationCap size={11} className="flex-shrink-0" />
          {candidate.experience_years ?? 0} yrs
          {candidate.current_designation && ` · ${candidate.current_designation}`}
        </p>

        {/* Skills */}
        {Array.isArray(candidate.skills) && candidate.skills.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {candidate.skills.slice(0, 3).map((s) => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {s}
              </span>
            ))}
            {candidate.skills.length > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-400">
                +{candidate.skills.length - 3}
              </span>
            )}
          </div>
        )}

        {/* Mini progress stepper */}
        {isMain && (
          <MiniStepper currentIdx={currentIdx} total={totalMain} />
        )}
        {!isMain && (
          <span
            className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full mt-1"
            style={{ backgroundColor: `${stageColor(candidate.stage)}22`, color: stageColor(candidate.stage) }}
          >
            {stageLabel(candidate.stage)}
          </span>
        )}
      </div>

      {/* Advance button bar */}
      {next && !dragging && (
        <button
          onClick={handleAdvanceClick}
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold border-t border-gray-100 dark:border-gray-700
            text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
        >
          <ArrowRight size={12} />
          Move to {next.label}
        </button>
      )}
      {isTerminal && !dragging && (
        <div
          className="w-full flex items-center justify-center gap-1.5 py-1.5 text-xs font-semibold border-t border-gray-100 dark:border-gray-700"
          style={{ color: stageColor(candidate.stage), opacity: 0.8 }}
        >
          {candidate.stage === "rejected" ? <XCircle size={12} /> : <PauseCircle size={12} />}
          {stageLabel(candidate.stage)}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Mini stepper bar ─────────────────── */

function MiniStepper({ currentIdx, total }) {
  return (
    <div className="mt-2">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: total }).map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < currentIdx
                ? "bg-brand-500"
                : i === currentIdx
                ? "bg-brand-400"
                : "bg-gray-200 dark:bg-gray-600"
            }`}
          />
        ))}
      </div>
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
        Step {currentIdx + 1} of {total}
      </p>
    </div>
  );
}

/* ─────────────────── Candidate Detail Modal ─────────────────── */

function CandidateDetailModal({ candidate, onClose, onAdvance, onDelete, advancing }) {
  const currentIdx    = STAGE_INDEX[candidate.stage];
  const isTerminal    = ["rejected", "on_hold"].includes(candidate.stage);
  const next          = !isTerminal ? nextMainStage(candidate.stage) : null;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={null}
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          <button
            onClick={() => onDelete(candidate.id)}
            className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <Trash2 size={14} /> Delete
          </button>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Close</Button>
            {next && (
              <Button
                icon={<ArrowRight size={15} />}
                onClick={() => onAdvance(candidate.id, next.key)}
                disabled={advancing}
              >
                {advancing ? "Moving..." : `Advance to ${next.label}`}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* ── Header ── */}
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {candidate.name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white truncate">{candidate.name}</h2>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
              {candidate.email && (
                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Mail size={11} /> {candidate.email}
                </span>
              )}
              {candidate.phone && (
                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <PhoneIcon size={11} /> {candidate.phone}
                </span>
              )}
              {candidate.current_company && (
                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <MapPin size={11} /> {candidate.current_company}
                </span>
              )}
              {candidate.experience_years != null && (
                <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                  <Clock size={11} /> {candidate.experience_years} yrs exp
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1 mt-1.5">
              <Badge variant={PRIORITY_VARIANT[candidate.priority] || "gray"}>{candidate.priority} priority</Badge>
              {candidate.source && <Badge variant="gray">{candidate.source.replace("_", " ")}</Badge>}
              {candidate.requisition?.title && (
                <Badge variant="blue">{candidate.requisition.title}</Badge>
              )}
            </div>
          </div>
        </div>

        {/* ── Skills ── */}
        {Array.isArray(candidate.skills) && candidate.skills.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {candidate.skills.map((s) => (
                <span key={s} className="text-xs px-2.5 py-1 rounded-full bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 font-medium">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── Full Stage Progress Tracker ── */}
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-3 uppercase tracking-wide">
            Hiring Progress
          </p>

          {/* Main pipeline steps */}
          <div className="relative">
            {/* Connector line */}
            <div className="absolute left-4 top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700" />

            <div className="space-y-1">
              {MAIN_STAGES.map((stage, i) => {
                const isDone    = !isTerminal && i < currentIdx;
                const isCurrent = !isTerminal && i === currentIdx;
                const isFuture  = isTerminal || i > currentIdx;
                const isClickable = !isCurrent && !isDone && !isTerminal;

                return (
                  <div key={stage.key} className="flex items-center gap-3 relative">
                    {/* Icon */}
                    <div
                      className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all
                        ${isDone    ? "bg-green-100 dark:bg-green-900/30"  : ""}
                        ${isCurrent ? "ring-2 ring-offset-2 ring-brand-500 dark:ring-offset-gray-900" : ""}
                        ${isFuture  ? "bg-gray-100 dark:bg-gray-700" : ""}
                      `}
                      style={isCurrent ? { backgroundColor: `${stage.color}22` } : {}}
                    >
                      {isDone ? (
                        <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
                      ) : isCurrent ? (
                        <span
                          className="w-3 h-3 rounded-full animate-pulse"
                          style={{ backgroundColor: stage.color }}
                        />
                      ) : (
                        <Circle size={14} className="text-gray-400" />
                      )}
                    </div>

                    {/* Label + action */}
                    <div className="flex-1 flex items-center justify-between py-1.5 min-w-0">
                      <div>
                        <p
                          className={`text-sm font-medium transition-colors ${
                            isDone    ? "text-green-700 dark:text-green-400 line-through opacity-60"  : ""
                          } ${isCurrent ? "text-gray-900 dark:text-white font-semibold" : ""}
                          ${isFuture  ? "text-gray-400 dark:text-gray-500" : ""}`}
                        >
                          {stage.label}
                        </p>
                        {isCurrent && (
                          <p className="text-[11px] text-brand-600 dark:text-brand-400 font-medium">Current stage</p>
                        )}
                        {isDone && (
                          <p className="text-[11px] text-green-600 dark:text-green-400">Completed</p>
                        )}
                      </div>

                      {/* Quick jump button for future stages */}
                      {i === (isTerminal ? -1 : currentIdx + 1) && !isTerminal && (
                        <button
                          onClick={() => onAdvance(candidate.id, stage.key)}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                          style={{
                            backgroundColor: `${stage.color}18`,
                            color: stage.color,
                          }}
                        >
                          <ChevronRight size={13} /> Move here
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Terminal stage options */}
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 mb-2 uppercase tracking-wide">
              Terminal Actions
            </p>
            <div className="flex gap-2">
              {TERMINAL_STAGES.map((stage) => {
                const isActive = candidate.stage === stage.key;
                return (
                  <button
                    key={stage.key}
                    onClick={() => !isActive && onAdvance(candidate.id, stage.key)}
                    disabled={isActive}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors border
                      ${isActive
                        ? "cursor-default"
                        : "hover:opacity-80 cursor-pointer"
                      }`}
                    style={{
                      backgroundColor: isActive ? `${stage.color}22` : "transparent",
                      borderColor: `${stage.color}44`,
                      color: stage.color,
                    }}
                  >
                    {stage.key === "rejected" ? <XCircle size={13} /> : <PauseCircle size={13} />}
                    {stage.label}
                    {isActive && " ✓"}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Notes ── */}
        {candidate.notes && (
          <div>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Notes</p>
            <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
              {candidate.notes}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ─────────────────── Tiny helpers ─────────────────── */

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
