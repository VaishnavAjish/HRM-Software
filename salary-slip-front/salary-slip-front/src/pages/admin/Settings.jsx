import { useEffect, useState } from "react";
import { ShieldPlus, ShieldAlert, Plus, Lock, Unlock, Dices, Pencil, Trash2 } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { rbacApi, salaryApi } from "../../utils/api";
import { useAuth } from "../../context/AuthContext";
import { COMPANY_OPTIONS, getCompanyConfig } from "../../config/companyConfig";

const inputCls =
  "w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition";

function generatePassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

const EMPTY_FORM = { name: "", email: "", mobile_number: "", password: "", company_code: COMPANY_OPTIONS[0]?.id || "" };

export default function Settings() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const res = await rbacApi.getUserRoles(user?.accessToken, user?.tokenType, 1, 100, "", "1");
      if (res.status) setAdmins(res.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load admins");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.rawRole === 0) loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.rawRole]);

  if (user?.rawRole !== 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Only a Super Admin can manage admin accounts.
        </p>
      </div>
    );
  }

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setShowAdd(true);
  };

  const openEdit = (admin) => {
    setEditingId(admin.id);
    setForm({
      name: admin.name || "",
      email: admin.email || "",
      mobile_number: admin.mobile_number || "",
      password: "",
      company_code: admin.company_code || COMPANY_OPTIONS[0]?.id || "",
    });
    setShowAdd(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const isEditing = editingId !== null;
    if (!form.name.trim() || !form.email.trim() || !form.company_code || (!isEditing && !form.password.trim())) {
      toast.error("Name, email, company" + (isEditing ? "" : " and password") + " are required");
      return;
    }
    setSaving(true);
    try {
      const res = isEditing
        ? await salaryApi.editEmployee(
            editingId,
            {
              name: form.name.trim(),
              email: form.email.trim(),
              mobile_number: form.mobile_number.trim() || undefined,
              ...(form.password.trim() ? { password: form.password.trim() } : {}),
              company_code: form.company_code,
            },
            user?.accessToken,
            user?.tokenType,
          )
        : await salaryApi.storeEmployee(
            {
              name: form.name.trim(),
              email: form.email.trim(),
              mobile_number: form.mobile_number.trim() || undefined,
              password: form.password.trim(),
              role: 1,
              company_code: form.company_code,
            },
            user?.accessToken,
            user?.tokenType,
          );
      if (res.status) {
        toast.success(isEditing ? `${form.name} updated` : `${form.name} can now log in with ${form.email}`);
        setShowAdd(false);
        loadAdmins();
      } else {
        toast.error(res.message || `Failed to ${isEditing ? "update" : "create"} admin`);
      }
    } catch (err) {
      toast.error(err.message || `Failed to ${isEditing ? "update" : "create"} admin`);
    } finally {
      setSaving(false);
    }
  };

  const deleteAdmin = async (admin) => {
    if (!window.confirm(`Delete ${admin.name}? They'll lose login access immediately.`)) return;
    setDeletingId(admin.id);
    try {
      const res = await salaryApi.deleteEmployee(admin.id, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success(`${admin.name} deleted`);
        loadAdmins();
      } else {
        toast.error(res.message || "Failed to delete admin");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete admin");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleStatus = async (admin) => {
    const nextStatus = admin.status === "0" || admin.status === 0 ? 1 : 0;
    try {
      const res = await salaryApi.editEmployee(admin.id, { status: nextStatus }, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success(nextStatus === 0 ? "Admin unlocked" : "Admin locked");
        loadAdmins();
      } else {
        toast.error(res.message || "Failed to update status");
      }
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm shadow-brand-600/40">
            <ShieldPlus size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">Admins</h1>
            <p className="text-xs text-gray-400">
              Company admins log in with their email and password, and only see their own company's data.
            </p>
          </div>
        </div>
        <Button icon={<Plus size={15} />} onClick={openAdd}>
          Add Admin
        </Button>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/40">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Email</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Company</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-400">Loading...</td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-500 dark:text-gray-400">No admins yet. Add one to get started.</td>
                </tr>
              ) : (
                admins.map((admin) => {
                  const isActive = admin.status === "0" || admin.status === 0;
                  return (
                    <tr key={admin.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{admin.name}</td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{admin.email || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                        {getCompanyConfig(admin.company_code)?.label || admin.company_code || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={isActive ? "green" : "red"}>{isActive ? "Active" : "Locked"}</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            onClick={() => openEdit(admin)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                            title="Edit admin"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            onClick={() => toggleStatus(admin)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                            title={isActive ? "Lock admin" : "Unlock admin"}
                          >
                            {isActive ? <Lock size={15} /> : <Unlock size={15} />}
                          </button>
                          <button
                            onClick={() => deleteAdmin(admin)}
                            disabled={deletingId === admin.id}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                            title="Delete admin"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={showAdd}
        onClose={() => setShowAdd(false)}
        title={editingId !== null ? "Edit Admin" : "Add Admin"}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowAdd(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? "Saving..." : editingId !== null ? "Save Changes" : "Create Admin"}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Full Name *
            </label>
            <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Raj Kumar" className={inputCls} autoFocus />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Email * <span className="normal-case text-gray-400 font-normal">— this is what they log in with</span>
            </label>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="admin@company.com" className={inputCls} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                Mobile Number
              </label>
              <input value={form.mobile_number} onChange={(e) => set("mobile_number", e.target.value)} placeholder="9876543210" className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                Company *
              </label>
              <select value={form.company_code} onChange={(e) => set("company_code", e.target.value)} className={inputCls}>
                {COMPANY_OPTIONS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Password {editingId === null ? "*" : ""}
            </label>
            <div className="flex gap-2">
              <input
                value={form.password}
                onChange={(e) => set("password", e.target.value)}
                placeholder={editingId !== null ? "Leave blank to keep current password" : "Set a password for this admin"}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => set("password", generatePassword())}
                title="Generate a password"
                className="flex-shrink-0 px-3 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-500 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
              >
                <Dices size={15} />
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">You'll need to share this with them yourself.</p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
