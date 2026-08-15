import { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ClipboardCopy } from "lucide-react";
import Button from "../../../../components/ui/Button";
import Modal from "../../../../components/ui/Modal";
import RichTextEditor from "../../../../components/ui/RichTextEditor";
import DatePicker from "../../../../components/ui/DatePicker";
import { useAuth } from "../../../../context/AuthContext";
import { useCompany } from "../../../../context/CompanyContext";
import { hrApi, salaryApi } from "../../../../utils/api";

const inputClass = "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" }, { value: "medium", label: "Medium" },
  { value: "high", label: "High" }, { value: "urgent", label: "Urgent" },
];
const EMPLOYMENT_TYPE_LABEL = {
  full_time: "Full Time", part_time: "Part Time", contract: "Contract", intern: "Intern",
};
const PRIORITY_LABEL = { low: "Low", medium: "Medium", high: "High", urgent: "Urgent" };

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

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function richFieldToHtml(value) {
  const v = (value || "").trim();
  if (!v) return "";
  if (/<[a-z][\s\S]*>/i.test(v)) return v;
  return v.split(/\n+/).map((line) => `<p>${escapeHtml(line)}</p>`).join("");
}

function htmlToPlainText(html) {
  const div = document.createElement("div");
  div.innerHTML = html || "";
  div.querySelectorAll("li").forEach((li) => { li.textContent = `- ${li.textContent}`; });
  div.querySelectorAll("h1, h2, p, li, br").forEach((el) => el.after("\n"));
  return (div.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
}

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

export default function RequisitionFormModal({ targetId, isOpen, onClose, onSuccess, initialDepartments, extraContent = null, extraFooter = null, titleOverride = null }) {
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();

  const [step, setStep] = useState(1);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  
  const [departments, setDepartments] = useState(initialDepartments || []);
  const [managers, setManagers] = useState([]);
  const [managersLoading, setManagersLoading] = useState(false);
  const [managersError, setManagersError] = useState(false);
  const managerSeq = useRef(0);
  const baselineRef = useRef(step2Snapshot(EMPTY_FORM));
  const [jdEdited, setJdEdited] = useState(false);

  const deptOptions = useMemo(() => departments.filter((d) => d.id != null), [departments]);

  // Load departments if we don't have them
  useEffect(() => {
    if (!initialDepartments || initialDepartments.length === 0) {
      if (!user?.accessToken) return;
      salaryApi.getDepartments(user.accessToken, user.tokenType, companyScope?.companyId).then(res => {
        setDepartments(res.data || []);
      }).catch(err => {
        console.error("Failed to load departments in modal", err);
      });
    }
  }, [initialDepartments, user, companyScope]);

  // Load editing requisition if provided
  useEffect(() => {
    if (isOpen) {
      if (targetId && targetId !== "new") {
        setFetching(true);
        hrApi.getRequisition(targetId, user?.accessToken, user?.tokenType).then(res => {
          if (res.status && res.data) {
            const r = res.data;
            setEditing(r);
            const f = {
              department_id: r.department_id ?? "", department_manager_id: r.department_manager_id ?? "",
              title: r.title || "", designation: r.designation || "", employment_type: r.employment_type || "full_time",
              openings: r.openings || 1, priority: r.priority || "medium", min_experience: r.min_experience ?? "",
              max_experience: r.max_experience ?? "", salary_min: r.salary_min ?? "", salary_max: r.salary_max ?? "",
              description: r.description || "", requirements: r.requirements || "", target_closing_date: r.target_closing_date || "",
            };
            setForm(f);
            baselineRef.current = step2Snapshot(f);
            setJdEdited(false);
            
            managerSeq.current += 1;
            setManagers([]);
            setManagersLoading(false);
            setManagersError(false);
            
            if (r.department_manager) {
              setManagers([{ id: r.department_manager.id, name: r.department_manager.name, designation: r.department_manager.designation }]);
            }
            setStep(2);
          }
          setFetching(false);
        }).catch(err => {
          toast.error("Failed to load requisition");
          setFetching(false);
          onClose();
        });
      } else {
        setEditing(null);
        setForm(EMPTY_FORM);
        baselineRef.current = step2Snapshot(EMPTY_FORM);
        setJdEdited(false);
        
        managerSeq.current += 1;
        setManagers([]);
        setManagersLoading(false);
        setManagersError(false);
        setStep(1);
      }
    }
  }, [isOpen, targetId, user]);

  const resetManagers = () => {
    managerSeq.current += 1;
    setManagers([]);
    setManagersLoading(false);
    setManagersError(false);
  };

  const loadManagers = (deptId, keepManagerId = "") => {
    if (!deptId) return;
    managerSeq.current += 1;
    const seq = managerSeq.current;
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

  const onDepartmentChange = (deptId) => {
    setForm((f) => ({ ...f, department_id: deptId, department_manager_id: "" }));
    if (!deptId) { resetManagers(); return; }
    loadManagers(deptId);
  };

  const jdText = useMemo(() => {
    return buildJdTemplate(form, "https://careers.yourcompany.com/apply");
  }, [form]);

  useEffect(() => {
    if (step === 2 && !fetching) {
      if (step2Snapshot(form) !== baselineRef.current) setJdEdited(true);
      else setJdEdited(false);
    }
  }, [form, step, fetching]);

  const requestClose = () => {
    if (step === 2 && jdEdited) {
      if (!window.confirm("You have unsaved changes. Discard?")) return;
    }
    onClose();
  };

  const goToStep1 = () => {
    if (jdEdited) {
      if (!window.confirm("Going back will keep your changes in memory, but they aren't saved yet. Proceed?")) return;
    }
    setStep(1);
  };

  const save = async () => {
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!editing && (!form.department_id || !form.department_manager_id)) {
      setStep(1);
      toast.error("Select a Department and Department Manager first");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form };
      if (form.department_id && form.department_manager_id) {
        payload.department_id = Number(form.department_id);
        payload.department_manager_id = Number(form.department_manager_id);
      } else {
        delete payload.department_id;
        delete payload.department_manager_id;
      }
      const res = editing
        ? await hrApi.updateRequisition(editing.id, payload, user?.accessToken, user?.tokenType)
        : await hrApi.storeRequisition(payload, user?.accessToken, user?.tokenType);
      if (res.status) { 
        toast.success(res.message || "Saved"); 
        onSuccess();
        onClose(); 
      }
    } catch (err) {
      toast.error(err.message || "Failed to save requisition");
    } finally {
      setSaving(false);
    }
  };

  const canGoNext = Boolean(form.department_id && form.department_manager_id);

  if (fetching) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Loading Requisition" size="md">
        <div className="flex h-32 items-center justify-center text-sm text-gray-500">Loading...</div>
      </Modal>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={requestClose} title={titleOverride || (editing ? "Edit Requisition" : "New Job Requisition")} size={step === 1 ? "md" : "xl"}
      footer={step === 1 ? (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={requestClose}>Cancel</Button>
          <Button onClick={() => canGoNext && setStep(2)} disabled={!canGoNext}>Next →</Button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-2 w-full">
          <Button variant="secondary" onClick={goToStep1}>← Back</Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="secondary" onClick={requestClose}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Edits"}</Button>
            {extraFooter}
          </div>
        </div>
      )}>
      {step === 1 && (
        <FormSection title="Department & Approver">
          <div className="space-y-4">
            <Field label="Department" required>
              <select
                className={inputClass}
                aria-label="Department"
                value={form.department_id}
                onChange={(e) => onDepartmentChange(e.target.value)}
                autoFocus
              >
                <option value="">{deptOptions.length === 0 ? "Loading departments..." : "Select Department"}</option>
                {deptOptions.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
            <Field label="Department Manager" required>
              <select
                className={inputClass}
                aria-label="Department Manager"
                value={form.department_manager_id}
                disabled={!form.department_id || managersLoading || managersError || managers.length === 0}
                onChange={(e) => setForm({ ...form, department_manager_id: e.target.value })}
              >
                <option value="">
                  {!form.department_id ? "Select Department first"
                    : managersLoading ? "Loading managers..."
                    : "Select Department Manager"}
                </option>
                {managers.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}{m.designation ? ` — ${m.designation}` : ""}</option>
                ))}
              </select>
              {managersError && (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  Unable to load Department Managers.{" "}
                  <button type="button" onClick={() => loadManagers(form.department_id, form.department_manager_id)} className="font-semibold underline">
                    Retry
                  </button>
                </p>
              )}
            </Field>
          </div>
        </FormSection>
      )}

      {step === 2 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="space-y-6">
            <FormSection title="Core Info">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Job Title" required full>
                  <input type="text" className={inputClass} placeholder="e.g. Senior Frontend Engineer" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
                </Field>
                <Field label="Designation">
                  <input type="text" className={inputClass} placeholder="e.g. L4 / SDE II" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} />
                </Field>
                <Field label="Employment Type">
                  <select className={inputClass} value={form.employment_type} onChange={(e) => setForm({ ...form, employment_type: e.target.value })}>
                    <option value="full_time">Full Time</option><option value="part_time">Part Time</option>
                    <option value="contract">Contract</option><option value="intern">Intern</option>
                  </select>
                </Field>
              </div>
            </FormSection>

            <FormSection title="Requirements & Details">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Min Exp (Yrs)">
                  <input type="number" min="0" step="0.5" className={inputClass} placeholder="e.g. 2" value={form.min_experience} onChange={(e) => setForm({ ...form, min_experience: e.target.value })} />
                </Field>
                <Field label="Max Exp (Yrs)">
                  <input type="number" min="0" step="0.5" className={inputClass} placeholder="e.g. 5" value={form.max_experience} onChange={(e) => setForm({ ...form, max_experience: e.target.value })} />
                </Field>
                <Field label="Description" full>
                  <RichTextEditor value={form.description} onChange={(val) => setForm({ ...form, description: val })} placeholder="About the role..." minHeight="120px" />
                </Field>
                <Field label="Requirements" full>
                  <RichTextEditor value={form.requirements} onChange={(val) => setForm({ ...form, requirements: val })} placeholder="Key skills & responsibilities..." minHeight="120px" />
                </Field>
              </div>
            </FormSection>

            <FormSection title="Logistics & Compensation">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Openings" required>
                  <input type="number" min="1" className={inputClass} value={form.openings} onChange={(e) => setForm({ ...form, openings: parseInt(e.target.value, 10) || 1 })} />
                </Field>
                <Field label="Priority">
                  <select className={inputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </Field>
                <Field label="Target Closing Date">
                  <DatePicker value={form.target_closing_date} onChange={(date) => setForm({ ...form, target_closing_date: date })} placeholder="Select Date" />
                </Field>
                <div className="sm:col-span-2 grid grid-cols-2 gap-4">
                  <Field label="Min Salary (₹)">
                    <input type="number" min="0" step="1000" className={inputClass} placeholder="e.g. 800000" value={form.salary_min} onChange={(e) => setForm({ ...form, salary_min: e.target.value })} />
                  </Field>
                  <Field label="Max Salary (₹)">
                    <input type="number" min="0" step="1000" className={inputClass} placeholder="e.g. 1500000" value={form.salary_max} onChange={(e) => setForm({ ...form, salary_max: e.target.value })} />
                  </Field>
                </div>
              </div>
            </FormSection>
          </div>

          <div className="hidden lg:block lg:pl-6 lg:border-l lg:border-gray-100 lg:dark:border-gray-700">
            <div className="sticky top-0 pt-2">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white">JD Preview</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">How this will appear to candidates</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(htmlToPlainText(jdText));
                    toast.success("JD copied to clipboard");
                  }}
                  className="flex items-center gap-1 text-[11px] font-semibold text-gray-500 hover:underline dark:text-gray-400"
                >
                  <ClipboardCopy size={12} /> Copy
                </button>
              </div>

              <div className="mb-2 flex items-center gap-1.5">
                <span className="flex h-2 w-2 relative">
                  {jdEdited && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>}
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${jdEdited ? "bg-amber-500" : "bg-emerald-500"}`}></span>
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-gray-400 dark:text-gray-500">
                  {jdEdited ? "Unsaved Changes" : "Up to date"}
                </span>
              </div>

              <div className="prose prose-sm dark:prose-invert max-w-none rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 p-6 shadow-inner max-h-[600px] overflow-y-auto jd-preview-content" dangerouslySetInnerHTML={{ __html: jdText }} />
            </div>
          </div>
        </div>
      )}
      {step === 2 && extraContent && (
        <div className="mt-6 pt-6 border-t border-gray-100 dark:border-gray-700">
          {extraContent}
        </div>
      )}
    </Modal>
  );
}
