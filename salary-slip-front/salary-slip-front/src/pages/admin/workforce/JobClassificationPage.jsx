import { useState } from "react";
import { Building2, Users, Award, BarChart2, Layers, Briefcase, ClipboardList, ListTodo, FolderKanban, FileText, Plus, Search, Loader2, Pencil, Trash2, Eye, Filter, ChevronDown, ChevronUp, Archive, RotateCcw } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { createWorkforceListPage } from "./WorkforceListPage";
import { jobClassificationApi } from "../../../features/workforce/services/workforceApi";
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

function JobClassificationColumns() {
  return [
    { key: "jobClass", label: "Job Class", render: (row) => row.jobClass || "—" },
    { key: "workerClass", label: "Worker Class", render: (row) => row.workerClass || "—" },
    { key: "employeeGroup", label: "Employee Group", render: (row) => row.employeeGroup || "—" },
    { key: "jobType", label: "Job Type", render: (row) => row.jobType || "—" },
    { key: "occupationalCategory", label: "Occupational Category", render: (row) => row.occupationalCategory || "—" },
    { key: "complianceClassification", label: "Compliance Classification", render: (row) => row.complianceClassification || "—" },
    { key: "effectiveFrom", label: "Effective From", render: (row) => row.effectiveFrom || "—" },
    { key: "effectiveTo", label: "Effective To", render: (row) => row.effectiveTo || "—" },
    { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
  ];
}

function JobClassificationCreateForm({ onSubmit }) {
  const [form, setForm] = useState({
    jobClass: "",
    workerClass: "",
    employeeGroup: "",
    jobType: "",
    occupationalCategory: "",
    complianceClassification: "",
    additionalClassifications: null,
    effectiveFrom: "",
    effectiveTo: "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Job Class</span>
        <input type="text" className={inputClass} value={form.jobClass} onChange={handleChange("jobClass")} placeholder="e.g., exempt, non_exempt" />
      </label>
      <label className="block">
        <span className={labelClass}>Worker Class</span>
        <input type="text" className={inputClass} value={form.workerClass} onChange={handleChange("workerClass")} placeholder="e.g., employee, contractor, consultant" />
      </label>
      <label className="block">
        <span className={labelClass}>Employee Group</span>
        <input type="text" className={inputClass} value={form.employeeGroup} onChange={handleChange("employeeGroup")} placeholder="e.g., permanent, temporary, fixed_term" />
      </label>
      <label className="block">
        <span className={labelClass}>Job Type</span>
        <input type="text" className={inputClass} value={form.jobType} onChange={handleChange("jobType")} placeholder="e.g., full_time, part_time, seasonal" />
      </label>
      <label className="block">
        <span className={labelClass}>Occupational Category</span>
        <input type="text" className={inputClass} value={form.occupationalCategory} onChange={handleChange("occupationalCategory")} placeholder="e.g., per O*NET, ISCO" />
      </label>
      <label className="block">
        <span className={labelClass}>Compliance Classification</span>
        <input type="text" className={inputClass} value={form.complianceClassification} onChange={handleChange("complianceClassification")} placeholder="e.g., FLSA, EEO, OFCCP" />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Additional Classifications (JSON)</span>
        <textarea className={inputClass} value={form.additionalClassifications ? JSON.stringify(form.additionalClassifications, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, additionalClassifications: JSON.parse(e.target.value) }); } catch { setForm(prev => ({ ...prev, additionalClassifications: null }); } }} rows={4} fontFamily="monospace" textXs />
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

function JobClassificationEditForm({ item, onSubmit }) {
  const [form, setForm] = useState({
    jobClass: item.jobClass ?? "",
    workerClass: item.workerClass ?? "",
    employeeGroup: item.employeeGroup ?? "",
    jobType: item.jobType ?? "",
    occupationalCategory: item.occupationalCategory ?? "",
    complianceClassification: item.complianceClassification ?? "",
    additionalClassifications: item.additionalClassifications ?? null,
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Job Class</span>
        <input type="text" className={inputClass} value={form.jobClass} onChange={handleChange("jobClass")} />
      </label>
      <label className="block">
        <span className={labelClass}>Worker Class</span>
        <input type="text" className={inputClass} value={form.workerClass} onChange={handleChange("workerClass")} />
      </label>
      <label className="block">
        <span className={labelClass}>Employee Group</span>
        <input type="text" className={inputClass} value={form.employeeGroup} onChange={handleChange("employeeGroup")} />
      </label>
      <label className="block">
        <span className={labelClass}>Job Type</span>
        <input type="text" className={inputClass} value={form.jobType} onChange={handleChange("jobType")} />
      </label>
      <label className="block">
        <span className={labelClass}>Occupational Category</span>
        <input type="text" className={inputClass} value={form.occupationalCategory} onChange={handleChange("occupationalCategory")} />
      </label>
      <label className="block">
        <span className={labelClass}>Compliance Classification</span>
        <input type="text" className={inputClass} value={form.complianceClassification} onChange={handleChange("complianceClassification")} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Additional Classifications (JSON)</span>
        <textarea className={inputClass} value={form.additionalClassifications ? JSON.stringify(form.additionalClassifications, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, additionalClassifications: JSON.parse(e.target.value) }); } catch { setForm(prev => ({ ...prev, additionalClassifications: null }); } }} rows={4} fontFamily="monospace" textXs />
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

function JobClassificationViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Job Class</dt><dd>{item.jobClass || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Worker Class</dt><dd>{item.workerClass || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Employee Group</dt><dd>{item.employeeGroup || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Job Type</dt><dd>{item.jobType || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Occupational Category</dt><dd>{item.occupationalCategory || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Compliance Classification</dt><dd>{item.complianceClassification || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Additional Classifications</dt><dd className="mt-1">{item.additionalClassifications ? <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">{JSON.stringify(item.additionalClassifications, null, 2)}</pre> : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
      </dl>
    </div>
  );
}

export default function JobClassificationPage() {
  const { jobId } = useParams();
  const { can } = useAuthorization();
  const navigate = useNavigate();

  const ListPage = createWorkforceListPage({
    entityName: "Job Classification",
    entityNamePlural: "Job Classification",
    api: jobClassificationApi,
    columns: JobClassificationColumns(),
    permissions: {
      read: "workforce.job_classification.read",
      create: "workforce.job_classification.create",
      update: "workforce.job_classification.update",
      delete: "workforce.job_classification.delete",
    },
    createModal: {
      form: <JobClassificationCreateForm />,
      onSubmit: (handler) => handler({ jobClass: form.jobClass || null, workerClass: form.workerClass || null, employeeGroup: form.employeeGroup || null, jobType: form.jobType || null, occupationalCategory: form.occupationalCategory || null, complianceClassification: form.complianceClassification || null, additionalClassifications: form.additionalClassifications, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    editModal: {
      form: JobClassificationEditForm,
      onSubmit: (item, handler) => handler({ jobClass: form.jobClass || null, workerClass: form.workerClass || null, employeeGroup: form.employeeGroup || null, jobType: form.jobType || null, occupationalCategory: form.occupationalCategory || null, complianceClassification: form.complianceClassification || null, additionalClassifications: form.additionalClassifications, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    viewModal: {
      content: JobClassificationViewContent,
    },
  });

  return ListPage;
}