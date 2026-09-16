import { useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Archive } from "lucide-react";
import WorkforceListPage from "./WorkforceListPage";
import { bindJobScopedApi, jobDescriptionApi } from "../../../features/workforce/services/workforceApi";
import { parseJsonText, toJsonText } from "../../../features/workforce/utils/jsonField";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import Badge from "../../../components/ui/Badge";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";
const selectClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const REMOTE_ELIGIBILITY_OPTIONS = [
  { value: "eligible", label: "Eligible" },
  { value: "not_eligible", label: "Not Eligible" },
  { value: "conditional", label: "Conditional" },
];

const TEXT_SECTIONS = [
  { key: "summary", label: "Summary", rows: 3 },
  { key: "purpose", label: "Purpose", rows: 3 },
  { key: "responsibilities", label: "Responsibilities", rows: 4 },
  { key: "qualifications", label: "Qualifications", rows: 3 },
  { key: "skills", label: "Skills", rows: 3 },
  { key: "competencies", label: "Competencies", rows: 3 },
  { key: "experience", label: "Experience", rows: 3 },
  { key: "education", label: "Education", rows: 3 },
  { key: "workConditions", label: "Work Conditions", rows: 3 },
  { key: "travelRequirements", label: "Travel Requirements", rows: 3 },
  { key: "risk", label: "Risk", rows: 3 },
];

