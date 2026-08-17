/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plus, Send, Pencil, Trash2, Copy, Archive, Eye,
  Columns3, ChevronDown, ClipboardCopy, RotateCcw, Link2, Check,
} from "lucide-react";
import Button from "../../../../components/ui/Button";
import Badge from "../../../../components/ui/Badge";
import Modal from "../../../../components/ui/Modal";
import Pagination from "../../../../components/ui/Pagination";
import { SkeletonTable } from "../../../../components/ui/Skeleton";
import RichTextEditor from "../../../../components/ui/RichTextEditor";
import DatePicker from "../../../../components/ui/DatePicker";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { hrApi, rbacApi } from "../../../../utils/api";
import { downloadExcel, downloadCSV } from "../../../../utils/exportUtils";
import useHrFilters from "./useHrFilters";
import HiringFilterBar from "./HiringFilterBar";
import { runBulk } from "./bulkActions";
import RequisitionDrawer from "./RequisitionDrawer";

import { useAuthorization } from "../../../../hooks/useAuthorization";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "rejected", label: "Rejected" },
  { value: "approved", label: "Approved" },
  { value: "posted", label: "Posted" },
  { value: "on_hold", label: "On Hold" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];
const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
];
const EMPLOYMENT_TYPE_LABEL = {
  full_time: "Full Time", part_time: "Part Time", contract: "Contract", intern: "Intern",
};
const PRIORITY_LABEL = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// Description/Requirements come from RichTextEditor as HTML now, but older
// requisitions saved before that change hold plain text — detect which and
// only escape+linebreak the plain case, so old data still renders sanely
// instead of showing literal tags or one unbroken paragraph.
function richFieldToHtml(value) {
  const v = (value || "").trim();
  if (!v) return "";
  if (/<[a-z][\s\S]*>/i.test(v)) return v;
  return v.split(/\n+/).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

/** Plain-text rendering of the JD, for the "Copy" button — job boards and
 *  email don't render the preview's HTML, so what gets copied should be
 *  readable as plain text, bullets and all. */
function htmlToPlainText(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  div.querySelectorAll("li").forEach((li) => { li.textContent = `- ${li.textContent}`; });
  div.querySelectorAll("h1, h2, p, li, br").forEach((el) => el.after("\n"));
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

// Pure client-side formatting from whatever's on the form right now — no
// backend call, nothing persisted. Just a proper-looking JD a recruiter can
// keep editing here and copy out for posting elsewhere. Description/
// Requirements arrive already formatted (bold/bullets) from RichTextEditor;
// this just wraps them with real headings instead of plain text lines.
function buildJdTemplate(f, applyLink) {
  const metaBits = [
    f.designation || null,
    EMPLOYMENT_TYPE_LABEL[f.employment_type] || null,
    f.openings ? `${f.openings} opening${Number(f.openings) === 1 ? "" : "s"}` : null,
  ].filter(Boolean);

  const salaryLine = f.salary_min || f.salary_max
    ? `₹${Number(f.salary_min || 0).toLocaleString("en-IN")} – ₹${Number(f.salary_max || 0).toLocaleString("en-IN")} per annum`
    : "Not disclosed";

  return `
    <h1>${escapeHtml(f.title || "Untitled Role")}</h1>
    ${metaBits.length ? `<p class="jd-meta">${escapeHtml(metaBits.join(" · "))}</p>` : ""}

    <h2>About the Role</h2>
    ${richFieldToHtml(f.description) || "<p>—</p>"}

    <h2>Key Requirements</h2>
    ${richFieldToHtml(f.requirements) || "<p>—</p>"}
    ${(f.min_experience || f.max_experience)
      ? `<p><strong>Experience:</strong> ${escapeHtml(f.min_experience || "0")}–${escapeHtml(f.max_experience || f.min_experience || "0")} years</p>`
      : ""}

    <h2>Compensation &amp; Logistics</h2>
    <ul>
      <li><strong>Salary:</strong> ${salaryLine}</li>
      <li><strong>Employment Type:</strong> ${escapeHtml(EMPLOYMENT_TYPE_LABEL[f.employment_type] || "—")}</li>
      ${f.target_closing_date ? `<li><strong>Target Closing Date:</strong> ${escapeHtml(f.target_closing_date)}</li>` : ""}
      <li><strong>Priority:</strong> ${escapeHtml(PRIORITY_LABEL[f.priority] || "—")}</li>
    </ul>

    ${applyLink ? `
    <h2>How to Apply</h2>
    <p>Interested candidates can apply here: <a href="${escapeHtml(applyLink)}" target="_blank" rel="noopener noreferrer">${escapeHtml(applyLink)}</a></p>
    ` : ""}
  `.trim();
}
const STATUS_VARIANT = {
  draft: "gray", pending_approval: "yellow", approved: "blue",
  rejected: "red", posted: "green", on_hold: "yellow", closed: "gray", cancelled: "red",
};
const PRIORITY_VARIANT = { low: "gray", medium: "blue", high: "yellow", urgent: "red" };

const ALL_COLUMNS = [
  { key: "department", label: "Department" },
  { key: "deptManager", label: "Dept. Manager" },
  { key: "requestedBy", label: "Requested By" },
  { key: "hiringManager", label: "Hiring Manager" },
  { key: "director", label: "Director" },
  { key: "openings", label: "Openings" },
  { key: "candidates", label: "Candidates" },
  { key: "priority", label: "Priority" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created" },
  { key: "targetJoining", label: "Target Joining" },
  { key: "progress", label: "Progress" },
];
const VISIBLE_COLS_KEY = "hr_req_visible_columns_v2";

const EMPTY_FORM = {
  department_id: "", department_manager_id: "",
  title: "", designation: "", employment_type: "full_time", openings: 1,
  priority: "medium", min_experience: "", max_experience: "", salary_min: "",
  salary_max: "", description: "", requirements: "", target_closing_date: "",
};

const STEP2_FIELDS = [
  "title", "designation", "employment_type", "openings", "priority",
  "target_closing_date", "min_experience", "max_experience", "salary_min",
  "salary_max", "description", "requirements",
];
const step2Snapshot = (f) => JSON.stringify(STEP2_FIELDS.map((k) => f[k] ?? ""));

const personName = (...values) => values.find((value) => value && typeof value === "object")?.name || "—";

function approvalProgress(requisition) {
  const steps = requisition.current_approval_cycle?.steps || requisition.currentApprovalCycle?.steps || [];
  const hiringManager = steps.find((item) => item.step_type === "HIRING_MANAGER");
  const director = steps.find((item) => item.step_type === "DIRECTOR");
  const shortStatus = (value) => value ? value.toLowerCase().replace("_", " ") : "waiting";
  return `HM ${shortStatus(hiringManager?.status)} · Director ${shortStatus(director?.status)}`;
}

export default function HRManagerTab({ departments = [], people = [], openRequisitionForm, isHrManagerView = false }) {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const hr = useHrFilters("requisitions");
  const { can } = useAuthorization();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  


  const [page, setPage] = useState(1);
  const [forwardModalOpen, setForwardModalOpen] = useState(false);
  const [returnDeptHeadModalOpen, setReturnDeptHeadModalOpen] = useState(false);
  const [reviewComment, setReviewComment] = useState("");
  const [directorId, setDirectorId] = useState("");
  const [eligibleDirectors, setEligibleDirectors] = useState([]);
  const [directorsLoading, setDirectorsLoading] = useState(false);
  const [reviewReqId, setReviewReqId] = useState(null);
  const [reviewReqStatus, setReviewReqStatus] = useState(null);
  const [reviewReqTitle, setReviewReqTitle] = useState("");
  const [perPage, setPerPage] = useState(25);

  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [drawerTarget, setDrawerTarget] = useState(null);
  const [reviewReq, setReviewReq] = useState(null);
  const [submitTarget, setSubmitTarget] = useState(null);
  const [approvalOptions, setApprovalOptions] = useState({ hrManagers: [] });
  const [approversLoading, setApproversLoading] = useState(false);
  const [submittingApproval, setSubmittingApproval] = useState(false);

  const [managers, setManagers] = useState([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [managersError, setManagersError] = useState(false);
  const managerSeq = useRef(0);
  const baselineRef = useRef(step2Snapshot(EMPTY_FORM));

  const deptOptions = useMemo(() => departments.filter((d) => d.id != null), [departments]);

  const resetManagers = () => {
    managerSeq.current += 1;
    setManagers([]);
    setManagersLoading(false);
    setManagersError(false);
  };

  const loadManagers = (deptId, keepManagerId = "") => {
    const seq = ++managerSeq.current;
    setManagersLoading(true);
    setManagersError(false);
    setManagers([]);
    hrApi.getDepartmentManagers(deptId, user?.accessToken, user?.tokenType, { ...companyScope })
      .then((res) => {
        if (seq !== managerSeq.current) return;
        const list = res.data || [];
        setManagers(list);
        setForm((f) => {
          if (keepManagerId && list.some((m) => String(m.id) === String(keepManagerId))) return f;
          return { ...f, department_manager_id: list.length === 1 ? String(list[0].id) : "" };
        });
      })
      .catch(() => { if (seq === managerSeq.current) setManagersError(true); })
      .finally(() => { if (seq === managerSeq.current) setManagersLoading(false); });
  };

  const onDepartmentChange = (value) => {
    setForm((f) => ({ ...f, department_id: value, department_manager_id: "" }));
    if (value) loadManagers(value);
    else resetManagers();
  };

  const goToStep1 = () => {
    setStep(1);
    if (form.department_id) loadManagers(form.department_id, form.department_manager_id);
  };

  const canGoNext = Boolean(form.department_id && form.department_manager_id) && !managersLoading;

  const selectedDeptName =
    deptOptions.find((d) => String(d.id) === String(form.department_id))?.name
    || editing?.department?.name || "Not set";
  const selectedManagerName =
    managers.find((m) => String(m.id) === String(form.department_manager_id))?.name
    || (form.department_manager_id && editing?.department_manager?.name) || "Not set";

  const requestClose = () => {
    if (step2Snapshot(form) !== baselineRef.current
      && !window.confirm("Discard this requisition?\n\nYour unsaved changes will be lost.")) return;
    setModalOpen(false);
  };

  // Live JD preview: regenerated from the form on every change until the
  // recruiter edits it directly, at which point their wording wins until
  // they explicitly ask to rebuild it.
  const [jdText, setJdText] = useState(() => buildJdTemplate(EMPTY_FORM, ""));
    const [jdEdited, setJdEdited] = useState(false);



  // One shared "how to apply" link embedded into every generated JD — the
  // same Google Form every requisition's candidates apply through, per the
  // candidate-intake design. Stored server-side (Settings, group "hr") so
  // every recruiter sees the same value, not just localStorage on one machine.
  const [applyLink, setApplyLink] = useState("");
  const [applyLinkDraft, setApplyLinkDraft] = useState("");
  const [applyLinkSaving, setApplyLinkSaving] = useState(false);
  useEffect(() => {
    if (!user?.accessToken) return;
    rbacApi.getSettings(user.accessToken, user.tokenType, "hr")
      .then((res) => {
        const row = (res.data || []).find((s) => s.key === "hr.google_form_url");
        if (row?.value) { setApplyLink(row.value); setApplyLinkDraft(row.value); }
      })
      .catch(() => {}); // no admin.configuration.read permission, or module not migrated — JD just omits the link
  }, [user]);

  const saveApplyLink = async () => {
    setApplyLinkSaving(true);
    try {
      const res = await rbacApi.updateSettings(
        [{ key: "hr.google_form_url", value: applyLinkDraft.trim() }],
        user?.accessToken, user?.tokenType, "hr",
      );
      if (res.status) { setApplyLink(applyLinkDraft.trim()); toast.success("Application link saved"); }
    } catch (err) {
      toast.error(err.message || "Failed to save application link");
    } finally {
      setApplyLinkSaving(false);
    }
  };

  useEffect(() => {
    if (!jdEdited) setJdText(buildJdTemplate(form, applyLink));
  }, [form, jdEdited, applyLink]);

  const [visibleCols, setVisibleCols] = useState(() => {
    try { return JSON.parse(localStorage.getItem(VISIBLE_COLS_KEY)) || ALL_COLUMNS.map((c) => c.key); }
    catch { return ALL_COLUMNS.map((c) => c.key); }
  });
  const [colMenuOpen, setColMenuOpen] = useState(false);

  const toggleCol = (key) => {
    const next = visibleCols.includes(key) ? visibleCols.filter((k) => k !== key) : [...visibleCols, key];
    setVisibleCols(next);
    try { localStorage.setItem(VISIBLE_COLS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };
  const isVisible = (key) => visibleCols.includes(key);

  const load = () => {
    setLoading(true);
    hrApi.getRequisitions(user?.accessToken, user?.tokenType, {
      ...companyScope,
      page, per_page: perPage,
      search: hr.debouncedSearch || undefined,
      department_id: hr.filters.departmentId || undefined,
      status: hr.filters.status || undefined,
    })
      .then((res) => {
        if (!res.status) return;
        const payload = res.data;
        setRows(payload?.data || []);
        setTotal(payload?.total ?? (payload?.data?.length || 0));
      })
      .catch((err) => toast.error(err.message || "Failed to load requisitions"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { setPage(1); }, [hr.debouncedSearch, hr.filters.departmentId, hr.filters.status, scopeKey]);
  useEffect(() => { if (user?.accessToken) load(); }, [user, scopeKey, page, perPage, hr.debouncedSearch, hr.filters.departmentId, hr.filters.status]); // eslint-disable-line react-hooks/exhaustive-deps

  // hiringManager / priority / date / sort have no server-side filter on this
  // endpoint — applied to the current page only, a known limit at very large
  // scale rather than a fabricated "it filters everything" claim.
  const visibleRows = useMemo(() => {
    let r = [...rows];
    if (hr.filters.hiringManagerId) r = r.filter((x) => String(x.hiring_manager_id) === String(hr.filters.hiringManagerId));
    if (hr.filters.directorId) r = r.filter((x) => String(x.director_id) === String(hr.filters.directorId));
    if (hr.filters.priority) r = r.filter((x) => x.priority === hr.filters.priority);
    if (hr.filters.dateFrom) r = r.filter((x) => x.created_at && x.created_at >= hr.filters.dateFrom);
    if (hr.filters.dateTo) r = r.filter((x) => x.created_at && x.created_at <= hr.filters.dateTo);
    if (hr.filters.sort === "oldest") r.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    else if (hr.filters.sort === "name") r.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    return r;
  }, [rows, hr.filters.hiringManagerId, hr.filters.directorId, hr.filters.priority, hr.filters.dateFrom, hr.filters.dateTo, hr.filters.sort]);

  const openCreate = () => {
    if (openRequisitionForm) openRequisitionForm(null);
  };

  const openEdit = (r) => {
    if (!["draft", "rejected", "pending_approval", "pending_hr_review", "approved", "posted"].includes(r.status)) {
        toast.error("This requisition cannot be edited in its current state.");
        return;
    }
    if (openRequisitionForm) openRequisitionForm(r.id);
  };


  const remove = async (id) => {
    if (!window.confirm("Delete this requisition?")) return;
    try {
      const res = await hrApi.deleteRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition deleted"); load(); }
    } catch (err) { toast.error(err.message || "Failed to delete"); }
  };

  const [hrManagerId, setHrManagerId] = useState("");

  const openSubmitForApproval = async (r) => {
    setReviewReqId(r.id);
    setReviewReqStatus(r.status);
    setReviewReqTitle(r.title);
    setReviewComment("");
    setDirectorId("");
    setForwardModalOpen(true);
  };


  const openReviewModal = (r) => {
    setReviewReqId(r.id);
    setReviewReqStatus(r.status);
    setReviewReqTitle(r.title);
    setReviewComment("");
    openRequisitionForm(r.id, `HR Review — ${r.title}`, (
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => {
          setReturnDeptHeadModalOpen(true);
        }} disabled={hr.loading}>
          <RotateCcw size={14} className="mr-1" /> Return to Dept Head
        </Button>
        <Button onClick={() => {
          setDirectorId("");
          setReviewComment("");
          setForwardModalOpen(true);
        }} disabled={hr.loading}>
          <Send size={14} className="mr-1" /> Forward to Director
        </Button>
      </div>
    ));
  };

  const handleForwardToDirector = async () => {
    try {
      if (['draft', 'rejected'].includes(reviewReqStatus)) {
        await hrApi.submitRequisition(reviewReqId, { hr_manager_id: null }, user?.accessToken, user?.tokenType);
      }
      const res = await hrApi.hrManagerForward(reviewReqId, { director_id: directorId || null, comment: reviewComment }, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success("Forwarded to Director");
        setForwardModalOpen(false);
        setReviewReqId(null);
        if (openRequisitionForm) openRequisitionForm(false);
        load();
      }
    } catch (err) { toast.error(err.message || "Failed to forward"); }
  };

  const handleReturnToDeptHead = async () => {
    if (reviewComment.trim().length < 5) return toast.error("Reason required");
    try {
      const res = await hrApi.hrManagerReturn(reviewReqId, { comment: reviewComment }, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success("Returned to Department Head");
        setReturnDeptHeadModalOpen(false);
        setReviewReqId(null);
        if (openRequisitionForm) openRequisitionForm(false);
        load();
      }
    } catch (err) { toast.error(err.message || "Failed to return"); }
  };

  const withdraw = async (id) => {
    if (!window.confirm("Withdraw this requisition back to draft?")) return;
    try {
      const res = await hrApi.withdrawRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition withdrawn"); load(); }
    } catch (err) { toast.error(err.message || "Failed to withdraw"); }
  };

  const publish = async (id) => {
    try {
      const res = await hrApi.publishRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition posted"); load(); }
    } catch (err) { toast.error(err.message || "Failed to publish"); }
  };

  const [publishingIndeedId, setPublishingIndeedId] = useState(null);

  const publishToIndeed = async (r) => {
    setPublishingIndeedId(r.id);
    try {
      const res = await hrApi.publishToIndeed(r.id, {}, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success(res.message || "Job requisition published to Indeed!");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to publish to Indeed");
    } finally {
      setPublishingIndeedId(null);
    }
  };

  const duplicate = async (r) => {
    try {
      const payload = {
        title: `${r.title} (Copy)`, designation: r.designation, employment_type: r.employment_type,
        openings: r.openings, priority: r.priority, min_experience: r.min_experience, max_experience: r.max_experience,
        salary_min: r.salary_min, salary_max: r.salary_max, description: r.description, requirements: r.requirements,
      };
      if (r.department_id && r.department_manager_id) {
        payload.department_id = r.department_id;
        payload.department_manager_id = r.department_manager_id;
      } else {
        toast.error("Cannot duplicate: missing department or manager. Create a new one manually.");
        return;
      }
      const res = await hrApi.storeRequisition(payload, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success("Requisition duplicated");
        load();
      }
    } catch (err) {
      toast.error(err.message || "Failed to duplicate");
    }
  };

  const archive = async (id) => {
    if (!window.confirm("Close this requisition?")) return;
    try {
      const res = await hrApi.closeRequisition(id, user?.accessToken, user?.tokenType);
      if (res.status) { toast.success("Requisition closed"); load(); }
    } catch (err) { toast.error(err.message || "Failed to close"); }
  };

  const bulkClose = () => runBulk(
    hr.selectedIds,
    (id) => hrApi.closeRequisition(id, user?.accessToken, user?.tokenType),
    { successLabel: "closed", onDone: () => { hr.clearSelected(); load(); } },
  );

  const bulkExport = (format) => {
    const selected = visibleRows.filter((r) => hr.selectedIds.includes(r.id));
    const exportRows = selected.map((r) => ({
      Title: r.title, Department: r.department?.name || "—", "Dept. Manager": r.department_manager?.name || "—",
      "Requested By": personName(r.requested_by, r.requestedBy),
      "Hiring Manager": personName(r.hiring_manager, r.hiringManager),
      Director: personName(r.director),
      Openings: r.openings, Candidates: r.candidates_count ?? 0, Priority: r.priority, Status: r.status,
      Created: r.created_at, "Target Joining": r.target_closing_date || "—",
    }));
    if (format === "excel") downloadExcel(exportRows, "requisitions");
    else downloadCSV(exportRows, "requisitions");
  };

  const viewDrawer = async (r) => {
    setDrawerTarget(r);
    try {
      const res = await hrApi.getRequisition(r.id, user?.accessToken, user?.tokenType);
      if (res.status) setDrawerTarget(res.data);
    } catch (err) {
      toast.error(err.message || "Failed to load requisition detail");
    }
  };

  const allOnPageSelected = visibleRows.length > 0 && visibleRows.every((r) => hr.selectedIds.includes(r.id));


  return (
    <div className="space-y-4">
      <HiringFilterBar
        hr={hr}
        fields={["search", "department", "hiringManager", "director", "status", "priority", "date", "sort"]}
        departments={departments}
        people={people}
        statusOptions={STATUS_OPTIONS}
        priorityOptions={PRIORITY_OPTIONS}
        bulkBar={
          <>
            <button onClick={bulkClose} className="text-xs font-semibold text-red-600 hover:underline">Close</button>
            <button onClick={() => bulkExport("excel")} className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:underline">Export Excel</button>
            <button onClick={() => bulkExport("csv")} className="text-xs font-semibold text-gray-600 dark:text-gray-300 hover:underline">Export CSV</button>
          </>
        }
      />

      <div className="flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setColMenuOpen(!colMenuOpen)}
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-gray-700 dark:text-gray-400 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1.5"
          >
            <Columns3 size={14} /> Columns <ChevronDown size={12} />
          </button>
          {colMenuOpen && (
            <div className="absolute z-30 mt-1 left-0 w-52 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 shadow-lg p-2 space-y-1">
              {ALL_COLUMNS.map((c) => (
                <label key={c.key} className="flex items-center gap-2 text-xs px-1 py-0.5 cursor-pointer">
                  <input type="checkbox" checked={isVisible(c.key)} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          )}
        </div>
        {can("ui.hr.hiring.requisition_create") && <Button icon={<Plus size={16} />} onClick={openCreate}>New Requisition</Button>}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-6"><SkeletonTable rows={8} /></div>
        ) : visibleRows.length === 0 ? (
          <p className="text-center py-16 text-sm text-gray-500 dark:text-gray-400">No job requisitions match these filters</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-700/50 text-xs uppercase text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={() => hr.setAllSelected(allOnPageSelected ? [] : visibleRows.map((r) => r.id))}
                    />
                  </th>
                  <th className="text-left px-4 py-3">Job Title</th>
                  {isVisible("department") && <th className="text-left px-4 py-3">Department</th>}
                  {isVisible("deptManager") && <th className="text-left px-4 py-3">Dept. Manager</th>}
                  {isVisible("requestedBy") && <th className="text-left px-4 py-3">Requested By</th>}
                  {isVisible("hiringManager") && <th className="text-left px-4 py-3">Hiring Manager</th>}
                  {isVisible("director") && <th className="text-left px-4 py-3">Director</th>}
                  {isVisible("openings") && <th className="text-left px-4 py-3">Openings</th>}
                  {isVisible("candidates") && <th className="text-left px-4 py-3">Candidates</th>}
                  {isVisible("priority") && <th className="text-left px-4 py-3">Priority</th>}
                  {isVisible("status") && <th className="text-left px-4 py-3">Status</th>}
                  {isVisible("created") && <th className="text-left px-4 py-3">Created</th>}
                  {isVisible("targetJoining") && <th className="text-left px-4 py-3">Target Joining</th>}
                  {isVisible("progress") && <th className="text-left px-4 py-3">Progress</th>}
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {visibleRows.map((r) => (
                  <tr key={r.id} className="group hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={hr.selectedIds.includes(r.id)} onChange={() => hr.toggleSelected(r.id)} />
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => viewDrawer(r)} className="font-medium text-gray-900 dark:text-white hover:text-brand-600 dark:hover:text-brand-400 text-left">
                        {r.title}
                      </button>
                    </td>
                    {isVisible("department") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.department?.name || "—"}</td>}
                    {isVisible("deptManager") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.department_manager?.name || "—"}</td>}
                    {isVisible("requestedBy") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{personName(r.requested_by, r.requestedBy)}</td>}
                    {isVisible("hiringManager") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{personName(r.hiring_manager, r.hiringManager)}</td>}
                    {isVisible("director") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{personName(r.director)}</td>}
                    {isVisible("openings") && <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.openings}</td>}
                    {isVisible("candidates") && (
                      <td className="px-4 py-3">
                        <button onClick={() => viewDrawer(r)} className="text-brand-600 dark:text-brand-400 hover:underline">
                          {r.candidates_count ?? 0}
                        </button>
                      </td>
                    )}
                    {isVisible("priority") && <td className="px-4 py-3"><Badge variant={PRIORITY_VARIANT[r.priority] || "gray"}>{r.priority}</Badge></td>}
                    {isVisible("status") && <td className="px-4 py-3"><Badge variant={STATUS_VARIANT[r.status] || "gray"}>{r.status?.replace("_", " ")}</Badge></td>}
                    {isVisible("created") && <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.created_at ? new Date(r.created_at).toLocaleDateString() : "—"}</td>}
                    {isVisible("targetJoining") && <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{r.target_closing_date || "—"}</td>}
                    {isVisible("progress") && (
                      <td className="px-4 py-3 w-28">
                        <div className="h-1.5 w-full bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden" title="Applications received vs. openings">
                          <div
                            className="h-full bg-brand-500 rounded-full"
                            style={{ width: `${Math.min(100, ((r.candidates_count ?? 0) / Math.max(1, r.openings)) * 100)}%` }}
                          />
                        </div>
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        {["draft", "rejected"].includes(r.status) && can("ui.hr.hiring.requisition_submit") && (
                          <button title="Submit for approval" onClick={() => openSubmitForApproval(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Send size={14} /></button>
                        )}
                        {r.status === "pending_approval" && (
                          <span className="max-w-44 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" title="Approval progress">{approvalProgress(r)}</span>
                        )}
                        
                          {r.status === "pending_hr_review" && (
                            <button title="Review Requisition" onClick={() => openReviewModal(r)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 font-semibold text-xs flex items-center gap-1"><Eye size={14} /> Review</button>
                          )}
                          {r.status === "returned_to_hr" && (
                            <button title="Review Requisition" onClick={() => openReviewModal(r)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 font-semibold text-xs flex items-center gap-1"><Eye size={14} /> Review Return</button>
                          )}

                          {r.status === "pending_approval" && can("ui.hr.hiring.requisition_withdraw") && (
                          <button title="Withdraw to draft" onClick={() => withdraw(r.id)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><RotateCcw size={14} /></button>
                        )}
                        {isHrManagerView && r.status === "approved" && can("ui.hr.hiring.requisition_publish") && (
                            <button title="Post" onClick={() => publish(r.id)} className="p-1.5 rounded-lg text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20"><Send size={14} /></button>
                          )}
                        {isHrManagerView && r.status === "approved" && can("ui.hr.hiring.requisition_publish") && (
                            <button
                              title={r.published_to_indeed ? "Published on Indeed" : "Publish to Indeed"}
                            onClick={() => publishToIndeed(r)}
                            disabled={publishingIndeedId === r.id}
                            className={`px-2 py-1 rounded-md text-xs font-bold flex items-center gap-1 transition-colors ${
                              r.published_to_indeed
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                                : "bg-blue-600 text-white hover:bg-blue-700 shadow-xs"
                            }`}
                          >
                            <span className="font-black">Indeed</span>
                            {publishingIndeedId === r.id ? "..." : (r.published_to_indeed ? "✓" : "Post")}
                          </button>
                        )}
                          {["draft", "rejected", "pending_approval", "pending_hr_review", "approved", "posted"].includes(r.status) && <button title="Edit" onClick={() => openEdit(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Pencil size={14} /></button>}
                        <button title="Duplicate" onClick={() => duplicate(r)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Copy size={14} /></button>
                        {!["closed", "cancelled", "pending_approval"].includes(r.status) && (
                          <button title="Archive / Close" onClick={() => archive(r.id)} className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><Archive size={14} /></button>
                        )}
                        <button title="Delete" onClick={() => remove(r.id)} className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-4">
          <Pagination current={page} total={total} pageSize={perPage} onChange={setPage} onPageSizeChange={setPerPage} />
        </div>
      </div>

      {/* Forward to Director Modal */}
      <Modal
        zIndex={1010}
        isOpen={forwardModalOpen}
        onClose={() => setForwardModalOpen(false)}
        title={`Forward to Director — ${reviewReqTitle}`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setForwardModalOpen(false)}>Cancel</Button>
            <Button onClick={handleForwardToDirector}>
              <Send size={14} className="mr-1" /> Forward
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Forward this requisition to the Directors' queue for final approval.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">HR Manager Notes (Optional)</label>
            <textarea className={`${inputClass} min-h-24`} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Add any context or notes for the director..." />
          </div>
        </div>
      </Modal>

      {/* Return to Dept Head Modal */}
      <Modal
        zIndex={1010}
        isOpen={returnDeptHeadModalOpen}
        onClose={() => setReturnDeptHeadModalOpen(false)}
        title={`Return to Department Head — ${reviewReqTitle}`}
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setReturnDeptHeadModalOpen(false)}>Cancel</Button>
            <Button onClick={handleReturnToDeptHead} disabled={reviewComment.trim().length < 5}>
              <RotateCcw size={14} className="mr-1" /> Return
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">Send this requisition back to the Department Head for revisions.</p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Reason for Return * (min 5 chars)</label>
            <textarea className={`${inputClass} min-h-24`} value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} placeholder="Explain what needs to be changed..." autoFocus />
          </div>
        </div>
      </Modal>

      <RequisitionDrawer
        requisition={drawerTarget}
        onClose={() => setDrawerTarget(null)}
        onEdit={(r) => { setDrawerTarget(null); openEdit(r); }}
      />
    </div>
  );
}

function Field({ label, required, full, children }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
        {label}{required && <span className="text-red-500"> *</span>}
      </label>
      {children}
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-2 pb-1.5 border-b border-gray-100 dark:border-gray-700">
        {title}
      </p>
      {children}
    </div>
  );
}

