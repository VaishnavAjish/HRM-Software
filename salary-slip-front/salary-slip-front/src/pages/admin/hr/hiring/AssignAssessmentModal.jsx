import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Check, ChevronLeft, Clock, FileQuestion, Target, User, Mail, Briefcase, Building2, MapPin } from "lucide-react";
import Button from "../../../../components/ui/Button";
import Modal from "../../../../components/ui/Modal";
import DatePicker from "../../../../components/ui/DatePicker";
import { hrApi } from "../../../../utils/api";
import { getCompanyConfig } from "../../../../config/companyConfig";
import { useAuthorization } from "../../../../hooks/useAuthorization";

const EMAIL_STATUS_MESSAGE = {
  sent: (name, email) => `Invitation sent to ${name} at ${email}.`,
  queued: (name) => `Invitation queued for delivery to ${name}.`,
  sending: (name) => `Invitation is being sent to ${name}.`,
  failed: () => "The invitation could not be sent — you can retry from the candidate list.",
};

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STEPS = [
  { key: 1, label: "Candidate & Assessment" },
  { key: 2, label: "Schedule & Delivery" },
  { key: 3, label: "Email Preview" },
];

function defaultSubject(roleTitle) {
  return `Your NISS Assessment Is Ready – ${roleTitle || "your application"}`;
}

function formatAvailability(startAt, expiresAt) {
  if (!startAt && !expiresAt) return "The candidate can start this assessment as soon as they receive the link.";
  const fmt = (v) => new Date(v).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  if (startAt && expiresAt) return `Candidate can start this assessment between ${fmt(startAt)} and ${fmt(expiresAt)}.`;
  if (startAt) return `Candidate can start this assessment from ${fmt(startAt)} onward.`;
  return `Candidate must complete this assessment by ${fmt(expiresAt)}.`;
}

/**
 * Assign Assessment wizard — replaces the old single-screen "Assign a quiz"
 * modal. Candidate/job fields are read-only (pulled from the roster row the
 * recruiter clicked, never re-typed), and the email preview in step 3 renders
 * the actual invite the candidate will receive, using the real token/link
 * generated when the attempt is created at the step 2 → 3 transition.
 */
