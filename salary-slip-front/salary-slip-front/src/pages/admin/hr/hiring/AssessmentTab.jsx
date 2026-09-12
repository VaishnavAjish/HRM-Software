import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { copyToClipboard } from "../../../../utils/clipboard";
import {
  Plus, Trash2, Link2, Eye, ShieldAlert, Clock, CheckCircle2, XCircle,
  FileQuestion, Copy, RefreshCw, ArrowRight, SkipForward, PauseCircle, Edit,
  FlaskConical, Briefcase, ArrowLeft, ChevronRight, CheckSquare, Zap, UserX,
  Search, Filter
} from "lucide-react";
import Button from "../../../../components/ui/Button";
import CandidateDrawer from "./CandidateDrawer";
import Badge from "../../../../components/ui/Badge";
import Modal from "../../../../components/ui/Modal";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import AssignAssessmentModal from "./AssignAssessmentModal";
import RevokeAssessmentDialog from "./RevokeAssessmentDialog";
import QuizWizardModal from "./QuizWizardModal";
import QuizViewModal from "./QuizViewModal";
import QuizTestModal from "./QuizTestModal";
import BulkAssignAtsModal from "./BulkAssignAtsModal";
import BulkAssignSelectedModal from "./BulkAssignSelectedModal";
import { useAuth } from "../../../../context/AuthContext";
import { useAuthorization } from "../../../../hooks/useAuthorization";
import { hrApi } from "../../../../utils/api";
import { TAB_STAGE_KEYS, promptRejectionReason, MAIN_STAGES, TERMINAL_STAGES, STAGE_INDEX } from "./stageMeta";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const ASSESSMENT_STAGES = ["assessment"];

const ATTEMPT_VARIANT = { pending: "gray", in_progress: "yellow", submitted: "green", terminated: "red", expired: "gray", revoked: "red" };
const ATTEMPT_LABEL = { pending: "Not started", in_progress: "In progress", submitted: "Submitted", terminated: "Terminated", expired: "Expired", revoked: "Revoked" };
const EMAIL_VARIANT = { not_requested: "gray", pending: "gray", queued: "yellow", sending: "yellow", sent: "green", failed: "red" };
const EMAIL_LABEL = { not_requested: "No email", pending: "Pending", queued: "Queued", sending: "Sending", sent: "Sent", failed: "Failed" };

const quizLink = (token) => `${window.location.origin}/quiz/${token}`;

/** The candidate's latest attempt across any quiz — this tab shows one
 *  assessment decision per candidate, not a full attempt history. */
function latestAttempt(candidateId, attempts) {
  const matches = attempts.filter((a) => String(a.candidate_id) === String(candidateId));
  return matches.reduce((latest, a) => (!latest || a.id > latest.id ? a : latest), null);
}

