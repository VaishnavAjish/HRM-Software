import WorkforceListPage from "./WorkforceListPage";
import { jobLevelApi } from "../../../features/workforce/services/workforceApi";
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

const CAREER_STAGE_OPTIONS = [
  { value: "entry", label: "Entry" },
  { value: "junior", label: "Junior" },
  { value: "mid", label: "Mid" },
  { value: "senior", label: "Senior" },
  { value: "lead", label: "Lead" },
  { value: "principal", label: "Principal" },
  { value: "executive", label: "Executive" },
];

const COLUMNS = [
  { key: "code", label: "Code" },
  { key: "name", label: "Name" },
  { key: "rank", label: "Rank", render: (row) => row.rank },
  { key: "careerStage", label: "Career Stage", render: (row) => row.careerStage ? <Badge>{row.careerStage}</Badge> : "—" },
  { key: "status", label: "Status", render: (row) => <Badge status={row.status} /> },
  { key: "gradeCount", label: "Grades", render: (row) => row.gradeCount ?? 0 },
  { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
];

const PERMISSIONS = {
  read: "workforce.job_level.read",
  create: "workforce.job_level.create",
  update: "workforce.job_level.update",
  delete: "workforce.job_level.delete",
};

function emptyJobLevelForm() {
  return {
    enterpriseId: "",
    companyId: "",
    code: "",
    name: "",
    rank: 0,
    description: "",
    careerStage: "",
    status: "active",
    effectiveFrom: "",
    effectiveTo: "",
  };
}

function toJobLevelForm(item) {
  return {
    enterpriseId: item.enterpriseId ?? "",
    companyId: item.companyId ?? "",
    code: item.code ?? "",
    name: item.name ?? "",
    rank: item.rank ?? 0,
    description: item.description ?? "",
    careerStage: item.careerStage ?? "",
    status: item.status ?? "active",
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  };
}

function toJobLevelPayload(form) {
  return {
    enterpriseId: Number(form.enterpriseId) || null,
    companyId: Number(form.companyId),
    code: form.code || undefined,
    name: form.name,
    rank: Number(form.rank),
    description: form.description || null,
    careerStage: form.careerStage || null,
    status: form.status,
    effectiveFrom: form.effectiveFrom || null,
    effectiveTo: form.effectiveTo || null,
  };
}

function JobLevelCreateForm({ value: form, onChange }) {
  const handleChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.value }));

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
        <span className={labelClass}>Code</span>
        <input type="text" className={inputClass} value={form.code} onChange={handleChange("code")} placeholder="Auto-generated if empty" />
      </label>
      <label className="block">
        <span className={labelClass}>Name *</span>
        <input type="text" className={inputClass} value={form.name} onChange={handleChange("name")} required />
      </label>
      <label className="block">
        <span className={labelClass}>Rank *</span>
        <input type="number" className={inputClass} value={form.rank} onChange={handleChange("rank")} min="0" required />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Description</span>
        <textarea className={inputClass} value={form.description} onChange={handleChange("description")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Career Stage</span>
        <select className={selectClass} value={form.careerStage} onChange={handleSelectChange("careerStage")}>
          <option value="">Select Career Stage</option>
          {CAREER_STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
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

function JobLevelEditForm({ value: form, onChange }) {
  const handleChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.value }));

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
        <span className={labelClass}>Code</span>
        <input type="text" className={inputClass} value={form.code} onChange={handleChange("code")} />
      </label>
      <label className="block">
        <span className={labelClass}>Name *</span>
        <input type="text" className={inputClass} value={form.name} onChange={handleChange("name")} required />
      </label>
      <label className="block">
        <span className={labelClass}>Rank *</span>
        <input type="number" className={inputClass} value={form.rank} onChange={handleChange("rank")} min="0" required />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Description</span>
        <textarea className={inputClass} value={form.description} onChange={handleChange("description")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Career Stage</span>
        <select className={selectClass} value={form.careerStage} onChange={handleSelectChange("careerStage")}>
          <option value="">Select Career Stage</option>
          {CAREER_STAGE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
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

function JobLevelViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Code</dt><dd className="font-mono text-sm">{item.code}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Name</dt><dd>{item.name}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Rank</dt><dd>{item.rank}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Career Stage</dt><dd>{item.careerStage ? <Badge>{item.careerStage}</Badge> : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Enterprise</dt><dd>{item.enterpriseName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Company</dt><dd>{item.companyName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt><dd><Badge status={item.status} /></dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Description</dt><dd className="mt-1">{item.description || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Grades</dt><dd>{item.gradeCount ?? 0}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
      </dl>
    </div>
  );
}

const CREATE_MODAL = {
  form: JobLevelCreateForm,
  initialValues: emptyJobLevelForm,
  toPayload: toJobLevelPayload,
};

const EDIT_MODAL = {
  form: JobLevelEditForm,
  initialValues: toJobLevelForm,
  toPayload: toJobLevelPayload,
};

const VIEW_MODAL = {
  content: JobLevelViewContent,
};

export default function JobLevelsPage() {
  return (
    <WorkforceListPage
      entityName="Job Level"
      entityNamePlural="Job Levels"
      api={jobLevelApi}
      columns={COLUMNS}
      permissions={PERMISSIONS}
      createModal={CREATE_MODAL}
      editModal={EDIT_MODAL}
      viewModal={VIEW_MODAL}
    />
  );
}
