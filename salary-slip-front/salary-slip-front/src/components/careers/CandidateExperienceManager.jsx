import { useEffect, useState } from "react";
import { Briefcase, Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

const EMPTY_FORM = { company: "", designation: "", location: "", start_date: "", end_date: "", is_current: false, description: "" };

function formatRange(exp) {
  const fmt = (d) => (d ? new Date(d).toLocaleDateString("en-IN", { month: "short", year: "numeric" }) : "");
  return `${fmt(exp.start_date)} — ${exp.is_current ? "Present" : fmt(exp.end_date)}`;
}

export default function CandidateExperienceManager() {
  const { token } = useCandidateAuth();
  const [experiences, setExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    candidateApi.getExperiences(token)
      .then((res) => { if (res.status) setExperiences(res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load experience"))
      .finally(() => setLoading(false));
  }, [token]);

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (exp) => {
    setEditingId(exp.id);
    setForm({
      company: exp.company, designation: exp.designation, location: exp.location || "",
      start_date: exp.start_date, end_date: exp.end_date || "", is_current: exp.is_current, description: exp.description || "",
    });
    setShowForm(true);
  };

  const cancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, end_date: form.is_current ? null : form.end_date };
      const res = editingId
        ? await candidateApi.updateExperience(editingId, payload, token)
        : await candidateApi.createExperience(payload, token);

      if (res.status) {
        setExperiences((prev) => (editingId ? prev.map((e) => (e.id === editingId ? res.data : e)) : [res.data, ...prev]));
        toast.success(editingId ? "Experience updated" : "Experience added");
        cancel();
      } else {
        toast.error(res.message || "Failed to save experience");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save experience");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await candidateApi.deleteExperience(id, token);
      setExperiences((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      toast.error(err.message || "Failed to remove experience");
    }
  };

  return (
    <section className="rounded-lg border border-nx-line bg-nx-surface p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Briefcase size={17} className="text-brand-600" />
          <h2 className="text-sm font-bold text-nx-ink">Work Experience</h2>
        </div>
        {!showForm && (
          <button type="button" onClick={startAdd} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:underline">
            <Plus size={14} /> Add Experience
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-16 animate-pulse rounded-md bg-nx-paper" />
      ) : (
        <div className="mt-4 space-y-3">
          {experiences.length === 0 && !showForm && <p className="text-sm text-nx-muted">No experience added yet.</p>}
          {experiences.map((exp) => (
            <div key={exp.id} className="flex items-start justify-between gap-3 rounded-md border border-nx-line bg-nx-paper px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-nx-ink">{exp.designation}</p>
                <p className="text-sm text-nx-body">{exp.company}{exp.location ? ` · ${exp.location}` : ""}</p>
                <p className="mt-0.5 text-xs text-nx-muted">{formatRange(exp)}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button type="button" onClick={() => startEdit(exp)} aria-label={`Edit ${exp.designation}`} className="rounded p-1.5 text-nx-faint hover:bg-nx-surface hover:text-nx-ink">
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => remove(exp.id)} aria-label={`Remove ${exp.designation}`} className="rounded p-1.5 text-nx-faint hover:bg-red-50 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} className="mt-4 space-y-4 rounded-md border border-nx-line2 bg-nx-paper p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="exp-company" className="mb-1 block text-xs font-bold text-nx-body">Company *</label>
              <input id="exp-company" required value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            <div>
              <label htmlFor="exp-designation" className="mb-1 block text-xs font-bold text-nx-body">Designation *</label>
              <input id="exp-designation" required value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            <div>
              <label htmlFor="exp-location" className="mb-1 block text-xs font-bold text-nx-body">Location</label>
              <input id="exp-location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            <div className="flex items-end gap-2">
              <label className="flex cursor-pointer items-center gap-2 pb-2 text-xs font-bold text-nx-body">
                <input type="checkbox" checked={form.is_current} onChange={(e) => setForm({ ...form, is_current: e.target.checked })}
                  className="h-3.5 w-3.5 rounded border-nx-line2 text-brand-600 focus:ring-brand-500" />
                I currently work here
              </label>
            </div>
            <div>
              <label htmlFor="exp-start" className="mb-1 block text-xs font-bold text-nx-body">Start Date *</label>
              <input id="exp-start" type="date" required value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            {!form.is_current && (
              <div>
                <label htmlFor="exp-end" className="mb-1 block text-xs font-bold text-nx-body">End Date *</label>
                <input id="exp-end" type="date" required={!form.is_current} value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
              </div>
            )}
          </div>
          <div>
            <label htmlFor="exp-description" className="mb-1 block text-xs font-bold text-nx-body">Responsibilities</label>
            <textarea id="exp-description" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={cancel} className="rounded-md border border-nx-line px-4 py-2 text-xs font-bold text-nx-body hover:border-nx-line2">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-xs font-bold text-white hover:bg-brand-700 disabled:opacity-60">
              {saving ? "Saving…" : editingId ? "Update" : "Add"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
