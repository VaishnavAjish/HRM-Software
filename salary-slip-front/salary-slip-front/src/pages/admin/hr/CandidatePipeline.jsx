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
  ArrowRight,
  XCircle,
  PauseCircle,
  Users,
  List as ListIcon,
  LayoutGrid,
  Eye,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";
import { downloadExcel, downloadCSV } from "../../../utils/exportUtils";
import useHrFilters from "./hiring/useHrFilters";
import HiringFilterBar from "./hiring/HiringFilterBar";
import { runBulk } from "./hiring/bulkActions";
import CandidateDrawer from "./hiring/CandidateDrawer";
import {
  MAIN_STAGES, TERMINAL_STAGES, ALL_COLUMNS, STAGE_INDEX, STAGE_GROUPS,
  TAB_STAGE_KEYS, stageLabel, stageColor, nextMainStage,
} from "./hiring/stageMeta";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

/**
 * The Candidates tab only owns the sourcing funnel — Applied through
 * Shortlisted (plus rejecting/holding someone during that window). Once a
 * candidate reaches an interview stage, the Interview tab owns them; once
 * they're Selected, the Offer tab owns them; once the offer is accepted, the
 * Onboarding tab owns them. This is enforced by scoping every fetch here to
 * CANDIDATES_TAB_STAGES rather than by hiding rows client-side.
 */
const CANDIDATES_TAB_STAGES = TAB_STAGE_KEYS.candidates;
const CANDIDATES_TAB_GROUPS = STAGE_GROUPS.filter((g) => g.label === "Sourcing" || g.label === "Terminal");

const PRIORITY_VARIANT  = { high: "red", medium: "yellow", low: "gray" };
const PRIORITY_DOT      = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

const EMPTY_FORM = {
  requisition_id: "", name: "", email: "", phone: "", experience_years: "",
  current_company: "", current_designation: "", skills: "", source: "other",
  priority: "medium", notes: "",
};

/* ─────────────────── Root component ─────────────────── */

