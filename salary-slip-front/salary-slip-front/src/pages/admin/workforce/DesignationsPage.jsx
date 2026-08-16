import { useEffect, useState } from "react";
import { createWorkforceListPage } from "./WorkforceListPage";
import { designationApi } from "../../../features/workforce/services/workforceApi";
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

function DesignationColumns() {
  return [
    { key: "code", label: "Code" },
    { key: "title", label: "Title" },
    { key: "jobFamilyName", label: "Family", render: (row) => row.jobFamilyName || "—" },
    { key: "jobFunctionName", label: "Function", render: (row) => row.jobFunctionName || "—" },
    { key: "jobLevelName", label: "Level", render: (row) => row.jobLevelName || "—" },
    { key: "jobGradeName", label: "Grade", render: (row) => row.jobGradeName || "—" },
    { key: "status", label: "Status", render: (row) => <Badge status={row.status} /> },
    { key: "jobCount", label: "Jobs", render: (row) => row.jobCount ?? 0 },
    { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
  ];
}

function DesignationCreateForm({ onChange }) {
  const [form, setForm] = useState({
    enterpriseId: "",
    companyId: "",
    jobFamilyId: "",
    jobFunctionId: "",
    jobLevelId: "",
    jobGradeId: "",
    code: "",
    title: "",
    description: "",
    status: "active",
    effectiveFrom: "",
    effectiveTo: "",
  });

  // Save happens from the modal's own footer button (WorkforceListPage), not
  // from a submit button inside this form, so the current values are pushed
  // up to the page-level state on every change rather than read via a submit
  // event.
  useEffect(() => { onChange(form); }, [form, onChange]);

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={(e) => e.preventDefault()} className="grid gap-4 sm:grid-cols-2">
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
        <span className={labelClass}>Job Family</span>
        <select className={selectClass} value={form.jobFamilyId} onChange={handleSelectChange("jobFamilyId")}>
          <option value="">Select Job Family</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Job Function</span>
        <select className={selectClass} value={form.jobFunctionId} onChange={handleSelectChange("jobFunctionId")}>
          <option value="">Select Job Function</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Job Level</span>
        <select className={selectClass} value={form.jobLevelId} onChange={handleSelectChange("jobLevelId")}>
          <option value="">Select Job Level</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Job Grade</span>
        <select className={selectClass} value={form.jobGradeId} onChange={handleSelectChange("jobGradeId")}>
          <option value="">Select Job Grade</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Code</span>
        <input type="text" className={inputClass} value={form.code} onChange={handleChange("code")} placeholder="Auto-generated if empty" />
      </label>
      <label className="block">
        <span className={labelClass}>Title *</span>
        <input type="text" className={inputClass} value={form.title} onChange={handleChange("title")} required />
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

function DesignationEditForm({ item, onChange }) {
  const [form, setForm] = useState({
    enterpriseId: item.enterpriseId ?? "",
    companyId: item.companyId ?? "",
    jobFamilyId: item.jobFamilyId ?? "",
    jobFunctionId: item.jobFunctionId ?? "",
    jobLevelId: item.jobLevelId ?? "",
    jobGradeId: item.jobGradeId ?? "",
    code: item.code ?? "",
    title: item.title ?? "",
    description: item.description ?? "",
    status: item.status ?? "active",
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  });

  useEffect(() => { onChange(form); }, [form, onChange]);

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={(e) => e.preventDefault()} className="grid gap-4 sm:grid-cols-2">
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
        <span className={labelClass}>Job Family</span>
        <select className={selectClass} value={form.jobFamilyId} onChange={handleSelectChange("jobFamilyId")}>
          <option value="">Select Job Family</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Job Function</span>
        <select className={selectClass} value={form.jobFunctionId} onChange={handleSelectChange("jobFunctionId")}>
          <option value="">Select Job Function</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Job Level</span>
        <select className={selectClass} value={form.jobLevelId} onChange={handleSelectChange("jobLevelId")}>
          <option value="">Select Job Level</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Job Grade</span>
        <select className={selectClass} value={form.jobGradeId} onChange={handleSelectChange("jobGradeId")}>
          <option value="">Select Job Grade</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Code</span>
        <input type="text" className={inputClass} value={form.code} onChange={handleChange("code")} />
      </label>
      <label className="block">
        <span className={labelClass}>Title *</span>
        <input type="text" className={inputClass} value={form.title} onChange={handleChange("title")} required />
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

function DesignationViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Code</dt><dd className="font-mono text-sm">{item.code}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Title</dt><dd>{item.title}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Family</dt><dd>{item.jobFamilyName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Function</dt><dd>{item.jobFunctionName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Level</dt><dd>{item.jobLevelName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Grade</dt><dd>{item.jobGradeName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Enterprise</dt><dd>{item.enterpriseName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Company</dt><dd>{item.companyName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt><dd><Badge status={item.status} /></dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Description</dt><dd className="mt-1">{item.description || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Jobs</dt><dd>{item.jobCount ?? 0}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
      </dl>
    </div>
  );
}

function toDesignationPayload(form) {
  return {
    enterpriseId: Number(form.enterpriseId) || null,
    companyId: Number(form.companyId) || null,
    jobFamilyId: Number(form.jobFamilyId) || null,
    jobFunctionId: Number(form.jobFunctionId) || null,
    jobLevelId: Number(form.jobLevelId) || null,
    jobGradeId: Number(form.jobGradeId) || null,
    code: form.code || undefined,
    title: form.title,
    description: form.description || null,
    status: form.status,
    effectiveFrom: form.effectiveFrom || null,
    effectiveTo: form.effectiveTo || null,
  };
}

export default function DesignationsPage() {
  // The create/edit forms own their own field state (for responsive typing)
  // and mirror it up here on every change, since the modal's Save button
  // lives in WorkforceListPage and calls onSubmit(handler) / onSubmit(item,
  // handler) directly rather than triggering this form's submit event.
  const [createForm, setCreateForm] = useState(null);
  const [editForm, setEditForm] = useState(null);

  const ListPage = createWorkforceListPage({
    entityName: "Designation",
    entityNamePlural: "Designations",
    api: designationApi,
    columns: DesignationColumns(),
    permissions: {
      read: "workforce.designation.read",
      create: "workforce.designation.create",
      update: "workforce.designation.update",
      delete: "workforce.designation.delete",
    },
    createModal: {
      form: <DesignationCreateForm onChange={setCreateForm} />,
      onSubmit: (handler) => createForm && handler(toDesignationPayload(createForm)),
    },
    editModal: {
      form: (item) => <DesignationEditForm item={item} onChange={setEditForm} />,
      onSubmit: (item, handler) => handler(toDesignationPayload(editForm || item)),
    },
    viewModal: {
      content: DesignationViewContent,
    },
  });

  return ListPage;
}