export default function AssessmentTab() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType;

  const [view, setView] = useState("candidates"); // candidates | quizzes
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState(null);

  const [selectedReq, setSelectedReq] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [reqSearch, setReqSearch] = useState("");
  const [candidateSearch, setCandidateSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [atsModalOpen, setAtsModalOpen] = useState(false);
  const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
  const [bulkActing, setBulkActing] = useState(false);

  const [drawerCandidate, setDrawerCandidate] = useState(null);

  const [assignTarget, setAssignTarget] = useState(null); // candidate being assigned a quiz
  const [assignedLink, setAssignedLink] = useState(null);

  const [reportAttempt, setReportAttempt] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [quizModal, setQuizModal] = useState(false);
  const [viewModal, setViewModal] = useState(false);
  const [testModal, setTestModal] = useState(false);
  const [viewingQuiz, setViewingQuiz] = useState(null);
  const [testingQuiz, setTestingQuiz] = useState(null);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [savingQuiz, setSavingQuiz] = useState(false);
  const [requisitionsList, setRequisitionsList] = useState([]);

  const openTestQuiz = (q) => {
    if (!q?.id) return;
    window.open(`/quiz/test/${q.id}`, "_blank");
  };

  const loadRoster = useCallback(() => {
    if (!token) return;
    setRosterLoading(true);
    hrApi.getCandidates(token, tokenType, { per_page: 100, stage: ASSESSMENT_STAGES.join(",") })
      .then((res) => { if (res.status) setRoster(res.data?.data || res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load candidates"))
      .finally(() => setRosterLoading(false));
  }, [token, tokenType]);

  const loadQuizData = useCallback(() => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      hrApi.getQuizzes(token, tokenType, { per_page: 100 }),
      hrApi.getQuizAttempts(token, tokenType, { per_page: 100 }),
      hrApi.getRequisitions(token, tokenType, { status: "approved,posted,published", per_page: 100 }).catch(() => ({ status: false })),
    ]).then(([quizRes, attemptRes, reqRes]) => {
      if (quizRes?.status) setQuizzes(quizRes.data?.data || quizRes.data || []);
      if (attemptRes?.status) setAttempts(attemptRes.data?.data || attemptRes.data || []);
      if (reqRes?.status) setRequisitionsList(reqRes.data?.data || reqRes.data || []);
    }).catch((err) => toast.error(err.message || "Failed to load assessment data"))
      .finally(() => setLoading(false));
  }, [token, tokenType]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRoster();
    loadQuizData();
  }, [loadRoster, loadQuizData]);
  const reload = () => { loadRoster(); loadQuizData(); };

  // Combined roster containing only candidates currently in the assessment stage
  const combinedRoster = useMemo(() => {
    const list = roster.filter((c) => ASSESSMENT_STAGES.includes(c.stage));
    const seenIds = new Set(list.map((c) => String(c.id)));
    attempts.forEach((a) => {
      const cand = a.candidate;
      if (cand && !seenIds.has(String(cand.id)) && ASSESSMENT_STAGES.includes(cand.stage)) {
        list.push({
          ...cand,
          requisition: cand.requisition,
          quizAttempts: [a],
        });
        seenIds.add(String(cand.id));
      }
    });
    return list;
  }, [roster, attempts]);

  const stats = useMemo(() => {
    const assessmentCandIds = new Set(combinedRoster.map((c) => String(c.id)));
    const assessmentAttempts = attempts.filter((a) => assessmentCandIds.has(String(a.candidate_id || a.candidate?.id)));
    return {
      waiting: combinedRoster.filter((c) => !latestAttempt(c.id, attempts)).length,
      assigned: assessmentAttempts.filter((a) => ["pending", "in_progress"].includes(a.status)).length,
      submitted: assessmentAttempts.filter((a) => a.status === "submitted").length,
      flagged: assessmentAttempts.filter((a) => a.status === "terminated" || (a.violation_count ?? 0) > 0).length,
    };
  }, [combinedRoster, attempts]);

  // Group candidates by Requisition for the main List/Table view
  const rosterByReq = useMemo(() => {
    const map = {};
    combinedRoster.forEach((c) => {
      const rawId = c.requisition?.id || c.requisition_id;
      const isDeleted = Boolean(c.requisition?.deleted_at);
      const rid = rawId ? String(rawId) : "unassigned";

      if (!map[rid]) {
        map[rid] = {
          id: rid,
          title: c.requisition?.title || (c.requisition_id ? `Requisition #${c.requisition_id}` : "General / Unassigned"),
          isDeleted,
          department: c.requisition?.department?.name || c.requisition?.department || "—",
          code: c.requisition?.code || "",
          candidates: [],
        };
      } else {
        if (isDeleted) map[rid].isDeleted = true;
        if ((!map[rid].title || map[rid].title.startsWith("Requisition #")) && c.requisition?.title) {
          map[rid].title = c.requisition.title;
        }
        if ((!map[rid].department || map[rid].department === "—") && (c.requisition?.department?.name || c.requisition?.department)) {
          map[rid].department = c.requisition?.department?.name || c.requisition?.department;
        }
      }
      map[rid].candidates.push(c);
    });

    return Object.values(map).map((group) => {
      const scores = group.candidates
        .map((c) => (c.ats_score != null ? Number(c.ats_score) : null))
        .filter((s) => s !== null);
      const avgAts = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

      const awaitingCount = group.candidates.filter((c) => !latestAttempt(c.id, attempts)).length;
      const inProgressCount = group.candidates.filter((c) => {
        const a = latestAttempt(c.id, attempts);
        return a && ["pending", "in_progress"].includes(a.status);
      }).length;
      const completedCount = group.candidates.filter((c) => {
        const a = latestAttempt(c.id, attempts);
        return a && ["submitted", "terminated"].includes(a.status);
      }).length;

      return {
        ...group,
        avgAts,
        awaitingCount,
        inProgressCount,
        completedCount,
      };
    }).sort((a, b) => a.title.localeCompare(b.title));
  }, [combinedRoster, attempts]);

  const filteredRequisitions = useMemo(() => {
    if (!reqSearch.trim()) return rosterByReq;
    const q = reqSearch.toLowerCase();
    return rosterByReq.filter(
      (g) => g.title.toLowerCase().includes(q) || String(g.department).toLowerCase().includes(q)
    );
  }, [rosterByReq, reqSearch]);

  const activeGroup = useMemo(() => {
    return rosterByReq.find((g) => String(g.id) === String(selectedReq)) || null;
  }, [rosterByReq, selectedReq]);

  const activeCandidatesFiltered = useMemo(() => {
    if (!activeGroup) return [];
    let list = activeGroup.candidates;
    if (candidateSearch.trim()) {
      const q = candidateSearch.toLowerCase();
      list = list.filter((c) => c.name?.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q));
    }
    if (statusFilter) {
      list = list.filter((c) => {
        const attempt = latestAttempt(c.id, attempts);
        if (statusFilter === "not_assigned") return !attempt;
        if (statusFilter === "in_progress") return attempt && ["pending", "in_progress"].includes(attempt.status);
        if (statusFilter === "submitted") return attempt && attempt.status === "submitted";
        if (statusFilter === "passed") return attempt && attempt.status === "submitted" && attempt.passed;
        if (statusFilter === "failed") return attempt && attempt.status === "submitted" && !attempt.passed;
        if (statusFilter === "flagged") return attempt && ((attempt.violation_count || 0) > 0 || attempt.status === "terminated");
        if (statusFilter === "revoked") return attempt && attempt.status === "revoked";
        return true;
      });
    }
    return list;
  }, [activeGroup, candidateSearch, statusFilter, attempts]);

  const groupCandidateIds = useMemo(() => {
    return activeCandidatesFiltered.map((c) => c.id);
  }, [activeCandidatesFiltered]);

  const selectedInGroup = useMemo(() => {
    return selectedIds.filter((id) => groupCandidateIds.includes(id));
  }, [selectedIds, groupCandidateIds]);

  const allGroupSelected = groupCandidateIds.length > 0 && groupCandidateIds.every((id) => selectedIds.includes(id));

  const toggleSelectAllGroup = () => {
    if (allGroupSelected) {
      setSelectedIds((prev) => prev.filter((id) => !groupCandidateIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...groupCandidateIds])));
    }
  };

  const toggleSelectCandidate = (id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const selectedCandidatesInGroup = useMemo(() => {
    if (!activeGroup) return [];
    return activeGroup.candidates.filter((c) => selectedInGroup.includes(c.id));
  }, [activeGroup, selectedInGroup]);

  /* --------------------------------------------------------- single roster actions */

  const openAssign = (candidate) => setAssignTarget(candidate);

  const onAssessmentAssigned = (accessToken) => {
    setAssignedLink(quizLink(accessToken));
    setAssignTarget(null);
    reload();
  };

  const skipAssessment = async (candidate) => {
    if (!window.confirm(`Skip the assessment and send ${candidate.name} straight to Interview?`)) return;
    setActingId(candidate.id);
    try {
      const res = await hrApi.moveCandidateStage(candidate.id, { to_stage: "interview" }, token, tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success("Moved to Interview");
      reload();
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    } finally {
      setActingId(null);
    }
  };

  const proceedToInterview = async (candidate) => {
    setActingId(candidate.id);
    try {
      const res = await hrApi.moveCandidateStage(candidate.id, { to_stage: "interview" }, token, tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success("Moved to Interview");
      reload();
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    } finally {
      setActingId(null);
    }
  };

  const rejectCandidate = async (candidate) => {
    const reason = promptRejectionReason();
    if (!reason) return;
    setActingId(candidate.id);
    try {
      const res = await hrApi.moveCandidateStage(candidate.id, { to_stage: "rejected", rejection_reason: reason }, token, tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success("Marked Rejected");
      reload();
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    } finally {
      setActingId(null);
    }
  };

  /* --------------------------------------------------------- bulk roster actions */

  const handleBulkMoveToInterview = async () => {
    if (selectedInGroup.length === 0) return;
    setBulkActing(true);
    let ok = 0;
    for (const id of selectedInGroup) {
      try {
        const res = await hrApi.moveCandidateStage(id, { to_stage: "interview" }, token, tokenType);
        if (res.status) ok++;
      } catch {
        // continue
      }
    }
    setBulkActing(false);
    toast.success(`Moved ${ok} candidate${ok !== 1 ? "s" : ""} to Interview`);
    setSelectedIds((prev) => prev.filter((id) => !selectedInGroup.includes(id)));
    reload();
  };

  const handleBulkReject = async () => {
    if (selectedInGroup.length === 0) return;
    const reason = promptRejectionReason();
    if (!reason) return;
    setBulkActing(true);
    let ok = 0;
    for (const id of selectedInGroup) {
      try {
        const res = await hrApi.moveCandidateStage(id, { to_stage: "rejected", rejection_reason: reason }, token, tokenType);
        if (res.status) ok++;
      } catch {
        // continue
      }
    }
    setBulkActing(false);
    toast.success(`Rejected ${ok} candidate${ok !== 1 ? "s" : ""}`);
    setSelectedIds((prev) => prev.filter((id) => !selectedInGroup.includes(id)));
    reload();
  };

  const handleBulkDelete = async () => {
    if (selectedInGroup.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedInGroup.length} selected candidate${selectedInGroup.length !== 1 ? "s" : ""}?`)) return;
    setBulkActing(true);
    let ok = 0;
    for (const id of selectedInGroup) {
      try {
        const res = await hrApi.deleteCandidate(id, token, tokenType);
        if (res.status) ok++;
      } catch {
        // continue
      }
    }
    setBulkActing(false);
    toast.success(`Deleted ${ok} candidate${ok !== 1 ? "s" : ""}`);
    setSelectedIds((prev) => prev.filter((id) => !selectedInGroup.includes(id)));
    reload();
  };

  const [revokeTarget, setRevokeTarget] = useState(null); // { attempt, candidate }
  const [revoking, setRevoking] = useState(false);

  const confirmRevoke = async (reason) => {
    setRevoking(true);
    try {
      const res = await hrApi.revokeQuizAttempt(revokeTarget.attempt.id, { reason }, token, tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success("Assessment access revoked — history preserved");
      setRevokeTarget(null);
      reload();
    } catch (err) {
      toast.error(err.message || "Failed to revoke");
    } finally {
      setRevoking(false);
    }
  };

  const [resendingId, setResendingId] = useState(null);
  const resend = async (id) => {
    setResendingId(id);
    try {
      const res = await hrApi.resendQuizInvitation(id, {}, token, tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success("Invitation resent");
      reload();
    } catch (err) {
      toast.error(err.message || "Assessment record kept, but the invitation could not be resent.");
    } finally {
      setResendingId(null);
    }
  };

  const openReport = async (a) => {
    setReportLoading(true);
    setReportAttempt({ attempt: a, breakdown: [], proctor_events: [] });
    try {
      const res = await hrApi.getQuizAttempt(a.id, token, tokenType);
      if (res.status) setReportAttempt(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to load the attempt report");
    } finally {
      setReportLoading(false);
    }
  };

  const copy = async (text) => { const ok = await copyToClipboard(text); if (ok) toast.success("Link copied"); else toast.error("Failed to copy link"); };

  /* ----------------------------------------------------------- quiz library */

  const openCreateQuiz = () => {
    setEditingQuiz(null);
    setQuizModal(true);
  };

  const openEditQuiz = (q) => {
    setEditingQuiz(q);
    setQuizModal(true);
  };

  const openViewQuiz = (q) => {
    setViewingQuiz(q);
    setViewModal(true);
  };

  const handleSaveQuiz = async (payload) => {
    setSavingQuiz(true);
    try {
      const res = editingQuiz
        ? await hrApi.updateQuiz(editingQuiz.id, payload, token, tokenType)
        : await hrApi.storeQuiz(payload, token, tokenType);
      if (res.status) {
        toast.success(editingQuiz ? "Quiz updated successfully" : "Quiz created successfully");
        setQuizModal(false);
        loadQuizData();
      } else {
        toast.error(res.message || "Failed to save quiz");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save quiz");
    } finally {
      setSavingQuiz(false);
    }
  };

  const removeQuiz = async (id) => {
    if (!window.confirm("Delete this quiz? Attempts already recorded against it will be removed too.")) return;
    try {
      const res = await hrApi.deleteQuiz(id, token, tokenType);
      if (res.status) { toast.success("Quiz deleted"); loadQuizData(); }
    } catch (err) { toast.error(err.message || "Failed to delete quiz"); }
  };

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Every candidate marked Shortlisted lands here — assign a quiz to assess them, or send them straight to Interview without one. Once a result comes back, proceed or reject with a reason.
      </p>

      {/* Top Stats Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2.5">
          <Stat label="Awaiting decision" value={stats.waiting} icon={<FileQuestion size={15} />} />
          <Stat label="Assigned" value={stats.assigned} icon={<Link2 size={15} />} />
          <Stat label="Submitted" value={stats.submitted} icon={<CheckCircle2 size={15} />} tone="green" />
          <Stat label="Flagged" value={stats.flagged} icon={<ShieldAlert size={15} />} tone="red" />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={reload}>Refresh</Button>
          {view === "quizzes" && <Button size="sm" icon={<Plus size={15} />} onClick={openCreateQuiz}>New Quiz</Button>}
        </div>
      </div>

      {/* View Tabs Header */}
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {[{ key: "candidates", label: "Candidates" }, { key: "quizzes", label: "Quiz Library" }].map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setView(t.key);
              setSelectedReq(null);
            }}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === t.key ? "border-brand-500 text-brand-600 dark:text-brand-400 font-bold" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {view === "candidates" && (
        <div className="space-y-4">
          {rosterLoading ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6">
              <SkeletonTable rows={6} />
            </div>
          ) : combinedRoster.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-12 text-center">
              <FileQuestion size={36} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                No candidates are awaiting an assessment decision.
              </p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Shortlist candidates from the Candidates tab to process assessments here.
              </p>
            </div>
          ) : !selectedReq ? (
            /* ────────────────── 1. Requisitions Summary Table View ────────────────── */
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50 dark:bg-gray-800/50">
                <div>
                  <h3 className="font-bold text-gray-900 dark:text-white text-base flex items-center gap-2">
                    <Briefcase size={18} className="text-brand-500" />
                    Assessment by Requisition
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Select any job requisition below to view candidates, track assessment results, and bulk assign quizzes.
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <input
                    type="text"
                    placeholder="Filter requisitions..."
                    value={reqSearch}
                    onChange={(e) => setReqSearch(e.target.value)}
                    className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3.5 py-2 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/70 dark:bg-gray-800/70 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                    <tr>
                      <th className="text-left px-5 py-3.5">Requisition Title</th>
                      <th className="text-left px-5 py-3.5">Department</th>
                      <th className="text-center px-5 py-3.5">In Assessment</th>
                      <th className="text-center px-5 py-3.5">Awaiting</th>
                      <th className="text-center px-5 py-3.5">In Progress</th>
                      <th className="text-center px-5 py-3.5">Completed</th>
                      <th className="text-center px-5 py-3.5">Avg ATS Score</th>
                      <th className="text-right px-5 py-3.5">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                    {filteredRequisitions.map((group) => (
                      <tr
                        key={group.id}
                        onClick={() => setSelectedReq(group.id)}
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
                        <td className="px-5 py-4 text-center text-xs font-semibold text-gray-600 dark:text-gray-300">
                          {group.awaitingCount}
                        </td>
                        <td className="px-5 py-4 text-center text-xs font-semibold text-amber-600 dark:text-amber-400">
                          {group.inProgressCount}
                        </td>
                        <td className="px-5 py-4 text-center text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {group.completedCount}
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
                            onClick={() => setSelectedReq(group.id)}
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
            /* ────────────────── 2. Active Requisition Candidates Pipeline View ────────────────── */
            <div className="space-y-4">
              {(() => {
                if (!activeGroup) {
                  setSelectedReq(null);
                  return null;
                }
                return (
                  <>
                    {/* Top Bar with Back button & Bulk Assign ATS button */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            setSelectedReq(null);
                            setSelectedIds([]);
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
                            {activeGroup.candidates.length} candidate{activeGroup.candidates.length !== 1 ? "s" : ""} in assessment
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="primary"
                          onClick={() => setAtsModalOpen(true)}
                          className="flex items-center gap-2 text-xs font-bold px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md shadow-amber-500/20"
                        >
                          <Zap size={14} className="fill-white" />
                          Bulk Assign Quiz by ATS
                        </Button>
                      </div>
                    </div>

                    {/* Filter Bar */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm">
                      <div className="relative flex-1 max-w-sm">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search candidates by name or email..."
                          value={candidateSearch}
                          onChange={(e) => setCandidateSearch(e.target.value)}
                          className="w-full rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-1.5 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Filter size={14} className="text-gray-400 flex-shrink-0" />
                        <select
                          value={statusFilter}
                          onChange={(e) => setStatusFilter(e.target.value)}
                          className="text-xs rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-gray-700 dark:text-gray-200 focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                        >
                          <option value="">All Assessment Statuses</option>
                          <option value="not_assigned">No Quiz Assigned / Awaiting</option>
                          <option value="in_progress">In Progress / Pending</option>
                          <option value="submitted">Submitted / Completed</option>
                          <option value="passed">Passed Assessment</option>
                          <option value="failed">Failed Assessment</option>
                          <option value="flagged">Flagged / Violations</option>
                          <option value="revoked">Revoked</option>
                        </select>
                      </div>
                    </div>

                    {/* Multi-Selection Bulk Action Toolbar */}
                    {selectedInGroup.length > 0 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-2xl bg-brand-500 text-white shadow-lg animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center gap-2 font-bold text-sm pl-2">
                          <CheckSquare size={18} />
                          <span>{selectedInGroup.length} candidate{selectedInGroup.length !== 1 ? "s" : ""} selected</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => setBulkAssignModalOpen(true)}
                            disabled={bulkActing}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white text-brand-700 hover:bg-brand-50 text-xs font-bold shadow-sm transition-all active:scale-95"
                          >
                            <Zap size={13} className="text-amber-500 fill-amber-500" />
                            Assign Quiz
                          </button>
                          <button
                            onClick={handleBulkMoveToInterview}
                            disabled={bulkActing}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm transition-all active:scale-95"
                          >
                            <ArrowRight size={13} />
                            Move to Interview
                          </button>
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
                              setSelectedIds((prev) => prev.filter((id) => !groupCandidateIds.includes(id)));
                            }}
                            className="px-2.5 py-1.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white/90 text-xs font-medium transition-all"
                          >
                            Deselect All
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Candidates Table */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                      {activeCandidatesFiltered.length === 0 ? (
                        <div className="py-12 text-center text-xs text-gray-500 dark:text-gray-400">
                          No candidates match the selected filters in this requisition.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-gray-50/70 dark:bg-gray-800/70 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                              <tr>
                                <th className="px-5 py-3 w-8" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={allGroupSelected}
                                    onChange={toggleSelectAllGroup}
                                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                  />
                                </th>
                                <th className="text-left px-5 py-3">Candidate</th>
                                <th className="text-left px-5 py-3">ATS Score</th>
                                <th className="text-left px-5 py-3">Assessment</th>
                                <th className="text-left px-5 py-3">Result</th>
                                <th className="text-right px-5 py-3">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                              {activeCandidatesFiltered.map((c) => {
                                const attempt = latestAttempt(c.id, attempts);
                                const busy = actingId === c.id;
                                const finished = attempt && ["submitted", "terminated", "expired"].includes(attempt.status);

                                return (
                                  <tr
                                    key={c.id}
                                    className="hover:bg-brand-50/30 dark:hover:bg-brand-900/10 cursor-pointer transition-colors"
                                    onClick={() => setDrawerCandidate(c)}
                                  >
                                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        type="checkbox"
                                        checked={selectedIds.includes(c.id)}
                                        onChange={() => toggleSelectCandidate(c.id)}
                                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                                      />
                                    </td>
                                    <td className="px-5 py-3.5">
                                      <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-brand-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0 shadow-sm">
                                          {c.name?.[0]?.toUpperCase() ?? "?"}
                                        </div>
                                        <div className="min-w-0">
                                          <p className="font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                                          {c.email && <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{c.email}</p>}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                      {c.ats_score != null ? (
                                        <span className="inline-flex text-[11px] font-bold px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-800 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shadow-sm">
                                          ATS: {c.ats_score}%
                                        </span>
                                      ) : (
                                        <span className="text-xs text-gray-400">—</span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                      {!attempt ? (
                                        <span className="inline-flex text-[11px] font-medium px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                                          No quiz assigned
                                        </span>
                                      ) : (
                                        <div>
                                          <div className="flex items-center gap-1.5">
                                            <Badge variant={ATTEMPT_VARIANT[attempt.status] || "gray"}>
                                              {ATTEMPT_LABEL[attempt.status] || attempt.status}
                                            </Badge>
                                            {attempt.email_status && attempt.email_status !== "not_requested" && (
                                              <Badge variant={EMAIL_VARIANT[attempt.email_status] || "gray"}>
                                                {EMAIL_LABEL[attempt.email_status] || attempt.email_status}
                                              </Badge>
                                            )}
                                          </div>
                                          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mt-1">
                                            {attempt.quiz?.title}
                                          </span>
                                          {attempt.status === "pending" && attempt.scheduled_start_at && new Date(attempt.scheduled_start_at) > new Date() && (
                                            <p className="mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                                              Opens {new Date(attempt.scheduled_start_at).toLocaleString()}
                                            </p>
                                          )}
                                          {attempt.status === "revoked" && attempt.revoke_reason && (
                                            <p className="mt-0.5 text-[11px] text-gray-400">Reason: {attempt.revoke_reason}</p>
                                          )}
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-5 py-3.5">
                                      {attempt && ["submitted", "terminated"].includes(attempt.status) ? (
                                        <div className="space-y-1">
                                          <span className={`font-black text-xs ${attempt.passed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                            {attempt.score}% {attempt.passed ? "Pass" : "Fail"}
                                          </span>
                                          <div className="text-[11px] text-gray-500 dark:text-gray-400">
                                            {attempt.correct_count} / {attempt.total_questions} correct
                                          </div>
                                          {attempt.started_at && attempt.submitted_at && (
                                            <div className="text-[11px] text-gray-400">
                                              {Math.round((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 60000)} min taken
                                            </div>
                                          )}
                                          {(attempt.violation_count || 0) > 0 && (
                                            <div className="text-[11px] font-bold text-red-500 flex items-center gap-1">
                                              <ShieldAlert size={12} />
                                              {attempt.violation_count} Violations
                                            </div>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-gray-400 text-xs">—</span>
                                      )}
                                    </td>
                                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                                      <div className="flex items-center justify-end gap-1.5">
                                        {!attempt && (
                                          <>
                                            {can("assessment.assign") && (
                                              <button
                                                disabled={busy}
                                                onClick={() => openAssign(c)}
                                                className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40 disabled:opacity-50 transition-colors"
                                              >
                                                <Link2 size={13} /> Assign Quiz
                                              </button>
                                            )}
                                            <button
                                              disabled={busy}
                                              onClick={() => skipAssessment(c)}
                                              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 disabled:opacity-50 transition-colors"
                                            >
                                              <SkipForward size={13} /> Process without Assessment
                                            </button>
                                          </>
                                        )}
                                        {attempt && ["pending", "in_progress"].includes(attempt.status) && (
                                          <>
                                            <button
                                              title="Copy candidate link"
                                              onClick={() => copy(quizLink(attempt.access_token))}
                                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                            >
                                              <Copy size={14} />
                                            </button>
                                            {can("assessment.resend_invitation") && attempt.email_status && attempt.email_status !== "not_requested" && (
                                              <button
                                                title="Resend invitation"
                                                disabled={resendingId === attempt.id}
                                                onClick={() => resend(attempt.id)}
                                                className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                                              >
                                                <RefreshCw size={14} />
                                              </button>
                                            )}
                                            {can("assessment.revoke") && (
                                              <button
                                                title="Revoke"
                                                onClick={() => setRevokeTarget({ attempt, candidate: c })}
                                                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                              >
                                                <Trash2 size={14} />
                                              </button>
                                            )}
                                          </>
                                        )}
                                        {finished && (
                                          <>
                                            <button
                                              title="View report"
                                              onClick={() => openReport(attempt)}
                                              className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                            >
                                              <Eye size={14} />
                                            </button>
                                            <button
                                              disabled={busy}
                                              title="Proceed to Interview"
                                              onClick={() => proceedToInterview(c)}
                                              className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50 transition-colors"
                                            >
                                              <ArrowRight size={13} /> Interview
                                            </button>
                                            <button
                                              disabled={busy}
                                              title="Reject"
                                              onClick={() => rejectCandidate(c)}
                                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                                            >
                                              <XCircle size={14} />
                                            </button>
                                          </>
                                        )}
                                        <button
                                          disabled={busy}
                                          title="Put on hold"
                                          onClick={async () => {
                                            setActingId(c.id);
                                            try {
                                              const res = await hrApi.moveCandidateStage(c.id, { to_stage: "on_hold" }, token, tokenType);
                                              if (!res.status) throw new Error(res.message);
                                              toast.success("Marked On Hold");
                                              reload();
                                            } catch (err) {
                                              toast.error(err.message || "Failed to update stage");
                                            } finally {
                                              setActingId(null);
                                            }
                                          }}
                                          className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-50 transition-colors"
                                        >
                                          <PauseCircle size={14} />
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
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── Quiz Library Tab ────────────────── */}
      {view === "quizzes" && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          {loading ? (
            <div className="p-6"><SkeletonTable rows={5} /></div>
          ) : quizzes.length === 0 ? (
            <Empty text="No quizzes yet. Create one to assess candidates." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50/70 dark:bg-gray-800/70 text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-5 py-3.5">Quiz</th>
                    <th className="text-left px-5 py-3.5">Questions</th>
                    <th className="text-left px-5 py-3.5">Pass Mark</th>
                    <th className="text-left px-5 py-3.5">Time Limit</th>
                    <th className="text-left px-5 py-3.5">Warnings Limit</th>
                    <th className="text-left px-5 py-3.5">Assigned</th>
                    <th className="text-right px-5 py-3.5">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {quizzes.map((q) => {
                    const qList = Array.isArray(q.questions) ? q.questions : [];
                    const mcqCount = qList.filter((item) => item.type !== "msq" && (!item.correct_indices || item.correct_indices.length <= 1)).length;
                    const msqCount = qList.length - mcqCount;
                    const totalMarks = qList.reduce((sum, item) => sum + (Number(item.marks) || 1), 0);

                    return (
                      <tr key={q.id} className="hover:bg-brand-50/30 dark:hover:bg-brand-900/10 transition-colors">
                        <td className="px-5 py-3.5">
                          <p className="font-semibold text-gray-900 dark:text-white">{q.title}</p>
                          {q.description && <p className="text-xs text-gray-400 truncate max-w-xs">{q.description}</p>}
                          {q.requisition?.title && (
                            <p className="text-[11px] text-brand-600 dark:text-brand-400 mt-0.5 font-medium">{q.requisition.title}</p>
                          )}
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">
                          <div>
                            <span className="font-medium text-gray-900 dark:text-white">{qList.length} Qs</span>
                            <span className="text-xs text-gray-400"> ({totalMarks} pts)</span>
                          </div>
                          {qList.length > 0 && (
                            <p className="text-[11px] text-gray-400">
                              {mcqCount > 0 ? `${mcqCount} MCQ` : ""}
                              {mcqCount > 0 && msqCount > 0 ? ", " : ""}
                              {msqCount > 0 ? `${msqCount} MSQ` : ""}
                            </p>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">{q.passing_score ?? 60}%</span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{q.duration_minutes ?? 30} min</td>
                        <td className="px-5 py-3.5">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40">
                            <ShieldAlert size={12} />
                            Max {q.max_violations ?? 3}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-gray-600 dark:text-gray-300">{q.attempts_count ?? 0}</td>
                        <td className="px-5 py-3.5">
                          <div className="flex justify-end items-center gap-1.5">
                            <button
                              type="button"
                              title="Test Quiz Simulator"
                              onClick={() => openTestQuiz(q)}
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30 border border-purple-200 dark:border-purple-800 transition-colors"
                            >
                              <FlaskConical size={13} />
                              Test
                            </button>
                            <button
                              type="button"
                              title="View Quiz Details & Questions"
                              onClick={() => openViewQuiz(q)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-gray-200 dark:border-gray-700 transition-colors"
                            >
                              <Eye size={13} />
                              View
                            </button>
                            <button
                              type="button"
                              title="Edit Quiz"
                              onClick={() => openEditQuiz(q)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold text-gray-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-gray-200 dark:border-gray-700 transition-colors"
                            >
                              <Edit size={13} />
                              Edit
                            </button>
                            <button
                              type="button"
                              title="Delete Quiz"
                              onClick={() => removeQuiz(q.id)}
                              className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-900/40 transition-colors"
                            >
                              <Trash2 size={14} />
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
        </div>
      )}

      {/* ────────────────── Modals & Drawers ────────────────── */}

      {/* Revoke dialog */}
      {revokeTarget && (
        <RevokeAssessmentDialog
          candidateName={revokeTarget.candidate.name}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={confirmRevoke}
          revoking={revoking}
        />
      )}

      {/* Single Assign modal */}
      {assignTarget && (
        <AssignAssessmentModal
          candidate={assignTarget}
          quizzes={quizzes}
          token={token}
          tokenType={tokenType}
          onClose={() => setAssignTarget(null)}
          onAssigned={onAssessmentAssigned}
        />
      )}

      {/* Bulk Assign by ATS modal */}
      {atsModalOpen && activeGroup && (
        <BulkAssignAtsModal
          isOpen={atsModalOpen}
          onClose={() => setAtsModalOpen(false)}
          requisitionTitle={activeGroup.title}
          isDeleted={activeGroup.isDeleted}
          candidates={activeGroup.candidates}
          quizzes={quizzes}
          token={token}
          tokenType={tokenType}
          onAssigned={reload}
        />
      )}

      {/* Bulk Assign Selected modal */}
      {bulkAssignModalOpen && selectedCandidatesInGroup.length > 0 && (
        <BulkAssignSelectedModal
          isOpen={bulkAssignModalOpen}
          onClose={() => setBulkAssignModalOpen(false)}
          selectedCandidates={selectedCandidatesInGroup}
          quizzes={quizzes}
          token={token}
          tokenType={tokenType}
          onAssigned={() => {
            setSelectedIds((prev) => prev.filter((id) => !groupCandidateIds.includes(id)));
            reload();
          }}
        />
      )}

      {/* Link modal */}
      <Modal
        isOpen={Boolean(assignedLink)}
        onClose={() => setAssignedLink(null)}
        title="Candidate quiz link"
        size="md"
        footer={<div className="flex justify-end"><Button onClick={() => setAssignedLink(null)}>Done</Button></div>}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">Already emailed to the candidate — here's the link if you also want to share it directly:</p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={assignedLink || ""} className={`${inputClass} font-mono text-xs`} />
          <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => copy(assignedLink)}>Copy</Button>
        </div>
      </Modal>

      {/* Quiz Wizard Modal */}
      <QuizWizardModal
        isOpen={quizModal}
        onClose={() => setQuizModal(false)}
        onSave={handleSaveQuiz}
        editingQuiz={editingQuiz}
        saving={savingQuiz}
        requisitions={requisitionsList}
      />

      {/* Quiz View Modal */}
      <QuizViewModal
        isOpen={viewModal}
        onClose={() => {
          setViewModal(false);
          setViewingQuiz(null);
        }}
        quiz={viewingQuiz}
        onEdit={(q) => openEditQuiz(q)}
        onTest={(q) => openTestQuiz(q)}
      />

      {/* Quiz Test Simulation Modal */}
      <QuizTestModal
        isOpen={testModal}
        onClose={() => {
          setTestModal(false);
          setTestingQuiz(null);
        }}
        quiz={testingQuiz}
      />

      {/* Attempt report */}
      <Modal
        isOpen={Boolean(reportAttempt)}
        onClose={() => setReportAttempt(null)}
        title="Attempt report"
        size="xl"
        footer={<div className="flex justify-end"><Button variant="secondary" onClick={() => setReportAttempt(null)}>Close</Button></div>}
      >
        {reportLoading ? <SkeletonTable rows={4} /> : reportAttempt && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Score" value={`${reportAttempt.attempt.score ?? 0}%`} tone={reportAttempt.attempt.passed ? "green" : "red"} />
              <Metric label="Correct" value={`${reportAttempt.attempt.correct_count ?? 0}/${reportAttempt.attempt.total_questions ?? 0}`} />
              <Metric label="Violations" value={reportAttempt.attempt.violation_count ?? 0} tone={(reportAttempt.attempt.violation_count ?? 0) > 0 ? "red" : "green"} />
              <Metric label="Result" value={ATTEMPT_LABEL[reportAttempt.attempt.status] || reportAttempt.attempt.status} />
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Proctoring log</h4>
              {(reportAttempt.proctor_events || []).length === 0 ? (
                <p className="text-xs text-gray-400">No events recorded.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                  {reportAttempt.proctor_events.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs">
                      {e.violation ? <ShieldAlert size={13} className="mt-0.5 shrink-0 text-red-500" /> : <Clock size={13} className="mt-0.5 shrink-0 text-gray-400" />}
                      <div className="min-w-0 flex-1">
                        <span className={`font-semibold ${e.violation ? "text-red-600" : "text-gray-700 dark:text-gray-200"}`}>{e.type}</span>
                        {e.detail && <span className="text-gray-500 dark:text-gray-400"> — {e.detail}</span>}
                      </div>
                      <span className="shrink-0 text-gray-400">{e.at ? new Date(e.at).toLocaleTimeString() : ""}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Answers</h4>
              <div className="space-y-2">
                {(reportAttempt.breakdown || []).map((b) => (
                  <div key={b.index} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
                    <div className="flex items-start gap-2">
                      {b.is_correct ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" /> : <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" />}
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Q{b.index + 1}. {b.text}</p>
                    </div>
                    <div className="mt-1.5 pl-6 text-xs">
                      <p className="text-gray-500 dark:text-gray-400">Answered: <b className={b.is_correct ? "text-green-600" : "text-red-600"}>{b.answered ? b.options[b.given_index] : "Not answered"}</b></p>
                      {!b.is_correct && <p className="text-gray-500 dark:text-gray-400">Correct: <b className="text-green-600">{b.options[b.correct_index]}</b></p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Drawer */}
      {drawerCandidate && (
        <CandidateDrawer
          candidate={drawerCandidate}
          onClose={() => setDrawerCandidate(null)}
          onUpdated={() => {
            reload();
          }}
          mainStages={MAIN_STAGES}
          terminalStages={TERMINAL_STAGES}
          stageIndex={STAGE_INDEX}
          ownedStages={TAB_STAGE_KEYS.assessment}
        />
      )}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="py-16 text-center">
      <FileQuestion size={34} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
    </div>
  );
}

function Stat({ label, value, icon, tone }) {
  const toneCls = tone === "green" ? "text-green-600" : tone === "red" ? "text-red-600" : "text-gray-900 dark:text-white";
  return (
    <div className="w-36 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">{icon} {label}</div>
      <div className={`text-xl font-bold tabular-nums ${toneCls}`}>{value}</div>
    </div>
  );
}

function Metric({ label, value, tone }) {
  const toneCls = tone === "green" ? "text-green-600" : tone === "red" ? "text-red-600" : "text-gray-900 dark:text-white";
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
      <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-lg font-bold ${toneCls}`}>{value}</p>
    </div>
  );
}
