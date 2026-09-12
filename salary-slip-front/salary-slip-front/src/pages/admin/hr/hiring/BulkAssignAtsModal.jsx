import { useState, useMemo } from "react";
import toast from "react-hot-toast";
import { Zap, AlertCircle, Users, Award, BookOpen, Clock, HelpCircle, CheckCircle, ShieldAlert, Calendar, Mail, MessageSquare, ChevronDown, ChevronUp } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";
import DatePicker from "../../../../components/ui/DatePicker";
import { hrApi } from "../../../../utils/api";

function defaultSubject(roleTitle) {
  return `Your NISS Assessment Is Ready – ${roleTitle || "your application"}`;
}

function formatAvailability(startAt, expiresAt) {
  if (!startAt && !expiresAt) return "Candidates can start this assessment as soon as they receive the link.";
  const fmt = (v) => new Date(v).toLocaleString(undefined, { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  if (startAt && expiresAt) return `Candidates can start between ${fmt(startAt)} and ${fmt(expiresAt)}.`;
  if (startAt) return `Candidates can start from ${fmt(startAt)} onward.`;
  return `Candidates must complete this assessment by ${fmt(expiresAt)}.`;
}

function getCandidateQuizStatus(candidate, quizId) {
  const attempts = candidate.quiz_attempts || candidate.quizAttempts || [];
  const specificAttempt = attempts.find((a) => String(a.quiz_id) === String(quizId));
  if (specificAttempt) {
    let label = "Assigned";
    if (specificAttempt.status === "submitted") {
      label = specificAttempt.score != null ? `Completed (${specificAttempt.score}%)` : "Completed";
    } else if (specificAttempt.status === "in_progress") {
      label = "In Progress";
    } else if (specificAttempt.status === "pending") {
      label = "Already Assigned";
    }
    return {
      alreadyGiven: true,
      status: specificAttempt.status,
      score: specificAttempt.score,
      label,
    };
  }
  return { alreadyGiven: false };
}

export default function BulkAssignAtsModal({
  isOpen,
  onClose,
  requisitionTitle,
  isDeleted = false,
  candidates = [],
  quizzes = [],
  token,
  tokenType = "Bearer",
  onAssigned,
}) {
  const [selectedQuizId, setSelectedQuizId] = useState(quizzes[0]?.id || "");
  const [atsThreshold, setAtsThreshold] = useState(70);
  const [startAt, setStartAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sendImmediately, setSendImmediately] = useState(true);
  const [subject, setSubject] = useState(defaultSubject(requisitionTitle));
  const [personalMessage, setPersonalMessage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showAlreadyAssigned, setShowAlreadyAssigned] = useState(false);

  // Sync quiz selection if quizzes change or empty
  const activeQuiz = useMemo(() => {
    return quizzes.find((q) => String(q.id) === String(selectedQuizId)) || quizzes[0] || null;
  }, [quizzes, selectedQuizId]);

  // Candidates meeting or exceeding the ATS threshold, split by whether they already took/have this quiz
  const { eligibleCandidates, alreadyAssignedCandidates, totalMatching } = useMemo(() => {
    if (!activeQuiz?.id) {
      return { eligibleCandidates: [], alreadyAssignedCandidates: [], totalMatching: 0 };
    }

    const eligible = [];
    const already = [];

    candidates.forEach((c) => {
      const score = c.ats_score != null ? Number(c.ats_score) : 0;
      if (score >= atsThreshold) {
        const quizStatus = getCandidateQuizStatus(c, activeQuiz.id);
        if (quizStatus.alreadyGiven) {
          already.push({ ...c, quizStatus });
        } else {
          eligible.push(c);
        }
      }
    });

    return {
      eligibleCandidates: eligible,
      alreadyAssignedCandidates: already,
      totalMatching: eligible.length + already.length,
    };
  }, [candidates, atsThreshold, activeQuiz]);

  const validateSchedule = () => {
    if (startAt && new Date(startAt).getTime() < Date.now()) {
      toast.error("Available From must be in the future");
      return false;
    }
    if (startAt && expiresAt && new Date(expiresAt) <= new Date(startAt)) {
      toast.error("Available Until must be later than Available From");
      return false;
    }
    return true;
  };

  const handleAssign = async () => {
    if (!activeQuiz?.id) {
      toast.error("Please select a quiz to assign.");
      return;
    }
    if (eligibleCandidates.length === 0) {
      toast.error("No eligible candidates to assign. All candidates meeting this ATS threshold have already received this quiz.");
      return;
    }
    if (!validateSchedule()) return;

    setLoading(true);
    let successCount = 0;
    let skipCount = 0;

    for (const candidate of eligibleCandidates) {
      try {
        const res = await hrApi.assignQuiz(
          {
            quiz_id: activeQuiz.id,
            candidate_id: candidate.id,
            scheduled_start_at: startAt || undefined,
            link_expires_at: expiresAt || undefined,
            subject_override: subject || undefined,
            personal_message: personalMessage || undefined,
            send_immediately: sendImmediately,
          },
          token,
          tokenType
        );

        if (res.status) {
          successCount++;
          // Ensure stage is marked as assessment
          try {
            await hrApi.moveCandidateStage(
              candidate.id,
              { to_stage: "assessment", notes: `Assigned quiz: ${activeQuiz.title}` },
              token,
              tokenType
            );
          } catch (_) {}
        } else {
          const msg = res.message || "";
          if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("open attempt")) {
            skipCount++;
          }
        }
      } catch (err) {
        const msg = err?.message || "";
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("open attempt")) {
          skipCount++;
        }
      }
    }

    setLoading(false);

    if (successCount > 0) {
      toast.success(
        `Assigned "${activeQuiz.title}" and moved ${successCount} candidate${successCount > 1 ? "s" : ""} to Assessment!${
          alreadyAssignedCandidates.length > 0 || skipCount > 0
            ? ` (${alreadyAssignedCandidates.length + skipCount} already had quiz & skipped)`
            : ""
        }`
      );
      onAssigned?.();
      onClose();
    } else if (skipCount > 0 || alreadyAssignedCandidates.length > 0) {
      toast.info(`All matching candidates already have this quiz assigned.`);
      onClose();
    } else {
      toast.error(`Failed to assign quiz to selected candidates.`);
    }
  };

  const presetThresholds = [50, 60, 70, 80, 0];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Bulk Assign Quiz by ATS Score"
      size="2xl"
    >
      <div className="space-y-6">
        {/* Requisition Context Banner */}
        <div className="p-4 rounded-xl bg-gradient-to-r from-brand-50 to-indigo-50 dark:from-brand-900/20 dark:to-indigo-900/20 border border-brand-100 dark:border-brand-800 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-brand-700 dark:text-brand-300">
              Requisition
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              {isDeleted ? (
                <>
                  <h4 className="text-base font-bold text-gray-500 dark:text-gray-400 line-through">
                    {requisitionTitle || "General / Unassigned"}
                  </h4>
                  <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-200 dark:border-red-800">
                    Deleted
                  </span>
                </>
              ) : (
                <h4 className="text-base font-bold text-gray-900 dark:text-white">
                  {requisitionTitle || "General / Unassigned"}
                </h4>
              )}
            </div>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow-sm">
              <Users size={13} className="text-brand-600" />
              {candidates.length} Total Candidates
            </span>
          </div>
        </div>

        {/* Quiz Selector */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
            Select Assessment Quiz <span className="text-red-500">*</span>
          </label>
          {quizzes.length === 0 ? (
            <div className="p-3.5 rounded-lg border border-yellow-200 bg-yellow-50 dark:bg-yellow-900/20 dark:border-yellow-800 text-xs text-yellow-800 dark:text-yellow-200 flex items-center gap-2">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>No quizzes available. Please create a quiz in the Assessment tab first.</span>
            </div>
          ) : (
            <div className="space-y-2">
              <select
                value={activeQuiz?.id || ""}
                onChange={(e) => setSelectedQuizId(e.target.value)}
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 font-medium"
              >
                {quizzes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title} {q.duration_minutes ? `(${q.duration_minutes} mins)` : ""} {q.passing_score ? `— Pass: ${q.passing_score}%` : ""}
                  </option>
                ))}
              </select>

              {activeQuiz && (
                <div className="flex flex-wrap items-center gap-4 text-xs text-gray-500 dark:text-gray-400 px-1 pt-1">
                  <span className="flex items-center gap-1">
                    <Clock size={13} className="text-brand-500" />
                    {activeQuiz.duration_minutes || 30} mins
                  </span>
                  <span className="flex items-center gap-1">
                    <BookOpen size={13} className="text-indigo-500" />
                    {Array.isArray(activeQuiz.questions) ? activeQuiz.questions.length : (activeQuiz.question_count || 0)} Questions
                  </span>
                  <span className="flex items-center gap-1">
                    <Award size={13} className="text-emerald-500" />
                    Passing: {activeQuiz.passing_score ?? 60}%
                  </span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ATS Score Threshold Setting */}
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-xl p-4 border border-gray-200 dark:border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
              <Zap size={15} className="text-amber-500 fill-amber-500" />
              Minimum ATS Score Threshold
            </label>
            <div className="flex items-center gap-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2.5 py-1">
              <span className="text-sm font-black text-brand-600 dark:text-brand-400">{atsThreshold}%</span>
            </div>
          </div>

          {/* Slider */}
          <div className="pt-1">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={atsThreshold}
              onChange={(e) => setAtsThreshold(Number(e.target.value))}
              className="w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer accent-brand-600"
            />
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-2 pt-1">
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mr-1">Quick Select:</span>
            {presetThresholds.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAtsThreshold(preset)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all ${
                  atsThreshold === preset
                    ? "bg-brand-500 text-white border-brand-500 shadow-sm"
                    : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600"
                }`}
              >
                {preset === 0 ? "All (0%)" : `≥ ${preset}%`}
              </button>
            ))}
          </div>
        </div>

        {/* Already Assigned Callout Alert */}
        {alreadyAssignedCandidates.length > 0 && (
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-600 flex-shrink-0" />
              <span>
                <strong>{alreadyAssignedCandidates.length} candidate{alreadyAssignedCandidates.length !== 1 ? "s" : ""}</strong> meeting ATS &ge; {atsThreshold}% have already been given this quiz and are automatically excluded.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAlreadyAssigned(!showAlreadyAssigned)}
              className="text-[11px] font-bold text-amber-700 dark:text-amber-300 underline hover:text-amber-900 ml-2 whitespace-nowrap"
            >
              {showAlreadyAssigned ? "Hide" : "View"}
            </button>
          </div>
        )}

        {/* Matching Candidates Live Preview */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <CheckCircle size={14} className="text-emerald-500" />
              Eligible Candidates ({eligibleCandidates.length} of {totalMatching} matching)
            </p>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              ATS Score &ge; {atsThreshold}% &middot; Not Yet Assigned
            </span>
          </div>

          {eligibleCandidates.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 text-center text-gray-500 dark:text-gray-400 text-xs">
              <HelpCircle size={28} className="mx-auto mb-2 text-gray-400" />
              {totalMatching === 0 ? (
                <>
                  No candidates in this requisition have an ATS score &ge; {atsThreshold}%.
                  <br />
                  <button
                    type="button"
                    onClick={() => setAtsThreshold(0)}
                    className="mt-2 text-brand-600 font-semibold hover:underline"
                  >
                    Lower threshold to include everyone
                  </button>
                </>
              ) : (
                <>
                  All {alreadyAssignedCandidates.length} candidate{alreadyAssignedCandidates.length !== 1 ? "s" : ""} with ATS &ge; {atsThreshold}% have already been given or assigned this quiz.
                </>
              )}
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
              {eligibleCandidates.map((c) => (
                <div key={c.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                      {c.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white truncate">{c.name}</p>
                      {c.email && <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">{c.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">
                      {c.stage || "Applied"}
                    </span>
                    <span className="text-xs font-black px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shadow-sm">
                      ATS: {c.ats_score != null ? `${c.ats_score}%` : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Collapsible already-assigned candidates list */}
          {showAlreadyAssigned && alreadyAssignedCandidates.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Already Assigned Candidates (Excluded):
              </p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-amber-200 dark:border-amber-800/60 divide-y divide-amber-100 dark:divide-amber-900/30 bg-amber-50/40 dark:bg-amber-900/10">
                {alreadyAssignedCandidates.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3.5 py-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                        {c.name?.[0]?.toUpperCase() || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                        {c.email && <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{c.email}</p>}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                      {c.quizStatus.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Schedule & Timing Configuration */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/40 p-4 space-y-4">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-brand-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
              Assessment Schedule & Timing
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Available From</label>
              <DatePicker withTime value={startAt} onChange={setStartAt} placeholder="Starts immediately" />
              <p className="mt-1 text-[11px] text-gray-400">Leave blank to let candidates start immediately.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 dark:text-gray-300">Available Until</label>
              <DatePicker withTime value={expiresAt} onChange={setExpiresAt} placeholder="7 days after start" />
              <p className="mt-1 text-[11px] text-gray-400">Leave blank for default 7 days access window.</p>
            </div>
          </div>

          <p className="rounded-xl bg-white dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 px-3 py-2 text-xs text-gray-600 dark:text-gray-300">
            {formatAvailability(startAt, expiresAt)} <span className="text-gray-400">(India Standard Time)</span>
          </p>
        </div>

        {/* Email & Invitation Customization */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mail size={15} className="text-indigo-600" />
              <span className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Invitation Email Settings
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
            >
              {showAdvanced ? "Hide Message Options" : "Customize Subject & Note"}
              {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendImmediately}
              onChange={(e) => setSendImmediately(e.target.checked)}
              className="rounded border-gray-300 text-brand-600 focus:ring-brand-500 h-4 w-4"
            />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              Send quiz invitation emails automatically to candidates upon assignment
            </span>
          </label>

          {showAdvanced && (
            <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-700">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Email Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Subject line for invitation email..."
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
                  Personal Message / Instructions (Optional)
                </label>
                <textarea
                  rows={2}
                  value={personalMessage}
                  onChange={(e) => setPersonalMessage(e.target.value)}
                  placeholder="Add custom instructions or a note to be included in the candidate's invitation email..."
                  className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-xs text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500 resize-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700">
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAssign}
            loading={loading}
            disabled={loading || eligibleCandidates.length === 0 || !activeQuiz}
            className="flex items-center gap-2 shadow-md bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap size={15} />
            Assign Assessment to {eligibleCandidates.length} Candidate{eligibleCandidates.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
