import { useState } from "react";
import { FolderKanban, Building2, Users, Award, BarChart2, Layers, Briefcase, ClipboardList, ListTodo, FileText, Plus, Search, Loader2, Pencil, Trash2, Eye, Filter, ChevronDown, ChevronUp, Archive, RotateCcw } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { createWorkforceListPage } from "./WorkforceListPage";
import { jobRequirementApi } from "../../../features/workforce/services/workforceApi";
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

const TYPE_OPTIONS = [
  { value: "education", label: "Education" },
  { value: "experience", label: "Experience" },
  { value: "skill", label: "Skill" },
  { value: "certification", label: "Certification" },
  { value: "competency", label: "Competency" },
  { value: "language", label: "Language" },
  { value: "travel", label: "Travel" },
  { value: "security_clearance", label: "Security Clearance" },
];

const CATEGORY_OPTIONS = [
  { value: "mandatory", label: "Mandatory" },
  { value: "preferred", label: "Preferred" },
  { value: "minimum", label: "Minimum" },
  { value: "maximum", label: "Maximum" },
];

function JobRequirementColumns() {
  return [
    { key: "type", label: "Type", render: (row) => <Badge>{row.type}</Badge> },
    { key: "category", label: "Category", render: (row) => <Badge variant="secondary">{row.category}</Badge> },
    { key: "requirement", label: "Requirement", render: (row) => row.requirement.length > 60 ? row.requirement.substring(0, 60) + "..." : row.requirement },
    { key: "details", label: "Details", render: (row) => row.details ? <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded max-h-20 overflow-auto">{JSON.stringify(row.details, null, 2)}</pre> : "—" },
    { key: "effectiveFrom", label: "Effective From", render: (row) => row.effectiveFrom || "—" },
    { key: "effectiveTo", label: "Effective To", render: (row) => row.effectiveTo || "—" },
    { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
  ];
}

function JobRequirementCreateForm({ onSubmit }) {
  const [form, setForm] = useState({
    type: "education",
    requirement: "",
    category: "mandatory",
    details: null,
    effectiveFrom: "",
    effectiveTo: "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Type *</span>
        <select className={selectClass} value={form.type} onChange={handleSelectChange("type")} required>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Category</span>
        <select className={selectClass} value={form.category} onChange={handleSelectChange("category")}>
          {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Requirement *</span>
        <textarea className={inputClass} value={form.requirement} onChange={handleChange("requirement")} rows={3} required />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Details (JSON)</span>
        <textarea className={inputClass} value={form.details ? JSON.stringify(form.details, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, details: JSON.parse(e.target.value) }); } catch { setForm(prev => ({ ...prev, details: null }); } }} rows={4} fontFamily="monospace" textXs />
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

function JobRequirementEditForm({ item, onSubmit }) {
  const [form, setForm] = useState({
    type: item.type ?? "education",
    requirement: item.requirement ?? "",
    category: item.category ?? "mandatory",
    details: item.details ?? null,
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Type *</span>
        <select className={selectClass} value={form.type} onChange={handleSelectChange("type")} required>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Category</span>
        <select className={selectClass} value={form.category} onChange={handleSelectChange("category")}>
          {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Requirement *</span>
        <textarea className={inputClass} value={form.requirement} onChange={handleChange("requirement")} rows={3} required />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Details (JSON)</span>
        <textarea className={inputClass} value={form.details ? JSON.stringify(form.details, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, details: JSON.parse(e.target.value) }); } catch { setForm(prev => ({ ...prev, details: null }); } }} rows={4} fontFamily="monospace" textXs />
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

function JobRequirementViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Type</dt><dd><Badge>{item.type}</Badge></dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Category</dt><dd><Badge variant="secondary">{item.category}</Badge></dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Requirement</dt><dd className="mt-1">{item.requirement}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Details</dt><dd className="mt-1">{item.details ? <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded">{JSON.stringify(item.details, null, 2)}</pre> : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
      </dl>
    </div>
  );
}

export default function JobRequirementsPage() {
  const { jobId } = useParams();
  const { can } = useAuthorization();
  const navigate = useNavigate();

  const ListPage = createWorkforceListPage({
    entityName: "Job Requirement",
    entityNamePlural: "Job Requirements",
    api: jobRequirementApi,
    columns: JobRequirementColumns(),
    permissions: {
      read: "workforce.job_requirement.read",
      create: "workforce.job_requirement.create",
      update: "workforce.job_requirement.update",
      delete: "workforce.job_requirement.delete",
    },
    createModal: {
      form: <JobRequirementCreateForm />,
      onSubmit: (handler) => handler({ type: form.type, requirement: form.requirement, category: form.category, details: form.details, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    editModal: {
      form: JobRequirementEditForm,
      onSubmit: (item, handler) => handler({ type: form.type, requirement: form.requirement, category: form.category, details: form.details, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    viewModal: {
      content: JobRequirementViewContent,
    },
  });

  return ListPage;
}