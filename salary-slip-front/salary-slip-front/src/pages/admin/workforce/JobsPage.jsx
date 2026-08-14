import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Building2, Users, Award, BarChart2, Layers, Briefcase, ClipboardList, ListTodo, FolderKanban, Plus, Search, Loader2, Pencil, Trash2, Eye, Filter, ChevronDown, ChevronUp, Copy, Archive, RotateCcw } from "lucide-react";
import { createWorkforceListPage } from "./WorkforceListPage";
import { jobApi } from "../../../features/workforce/services/workforceApi";
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
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "archived", label: "Archived" },
];

const EMPLOYMENT_TYPE_OPTIONS = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "contract", label: "Contract" },
  { value: "intern", label: "Intern" },
  { value: "temporary", label: "Temporary" },
  { value: "fixed_term", label: "Fixed Term" },
];

const REMOTE_ELIGIBILITY_OPTIONS = [
  { value: "eligible", label: "Eligible" },
  { value: "not_eligible", label: "Not Eligible" },
  { value: "conditional", label: "Conditional" },
];

function JobColumns() {
  return [
    { key: "code", label: "Code" },
    { key: "formalTitle", label: "Formal Title" },
    { key: "displayTitle", label: "Display Title", render: (row) => row.displayTitle || "—" },
    { key: "jobFamilyName", label: "Family", render: (row) => row.jobFamilyName || "—" },
    { key: "jobFunctionName", label: "Function", render: (row) => row.jobFunctionName || "—" },
    { key: "jobLevelName", label: "Level", render: (row) => row.jobLevelName || "—" },
    { key: "jobGradeName", label: "Grade", render: (row) => row.jobGradeName || "—" },
    { key: "status", label: "Status", render: (row) => <Badge status={row.status} /> },
    { key: "positionCount", label: "Positions", render: (row) => row.positionCount ?? 0 },
    { key: "createdAt", label: "Created", render: (row) => row.createdAt ? new Date(row.createdAt).toLocaleDateString() : "—" },
  ];
}

function JobCreateForm({ onSubmit }) {
  const [form, setForm] = useState({
    enterpriseId: "",
    companyId: "",
    jobFamilyId: "",
    jobFunctionId: "",
    jobCategoryId: "",
    jobLevelId: "",
    jobGradeId: "",
    designationId: "",
    code: "",
    formalTitle: "",
    displayTitle: "",
    internalTitle: "",
    externalTitle: "",
    localizedTitles: null,
    summary: "",
    purpose: "",
    status: "draft",
    employmentType: "",
    isRemoteEligible: false,
    remoteEligibilityType: "",
    remoteConditions: null,
    effectiveFrom: "",
    effectiveTo: "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleCheckboxChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.checked }));

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
        <span className={labelClass}>Job Category</span>
        <select className={selectClass} value={form.jobCategoryId} onChange={handleSelectChange("jobCategoryId")}>
          <option value="">Select Job Category</option>
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
        <span className={labelClass}>Designation</span>
        <select className={selectClass} value={form.designationId} onChange={handleSelectChange("designationId")}>
          <option value="">Select Designation</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Code</span>
        <input type="text" className={inputClass} value={form.code} onChange={handleChange("code")} placeholder="Auto-generated if empty" />
      </label>
      <label className="block">
        <span className={labelClass}>Formal Title *</span>
        <input type="text" className={inputClass} value={form.formalTitle} onChange={handleChange("formalTitle")} required />
      </label>
      <label className="block">
        <span className={labelClass}>Display Title</span>
        <input type="text" className={inputClass} value={form.displayTitle} onChange={handleChange("displayTitle")} />
      </label>
      <label className="block">
        <span className={labelClass}>Internal Title</span>
        <input type="text" className={inputClass} value={form.internalTitle} onChange={handleChange("internalTitle")} />
      </label>
      <label className="block">
        <span className={labelClass}>External Title</span>
        <input type="text" className={inputClass} value={form.externalTitle} onChange={handleChange("externalTitle")} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Localized Titles (JSON)</span>
        <textarea className={`${inputClass} font-mono text-xs`} value={form.localizedTitles ? JSON.stringify(form.localizedTitles, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, localizedTitles: JSON.parse(e.target.value) })); } catch { setForm(prev => ({ ...prev, localizedTitles: null })); } }} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Summary</span>
        <textarea className={inputClass} value={form.summary} onChange={handleChange("summary")} rows={3} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Purpose</span>
        <textarea className={inputClass} value={form.purpose} onChange={handleChange("purpose")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleSelectChange("status")}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Employment Type</span>
        <select className={selectClass} value={form.employmentType} onChange={handleSelectChange("employmentType")}>
          <option value="">Select Employment Type</option>
          {EMPLOYMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Remote Eligible</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.isRemoteEligible} onChange={handleCheckboxChange("isRemoteEligible")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
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
        <textarea className={`${inputClass} font-mono text-xs`} value={form.remoteConditions ? JSON.stringify(form.remoteConditions, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, remoteConditions: JSON.parse(e.target.value) })); } catch { setForm(prev => ({ ...prev, remoteConditions: null })); } }} rows={3} />
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

