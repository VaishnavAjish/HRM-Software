import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { BarChart2, Building2, Users, FileText, Award, Layers, Briefcase, ClipboardList, ListTodo, FolderKanban } from "lucide-react";
import { createWorkforceListPage } from "./WorkforceListPage";
import { jobGradeApi } from "../../../features/workforce/services/workforceApi";
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
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function JobGradeColumns() {
  return [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "jobLevelName", label: "Level", render: (row) => row.jobLevelName || "—" },
    { key: "currency", label: "Currency", render: (row) => row.currency },
    { key: "minSalary", label: "Min Salary", render: (row) => row.minSalary ? `��${row.minSalary.toLocaleString()}` : "—" },
    { key: "midSalary", label: "Mid Salary", render: (row) => row.midSalary ? `��${row.midSalary.toLocaleString()}` : "—" },
    { key: "maxSalary", label: "Max Salary", render: (row) => row.maxSalary ? `��${row.maxSalary.toLocaleString()}` : "—" },
    { key: "status", label: "Status", render: (row) => <Badge status={row.status} /> },
    { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
  ];
}

function JobGradeCreateForm({ onSubmit }) {
  const [form, setForm] = useState({
    enterpriseId: "",
    companyId: "",
    jobLevelId: "",
    code: "",
    name: "",
    description: "",
    currency: "INR",
    minSalary: "",
    midSalary: "",
    maxSalary: "",
    eligibilityRules: null,
    status: "active",
    effectiveFrom: "",
    effectiveTo: "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Enterprise</span>
        <select className={selectClass} value={form.enterpriseId} onChange={handleSelectChange("enterpriseId")}>
          <option value="">Select Enterprise</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Company *</span>
        <select className={selectClass} value={form.companyId} onChange={handleSelectChange("companyId")} required>
          <option value="">Select Company</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Job Level</span>
        <select className={selectClass} value={form.jobLevelId} onChange={handleSelectChange("jobLevelId")}>
          <option value="">Select Job Level</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Code</span>
        <input type="text" className={inputClass} value={form.code} onChange={handleChange("code")} placeholder="Auto-generated if empty" />
      </label>
      <label className="block">
        <span className={labelClass}>Name *</span>
        <input type="text" className={inputClass} value={form.name} onChange={handleChange("name")} required />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Description</span>
        <textarea className={inputClass} value={form.description} onChange={handleChange("description")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Currency</span>
        <input type="text" className={inputClass} value={form.currency} onChange={handleChange("currency")} maxLength={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Min Salary</span>
        <input type="number" className={inputClass} value={form.minSalary} onChange={handleChange("minSalary")} step="0.01" min="0" />
      </label>
      <label className="block">
        <span className={labelClass}>Mid Salary</span>
        <input type="number" className={inputClass} value={form.midSalary} onChange={handleChange("midSalary")} step="0.01" min="0" />
      </label>
      <label className="block">
        <span className={labelClass}>Max Salary</span>
        <input type="number" className={inputClass} value={form.maxSalary} onChange={handleChange("maxSalary")} step="0.01" min="0" />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Eligibility Rules (JSON)</span>
        <textarea className={`${inputClass} font-mono text-xs`} value={form.eligibilityRules ? JSON.stringify(form.eligibilityRules, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, eligibilityRules: JSON.parse(e.target.value) })); } catch { setForm(prev => ({ ...prev, eligibilityRules: null })); } }} rows={4} />
      </label>
      <label className="block">
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleSelectChange("status")}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

