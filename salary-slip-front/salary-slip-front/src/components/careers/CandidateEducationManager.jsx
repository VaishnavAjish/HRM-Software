import { useEffect, useState } from "react";
import { GraduationCap, Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import { candidateApi } from "../../utils/api";
import { useCandidateAuth } from "../../context/CandidateAuthContext";

const EMPTY_FORM = { institution: "", degree: "", field_of_study: "", start_year: "", end_year: "", grade: "", description: "" };

export default function CandidateEducationManager() {
  const { token } = useCandidateAuth();
  const [educations, setEducations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!token) return;
    candidateApi.getEducations(token)
      .then((res) => { if (res.status) setEducations(res.data || []); })
      .catch((err) => toast.error(err.message || "Failed to load education"))
      .finally(() => setLoading(false));
  }, [token]);

  const startAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const startEdit = (edu) => {
    setEditingId(edu.id);
    setForm({
      institution: edu.institution, degree: edu.degree, field_of_study: edu.field_of_study || "",
      start_year: edu.start_year, end_year: edu.end_year || "", grade: edu.grade || "", description: edu.description || "",
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
      const res = editingId
        ? await candidateApi.updateEducation(editingId, form, token)
        : await candidateApi.createEducation(form, token);

      if (res.status) {
        setEducations((prev) => (editingId ? prev.map((ed) => (ed.id === editingId ? res.data : ed)) : [res.data, ...prev]));
        toast.success(editingId ? "Education updated" : "Education added");
        cancel();
      } else {
        toast.error(res.message || "Failed to save education");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save education");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      await candidateApi.deleteEducation(id, token);
      setEducations((prev) => prev.filter((ed) => ed.id !== id));
    } catch (err) {
      toast.error(err.message || "Failed to remove education");
    }
  };

  return (
    <section className="rounded-lg border border-nx-line bg-nx-surface p-6 sm:p-7">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <GraduationCap size={17} className="text-brand-600" />
          <h2 className="text-sm font-bold text-nx-ink">Education</h2>
        </div>
        {!showForm && (
          <button type="button" onClick={startAdd} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-700 hover:underline">
            <Plus size={14} /> Add Education
          </button>
        )}
      </div>

      {loading ? (
        <div className="mt-4 h-16 animate-pulse rounded-md bg-nx-paper" />
      ) : (
        <div className="mt-4 space-y-3">
          {educations.length === 0 && !showForm && <p className="text-sm text-nx-muted">No education added yet.</p>}
          {educations.map((edu) => (
            <div key={edu.id} className="flex items-start justify-between gap-3 rounded-md border border-nx-line bg-nx-paper px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-nx-ink">{edu.degree}{edu.field_of_study ? `, ${edu.field_of_study}` : ""}</p>
                <p className="text-sm text-nx-body">{edu.institution}</p>
                <p className="mt-0.5 text-xs text-nx-muted">
                  {edu.start_year} — {edu.end_year || "Present"}{edu.grade ? ` · ${edu.grade}` : ""}
                </p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                <button type="button" onClick={() => startEdit(edu)} aria-label={`Edit ${edu.degree}`} className="rounded p-1.5 text-nx-faint hover:bg-nx-surface hover:text-nx-ink">
                  <Pencil size={14} />
                </button>
                <button type="button" onClick={() => remove(edu.id)} aria-label={`Remove ${edu.degree}`} className="rounded p-1.5 text-nx-faint hover:bg-red-50 hover:text-red-600">
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
              <label htmlFor="edu-institution" className="mb-1 block text-xs font-bold text-nx-body">Institution *</label>
              <input id="edu-institution" required value={form.institution} onChange={(e) => setForm({ ...form, institution: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            <div>
              <label htmlFor="edu-degree" className="mb-1 block text-xs font-bold text-nx-body">Degree *</label>
              <input id="edu-degree" required value={form.degree} onChange={(e) => setForm({ ...form, degree: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            <div>
              <label htmlFor="edu-field" className="mb-1 block text-xs font-bold text-nx-body">Field of Study</label>
              <input id="edu-field" value={form.field_of_study} onChange={(e) => setForm({ ...form, field_of_study: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            <div>
              <label htmlFor="edu-grade" className="mb-1 block text-xs font-bold text-nx-body">Grade</label>
              <input id="edu-grade" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            <div>
              <label htmlFor="edu-start-year" className="mb-1 block text-xs font-bold text-nx-body">Start Year *</label>
              <input id="edu-start-year" type="number" required value={form.start_year} onChange={(e) => setForm({ ...form, start_year: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
            <div>
              <label htmlFor="edu-end-year" className="mb-1 block text-xs font-bold text-nx-body">End Year</label>
              <input id="edu-end-year" type="number" value={form.end_year} onChange={(e) => setForm({ ...form, end_year: e.target.value })}
                className="w-full rounded-md border border-nx-line bg-white px-3 py-2 text-sm text-nx-ink outline-none focus:border-brand-500" />
            </div>
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
