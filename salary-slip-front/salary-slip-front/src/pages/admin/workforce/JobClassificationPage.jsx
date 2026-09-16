import { useMemo } from "react";
import { useParams } from "react-router-dom";
import WorkforceListPage from "./WorkforceListPage";
import { bindJobClassificationApi } from "../../../features/workforce/services/workforceApi";
import { parseJsonText, toJsonText } from "../../../features/workforce/utils/jsonField";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const COLUMNS = [
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

const PERMISSIONS = {
  read: "workforce.job_classification.read",
  create: "workforce.job_classification.create",
  update: "workforce.job_classification.update",
  delete: "workforce.job_classification.delete",
};

function emptyJobClassificationForm() {
  return {
    jobClass: "",
    workerClass: "",
    employeeGroup: "",
    jobType: "",
    occupationalCategory: "",
    complianceClassification: "",
    additionalClassifications: "",
    effectiveFrom: "",
    effectiveTo: "",
  };
}

function toJobClassificationForm(item) {
  return {
    jobClass: item.jobClass ?? "",
    workerClass: item.workerClass ?? "",
    employeeGroup: item.employeeGroup ?? "",
    jobType: item.jobType ?? "",
    occupationalCategory: item.occupationalCategory ?? "",
    complianceClassification: item.complianceClassification ?? "",
    additionalClassifications: toJsonText(item.additionalClassifications),
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  };
}

function toJobClassificationPayload(form) {
  return {
    jobClass: form.jobClass || null,
    workerClass: form.workerClass || null,
    employeeGroup: form.employeeGroup || null,
    jobType: form.jobType || null,
    occupationalCategory: form.occupationalCategory || null,
    complianceClassification: form.complianceClassification || null,
    additionalClassifications: parseJsonText(form.additionalClassifications),
    effectiveFrom: form.effectiveFrom || null,
    effectiveTo: form.effectiveTo || null,
  };
}

function JobClassificationCreateForm({ value: form, onChange }) {
  const handleChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={(e) => e.preventDefault()} className="grid gap-4 sm:grid-cols-2">
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
        <textarea className={`${inputClass} font-mono text-xs`} value={form.additionalClassifications} onChange={handleChange("additionalClassifications")} rows={4} />
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

function JobClassificationEditForm({ value: form, onChange }) {
  const handleChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.value }));

  return (
    <form onSubmit={(e) => e.preventDefault()} className="grid gap-4 sm:grid-cols-2">
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
        <textarea className={`${inputClass} font-mono text-xs`} value={form.additionalClassifications} onChange={handleChange("additionalClassifications")} rows={4} />
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

const CREATE_MODAL = {
  form: JobClassificationCreateForm,
  initialValues: emptyJobClassificationForm,
  toPayload: toJobClassificationPayload,
};

const EDIT_MODAL = {
  form: JobClassificationEditForm,
  initialValues: toJobClassificationForm,
  toPayload: toJobClassificationPayload,
};

const VIEW_MODAL = {
  content: JobClassificationViewContent,
};

export default function JobClassificationPage() {
  const { jobId } = useParams();
  const api = useMemo(() => bindJobClassificationApi(jobId), [jobId]);

  return (
    <WorkforceListPage
      entityName="Job Classification"
      entityNamePlural="Job Classification"
      api={api}
      columns={COLUMNS}
      permissions={PERMISSIONS}
      createModal={CREATE_MODAL}
      editModal={EDIT_MODAL}
      viewModal={VIEW_MODAL}
    />
  );
}
