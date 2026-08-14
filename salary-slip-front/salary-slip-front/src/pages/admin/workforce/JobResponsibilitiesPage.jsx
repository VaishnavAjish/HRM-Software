import { useState } from "react";
import { ListTodo, Building2, Users, Award, BarChart2, Layers, Briefcase, ClipboardList, FileText, FolderKanban, Plus, Search, Loader2, Pencil, Trash2, Eye, Filter, ChevronDown, ChevronUp, Archive, RotateCcw } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { createWorkforceListPage } from "./WorkforceListPage";
import { jobResponsibilityApi } from "../../../features/workforce/services/workforceApi";
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

function JobResponsibilityColumns() {
  return [
    { key: "priority", label: "Priority", render: (row) => row.priority },
    { key: "responsibility", label: "Responsibility", render: (row) => row.responsibility.length > 60 ? row.responsibility.substring(0, 60) + "..." : row.responsibility },
    { key: "percentage", label: "%", render: (row) => row.percentage ? `${row.percentage}%` : "—" },
    { key: "competencyId", label: "Competency", render: (row) => row.competencyId ? `ID: ${row.competencyId}` : "—" },
    { key: "kpiLinkage", label: "KPI", render: (row) => row.kpiLinkage || "—" },
    { key: "kraLinkage", label: "KRA", render: (row) => row.kraLinkage || "—" },
    { key: "effectiveFrom", label: "Effective From", render: (row) => row.effectiveFrom || "—" },
    { key: "effectiveTo", label: "Effective To", render: (row) => row.effectiveTo || "—" },
    { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
  ];
}

function JobResponsibilityCreateForm({ onSubmit }) {
  const [form, setForm] = useState({
    responsibility: "",
    priority: 0,
    percentage: "",
    competencyId: "",
    kpiLinkage: "",
    kraLinkage: "",
    effectiveFrom: "",
    effectiveTo: "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={labelClass}>Responsibility *</span>
        <textarea className={inputClass} value={form.responsibility} onChange={handleChange("responsibility")} rows={3} required />
      </label>
      <label className="block">
        <span className={labelClass}>Priority</span>
        <input type="number" className={inputClass} value={form.priority} onChange={handleChange("priority")} min="0" />
      </label>
      <label className="block">
        <span className={labelClass}>Percentage</span>
        <input type="number" className={inputClass} value={form.percentage} onChange={handleChange("percentage")} min="0" max="100" step="0.01" />
      </label>
      <label className="block">
        <span className={labelClass}>Competency ID</span>
        <input type="number" className={inputClass} value={form.competencyId} onChange={handleChange("competencyId")} min="0" />
      </label>
      <label className="block">
        <span className={labelClass}>KPI Linkage</span>
        <input type="text" className={inputClass} value={form.kpiLinkage} onChange={handleChange("kpiLinkage")} />
      </label>
      <label className="block">
        <span className={labelClass}>KRA Linkage</span>
        <input type="text" className={inputClass} value={form.kraLinkage} onChange={handleChange("kraLinkage")} />
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

function JobResponsibilityEditForm({ item, onSubmit }) {
  const [form, setForm] = useState({
    responsibility: item.responsibility ?? "",
    priority: item.priority ?? 0,
    percentage: item.percentage ?? "",
    competencyId: item.competencyId ?? "",
    kpiLinkage: item.kpiLinkage ?? "",
    kraLinkage: item.kraLinkage ?? "",
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={labelClass}>Responsibility *</span>
        <textarea className={inputClass} value={form.responsibility} onChange={handleChange("responsibility")} rows={3} required />
      </label>
      <label className="block">
        <span className={labelClass}>Priority</span>
        <input type="number" className={inputClass} value={form.priority} onChange={handleChange("priority")} min="0" />
      </label>
      <label className="block">
        <span className={labelClass}>Percentage</span>
        <input type="number" className={inputClass} value={form.percentage} onChange={handleChange("percentage")} min="0" max="100" step="0.01" />
      </label>
      <label className="block">
        <span className={labelClass}>Competency ID</span>
        <input type="number" className={inputClass} value={form.competencyId} onChange={handleChange("competencyId")} min="0" />
      </label>
      <label className="block">
        <span className={labelClass}>KPI Linkage</span>
        <input type="text" className={inputClass} value={form.kpiLinkage} onChange={handleChange("kpiLinkage")} />
      </label>
      <label className="block">
        <span className={labelClass}>KRA Linkage</span>
        <input type="text" className={inputClass} value={form.kraLinkage} onChange={handleChange("kraLinkage")} />
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

function JobResponsibilityViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Priority</dt><dd>{item.priority}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Responsibility</dt><dd className="mt-1">{item.responsibility}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Percentage</dt><dd>{item.percentage ? `${item.percentage}%` : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Competency ID</dt><dd>{item.competencyId || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">KPI Linkage</dt><dd>{item.kpiLinkage || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">KRA Linkage</dt><dd>{item.kraLinkage || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
      </dl>
    </div>
  );
}

export default function JobResponsibilitiesPage() {
  const { jobId } = useParams();
  const { can } = useAuthorization();
  const navigate = useNavigate();

  const ListPage = createWorkforceListPage({
    entityName: "Job Responsibility",
    entityNamePlural: "Job Responsibilities",
    api: jobResponsibilityApi,
    columns: JobResponsibilityColumns(),
    permissions: {
      read: "workforce.job_responsibility.read",
      create: "workforce.job_responsibility.create",
      update: "workforce.job_responsibility.update",
      delete: "workforce.job_responsibility.delete",
    },
    createModal: {
      form: <JobResponsibilityCreateForm />,
      onSubmit: (handler) => handler({ responsibility: form.responsibility, priority: Number(form.priority), percentage: form.percentage ? Number(form.percentage) : null, competencyId: form.competencyId ? Number(form.competencyId) : null, kpiLinkage: form.kpiLinkage || null, kraLinkage: form.kraLinkage || null, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    editModal: {
      form: JobResponsibilityEditForm,
      onSubmit: (item, handler) => handler({ responsibility: form.responsibility, priority: Number(form.priority), percentage: form.percentage ? Number(form.percentage) : null, competencyId: form.competencyId ? Number(form.competencyId) : null, kpiLinkage: form.kpiLinkage || null, kraLinkage: form.kraLinkage || null, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    viewModal: {
      content: JobResponsibilityViewContent,
    },
  });

  return <ListPage />;
}