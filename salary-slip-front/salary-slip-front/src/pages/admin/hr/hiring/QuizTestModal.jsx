import { useState, useEffect, useMemo } from "react";
import {
  FlaskConical,
  Clock,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CheckSquare,
  CircleDot,
  ShieldAlert,
  ChevronLeft,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";

export default function QuizTestModal({ isOpen, onClose, quiz }) {
  const [testState, setTestState] = useState("intro"); // 'intro' | 'running' | 'submitted'
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  const questions = useMemo(() => {
    return Array.isArray(quiz?.questions) ? quiz.questions : [];
  }, [quiz]);

  const totalMarks = useMemo(() => {
    return questions.reduce((sum, q) => sum + (Number(q.marks) || 1), 0);
  }, [questions]);

  // Reset state when opening or switching quiz
  useEffect(() => {
    if (!isOpen || !quiz) return;
    setTestState("intro");
    setCurrentIndex(0);
    setAnswers({});
    setSecondsLeft((quiz.duration_minutes || 30) * 60);
    setTimerActive(false);
  }, [isOpen, quiz]);

  // Timer countdown in running mode
  useEffect(() => {
    if (testState !== "running" || !timerActive || secondsLeft <= 0) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setTestState("submitted");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [testState, timerActive, secondsLeft]);

  // Calculate detailed score evaluation
  const evaluation = useMemo(() => {
    if (testState !== "submitted") return null;

    let earnedMarks = 0;
    let correctQuestionsCount = 0;

    const breakdown = questions.map((q, i) => {
      const type = q.type || (Array.isArray(q.correct_indices) && q.correct_indices.length > 1 ? "msq" : "mcq");
      const qMarks = Number(q.marks) || 1;
      const given = answers[i];
      const optMarks = Array.isArray(q.option_marks) ? q.option_marks : [];
      
      const correctIndices = Array.isArray(q.correct_indices) && q.correct_indices.length > 0
        ? q.correct_indices
        : [typeof q.correct_index === "number" ? q.correct_index : 0];

      let qEarned = 0;
      let status = "incorrect"; // 'correct' | 'partial' | 'incorrect'

      if (type === "msq") {
        const givenIndices = Array.isArray(given) ? given : [];
        const hasWrongSelection = givenIndices.some((gIdx) => !correctIndices.includes(gIdx));
        if (hasWrongSelection) {
          qEarned = 0;
        } else if (givenIndices.length > 0) {
          if (optMarks.length > 0) {
            givenIndices.forEach((gIdx) => {
              if (optMarks[gIdx]) qEarned += Number(optMarks[gIdx]);
            });
          } else {
            const sortedGiven = [...givenIndices].sort((a, b) => a - b);
            const sortedCorrect = [...correctIndices].sort((a, b) => a - b);
            if (JSON.stringify(sortedGiven) === JSON.stringify(sortedCorrect)) {
              qEarned = qMarks;
            }
          }
        }
      } else {
        const cIdx = typeof q.correct_index === "number" ? q.correct_index : (correctIndices[0] ?? 0);
        if (given !== undefined && given !== null) {
          if (optMarks.length > 0 && optMarks[given]) {
            qEarned = Number(optMarks[given]);
          } else if (given === cIdx) {
            qEarned = qMarks;
          }
        }
      }

      qEarned = Math.min(qMarks, Math.max(0, qEarned));
      earnedMarks += qEarned;

      if (qEarned >= qMarks - 0.001 && qMarks > 0) {
        status = "correct";
        correctQuestionsCount += 1;
      } else if (qEarned > 0) {
        status = "partial";
        correctQuestionsCount += qEarned / qMarks;
      }

      return {
        question: q,
        type,
        qMarks,
        qEarned,
        status,
        given,
        correctIndices,
      };
    });

    const scorePct = totalMarks > 0 ? Math.round((earnedMarks / totalMarks) * 100) : 0;
    const passingScore = quiz.passing_score ?? 60;
    const passed = scorePct >= passingScore;

    return {
      earnedMarks: Number(earnedMarks.toFixed(2)),
      totalMarks,
      scorePct,
      passed,
      passingScore,
      correctQuestionsCount: Math.round(correctQuestionsCount * 10) / 10,
      totalQuestions: questions.length,
      breakdown,
    };
  }, [testState, questions, answers, totalMarks, quiz]);

  if (!quiz) return null;

  const handleStartTest = () => {
    setTestState("running");
    setCurrentIndex(0);
    setAnswers({});
    setSecondsLeft((quiz.duration_minutes || 30) * 60);
    setTimerActive(true);
  };

  const handleRetakeTest = () => {
    handleStartTest();
  };

  // Option selection
  const handleSelectOption = (qIdx, optIdx, isMsq) => {
    if (isMsq) {
      const current = Array.isArray(answers[qIdx]) ? answers[qIdx] : [];
      const next = current.includes(optIdx)
        ? current.filter((i) => i !== optIdx)
        : [...current, optIdx].sort((a, b) => a - b);
      setAnswers({ ...answers, [qIdx]: next });
    } else {
      setAnswers({ ...answers, [qIdx]: optIdx });
    }
  };

  const handleFinishTest = () => {
    setTimerActive(false);
    setTestState("submitted");
  };

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const answeredCount = Object.keys(answers).length;
  const currentQ = questions[currentIndex] || {};
  const isCurrentMsq = currentQ.type === "msq" || (Array.isArray(currentQ.correct_indices) && currentQ.correct_indices.length > 1);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">
            <FlaskConical size={18} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-gray-900 dark:text-white">
                {quiz.title}
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                Test Simulation Mode
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Simulate candidate test environment & verify question marks and scoring
            </p>
          </div>
        </div>
      }
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {testState === "submitted" && (
              <Button
                variant="secondary"
                icon={<RotateCcw size={14} />}
                onClick={handleRetakeTest}
              >
                Retake Test
              </Button>
            )}
            {testState === "running" && (
              <span className="text-xs text-gray-400">
                Question {currentIndex + 1} of {questions.length} &bull; {answeredCount} Answered
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose}>
              {testState === "submitted" ? "Close Results" : "Exit Test"}
            </Button>
            {testState === "intro" && (
              <Button
                onClick={handleStartTest}
                icon={<FlaskConical size={15} />}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                Start Test Simulation
              </Button>
            )}
            {testState === "running" && (
              <Button
                onClick={handleFinishTest}
                icon={<CheckCircle2 size={15} />}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                Submit & Score Test
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* ========================================================================= */}
      {/* 1. INTRO SCREEN                                                          */}
      {/* ========================================================================= */}
      {testState === "intro" && (
        <div className="space-y-5 py-2">
          {quiz.description && (
            <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700 text-xs text-gray-600 dark:text-gray-300">
              {quiz.description}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase">Questions</span>
              <p className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">
                {questions.length} Qs
              </p>
            </div>
            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase">Total Marks</span>
              <p className="text-lg font-bold text-brand-600 dark:text-brand-400 mt-0.5">
                {totalMarks} pts
              </p>
            </div>
            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase">Time Limit</span>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                {quiz.duration_minutes ?? 30} mins
              </p>
            </div>
            <div className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-center">
              <span className="text-[11px] font-semibold text-gray-400 uppercase">Passing Score</span>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {quiz.passing_score ?? 60}%
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-purple-200 dark:border-purple-900/50 bg-purple-50/50 dark:bg-purple-950/20 p-4 space-y-2">
            <div className="flex items-center gap-2 text-purple-900 dark:text-purple-200 font-bold text-xs">
              <Sparkles size={15} />
              About Test Simulation Mode
            </div>
            <p className="text-xs text-purple-800/80 dark:text-purple-300/80 leading-relaxed">
              This interactive mode lets you test the quiz questions, verify MSQ/MCQ options, validate the per-option marks allocation, and inspect the real-time scoring calculation without affecting real candidate records.
            </p>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20 text-xs">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <span className="text-gray-700 dark:text-gray-300">
                Proctoring Violation Warning Threshold:
              </span>
            </div>
            <span className="font-bold text-amber-800 dark:text-amber-200">
              Max {quiz.max_violations ?? 3} Warnings
            </span>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. RUNNING TEST SCREEN                                                   */}
      {/* ========================================================================= */}
      {testState === "running" && questions.length > 0 && (
        <div className="space-y-4">
          {/* Top Timer and Navigation Strip */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 text-xs">
              <span className="font-bold text-gray-900 dark:text-white">
                Q{currentIndex + 1} of {questions.length}
              </span>
              <span className="text-gray-300 dark:text-gray-600">&bull;</span>
              <span className="text-gray-500 dark:text-gray-400">
                {answeredCount} of {questions.length} Answered
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 font-mono text-xs font-bold text-gray-900 dark:text-white shadow-sm">
                <Clock size={13} className="text-amber-500" />
                <span>{formatSeconds(secondsLeft)}</span>
              </div>
            </div>
          </div>

          {/* Question Palette Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {questions.map((_, idx) => {
              const isAnswered = answers[idx] !== undefined && (Array.isArray(answers[idx]) ? answers[idx].length > 0 : true);
              const isActive = idx === currentIndex;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setCurrentIndex(idx)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition-all flex items-center justify-center shrink-0 ${
                    isActive
                      ? "bg-purple-600 text-white shadow-sm ring-2 ring-purple-400/30"
                      : isAnswered
                      ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                      : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>

          {/* Active Question Box */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4 shadow-sm">
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 dark:border-gray-700/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-purple-50 dark:bg-purple-900/40 text-purple-600 dark:text-purple-400 flex items-center justify-center text-xs font-black">
                  {currentIndex + 1}
                </span>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${
                    isCurrentMsq
                      ? "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300"
                      : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                  }`}
                >
                  {isCurrentMsq ? <CheckSquare size={11} /> : <CircleDot size={11} />}
                  {isCurrentMsq ? "MSQ (Select all that apply)" : "MCQ (Single choice)"}
                </span>
              </div>

              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
                {currentQ.marks || 1} pt{Number(currentQ.marks) !== 1 ? "s" : ""}
              </span>
            </div>

            <p className="text-sm font-semibold text-gray-900 dark:text-white leading-relaxed">
              {currentQ.text}
            </p>

            {/* Options list */}
            <div className="space-y-2 pt-1">
              {(currentQ.options || []).map((opt, optIdx) => {
                const isSelected = isCurrentMsq
                  ? Array.isArray(answers[currentIndex]) && answers[currentIndex].includes(optIdx)
                  : answers[currentIndex] === optIdx;

                return (
                  <label
                    key={optIdx}
                    onClick={(e) => {
                      e.preventDefault();
                      handleSelectOption(currentIndex, optIdx, isCurrentMsq);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                      isSelected
                        ? "bg-purple-50/70 dark:bg-purple-950/40 border-purple-400 dark:border-purple-700 text-purple-950 dark:text-purple-100 ring-1 ring-purple-400/30"
                        : "bg-gray-50/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/50"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center transition-all ${
                        isCurrentMsq ? "rounded" : "rounded-full"
                      } ${
                        isSelected
                          ? "bg-purple-600 text-white"
                          : "border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"
                      }`}
                    >
                      {isSelected && (
                        isCurrentMsq ? <CheckSquare size={12} /> : <div className="w-1.5 h-1.5 rounded-full bg-white" />
                      )}
                    </div>

                    <span className="font-bold opacity-60 w-4">
                      {String.fromCharCode(65 + optIdx)}.
                    </span>

                    <span className="flex-1 font-medium">{opt}</span>
                  </label>
                );
              })}
            </div>

            {/* Stepper controls */}
            <div className="pt-2 flex items-center justify-between border-t border-gray-100 dark:border-gray-700/60">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentIndex === 0}
                icon={<ChevronLeft size={14} />}
                onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
              >
                Previous
              </Button>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentIndex === questions.length - 1}
                icon={<ChevronRight size={14} />}
                onClick={() => setCurrentIndex((prev) => Math.min(questions.length - 1, prev + 1))}
              >
                Next Question
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. SUBMITTED / INSTANT RESULTS REPORT                                    */}
      {/* ========================================================================= */}
      {testState === "submitted" && evaluation && (
        <div className="space-y-5 py-2">
          {/* Main Scorecard Banner */}
          <div
            className={`rounded-2xl border p-5 text-center transition-all ${
              evaluation.passed
                ? "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800"
                : "bg-red-50/70 dark:bg-red-950/30 border-red-300 dark:border-red-800"
            }`}
          >
            <div className="inline-flex p-3 rounded-2xl mb-2 bg-white dark:bg-gray-800 shadow-sm">
              {evaluation.passed ? (
                <CheckCircle2 size={36} className="text-emerald-500" />
              ) : (
                <XCircle size={36} className="text-red-500" />
              )}
            </div>

            <h3 className="text-2xl font-black text-gray-900 dark:text-white">
              {evaluation.scorePct}% Score
            </h3>

            <div className="flex items-center justify-center gap-2 mt-1">
              <span
                className={`px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  evaluation.passed
                    ? "bg-emerald-200 dark:bg-emerald-900/60 text-emerald-900 dark:text-emerald-200"
                    : "bg-red-200 dark:bg-red-900/60 text-red-900 dark:text-red-200"
                }`}
              >
                {evaluation.passed ? "Passed Test" : "Failed Test"}
              </span>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                (Pass Mark: {evaluation.passingScore}%)
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-4 pt-3 border-t border-gray-200/60 dark:border-gray-700/60 text-center">
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Marks Earned</span>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  {evaluation.earnedMarks} / {evaluation.totalMarks} pts
                </p>
              </div>
              <div>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Correct Questions</span>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  {evaluation.correctQuestionsCount} / {evaluation.totalQuestions}
                </p>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Time Taken</span>
                <p className="text-base font-bold text-gray-900 dark:text-white">
                  {formatSeconds((quiz.duration_minutes || 30) * 60 - secondsLeft)}
                </p>
              </div>
            </div>
          </div>

          {/* Question-by-Question Evaluation Breakdown */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 flex items-center justify-between">
              <span>Question-by-Question Scoring Breakdown</span>
              <span>{evaluation.breakdown.length} Questions</span>
            </h4>

            <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
              {evaluation.breakdown.map((item, idx) => {
                const { question, type, qMarks, qEarned, status, given, correctIndices } = item;

                return (
                  <div
                    key={idx}
                    className={`rounded-xl border p-3.5 space-y-2.5 text-xs transition-all ${
                      status === "correct"
                        ? "border-emerald-200 dark:border-emerald-800/70 bg-emerald-50/30 dark:bg-emerald-950/10"
                        : status === "partial"
                        ? "border-amber-200 dark:border-amber-800/70 bg-amber-50/30 dark:bg-amber-950/10"
                        : "border-red-200 dark:border-red-800/70 bg-red-50/30 dark:bg-red-950/10"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        <span className="font-extrabold px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                          Q{idx + 1}
                        </span>
                        <p className="font-semibold text-gray-900 dark:text-white text-xs">
                          {question.text}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            status === "correct"
                              ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-300"
                              : status === "partial"
                              ? "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-300"
                              : "bg-red-100 dark:bg-red-900/50 text-red-800 dark:text-red-300"
                          }`}
                        >
                          {status === "correct" ? "Full Credit" : status === "partial" ? "Partial Credit" : "No Credit"}
                        </span>
                        <span className="font-bold text-gray-700 dark:text-gray-300">
                          {qEarned} / {qMarks} pts
                        </span>
                      </div>
                    </div>

                    {/* Options status preview */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
                      {(question.options || []).map((opt, optIdx) => {
                        const isSelected = type === "msq"
                          ? Array.isArray(given) && given.includes(optIdx)
                          : given === optIdx;
                        
                        const isCorrectKey = correctIndices.includes(optIdx);
                        const optMark = Number(question.option_marks?.[optIdx]) || 0;

                        return (
                          <div
                            key={optIdx}
                            className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[11px] ${
                              isSelected && isCorrectKey
                                ? "bg-emerald-100/70 dark:bg-emerald-900/40 border-emerald-300 dark:border-emerald-700 font-semibold text-emerald-900 dark:text-emerald-200"
                                : isSelected && !isCorrectKey
                                ? "bg-red-100/70 dark:bg-red-900/40 border-red-300 dark:border-red-700 text-red-900 dark:text-red-200 line-through"
                                : isCorrectKey
                                ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-dashed border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                                : "bg-gray-50 dark:bg-gray-800/40 border-gray-100 dark:border-gray-700/60 text-gray-500"
                            }`}
                          >
                            <span className="font-bold opacity-60">
                              {String.fromCharCode(65 + optIdx)}.
                            </span>
                            <span className="flex-1 truncate">{opt}</span>
                            {isCorrectKey && (
                              <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                                {optMark > 0 ? `+${optMark}pt` : "Correct"}
                              </span>
                            )}
                            {isSelected && (
                              <span className="text-[9px] uppercase px-1 rounded bg-black/10 dark:bg-white/10 font-bold">
                                Chosen
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
