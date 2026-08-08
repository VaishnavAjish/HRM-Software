import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { LifeBuoy, Send, Loader2 } from "lucide-react";
import { ticketApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { PRIORITY_ORDER, priorityMeta } from "../../components/tickets/ticketMeta";

const EMPTY = { category_id: "", subject: "", description: "", priority: "medium" };

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
        // The number is what the employee will quote later, so it goes in the
        // confirmation rather than a generic "submitted".
        toast.success(res.message || "Ticket created");
        setForm(EMPTY);
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
      <header className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          <LifeBuoy size={20} />
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

        <div className="grid gap-3 rounded-xl bg-gray-50 p-3 text-xs sm:grid-cols-3 dark:bg-white/5">
          <ReadOnly label="Company" value={user?.company_code} />
          <ReadOnly label="Unit / Branch" value={user?.unit} />
          <ReadOnly label="Department" value={user?.department} />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-100 pt-4 dark:border-white/10">
          <button
            type="button"
            onClick={() => setForm(EMPTY)}
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
