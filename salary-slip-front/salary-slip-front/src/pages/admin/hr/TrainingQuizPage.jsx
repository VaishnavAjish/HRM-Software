import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { BookOpen, Calendar, HelpCircle, Plus, Eye, Edit, Trash2, Award, ClipboardList, CheckCircle2, X } from "lucide-react";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";

const EMPTY_QUESTION = {
  text: "",
  options: ["", "", "", ""],
  correct_index: 0
};

const EMPTY_FORM = {
  title: "",
  description: "",
  requisition_id: "",
  passing_score: 60,
  questions: [{ ...EMPTY_QUESTION }]
};

export default function TrainingQuizPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [requisitions, setRequisitions] = useState([]);
  
  // Modals state
  const [formModalOpen, setFormModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);

  // Fetch initial data
  const fetchData = async () => {
    if (!user?.accessToken) return;
    setLoading(true);
    try {
      // Get Quizzes
      const quizRes = await hrApi.getQuizzes(user.accessToken, user.tokenType);
      if (quizRes.status) {
        setQuizzes(quizRes.data?.data || quizRes.data || []);
      }

      // Get Open Requisitions (approved or posted)
      const reqRes = await hrApi.getRequisitions(user.accessToken, user.tokenType, {
        status: "approved,posted",
        per_page: 100
      });
      if (reqRes.status) {
        setRequisitions(reqRes.data?.data || reqRes.data || []);
      }
    } catch (err) {
      toast.error(err.message || "Failed to load page data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [user]);

  // Quiz creation / editing handlers
  const handleOpenCreate = () => {
    setIsEditing(false);
    setForm({
      ...EMPTY_FORM,
      requisition_id: requisitions[0]?.id || "",
      questions: [{ ...EMPTY_QUESTION, options: ["", "", "", ""] }]
    });
    setFormModalOpen(true);
  };

  const handleOpenEdit = (quiz) => {
    setIsEditing(true);
    setSelectedQuiz(quiz);
    setForm({
      title: quiz.title,
      description: quiz.description || "",
      requisition_id: quiz.requisition_id || "",
      passing_score: quiz.passing_score || 60,
      questions: quiz.questions?.map(q => ({
        text: q.text,
        options: [...(q.options || ["", "", "", ""])],
        correct_index: q.correct_index
      })) || [{ ...EMPTY_QUESTION, options: ["", "", "", ""] }]
    });
    setFormModalOpen(true);
  };

  const handleOpenView = (quiz) => {
    setSelectedQuiz(quiz);
    setViewModalOpen(true);
  };

  const handleAddQuestion = () => {
    setForm(prev => ({
      ...prev,
      questions: [...prev.questions, { ...EMPTY_QUESTION, options: ["", "", "", ""] }]
    }));
  };

  const handleRemoveQuestion = (idx) => {
    if (form.questions.length <= 1) {
      toast.error("Quizzes must have at least one question.");
      return;
    }
    setForm(prev => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== idx)
    }));
  };

  const handleQuestionTextChange = (idx, text) => {
    setForm(prev => {
      const updated = [...prev.questions];
      updated[idx].text = text;
      return { ...prev, questions: updated };
    });
  };

  const handleOptionChange = (qIdx, optIdx, val) => {
    setForm(prev => {
      const updated = [...prev.questions];
      updated[qIdx].options[optIdx] = val;
      return { ...prev, questions: updated };
    });
  };

  const handleCorrectIndexChange = (qIdx, correctIdx) => {
    setForm(prev => {
      const updated = [...prev.questions];
      updated[qIdx].correct_index = parseInt(correctIdx);
      return { ...prev, questions: updated };
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error("Please enter a quiz title.");
      return;
    }

    // Basic question validation
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      if (!q.text.trim()) {
        toast.error(`Question ${i + 1} has no text.`);
        return;
      }
      for (let j = 0; j < q.options.length; j++) {
        if (!q.options[j].trim()) {
          toast.error(`Question ${i + 1}, Option ${j + 1} is empty.`);
          return;
        }
      }
    }

    setSaving(true);
    try {
      let res;
      if (isEditing) {
        res = await hrApi.updateQuiz(selectedQuiz.id, form, user.accessToken, user.tokenType);
      } else {
        res = await hrApi.storeQuiz(form, user.accessToken, user.tokenType);
      }

      if (res.status) {
        toast.success(isEditing ? "Quiz updated successfully." : "Quiz created successfully.");
        setFormModalOpen(false);
        fetchData();
      } else {
        toast.error(res.message || "Failed to save quiz.");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save quiz.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (quizId) => {
    if (!confirm("Are you sure you want to delete this training quiz?")) return;
    try {
      const res = await hrApi.deleteQuiz(quizId, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Quiz deleted.");
        fetchData();
      } else {
        toast.error(res.message || "Failed to delete quiz.");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete quiz.");
    }
  };

  // Dashboard Stats Calculations
  const totalQuizzes = quizzes.length;
  const avgPassingScore = totalQuizzes
    ? Math.round(quizzes.reduce((sum, q) => sum + (q.passing_score || 0), 0) / totalQuizzes)
    : 0;
  const totalQuestions = quizzes.reduce((sum, q) => sum + (q.questions?.length || 0), 0);
  const linkedRequisitions = quizzes.filter(q => q.requisition_id).length;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Design and link assessment quizzes to open job requisitions to qualify and train candidates.
          </p>
        </div>
        <div className="flex-shrink-0">
          <Button onClick={handleOpenCreate} icon={<Plus size={16} />}>
            Create Quiz
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/30 rounded-xl text-blue-600 dark:text-blue-400">
            <BookOpen size={20} />
          </div>
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Quizzes</span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">{totalQuizzes}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl text-indigo-600 dark:text-indigo-400">
            <ClipboardList size={20} />
          </div>
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Linked Jobs</span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">{linkedRequisitions}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-purple-50 dark:bg-purple-900/30 rounded-xl text-purple-600 dark:text-purple-400">
            <HelpCircle size={20} />
          </div>
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Total Questions</span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">{totalQuestions}</span>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 p-5 flex items-center gap-4 shadow-sm">
          <div className="p-3 bg-green-50 dark:bg-green-900/30 rounded-xl text-green-600 dark:text-green-400">
            <Award size={20} />
          </div>
          <div>
            <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-400">Avg Pass Score</span>
            <span className="text-xl font-bold text-gray-900 dark:text-white">{avgPassingScore}%</span>
          </div>
        </div>
      </div>

      {/* Main List */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6">
            <SkeletonTable rows={6} />
          </div>
        ) : quizzes.length === 0 ? (
          <div className="text-center py-20 px-6 space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-gray-50 dark:bg-gray-700/50 flex items-center justify-center text-gray-400 mx-auto">
              <BookOpen size={24} />
            </div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">No Quizzes Created Yet</h3>
            <p className="text-xs text-gray-400 max-w-sm mx-auto">
              Click the "Create Quiz" button above to design your first quiz assessment.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-5 py-3.5">Quiz Details</th>
                  <th className="text-left px-5 py-3.5">Associated Open Job</th>
                  <th className="text-center px-5 py-3.5">Questions</th>
                  <th className="text-center px-5 py-3.5">Passing Score</th>
                  <th className="text-left px-5 py-3.5">Created By</th>
                  <th className="text-right px-5 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {quizzes.map((quiz) => (
                  <tr key={quiz.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-5 py-4">
                      <b className="font-semibold text-gray-950 dark:text-white block">{quiz.title}</b>
                      {quiz.description && (
                        <span className="text-xs text-gray-400 line-clamp-1 mt-0.5 max-w-xs">{quiz.description}</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-gray-600 dark:text-gray-300">
                      {quiz.requisition ? (
                        <div>
                          <b className="font-medium text-gray-900 dark:text-white text-xs block">{quiz.requisition.title}</b>
                          <span className="text-[10px] uppercase font-semibold text-brand-600 dark:text-brand-400 bg-brand-50 dark:bg-brand-900/20 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                            {quiz.requisition.designation || "Job"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">General Training (No job linked)</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-center text-gray-600 dark:text-gray-300 font-mono text-xs">
                      {quiz.questions?.length || 0}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <Badge variant="blue">{quiz.passing_score || 60}%</Badge>
                    </td>
                    <td className="px-5 py-4">
                      <span className="text-xs text-gray-700 dark:text-gray-300 font-medium block">
                        {quiz.creator?.name || "HR System"}
                      </span>
                      <span className="text-[10px] text-gray-400 block mt-0.5">
                        {new Date(quiz.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenView(quiz)}
                          title="View Questions"
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-gray-900 rounded-lg transition-all"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(quiz)}
                          title="Edit Quiz"
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-brand-600 rounded-lg transition-all"
                        >
                          <Edit size={15} />
                        </button>
                        <button
                          onClick={() => handleDelete(quiz.id)}
                          title="Delete Quiz"
                          className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-600 rounded-lg transition-all"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* VIEW MODAL */}
      <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title="Quiz Detail Preview" size="lg">
        {selectedQuiz && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">{selectedQuiz.title}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{selectedQuiz.description || "No description provided."}</p>
              
              <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-xs">
                <div>
                  <span className="text-gray-400">Target Job:</span>
                  <span className="font-semibold ml-1.5 text-gray-800 dark:text-gray-200">
                    {selectedQuiz.requisition?.title || "General"}
                  </span>
                </div>
                <div>
                  <span className="text-gray-400">Passing Score:</span>
                  <span className="font-semibold ml-1.5 text-brand-600 dark:text-brand-400">{selectedQuiz.passing_score}%</span>
                </div>
                <div>
                  <span className="text-gray-400">Questions:</span>
                  <span className="font-semibold ml-1.5 text-gray-800 dark:text-gray-200">{selectedQuiz.questions?.length || 0}</span>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">Question List</h4>
              {selectedQuiz.questions?.map((q, idx) => (
                <div key={idx} className="p-4 bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-700/60 rounded-xl space-y-2">
                  <div className="flex gap-2">
                    <span className="font-mono font-bold text-brand-600">Q{idx + 1}.</span>
                    <p className="font-semibold text-gray-900 dark:text-white">{q.text}</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-7">
                    {(q.options || []).map((opt, optIdx) => {
                      const isCorrect = optIdx === q.correct_index;
                      return (
                        <div
                          key={optIdx}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs ${
                            isCorrect
                              ? "bg-green-50 border-green-200 text-green-800 dark:bg-green-950/20 dark:border-green-900/40 dark:text-green-400"
                              : "bg-white border-gray-100 text-gray-600 dark:bg-gray-800 dark:border-gray-700/50 dark:text-gray-300"
                          }`}
                        >
                          {isCorrect ? <CheckCircle2 size={13} className="text-green-600" /> : <div className="h-3 w-3 rounded-full border border-gray-300" />}
                          <span className="truncate">{opt}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end pt-3 border-t border-gray-100 dark:border-gray-700">
              <Button onClick={() => setViewModalOpen(false)}>Close Preview</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* FORM MODAL (CREATE / EDIT) */}
      <Modal
        isOpen={formModalOpen}
        onClose={() => setFormModalOpen(false)}
        title={isEditing ? "Edit Training Quiz" : "Create Training Quiz"}
        size="xl"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setFormModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Quiz"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Requisition Dropdown */}
            <div className="space-y-1.5 col-span-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Link to Open Job Requisition
              </label>
              <select
                value={form.requisition_id}
                onChange={(e) => setForm({ ...form, requisition_id: e.target.value })}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="">General Training (No specific job)</option>
                {requisitions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.title} ({r.designation || "No Designation"} - {r.unit || "All"})
                  </option>
                ))}
              </select>
            </div>

            {/* Quiz Title */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Quiz Title
              </label>
              <input
                type="text"
                placeholder="e.g. Frontend Development Test"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400"
                required
              />
            </div>

            {/* Passing Score */}
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Passing Score (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                value={form.passing_score}
                onChange={(e) => setForm({ ...form, passing_score: parseInt(e.target.value) || 0 })}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                required
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5 col-span-2">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Description / Guidelines
              </label>
              <textarea
                placeholder="Brief guidelines or info for candidates taking this assessment..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full text-sm px-3.5 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 placeholder-gray-400 resize-none"
              />
            </div>
          </div>

          {/* QUESTIONS BUILDER */}
          <div className="space-y-4 pt-4 border-t border-gray-100 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase tracking-wider">
                Quiz Questions ({form.questions.length})
              </h3>
              <Button type="button" variant="secondary" size="sm" onClick={handleAddQuestion} icon={<Plus size={14} />}>
                Add Question
              </Button>
            </div>

            <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-1">
              {form.questions.map((question, qIdx) => (
                <div
                  key={qIdx}
                  className="p-4 bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3 relative group"
                >
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(qIdx)}
                    className="absolute top-4 right-4 text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all"
                  >
                    <X size={15} />
                  </button>

                  <div className="flex gap-2.5 pr-8">
                    <span className="font-mono font-bold text-brand-600 text-sm mt-2">Q{qIdx + 1}.</span>
                    <div className="flex-1 space-y-1">
                      <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Question Text
                      </label>
                      <input
                        type="text"
                        placeholder="Enter the question query..."
                        value={question.text}
                        onChange={(e) => handleQuestionTextChange(qIdx, e.target.value)}
                        className="w-full text-sm px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder-gray-400"
                        required
                      />
                    </div>
                  </div>

                  {/* 4 Options Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-7">
                    {question.options.map((opt, optIdx) => (
                      <div key={optIdx} className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                            Option {String.fromCharCode(65 + optIdx)}
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="radio"
                              name={`correct-answer-${qIdx}`}
                              checked={question.correct_index === optIdx}
                              onChange={() => handleCorrectIndexChange(qIdx, optIdx)}
                              className="text-brand-600 focus:ring-brand-500 h-3 w-3 border-gray-300"
                            />
                            <span className="text-[10px] font-bold text-gray-400 hover:text-green-600 uppercase tracking-wider">
                              Correct
                            </span>
                          </label>
                        </div>
                        <input
                          type="text"
                          placeholder={`Enter Option ${String.fromCharCode(65 + optIdx)} text...`}
                          value={opt}
                          onChange={(e) => handleOptionChange(qIdx, optIdx, e.target.value)}
                          className="w-full text-xs px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-brand-500 placeholder-gray-400"
                          required
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
