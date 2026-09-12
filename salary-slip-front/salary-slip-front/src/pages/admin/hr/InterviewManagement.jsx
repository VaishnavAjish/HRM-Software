import { useCallback, useEffect, useState, useMemo } from "react";
import toast from "react-hot-toast";
import {
  CalendarClock, Video, MapPin, Phone, XCircle, PauseCircle,
  RotateCcw, CalendarPlus, ThumbsUp, ThumbsDown, Link2, AlertTriangle, Eye,
  Briefcase, ChevronRight, ArrowLeft, CheckSquare, UserX, Trash2,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import DatePicker from "../../../components/ui/DatePicker";
import { useAuth } from "../../../context/AuthContext";
import { hrApi, salaryApi } from "../../../utils/api";
import { stageLabel, MAIN_STAGES, TERMINAL_STAGES, STAGE_INDEX, promptRejectionReason } from "./hiring/stageMeta";
import CandidateDrawer from "./hiring/CandidateDrawer";
import useHrFilters from "./hiring/useHrFilters";
import HiringFilterBar from "./hiring/HiringFilterBar";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = { scheduled: "blue", completed: "green", cancelled: "red", rescheduled: "yellow", no_show: "gray" };
const MODE_ICON = { video: Video, onsite: MapPin, phone: Phone };
const PRIORITY_DOT = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

/** Everything this tab owns: a candidate lands here once Shortlisted hands
 *  them off, and leaves once they're proceeded to Selected (Offer tab) or
 *  rejected/held. Matches STAGE_GROUPS["Interview"] in stageMeta.js. There's
 *  a single "interview" stage — no separate HR/Technical/Final rounds. */
const INTERVIEW_STAGES = ["interview"];

const EMPTY_PROCEED_FORM = { rating: 4, recommendation: "yes", strengths: "", concerns: "", notes: "" };
const EMPTY_SCHEDULE = { scheduled_at: "", duration_minutes: 30, mode: "video", meeting_link: "", notes: "" };

/** The candidate's latest interview — there's only one round type now, so
 *  no round-name matching is needed, just the most recent one on file. */
function currentRoundInterview(candidate, interviews) {
  const matches = interviews.filter((iv) => String(iv.candidate_id) === String(candidate.id));
  return matches.reduce((latest, iv) => (!latest || iv.id > latest.id ? iv : latest), null);
}

function latestAttempt(candidateId, attempts) {
  const matches = (attempts || []).filter((a) => String(a.candidate_id) === String(candidateId));
  return matches.reduce((latest, a) => (!latest || a.id > latest.id ? a : latest), null);
}

export default function InterviewManagement({ departments = [], people = [] }) {
  const { user } = useAuth();
  const hr = useHrFilters("interview");
  const { debouncedSearch } = hr;
  const stageFilter = hr.filters.status;
  const requisitionFilter = hr.filters.requisitionId;
  const priorityFilter = hr.filters.priority;
  const recruiterFilter = hr.filters.recruiterId;

  const [interviews, setInterviews] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [attempts, setAttempts] = useState([]);
  const [drawerCandidate, setDrawerCandidate] = useState(null);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [bulkActing, setBulkActing] = useState(false);
  const [requisitions, setRequisitions] = useState([]);
  const [internalPeople, setInternalPeople] = useState([]);
  const peopleList = (people && people.length > 0) ? people : internalPeople;

  const toggleSelect = (id) => {
    hr.toggleSelected(id);
  };

  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleForm, setRescheduleForm] = useState(EMPTY_SCHEDULE);
  const [rescheduling, setRescheduling] = useState(false);
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE);
  const [scheduling, setScheduling] = useState(false);
  const [proceedTarget, setProceedTarget] = useState(null);
  const [proceedForm, setProceedForm] = useState(EMPTY_PROCEED_FORM);
  const [proceeding, setProceeding] = useState(false);

  const loadInterviews = () =>
    hrApi.getInterviews(user?.accessToken, user?.tokenType, { per_page: 100 })
      .then((res) => { if (res.status) setInterviews(res.data?.data || res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load interviews"));

  const loadRoster = useCallback(() => {
    if (!user?.accessToken) return;
    setRosterLoading(true);
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: INTERVIEW_STAGES.join(",") })
      .then((res) => { if (res.status) setRoster(res.data?.data || res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load candidates"))
      .finally(() => setRosterLoading(false));
  }, [user]);

  useEffect(() => {
    if (!user?.accessToken) return;
    loadInterviews();
    hrApi.getCandidates(user.accessToken, user.tokenType, { per_page: 100, stage: INTERVIEW_STAGES.join(",") })
      .then((res) => { if (res.status) setRoster(res.data?.data || res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load candidates"))
      .finally(() => setRosterLoading(false));

    hrApi.getQuizAttempts(user.accessToken, user.tokenType, { per_page: 100 })
      .then((res) => { if (res.status) setAttempts(res.data?.data || res.data || []); })
      .catch(() => {});

    hrApi.getRequisitions(user.accessToken, user.tokenType, { per_page: 100 })
      .then((res) => res.status && setRequisitions(res.data?.data || res.data || []))
      .catch(() => {});

    if (!people || people.length === 0) {
      salaryApi.getAllEmployees(user.accessToken, user.tokenType, { status: "Active", per_page: 200 })
        .then((res) => {
          const rows = res?.data?.data || res?.data || [];
          setInternalPeople(rows.map((r) => ({ id: r.id, name: r.name })));
        })
        .catch(() => {});
    }
  }, [user, people]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredRoster = useMemo(() => {
    let list = roster;
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((c) =>
        `${c.name} ${c.email || ""} ${c.requisition?.title || ""}`.toLowerCase().includes(q)
      );
    }
    if (requisitionFilter) {
      list = list.filter((c) => String(c.requisition?.id || c.requisition_id) === String(requisitionFilter));
    }
    if (priorityFilter) {
      list = list.filter((c) => c.priority === priorityFilter);
    }
    if (recruiterFilter) {
      list = list.filter((c) => String(c.recruiter_id) === String(recruiterFilter));
    }
    if (stageFilter) {
      list = list.filter((c) => {
        const iv = currentRoundInterview(c, interviews);
        return (iv?.status === stageFilter) || (c.stage === stageFilter);
      });
    }
    return list;
  }, [roster, interviews, debouncedSearch, requisitionFilter, priorityFilter, recruiterFilter, stageFilter]);

  const groupedCandidates = useMemo(() => {
    const groups = {};
    filteredRoster.forEach((c) => {
      const rawId = c.requisition?.id || c.requisition_id;
      const isDeleted = Boolean(c.requisition?.deleted_at);
      const reqId = rawId ? String(rawId) : "unassigned";

      if (!groups[reqId]) {
        groups[reqId] = {
          id: reqId,
          title: c.requisition?.title || (c.requisition_id ? `Requisition #${c.requisition_id}` : "General / Unassigned"),
          isDeleted,
          department: c.requisition?.department?.name || c.requisition?.department || "—",
          code: c.requisition?.code || "",
          candidates: [],
        };
      } else {
        if (isDeleted) groups[reqId].isDeleted = true;
        if ((!groups[reqId].title || groups[reqId].title.startsWith("Requisition #")) && c.requisition?.title) {
          groups[reqId].title = c.requisition.title;
        }
        if ((!groups[reqId].department || groups[reqId].department === "—") && (c.requisition?.department?.name || c.requisition?.department)) {
          groups[reqId].department = c.requisition?.department?.name || c.requisition?.department;
        }
      }
      groups[reqId].candidates.push(c);
    });

    return Object.values(groups).map((group) => {
      const scores = group.candidates
        .map((c) => (c.ats_score != null ? Number(c.ats_score) : null))
        .filter((s) => s !== null);
      const avgAts = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
      return {
        ...group,
        avgAts,
      };
    }).sort((a, b) => a.title.localeCompare(b.title));
  }, [filteredRoster]);

  const activeGroup = useMemo(() => {
    return groupedCandidates.find((g) => String(g.id) === String(selectedFolder)) || null;
  }, [groupedCandidates, selectedFolder]);

  const groupCandidateIds = useMemo(() => {
    return activeGroup ? activeGroup.candidates.map((c) => c.id) : [];
  }, [activeGroup]);

  const selectedInGroup = useMemo(() => {
    return hr.selectedIds.filter((id) => groupCandidateIds.includes(id));
  }, [hr.selectedIds, groupCandidateIds]);

  const allGroupSelected = groupCandidateIds.length > 0 && groupCandidateIds.every((id) => hr.selectedIds.includes(id));

  const handleToggleSelectAllGroup = () => {
    if (allGroupSelected) {
      hr.setAllSelected(hr.selectedIds.filter((id) => !groupCandidateIds.includes(id)));
    } else {
      hr.setAllSelected(Array.from(new Set([...hr.selectedIds, ...groupCandidateIds])));
    }
  };

  const handleBulkReject = async () => {
    if (selectedInGroup.length === 0) return;
    const reason = promptRejectionReason();
    if (!reason) return;

    setBulkActing(true);
    let ok = 0;
    for (const id of selectedInGroup) {
      try {
        const res = await hrApi.moveCandidateStage(id, { to_stage: "rejected", rejection_reason: reason }, user?.accessToken, user?.tokenType);
        if (res.status) ok++;
      } catch {
        // continue
      }
    }
    setBulkActing(false);
    toast.success(`Rejected ${ok} candidate${ok !== 1 ? "s" : ""}`);
    hr.setAllSelected(hr.selectedIds.filter((id) => !selectedInGroup.includes(id)));
    loadRoster();
    loadInterviews();
  };

  const handleBulkDelete = async () => {
    if (selectedInGroup.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedInGroup.length} selected candidate${selectedInGroup.length !== 1 ? "s" : ""}? This action cannot be undone.`)) {
      return;
    }

    setBulkActing(true);
    let ok = 0;
    for (const id of selectedInGroup) {
      try {
        const res = await hrApi.deleteCandidate(id, user?.accessToken, user?.tokenType);
        if (res.status) ok++;
      } catch {
        // continue
      }
    }
    setBulkActing(false);
    toast.success(`Deleted ${ok} candidate${ok !== 1 ? "s" : ""}`);
    hr.setAllSelected(hr.selectedIds.filter((id) => !selectedInGroup.includes(id)));
    loadRoster();
    loadInterviews();
  };

  const openProceed = (candidate) => {
    setProceedTarget(candidate);
    setProceedForm(EMPTY_PROCEED_FORM);
  };

  /** One decision point instead of separate Advance/Hold/Reject buttons —
   *  pick the outcome and write down why, in the same step. Rejecting
   *  requires notes or concerns (backend enforces it too). */
  const submitProceed = async (toStage) => {
    if (toStage === "rejected" && !proceedForm.notes.trim() && !proceedForm.concerns.trim()) {
      toast.error("Interview notes or concerns are required to reject a candidate");
      return;
    }
    setProceeding(true);
    try {
      const currentInterview = currentRoundInterview(proceedTarget, interviews);
      if (currentInterview) {
        await hrApi.submitInterviewFeedback(
          currentInterview.id,
          {
            rating: Number(proceedForm.rating),
            recommendation: proceedForm.recommendation,
            strengths: proceedForm.strengths,
            concerns: proceedForm.concerns,
            notes: proceedForm.notes,
          },
          user?.accessToken,
          user?.tokenType,
        ).catch(() => {});
      }

      const noteText = proceedForm.notes.trim() || proceedForm.concerns.trim() || proceedForm.strengths.trim() || undefined;
      const res = await hrApi.moveCandidateStage(
        proceedTarget.id,
        toStage === "rejected"
          ? { to_stage: toStage, rejection_reason: noteText }
          : { to_stage: toStage, notes: noteText },
        user?.accessToken,
        user?.tokenType,
      );
      if (!res.status) throw new Error(res.message);
      toast.success(toStage === "selected" ? "Candidate selected — sent to Offer" : `Marked ${stageLabel(toStage)}`);
      setProceedTarget(null);
      loadInterviews();
      loadRoster();
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    } finally {
      setProceeding(false);
    }
  };

  const openSchedule = (candidate) => {
    setScheduleTarget(candidate);
    setScheduleForm(EMPTY_SCHEDULE);
  };

  /** No "pick a candidate" dropdown — the row you clicked "Schedule" from
   *  already tells us who and which round; the modal just collects the
   *  round's own details. */
  const submitSchedule = async () => {
    if (!scheduleForm.scheduled_at) { toast.error("Pick a date & time"); return; }
    setScheduling(true);
    try {
      const res = await hrApi.storeInterview(
        {
          candidate_id: scheduleTarget.id,
          requisition_id: scheduleTarget.requisition_id || null,
          round_name: "Interview",
          ...scheduleForm,
        },
        user?.accessToken, user?.tokenType
      );
      if (!res.status) throw new Error(res.message);
      toast.success("Interview scheduled");
      setScheduleTarget(null);
      loadInterviews();
    } catch (err) {
      toast.error(err.message || "Failed to schedule");
    } finally {
      setScheduling(false);
    }
  };

  const cancelInterview = async (id) => {
    if (!window.confirm("Cancel this round?")) return;
    try {
      const res = await hrApi.deleteInterview(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Interview cancelled"); loadInterviews(); }
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
    }
  };

  const openReschedule = (interview, candidate) => {
    setRescheduleTarget({ interview, candidate });
    setRescheduleForm({
      scheduled_at: interview.scheduled_at || "",
      duration_minutes: interview.duration_minutes || 30,
      mode: interview.mode || "video",
      meeting_link: interview.meeting_link || "",
      notes: interview.notes || "",
    });
  };

  const submitReschedule = async () => {
    if (!rescheduleForm.scheduled_at) { toast.error("Pick a new date & time"); return; }
    setRescheduling(true);
    try {
      const res = await hrApi.rescheduleInterview(
        rescheduleTarget.interview.id,
        rescheduleForm,
        user?.accessToken,
        user?.tokenType,
      );
      if (res.status) {
        toast.success("Interview rescheduled");
        setRescheduleTarget(null);
        loadInterviews();
      } else {
        throw new Error(res.message);
      }
    } catch (err) {
      toast.error(err.message || "Failed to reschedule");
    } finally {
      setRescheduling(false);
    }
  };

  const deleteCandidate = async (id) => {
    if (!window.confirm("Are you sure you want to delete this candidate?")) return;
    try {
      const res = await hrApi.deleteCandidate(id, user?.accessToken, user?.tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success("Candidate deleted");
      setDrawerCandidate(null);
      loadRoster();
    } catch (err) {
      toast.error(err.message || "Failed to delete candidate");
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Every candidate who's been shortlisted lands here — schedule their interview, then proceed with a decision once it's done
      </p>

      <HiringFilterBar
        hr={hr}
        fields={["search", "recruiter", "requisition", "status", "priority"]}
        departments={departments}
        requisitions={requisitions}
        people={peopleList}
        statusOptions={[
          { value: "scheduled", label: "Scheduled" },
          { value: "completed", label: "Completed" },
          { value: "rescheduled", label: "Rescheduled" },
          { value: "cancelled", label: "Cancelled" },
          { value: "no_show", label: "No Show" },
        ]}
        priorityOptions={[
          { value: "low", label: "Low" },
          { value: "medium", label: "Medium" },
          { value: "high", label: "High" },
        ]}
      />

      {rosterLoading ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden p-6">
          <SkeletonTable rows={6} />
        </div>
      ) : roster.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden p-6">
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">
            No candidates in the interview process right now — they show up here once shortlisted from the Candidates tab.
          </p>
        </div>
      ) : !selectedFolder ? (
        /* ────────────────── Requisition List / Table View ────────────────── */
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50/70 dark:bg-gray-800/70 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <tr>
                  <th className="text-left px-5 py-3.5">Requisition Title</th>
                  <th className="text-left px-5 py-3.5">Department</th>
                  <th className="text-center px-5 py-3.5">Total Candidates</th>
                  <th className="text-center px-5 py-3.5">Avg ATS Score</th>
                  <th className="text-right px-5 py-3.5">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {groupedCandidates.map((group) => (
                  <tr
                    key={group.id}
                    onClick={() => setSelectedFolder(group.id)}
                    className="hover:bg-brand-50/40 dark:hover:bg-brand-900/15 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400 flex items-center justify-center font-bold text-sm shadow-sm group-hover:scale-105 transition-transform">
                          <Briefcase size={18} />
                        </div>
                        <div>
                          {group.isDeleted ? (
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-gray-500 dark:text-gray-400 text-sm line-through">
                                {group.title}
                              </span>
                              <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">
                                Deleted
                              </span>
                            </div>
                          ) : (
                            <p className="font-bold text-gray-900 dark:text-white text-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">
                              {group.title}
                            </p>
                          )}
                          {group.code && (
                            <span className="text-[11px] font-medium text-gray-400">
                              Code: {group.code}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-xs font-medium text-gray-600 dark:text-gray-300">
                      {group.department}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300 border border-brand-200 dark:border-brand-800 shadow-sm">
                        {group.candidates.length} Candidate{group.candidates.length !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      {group.avgAts != null ? (
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-black bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shadow-sm">
                          {group.avgAts}%
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setSelectedFolder(group.id)}
                        className="inline-flex items-center gap-1.5 hover:border-brand-300 dark:hover:border-brand-600"
                      >
                        <span>View Candidates</span>
                        <ChevronRight size={14} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ────────────────── Opened Requisition Candidate View ────────────────── */
        <div className="space-y-4">
          {(() => {
            if (!activeGroup) {
              setSelectedFolder(null);
              return null;
            }
            return (
              <>
                {/* Top Header Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setSelectedFolder(null);
                        hr.setAllSelected(hr.selectedIds.filter((id) => !groupCandidateIds.includes(id)));
                      }}
                      className="flex items-center gap-1.5 text-xs font-semibold"
                    >
                      <ArrowLeft size={15} /> All Requisitions
                    </Button>
                    <div>
                      <h2 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        {activeGroup.isDeleted ? (
                          <>
                            <span className="line-through text-gray-400 dark:text-gray-500">{activeGroup.title}</span>
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">
                              Deleted
                            </span>
                          </>
                        ) : (
                          activeGroup.title
                        )}
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {activeGroup.candidates.length} candidate{activeGroup.candidates.length !== 1 ? "s" : ""} in this pipeline
                      </p>
                    </div>
                  </div>
                </div>

                {/* Bulk Selection Actions Bar */}
                {selectedInGroup.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-brand-500 text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                    <div className="flex items-center gap-2 font-bold text-sm pl-2">
                      <CheckSquare size={18} />
                      <span>{selectedInGroup.length} candidate{selectedInGroup.length !== 1 ? "s" : ""} selected</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleBulkReject}
                        disabled={bulkActing}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold shadow-sm transition-all active:scale-95"
                      >
                        <UserX size={13} />
                        Reject
                      </button>
                      <button
                        onClick={handleBulkDelete}
                        disabled={bulkActing}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gray-900/80 hover:bg-black text-white text-xs font-bold shadow-sm transition-all active:scale-95"
                      >
                        <Trash2 size={13} />
                        Delete
                      </button>
                      <button
                        onClick={() => {
                          hr.setAllSelected(hr.selectedIds.filter((id) => !groupCandidateIds.includes(id)));
                        }}
                        className="px-2.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white/90 text-xs font-medium transition-all"
                      >
                        Deselect
                      </button>
                    </div>
                  </div>
                )}

                {/* Candidate Table */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                        <tr>
                          <th className="px-4 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={allGroupSelected}
                              onChange={handleToggleSelectAllGroup}
                              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                            />
                          </th>
                          <th className="text-left px-4 py-3">Candidate</th>
                          <th className="text-left px-4 py-3">ATS Score</th>
                          <th className="text-left px-4 py-3">Result</th>
                          <th className="text-left px-4 py-3">Status</th>
                          <th className="text-left px-4 py-3">Schedule</th>
                          <th className="text-right px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {activeGroup.candidates.map((c) => (
                          <RosterRow
                            key={c.id}
                            candidate={c}
                            interview={currentRoundInterview(c, interviews)}
                            attempt={latestAttempt(c.id, attempts)}
                            isSelected={hr.selectedIds.includes(c.id)}
                            onToggleSelect={toggleSelect}
                            onOpenSchedule={openSchedule}
                            onOpenProceed={openProceed}
                            onOpenDrawer={(cand) => setDrawerCandidate(cand)}
                            onReschedule={(iv) => openReschedule(iv, c)}
                            onCancel={cancelInterview}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      <Modal isOpen={!!scheduleTarget} onClose={() => setScheduleTarget(null)}
        title={`Schedule Interview — ${scheduleTarget?.name || ""}`} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setScheduleTarget(null)}>Cancel</Button><Button onClick={submitSchedule} disabled={scheduling}>{scheduling ? "Scheduling..." : "Schedule"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date & Time" required>
            <DatePicker withTime value={scheduleForm.scheduled_at} onChange={(v) => setScheduleForm({ ...scheduleForm, scheduled_at: v })} />
          </Field>
          <Field label="Duration (minutes)"><input type="number" className={inputClass} value={scheduleForm.duration_minutes} onChange={(e) => setScheduleForm({ ...scheduleForm, duration_minutes: e.target.value })} /></Field>
          <Field label="Mode">
            <select className={inputClass} value={scheduleForm.mode} onChange={(e) => setScheduleForm({ ...scheduleForm, mode: e.target.value })}>
              <option value="video">Video</option><option value="onsite">Onsite</option><option value="phone">Phone</option>
            </select>
          </Field>
          <Field label="Meeting Link / Location">
            <input className={inputClass} value={scheduleForm.meeting_link} onChange={(e) => setScheduleForm({ ...scheduleForm, meeting_link: e.target.value })} />
            {scheduleForm.mode === "video" && !scheduleForm.meeting_link && (
              <p className="mt-1 text-xs text-gray-400">Leave blank to auto-create a Google Meet, if configured. Paste a link (Zoom, etc.) to use that instead.</p>
            )}
          </Field>
          <Field label="Notes" full><textarea rows={2} className={inputClass} value={scheduleForm.notes} onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal isOpen={!!proceedTarget} onClose={() => setProceedTarget(null)} title={`Proceed — ${proceedTarget?.name || ""}`} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Rating (1-5)">
              <input
                type="number"
                min="1"
                max="5"
                className={inputClass}
                value={proceedForm.rating}
                onChange={(e) => setProceedForm({ ...proceedForm, rating: Number(e.target.value) })}
              />
            </Field>
            <Field label="Recommendation">
              <select
                className={inputClass}
                value={proceedForm.recommendation}
                onChange={(e) => setProceedForm({ ...proceedForm, recommendation: e.target.value })}
              >
                <option value="strong_yes">Strong Yes</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
                <option value="strong_no">Strong No</option>
              </select>
            </Field>
          </div>
          <Field label="Strengths" full>
            <textarea
              rows={2}
              className={inputClass}
              value={proceedForm.strengths}
              onChange={(e) => setProceedForm({ ...proceedForm, strengths: e.target.value })}
            />
          </Field>
          <Field label="Concerns" full>
            <textarea
              rows={2}
              className={inputClass}
              value={proceedForm.concerns}
              onChange={(e) => setProceedForm({ ...proceedForm, concerns: e.target.value })}
            />
          </Field>
          <Field label="Interview Notes" full>
            <textarea
              rows={3}
              className={inputClass}
              placeholder="How did the interview go? Required if rejecting..."
              value={proceedForm.notes}
              onChange={(e) => setProceedForm({ ...proceedForm, notes: e.target.value })}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => submitProceed("selected")}
              disabled={proceeding}
              className="flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 border-green-200 dark:border-green-900/50 bg-green-50 dark:bg-green-900/10 hover:bg-green-100 dark:hover:bg-green-900/20 text-green-700 dark:text-green-400 font-semibold transition-colors disabled:opacity-50"
            >
              <ThumbsUp size={22} /> Select
            </button>
            <button
              onClick={() => submitProceed("rejected")}
              disabled={proceeding}
              className="flex flex-col items-center gap-1.5 py-4 rounded-xl border-2 border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/10 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 font-semibold transition-colors disabled:opacity-50"
            >
              <ThumbsDown size={22} /> Reject
            </button>
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              onClick={() => submitProceed("on_hold")}
              disabled={proceeding}
              className="flex items-center gap-1.5 text-xs font-semibold text-yellow-600 hover:underline disabled:opacity-50"
            >
              <PauseCircle size={13} /> Put on hold instead
            </button>
            <Button variant="secondary" onClick={() => setProceedTarget(null)}>Cancel</Button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={!!rescheduleTarget}
        onClose={() => setRescheduleTarget(null)}
        title={`Reschedule Interview — ${rescheduleTarget?.candidate?.name || ""}`}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRescheduleTarget(null)}>Cancel</Button>
            <Button onClick={submitReschedule} disabled={rescheduling}>
              {rescheduling ? "Rescheduling..." : "Reschedule"}
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="New Date & Time" required>
            <DatePicker
              withTime
              value={rescheduleForm.scheduled_at}
              onChange={(v) => setRescheduleForm({ ...rescheduleForm, scheduled_at: v })}
            />
          </Field>
          <Field label="Duration (minutes)">
            <input
              type="number"
              className={inputClass}
              value={rescheduleForm.duration_minutes}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, duration_minutes: e.target.value })}
            />
          </Field>
          <Field label="Mode">
            <select
              className={inputClass}
              value={rescheduleForm.mode}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, mode: e.target.value })}
            >
              <option value="video">Video</option>
              <option value="onsite">Onsite</option>
              <option value="phone">Phone</option>
            </select>
          </Field>
          <Field label="Meeting Link / Location">
            <input
              className={inputClass}
              value={rescheduleForm.meeting_link}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, meeting_link: e.target.value })}
            />
            {rescheduleForm.mode === "video" && !rescheduleForm.meeting_link && (
              <p className="mt-1 text-xs text-gray-400">
                Leave blank to auto-create a Google Meet, if configured. Paste a link (Zoom, etc.) to use that instead.
              </p>
            )}
          </Field>
          <Field label="Notes" full>
            <textarea
              rows={2}
              className={inputClass}
              value={rescheduleForm.notes}
              onChange={(e) => setRescheduleForm({ ...rescheduleForm, notes: e.target.value })}
            />
          </Field>
        </div>
      </Modal>

      {drawerCandidate && (
        <CandidateDrawer
          candidate={drawerCandidate}
          onClose={() => setDrawerCandidate(null)}
          onDelete={deleteCandidate}
          hideCrmSections={true}
          hideAdvanceButton={true}
          mainStages={MAIN_STAGES}
          terminalStages={TERMINAL_STAGES}
          stageIndex={STAGE_INDEX}
          ownedStages={INTERVIEW_STAGES}
        />
      )}
    </div>
  );
}

/** One row per candidate. "Schedule Interview" opens a proper modal — the
 *  row already tells the modal who and which round, so there's no
 *  candidate picker in it, just the round's own details. */
function RosterRow({ candidate, interview, attempt, isSelected, onToggleSelect, onOpenSchedule, onOpenProceed, onOpenDrawer, onReschedule, onCancel }) {
  const ModeIcon = interview ? (MODE_ICON[interview.mode] || Video) : null;
  const avgRating = interview?.feedback?.length
    ? (interview.feedback.reduce((s, f) => s + (f.rating || 0), 0) / interview.feedback.length).toFixed(1)
    : null;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 align-top">
      <td className="px-4 py-3.5 w-8" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onToggleSelect(candidate.id)}
          className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
        />
      </td>
      <td className="px-4 py-3.5">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm ${PRIORITY_DOT[candidate.priority] || "bg-gray-400"}`} />
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 dark:text-white truncate">{candidate.name}</p>
            {candidate.email ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{candidate.email}</p>
            ) : candidate.requisition?.title ? (
              <p className="text-xs text-gray-400 truncate mt-0.5">{candidate.requisition.title}</p>
            ) : null}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {candidate.ats_score != null ? (
          <span className="inline-flex text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shadow-sm">
            {candidate.ats_score}%
          </span>
        ) : (
          <span className="text-xs text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {attempt && ["submitted", "terminated"].includes(attempt.status) ? (
          <span className={`font-semibold ${attempt.passed ? "text-green-600" : "text-red-600"}`}>
            {attempt.score}% {attempt.passed ? "Pass" : "Fail"}
          </span>
        ) : (
          <span className="text-gray-400 text-xs">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {interview && <Badge variant={STATUS_VARIANT[interview.status] || "gray"}>{interview.status?.replace("_", " ")}</Badge>}
        {avgRating && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">★ {avgRating}</span>}
      </td>
      <td className="px-4 py-3">
        {interview ? (
          <div>
            <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
              <CalendarClock size={14} className="flex-shrink-0" />
              {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : "—"}
              {ModeIcon && <ModeIcon size={14} className="flex-shrink-0 ml-1" />}
            </div>
            {interview.mode === "video" && (
              <div className="mt-1 flex items-center gap-1 text-xs">
                {interview.meeting_status === "failed" ? (
                  <span className="flex items-center gap-1 text-red-500" title={interview.meeting_error || "Google Meet creation failed"}>
                    <AlertTriangle size={12} /> Meet link failed
                  </span>
                ) : interview.meeting_status === "not_configured" ? (
                  <span className="text-gray-400" title="Google Meet integration isn't set up — see docs/google-meet-setup.md">
                    Meet not configured
                  </span>
                ) : interview.meeting_link ? (
                  <a href={interview.meeting_link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-brand-600 hover:underline dark:text-brand-400">
                    <Link2 size={12} /> {interview.meeting_status === "created" ? "Google Meet" : "Meeting link"}
                  </a>
                ) : null}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => onOpenSchedule(candidate)}
            className="flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40"
          >
            <CalendarPlus size={13} /> Schedule Interview
          </button>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          <button
            title="View candidate details"
            onClick={() => onOpenDrawer(candidate)}
            className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <Eye size={14} />
          </button>
          {interview && (
            <>
              <button title="Reschedule" onClick={() => onReschedule(interview)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <RotateCcw size={14} />
              </button>
              {interview.status !== "cancelled" && (
                <button title="Cancel round" onClick={() => onCancel(interview.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  <XCircle size={14} />
                </button>
              )}
            </>
          )}
          <Button
            size="sm"
            onClick={() => onOpenProceed(candidate)}
            disabled={!interview || interview.status === "cancelled"}
            title={
              !interview
                ? "Schedule an interview first before proceeding"
                : interview.status === "cancelled"
                ? "Cannot proceed when interview is cancelled"
                : "Proceed with decision"
            }
          >
            Proceed
          </Button>
        </div>
      </td>
    </tr>
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
