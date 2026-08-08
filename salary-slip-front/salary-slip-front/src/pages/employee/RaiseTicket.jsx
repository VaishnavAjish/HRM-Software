import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Ticket, Send, Loader2, ArrowLeft, Paperclip, X, FileText, Image as ImageIcon,
} from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { PRIORITY_ORDER, priorityMeta } from "../../components/tickets/ticketMeta";

const EMPTY = { category_id: "", subject: "", description: "", priority: "medium" };

/**
 * Mirrors App\Support\TicketAttachmentPolicy.
 *
 * Duplicated here only so the employee is told immediately rather than after an
 * upload round-trip. The server enforces the same rules and is the authority —
 * this is a courtesy, not a gate.
 */
const MAX_FILES = 5;
const MAX_BYTES = 10 * 1024 * 1024;
const ACCEPT = [
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif",
  "application/pdf", "text/plain", "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "video/mp4", "video/webm", "video/quicktime", "application/zip",
].join(",");

function humanSize(bytes) {
  return bytes >= 1048576
    ? `${(bytes / 1048576).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Employee-facing "Raise Ticket".
 *
 * Company, unit and department are not fields: the server takes them from the
 * signed-in employee, so offering them as inputs would imply a choice that does
 * not exist and that the API ignores. They are shown read-only instead.
 *
 * Categories come from /api/tickets/categories only. An earlier version fell
 * back to a built-in list when the call failed, which let an employee pick a
 * category id that did not exist and get a validation error they could not act
 * on; a failed load now says so.
 */
export default function RaiseTicket() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;

  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [files, setFiles] = useState([]);

  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    ticketApi
      .getCategories(accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        if (res?.status) setCategories(res.data || []);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadFailed(true);
        setLoading(false);
        toast.error(err.message || "Failed to load categories");
      });

    return () => { cancelled = true; };
  }, [accessToken, tokenType]);

  const update = (field) => (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));

  /**
   * Add to the selection, rejecting anything the server would reject anyway.
   *
   * Appends rather than replaces, because the native picker returns only the
   * files chosen in that one dialog — replacing would silently drop what the
   * employee attached a moment earlier.
   */
  const addFiles = (incoming) => {
    const picked = Array.from(incoming || []);
    if (picked.length === 0) return;

    const accepted = [];
    const rejected = [];

    picked.forEach((file) => {
      if (file.size > MAX_BYTES) {
        rejected.push(`${file.name} is ${humanSize(file.size)} — the limit is 10 MB`);
        return;
      }
      // Same name and size twice is a double-pick, not two files.
      if (files.some((existing) => existing.name === file.name && existing.size === file.size)) {
        return;
      }
      accepted.push(file);
    });

    const room = MAX_FILES - files.length;
    if (accepted.length > room) {
      rejected.push(`Only ${MAX_FILES} files can be attached; the rest were not added`);
      accepted.length = Math.max(0, room);
    }

    if (accepted.length > 0) setFiles((prev) => [...prev, ...accepted]);
    rejected.forEach((reason) => toast.error(reason));
  };

  const removeFile = (index) => setFiles((prev) => prev.filter((_, i) => i !== index));

  const submit = async (e) => {
    e.preventDefault();

    if (!form.category_id) {
      toast.error("Please choose a category");
      return;
    }
    if (!form.subject.trim() || !form.description.trim()) {
      toast.error("Subject and description are both required");
      return;
    }

    setSaving(true);
    try {
      const res = await ticketApi.createTicket(
        {
          category_id: Number(form.category_id),
          subject: form.subject.trim(),
          description: form.description.trim(),
          priority: form.priority,
        },
        accessToken,
        tokenType,
      );

      if (res?.status) {
        /*
         * Attachments go up after the ticket exists, because they need its id.
         *
         * A failure here must not look like the ticket failed — it was created,
         * and the employee is told plainly that only the files did not attach so
         * they can add them from the ticket instead of raising a duplicate.
         */
        if (files.length > 0) {
          try {
            await ticketApi.uploadAttachments(res.data.id, files, accessToken, tokenType);
          } catch (uploadError) {
            toast.error(
              `Ticket ${res.data.ticket_number} was created, but the files did not attach: ${uploadError.message}`,
              { duration: 7000 },
            );
            setForm(EMPTY);
            setFiles([]);
            navigate("/employee/tickets");
            return;
          }
        }

        // The number is what the employee will quote later, so it goes in the
        // confirmation rather than a generic "submitted".
        toast.success(res.message || "Ticket created");
        setForm(EMPTY);
        setFiles([]);
        navigate("/employee/tickets");
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
    <div className="mx-auto w-full max-w-3xl space-y-5 p-2 lg:p-6">
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => navigate("/employee/tickets")}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-white/10 dark:bg-[#0b0f1a] dark:text-gray-200 dark:hover:bg-white/5"
        >
          <ArrowLeft size={15} /> Back to My Tickets
        </button>
      </div>

      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          <Ticket size={20} />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Raise a Ticket</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tell us what you need help with and we will route it to the right team.
          </p>
        </div>
      </header>

      <form
        onSubmit={submit}
        className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#0b0f1a]"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" required>
            {loading ? (
              <div className="h-[42px] animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
            ) : loadFailed ? (
              <p className="rounded-xl bg-rose-50 px-3 py-2.5 text-xs text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
                Categories could not be loaded. Refresh the page to try again.
              </p>
            ) : (
              <select value={form.category_id} onChange={update("category_id")} className={inputCls} required>
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            )}
            {selectedCategory?.default_department && (
              <p className="mt-1 text-xs text-gray-400">
                Routes to {selectedCategory.default_department}.
              </p>
            )}
          </Field>

          <Field label="Priority" required>
            <select value={form.priority} onChange={update("priority")} className={inputCls}>
              {PRIORITY_ORDER.map((value) => (
                <option key={value} value={value}>{priorityMeta(value).label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Subject" required>
          <input
            value={form.subject}
            onChange={update("subject")}
            maxLength={200}
            placeholder="A one-line summary, e.g. Salary not credited for July"
            className={inputCls}
            required
          />
        </Field>

        <Field label="Description" required>
          <textarea
            value={form.description}
            onChange={update("description")}
            rows={6}
            maxLength={5000}
            placeholder="What happened, when it started, and anything you have already tried."
            className={inputCls}
            required
          />
          <p className="mt-1 text-right text-[11px] text-gray-400">{form.description.length}/5000</p>
        </Field>

        {/* Attachments — optional, so it is labelled as such rather than
            carrying the required asterisk the other fields use. */}
        <div>
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <label className="block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
              Attachments <span className="font-medium normal-case text-gray-400">(optional)</span>
            </label>
            <span className="text-[11px] text-gray-400">
              {files.length}/{MAX_FILES} · up to 10 MB each
            </span>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files);
              // Cleared so picking the same file again still fires onChange.
              e.target.value = "";
            }}
          />

          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={files.length >= MAX_FILES}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-5 text-center transition hover:border-brand-400 hover:bg-brand-50/40 disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15 dark:bg-white/[0.02] dark:hover:border-brand-500/50"
          >
            <Paperclip size={18} className="text-gray-400" />
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">
              {files.length >= MAX_FILES ? "Attachment limit reached" : "Click to attach, or drop files here"}
            </span>
            <span className="text-[11px] text-gray-400">
              Screenshots, PDFs, documents, spreadsheets or short videos
            </span>
          </button>

          {files.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {files.map((file, index) => {
                const isImage = file.type.startsWith("image/");
                const Icon = isImage ? ImageIcon : FileText;

                return (
                  <li
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2 dark:border-white/10 dark:bg-white/5"
                  >
                    <Icon size={15} className="shrink-0 text-gray-400" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-gray-800 dark:text-gray-200" title={file.name}>
                      {file.name}
                    </span>
                    <span className="shrink-0 text-[11px] text-gray-400">{humanSize(file.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="shrink-0 rounded-lg p-1 text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="grid gap-3 rounded-xl bg-gray-50 p-3 text-xs sm:grid-cols-3 dark:bg-white/5">
          <ReadOnly label="Company" value={user?.company_code} />
          <ReadOnly label="Unit / Branch" value={user?.unit} />
          <ReadOnly label="Department" value={user?.department} />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={() => navigate("/employee/tickets")}
            disabled={saving}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => { setForm(EMPTY); setFiles([]); }}
            disabled={saving}
            className="rounded-xl px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-white/5"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={saving || loadFailed}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            {saving ? "Submitting…" : "Submit Ticket"}
          </button>
        </div>
      </form>
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-slate-950/60 dark:text-white";

function Field({ label, required, children }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {children}
    </div>
  );
}

function ReadOnly({ label, value }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
      <p className="mt-0.5 text-gray-700 dark:text-gray-200">{value || "—"}</p>
    </div>
  );
}