export default function AssignAssessmentModal({ candidate, quizzes, token, tokenType, onClose, onAssigned }) {
  const { can } = useAuthorization();
  const canSendInvitation = can("assessment.send_invitation");
  const [step, setStep] = useState(1);

  const [quizId, setQuizId] = useState(quizzes[0]?.id ?? "");
  const quiz = useMemo(() => quizzes.find((q) => String(q.id) === String(quizId)) || null, [quizzes, quizId]);

  const [startAt, setStartAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sendImmediately, setSendImmediately] = useState(canSendInvitation);
  const [subject, setSubject] = useState(defaultSubject(candidate?.requisition?.title));
  const [personalMessage, setPersonalMessage] = useState("");

  const [attempt, setAttempt] = useState(null); // created once, on the 2 -> 3 transition
  const [creating, setCreating] = useState(false);

  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);

  const [sending, setSending] = useState(false);

  const companyLabel = candidate?.company_code ? getCompanyConfig(candidate.company_code)?.label || candidate.company_code : null;

  const validateStep2 = () => {
    if (startAt && new Date(startAt).getTime() < Date.now()) {
      toast.error("Available From must be in the future");
      return false;
    }
    if (startAt && expiresAt && new Date(expiresAt) <= new Date(startAt)) {
      toast.error("Available Until must be later than Available From");
      return false;
    }
    if (sendImmediately && !candidate?.email) {
      toast.error("Candidate email address is missing.");
      return false;
    }
    return true;
  };

  const goToStep3 = async () => {
    if (!validateStep2()) return;
    if (attempt) { setStep(3); return; } // already created — going back and forward again
    setCreating(true);
    try {
      const res = await hrApi.assignQuiz(
        {
          quiz_id: quizId,
          candidate_id: candidate.id,
          scheduled_start_at: startAt || undefined,
          link_expires_at: expiresAt || undefined,
          send_immediately: false,
        },
        token,
        tokenType,
      );
      if (!res.status) throw new Error(res.message);
      setAttempt(res.data);
      setStep(3);
    } catch (err) {
      toast.error(err.message || "We couldn't assign the assessment. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  useEffect(() => {
    if (step !== 3 || !attempt || !sendImmediately) return;
    setPreviewLoading(true);
    setPreviewError(null);
    hrApi.previewQuizEmail(attempt.id, { subject_override: subject, personal_message: personalMessage }, token, tokenType)
      .then((res) => {
        if (!res.status) throw new Error(res.message);
        setPreview(res.data);
      })
      .catch((err) => setPreviewError(err.message || "Couldn't load the email preview."))
      .finally(() => setPreviewLoading(false));
    // Only re-fetch when we actually land on step 3 for this attempt — not on
    // every keystroke in subject/personalMessage, which would spam the API.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, attempt?.id]);

  const finish = async () => {
    if (!attempt) return;
    if (!sendImmediately) {
      toast.success("Assessment assigned successfully. Invitation was not sent.");
      onAssigned(attempt.access_token);
      return;
    }
    setSending(true);
    try {
      const res = await hrApi.sendQuizInvitation(attempt.id, { subject_override: subject, personal_message: personalMessage }, token, tokenType);
      if (!res.status) throw new Error(res.message);
      toast.success("Assessment assigned successfully", { duration: 4000 });
      const describe = EMAIL_STATUS_MESSAGE[res.email_status] || EMAIL_STATUS_MESSAGE.queued;
      toast.success(describe(candidate.name, candidate.email), { duration: 5000 });
      onAssigned(attempt.access_token);
    } catch (err) {
      toast.error(err.message || "Assessment assigned — email delivery failed. You can retry from the candidate list.");
      // The attempt already exists regardless of email outcome — closing here
      // still leaves a real, usable assignment behind.
      onAssigned(attempt.access_token);
    } finally {
      setSending(false);
    }
  };

  const busy = creating || sending;

  return (
    <Modal
      isOpen
      onClose={busy ? () => {} : onClose}
      title={`Assign Assessment — ${candidate?.name || ""}`}
      size="2xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <div>
            {step > 1 && (
              <Button variant="secondary" size="sm" icon={<ChevronLeft size={14} />} onClick={() => setStep(step - 1)} disabled={busy}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
            {step === 1 && (
              <Button onClick={() => { if (!quizId) { toast.error("Please select an assessment."); return; } setStep(2); }}>
                Next: Schedule
              </Button>
            )}
            {step === 2 && (
              <Button onClick={goToStep3} disabled={creating}>{creating ? "Preparing assessment..." : "Next: Preview"}</Button>
            )}
            {step === 3 && (
              <Button onClick={finish} disabled={sending || (sendImmediately && previewLoading)}>
                {sending ? "Assigning assessment..." : sendImmediately ? "Assign & Send Email" : "Assign Assessment"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
        Configure the assessment and review the candidate invitation before sending.
      </p>

      <StepIndicator step={step} />

      {step === 1 && (
        <div className="mt-5 space-y-5">
          <CandidateSummary candidate={candidate} companyLabel={companyLabel} />

          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">
              Assessment <span className="text-red-500">*</span>
            </label>
            <select className={inputClass} value={quizId} onChange={(e) => setQuizId(e.target.value)}>
              <option value="">— Select assessment —</option>
              {quizzes.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
            </select>
            {quizzes.length === 0 && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">No assessments exist yet — create one in the Quiz Library tab first.</p>
            )}
          </div>

          {quiz && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Metric icon={<Clock size={14} />} label="Duration" value={`${quiz.duration_minutes ?? 30} min`} />
              <Metric icon={<FileQuestion size={14} />} label="Questions" value={quiz.questions?.length ?? 0} />
              <Metric icon={<Target size={14} />} label="Passing Score" value={`${quiz.passing_score}%`} />
            </div>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="mt-5 space-y-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Available From</label>
              <DatePicker withTime value={startAt} onChange={setStartAt} placeholder="Starts immediately" />
              <p className="mt-1 text-[11px] text-gray-400">Leave blank to let the candidate start immediately.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Available Until</label>
              <DatePicker withTime value={expiresAt} onChange={setExpiresAt} placeholder="7 days after start" />
              <p className="mt-1 text-[11px] text-gray-400">Leave blank for 7 days after the start time.</p>
            </div>
          </div>
          <p className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
            {formatAvailability(startAt, expiresAt)} <span className="text-gray-400">(India Standard Time)</span>
          </p>

          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            {canSendInvitation ? (
              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={sendImmediately} onChange={(e) => setSendImmediately(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                Send assessment invitation immediately
              </label>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                You don't have permission to send the assessment invitation — this will create the assignment only. Someone with that permission can send it from the candidate list.
              </p>
            )}

            {sendImmediately && canSendInvitation && (
              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Email Subject</label>
                  <input className={inputClass} value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={255} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Personal Message (optional)</label>
                  <textarea rows={2} className={inputClass} placeholder="Add a short message for the candidate..." value={personalMessage} onChange={(e) => setPersonalMessage(e.target.value)} maxLength={2000} />
                </div>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            A unique, single-use link is generated for this assignment. It works without a login and can only be completed once — the candidate can't start it before "Available from", and it stops working after "Available until".
          </p>
        </div>
      )}

      {step === 3 && (
        <div className="mt-5 space-y-4">
          <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Assign assessment to {candidate?.name}?</p>
            <ul className="mt-1.5 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
              <li>{candidate?.requisition?.title || "General application"}</li>
              <li>{quiz?.title}</li>
              <li>{formatAvailability(startAt, expiresAt)}</li>
              {sendImmediately && <li>Invitation will be sent to {candidate?.email}</li>}
            </ul>
          </div>

          {attempt?.access_token && (
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-500 dark:text-gray-400">Secure Assessment Link</label>
              <div className="flex gap-2">
                <input readOnly value={`${window.location.origin}/quiz/${attempt.access_token}`} className={`${inputClass} font-mono text-xs`} />
                <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/quiz/${attempt.access_token}`); toast.success("Link copied"); }}>
                  Copy
                </Button>
              </div>
            </div>
          )}

          {sendImmediately ? (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">Email Preview</p>
              {previewLoading ? (
                <div className="flex h-64 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-400">Loading preview...</div>
              ) : previewError ? (
                <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/10 p-4 text-sm text-red-600">{previewError}</div>
              ) : preview ? (
                <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
                  <div className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
                    <p><span className="font-semibold">To:</span> {preview.to}</p>
                    <p><span className="font-semibold">Subject:</span> {preview.subject}</p>
                  </div>
                  <iframe title="Email preview" srcDoc={preview.html} className="h-96 w-full bg-white" sandbox="" />
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
              No email will be sent — the assessment is assigned and the link above is ready to share manually.
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function StepIndicator({ step }) {
  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((s, i) => (
        <div key={s.key} className="flex items-center gap-1.5">
          <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            step === s.key ? "bg-brand-600 text-white" : step > s.key ? "bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-400" : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500"
          }`}>
            {step > s.key ? <Check size={12} /> : <span>{s.key}</span>}
            {s.label}
          </div>
          {i < STEPS.length - 1 && <div className="h-px w-4 bg-gray-200 dark:bg-gray-700" />}
        </div>
      ))}
    </div>
  );
}

function CandidateSummary({ candidate, companyLabel }) {
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30 p-4 sm:grid-cols-2">
      <SummaryRow icon={<User size={13} />} label="Candidate" value={candidate?.name} />
      <SummaryRow icon={<Mail size={13} />} label="Email" value={candidate?.email || "Not on file"} warn={!candidate?.email} />
      <SummaryRow icon={<Briefcase size={13} />} label="Position" value={candidate?.requisition?.title || "General application"} />
      {companyLabel && <SummaryRow icon={<Building2 size={13} />} label="Company" value={companyLabel} />}
      {candidate?.unit && <SummaryRow icon={<MapPin size={13} />} label="Location" value={candidate.unit} />}
    </div>
  );
}

function SummaryRow({ icon, label, value, warn }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-gray-400">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className={`truncate text-sm ${warn ? "text-amber-600 dark:text-amber-400" : "text-gray-800 dark:text-gray-100"}`}>{value}</p>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-center">
      <div className="flex items-center justify-center gap-1 text-gray-400">{icon}</div>
      <p className="mt-1 text-base font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  );
}