const COLUMNS = [
  { key: "version", label: "Version", render: (row) => `v${row.version}` },
  { key: "status", label: "Status", render: (row) => <Badge status={row.status} /> },
  { key: "summary", label: "Summary", render: (row) => row.summary ? (row.summary.length > 60 ? row.summary.substring(0, 60) + "..." : row.summary) : "—" },
  { key: "createdByName", label: "Created By", render: (row) => row.createdByName || "—" },
  { key: "approvedByName", label: "Approved By", render: (row) => row.approvedByName || "—" },
  { key: "approvedAt", label: "Approved At", render: (row) => row.approvedAt ? new Date(row.approvedAt).toLocaleString() : "—" },
  { key: "effectiveFrom", label: "Effective From", render: (row) => row.effectiveFrom || "—" },
  { key: "effectiveTo", label: "Effective To", render: (row) => row.effectiveTo || "—" },
  { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
];

const PERMISSIONS = {
  read: "workforce.job_description.read",
  create: "workforce.job_description.create",
  update: "workforce.job_description.update",
  delete: "workforce.job_description.delete",
};

function emptyJobDescriptionForm() {
  return {
    summary: "",
    purpose: "",
    responsibilities: "",
    qualifications: "",
    skills: "",
    competencies: "",
    experience: "",
    education: "",
    workConditions: "",
    travelRequirements: "",
    risk: "",
    remoteEligible: false,
    remoteEligibilityType: "",
    remoteConditions: "",
    status: "draft",
    effectiveFrom: "",
    effectiveTo: "",
  };
}

function toJobDescriptionForm(item) {
  return {
    summary: item.summary ?? "",
    purpose: item.purpose ?? "",
    responsibilities: item.responsibilities ?? "",
    qualifications: item.qualifications ?? "",
    skills: item.skills ?? "",
    competencies: item.competencies ?? "",
    experience: item.experience ?? "",
    education: item.education ?? "",
    workConditions: item.workConditions ?? "",
    travelRequirements: item.travelRequirements ?? "",
    risk: item.risk ?? "",
    remoteEligible: item.remoteEligible ?? false,
    remoteEligibilityType: item.remoteEligibilityType ?? "",
    remoteConditions: toJsonText(item.remoteConditions),
    status: item.status ?? "draft",
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  };
}

function toJobDescriptionPayload(form) {
  return {
    summary: form.summary || null,
    purpose: form.purpose || null,
    responsibilities: form.responsibilities || null,
    qualifications: form.qualifications || null,
    skills: form.skills || null,
    competencies: form.competencies || null,
    experience: form.experience || null,
    education: form.education || null,
    workConditions: form.workConditions || null,
    travelRequirements: form.travelRequirements || null,
    risk: form.risk || null,
    remoteEligible: form.remoteEligible,
    remoteEligibilityType: form.remoteEligibilityType || null,
    remoteConditions: parseJsonText(form.remoteConditions),
    status: form.status,
    effectiveFrom: form.effectiveFrom || null,
    effectiveTo: form.effectiveTo || null,
  };
}

function JobDescriptionForm({ value: form, onChange }) {
  const handleChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.value }));
  const handleCheckboxChange = (field) => (e) => onChange(prev => ({ ...prev, [field]: e.target.checked }));

  return (
    <form onSubmit={(e) => e.preventDefault()} className="grid gap-4 sm:grid-cols-2">
      {TEXT_SECTIONS.map(section => (
        <label key={section.key} className="block sm:col-span-2">
          <span className={labelClass}>{section.label}</span>
          <textarea className={inputClass} value={form[section.key]} onChange={handleChange(section.key)} rows={section.rows} />
        </label>
      ))}
      <label className="block">
        <span className={labelClass}>Remote Eligible</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.remoteEligible} onChange={handleCheckboxChange("remoteEligible")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <span className="text-sm">Yes</span>
        </label>
      </label>
      <label className="block">
        <span className={labelClass}>Remote Eligibility Type</span>
        <select className={selectClass} value={form.remoteEligibilityType} onChange={handleChange("remoteEligibilityType")}>
          <option value="">Select Type</option>
          {REMOTE_ELIGIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Remote Conditions (JSON)</span>
        <textarea className={`${inputClass} font-mono text-xs`} value={form.remoteConditions} onChange={handleChange("remoteConditions")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleChange("status")}>
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

function JobDescriptionViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Version</dt><dd>v{item.version}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt><dd><Badge status={item.status} /></dd></div>
        {TEXT_SECTIONS.map(section => (
          <div key={section.key} className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">{section.label}</dt><dd className="mt-1">{item[section.key] || "—"}</dd></div>
        ))}
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Remote Eligible</dt><dd>{item.remoteEligible ? "Yes" : "No"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Remote Type</dt><dd>{item.remoteEligibilityType || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created By</dt><dd>{item.createdByName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Approved By</dt><dd>{item.approvedByName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Approved At</dt><dd>{item.approvedAt ? new Date(item.approvedAt).toLocaleString() : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
      </dl>
    </div>
  );
}

const CREATE_MODAL = {
  form: JobDescriptionForm,
  initialValues: emptyJobDescriptionForm,
  toPayload: toJobDescriptionPayload,
};

const EDIT_MODAL = {
  form: JobDescriptionForm,
  initialValues: toJobDescriptionForm,
  toPayload: toJobDescriptionPayload,
};

const VIEW_MODAL = {
  content: JobDescriptionViewContent,
};

export default function JobDescriptionsPage() {
  const { jobId } = useParams();
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";
  const { can } = useAuthorization();
  const navigate = useNavigate();
  const api = useMemo(() => bindJobScopedApi(jobDescriptionApi, jobId), [jobId]);

  const canUpdate = can("workforce.job_description.update");

  const customActions = [
    {
      key: "publish",
      icon: Archive,
      title: "Publish",
      onClick: async (row) => {
        if (row.status === "published") return;
        try {
          await jobDescriptionApi.publish(jobId, row.id, token, tokenType);
          toast.success("Description published");
          navigate(0);
        } catch (err) {
          toast.error(err.message || "Could not publish");
        }
      },
      disabled: (row) => !canUpdate || row.status === "published",
    },
    {
      key: "archive",
      icon: Archive,
      title: "Archive",
      onClick: async (row) => {
        if (row.status === "archived") return;
        try {
          await jobDescriptionApi.archive(jobId, row.id, token, tokenType);
          toast.success("Description archived");
          navigate(0);
        } catch (err) {
          toast.error(err.message || "Could not archive");
        }
      },
      disabled: (row) => !canUpdate || row.status === "archived",
    },
  ];

  return (
    <WorkforceListPage
      entityName="Job Description"
      entityNamePlural="Job Descriptions"
      api={api}
      columns={COLUMNS}
      permissions={PERMISSIONS}
      customActions={customActions}
      createModal={CREATE_MODAL}
      editModal={EDIT_MODAL}
      viewModal={VIEW_MODAL}
    />
  );
}
