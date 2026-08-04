import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Plus, CalendarClock, Video, MapPin, Phone, XCircle, PauseCircle, MessageSquareText, RotateCcw, ArrowRight, Briefcase, GraduationCap } from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";
import { stageLabel, nextMainStage } from "./hiring/stageMeta";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = { scheduled: "blue", completed: "green", cancelled: "red", rescheduled: "yellow", no_show: "gray" };
const MODE_ICON = { video: Video, onsite: MapPin, phone: Phone };
const PRIORITY_DOT = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

/** Everything this tab owns: a candidate lands here once Shortlisted hands
 *  them off, and leaves once they're advanced to Selected (Offer tab) or
 *  rejected/held. Matches STAGE_GROUPS["Interviews"] in stageMeta.js. */
const INTERVIEW_STAGES = ["hr_interview", "technical_interview", "final_interview"];
const ROUND_NAME_BY_STAGE = { hr_interview: "HR", technical_interview: "Technical", final_interview: "Final" };

const EMPTY_FORM = { candidate_id: "", round_name: "HR", scheduled_at: "", duration_minutes: 30, mode: "video", meeting_link: "", notes: "" };
const EMPTY_FEEDBACK = { rating: 4, recommendation: "yes", strengths: "", concerns: "", notes: "" };

export default function InterviewManagement() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [interviews, setInterviews] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [advancingId, setAdvancingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [feedback, setFeedback] = useState(EMPTY_FEEDBACK);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleAt, setRescheduleAt] = useState("");

  /**
   * Raises no spinner of its own — every state update happens in a promise
   * continuation. `loading` starts true, so the mount fetch needs none, and
   * turning it on from the effect was a synchronous setState that cost a
   * cascading render before the request had even been sent. Callers refetching
   * over an already-rendered list use reload().
   */
  const load = () =>
    hrApi
      .getInterviews(user?.accessToken, user?.tokenType, { per_page: 100 })
      .then((res) => {
        if (res.status) setInterviews(res.data?.data || res.data || []);
      })
      .catch((err) => toast.error(err.message || "Failed to load interviews"))
      .finally(() => setLoading(false));

  const reload = () => {
    setLoading(true);
    return load();
  };

  /** The roster of candidates this tab currently owns — everyone in an
   *  interview stage, regardless of whether a round is scheduled yet. */
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
    load();
    loadRoster();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  // The "Schedule Interview" dropdown only offers candidates this tab owns —
  // scheduling someone still in Sourcing is the Candidates tab's job.
  useEffect(() => { setCandidates(roster); }, [roster]);

  const scheduleFor = (candidate) => {
    setForm({ ...EMPTY_FORM, candidate_id: String(candidate.id), round_name: ROUND_NAME_BY_STAGE[candidate.stage] || "HR" });
    setModalOpen(true);
  };

  const advanceCandidate = async (candidate, toStage) => {
    setAdvancingId(candidate.id);
    try {
      const res = await hrApi.moveCandidateStage(candidate.id, { to_stage: toStage }, user?.accessToken, user?.tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success(toStage === "rejected" || toStage === "on_hold" ? `Marked ${stageLabel(toStage)}` : `Moved to ${stageLabel(toStage)}`);
      loadRoster();
    } catch (err) {
      toast.error(err.message || "Failed to update stage");
    } finally {
      setAdvancingId(null);
    }
  };

  const save = async () => {
    if (!form.candidate_id || !form.scheduled_at) { toast.error("Candidate and date/time are required"); return; }
    setSaving(true);
    try {
      const res = await hrApi.storeInterview(form, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Interview scheduled"); setModalOpen(false); setForm(EMPTY_FORM); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to schedule interview");
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (id) => {
    if (!window.confirm("Cancel this interview?")) return;
    try {
      const res = await hrApi.deleteInterview(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Interview cancelled"); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
    }
  };

  const submitReschedule = async () => {
    if (!rescheduleAt) { toast.error("Pick a new date/time"); return; }
    try {
      const res = await hrApi.rescheduleInterview(rescheduleTarget.id, { scheduled_at: rescheduleAt }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Interview rescheduled"); setRescheduleTarget(null); setRescheduleAt(""); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to reschedule");
    }
  };

  const submitFeedback = async () => {
    try {
      const res = await hrApi.submitInterviewFeedback(feedbackTarget.id, feedback, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Feedback submitted"); setFeedbackTarget(null); setFeedback(EMPTY_FEEDBACK); reload(); }
    } catch (err) {
      toast.error(err.message || "Failed to submit feedback");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <p className="text-sm text-gray-500 dark:text-gray-400">Every candidate who's been shortlisted lands here — scheduling, feedback, and advancing through rounds all happen in this tab</p>
        <Button icon={<Plus size={16} />} onClick={() => setModalOpen(true)}>Schedule Interview</Button>
      </div>

      {/* ── Candidates currently in the interview process ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Candidates in Interview</h2>
        {rosterLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {INTERVIEW_STAGES.map((s) => <div key={s} className="skeleton h-40 rounded-2xl" />)}
          </div>
        ) : roster.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 text-center py-8">
            No candidates in the interview process right now — they show up here once shortlisted from the Candidates tab.
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {INTERVIEW_STAGES.map((stageKey) => {
              const stageCandidates = roster.filter((c) => c.stage === stageKey);
              return (
                <div key={stageKey} className="rounded-2xl border border-gray-100 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
                  <div className="px-3 py-2.5 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/20">
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{stageLabel(stageKey)}</span>
                    <Badge variant="gray">{stageCandidates.length}</Badge>
                  </div>
                  <div className="p-2 space-y-2 max-h-80 overflow-y-auto">
                    {stageCandidates.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-6">No candidates</p>
                    ) : stageCandidates.map((c) => {
                      const next = nextMainStage(c.stage);
                      const busy = advancingId === c.id;
                      return (
                        <div key={c.id} className="rounded-xl border border-gray-100 dark:border-gray-700 p-2.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${PRIORITY_DOT[c.priority] || "bg-gray-400"}`} />
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                          </div>
                          {c.requisition?.title && (
                            <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 truncate"><Briefcase size={11} /> {c.requisition.title}</p>
                          )}
                          <p className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-2"><GraduationCap size={11} /> {c.experience_years ?? 0} yrs</p>
                          <div className="flex items-center gap-1">
                            <button
                              title={`Schedule ${ROUND_NAME_BY_STAGE[stageKey]} round`}
                              onClick={() => scheduleFor(c)}
                              className="flex-1 flex items-center justify-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 border border-brand-100 dark:border-brand-900/40"
                            >
                              <CalendarClock size={12} /> Schedule
                            </button>
                            {next && (
                              <button
                                title={`Move to ${next.label}`}
                                disabled={busy}
                                onClick={() => advanceCandidate(c, next.key)}
                                className="p-1.5 rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 disabled:opacity-40"
                              >
                                <ArrowRight size={13} />
                              </button>
                            )}
                            <button title="Hold" disabled={busy} onClick={() => advanceCandidate(c, "on_hold")} className="p-1.5 rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 disabled:opacity-40">
                              <PauseCircle size={13} />
                            </button>
                            <button title="Reject" disabled={busy} onClick={() => advanceCandidate(c, "rejected")} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40">
                              <XCircle size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">Scheduled Rounds</h2>
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : interviews.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No interviews scheduled yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Candidate</th>
                  <th className="text-left px-4 py-3">Round</th>
                  <th className="text-left px-4 py-3">Schedule</th>
                  <th className="text-left px-4 py-3">Mode</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Avg Rating</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {interviews.map((iv) => {
                  const ModeIcon = MODE_ICON[iv.mode] || Video;
                  const avgRating = iv.feedback?.length ? (iv.feedback.reduce((s, f) => s + (f.rating || 0), 0) / iv.feedback.length).toFixed(1) : "—";
                  return (
                    <tr key={iv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{iv.candidate?.name}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{iv.round_name}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                        <CalendarClock size={14} /> {iv.scheduled_at ? new Date(iv.scheduled_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300"><span className="inline-flex items-center gap-1 capitalize"><ModeIcon size={14} /> {iv.mode}</span></td>
                      <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[iv.status] || "gray"}>{iv.status?.replace("_", " ")}</Badge></td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{avgRating}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button title="Submit feedback" onClick={() => { setFeedbackTarget(iv); setFeedback(EMPTY_FEEDBACK); }} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20">
                            <MessageSquareText size={15} />
                          </button>
                          <button title="Reschedule" onClick={() => { setRescheduleTarget(iv); setRescheduleAt(""); }} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <RotateCcw size={15} />
                          </button>
                          <button title="Cancel" onClick={() => cancel(iv.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                            <XCircle size={15} />
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
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Schedule Interview" size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Scheduling..." : "Schedule"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Candidate" required full>
            <select className={inputClass} value={form.candidate_id} onChange={(e) => setForm({ ...form, candidate_id: e.target.value })}>
              <option value="">— Select candidate —</option>
              {candidates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Round Name" required><input className={inputClass} value={form.round_name} onChange={(e) => setForm({ ...form, round_name: e.target.value })} placeholder="HR / Technical / Manager / Final" /></Field>
          <Field label="Date & Time" required><input type="datetime-local" className={inputClass} value={form.scheduled_at} onChange={(e) => setForm({ ...form, scheduled_at: e.target.value })} /></Field>
          <Field label="Duration (minutes)"><input type="number" className={inputClass} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></Field>
          <Field label="Mode">
            <select className={inputClass} value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })}>
              <option value="video">Video</option><option value="onsite">Onsite</option><option value="phone">Phone</option>
            </select>
          </Field>
          <Field label="Meeting Link / Location" full><input className={inputClass} value={form.meeting_link} onChange={(e) => setForm({ ...form, meeting_link: e.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={2} className={inputClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal isOpen={!!feedbackTarget} onClose={() => setFeedbackTarget(null)} title={`Feedback — ${feedbackTarget?.candidate?.name || ""}`}
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setFeedbackTarget(null)}>Cancel</Button><Button onClick={submitFeedback}>Submit</Button></div>}>
        <div className="space-y-4">
          <Field label="Rating (1-5)">
            <input type="number" min="1" max="5" className={inputClass} value={feedback.rating} onChange={(e) => setFeedback({ ...feedback, rating: Number(e.target.value) })} />
          </Field>
          <Field label="Recommendation">
            <select className={inputClass} value={feedback.recommendation} onChange={(e) => setFeedback({ ...feedback, recommendation: e.target.value })}>
              <option value="strong_yes">Strong Yes</option><option value="yes">Yes</option><option value="no">No</option><option value="strong_no">Strong No</option>
            </select>
          </Field>
          <Field label="Strengths"><textarea rows={2} className={inputClass} value={feedback.strengths} onChange={(e) => setFeedback({ ...feedback, strengths: e.target.value })} /></Field>
          <Field label="Concerns"><textarea rows={2} className={inputClass} value={feedback.concerns} onChange={(e) => setFeedback({ ...feedback, concerns: e.target.value })} /></Field>
          <Field label="Notes"><textarea rows={2} className={inputClass} value={feedback.notes} onChange={(e) => setFeedback({ ...feedback, notes: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal isOpen={!!rescheduleTarget} onClose={() => setRescheduleTarget(null)} title="Reschedule Interview"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setRescheduleTarget(null)}>Cancel</Button><Button onClick={submitReschedule}>Reschedule</Button></div>}>
        <Field label="New Date & Time"><input type="datetime-local" className={inputClass} value={rescheduleAt} onChange={(e) => setRescheduleAt(e.target.value)} /></Field>
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
