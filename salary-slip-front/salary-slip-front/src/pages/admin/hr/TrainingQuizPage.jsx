import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import {
  BookOpen,
  HelpCircle,
  Plus,
  Eye,
  Edit,
  Trash2,
  Award,
  ClipboardList,
  ShieldAlert,
  FlaskConical,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { hrApi } from "../../../utils/api";
import QuizWizardModal from "./hiring/QuizWizardModal";
import QuizViewModal from "./hiring/QuizViewModal";
import QuizTestModal from "./hiring/QuizTestModal";

export default function TrainingQuizPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [requisitions, setRequisitions] = useState([]);

  // Modals state
  const [wizardModalOpen, setWizardModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [saving, setSaving] = useState(false);

  const handleOpenTest = (quiz) => {
    if (!quiz?.id) return;
    window.open(`/quiz/test/${quiz.id}`, "_blank");
  };

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
        status: "approved,posted,published",
        per_page: 100,
      }).catch(() => ({ status: false }));
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

  // Handlers
  const handleOpenCreate = () => {
    setSelectedQuiz(null);
    setWizardModalOpen(true);
  };

  const handleOpenEdit = (quiz) => {
    setSelectedQuiz(quiz);
    setWizardModalOpen(true);
  };

  const handleOpenView = (quiz) => {
    setSelectedQuiz(quiz);
    setViewModalOpen(true);
  };

  const handleSaveQuiz = async (payload) => {
    setSaving(true);
    try {
      const res = selectedQuiz
        ? await hrApi.updateQuiz(selectedQuiz.id, payload, user.accessToken, user.tokenType)
        : await hrApi.storeQuiz(payload, user.accessToken, user.tokenType);

      if (res.status) {
        toast.success(selectedQuiz ? "Quiz updated successfully!" : "Quiz created successfully!");
        setWizardModalOpen(false);
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
    if (!window.confirm("Are you sure you want to delete this quiz? This action cannot be undone.")) {
      return;
    }
    try {
      const res = await hrApi.deleteQuiz(quizId, user.accessToken, user.tokenType);
      if (res.status) {
        toast.success("Quiz deleted successfully.");
        fetchData();
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
  const linkedRequisitions = quizzes.filter((q) => q.requisition_id).length;

  return (
    <div className="space-y-6">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Assessment & Training Quizzes</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Design and link assessment quizzes (MCQ & MSQ) to qualify candidates and employees.
          </p>
        </div>
        <div className="flex-shrink-0">
          <Button onClick={handleOpenCreate} icon={<Plus size={16} />} className="bg-brand-600 hover:bg-brand-700 text-white">
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
                  <th className="text-left px-5 py-3.5">Associated Job</th>
                  <th className="text-left px-5 py-3.5">Questions</th>
                  <th className="text-center px-5 py-3.5">Pass Score</th>
                  <th className="text-center px-5 py-3.5">Warnings</th>
                  <th className="text-left px-5 py-3.5">Created By</th>
                  <th className="text-right px-5 py-3.5">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {quizzes.map((quiz) => {
                  const qList = Array.isArray(quiz.questions) ? quiz.questions : [];
                  const mcqCount = qList.filter((item) => item.type !== "msq" && (!item.correct_indices || item.correct_indices.length <= 1)).length;
                  const msqCount = qList.length - mcqCount;
                  const totalMarks = qList.reduce((sum, item) => sum + (Number(item.marks) || 1), 0);

                  return (
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
                      <td className="px-5 py-4 text-gray-600 dark:text-gray-300 text-xs">
                        <span className="font-semibold text-gray-900 dark:text-white">{qList.length} Questions</span>
                        <span className="text-gray-400"> ({totalMarks} pts)</span>
                        {qList.length > 0 && (
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {mcqCount > 0 ? `${mcqCount} MCQ` : ""}
                            {mcqCount > 0 && msqCount > 0 ? ", " : ""}
                            {msqCount > 0 ? `${msqCount} MSQ` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <Badge variant="green">{quiz.passing_score || 60}%</Badge>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 border border-amber-200/60 dark:border-amber-900/40">
                          <ShieldAlert size={12} />
                          Max {quiz.max_violations ?? 3}
                        </span>
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
                            onClick={() => handleOpenTest(quiz)}
                            title="Test Quiz Simulator"
                            className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-lg text-xs font-semibold border border-purple-200 dark:border-purple-800 transition-all"
                          >
                            <FlaskConical size={13} /> Test
                          </button>
                          <button
                            onClick={() => handleOpenView(quiz)}
                            title="View Questions & Details"
                            className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-brand-600 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 transition-all"
                          >
                            <Eye size={13} /> View
                          </button>
                          <button
                            onClick={() => handleOpenEdit(quiz)}
                            title="Edit Quiz"
                            className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-300 hover:text-brand-600 rounded-lg text-xs font-semibold border border-gray-200 dark:border-gray-700 transition-all"
                          >
                            <Edit size={13} /> Edit
                          </button>
                          <button
                            onClick={() => handleDelete(quiz.id)}
                            title="Delete Quiz"
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-600 rounded-lg transition-all"
                          >
                            <Trash2 size={15} />
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

      {/* Quiz Wizard Modal */}
      <QuizWizardModal
        isOpen={wizardModalOpen}
        onClose={() => setWizardModalOpen(false)}
        onSave={handleSaveQuiz}
        editingQuiz={selectedQuiz}
        saving={saving}
        requisitions={requisitions}
      />

      {/* Quiz View Modal */}
      <QuizViewModal
        isOpen={viewModalOpen}
        onClose={() => {
          setViewModalOpen(false);
          setSelectedQuiz(null);
        }}
        quiz={selectedQuiz}
        onEdit={(q) => handleOpenEdit(q)}
        onTest={(q) => handleOpenTest(q)}
      />

      {/* Quiz Test Simulation Modal */}
      <QuizTestModal
        isOpen={testModalOpen}
        onClose={() => {
          setTestModalOpen(false);
          setSelectedQuiz(null);
        }}
        quiz={selectedQuiz}
      />
    </div>
  );
}
