import { useState, useMemo } from "react";
import toast from "react-hot-toast";
import { Zap, AlertCircle, BookOpen, Clock, Award, ShieldAlert, Calendar, Mail, ChevronDown, ChevronUp } from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";
import DatePicker from "../../../../components/ui/DatePicker";
import { hrApi } from "../../../../utils/api";

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

export default function BulkAssignSelectedModal({
  isOpen,
  onClose,
  selectedCandidates = [],
  quizzes = [],
  token,
  tokenType = "Bearer",
  onAssigned,
}) {
  const [selectedQuizId, setSelectedQuizId] = useState(quizzes[0]?.id || "");
  const [startAt, setStartAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [sendImmediately, setSendImmediately] = useState(true);
  const [subject, setSubject] = useState("Your NISS Assessment Is Ready");
  const [personalMessage, setPersonalMessage] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);

  const activeQuiz = useMemo(() => {
    return quizzes.find((q) => String(q.id) === String(selectedQuizId)) || quizzes[0] || null;
  }, [quizzes, selectedQuizId]);

  const { eligibleCandidates, alreadyAssignedCandidates } = useMemo(() => {
    if (!activeQuiz?.id) return { eligibleCandidates: [], alreadyAssignedCandidates: [] };

    const eligible = [];
    const already = [];

    selectedCandidates.forEach((c) => {
      const status = getCandidateQuizStatus(c, activeQuiz.id);
      if (status.alreadyGiven) {
        already.push({ ...c, quizStatus: status });
      } else {
        eligible.push(c);
      }
    });

    return { eligibleCandidates: eligible, alreadyAssignedCandidates: already };
  }, [selectedCandidates, activeQuiz]);

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
      toast.error("All selected candidates have already received or completed this quiz.");
      return;
    }
    if (!validateSchedule()) return;

    setLoading(true);
    let successCount = 0;
    let skipCount = 0;
    let failCount = 0;

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
          } else {
            failCount++;
          }
        }
      } catch (err) {
        const msg = err?.message || "";
        if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("open attempt")) {
          skipCount++;
        } else {
          failCount++;
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
      toast.info(`All selected candidates already have this quiz assigned.`);
      onClose();
    } else {
      toast.error(`Failed to assign quiz to selected candidates.`);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Assign Quiz to ${selectedCandidates.length} Selected Candidate${selectedCandidates.length !== 1 ? "s" : ""}`}
      size="2xl"
    >
      <div className="space-y-5">
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

        {/* Warning if any already assigned */}
        {alreadyAssignedCandidates.length > 0 && (
          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/80 dark:bg-amber-900/20 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-600 flex-shrink-0" />
            <span>
              <strong>{alreadyAssignedCandidates.length} candidate{alreadyAssignedCandidates.length !== 1 ? "s" : ""}</strong> already received/completed this quiz and will be automatically skipped.
            </span>
          </div>
        )}

        {/* Selected Candidates list */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300 mb-2">
            Selected Candidates ({selectedCandidates.length})
          </label>
          <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
            {selectedCandidates.map((c) => {
              const status = getCandidateQuizStatus(c, activeQuiz?.id);
              return (
                <div key={c.id} className="flex items-center justify-between px-3.5 py-2 hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-6 h-6 rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
                      {c.name?.[0]?.toUpperCase() || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                      {c.email && <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{c.email}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {status.alreadyGiven ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                        {status.label}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-800">
                        Ready to Assign
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100 dark:border-gray-700">
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
            <Zap size={14} />
            Assign Quiz to {eligibleCandidates.length} Candidate{eligibleCandidates.length !== 1 ? "s" : ""}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
