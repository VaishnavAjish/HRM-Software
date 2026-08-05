import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  Plus, Trash2, Link2, Eye, ShieldAlert, Clock, CheckCircle2,
  XCircle, FileQuestion, CalendarDays, Copy, RefreshCw,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useCompany } from "../../../context/CompanyContext";
import { hrApi } from "../../../utils/api";
import InterviewManagement from "./InterviewManagement";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const TABS = [
  { key: "interviews", label: "Interviews" },
  { key: "quizzes", label: "Interview Quizzes" },
  { key: "results", label: "Results & Proctoring" },
];

const ATTEMPT_VARIANT = {
  pending: "gray", in_progress: "yellow", submitted: "green",
  terminated: "red", expired: "gray",
};
const ATTEMPT_LABEL = {
  pending: "Not started", in_progress: "In progress", submitted: "Submitted",
  terminated: "Terminated", expired: "Expired",
};

const EMPTY_QUESTION = { text: "", options: ["", "", "", ""], correct_index: 0 };
const EMPTY_QUIZ = {
  title: "", description: "", interview_id: "", passing_score: 60,
  duration_minutes: 30, max_violations: 3,
  questions: [{ ...EMPTY_QUESTION, options: ["", "", "", ""] }],
};

/** The candidate-facing link for an attempt token. */
const quizLink = (token) => `${window.location.origin}/quiz/${token}`;

