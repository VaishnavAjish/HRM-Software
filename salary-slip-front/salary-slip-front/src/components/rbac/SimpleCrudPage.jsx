import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import { useAuth } from "../../context/AuthContext";

/**
 * Generic list + create/edit modal for the small RBAC lookup resources
 * (Locations, Branches, Teams, Approval Levels). Each caller supplies its
 * own `resource` (from rbacApi) and `fields` config; this renders the table,
 * modal form, and wires up toasts/refresh so none of that is duplicated
 * four times over.
 */
export default function SimpleCrudPage({ title, description, icon: Icon, resource, columns, fields, emptyForm }) {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await resource.list(user?.accessToken, user?.tokenType);
      if (res.status) setItems(res.data || []);
    } catch (err) {
      toast.error(err.message || `Failed to load ${title}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    const next = { ...emptyForm };
    fields.forEach((f) => {
      next[f.key] = item[f.key] != null ? String(item[f.key]) : "";
    });
    setForm(next);
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    setSaving(true);
    try {
      const payload = { ...form };
      const res = editing
        ? await resource.update(editing.id, payload, user?.accessToken, user?.tokenType)
        : await resource.create(payload, user?.accessToken, user?.tokenType);

      if (res.status) {
        toast.success(res.message || "Saved successfully");
        setModalOpen(false);
        fetchItems();
      } else {
        toast.error(res.message || "Failed to save");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Delete "${item.name}"? This cannot be undone.`)) return;
    try {
      const res = await resource.remove(item.id, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success("Deleted successfully");
        fetchItems();
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            {Icon && <Icon className="text-brand-600" size={22} />}
            {title}
          </h1>
          {description && <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
        </div>
        <Button icon={<Plus size={16} />} onClick={openCreate}>
          New
        </Button>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-4 py-3 font-medium">
                    {col.label}
                  </th>
                ))}
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No records found.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    {columns.map((col) => (
                      <td key={col.key} className="px-4 py-3 text-gray-700 dark:text-gray-200">
                        {col.render ? col.render(item) : (item[col.key] ?? "—")}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => openEdit(item)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(item)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Edit ${title.slice(0, -1)}` : `New ${title.slice(0, -1)}`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : "Save"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {fields.map((field) => (
            <div key={field.key}>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                {field.label} {field.required && "*"}
              </label>
              {field.type === "select" ? (
                <select
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="">Select {field.label}</option>
                  {(field.options || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === "number" ? "number" : "text"}
                  value={form[field.key] ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, [field.key]: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                />
              )}
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
