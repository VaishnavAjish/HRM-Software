import { useState } from "react";
import { Building2, Users, FileText, Award, BarChart2, Layers, Briefcase, ClipboardList, ListTodo, FolderKanban, FolderKanban as FolderIcon } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { createWorkforceListPage } from "./WorkforceListPage";
import { jobFunctionApi } from "../../../features/workforce/services/workforceApi";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { workforceApi } from "../../../features/workforce/services/workforceApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";
const selectClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

function JobFunctionColumns() {
  return [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description", render: (row) => row.description ? (row.description.length > 50 ? row.description.substring(0, 50) + "..." : row.description) : "—" },
    { key: "status", label: "Status", render: (row) => <Badge status={row.status} /> },
    { key: "familyCount", label: "Families", render: (row) => row.familyCount ?? 0 },
    { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
  ];
}

function JobFunctionCreateForm({ onSubmit }) {
  const [form, setForm] = useState({
    enterpriseId: "",
    companyId: "",
    code: "",
    name: "",
    description: "",
    status: "active",
    sortOrder: 0,
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
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleSelectChange("status")}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Sort Order</span>
        <input type="number" className={inputClass} value={form.sortOrder} onChange={handleChange("sortOrder")} min="0" />
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

function JobFunctionEditForm({ item, onSubmit }) {
  const [form, setForm] = useState({
    enterpriseId: item.enterpriseId ?? "",
    companyId: item.companyId ?? "",
    code: item.code ?? "",
    name: item.name ?? "",
    description: item.description ?? "",
    status: item.status ?? "active",
    sortOrder: item.sortOrder ?? 0,
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
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleSelectChange("status")}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Sort Order</span>
        <input type="number" className={inputClass} value={form.sortOrder} onChange={handleChange("sortOrder")} min="0" />
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

function JobFunctionViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Code</dt><dd className="font-mono text-sm">{item.code}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Name</dt><dd>{item.name}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Enterprise</dt><dd>{item.enterpriseName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Company</dt><dd>{item.companyName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt><dd><Badge status={item.status} /></dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Sort Order</dt><dd>{item.sortOrder}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Description</dt><dd className="mt-1">{item.description || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Families</dt><dd>{item.familyCount ?? 0}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
      </dl>
    </div>
  );
}

export default function JobFunctionsPage() {
  const { can } = useAuthorization();
  const navigate = useNavigate();

  const ListPage = createWorkforceListPage({
    entityName: "Job Function",
    entityNamePlural: "Job Functions",
    api: jobFunctionApi,
    columns: JobFunctionColumns(),
    permissions: {
      read: "workforce.job_function.read",
      create: "workforce.job_function.create",
      update: "workforce.job_function.update",
      delete: "workforce.job_function.delete",
    },
    createModal: {
      form: <JobFunctionCreateForm />,
      onSubmit: (handler) => handler({ enterpriseId: Number(form.enterpriseId) || null, companyId: Number(form.companyId), code: form.code || undefined, name: form.name, description: form.description || null, status: form.status, sortOrder: Number(form.sortOrder), effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    editModal: {
      form: JobFunctionEditForm,
      onSubmit: (item, handler) => handler({ enterpriseId: Number(form.enterpriseId) || null, companyId: Number(form.companyId), code: form.code || undefined, name: form.name, description: form.description || null, status: form.status, sortOrder: Number(form.sortOrder), effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    viewModal: {
      content: JobFunctionViewContent,
    },
  });

  return <ListPage />;
}