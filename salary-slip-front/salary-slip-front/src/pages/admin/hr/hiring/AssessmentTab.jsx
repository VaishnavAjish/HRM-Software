import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, Trash2, Link2, Eye, ShieldAlert, Clock, CheckCircle2, XCircle,
  FileQuestion, Copy, RefreshCw, ArrowRight, SkipForward, PauseCircle, ChevronDown,
} from "lucide-react";
import Button from "../../../../components/ui/Button";
import CandidateDrawer from "./CandidateDrawer";
import Badge from "../../../../components/ui/Badge";
import Modal from "../../../../components/ui/Modal";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import AssignAssessmentModal from "./AssignAssessmentModal";
import RevokeAssessmentDialog from "./RevokeAssessmentDialog";
import { useAuth } from "../../../../context/AuthContext";
import { useAuthorization } from "../../../../hooks/useAuthorization";
import { hrApi } from "../../../../utils/api";
import { TAB_STAGE_KEYS, promptRejectionReason, MAIN_STAGES, TERMINAL_STAGES, STAGE_INDEX } from "./stageMeta";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const ASSESSMENT_STAGES = TAB_STAGE_KEYS.assessment;

const ATTEMPT_VARIANT = { pending: "gray", in_progress: "yellow", submitted: "green", terminated: "red", expired: "gray", revoked: "red" };
const ATTEMPT_LABEL = { pending: "Not started", in_progress: "In progress", submitted: "Submitted", terminated: "Terminated", expired: "Expired", revoked: "Revoked" };
const EMAIL_VARIANT = { not_requested: "gray", pending: "gray", queued: "yellow", sending: "yellow", sent: "green", failed: "red" };
const EMAIL_LABEL = { not_requested: "No email", pending: "Pending", queued: "Queued", sending: "Sending", sent: "Sent", failed: "Failed" };

const EMPTY_QUESTION = { text: "", options: ["", "", "", ""], correct_index: 0 };
const EMPTY_QUIZ = { title: "", description: "", interview_id: "", passing_score: 60, duration_minutes: 30, max_violations: 3, questions: [{ ...EMPTY_QUESTION, options: ["", "", "", ""] }] };

const quizLink = (token) => `${window.location.origin}/quiz/${token}`;

/** The candidate's latest attempt across any quiz — this tab shows one
 *  assessment decision per candidate, not a full attempt history. */
function latestAttempt(candidateId, attempts) {
  const matches = attempts.filter((a) => String(a.candidate_id) === String(candidateId));
  return matches.reduce((latest, a) => (!latest || a.id > latest.id ? a : latest), null);
}