export default function CandidatePipeline({ people = [] }) {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();

  /** "list" is the default — scales to hundreds of candidates without loading
   *  every stage's full contents up front; "board" is the visual Kanban and
   *  "compact" is a denser single-line list, both opt-in. */
  const [view,            setView]            = useState("list");

  const [columns,        setColumns]        = useState({});
  const [loading,        setLoading]         = useState(true);
  const [requisitions,   setRequisitions]    = useState([]);
  const [addOpen,        setAddOpen]         = useState(false);
  const [form,           setForm]            = useState(EMPTY_FORM);
  const [saving,         setSaving]          = useState(false);
  const [activeCard,     setActiveCard]      = useState(null); // dragging ghost
  const [detailCandidate, setDetailCandidate] = useState(null); // drawer target
  const [detailLoading,  setDetailLoading]   = useState(false);
  const [advancing,      setAdvancing]       = useState(false);

  /* ── shared filters (list + board) — one filter bar, not per-tab duplicates ── */
  const hr = useHrFilters("candidates");
  const { debouncedSearch } = hr;
  const stageFilter       = hr.filters.status;
  const requisitionFilter = hr.filters.requisitionId;
  const priorityFilter    = hr.filters.priority;
  const recruiterFilter   = hr.filters.recruiterId;

  /* ── list view state ── */
  const [listCandidates, setListCandidates] = useState([]);
  const [listTotal,      setListTotal]      = useState(0);
  const [listPage,       setListPage]       = useState(1);
  const [listPerPage,    setListPerPage]    = useState(20);
  const [listLoading,    setListLoading]    = useState(true);

  useEffect(() => { setListPage(1); }, [debouncedSearch, stageFilter, requisitionFilter, scopeKey]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  /* ── board data loading (only while Board view is active) ── */
  const load = useCallback(() =>
    hrApi
      .getPipeline(user?.accessToken, user?.tokenType, { ...companyScope, requisition_id: requisitionFilter || undefined })
      .then((res) => { if (res.status) setColumns(res.data || {}); })
      .catch((err) => toast.error(err.message || "Failed to load pipeline"))
      .finally(() => setLoading(false)),
  [user, companyScope, requisitionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user?.accessToken || view !== "board") return;
    setLoading(true);
    load();
  }, [user, scopeKey, view, requisitionFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── list data loading (only while List view is active) ── */
  const loadList = useCallback(() => {
    if (!user?.accessToken) return;
    setListLoading(true);
    hrApi
      .getCandidates(user.accessToken, user.tokenType, {
        ...companyScope,
        page: listPage,
        per_page: listPerPage,
        search: debouncedSearch || undefined,
        // Only the stages this tab owns — a specific pick within that set,
        // or every stage in the set when nothing's picked. Never "all stages
        // ever", since interview/offer/onboarding candidates belong to their
        // own tabs now.
        stage: (stageFilter && CANDIDATES_TAB_STAGES.includes(stageFilter) ? stageFilter : CANDIDATES_TAB_STAGES.join(",")),
        requisition_id: requisitionFilter || undefined,
      })
      .then((res) => {
        if (!res.status) return;
        const payload = res.data;
        setListCandidates(payload?.data || []);
        setListTotal(payload?.total ?? (payload?.data?.length || 0));
      })
      .catch((err) => toast.error(err.message || "Failed to load candidates"))
      .finally(() => setListLoading(false));
  }, [user, companyScope, listPage, listPerPage, debouncedSearch, stageFilter, requisitionFilter]);

  useEffect(() => {
    if (view === "list") loadList();
  }, [view, loadList]);

  /* ── requisitions (needed by both views' filters + the Add Candidate form) ── */
  useEffect(() => {
    if (!user?.accessToken) return;
    hrApi
      .getRequisitions(user.accessToken, user.tokenType, { ...companyScope, status: "approved,posted", per_page: 100 })
      .then((res) => res.status && setRequisitions(res.data?.data || res.data || []))
      .catch(() => {});
  }, [user, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const reload = () => {
    if (view === "board") { setLoading(true); load(); }
    else { loadList(); }
  };

  /* ── derived list of all candidates (board drag ghost lookup) ── */
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

  /* ── advance from detail modal / list row / board card ──
     Patches whichever state currently holds the candidate (board columns
     and/or the list page), so this one function works no matter which
     view is active. */
  const advanceTo = async (candidateId, toStage) => {
    setAdvancing(true);

    setColumns((prev) => {
      const fromStage = Object.keys(prev).find((s) =>
        prev[s]?.some((c) => String(c.id) === String(candidateId))
      );
      if (!fromStage || fromStage === toStage) return prev;
      const moved = prev[fromStage].find((c) => String(c.id) === String(candidateId));
      return {
        ...prev,
        [fromStage]: prev[fromStage].filter((c) => String(c.id) !== String(candidateId)),
        [toStage]:   [{ ...moved, stage: toStage }, ...(prev[toStage] || [])],
      };
    });
    setListCandidates((prev) =>
      prev.map((c) => (String(c.id) === String(candidateId) ? { ...c, stage: toStage } : c))
    );
    setDetailCandidate((prev) => (prev && String(prev.id) === String(candidateId) ? { ...prev, stage: toStage } : prev));

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
      if (res.status) {
        toast.success("Candidate removed");
        setDetailCandidate(null);
        setListCandidates((prev) => prev.filter((c) => String(c.id) !== String(id)));
        reload();
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  /* ── open detail (click on card / row) — shows what's already in memory
     instantly, then enriches with stageHistory/interviews/offers via the one
     show() call CandidateController already supports, for the drawer's
     Timeline/Interviews/Offer sections. ── */
  const openDetail = (candidate) => {
    setDetailCandidate(candidate);
    setDetailLoading(true);
    hrApi.getCandidate(candidate.id, user?.accessToken, user?.tokenType)
      .then((res) => {
        if (!res.status) return;
        setDetailCandidate((prev) => (prev && String(prev.id) === String(candidate.id) ? { ...prev, ...res.data } : prev));
      })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  };
  const closeDetail = () => setDetailCandidate(null);

  /* ── bulk actions (List/Compact selection) ── */
  const bulkMoveStage = (toStage) => {
    if (!toStage) return;
    runBulk(hr.selectedIds, (id) => hrApi.moveCandidateStage(id, { to_stage: toStage }, user?.accessToken, user?.tokenType), {
      successLabel: "moved", onDone: () => { hr.clearSelected(); reload(); },
    });
  };
  const bulkExportSelected = (format) => {
    const selected = listCandidates.filter((c) => hr.selectedIds.includes(c.id));
    const exportRows = selected.map((c) => ({
      Name: c.name, Email: c.email || "—", Requisition: c.requisition?.title || "—",
      Stage: stageLabel(c.stage), Experience: c.experience_years ?? 0, Priority: c.priority, Source: c.source || "—",
    }));
    if (format === "excel") downloadExcel(exportRows, "candidates");
    else downloadCSV(exportRows, "candidates");
  };

  const listCandidatesFiltered = useMemo(() => {
    let r = listCandidates;
    if (priorityFilter) r = r.filter((c) => c.priority === priorityFilter);
    if (recruiterFilter) r = r.filter((c) => String(c.recruiter_id) === String(recruiterFilter));
    return r;
  }, [listCandidates, priorityFilter, recruiterFilter]);

  const filterFields = view === "board"
    ? ["search", "requisition", "recruiter", "priority"]
    : ["search", "requisition", "recruiter", "priority", "status"];

  /* ─────────── render ─────────── */
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0">
            {[
              { key: "list", label: "List", icon: ListIcon },
              { key: "compact", label: "Compact", icon: Users },
              { key: "board", label: "Board", icon: LayoutGrid },
            ].map((v, i) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${i > 0 ? "border-l border-gray-200 dark:border-gray-700" : ""} ${
                  view === v.key
                    ? "bg-brand-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                <v.icon size={15} /> {v.label}
              </button>
            ))}
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 hidden lg:block">
            {view === "board" ? "Drag cards or click a card to advance through stages" : "Search, filter and manage every candidate"}
          </p>
        </div>
        <Button icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Add Candidate</Button>
      </div>

      <HiringFilterBar
        hr={hr}
        fields={filterFields}
        requisitions={requisitions}
        people={people}
        statusOptions={ALL_COLUMNS.filter((c) => CANDIDATES_TAB_STAGES.includes(c.key)).map((c) => ({ value: c.key, label: c.label }))}
        priorityOptions={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]}
        bulkBar={view !== "board" ? (
          <>
            {/* Includes "HR Interview" as the one allowed hand-off target — bulk-transferring shortlisted candidates to the Interview tab. */}
            <select className="text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1" value="" onChange={(e) => bulkMoveStage(e.target.value)}>
              <option value="">Move to stage…</option>
              {ALL_COLUMNS.filter((c) => CANDIDATES_TAB_STAGES.includes(c.key) || c.key === "hr_interview").map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <button onClick={() => bulkExportSelected("excel")} className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:underline">Export Excel</button>
            <button onClick={() => bulkExportSelected("csv")} className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:underline">Export CSV</button>
          </>
        ) : null}
      />

      {view === "list" || view === "compact" ? (
        <CandidateListView
          compact={view === "compact"}
          loading={listLoading}
          candidates={listCandidatesFiltered}
          total={listTotal}
          page={listPage}
          perPage={listPerPage}
          onPageChange={setListPage}
          onPageSizeChange={setListPerPage}
          onOpenDetail={openDetail}
          onAdvance={advanceTo}
          selectedIds={hr.selectedIds}
          onToggleSelected={hr.toggleSelected}
          onSelectAll={hr.setAllSelected}
        />
      ) : loading ? (
        <div className="space-y-4">
          {CANDIDATES_TAB_GROUPS.map((group) => (
            <div key={group.label} className="grid gap-3" style={{ gridTemplateColumns: `repeat(${group.keys.length}, minmax(0, 1fr))` }}>
              {group.keys.map((key) => <div key={key} className="skeleton h-64 rounded-2xl" />)}
            </div>
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          {/* Groups stack vertically, full-width — each row's columns share
              the available width instead of the whole board scrolling
              sideways. 4 groups × up to 3 columns each fits any viewport. */}
          <div className="space-y-4">
            {CANDIDATES_TAB_GROUPS.map((group) => (
              <div key={group.label}>
                <p className="text-[11px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 px-1 mb-1.5">
                  {group.label}
                </p>
                <div
                  className="grid gap-3 rounded-2xl border border-gray-100 dark:border-gray-800 bg-gray-100/50 dark:bg-gray-900/30 p-2"
                  style={{ gridTemplateColumns: `repeat(${group.keys.length}, minmax(0, 1fr))` }}
                >
                  {group.keys.map((key) => {
                    let filtered = columns[key] || [];
                    if (debouncedSearch) {
                      const q = debouncedSearch.toLowerCase();
                      filtered = filtered.filter((c) => `${c.name} ${c.email || ""}`.toLowerCase().includes(q));
                    }
                    if (priorityFilter) filtered = filtered.filter((c) => c.priority === priorityFilter);
                    if (recruiterFilter) filtered = filtered.filter((c) => String(c.recruiter_id) === String(recruiterFilter));
                    return (
                      <KanbanColumn
                        key={key}
                        column={ALL_COLUMNS.find((c) => c.key === key)}
                        candidates={filtered}
                        onOpenDetail={openDetail}
                        onAdvance={advanceTo}
                        fluid
                      />
                    );
                  })}
                </div>
              </div>
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

      {/* ── Candidate profile drawer ── */}
      <CandidateDrawer
        candidate={detailCandidate}
        loadingDetail={detailLoading}
        onClose={closeDetail}
        onAdvance={advanceTo}
        onDelete={deleteCandidate}
        advancing={advancing}
        mainStages={MAIN_STAGES}
        terminalStages={TERMINAL_STAGES}
        stageIndex={STAGE_INDEX}
      />
    </div>
  );
}

/* ─────────────────── List View (default — scales to many candidates) ─────────────────── */

function CandidateListView({
  compact, loading, candidates, total, page, perPage, onPageChange, onPageSizeChange,
  onOpenDetail, onAdvance, selectedIds = [], onToggleSelected, onSelectAll,
}) {
  const allSelected = candidates.length > 0 && candidates.every((c) => selectedIds.includes(c.id));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {loading ? (
        <div className="p-6"><SkeletonTable rows={8} /></div>
      ) : candidates.length === 0 ? (
        <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No candidates match these filters</p>
      ) : compact ? (
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {candidates.map((c) => {
            const isTerminal = ["rejected", "on_hold"].includes(c.stage);
            const next = !isTerminal ? nextMainStage(c.stage) : null;
            return (
              <div key={c.id} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => onOpenDetail(c)}>
                <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={(e) => { e.stopPropagation(); onToggleSelected(c.id); }} onClick={(e) => e.stopPropagation()} />
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[c.priority] || "bg-gray-400"}`} />
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {c.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <p className="font-medium text-gray-900 dark:text-white truncate flex-1 min-w-0">{c.name}</p>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: `${stageColor(c.stage)}1a`, color: stageColor(c.stage) }}>
                  {stageLabel(c.stage)}
                </span>
                {next && (
                  <button title={`Move to ${next.label}`} onClick={(e) => { e.stopPropagation(); onAdvance(c.id, next.key); }} className="p-1 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 flex-shrink-0">
                    <ArrowRight size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 w-8">
                  <input type="checkbox" checked={allSelected} onChange={() => onSelectAll(allSelected ? [] : candidates.map((c) => c.id))} />
                </th>
                <th className="text-left px-4 py-3">Candidate</th>
                <th className="text-left px-4 py-3">Requisition</th>
                <th className="text-left px-4 py-3">Stage</th>
                <th className="text-left px-4 py-3">Experience</th>
                <th className="text-left px-4 py-3">Priority</th>
                <th className="text-left px-4 py-3">Recruiter</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {candidates.map((c) => {
                const isTerminal = ["rejected", "on_hold"].includes(c.stage);
                const next = !isTerminal ? nextMainStage(c.stage) : null;
                return (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => onOpenDetail(c)}>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => onToggleSelected(c.id)} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[c.priority] || "bg-gray-400"}`} />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                          {c.email && <p className="text-xs text-gray-400 truncate">{c.email}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.requisition?.title || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: `${stageColor(c.stage)}1a`, color: stageColor(c.stage) }}
                      >
                        {stageLabel(c.stage)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.experience_years ?? 0} yrs</td>
                    <td className="px-4 py-3"><Badge variant={PRIORITY_VARIANT[c.priority] || "gray"}>{c.priority}</Badge></td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{c.recruiter?.name || "—"}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                        {next && (
                          <button
                            title={`Move to ${next.label}`}
                            onClick={() => onAdvance(c.id, next.key)}
                            className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"
                          >
                            <ArrowRight size={15} />
                          </button>
                        )}
                        <button title="View details" onClick={() => onOpenDetail(c)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                          <Eye size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="px-4">
        <Pagination current={page} total={total} pageSize={perPage} onChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      </div>
    </div>
  );
}

/* ─────────────────── Kanban Column ─────────────────── */

function KanbanColumn({ column, candidates, onOpenDetail, onAdvance, fluid }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.key });
  const isTerminal = ["rejected", "on_hold"].includes(column.key);
  const isEmpty = candidates.length === 0;
  const StageIcon = column.icon;

  return (
    <div
      ref={setNodeRef}
      className={`${fluid ? "w-full min-w-0" : `flex-shrink-0 ${isEmpty ? "w-52" : "w-72"}`} rounded-2xl border overflow-hidden transition-all ${
        isOver
          ? "border-brand-400 bg-brand-50/40 dark:bg-brand-900/10"
          : "border-gray-200 dark:border-gray-700"
      } bg-white dark:bg-gray-800/60 flex flex-col ${fluid ? "max-h-[420px]" : "max-h-[calc(100vh-260px)]"}`}
    >
      {/* Colored accent */}
      <div className="h-1 w-full flex-shrink-0" style={{ backgroundColor: column.color }} />

      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 flex-shrink-0 bg-gray-50/70 dark:bg-gray-900/20">
        <div className="flex items-center gap-1.5 min-w-0">
          {StageIcon && (
            <StageIcon size={13} className="flex-shrink-0" style={{ color: column.color }} />
          )}
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate">{column.label}</span>
        </div>
        <Badge variant="gray" className="flex-shrink-0">{candidates.length}</Badge>
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
        {isEmpty && (
          <p className="text-[11px] text-gray-400 dark:text-gray-500 text-center py-6">No candidates</p>
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
