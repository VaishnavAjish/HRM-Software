import { useState } from "react";
import { Award, Building2, Users, BarChart2, Layers, Briefcase, ClipboardList, ListTodo, FolderKanban, FileText, Plus, Search, Loader2, Pencil, Trash2, Eye, Filter, ChevronDown, ChevronUp, Archive, RotateCcw, CheckCircle, XCircle } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { createWorkforceListPage } from "./WorkforceListPage";
import { jobEvaluationApi } from "../../../features/workforce/services/workforceApi";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";
const selectClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const FACTORS = [
  { key: "responsibility", label: "Responsibility" },
  { key: "complexity", label: "Complexity" },
  { key: "skills", label: "Skills" },
  { key: "decision_making", label: "Decision Making" },
  { key: "leadership", label: "Leadership" },
  { key: "impact", label: "Impact" },
  { key: "experience", label: "Experience" },
  { key: "risk", label: "Risk" },
];

function JobEvaluationColumns() {
  return [
    { key: "reviewDate", label: "Review Date", render: (row) => row.reviewDate || "—" },
    { key: "status", label: "Status", render: (row) => <Badge status={row.status} /> },
    { key: "totalScore", label: "Total Score", render: (row) => row.totalScore !== null ? row.totalScore.toFixed(2) : "—" },
    { key: "evaluatorName", label: "Evaluator", render: (row) => row.evaluatorName || "—" },
    { key: "result", label: "Result", render: (row) => row.result || "—" },
    { key: "approvedByName", label: "Approved By", render: (row) => row.approvedByName || "—" },
    { key: "approvedAt", label: "Approved At", render: (row) => row.approvedAt ? new Date(row.approvedAt).toLocaleString() : "—" },
    { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
  ];
}

function JobEvaluationCreateForm({ onSubmit }) {
  const [form, setForm] = useState({
    evaluatorId: "",
    factorScores: {},
    result: "",
    notes: "",
    reviewDate: "",
    status: "draft",
    approvedBy: "",
    effectiveFrom: "",
    effectiveTo: "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleFactorChange = (factor) => (e) => setForm(prev => ({ ...prev, factorScores: { ...prev.factorScores, [factor]: Number(e.target.value) } }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Evaluator</span>
        <select className={selectClass} value={form.evaluatorId} onChange={handleSelectChange("evaluatorId")}>
          <option value="">Current User</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Review Date</span>
        <input type="date" className={inputClass} value={form.reviewDate} onChange={handleChange("reviewDate")} />
      </label>
      <label className="block">
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleSelectChange("status")}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Factor Scores (1-5)</span>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {FACTORS.map(factor => (
            <label key={factor.key} className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">{factor.label}</span>
              <input
                type="number"
                className={inputClass}
                value={form.factorScores[factor.key] || ""}
                onChange={handleFactorChange(factor.key)}
                min="1"
                max="5"
                step="1"
              />
            </label>
          ))}
        </div>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Result</span>
        <input type="text" className={inputClass} value={form.result} onChange={handleChange("result")} placeholder="e.g., Grade recommendation" />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Notes</span>
        <textarea className={inputClass} value={form.notes} onChange={handleChange("notes")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Approved By</span>
        <select className={selectClass} value={form.approvedBy} onChange={handleSelectChange("approvedBy")}>
          <option value="">None</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Effective From</span>
        <input type="date" className={inputClass} value={form.effectiveFrom} onChange={handleChange("effectiveFrom")} />
      </label>
      <label className="block">
        <span className={labelClass}>Effective To</span>
        <input type="date" className={inputClass} value={form.effectiveTo} onChange={handleChange("effectiveTo")} />
      </label>
    </form>
  );
}

function JobEvaluationEditForm({ item, onSubmit }) {
  const [form, setForm] = useState({
    evaluatorId: item.evaluatorId ?? "",
    factorScores: item.factorScores ?? {},
    result: item.result ?? "",
    notes: item.notes ?? "",
    reviewDate: item.reviewDate ?? "",
    status: item.status ?? "draft",
    approvedBy: item.approvedBy ?? "",
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleFactorChange = (factor) => (e) => setForm(prev => ({ ...prev, factorScores: { ...prev.factorScores, [factor]: Number(e.target.value) } }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Evaluator</span>
        <select className={selectClass} value={form.evaluatorId} onChange={handleSelectChange("evaluatorId")}>
          <option value="">Current User</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Review Date</span>
        <input type="date" className={inputClass} value={form.reviewDate} onChange={handleChange("reviewDate")} />
      </label>
      <label className="block">
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleSelectChange("status")}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Factor Scores (1-5)</span>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {FACTORS.map(factor => (
            <label key={factor.key} className="block">
              <span className="text-xs text-gray-500 dark:text-gray-400">{factor.label}</span>
              <input
                type="number"
                className={inputClass}
                value={form.factorScores[factor.key] || ""}
                onChange={handleFactorChange(factor.key)}
                min="1"
                max="5"
                step="1"
              />
            </label>
          ))}
        </div>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Result</span>
        <input type="text" className={inputClass} value={form.result} onChange={handleChange("result")} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Notes</span>
        <textarea className={inputClass} value={form.notes} onChange={handleChange("notes")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Approved By</span>
        <select className={selectClass} value={form.approvedBy} onChange={handleSelectChange("approvedBy")}>
          <option value="">None</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Effective From</span>
        <input type="date" className={inputClass} value={form.effectiveFrom} onChange={handleChange("effectiveFrom")} />
      </label>
      <label className="block">
        <span className={labelClass}>Effective To</span>
        <input type="date" className={inputClass} value={form.effectiveTo} onChange={handleChange("effectiveTo")} />
      </label>
    </form>
  );
}

function JobEvaluationViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Review Date</dt><dd>{item.reviewDate || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt><dd><Badge status={item.status} /></dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Total Score</dt><dd>{item.totalScore !== null ? item.totalScore.toFixed(2) : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Evaluator</dt><dd>{item.evaluatorName || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Factor Scores</dt><dd className="mt-1">
          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
            {FACTORS.map(factor => (
              <div key={factor.key} className="text-sm">
                <span className="text-gray-500 dark:text-gray-400">{factor.label}:</span>
                <span className="ml-2 font-mono">{item.factorScores?.[factor.key] !== undefined ? item.factorScores[factor.key] : "—"}</span>
              </div>
            ))}
          </div>
        </dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Result</dt><dd className="mt-1">{item.result || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Notes</dt><dd className="mt-1">{item.notes || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Approved By</dt><dd>{item.approvedByName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Approved At</dt><dd>{item.approvedAt ? new Date(item.approvedAt).toLocaleString() : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
      </dl>
    </div>
  );
}

export default function JobEvaluationsPage() {
  const { jobId } = useParams();
  const { can } = useAuthorization();
  const navigate = useNavigate();

  const ListPage = createWorkforceListPage({
    entityName: "Job Evaluation",
    entityNamePlural: "Job Evaluations",
    api: jobEvaluationApi,
    columns: JobEvaluationColumns(),
    permissions: {
      read: "workforce.job_evaluation.read",
      create: "workforce.job_evaluation.create",
      update: "workforce.job_evaluation.update",
      delete: "workforce.job_evaluation.delete",
    },
    customActions: [
      {
        key: "submit",
        icon: CheckCircle,
        title: "Submit for Approval",
        onClick: async (row) => {
          if (row.status !== "draft") return;
          try {
            await jobEvaluationApi.submit(jobId, row.id, (await import("../../../context/AuthContext")).useAuth.getState().user?.accessToken);
            toast.success("Evaluation submitted");
            navigate(0);
          } catch (err) {
            toast.error(err.message || "Could not submit");
          }
        },
        disabled: (row) => row.status !== "draft",
      },
      {
        key: "approve",
        icon: CheckCircle,
        title: "Approve",
        onClick: async (row) => {
          if (row.status !== "submitted") return;
          try {
            await jobEvaluationApi.approve(jobId, row.id, (await import("../../../context/AuthContext")).useAuth.getState().user?.accessToken);
            toast.success("Evaluation approved");
            navigate(0);
          } catch (err) {
            toast.error(err.message || "Could not approve");
          }
        },
        disabled: (row) => row.status !== "submitted",
      },
      {
        key: "reject",
        icon: XCircle,
        title: "Reject",
        onClick: async (row) => {
          if (row.status !== "submitted") return;
          try {
            await jobEvaluationApi.reject(jobId, row.id, (await import("../../../context/AuthContext")).useAuth.getState().user?.accessToken);
            toast.success("Evaluation rejected");
            navigate(0);
          } catch (err) {
            toast.error(err.message || "Could not reject");
          }
        },
        disabled: (row) => row.status !== "submitted",
      },
    ],
    createModal: {
      form: <JobEvaluationCreateForm />,
      onSubmit: (handler) => handler({ evaluatorId: form.evaluatorId ? Number(form.evaluatorId) : null, factorScores: form.factorScores, result: form.result || null, notes: form.notes || null, reviewDate: form.reviewDate || null, status: form.status, approvedBy: form.approvedBy ? Number(form.approvedBy) : null, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    editModal: {
      form: JobEvaluationEditForm,
      onSubmit: (item, handler) => handler({ evaluatorId: form.evaluatorId ? Number(form.evaluatorId) : null, factorScores: form.factorScores, result: form.result || null, notes: form.notes || null, reviewDate: form.reviewDate || null, status: form.status, approvedBy: form.approvedBy ? Number(form.approvedBy) : null, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    viewModal: {
      content: JobEvaluationViewContent,
    },
  });

  return ListPage;
}