/**
 * Sits between Candidates (sourcing) and Interview in the pipeline. A
 * candidate lands here once Shortlisted, and leaves once either an
 * assessment result comes back or HR chooses to skip straight to interview —
 * see TAB_STAGE_KEYS.assessment in stageMeta.js.
 */
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

  const [drawerCandidate, setDrawerCandidate] = useState(null);
  const [expandedReqs, setExpandedReqs] = useState({});
  const toggleReq = (id) => setExpandedReqs(p => ({ ...p, [id]: !p[id] }));

  const rosterByReq = useMemo(() => {
    const map = {};
    roster.forEach((c) => {
      const rid = c.requisition_id || "unassigned";
      if (!map[rid]) {
        map[rid] = {
          req: c.requisition || { id: "unassigned", title: "Unassigned / General" },
          candidates: [],
        };
      }
      map[rid].candidates.push(c);
    });
    return Object.values(map);
  }, [roster]);

  useEffect(() => {
    const init = {};
    rosterByReq.forEach((r) => { init[r.req.id] = true; });
    setExpandedReqs(init);
  }, [rosterByReq.length]);

  const [assignTarget, setAssignTarget] = useState(null); // candidate being assigned a quiz
  const [assignedLink, setAssignedLink] = useState(null);

  const [reportAttempt, setReportAttempt] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const [quizModal, setQuizModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [quizForm, setQuizForm] = useState(EMPTY_QUIZ);
  const [savingQuiz, setSavingQuiz] = useState(false);

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
    ]).then(([quizRes, attemptRes]) => {
      if (quizRes?.status) setQuizzes(quizRes.data?.data || quizRes.data || []);
      if (attemptRes?.status) setAttempts(attemptRes.data?.data || attemptRes.data || []);
    }).catch((err) => toast.error(err.message || "Failed to load assessment data"))
      .finally(() => setLoading(false));
  }, [token, tokenType]);

  useEffect(() => { loadRoster(); loadQuizData(); }, [loadRoster, loadQuizData]);
  const reload = () => { loadRoster(); loadQuizData(); };

  const stats = useMemo(() => ({
    waiting: roster.length,
    assigned: attempts.filter((a) => ["pending", "in_progress"].includes(a.status)).length,
    submitted: attempts.filter((a) => a.status === "submitted").length,
    flagged: attempts.filter((a) => a.status === "terminated" || (a.violation_count ?? 0) > 0).length,
  }), [roster, attempts]);

  /* --------------------------------------------------------- roster actions */

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

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success("Link copied"); };

  /* ----------------------------------------------------------- quiz library */

  const openCreateQuiz = () => {
    setEditingQuiz(null);
    setQuizForm({ ...EMPTY_QUIZ, questions: [{ ...EMPTY_QUESTION, options: ["", "", "", ""] }] });
    setQuizModal(true);
  };

  const openEditQuiz = (q) => {
    setEditingQuiz(q);
    setQuizForm({
      title: q.title || "", description: q.description || "", interview_id: q.interview_id || "",
      passing_score: q.passing_score ?? 60, duration_minutes: q.duration_minutes ?? 30, max_violations: q.max_violations ?? 3,
      questions: (q.questions?.length ? q.questions : [EMPTY_QUESTION]).map((x) => ({
        text: x.text || "", options: x.options?.length ? [...x.options] : ["", "", "", ""], correct_index: x.correct_index ?? 0,
      })),
    });
    setQuizModal(true);
  };

  const setQuestion = (i, patch) => {
    const next = [...quizForm.questions];
    next[i] = { ...next[i], ...patch };
    setQuizForm({ ...quizForm, questions: next });
  };

  const saveQuiz = async () => {
    if (!quizForm.title.trim()) { toast.error("Quiz title is required"); return; }
    const bad = quizForm.questions.findIndex((q) => !q.text.trim() || q.options.filter((o) => o.trim()).length < 2);
    if (bad !== -1) { toast.error(`Question ${bad + 1} needs text and at least 2 options`); return; }

    setSavingQuiz(true);
    try {
      const payload = {
        ...quizForm,
        interview_id: quizForm.interview_id || null,
        questions: quizForm.questions.map((q) => ({
          text: q.text.trim(),
          options: q.options.filter((o) => o.trim()),
          correct_index: Math.min(q.correct_index, q.options.filter((o) => o.trim()).length - 1),
        })),
      };
      const res = editingQuiz
        ? await hrApi.updateQuiz(editingQuiz.id, payload, token, tokenType)
        : await hrApi.storeQuiz(payload, token, tokenType);
      if (res.status) { toast.success(editingQuiz ? "Quiz updated" : "Quiz created"); setQuizModal(false); loadQuizData(); }
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

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {[{ key: "candidates", label: "Candidates" }, { key: "quizzes", label: "Quiz Library" }].map((t) => (
          <button
            key={t.key}
            onClick={() => setView(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              view === t.key ? "border-brand-500 text-brand-600 dark:text-brand-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

            {view === "candidates" && (
        <div className="space-y-4">
          {rosterLoading ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-6"><SkeletonTable rows={6} /></div>
          ) : roster.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700">
              <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">
                No one's awaiting an assessment decision — candidates show up here once shortlisted from the Candidates tab.
              </p>
            </div>
          ) : (
            rosterByReq.map(({ req, candidates }) => (
              <div key={req.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
                <div
                  className="flex cursor-pointer items-center justify-between bg-gray-50 dark:bg-gray-700/50 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700"
                  onClick={() => toggleReq(req.id)}
                >
                  <div className="flex items-center gap-2">
                    <ChevronDown size={18} className={`text-gray-400 transition-transform ${expandedReqs[req.id] ? "rotate-180" : ""}`} />
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{req.title}</h3>
                    <Badge variant="gray">{candidates.length}</Badge>
                  </div>
                </div>

                {expandedReqs[req.id] && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white dark:bg-gray-800 text-xs uppercase text-gray-500 dark:text-gray-400 border-t border-b border-gray-100 dark:border-gray-700">
                        <tr>
                          <th className="text-left px-4 py-3">Candidate</th>
                          <th className="text-left px-4 py-3">Assessment</th>
                          <th className="text-left px-4 py-3">Result</th>
                          <th className="text-right px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {candidates.map((c) => {
                          const attempt = latestAttempt(c.id, attempts);
                          const busy = actingId === c.id;
                          const finished = attempt && ["submitted", "terminated", "expired"].includes(attempt.status);
                          return (
                            <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 cursor-pointer" onClick={() => setDrawerCandidate(c)}>
                              <td className="px-4 py-3">
                                <p className="font-medium text-gray-900 dark:text-white">{c.name}</p>
                                {c.requisition?.title && <p className="text-xs text-gray-400">{c.requisition.title}</p>}
                              </td>
                              <td className="px-4 py-3">
                                {!attempt ? (
                                  <span className="text-gray-400 text-xs">No quiz assigned</span>
                                ) : (
                                  <div>
                                    <div className="flex items-center gap-1.5">
                                      <Badge variant={ATTEMPT_VARIANT[attempt.status] || "gray"}>{ATTEMPT_LABEL[attempt.status] || attempt.status}</Badge>
                                      {attempt.email_status && attempt.email_status !== "not_requested" && (
                                        <Badge variant={EMAIL_VARIANT[attempt.email_status] || "gray"}>{EMAIL_LABEL[attempt.email_status] || attempt.email_status}</Badge>
                                      )}
                                    </div>
                                    <span className="text-xs text-gray-400">{attempt.quiz?.title}</span>
                                    {attempt.status === "pending" && attempt.scheduled_start_at && new Date(attempt.scheduled_start_at) > new Date() && (
                                      <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">Opens {new Date(attempt.scheduled_start_at).toLocaleString()}</p>
                                    )}
                                    {attempt.status === "revoked" && attempt.revoke_reason && (
                                      <p className="mt-1 text-[11px] text-gray-400">Reason: {attempt.revoke_reason}</p>
                                    )}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3">
                                {attempt && ["submitted", "terminated"].includes(attempt.status) ? (
                                  <div className="space-y-1">
                                    <span className={`font-semibold ${attempt.passed ? "text-green-600" : "text-red-600"}`}>
                                      {attempt.score}% {attempt.passed ? "Pass" : "Fail"}
                                    </span>
                                    <div className="text-[11px] text-gray-400">
                                      {attempt.correct_count} / {attempt.total_questions} correct
                                    </div>
                                    {attempt.started_at && attempt.submitted_at && (
                                      <div className="text-[11px] text-gray-400">
                                        {Math.round((new Date(attempt.submitted_at) - new Date(attempt.started_at)) / 60000)} min taken
                                      </div>
                                    )}
                                    {(attempt.violation_count || 0) > 0 && (
                                      <div className="text-[11px] font-semibold text-red-500">
                                        {attempt.violation_count} Violations
                                      </div>
                                    )}
                                  </div>
                                ) : <span className="text-gray-400 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {!attempt && (
                                    <>
                                      {can("assessment.assign") && (
                                        <button disabled={busy} onClick={() => openAssign(c)}
                                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40 disabled:opacity-50">
                                          <Link2 size={13} /> Assign Quiz
                                        </button>
                                      )}
                                      <button disabled={busy} onClick={() => skipAssessment(c)}
                                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 disabled:opacity-50">
                                        <SkipForward size={13} /> Process without Assessment
                                      </button>
                                    </>
                                  )}
                                  {attempt && ["pending", "in_progress"].includes(attempt.status) && (
                                    <>
                                      <button title="Copy candidate link" onClick={() => copy(quizLink(attempt.access_token))} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Copy size={14} /></button>
                                      {can("assessment.resend_invitation") && attempt.email_status && attempt.email_status !== "not_requested" && (
                                        <button title="Resend invitation" disabled={resendingId === attempt.id} onClick={() => resend(attempt.id)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"><RefreshCw size={14} /></button>
                                      )}
                                      {can("assessment.revoke") && (
                                        <button title="Revoke" onClick={() => setRevokeTarget({ attempt, candidate: c })} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14} /></button>
                                      )}
                                    </>
                                  )}
                                  {finished && (
                                    <>
                                      <button title="View report" onClick={() => openReport(attempt)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Eye size={14} /></button>
                                      <button disabled={busy} title="Proceed to Interview" onClick={() => proceedToInterview(c)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 disabled:opacity-50">
                                        <ArrowRight size={13} /> Interview
                                      </button>
                                      <button disabled={busy} title="Reject" onClick={() => rejectCandidate(c)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"><XCircle size={14} /></button>
                                    </>
                                  )}
                                  <button disabled={busy} title="Put on hold" onClick={async () => {
                                    setActingId(c.id);
                                    try {
                                      const res = await hrApi.moveCandidateStage(c.id, { to_stage: "on_hold" }, token, tokenType);
                                      if (!res.status) throw new Error(res.message);
                                      toast.success("Marked On Hold"); reload();
                                    } catch (err) { toast.error(err.message || "Failed to update stage"); }
                                    finally { setActingId(null); }
                                  }} className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-50"><PauseCircle size={14} /></button>
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
            ))
          )}
        </div>
      )}

      {view === "quizzes" && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
          {loading ? <div className="p-6"><SkeletonTable rows={5} /></div>
            : quizzes.length === 0 ? <Empty text="No quizzes yet. Create one to assess candidates." />
            : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                    <tr>
                      <th className="text-left px-4 py-3">Quiz</th>
                      <th className="text-left px-4 py-3">Questions</th>
                      <th className="text-left px-4 py-3">Pass mark</th>
                      <th className="text-left px-4 py-3">Time</th>
                      <th className="text-left px-4 py-3">Assigned</th>
                      <th className="text-right px-4 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {quizzes.map((q) => (
                      <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3">
                          <p className="font-medium text-gray-900 dark:text-white">{q.title}</p>
                          {q.description && <p className="text-xs text-gray-400 truncate max-w-xs">{q.description}</p>}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{q.questions?.length ?? 0}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{q.passing_score}%</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{q.duration_minutes ?? 30} min</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{q.attempts_count ?? 0}</td>
                        <td className="px-4 py-3">
                          <div className="flex justify-end gap-1">
                            <button title="Edit" onClick={() => openEditQuiz(q)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Eye size={14} /></button>
                            <button title="Delete" onClick={() => removeQuiz(q.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {revokeTarget && (
        <RevokeAssessmentDialog
          candidateName={revokeTarget.candidate.name}
          onCancel={() => setRevokeTarget(null)}
          onConfirm={confirmRevoke}
          revoking={revoking}
        />
      )}

      {/* -------------------------------------------------------- assign modal */}
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

      <Modal isOpen={Boolean(assignedLink)} onClose={() => setAssignedLink(null)} title="Candidate quiz link" size="md"
        footer={<div className="flex justify-end"><Button onClick={() => setAssignedLink(null)}>Done</Button></div>}>
        <p className="text-sm text-gray-600 dark:text-gray-300">Already emailed to the candidate — here's the link if you also want to share it directly:</p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={assignedLink || ""} className={`${inputClass} font-mono text-xs`} />
          <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => copy(assignedLink)}>Copy</Button>
        </div>
      </Modal>

      {/* -------------------------------------------------------- quiz editor */}
      <Modal isOpen={quizModal} onClose={() => setQuizModal(false)} title={editingQuiz ? "Edit Quiz" : "New Quiz"} size="xl"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setQuizModal(false)}>Cancel</Button><Button onClick={saveQuiz} disabled={savingQuiz}>{savingQuiz ? "Saving..." : "Save Quiz"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Quiz Title" required full><input className={inputClass} value={quizForm.title} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} /></Field>
          <Field label="Description" full><textarea rows={2} className={inputClass} value={quizForm.description} onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })} /></Field>
          <Field label="Passing score (%)"><input type="number" min="0" max="100" className={inputClass} value={quizForm.passing_score} onChange={(e) => setQuizForm({ ...quizForm, passing_score: e.target.value })} /></Field>
          <Field label="Time limit (minutes)"><input type="number" min="1" max="480" className={inputClass} value={quizForm.duration_minutes} onChange={(e) => setQuizForm({ ...quizForm, duration_minutes: e.target.value })} /></Field>
          <Field label="Auto-terminate after N violations" full>
            <input type="number" min="1" max="20" className={inputClass} value={quizForm.max_violations} onChange={(e) => setQuizForm({ ...quizForm, max_violations: e.target.value })} />
            <p className="mt-1 text-xs text-gray-400">Leaving the quiz tab, exiting fullscreen or switching windows counts as a violation. Reaching this number ends the attempt automatically and records it as terminated.</p>
          </Field>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Questions</h4>
            <Button size="sm" variant="secondary" icon={<Plus size={14} />}
              onClick={() => setQuizForm({ ...quizForm, questions: [...quizForm.questions, { ...EMPTY_QUESTION, options: ["", "", "", ""] }] })}>
              Add question
            </Button>
          </div>

          {quizForm.questions.map((q, i) => (
            <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 text-xs font-bold text-gray-400">Q{i + 1}</span>
                <input className={inputClass} placeholder="Question text" value={q.text} onChange={(e) => setQuestion(i, { text: e.target.value })} />
                {quizForm.questions.length > 1 && (
                  <button onClick={() => setQuizForm({ ...quizForm, questions: quizForm.questions.filter((_, x) => x !== i) })}
                    className="mt-1.5 p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Remove question">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-2">
                    <input type="radio" name={`correct-${i}`} checked={q.correct_index === oi} onChange={() => setQuestion(i, { correct_index: oi })} title="Mark as the correct answer" />
                    <input className={inputClass} placeholder={`Option ${oi + 1}`} value={opt} onChange={(e) => {
                      const opts = [...q.options]; opts[oi] = e.target.value; setQuestion(i, { options: opts });
                    }} />
                  </label>
                ))}
              </div>
              <p className="mt-1.5 pl-7 text-xs text-gray-400">Select the radio button next to the correct answer.</p>
            </div>
          ))}
        </div>
      </Modal>

      {/* ------------------------------------------------------------ report */}
      <Modal isOpen={Boolean(reportAttempt)} onClose={() => setReportAttempt(null)} title="Attempt report" size="xl"
        footer={<div className="flex justify-end"><Button variant="secondary" onClick={() => setReportAttempt(null)}>Close</Button></div>}>
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
      {drawerCandidate && (
        <CandidateDrawer
          candidate={drawerCandidate}
          onClose={() => setDrawerCandidate(null)}
          onUpdated={(updated) => {
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

function Field({ label, required, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">{label}{required && <span className="text-red-500"> *</span>}</label>
    </div>
  );
}
