import {
  Clock,
  CheckCircle2,
  ShieldAlert,
  FileQuestion,
  Award,
  Layers,
  Edit,
  CircleDot,
  CheckSquare,
  FlaskConical,
} from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";

export default function QuizViewModal({ isOpen, onClose, quiz, onEdit, onTest }) {
  if (!quiz) return null;

  const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
  const mcqCount = questions.filter((q) => q.type !== "msq" && (!q.correct_indices || q.correct_indices.length <= 1)).length;
  const msqCount = questions.length - mcqCount;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
            <FileQuestion size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {quiz.title}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Assessment Overview & Question Details
            </p>
          </div>
        </div>
      }
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <div className="flex items-center gap-2">
            {onTest && (
              <Button
                variant="secondary"
                icon={<FlaskConical size={14} className="text-purple-600 dark:text-purple-400" />}
                onClick={() => {
                  onClose();
                  onTest(quiz);
                }}
              >
                Test Quiz
              </Button>
            )}
            {onEdit && (
              <Button
                icon={<Edit size={14} />}
                onClick={() => {
                  onClose();
                  onEdit(quiz);
                }}
                className="bg-brand-600 hover:bg-brand-700 text-white"
              >
                Edit Quiz
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="space-y-5">
        {/* Description */}
        {quiz.description && (
          <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
            {quiz.description}
          </p>
        )}

        {/* Highlight Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Layers size={14} /> Questions
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
              {questions.length}{" "}
              <span className="text-xs font-normal text-gray-400">
                ({mcqCount} MCQ, {msqCount} MSQ)
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Award size={14} /> Total Marks
            </div>
            <p className="mt-1 text-lg font-bold text-brand-600 dark:text-brand-400">
              {totalMarks} Marks
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <CheckCircle2 size={14} /> Pass Mark
            </div>
            <p className="mt-1 text-lg font-bold text-emerald-600 dark:text-emerald-400">
              {quiz.passing_score ?? 60}%
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-3 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <Clock size={14} /> Duration
            </div>
            <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
              {quiz.duration_minutes ?? 30} mins
            </p>
          </div>
        </div>

        {/* Proctoring Warning Setting Display */}
        <div className="flex items-center justify-between rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-xs text-gray-700 dark:text-gray-300">
              Auto-terminate violation threshold:
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
            Max {quiz.max_violations ?? 3} Warnings
          </span>
        </div>

        {/* Questions List */}
        <div className="space-y-3">
          <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Questions Breakdown ({questions.length})
          </h4>

          {questions.length === 0 ? (
            <p className="text-xs text-gray-400 py-4 text-center">No questions added yet.</p>
          ) : (
            <div className="space-y-3">
              {questions.map((q, idx) => {
                const isMsq = q.type === "msq" || (Array.isArray(q.correct_indices) && q.correct_indices.length > 1);
                const marks = Number(q.marks) || 1;
                const correctIndices = Array.isArray(q.correct_indices) && q.correct_indices.length > 0
                  ? q.correct_indices
                  : [typeof q.correct_index === "number" ? q.correct_index : 0];

                return (
                  <div
                    key={idx}
                    className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 p-3.5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 px-2 py-0.5 rounded-md text-xs font-extrabold bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          Q{idx + 1}
                        </span>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">
                          {q.text}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                            isMsq
                              ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                              : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                          }`}
                        >
                          {isMsq ? <CheckSquare size={11} /> : <CircleDot size={11} />}
                          {isMsq ? "MSQ" : "MCQ"}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                          {marks} Mark{marks > 1 ? "s" : ""}
                        </span>
                      </div>
                    </div>

                    {/* Options */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7 pt-1">
                      {(q.options || []).map((opt, optIdx) => {
                        const isCorrect = correctIndices.includes(optIdx);
                        const optMark = Number(q.option_marks?.[optIdx]) || (isCorrect ? (isMsq ? Number((marks / correctIndices.length).toFixed(2)) : marks) : 0);

                        return (
                          <div
                            key={optIdx}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-all ${
                              isCorrect
                                ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60 font-semibold"
                                : "bg-gray-50 dark:bg-gray-700/40 text-gray-600 dark:text-gray-400 border border-gray-100 dark:border-gray-700"
                            }`}
                          >
                            <span className="font-bold opacity-60">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <span className="flex-1">{opt}</span>
                            {isCorrect && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300">
                                +{optMark} pt{optMark !== 1 ? "s" : ""}
                              </span>
                            )}
                            {isCorrect && (
                              <CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                            )}
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
      </div>
    </Modal>
  );
}
