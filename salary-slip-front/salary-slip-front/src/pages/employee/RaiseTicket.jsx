import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  LifeBuoy, Send, Loader2, Paperclip, AlertTriangle, CheckCircle2, ShieldCheck, UserCheck, Layers, FileText, X
} from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { PRIORITY_ORDER, priorityMeta, getPermissions } from "../../components/tickets/ticketMeta";

const EMPTY = {
  category_id: "",
  subject: "",
  description: "",
  priority: "medium",
  company_code: "",
  unit: "",
  department: "",
  employee_code: "",
  attachments: [],
};

export default function RaiseTicket() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const perms = getPermissions(user?.role);

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ticketApi
      .getCategories(user?.accessToken, user?.tokenType)
      .then((res) => {
        if (!cancelled && res?.status) setCategories(res.data || []);
      })
      .catch((err) => {
        if (!cancelled) toast.error(err.message || "Failed to load categories");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [user?.accessToken, user?.tokenType]);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  const handleFileUpload = (files) => {
    const fileList = Array.from(files).map((f) => ({
      name: f.name,
      size: (f.size / 1024).toFixed(1) + " KB",
      type: f.type,
    }));
    setForm((prev) => ({ ...prev, attachments: [...prev.attachments, ...fileList] }));
  };

  const removeAttachment = (index) => {
    setForm((prev) => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index),
    }));
  };

  const submit = async (e) => {
    e.preventDefault();

    if (!form.category_id) {
      toast.error("Please select a ticket category");
      return;
    }
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error("Subject and description are both required");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        category_id: Number(form.category_id),
        subject: form.subject.trim(),
        description: form.description.trim(),
        priority: form.priority,
        attachments: form.attachments,
      };

      if (perms.isSuperAdmin) {
        if (form.company_code) payload.company_code = form.company_code;
        if (form.unit) payload.unit = form.unit;
        if (form.department) payload.department = form.department;
        if (form.employee_code) payload.employee_code = form.employee_code;
      }

      const res = await ticketApi.createTicket(payload, user?.accessToken, user?.tokenType);

      if (res?.status) {
        toast.success(res.message || "Ticket created successfully!");
        setForm(EMPTY);
        navigate(perms.isSuperAdmin ? "/admin/tickets/control-center" : "/employee/tickets");
      } else {
        toast.error(res?.message || "Failed to create ticket");
      }
    } catch (err) {
      toast.error(err.message || "Failed to create ticket");
    } finally {
      setSaving(false);
    }
  };

  const selectedCategory = categories.find((c) => String(c.id) === String(form.category_id));

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-3 lg:p-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-gray-200 pb-5 dark:border-white/10">
        <div className="flex items-center gap-3.5">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-indigo-600 text-white shadow-lg shadow-brand-500/20">
            <LifeBuoy size={24} />
          </span>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Raise Support Ticket</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Submit your issue or request — our multi-tier routing system will direct it automatically.
            </p>
          </div>
        </div>
        {perms.isSuperAdmin && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
            <ShieldCheck size={14} /> Super Admin Direct Override Active
          </span>
        )}
      </header>

      <form onSubmit={submit} className="space-y-6">
        {/* Category Selection */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Step 1: Select Category <span className="text-red-500">*</span>
          </h2>

          {loading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {categories.map((cat) => {
                const isSelected = String(form.category_id) === String(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, category_id: cat.id }))}
                    className={`flex flex-col items-start justify-between rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20 dark:border-brand-500 dark:bg-brand-900/20"
                        : "border-gray-200 hover:border-gray-300 dark:border-white/10 dark:hover:border-white/20"
                    }`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${isSelected ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300"}`}>
                        <Layers size={16} />
                      </span>
                      {isSelected && <CheckCircle2 size={16} className="text-brand-600 dark:text-brand-400" />}
                    </div>
                    <div className="mt-3">
                      <p className="text-xs font-bold text-gray-900 dark:text-white">{cat.name}</p>
                      <p className="line-clamp-1 text-[11px] text-gray-400">{cat.description || "General Issue"}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Ticket Information */}
        <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Step 2: Ticket Details
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Priority Level" required>
              <select value={form.priority} onChange={update("priority")} className={inputCls}>
                {PRIORITY_ORDER.map((val) => (
                  <option key={val} value={val}>
                    {priorityMeta(val).label} Priority
                  </option>
                ))}
              </select>
            </Field>

            {perms.isSuperAdmin && (
              <Field label="On Behalf of Employee Code (Optional)">
                <input
                  value={form.employee_code}
                  onChange={update("employee_code")}
                  placeholder="e.g. EMP-1042"
                  className={inputCls}
                />
              </Field>
            )}
          </div>

          <Field label="Subject / Brief Title" required>
            <input
              value={form.subject}
              onChange={update("subject")}
              maxLength={200}
              placeholder="e.g. Discrepancy in July Allowance calculation"
              className={inputCls}
              required
            />
          </Field>

          <Field label="Detailed Description" required>
            <textarea
              value={form.description}
              onChange={update("description")}
              rows={5}
              maxLength={5000}
              placeholder="Provide all relevant details, error messages, and context to expedite resolution."
              className={inputCls}
              required
            />
            <div className="mt-1 flex justify-between text-[11px] text-gray-400">
              <span>Be specific to avoid back-and-forth communication.</span>
              <span>{form.description.length}/5000</span>
            </div>
          </Field>

          {/* Attachments Section */}
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
              Attachments (Optional)
            </label>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                if (e.dataTransfer.files) handleFileUpload(e.dataTransfer.files);
              }}
              className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-4 text-center transition ${
                dragActive
                  ? "border-brand-500 bg-brand-50/50 dark:bg-brand-900/20"
                  : "border-gray-200 hover:border-gray-300 dark:border-white/10"
              }`}
            >
              <Paperclip className="mb-1 text-gray-400" size={20} />
              <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Drag and drop files here, or{" "}
                <label className="cursor-pointer font-bold text-brand-600 hover:underline dark:text-brand-400">
                  browse
                  <input
                    type="file"
                    multiple
                    onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                    className="hidden"
                  />
                </label>
              </p>
              <p className="text-[10px] text-gray-400">Supports PNG, JPG, PDF, DOCX up to 10MB each</p>
            </div>

            {form.attachments.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {form.attachments.map((file, idx) => (
                  <div key={idx} className="flex items-center gap-2 rounded-lg bg-gray-100 px-3 py-1.5 text-xs text-gray-700 dark:bg-white/5 dark:text-gray-300">
                    <FileText size={14} className="text-brand-500" />
                    <span className="max-w-[150px] truncate font-medium">{file.name}</span>
                    <span className="text-[10px] text-gray-400">({file.size})</span>
                    <button type="button" onClick={() => removeAttachment(idx)} className="text-red-500 hover:text-red-700">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Live Approval & Routing Hierarchy Flow */}
        <div className="rounded-2xl border border-gray-200 bg-gradient-to-r from-gray-50 to-white p-5 dark:border-white/10 dark:from-[#0b0f1a] dark:to-slate-900">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Predicted Routing & Approval Chain
          </h2>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <Node title="1. Raise" desc="Employee / User" active />
            <Arrow />
            <Node title="2. Level 1" desc="Reporting Manager" />
            <Arrow />
            <Node title="3. Level 2" desc="Dept Manager" />
            <Arrow />
            <Node title="4. Level 3" desc="HR / Admin Team" />
            <Arrow />
            <Node title="Override" desc="Super Admin Control" isSuper />
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-blue-50/70 p-3 text-xs text-blue-700 dark:bg-blue-900/20 dark:text-blue-300">
            <AlertTriangle size={15} className="shrink-0 text-blue-500" />
            <span>
              If no action is taken within SLA limits, ticket automatically escalates up the hierarchy. Super Admin can intervene or reassign at any step.
            </span>
          </div>
        </div>

        {/* Submit Bar */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={() => setForm(EMPTY)}
            disabled={saving}
            className="rounded-xl px-5 py-2.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Reset Form
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 px-6 py-2.5 text-xs font-bold text-white shadow-lg shadow-brand-500/25 transition hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            {saving ? "Submitting Ticket…" : "Submit Ticket Now"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-xs font-medium text-gray-900 outline-none transition focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white";

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function Node({ title, desc, active, isSuper }) {
  return (
    <div className={`flex flex-col rounded-xl border p-2.5 min-w-[120px] ${
      isSuper
        ? "border-purple-300 bg-purple-50/50 text-purple-900 dark:border-purple-800 dark:bg-purple-900/20 dark:text-purple-300"
        : active
        ? "border-brand-400 bg-brand-50 text-brand-900 dark:border-brand-600 dark:bg-brand-900/30 dark:text-brand-300"
        : "border-gray-200 bg-white text-gray-700 dark:border-white/10 dark:bg-slate-900 dark:text-gray-300"
    }`}>
      <span className="font-bold">{title}</span>
      <span className="text-[10px] text-gray-500 dark:text-gray-400">{desc}</span>
    </div>
  );
}

function Arrow() {
  return <span className="text-gray-300 dark:text-gray-600">→</span>;
}