export default function InterviewHub() {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const [tab, setTab] = useState("interviews");

  const [quizzes, setQuizzes] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [interviews, setInterviews] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  const [quizModal, setQuizModal] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [quizForm, setQuizForm] = useState(EMPTY_QUIZ);
  const [savingQuiz, setSavingQuiz] = useState(false);

  const [assignTarget, setAssignTarget] = useState(null);
  const [assignCandidateId, setAssignCandidateId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [assignedLink, setAssignedLink] = useState(null);

  const [reportAttempt, setReportAttempt] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);

  const token = user?.accessToken;
  const tokenType = user?.tokenType;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [quizRes, attemptRes, interviewRes, candidateRes] = await Promise.all([
        hrApi.getQuizzes(token, tokenType, { ...companyScope, per_page: 100 }),
        hrApi.getQuizAttempts(token, tokenType, { ...companyScope, per_page: 100 }),
        hrApi.getInterviews(token, tokenType, { ...companyScope, per_page: 100 }),
        hrApi.getAssignableCandidates(token, tokenType, { ...companyScope }),
      ]);
      if (quizRes?.status) setQuizzes(quizRes.data?.data || quizRes.data || []);
      if (attemptRes?.status) setAttempts(attemptRes.data?.data || attemptRes.data || []);
      if (interviewRes?.status) setInterviews(interviewRes.data?.data || interviewRes.data || []);
      if (candidateRes?.status) setCandidates(candidateRes.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load interview data");
    } finally {
      setLoading(false);
    }
  }, [token, tokenType, companyScope]);

  useEffect(() => { load(); }, [load, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => ({
    quizzes: quizzes.length,
    assigned: attempts.length,
    submitted: attempts.filter((a) => a.status === "submitted").length,
    flagged: attempts.filter((a) => a.status === "terminated" || (a.violation_count ?? 0) > 0).length,
  }), [quizzes, attempts]);

  /* ---------------------------------------------------------------- quizzes */

  const openCreateQuiz = () => {
    setEditingQuiz(null);
    setQuizForm({ ...EMPTY_QUIZ, questions: [{ ...EMPTY_QUESTION, options: ["", "", "", ""] }] });
    setQuizModal(true);
  };

  const openEditQuiz = (q) => {
    setEditingQuiz(q);
    setQuizForm({
      title: q.title || "",
      description: q.description || "",
      interview_id: q.interview_id || "",
      passing_score: q.passing_score ?? 60,
      duration_minutes: q.duration_minutes ?? 30,
      max_violations: q.max_violations ?? 3,
      questions: (q.questions?.length ? q.questions : [EMPTY_QUESTION]).map((x) => ({
        text: x.text || "",
        options: x.options?.length ? [...x.options] : ["", "", "", ""],
        correct_index: x.correct_index ?? 0,
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
    const bad = quizForm.questions.findIndex(
      (q) => !q.text.trim() || q.options.filter((o) => o.trim()).length < 2,
    );
    if (bad !== -1) {
      toast.error(`Question ${bad + 1} needs text and at least 2 options`);
      return;
    }

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
      if (res.status) {
        toast.success(editingQuiz ? "Quiz updated" : "Quiz created");
        setQuizModal(false);
        load();
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
      if (res.status) { toast.success("Quiz deleted"); load(); }
    } catch (err) { toast.error(err.message || "Failed to delete quiz"); }
  };

  /* -------------------------------------------------------------- assigning */

  const assign = async () => {
    if (!assignCandidateId) { toast.error("Pick a candidate"); return; }
    setAssigning(true);
    try {
      const res = await hrApi.assignQuiz({
        quiz_id: assignTarget.id,
        candidate_id: assignCandidateId,
        interview_id: assignTarget.interview_id || null,
      }, token, tokenType);
      if (res.status) {
        toast.success("Quiz assigned");
        setAssignedLink(quizLink(res.data.access_token));
        setAssignTarget(null);
        setAssignCandidateId("");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to assign quiz");
    } finally {
      setAssigning(false);
    }
  };

  const revoke = async (id) => {
    if (!window.confirm("Revoke this attempt? The candidate's link will stop working.")) return;
    try {
      const res = await hrApi.revokeQuizAttempt(id, token, tokenType);
      if (res.status) { toast.success("Attempt revoked"); load(); }
    } catch (err) { toast.error(err.message || "Failed to revoke"); }
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

  const copy = (text) => {
    navigator.clipboard.writeText(text);
    toast.success("Link copied");
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2.5">
          <Stat label="Quizzes" value={stats.quizzes} icon={<FileQuestion size={15} />} />
          <Stat label="Assigned" value={stats.assigned} icon={<Link2 size={15} />} />
          <Stat label="Submitted" value={stats.submitted} icon={<CheckCircle2 size={15} />} tone="green" />
          <Stat label="Flagged" value={stats.flagged} icon={<ShieldAlert size={15} />} tone="red" />
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" icon={<RefreshCw size={15} />} onClick={load}>Refresh</Button>
          {tab === "quizzes" && <Button size="sm" icon={<Plus size={15} />} onClick={openCreateQuiz}>New Quiz</Button>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key
                ? "border-brand-500 text-brand-600 dark:text-brand-400"
                : "border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "interviews" && <InterviewManagement />}

      {tab === "quizzes" && (
        <Panel>
          {loading ? <div className="p-6"><SkeletonTable rows={5} /></div>
            : quizzes.length === 0 ? <Empty text="No interview quizzes yet. Create one to assess candidates." />
            : (
              <Table head={["Quiz", "For interview", "Questions", "Pass mark", "Time", "Assigned", ""]}>
                {quizzes.map((q) => (
                  <tr key={q.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <Td>
                      <p className="font-medium text-gray-900 dark:text-white">{q.title}</p>
                      {q.description && <p className="text-xs text-gray-400 truncate max-w-xs">{q.description}</p>}
                    </Td>
                    <Td muted>
                      {q.interview
                        ? `${q.interview.round_name}${q.interview.candidate ? ` — ${q.interview.candidate.name}` : ""}`
                        : q.requisition?.title || "—"}
                    </Td>
                    <Td muted>{q.questions?.length ?? 0}</Td>
                    <Td muted>{q.passing_score}%</Td>
                    <Td muted>{q.duration_minutes ?? 30} min</Td>
                    <Td muted>{q.attempts_count ?? 0}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <IconBtn title="Assign to candidate" onClick={() => { setAssignTarget(q); setAssignedLink(null); }}><Link2 size={14} /></IconBtn>
                        <IconBtn title="Edit" onClick={() => openEditQuiz(q)}><Eye size={14} /></IconBtn>
                        <IconBtn title="Delete" danger onClick={() => removeQuiz(q.id)}><Trash2 size={14} /></IconBtn>
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
        </Panel>
      )}

      {tab === "results" && (
        <Panel>
          {loading ? <div className="p-6"><SkeletonTable rows={5} /></div>
            : attempts.length === 0 ? <Empty text="No quiz has been assigned to a candidate yet." />
            : (
              <Table head={["Candidate", "Quiz", "Status", "Score", "Violations", "Submitted", ""]}>
                {attempts.map((a) => (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <Td>
                      <p className="font-medium text-gray-900 dark:text-white">{a.candidate?.name || "—"}</p>
                      <p className="text-xs text-gray-400">{a.candidate?.email}</p>
                    </Td>
                    <Td muted>{a.quiz?.title || "—"}</Td>
                    <Td><Badge variant={ATTEMPT_VARIANT[a.status] || "gray"}>{ATTEMPT_LABEL[a.status] || a.status}</Badge></Td>
                    <Td>
                      {["submitted", "terminated"].includes(a.status) ? (
                        <span className={`font-semibold ${a.passed ? "text-green-600" : "text-red-600"}`}>
                          {a.score}% {a.passed ? "Pass" : "Fail"}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </Td>
                    <Td>
                      {(a.violation_count ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1 text-red-600 font-semibold">
                          <ShieldAlert size={13} /> {a.violation_count}
                        </span>
                      ) : <span className="text-gray-400">Clean</span>}
                    </Td>
                    <Td muted>{a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}</Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        {a.status === "pending" && (
                          <IconBtn title="Copy candidate link" onClick={() => copy(quizLink(a.access_token))}><Copy size={14} /></IconBtn>
                        )}
                        <IconBtn title="View report" onClick={() => openReport(a)}><Eye size={14} /></IconBtn>
                        {a.status !== "submitted" && (
                          <IconBtn title="Revoke" danger onClick={() => revoke(a.id)}><Trash2 size={14} /></IconBtn>
                        )}
                      </div>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
        </Panel>
      )}

      {/* ------------------------------------------------------- quiz editor */}
      <Modal
        isOpen={quizModal}
        onClose={() => setQuizModal(false)}
        title={editingQuiz ? "Edit Quiz" : "New Interview Quiz"}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setQuizModal(false)}>Cancel</Button>
            <Button onClick={saveQuiz} disabled={savingQuiz}>{savingQuiz ? "Saving..." : "Save Quiz"}</Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Quiz Title" required full>
            <input className={inputClass} value={quizForm.title} onChange={(e) => setQuizForm({ ...quizForm, title: e.target.value })} />
          </Field>
          <Field label="Description" full>
            <textarea rows={2} className={inputClass} value={quizForm.description} onChange={(e) => setQuizForm({ ...quizForm, description: e.target.value })} />
          </Field>
          <Field label="For interview" full>
            <select className={inputClass} value={quizForm.interview_id} onChange={(e) => setQuizForm({ ...quizForm, interview_id: e.target.value })}>
              <option value="">— Not tied to a specific interview —</option>
              {interviews.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.round_name} — {i.candidate?.name || "Candidate"} ({i.scheduled_at ? new Date(i.scheduled_at).toLocaleDateString() : "unscheduled"})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Passing score (%)">
            <input type="number" min="0" max="100" className={inputClass} value={quizForm.passing_score} onChange={(e) => setQuizForm({ ...quizForm, passing_score: e.target.value })} />
          </Field>
          <Field label="Time limit (minutes)">
            <input type="number" min="1" max="480" className={inputClass} value={quizForm.duration_minutes} onChange={(e) => setQuizForm({ ...quizForm, duration_minutes: e.target.value })} />
          </Field>
          <Field label="Auto-terminate after N violations" full>
            <input type="number" min="1" max="20" className={inputClass} value={quizForm.max_violations} onChange={(e) => setQuizForm({ ...quizForm, max_violations: e.target.value })} />
            <p className="mt-1 text-xs text-gray-400">
              Leaving the quiz tab, exiting fullscreen or switching windows counts as a violation. Reaching
              this number ends the attempt automatically and records it as terminated.
            </p>
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
                <input
                  className={inputClass}
                  placeholder="Question text"
                  value={q.text}
                  onChange={(e) => setQuestion(i, { text: e.target.value })}
                />
                {quizForm.questions.length > 1 && (
                  <button
                    onClick={() => setQuizForm({ ...quizForm, questions: quizForm.questions.filter((_, x) => x !== i) })}
                    className="mt-1.5 p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                    title="Remove question"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${i}`}
                      checked={q.correct_index === oi}
                      onChange={() => setQuestion(i, { correct_index: oi })}
                      title="Mark as the correct answer"
                    />
                    <input
                      className={inputClass}
                      placeholder={`Option ${oi + 1}`}
                      value={opt}
                      onChange={(e) => {
                        const opts = [...q.options];
                        opts[oi] = e.target.value;
                        setQuestion(i, { options: opts });
                      }}
                    />
                  </label>
                ))}
              </div>
              <p className="mt-1.5 pl-7 text-xs text-gray-400">Select the radio button next to the correct answer.</p>
            </div>
          ))}
        </div>
      </Modal>

      {/* ----------------------------------------------------------- assign */}
      <Modal
        isOpen={Boolean(assignTarget)}
        onClose={() => setAssignTarget(null)}
        title={`Assign "${assignTarget?.title || ""}"`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setAssignTarget(null)}>Cancel</Button>
            <Button onClick={assign} disabled={assigning}>{assigning ? "Assigning..." : "Assign & Generate Link"}</Button>
          </div>
        }
      >
        <Field label="Candidate" required full>
          <select className={inputClass} value={assignCandidateId} onChange={(e) => setAssignCandidateId(e.target.value)}>
            <option value="">— Select candidate —</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name} {c.email ? `(${c.email})` : ""}</option>
            ))}
          </select>
        </Field>
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          A unique, single-use link is generated for this candidate. It expires in 7 days, works without a
          login, and can only be completed once.
        </p>
      </Modal>

      {/* Shown after assigning so the link can actually be copied out. */}
      <Modal
        isOpen={Boolean(assignedLink)}
        onClose={() => setAssignedLink(null)}
        title="Candidate quiz link"
        size="md"
        footer={<div className="flex justify-end"><Button onClick={() => setAssignedLink(null)}>Done</Button></div>}
      >
        <p className="text-sm text-gray-600 dark:text-gray-300">Send this link to the candidate:</p>
        <div className="mt-2 flex gap-2">
          <input readOnly value={assignedLink || ""} className={`${inputClass} font-mono text-xs`} />
          <Button size="sm" variant="secondary" icon={<Copy size={14} />} onClick={() => copy(assignedLink)}>Copy</Button>
        </div>
      </Modal>

      {/* ---------------------------------------------------------- report */}
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-500 dark:text-gray-400">
              <div><b>Started:</b> {reportAttempt.attempt.started_at ? new Date(reportAttempt.attempt.started_at).toLocaleString() : "—"}</div>
              <div><b>Submitted:</b> {reportAttempt.attempt.submitted_at ? new Date(reportAttempt.attempt.submitted_at).toLocaleString() : "—"}</div>
              <div className="truncate"><b>IP:</b> {reportAttempt.attempt.ip_address || "—"}</div>
              <div className="truncate" title={reportAttempt.attempt.user_agent}><b>Device:</b> {reportAttempt.attempt.user_agent || "—"}</div>
            </div>

            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Proctoring log</h4>
              {(reportAttempt.proctor_events || []).length === 0 ? (
                <p className="text-xs text-gray-400">No events recorded.</p>
              ) : (
                <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
                  {reportAttempt.proctor_events.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 px-3 py-2 text-xs">
                      {e.violation
                        ? <ShieldAlert size={13} className="mt-0.5 shrink-0 text-red-500" />
                        : <Clock size={13} className="mt-0.5 shrink-0 text-gray-400" />}
                      <div className="min-w-0 flex-1">
                        <span className={`font-semibold ${e.violation ? "text-red-600" : "text-gray-700 dark:text-gray-200"}`}>
                          {e.type}
                        </span>
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
                      {b.is_correct
                        ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green-500" />
                        : <XCircle size={15} className="mt-0.5 shrink-0 text-red-500" />}
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-100">Q{b.index + 1}. {b.text}</p>
                    </div>
                    <div className="mt-1.5 pl-6 text-xs">
                      <p className="text-gray-500 dark:text-gray-400">
                        Answered: <b className={b.is_correct ? "text-green-600" : "text-red-600"}>
                          {b.answered ? b.options[b.given_index] : "Not answered"}
                        </b>
                      </p>
                      {!b.is_correct && (
                        <p className="text-gray-500 dark:text-gray-400">Correct: <b className="text-green-600">{b.options[b.correct_index]}</b></p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ----------------------------------------------------------- small helpers */

function Panel({ children }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
      {children}
    </div>
  );
}

function Table({ head, children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
          <tr>
            {head.map((h, i) => (
              <th key={i} className={`px-4 py-3 ${i === head.length - 1 ? "text-right" : "text-left"}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, muted }) {
  return <td className={`px-4 py-3 ${muted ? "text-gray-600 dark:text-gray-300" : ""}`}>{children}</td>;
}

function IconBtn({ children, title, onClick, danger }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`p-1.5 rounded-lg ${danger
        ? "text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
        : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
    >
      {children}
    </button>
  );
}

function Empty({ text }) {
  return (
    <div className="py-16 text-center">
      <CalendarDays size={34} className="mx-auto mb-3 text-gray-300 dark:text-gray-600" />
      <p className="text-sm text-gray-500 dark:text-gray-400">{text}</p>
    </div>
  );
}

function Stat({ label, value, icon, tone }) {
  const toneCls = tone === "green" ? "text-green-600" : tone === "red" ? "text-red-600" : "text-gray-900 dark:text-white";
  return (
    <div className="w-32 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500 dark:text-gray-400">
        {icon} {label}
      </div>
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
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}
