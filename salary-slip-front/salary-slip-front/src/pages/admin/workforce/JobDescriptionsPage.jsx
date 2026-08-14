import { useState } from "react";
import { ClipboardList, Building2, Users, Award, BarChart2, Layers, Briefcase, FileText, ListTodo, FolderKanban, Plus, Search, Loader2, Pencil, Trash2, Eye, Filter, ChevronDown, ChevronUp, Archive, RotateCcw } from "lucide-react";
import { useParams, useNavigate } from "react-router-dom";
import { createWorkforceListPage } from "./WorkforceListPage";
import { jobDescriptionApi } from "../../../features/workforce/services/workforceApi";
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
  { value: "draft", label: "Draft" },
  { value: "published", label: "Published" },
  { value: "archived", label: "Archived" },
];

const REMOTE_ELIGIBILITY_OPTIONS = [
  { value: "eligible", label: "Eligible" },
  { value: "not_eligible", label: "Not Eligible" },
  { value: "conditional", label: "Conditional" },
];

function JobDescriptionColumns() {
  return [
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
}

function JobDescriptionCreateForm({ onSubmit }) {
  const [form, setForm] = useState({
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
    remoteConditions: null,
    status: "draft",
    effectiveFrom: "",
    effectiveTo: "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleCheckboxChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.checked }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={labelClass}>Summary</span>
        <textarea className={inputClass} value={form.summary} onChange={handleChange("summary")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Purpose</span>
        <textarea className={inputClass} value={form.purpose} onChange={handleChange("purpose")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Responsibilities</span>
        <textarea className={inputClass} value={form.responsibilities} onChange={handleChange("responsibilities")} rows={4} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Qualifications</span>
        <textarea className={inputClass} value={form.qualifications} onChange={handleChange("qualifications")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Skills</span>
        <textarea className={inputClass} value={form.skills} onChange={handleChange("skills")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Competencies</span>
        <textarea className={inputClass} value={form.competencies} onChange={handleChange("competencies")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Experience</span>
        <textarea className={inputClass} value={form.experience} onChange={handleChange("experience")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Education</span>
        <textarea className={inputClass} value={form.education} onChange={handleChange("education")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Work Conditions</span>
        <textarea className={inputClass} value={form.workConditions} onChange={handleChange("workConditions")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Travel Requirements</span>
        <textarea className={inputClass} value={form.travelRequirements} onChange={handleChange("travelRequirements")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Risk</span>
        <textarea className={inputClass} value={form.risk} onChange={handleChange("risk")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Remote Eligible</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.remoteEligible} onChange={handleCheckboxChange("remoteEligible")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <span className="text-sm">Yes</span>
        </label>
      </label>
      <label className="block">
        <span className={labelClass}>Remote Eligibility Type</span>
        <select className={selectClass} value={form.remoteEligibilityType} onChange={handleSelectChange("remoteEligibilityType")}>
          <option value="">Select Type</option>
          {REMOTE_ELIGIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Remote Conditions (JSON)</span>
        <textarea className={inputClass} value={form.remoteConditions ? JSON.stringify(form.remoteConditions, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, remoteConditions: JSON.parse(e.target.value) }); } catch { setForm(prev => ({ ...prev, remoteConditions: null }); } }} rows={3} fontFamily="monospace" textXs />
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

function JobDescriptionEditForm({ item, onSubmit }) {
  const [form, setForm] = useState({
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
    remoteConditions: item.remoteConditions ?? null,
    status: item.status ?? "draft",
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleCheckboxChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.checked }));

  return (
    <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={labelClass}>Summary</span>
        <textarea className={inputClass} value={form.summary} onChange={handleChange("summary")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Purpose</span>
        <textarea className={inputClass} value={form.purpose} onChange={handleChange("purpose")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Responsibilities</span>
        <textarea className={inputClass} value={form.responsibilities} onChange={handleChange("responsibilities")} rows={4} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Qualifications</span>
        <textarea className={inputClass} value={form.qualifications} onChange={handleChange("qualifications")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Skills</span>
        <textarea className={inputClass} value={form.skills} onChange={handleChange("skills")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Competencies</span>
        <textarea className={inputClass} value={form.competencies} onChange={handleChange("competencies")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Experience</span>
        <textarea className={inputClass} value={form.experience} onChange={handleChange("experience")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Education</span>
        <textarea className={inputClass} value={form.education} onChange={handleChange("education")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Work Conditions</span>
        <textarea className={inputClass} value={form.workConditions} onChange={handleChange("workConditions")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Travel Requirements</span>
        <textarea className={inputClass} value={form.travelRequirements} onChange={handleChange("travelRequirements")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Risk</span>
        <textarea className={inputClass} value={form.risk} onChange={handleChange("risk")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Remote Eligible</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.remoteEligible} onChange={handleCheckboxChange("remoteEligible")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          <span className="text-sm">Yes</span>
        </label>
      </label>
      <label className="block">
        <span className={labelClass}>Remote Eligibility Type</span>
        <select className={selectClass} value={form.remoteEligibilityType} onChange={handleSelectChange("remoteEligibilityType")}>
          <option value="">Select Type</option>
          {REMOTE_ELIGIBILITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Remote Conditions (JSON)</span>
        <textarea className={inputClass} value={form.remoteConditions ? JSON.stringify(form.remoteConditions, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, remoteConditions: JSON.parse(e.target.value) }); } catch { setForm(prev => ({ ...prev, remoteConditions: null }); } }} rows={3} fontFamily="monospace" textXs />
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

function JobDescriptionViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Version</dt><dd>v{item.version}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt><dd><Badge status={item.status} /></dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Summary</dt><dd className="mt-1">{item.summary || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Purpose</dt><dd className="mt-1">{item.purpose || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Responsibilities</dt><dd className="mt-1">{item.responsibilities || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Qualifications</dt><dd className="mt-1">{item.qualifications || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Skills</dt><dd className="mt-1">{item.skills || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Competencies</dt><dd className="mt-1">{item.competencies || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Experience</dt><dd className="mt-1">{item.experience || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Education</dt><dd className="mt-1">{item.education || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Work Conditions</dt><dd className="mt-1">{item.workConditions || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Travel Requirements</dt><dd className="mt-1">{item.travelRequirements || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Risk</dt><dd className="mt-1">{item.risk || "—"}</dd></div>
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

export default function JobDescriptionsPage() {
  const { jobId } = useParams();
  const { can } = useAuthorization();
  const navigate = useNavigate();

  const ListPage = createWorkforceListPage({
    entityName: "Job Description",
    entityNamePlural: "Job Descriptions",
    api: jobDescriptionApi,
    columns: JobDescriptionColumns(),
    permissions: {
      read: "workforce.job_description.read",
      create: "workforce.job_description.create",
      update: "workforce.job_description.update",
      delete: "workforce.job_description.delete",
    },
    customActions: [
      {
        key: "publish",
        icon: Archive,
        title: "Publish",
        onClick: async (row) => {
          if (row.status === "published") return;
          try {
            await jobDescriptionApi.publish(jobId, row.id, (await import("../../../context/AuthContext")).useAuth.getState().user?.accessToken);
            toast.success("Description published");
            navigate(0);
          } catch (err) {
            toast.error(err.message || "Could not publish");
          }
        },
        disabled: (row) => row.status === "published",
      },
      {
        key: "archive",
        icon: Archive,
        title: "Archive",
        onClick: async (row) => {
          if (row.status === "archived") return;
          try {
            await jobDescriptionApi.archive(jobId, row.id, (await import("../../../context/AuthContext")).useAuth.getState().user?.accessToken);
            toast.success("Description archived");
            navigate(0);
          } catch (err) {
            toast.error(err.message || "Could not archive");
          }
        },
        disabled: (row) => row.status === "archived",
      },
    ],
    createModal: {
      form: <JobDescriptionCreateForm />,
      onSubmit: (handler) => handler({ summary: form.summary || null, purpose: form.purpose || null, responsibilities: form.responsibilities || null, qualifications: form.qualifications || null, skills: form.skills || null, competencies: form.competencies || null, experience: form.experience || null, education: form.education || null, workConditions: form.workConditions || null, travelRequirements: form.travelRequirements || null, risk: form.risk || null, remoteEligible: form.remoteEligible, remoteEligibilityType: form.remoteEligibilityType || null, remoteConditions: form.remoteConditions, status: form.status, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    editModal: {
      form: JobDescriptionEditForm,
      onSubmit: (item, handler) => handler({ summary: form.summary || null, purpose: form.purpose || null, responsibilities: form.responsibilities || null, qualifications: form.qualifications || null, skills: form.skills || null, competencies: form.competencies || null, experience: form.experience || null, education: form.education || null, workConditions: form.workConditions || null, travelRequirements: form.travelRequirements || null, risk: form.risk || null, remoteEligible: form.remoteEligible, remoteEligibilityType: form.remoteEligibilityType || null, remoteConditions: form.remoteConditions, status: form.status, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    viewModal: {
      content: JobDescriptionViewContent,
    },
  });

  return <ListPage />;
}