function JobGradeEditForm({ item, onSubmit }) {
  const [form, setForm] = useState({
    enterpriseId: item.enterpriseId ?? "",
    companyId: item.companyId ?? "",
    jobLevelId: item.jobLevelId ?? "",
    code: item.code ?? "",
    name: item.name ?? "",
    description: item.description ?? "",
    currency: item.currency ?? "INR",
    minSalary: item.minSalary ?? "",
    midSalary: item.midSalary ?? "",
    maxSalary: item.maxSalary ?? "",
    eligibilityRules: item.eligibilityRules ?? null,
    status: item.status ?? "active",
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Enterprise</span>
        <select className={selectClass} value={form.enterpriseId} onChange={handleSelectChange("enterpriseId")}>
          <option value="">Select Enterprise</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Company *</span>
        <select className={selectClass} value={form.companyId} onChange={handleSelectChange("companyId")} required>
          <option value="">Select Company</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Job Level</span>
        <select className={selectClass} value={form.jobLevelId} onChange={handleSelectChange("jobLevelId")}>
          <option value="">Select Job Level</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Code</span>
        <input type="text" className={inputClass} value={form.code} onChange={handleChange("code")} />
      </label>
      <label className="block">
        <span className={labelClass}>Name *</span>
        <input type="text" className={inputClass} value={form.name} onChange={handleChange("name")} required />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Description</span>
        <textarea className={inputClass} value={form.description} onChange={handleChange("description")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Currency</span>
        <input type="text" className={inputClass} value={form.currency} onChange={handleChange("currency")} maxLength={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Min Salary</span>
        <input type="number" className={inputClass} value={form.minSalary} onChange={handleChange("minSalary")} step="0.01" min="0" />
      </label>
      <label className="block">
        <span className={labelClass}>Mid Salary</span>
        <input type="number" className={inputClass} value={form.midSalary} onChange={handleChange("midSalary")} step="0.01" min="0" />
      </label>
      <label className="block">
        <span className={labelClass}>Max Salary</span>
        <input type="number" className={inputClass} value={form.maxSalary} onChange={handleChange("maxSalary")} step="0.01" min="0" />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Eligibility Rules (JSON)</span>
        <textarea className={`${inputClass} font-mono text-xs`} value={form.eligibilityRules ? JSON.stringify(form.eligibilityRules, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, eligibilityRules: JSON.parse(e.target.value) })); } catch { setForm(prev => ({ ...prev, eligibilityRules: null })); } }} rows={4} />
      </label>
      <label className="block">
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleSelectChange("status")}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
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

function JobGradeViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Code</dt><dd className="font-mono text-sm">{item.code}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Name</dt><dd>{item.name}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Level</dt><dd>{item.jobLevelName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Currency</dt><dd>{item.currency}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Min Salary</dt><dd>{item.minSalary ? `��${item.minSalary.toLocaleString()}` : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Mid Salary</dt><dd>{item.midSalary ? `��${item.midSalary.toLocaleString()}` : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Max Salary</dt><dd>{item.maxSalary ? `��${item.maxSalary.toLocaleString()}` : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Enterprise</dt><dd>{item.enterpriseName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Company</dt><dd>{item.companyName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt><dd><Badge status={item.status} /></dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Description</dt><dd className="mt-1">{item.description || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Eligibility Rules</dt><dd className="mt-1 font-mono text-xs">{item.eligibilityRules ? JSON.stringify(item.eligibilityRules, null, 2) : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
      </dl>
    </div>
  );
}

export default function JobGradesPage() {
  const { can } = useAuthorization();
  const navigate = useNavigate();

  const ListPage = createWorkforceListPage({
    entityName: "Job Grade",
    entityNamePlural: "Job Grades",
    api: jobGradeApi,
    columns: JobGradeColumns(),
    permissions: {
      read: "workforce.job_grade.read",
      create: "workforce.job_grade.create",
      update: "workforce.job_grade.update",
      delete: "workforce.job_grade.delete",
    },
    createModal: {
      form: <JobGradeCreateForm />,
      onSubmit: (handler) => handler({ enterpriseId: Number(form.enterpriseId) || null, companyId: Number(form.companyId), jobLevelId: Number(form.jobLevelId) || null, code: form.code || undefined, name: form.name, description: form.description || null, currency: form.currency, minSalary: form.minSalary ? Number(form.minSalary) : null, midSalary: form.midSalary ? Number(form.midSalary) : null, maxSalary: form.maxSalary ? Number(form.maxSalary) : null, eligibilityRules: form.eligibilityRules, status: form.status, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    editModal: {
      form: JobGradeEditForm,
      onSubmit: (item, handler) => handler({ enterpriseId: Number(form.enterpriseId) || null, companyId: Number(form.companyId), jobLevelId: Number(form.jobLevelId) || null, code: form.code || undefined, name: form.name, description: form.description || null, currency: form.currency, minSalary: form.minSalary ? Number(form.minSalary) : null, midSalary: form.midSalary ? Number(form.midSalary) : null, maxSalary: form.maxSalary ? Number(form.maxSalary) : null, eligibilityRules: form.eligibilityRules, status: form.status, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    viewModal: {
      content: JobGradeViewContent,
    },
  });

  return ListPage;
}