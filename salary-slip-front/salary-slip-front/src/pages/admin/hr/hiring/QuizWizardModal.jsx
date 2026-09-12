import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  ShieldAlert,
  Trash2,
  Sparkles,
  CheckSquare,
  CircleDot,
  AlertCircle,
  Clock,
  Award,
  Divide,
} from "lucide-react";
import Modal from "../../../../components/ui/Modal";
import Button from "../../../../components/ui/Button";

const inputClass =
  "w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700/80 px-3.5 py-2.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all outline-none";

const EMPTY_QUESTION = {
  text: "",
  type: "mcq", // 'mcq' | 'msq'
  marks: 1,
  options: ["", "", "", ""],
  option_marks: [1, 0, 0, 0], // per-option marks allocation
  correct_index: 0,
  correct_indices: [0],
};

const EMPTY_FORM = {
  title: "",
  description: "",
  requisition_id: "",
  interview_id: "",
  passing_score: 60,
  total_marks_target: 10,
  duration_minutes: 30,
  max_violations: 3,
  questions: [{ ...EMPTY_QUESTION, options: ["", "", "", ""], option_marks: [1, 0, 0, 0], correct_indices: [0] }],
};

export default function QuizWizardModal({
  isOpen,
  onClose,
  onSave,
  editingQuiz = null,
  saving = false,
  requisitions = [],
}) {
  const [step, setStep] = useState(1); // 1: Details, 2: Questions (One-by-One)
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [form, setForm] = useState(EMPTY_FORM);

  // Initialize or reset form when modal opens or editingQuiz changes
  useEffect(() => {
    if (!isOpen) return;

    if (editingQuiz) {
      const rawQuestions = Array.isArray(editingQuiz.questions) && editingQuiz.questions.length > 0
        ? editingQuiz.questions
        : [{ ...EMPTY_QUESTION }];

      const normalizedQuestions = rawQuestions.map((q) => {
        const type = q.type || (Array.isArray(q.correct_indices) && q.correct_indices.length > 1 ? "msq" : "mcq");
        const correctIndex = typeof q.correct_index === "number" ? q.correct_index : (q.correct_indices?.[0] ?? 0);
        const correctIndices = Array.isArray(q.correct_indices) && q.correct_indices.length > 0
          ? q.correct_indices
          : [correctIndex];
        const marks = Number(q.marks) || 1;
        const opts = Array.isArray(q.options) && q.options.length >= 2
          ? [...q.options]
          : ["", "", "", ""];

        // Normalize option_marks
        let optMarks;
        if (Array.isArray(q.option_marks) && q.option_marks.length === opts.length) {
          optMarks = q.option_marks.map((m) => Number(m) || 0);
        } else if (type === "msq") {
          const count = correctIndices.length || 1;
          const perOpt = Number((marks / count).toFixed(2));
          optMarks = opts.map((_, oi) => (correctIndices.includes(oi) ? perOpt : 0));
        } else {
          optMarks = opts.map((_, oi) => (oi === correctIndex ? marks : 0));
        }
        
        return {
          text: q.text || "",
          type,
          marks,
          options: opts,
          option_marks: optMarks,
          correct_index: correctIndex,
          correct_indices: correctIndices,
        };
      });

      const totalMarksSum = normalizedQuestions.reduce((acc, q) => acc + (Number(q.marks) || 1), 0);

      setForm({
        title: editingQuiz.title || "",
        description: editingQuiz.description || "",
        requisition_id: editingQuiz.requisition_id || "",
        interview_id: editingQuiz.interview_id || "",
        passing_score: editingQuiz.passing_score ?? 60,
        total_marks_target: editingQuiz.total_marks_target || totalMarksSum || 10,
        duration_minutes: editingQuiz.duration_minutes ?? 30,
        max_violations: editingQuiz.max_violations ?? 3,
        questions: normalizedQuestions,
      });
    } else {
      setForm({
        ...EMPTY_FORM,
        requisition_id: requisitions[0]?.id || "",
        questions: [{ ...EMPTY_QUESTION, options: ["", "", "", ""], option_marks: [1, 0, 0, 0], correct_indices: [0] }],
      });
    }

    setStep(1);
    setCurrentQIndex(0);
  }, [isOpen, editingQuiz, requisitions]);

  // Derived metrics
  const marksCovered = useMemo(() => {
    return form.questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  }, [form.questions]);

  const targetMarks = Number(form.total_marks_target) || marksCovered || 0;
  const marksRemaining = Math.max(0, targetMarks - marksCovered);
  const marksOver = Math.max(0, marksCovered - targetMarks);

  // Active question in Step 2
  const activeQuestion = form.questions[currentQIndex] || {
    ...EMPTY_QUESTION,
    options: ["", "", "", ""],
    option_marks: [1, 0, 0, 0],
  };

  // Option marks sum for active question
  const activeOptionMarksSum = useMemo(() => {
    const list = activeQuestion.option_marks || [];
    return Number(list.reduce((sum, m) => sum + (Number(m) || 0), 0).toFixed(2));
  }, [activeQuestion.option_marks]);

  const optionMarksExceeded = activeOptionMarksSum > (Number(activeQuestion.marks) || 0);
  const optionMarksRemaining = Math.max(0, (Number(activeQuestion.marks) || 0) - activeOptionMarksSum);

  const updateActiveQuestion = (patch) => {
    setForm((prev) => {
      const nextQuestions = [...prev.questions];
      const updated = { ...nextQuestions[currentQIndex], ...patch };

      // Keep correct_index & correct_indices in sync
      if (patch.type === "mcq") {
        const first = updated.correct_indices?.[0] ?? updated.correct_index ?? 0;
        updated.correct_index = first;
        updated.correct_indices = [first];
        // For MCQ, single correct option gets the full question marks
        updated.option_marks = (updated.options || []).map((_, idx) => (idx === first ? (Number(updated.marks) || 1) : 0));
      } else if (patch.type === "msq") {
        if (patch.correct_indices) {
          updated.correct_index = patch.correct_indices[0] ?? 0;
        }
      }

      // If question marks changed, ensure option_marks exist
      if (patch.marks !== undefined && updated.type === "mcq") {
        const cIdx = updated.correct_index ?? 0;
        updated.option_marks = (updated.options || []).map((_, idx) => (idx === cIdx ? Number(patch.marks) : 0));
      }

      nextQuestions[currentQIndex] = updated;
      return { ...prev, questions: nextQuestions };
    });
  };

  const handleAddQuestion = () => {
    const newQ = {
      ...EMPTY_QUESTION,
      marks: 1,
      options: ["", "", "", ""],
      option_marks: [1, 0, 0, 0],
      correct_indices: [0],
      correct_index: 0,
    };
    setForm((prev) => ({
      ...prev,
      questions: [...prev.questions, newQ],
    }));
    setCurrentQIndex(form.questions.length);
  };

  const handleRemoveQuestion = (idx) => {
    if (form.questions.length <= 1) {
      toast.error("Quiz must have at least one question.");
      return;
    }
    setForm((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx),
    }));
    if (currentQIndex >= form.questions.length - 1) {
      setCurrentQIndex(Math.max(0, form.questions.length - 2));
    }
  };

  // Option text change for active question
  const handleOptionChange = (optIdx, value) => {
    const opts = [...activeQuestion.options];
    opts[optIdx] = value;
    updateActiveQuestion({ options: opts });
  };

  // Option mark change for active question (MSQ)
  const handleOptionMarkChange = (optIdx, val) => {
    const num = Math.max(0, Number(val) || 0);
    const qMarks = Number(activeQuestion.marks) || 1;
    
    // Check if new mark would exceed question marks
    const currentMarks = [...(activeQuestion.option_marks || [])];
    while (currentMarks.length < activeQuestion.options.length) {
      currentMarks.push(0);
    }
    
    const otherMarksSum = currentMarks.reduce((sum, m, i) => (i === optIdx ? sum : sum + (Number(m) || 0)), 0);
    if (otherMarksSum + num > qMarks + 0.001) {
      toast.error(`Option mark cannot exceed question total (${qMarks} marks). Max for this option is ${(qMarks - otherMarksSum).toFixed(2)}.`);
      currentMarks[optIdx] = Math.max(0, Number((qMarks - otherMarksSum).toFixed(2)));
    } else {
      currentMarks[optIdx] = num;
    }

    // If mark > 0, make sure option is marked as correct
    let correct = [...(activeQuestion.correct_indices || [])];
    if (currentMarks[optIdx] > 0 && !correct.includes(optIdx)) {
      correct.push(optIdx);
      correct.sort((a, b) => a - b);
    } else if (currentMarks[optIdx] === 0 && correct.includes(optIdx) && correct.length > 1) {
      correct = correct.filter((i) => i !== optIdx);
    }

    updateActiveQuestion({
      option_marks: currentMarks,
      correct_indices: correct,
      correct_index: correct[0] ?? 0,
    });
  };

  // Auto split marks equally across all correct options
  const handleAutoDistributeMarks = () => {
    const qMarks = Number(activeQuestion.marks) || 1;
    const correct = activeQuestion.correct_indices || [0];
    if (correct.length === 0) {
      toast.error("Please select at least one correct option first.");
      return;
    }
    const perOption = Number((qMarks / correct.length).toFixed(2));
    const nextOptMarks = (activeQuestion.options || []).map((_, oi) =>
      correct.includes(oi) ? perOption : 0
    );

    // Adjust any tiny rounding difference onto the last correct option
    const sum = nextOptMarks.reduce((a, b) => a + b, 0);
    const diff = Number((qMarks - sum).toFixed(2));
    if (diff !== 0 && correct.length > 0) {
      const lastIdx = correct[correct.length - 1];
      nextOptMarks[lastIdx] = Number((nextOptMarks[lastIdx] + diff).toFixed(2));
    }

    updateActiveQuestion({ option_marks: nextOptMarks });
    toast.success(`Distributed ${qMarks} marks across ${correct.length} option(s).`);
  };

  const handleAddOption = () => {
    if (activeQuestion.options.length >= 8) {
      toast.error("Maximum 8 options per question.");
      return;
    }
    const nextOpts = [...activeQuestion.options, ""];
    const nextMarks = [...(activeQuestion.option_marks || []), 0];
    updateActiveQuestion({
      options: nextOpts,
      option_marks: nextMarks,
    });
  };

  const handleRemoveOption = (optIdx) => {
    if (activeQuestion.options.length <= 2) {
      toast.error("At least 2 options are required.");
      return;
    }
    const newOptions = activeQuestion.options.filter((_, i) => i !== optIdx);
    const newOptionMarks = (activeQuestion.option_marks || []).filter((_, i) => i !== optIdx);
    
    // Adjust correct indices
    let newCorrectIndices = (activeQuestion.correct_indices || [0])
      .filter((i) => i !== optIdx)
      .map((i) => (i > optIdx ? i - 1 : i));
    
    if (newCorrectIndices.length === 0) {
      newCorrectIndices = [0];
      if (newOptionMarks.length > 0) {
        newOptionMarks[0] = Number(activeQuestion.marks) || 1;
      }
    }

    updateActiveQuestion({
      options: newOptions,
      option_marks: newOptionMarks,
      correct_indices: newCorrectIndices,
      correct_index: newCorrectIndices[0],
    });
  };

  // Toggle correct answer for MCQ vs MSQ
  const handleToggleCorrectOption = (optIdx) => {
    const qMarks = Number(activeQuestion.marks) || 1;
    const optMarks = [...(activeQuestion.option_marks || [])];
    while (optMarks.length < activeQuestion.options.length) optMarks.push(0);

    if (activeQuestion.type === "msq") {
      const current = activeQuestion.correct_indices || [];
      let next;
      if (current.includes(optIdx)) {
        if (current.length === 1) {
          toast.error("At least one option must be marked as correct.");
          return;
        }
        next = current.filter((i) => i !== optIdx);
        optMarks[optIdx] = 0;
      } else {
        next = [...current, optIdx].sort((a, b) => a - b);
        // Automatically allocate fair share if 0
        if (optMarks[optIdx] === 0) {
          const perOpt = Number((qMarks / next.length).toFixed(2));
          next.forEach((idx) => {
            optMarks[idx] = perOpt;
          });
        }
      }

      updateActiveQuestion({
        correct_indices: next,
        correct_index: next[0] ?? 0,
        option_marks: optMarks,
      });
    } else {
      // MCQ single choice
      const newMarks = activeQuestion.options.map((_, i) => (i === optIdx ? qMarks : 0));
      updateActiveQuestion({
        correct_index: optIdx,
        correct_indices: [optIdx],
        option_marks: newMarks,
      });
    }
  };

  // Validate Step 1 before proceeding
  const handleProceedToStep2 = () => {
    if (!form.title.trim()) {
      toast.error("Please provide a quiz title.");
      return;
    }
    if (Number(form.passing_score) < 0 || Number(form.passing_score) > 100) {
      toast.error("Passing score must be between 0% and 100%.");
      return;
    }
    if (Number(form.duration_minutes) < 1 || Number(form.duration_minutes) > 480) {
      toast.error("Time limit must be between 1 and 480 minutes.");
      return;
    }
    if (Number(form.max_violations) < 1 || Number(form.max_violations) > 50) {
      toast.error("Max violations limit must be between 1 and 50.");
      return;
    }
    setStep(2);
  };

  // Final Validation and Submission
  const handleSubmit = () => {
    if (!form.title.trim()) {
      toast.error("Quiz title is required.");
      setStep(1);
      return;
    }

    // Validate each question
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      if (!q.text.trim()) {
        toast.error(`Question ${i + 1} text cannot be empty.`);
        setCurrentQIndex(i);
        setStep(2);
        return;
      }
      const validOptions = (q.options || []).filter((o) => o.trim().length > 0);
      if (validOptions.length < 2) {
        toast.error(`Question ${i + 1} must have at least 2 non-empty options.`);
        setCurrentQIndex(i);
        setStep(2);
        return;
      }
      if (!q.correct_indices || q.correct_indices.length === 0) {
        toast.error(`Question ${i + 1} must have at least one correct answer marked.`);
        setCurrentQIndex(i);
        setStep(2);
        return;
      }
      if (!q.marks || Number(q.marks) <= 0) {
        toast.error(`Question ${i + 1} marks must be greater than 0.`);
        setCurrentQIndex(i);
        setStep(2);
        return;
      }

      // Check option marks sum does not exceed question marks
      const optMarksSum = (q.option_marks || []).reduce((acc, m) => acc + (Number(m) || 0), 0);
      if (optMarksSum > Number(q.marks) + 0.01) {
        toast.error(`Question ${i + 1} option marks total (${optMarksSum.toFixed(2)}) exceeds question limit of ${q.marks} marks.`);
        setCurrentQIndex(i);
        setStep(2);
        return;
      }
    }

    // Clean payload
    const payload = {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      requisition_id: form.requisition_id || null,
      interview_id: form.interview_id || null,
      passing_score: Number(form.passing_score) || 60,
      duration_minutes: Number(form.duration_minutes) || 30,
      max_violations: Number(form.max_violations) || 3,
      total_marks_target: Number(form.total_marks_target) || marksCovered,
      questions: form.questions.map((q) => {
        const cleanedOpts = [];
        const cleanedOptMarks = [];
        (q.options || []).forEach((opt, idx) => {
          if (opt.trim().length > 0) {
            cleanedOpts.push(opt.trim());
            cleanedOptMarks.push(Number(q.option_marks?.[idx]) || 0);
          }
        });

        const mappedCorrectIndices = (q.correct_indices || [0])
          .filter((idx) => idx < cleanedOpts.length);
        const finalIndices = mappedCorrectIndices.length > 0 ? mappedCorrectIndices : [0];

        return {
          text: q.text.trim(),
          type: q.type || "mcq",
          marks: Number(q.marks) || 1,
          options: cleanedOpts,
          option_marks: cleanedOptMarks,
          correct_index: finalIndices[0],
          correct_indices: finalIndices,
        };
      }),
    };

    onSave(payload);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-900/30 text-brand-600 dark:text-brand-400">
            <Sparkles size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">
              {editingQuiz ? "Edit Assessment Quiz" : "Create New Assessment Quiz"}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {step === 1
                ? "Step 1 of 2: Assessment Details & Passing Rules"
                : "Step 2 of 2: Question Builder & Marks Allocation"}
            </p>
          </div>
        </div>
      }
      size="2xl"
      footer={
        <div className="flex items-center justify-between w-full">
          <div>
            {step === 2 && (
              <Button
                type="button"
                variant="secondary"
                icon={<ChevronLeft size={16} />}
                onClick={() => setStep(1)}
              >
                Back to Details
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2.5">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            {step === 1 ? (
              <Button
                onClick={handleProceedToStep2}
                icon={<ChevronRight size={16} />}
                className="bg-brand-600 hover:bg-brand-700 text-white"
              >
                Next: Add Questions
              </Button>
            ) : (
              <Button
                onClick={handleSubmit}
                disabled={saving || optionMarksExceeded}
                icon={<CheckCircle2 size={16} />}
                className="bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {saving ? "Saving Quiz..." : editingQuiz ? "Update Quiz" : "Create Quiz"}
              </Button>
            )}
          </div>
        </div>
      }
    >
      {/* Stepper Header Pills */}
      <div className="mb-5 flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-3.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              step === 1
                ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === 1 ? "bg-brand-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              }`}
            >
              1
            </span>
            Quiz Details & Rules
          </button>
          <span className="text-gray-300 dark:text-gray-600">/</span>
          <button
            type="button"
            onClick={handleProceedToStep2}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              step === 2
                ? "bg-brand-500/10 text-brand-600 dark:text-brand-400 border border-brand-500/20"
                : "text-gray-500 hover:text-gray-900 dark:text-gray-400"
            }`}
          >
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                step === 2 ? "bg-brand-600 text-white" : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
              }`}
            >
              2
            </span>
            Questions ({form.questions.length})
          </button>
        </div>

        {step === 2 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400">Covered:</span>
            <span className="font-bold text-gray-900 dark:text-white">{marksCovered} Marks</span>
            <span className="text-gray-300 dark:text-gray-600">•</span>
            <span className="text-gray-500 dark:text-gray-400">Target:</span>
            <span className="font-bold text-brand-600 dark:text-brand-400">{targetMarks} Marks</span>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* STEP 1: QUIZ DETAILS & RULES                                              */}
      {/* ========================================================================= */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Quiz Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Senior Frontend Developer Assessment"
              className={inputClass}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Description / Instructions
            </label>
            <textarea
              rows={2}
              placeholder="Provide context or guidelines for the candidate..."
              className={inputClass}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {requisitions?.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Target Job Requisition (Optional)
              </label>
              <select
                className={inputClass}
                value={form.requisition_id || ""}
                onChange={(e) => setForm({ ...form, requisition_id: e.target.value || null })}
              >
                <option value="">General / All Roles</option>
                {requisitions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} {r.department?.name ? `(${r.department.name})` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                <Award size={14} className="text-brand-500" />
                Target Total Marks
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                className={inputClass}
                value={form.total_marks_target}
                onChange={(e) => setForm({ ...form, total_marks_target: e.target.value })}
                placeholder="e.g. 10 or 100"
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Sum target for all questions.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                <CheckCircle2 size={14} className="text-emerald-500" />
                Passing Score (%) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                max="100"
                className={inputClass}
                value={form.passing_score}
                onChange={(e) => setForm({ ...form, passing_score: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Min % required to pass.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1 flex items-center gap-1.5">
                <Clock size={14} className="text-amber-500" />
                Time Limit (Minutes) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                max="480"
                className={inputClass}
                value={form.duration_minutes}
                onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
              />
              <p className="mt-1 text-[11px] text-gray-400">
                Quiz auto-submits on timeout.
              </p>
            </div>
          </div>

          {/* Proctoring Warning Count Configuration */}
          <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 p-3.5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 shrink-0">
                <ShieldAlert size={18} />
              </div>
              <div className="space-y-2 flex-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-900 dark:text-white">
                    Proctoring Warning Limit (Max Violations Before Auto-Termination)
                  </label>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100">
                    {form.max_violations} Warning{form.max_violations > 1 ? "s" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    step="1"
                    className="w-full h-2 bg-amber-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-600"
                    value={form.max_violations}
                    onChange={(e) => setForm({ ...form, max_violations: Number(e.target.value) })}
                  />
                  <input
                    type="number"
                    min="1"
                    max="20"
                    className="w-16 text-center text-xs font-bold rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 py-1"
                    value={form.max_violations}
                    onChange={(e) => setForm({ ...form, max_violations: Number(e.target.value) })}
                  />
                </div>
                <p className="text-[11px] text-gray-600 dark:text-gray-400 leading-relaxed">
                  Tab switching, exiting fullscreen, or minimizing the window counts as a violation. If a candidate exceeds <b>{form.max_violations} warning{form.max_violations > 1 ? "s" : ""}</b>, the test terminates immediately with a fail/terminated status.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: QUESTIONS ONE-BY-ONE BUILDER & MARKS COVERAGE STATUS              */}
      {/* ========================================================================= */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Live Marks Tracking Bar */}
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/80 p-3.5 shadow-sm">
            <div className="grid grid-cols-3 gap-2 text-center divide-x divide-gray-200 dark:divide-gray-700">
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Target Marks</p>
                <p className="text-base font-extrabold text-gray-900 dark:text-white">{targetMarks}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Marks Covered</p>
                <p className="text-base font-extrabold text-brand-600 dark:text-brand-400">{marksCovered}</p>
              </div>
              <div>
                <p className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">Status / Remaining</p>
                {marksRemaining === 0 && marksOver === 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 size={13} /> Balanced
                  </span>
                ) : marksRemaining > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-600 dark:text-amber-400">
                    <AlertCircle size={13} /> {marksRemaining} Left
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500">
                    +{marksOver} Over
                  </span>
                )}
              </div>
            </div>

            {/* Progress bar visual */}
            <div className="mt-2.5 h-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  marksCovered === targetMarks
                    ? "bg-emerald-500"
                    : marksCovered > targetMarks
                    ? "bg-red-500"
                    : "bg-brand-500"
                }`}
                style={{
                  width: `${targetMarks > 0 ? Math.min(100, (marksCovered / targetMarks) * 100) : 0}%`,
                }}
              />
            </div>
          </div>

          {/* Question Stepper Navigator */}
          <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-hide">
            <div className="flex items-center gap-1.5 flex-wrap">
              {form.questions.map((q, idx) => {
                const isActive = idx === currentQIndex;
                const isConfigured = q.text.trim().length > 0;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentQIndex(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                      isActive
                        ? "bg-brand-600 text-white shadow-sm ring-2 ring-brand-400/30"
                        : isConfigured
                        ? "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100"
                        : "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
                    }`}
                  >
                    <span>Q{idx + 1}</span>
                    <span className="text-[10px] opacity-80">({q.type === "msq" ? "MSQ" : "MCQ"})</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={handleAddQuestion}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold border border-dashed border-brand-300 dark:border-brand-700 text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-all"
              >
                <Plus size={13} /> Add
              </button>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                disabled={currentQIndex === 0}
                onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Previous Question"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                disabled={currentQIndex === form.questions.length - 1}
                onClick={() => setCurrentQIndex((prev) => Math.min(form.questions.length - 1, prev + 1))}
                className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-30 hover:bg-gray-100 dark:hover:bg-gray-800"
                title="Next Question"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* ACTIVE QUESTION CARD (ONE-BY-ONE) */}
          <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 space-y-4 shadow-sm">
            {/* Header: Question Number, Type Selector, Marks, and Delete */}
            <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-gray-100 dark:border-gray-700/60 pb-3">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-lg bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 flex items-center justify-center text-xs font-black">
                  Q{currentQIndex + 1}
                </span>
                
                {/* Question Type Switcher */}
                <div className="flex items-center bg-gray-100 dark:bg-gray-700 p-0.5 rounded-lg">
                  <button
                    type="button"
                    onClick={() => updateActiveQuestion({ type: "mcq" })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      activeQuestion.type === "mcq"
                        ? "bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    <CircleDot size={13} />
                    MCQ (Single Choice)
                  </button>
                  <button
                    type="button"
                    onClick={() => updateActiveQuestion({ type: "msq" })}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
                      activeQuestion.type === "msq"
                        ? "bg-white dark:bg-gray-800 text-brand-600 dark:text-brand-400 shadow-sm"
                        : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                    }`}
                  >
                    <CheckSquare size={13} />
                    MSQ (Multiple Select)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <label className="text-xs font-semibold text-gray-500 dark:text-gray-400">
                    Question Marks:
                  </label>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    className="w-16 text-center text-xs font-bold rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 py-1 text-gray-900 dark:text-white"
                    value={activeQuestion.marks || 1}
                    onChange={(e) => updateActiveQuestion({ marks: Number(e.target.value) || 1 })}
                  />
                </div>

                {form.questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(currentQIndex)}
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Delete Question"
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Question Text */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Question Statement <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={2}
                placeholder="Enter the question here..."
                className={inputClass}
                value={activeQuestion.text}
                onChange={(e) => updateActiveQuestion({ text: e.target.value })}
              />
            </div>

            {/* Options List with Individual Option Marks for MSQ */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    Answer Options & Per-Option Marks
                    {activeQuestion.type === "msq" ? (
                      <span className="text-[11px] font-normal text-purple-600 dark:text-purple-400">
                        (Allocate marks per correct option &bull; Max total: {activeQuestion.marks} pts)
                      </span>
                    ) : (
                      <span className="text-[11px] font-normal text-gray-400">
                        (Select single correct answer &bull; Worth {activeQuestion.marks} pts)
                      </span>
                    )}
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  {activeQuestion.type === "msq" && (
                    <button
                      type="button"
                      onClick={handleAutoDistributeMarks}
                      className="text-[11px] font-semibold text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800"
                      title="Evenly distribute question marks among checked options"
                    >
                      <Divide size={12} /> Auto-split Marks
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Option
                  </button>
                </div>
              </div>

              {/* MSQ Per-Option Marks Limit Bar */}
              {activeQuestion.type === "msq" && (
                <div
                  className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition-all ${
                    optionMarksExceeded
                      ? "bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300"
                      : activeOptionMarksSum === Number(activeQuestion.marks)
                      ? "bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300"
                      : "bg-amber-50/60 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {optionMarksExceeded ? (
                      <AlertCircle size={15} className="text-red-600 shrink-0" />
                    ) : (
                      <CheckCircle2 size={15} className="text-emerald-600 shrink-0" />
                    )}
                    <span className="font-semibold">
                      Allocated Option Marks:{" "}
                      <b>
                        {activeOptionMarksSum} / {activeQuestion.marks} pts
                      </b>
                    </span>
                  </div>

                  <div>
                    {optionMarksExceeded ? (
                      <span className="font-bold text-red-600">
                        Exceeds Question Marks by +{(activeOptionMarksSum - Number(activeQuestion.marks)).toFixed(2)} pts! (Please reduce option marks)
                      </span>
                    ) : optionMarksRemaining > 0 ? (
                      <span className="font-medium text-amber-700 dark:text-amber-300">
                        {optionMarksRemaining.toFixed(2)} pts remaining to allocate
                      </span>
                    ) : (
                      <span className="font-bold text-emerald-700 dark:text-emerald-400">
                        &check; Perfectly Balanced
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {activeQuestion.options.map((opt, optIdx) => {
                  const isCorrect = activeQuestion.type === "msq"
                    ? (activeQuestion.correct_indices || []).includes(optIdx)
                    : activeQuestion.correct_index === optIdx;
                  
                  const optMark = Number(activeQuestion.option_marks?.[optIdx]) || 0;

                  return (
                    <div
                      key={optIdx}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all ${
                        isCorrect
                          ? "border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20"
                          : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
                      }`}
                    >
                      {/* Checkbox or Radio selector */}
                      <button
                        type="button"
                        onClick={() => handleToggleCorrectOption(optIdx)}
                        className={`p-1.5 rounded-lg flex items-center justify-center transition-all ${
                          isCorrect
                            ? "bg-emerald-600 text-white"
                            : "bg-gray-200 dark:bg-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                        }`}
                        title={isCorrect ? "Correct Answer" : "Mark as Correct"}
                      >
                        {activeQuestion.type === "msq" ? (
                          <CheckSquare size={16} />
                        ) : (
                          <CircleDot size={16} />
                        )}
                      </button>

                      <span className="text-xs font-bold text-gray-400 w-5 text-center">
                        {String.fromCharCode(65 + optIdx)}
                      </span>

                      <input
                        type="text"
                        placeholder={`Option ${optIdx + 1} text`}
                        className={`${inputClass} !py-1.5 flex-1`}
                        value={opt}
                        onChange={(e) => handleOptionChange(optIdx, e.target.value)}
                      />

                      {/* Per-option marks input for MSQ */}
                      {activeQuestion.type === "msq" && (
                        <div className="flex items-center gap-1 shrink-0 bg-white dark:bg-gray-800 px-2 py-1 rounded-lg border border-gray-200 dark:border-gray-700">
                          <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                            Pts:
                          </span>
                          <input
                            type="number"
                            min="0"
                            max={activeQuestion.marks}
                            step="0.25"
                            className="w-14 text-center text-xs font-bold bg-transparent text-gray-900 dark:text-white outline-none"
                            value={optMark}
                            onChange={(e) => handleOptionMarkChange(optIdx, e.target.value)}
                            title={`Marks awarded for selecting Option ${String.fromCharCode(65 + optIdx)}`}
                          />
                        </div>
                      )}

                      {activeQuestion.options.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveOption(optIdx)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Remove option"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Question Actions: Prev, Next, Add Next */}
            <div className="pt-2 flex items-center justify-between border-t border-gray-100 dark:border-gray-700/60">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={currentQIndex === 0}
                icon={<ChevronLeft size={14} />}
                onClick={() => setCurrentQIndex((prev) => Math.max(0, prev - 1))}
              >
                Previous Question
              </Button>

              <div className="flex items-center gap-2">
                {currentQIndex === form.questions.length - 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<Plus size={14} />}
                    onClick={handleAddQuestion}
                  >
                    Add Next Question
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<ChevronRight size={14} />}
                    onClick={() => setCurrentQIndex((prev) => Math.min(form.questions.length - 1, prev + 1))}
                  >
                    Next Question
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}
