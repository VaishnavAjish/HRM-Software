import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  CalendarClock, Video, MapPin, Phone, XCircle, PauseCircle, MessageSquareText,
  RotateCcw, CalendarPlus, ThumbsUp, ThumbsDown,
} from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";
import { stageLabel } from "./hiring/stageMeta";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_VARIANT = { scheduled: "blue", completed: "green", cancelled: "red", rescheduled: "yellow", no_show: "gray" };
const MODE_ICON = { video: Video, onsite: MapPin, phone: Phone };
const PRIORITY_DOT = { high: "bg-red-500", medium: "bg-yellow-400", low: "bg-gray-400" };

/** Everything this tab owns: a candidate lands here once Shortlisted hands
 *  them off, and leaves once they're proceeded to Selected (Offer tab) or
 *  rejected/held. Matches STAGE_GROUPS["Interview"] in stageMeta.js. There's
 *  a single "interview" stage — no separate HR/Technical/Final rounds. */
const INTERVIEW_STAGES = ["interview"];

const EMPTY_FEEDBACK = { rating: 4, recommendation: "yes", strengths: "", concerns: "", notes: "" };
const EMPTY_SCHEDULE = { scheduled_at: "", duration_minutes: 30, mode: "video", meeting_link: "", notes: "" };

/** The candidate's latest interview — there's only one round type now, so
 *  no round-name matching is needed, just the most recent one on file. */
function currentRoundInterview(candidate, interviews) {
  const matches = interviews.filter((iv) => String(iv.candidate_id) === String(candidate.id));
  return matches.reduce((latest, iv) => (!latest || iv.id > latest.id ? iv : latest), null);
}

