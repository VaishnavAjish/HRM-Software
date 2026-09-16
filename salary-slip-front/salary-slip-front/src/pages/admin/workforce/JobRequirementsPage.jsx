import { useMemo } from "react";
import { useParams } from "react-router-dom";
import WorkforceListPage from "./WorkforceListPage";
import { bindJobScopedApi, jobRequirementApi } from "../../../features/workforce/services/workforceApi";
import { parseJsonText, toJsonText } from "../../../features/workforce/utils/jsonField";
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

const COLUMNS = [
  { key: "type", label: "Type", render: (row) => <Badge>{row.type}</Badge> },
  { key: "category", label: "Category", render: (row) => <Badge variant="secondary">{row.category}</Badge> },
  { key: "requirement", label: "Requirement", render: (row) => row.requirement.length > 60 ? row.requirement.substring(0, 60) + "..." : row.requirement },
  { key: "details", label: "Details", render: (row) => row.details ? <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-2 rounded max-h-20 overflow-auto">{JSON.stringify(row.details, null, 2)}</pre> : "—" },
  { key: "effectiveFrom", label: "Effective From", render: (row) => row.effectiveFrom || "—" },
  { key: "effectiveTo", label: "Effective To", render: (row) => row.effectiveTo || "—" },
  { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
];

const PERMISSIONS = {
  read: "workforce.job_requirement.read",
  create: "workforce.job_requirement.create",
  update: "workforce.job_requirement.update",
  delete: "workforce.job_requirement.delete",
};

function emptyJobRequirementForm() {
  return {
    type: "education",
    requirement: "",
    category: "mandatory",
    details: "",
    effectiveFrom: "",
    effectiveTo: "",
  };
}

function toJobRequirementForm(item) {
  return {
    type: item.type ?? "education",
    requirement: item.requirement ?? "",
    category: item.category ?? "mandatory",
    details: toJsonText(item.details),
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  };
}

function toJobRequirementPayload(form) {
  return {
    type: form.type,
    requirement: form.requirement,
    category: form.category,
    details: parseJsonText(form.details),
    effectiveFrom: form.effectiveFrom || null,
    effectiveTo: form.effectiveTo || null,
  };
}

function JobRequirementForm({ value: form, onChange }) {
  const handleChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={(e) => e.preventDefault()} className="grid gap-4 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>Type *</span>
        <select className={selectClass} value={form.type} onChange={handleChange("type")} required>
          {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Category</span>
        <select className={selectClass} value={form.category} onChange={handleChange("category")}>
          {CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Requirement *</span>
        <textarea className={inputClass} value={form.requirement} onChange={handleChange("requirement")} rows={3} required />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Details (JSON)</span>
        <textarea className={`${inputClass} font-mono text-xs`} value={form.details} onChange={handleChange("details")} rows={4} />
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

const CREATE_MODAL = {
  form: JobRequirementForm,
  initialValues: emptyJobRequirementForm,
  toPayload: toJobRequirementPayload,
};

const EDIT_MODAL = {
  form: JobRequirementForm,
  initialValues: toJobRequirementForm,
  toPayload: toJobRequirementPayload,
};

const VIEW_MODAL = {
  content: JobRequirementViewContent,
};

export default function JobRequirementsPage() {
  const { jobId } = useParams();
  const api = useMemo(() => bindJobScopedApi(jobRequirementApi, jobId), [jobId]);

  return (
    <WorkforceListPage
      entityName="Job Requirement"
      entityNamePlural="Job Requirements"
      api={api}
      columns={COLUMNS}
      permissions={PERMISSIONS}
      createModal={CREATE_MODAL}
      editModal={EDIT_MODAL}
      viewModal={VIEW_MODAL}
    />
  );
}