function JobEditForm({ item, onSubmit }) {
  const [form, setForm] = useState({
    enterpriseId: item.enterpriseId ?? "",
    companyId: item.companyId ?? "",
    jobFamilyId: item.jobFamilyId ?? "",
    jobFunctionId: item.jobFunctionId ?? "",
    jobCategoryId: item.jobCategoryId ?? "",
    jobLevelId: item.jobLevelId ?? "",
    jobGradeId: item.jobGradeId ?? "",
    designationId: item.designationId ?? "",
    code: item.code ?? "",
    formalTitle: item.formalTitle ?? "",
    displayTitle: item.displayTitle ?? "",
    internalTitle: item.internalTitle ?? "",
    externalTitle: item.externalTitle ?? "",
    localizedTitles: item.localizedTitles ?? null,
    summary: item.summary ?? "",
    purpose: item.purpose ?? "",
    status: item.status ?? "draft",
    employmentType: item.employmentType ?? "",
    isRemoteEligible: item.isRemoteEligible ?? false,
    remoteEligibilityType: item.remoteEligibilityType ?? "",
    remoteConditions: item.remoteConditions ?? null,
    effectiveFrom: item.effectiveFrom ?? "",
    effectiveTo: item.effectiveTo ?? "",
  });

  const handleChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleSelectChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));
  const handleCheckboxChange = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.checked }));

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
        <span className={labelClass}>Job Category</span>
        <select className={selectClass} value={form.jobCategoryId} onChange={handleSelectChange("jobCategoryId")}>
          <option value="">Select Job Category</option>
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
        <span className={labelClass}>Designation</span>
        <select className={selectClass} value={form.designationId} onChange={handleSelectChange("designationId")}>
          <option value="">Select Designation</option>
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Code</span>
        <input type="text" className={inputClass} value={form.code} onChange={handleChange("code")} />
      </label>
      <label className="block">
        <span className={labelClass}>Formal Title *</span>
        <input type="text" className={inputClass} value={form.formalTitle} onChange={handleChange("formalTitle")} required />
      </label>
      <label className="block">
        <span className={labelClass}>Display Title</span>
        <input type="text" className={inputClass} value={form.displayTitle} onChange={handleChange("displayTitle")} />
      </label>
      <label className="block">
        <span className={labelClass}>Internal Title</span>
        <input type="text" className={inputClass} value={form.internalTitle} onChange={handleChange("internalTitle")} />
      </label>
      <label className="block">
        <span className={labelClass}>External Title</span>
        <input type="text" className={inputClass} value={form.externalTitle} onChange={handleChange("externalTitle")} />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Localized Titles (JSON)</span>
        <span className={labelClass}>Purpose</span>
        <textarea className={inputClass} value={form.purpose} onChange={handleChange("purpose")} rows={3} />
      </label>
      <label className="block">
        <span className={labelClass}>Status</span>
        <select className={selectClass} value={form.status} onChange={handleSelectChange("status")}>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Employment Type</span>
        <select className={selectClass} value={form.employmentType} onChange={handleSelectChange("employmentType")}>
          <option value="">Select Employment Type</option>
          {EMPLOYMENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>
      <label className="block">
        <span className={labelClass}>Remote Eligible</span>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={form.isRemoteEligible} onChange={handleCheckboxChange("isRemoteEligible")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
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
        <textarea className={`${inputClass} font-mono text-xs`} value={form.remoteConditions ? JSON.stringify(form.remoteConditions, null, 2) : ""} onChange={(e) => { try { setForm(prev => ({ ...prev, remoteConditions: JSON.parse(e.target.value) })); } catch { setForm(prev => ({ ...prev, remoteConditions: null })); } }} rows={3} />
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

function JobViewContent({ item }) {
  return (
    <div className="space-y-4">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Code</dt><dd className="font-mono text-sm">{item.code}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Formal Title</dt><dd>{item.formalTitle}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Display Title</dt><dd>{item.displayTitle || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Family</dt><dd>{item.jobFamilyName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Function</dt><dd>{item.jobFunctionName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Category</dt><dd>{item.jobCategoryName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Level</dt><dd>{item.jobLevelName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Grade</dt><dd>{item.jobGradeName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Designation</dt><dd>{item.designationTitle || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Enterprise</dt><dd>{item.enterpriseName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Company</dt><dd>{item.companyName || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Status</dt><dd><Badge status={item.status} /></dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Employment Type</dt><dd>{item.employmentType || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Remote Eligible</dt><dd>{item.isRemoteEligible ? "Yes" : "No"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Summary</dt><dd className="mt-1">{item.summary || "—"}</dd></div>
        <div className="sm:col-span-2"><dt className="text-sm text-gray-500 dark:text-gray-400">Purpose</dt><dd className="mt-1">{item.purpose || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Positions</dt><dd>{item.positionCount ?? 0}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Created</dt><dd>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective From</dt><dd>{item.effectiveFrom || "—"}</dd></div>
        <div><dt className="text-sm text-gray-500 dark:text-gray-400">Effective To</dt><dd>{item.effectiveTo || "—"}</dd></div>
      </dl>
    </div>
  );
}

export default function JobsPage() {
  const { can } = useAuthorization();
  const navigate = useNavigate();

  const ListPage = createWorkforceListPage({
    entityName: "Job",
    entityNamePlural: "Jobs",
    api: jobApi,
    columns: JobColumns(),
    permissions: {
      read: "workforce.job.read",
      create: "workforce.job.create",
      update: "workforce.job.update",
      delete: "workforce.job.delete",
    },
    customActions: [
      {
        key: "descriptions",
        icon: ClipboardList,
        title: "Descriptions",
        onClick: (row) => navigate(`/admin/workforce/jobs/${row.id}/descriptions`),
      },
      {
        key: "responsibilities",
        icon: ListTodo,
        title: "Responsibilities",
        onClick: (row) => navigate(`/admin/workforce/jobs/${row.id}/responsibilities`),
      },
      {
        key: "requirements",
        icon: FolderKanban,
        title: "Requirements",
        onClick: (row) => navigate(`/admin/workforce/jobs/${row.id}/requirements`),
      },
      {
        key: "evaluations",
        icon: Award,
        title: "Evaluations",
        onClick: (row) => navigate(`/admin/workforce/jobs/${row.id}/evaluations`),
      },
      {
        key: "classification",
        icon: Building2,
        title: "Classification",
        onClick: (row) => navigate(`/admin/workforce/jobs/${row.id}/classification`),
      },
      {
        key: "clone",
        icon: Copy,
        title: "Clone",
        onClick: (row) => navigate(`/admin/workforce/jobs/${row.id}/clone`),
      },
    ],
    createModal: {
      form: <JobCreateForm />,
      onSubmit: (handler) => handler({ enterpriseId: Number(form.enterpriseId) || null, companyId: Number(form.companyId), jobFamilyId: Number(form.jobFamilyId) || null, jobFunctionId: Number(form.jobFunctionId) || null, jobCategoryId: Number(form.jobCategoryId) || null, jobLevelId: Number(form.jobLevelId) || null, jobGradeId: Number(form.jobGradeId) || null, designationId: Number(form.designationId) || null, code: form.code || undefined, formalTitle: form.formalTitle, displayTitle: form.displayTitle || null, internalTitle: form.internalTitle || null, externalTitle: form.externalTitle || null, localizedTitles: form.localizedTitles, summary: form.summary || null, purpose: form.purpose || null, status: form.status, employmentType: form.employmentType || null, isRemoteEligible: form.isRemoteEligible, remoteEligibilityType: form.remoteEligibilityType || null, remoteConditions: form.remoteConditions, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    editModal: {
      form: JobEditForm,
      onSubmit: (item, handler) => handler({ enterpriseId: Number(form.enterpriseId) || null, companyId: Number(form.companyId), jobFamilyId: Number(form.jobFamilyId) || null, jobFunctionId: Number(form.jobFunctionId) || null, jobCategoryId: Number(form.jobCategoryId) || null, jobLevelId: Number(form.jobLevelId) || null, jobGradeId: Number(form.jobGradeId) || null, designationId: Number(form.designationId) || null, code: form.code || undefined, formalTitle: form.formalTitle, displayTitle: form.displayTitle || null, internalTitle: form.internalTitle || null, externalTitle: form.externalTitle || null, localizedTitles: form.localizedTitles, summary: form.summary || null, purpose: form.purpose || null, status: form.status, employmentType: form.employmentType || null, isRemoteEligible: form.isRemoteEligible, remoteEligibilityType: form.remoteEligibilityType || null, remoteConditions: form.remoteConditions, effectiveFrom: form.effectiveFrom || null, effectiveTo: form.effectiveTo || null }),
    },
    viewModal: {
      content: JobViewContent,
    },
  });

  return <ListPage />;
}