export default function InterviewManagement() {
  const { user } = useAuth();
  const [interviews, setInterviews] = useState([]);
  const [roster, setRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [feedbackTarget, setFeedbackTarget] = useState(null);
  const [feedback, setFeedback] = useState(EMPTY_FEEDBACK);
  const [rescheduleTarget, setRescheduleTarget] = useState(null);
  const [rescheduleAt, setRescheduleAt] = useState("");
  const [scheduleTarget, setScheduleTarget] = useState(null);
  const [scheduleForm, setScheduleForm] = useState(EMPTY_SCHEDULE);
  const [scheduling, setScheduling] = useState(false);
  const [proceedTarget, setProceedTarget] = useState(null);
  const [proceedNotes, setProceedNotes] = useState("");
  const [proceeding, setProceeding] = useState(false);

  const loadInterviews = () =>
    hrApi.getInterviews(user?.accessToken, user?.tokenType, { per_page: 100 })
      .then((res) => { if (res.status) setInterviews(res.data?.data || res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load interviews"));

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
    loadInterviews();
    loadRoster();
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const openProceed = (candidate) => {
    setProceedTarget(candidate);
    setProceedNotes("");
  };

  /** One decision point instead of separate Advance/Hold/Reject buttons —
   *  pick the outcome and write down why, in the same step. */
  const submitProceed = async (toStage) => {
    setProceeding(true);
    try {
      const res = await hrApi.moveCandidateStage(proceedTarget.id, { to_stage: toStage, notes: proceedNotes || undefined }, user?.accessToken, user?.tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success(toStage === "selected" ? "Candidate selected" : `Marked ${stageLabel(toStage)}`);
      setProceedTarget(null);
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

  const submitReschedule = async () => {
    if (!rescheduleAt) { toast.error("Pick a new date/time"); return; }
    try {
      const res = await hrApi.rescheduleInterview(rescheduleTarget.id, { scheduled_at: rescheduleAt }, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Interview rescheduled"); setRescheduleTarget(null); setRescheduleAt(""); loadInterviews(); }
    } catch (err) {
      toast.error(err.message || "Failed to reschedule");
    }
  };

  const submitFeedback = async () => {
    try {
      const res = await hrApi.submitInterviewFeedback(feedbackTarget.id, feedback, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Feedback submitted"); setFeedbackTarget(null); setFeedback(EMPTY_FEEDBACK); loadInterviews(); }
    } catch (err) {
      toast.error(err.message || "Failed to submit feedback");
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Every candidate who's been shortlisted lands here — schedule their interview, then proceed with a decision once it's done
      </p>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {rosterLoading ? (
          <div className="p-6"><SkeletonTable rows={6} /></div>
        ) : roster.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">
            No candidates in the interview process right now — they show up here once shortlisted from the Candidates tab.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-3">Candidate</th>
                  <th className="text-left px-4 py-3">Schedule</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {roster.map((c) => (
                  <RosterRow
                    key={c.id}
                    candidate={c}
                    interview={currentRoundInterview(c, interviews)}
                    onOpenSchedule={openSchedule}
                    onOpenProceed={openProceed}
                    onFeedback={(iv) => { setFeedbackTarget(iv); setFeedback(EMPTY_FEEDBACK); }}
                    onReschedule={(iv) => { setRescheduleTarget(iv); setRescheduleAt(""); }}
                    onCancel={cancelInterview}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal isOpen={!!scheduleTarget} onClose={() => setScheduleTarget(null)}
        title={`Schedule Interview — ${scheduleTarget?.name || ""}`} size="lg"
        footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setScheduleTarget(null)}>Cancel</Button><Button onClick={submitSchedule} disabled={scheduling}>{scheduling ? "Scheduling..." : "Schedule"}</Button></div>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Date & Time" required><input type="datetime-local" className={inputClass} value={scheduleForm.scheduled_at} onChange={(e) => setScheduleForm({ ...scheduleForm, scheduled_at: e.target.value })} /></Field>
          <Field label="Duration (minutes)"><input type="number" className={inputClass} value={scheduleForm.duration_minutes} onChange={(e) => setScheduleForm({ ...scheduleForm, duration_minutes: e.target.value })} /></Field>
          <Field label="Mode">
            <select className={inputClass} value={scheduleForm.mode} onChange={(e) => setScheduleForm({ ...scheduleForm, mode: e.target.value })}>
              <option value="video">Video</option><option value="onsite">Onsite</option><option value="phone">Phone</option>
            </select>
          </Field>
          <Field label="Meeting Link / Location"><input className={inputClass} value={scheduleForm.meeting_link} onChange={(e) => setScheduleForm({ ...scheduleForm, meeting_link: e.target.value })} /></Field>
          <Field label="Notes" full><textarea rows={2} className={inputClass} value={scheduleForm.notes} onChange={(e) => setScheduleForm({ ...scheduleForm, notes: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal isOpen={!!proceedTarget} onClose={() => setProceedTarget(null)} title={`Proceed — ${proceedTarget?.name || ""}`} size="lg">
        <div className="space-y-4">
          <Field label="Interview Notes / Description" full>
            <textarea
              rows={4}
              className={inputClass}
              placeholder="How did the interview go? Strengths, concerns, reasoning for the decision…"
              value={proceedNotes}
              onChange={(e) => setProceedNotes(e.target.value)}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
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

/** One row per candidate. "Schedule Interview" opens a proper modal — the
 *  row already tells the modal who and which round, so there's no
 *  candidate picker in it, just the round's own details. */
function RosterRow({ candidate, interview, onOpenSchedule, onOpenProceed, onFeedback, onReschedule, onCancel }) {
  const ModeIcon = interview ? (MODE_ICON[interview.mode] || Video) : null;
  const avgRating = interview?.feedback?.length
    ? (interview.feedback.reduce((s, f) => s + (f.rating || 0), 0) / interview.feedback.length).toFixed(1)
    : null;

  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700/30 align-top">
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${PRIORITY_DOT[candidate.priority] || "bg-gray-400"}`} />
          <div>
            <p className="font-medium text-gray-900 dark:text-white">{candidate.name}</p>
            {candidate.requisition?.title && <p className="text-xs text-gray-400">{candidate.requisition.title}</p>}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        {interview ? (
          <div className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
            <CalendarClock size={14} className="flex-shrink-0" />
            {interview.scheduled_at ? new Date(interview.scheduled_at).toLocaleString() : "—"}
            {ModeIcon && <ModeIcon size={14} className="flex-shrink-0 ml-1" />}
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
        {interview && <Badge variant={STATUS_VARIANT[interview.status] || "gray"}>{interview.status?.replace("_", " ")}</Badge>}
        {avgRating && <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">★ {avgRating}</span>}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1">
          {interview && (
            <>
              <button title="Submit feedback" onClick={() => onFeedback(interview)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20">
                <MessageSquareText size={14} />
              </button>
              <button title="Reschedule" onClick={() => onReschedule(interview)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
                <RotateCcw size={14} />
              </button>
              <button title="Cancel round" onClick={() => onCancel(interview.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                <XCircle size={14} />
              </button>
            </>
          )}
          <Button size="sm" onClick={() => onOpenProceed(candidate)}>Proceed</Button>
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
