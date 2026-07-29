import { useEffect, useState } from "react";
import { Grid3x3, ArrowLeft, Eye, Pencil, Trash2, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../components/ui/Badge";
import { roleApi, rbacApi, salaryApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";

// Canonical page keys admins can be granted access to. Kept in sync by hand
// with the routes under /admin — there's no dynamic page registry.
const PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employees", label: "Employees" },
  { key: "salary", label: "Salary" },
  { key: "appointments", label: "Appointments" },
  { key: "admin_management", label: "Admin Management" },
  { key: "trial_form", label: "Trial Form" },
  { key: "form16", label: "Form 16" },
  { key: "reports", label: "Reports" },
  { key: "rbac_dashboard", label: "RBAC — Dashboard" },
  { key: "rbac_users", label: "RBAC — Users" },
  { key: "rbac_permission_matrix", label: "RBAC — Role Permission Matrix" },
  { key: "rbac_audit_logs", label: "RBAC — Audit Trails" },
];

// Only the two admin levels this system has — no separate named "roles"
// (HR Manager / Viewer, etc.) are shown or used here.
const LEVELS = [
  { value: 1, label: "Admin" },
  { value: 0, label: "Super Admin" },
];
const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]));
const LEVEL_TONE = { 0: "purple", 1: "yellow" };

function accessFor(entries, pageKey) {
  return entries[pageKey]?.value ?? "no_access";
}

export default function PermissionMatrix() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedAdmin, setSelectedAdmin] = useState(null);
  const [levelRoleId, setLevelRoleId] = useState(null);
  const [entries, setEntries] = useState({});
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [saving, setSaving] = useState({});
  const [deleting, setDeleting] = useState({});

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const res = await rbacApi.getUserRoles(user?.accessToken, user?.tokenType, 1, 100, "", "0,1");
      if (res.status) setAdmins(res.data || []);
    } catch (err) {
      toast.error(err.message || "Failed to load admins");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const deleteAdmin = async (admin) => {
    if (!window.confirm(`Delete ${admin.name}? They'll lose login access immediately.`)) return;
    setDeleting((prev) => ({ ...prev, [admin.id]: true }));
    try {
      const res = await salaryApi.deleteEmployee(admin.id, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success(`${admin.name} deleted`);
        setAdmins((prev) => prev.filter((a) => a.id !== admin.id));
      } else {
        toast.error(res.message || "Failed to delete");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    } finally {
      setDeleting((prev) => ({ ...prev, [admin.id]: false }));
    }
  };

  // Permissions attach to the level (Super Admin / Admin), not the
  // individual person — everyone at that level shares the same page access.
  // The named Role record backing a level is created on first use.
  const resolveLevelRoleId = async (level) => {
    const levelName = LEVEL_LABEL[level];
    const res = await roleApi.getRoles(user?.accessToken, user?.tokenType);
    if (res.status) {
      const existing = (res.data || []).find((r) => r.name === levelName);
      if (existing) return existing.id;
    }
    const created = await roleApi.storeRole({ name: levelName }, user?.accessToken, user?.tokenType);
    if (created.status) return created.data.id;
    throw new Error(created.message || `Failed to set up the ${levelName} role`);
  };

  const openAdmin = async (admin) => {
    setSelectedAdmin(admin);
    setEntriesLoading(true);
    try {
      const roleId = await resolveLevelRoleId(admin.role);
      setLevelRoleId(roleId);
      const res = await rbacApi.getDimension("page", user?.accessToken, user?.tokenType, roleId);
      if (res.status) {
        const map = {};
        (res.data || []).forEach((row) => {
          map[row.key_name] = row;
        });
        setEntries(map);
      }
    } catch (err) {
      toast.error(err.message || "Failed to load page permissions");
    } finally {
      setEntriesLoading(false);
    }
  };

  const setAccess = async (pageKey, value) => {
    setSaving((prev) => ({ ...prev, [pageKey]: true }));
    try {
      const res = await rbacApi.storeDimension(
        "page",
        { role_id: levelRoleId, key_name: pageKey, value },
        user?.accessToken,
        user?.tokenType,
      );
      if (res.status) {
        setEntries((prev) => ({ ...prev, [pageKey]: res.data }));
      } else {
        toast.error(res.message || "Failed to save");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save");
    } finally {
      setSaving((prev) => ({ ...prev, [pageKey]: false }));
    }
  };

  const toggleView = (pageKey) => {
    const current = accessFor(entries, pageKey);
    setAccess(pageKey, current === "no_access" ? "view_only" : "no_access");
  };

  const toggleEdit = (pageKey) => {
    const current = accessFor(entries, pageKey);
    setAccess(pageKey, current === "read_write" ? "view_only" : "read_write");
  };

  if (user?.rawRole !== 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Only a Super Admin can access RBAC.</p>
      </div>
    );
  }

  if (selectedAdmin) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedAdmin(null)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              {selectedAdmin.name}
              <Badge variant={LEVEL_TONE[Number(selectedAdmin.role)]}>{LEVEL_LABEL[Number(selectedAdmin.role)]}</Badge>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Page access for every {LEVEL_LABEL[Number(selectedAdmin.role)]} — changes apply to everyone at this level.
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Page Name</th>
                  <th className="px-4 py-3 font-medium text-center">View</th>
                  <th className="px-4 py-3 font-medium text-center">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {entriesLoading ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : (
                  PAGES.map((page) => {
                    const current = accessFor(entries, page.key);
                    const isBusy = saving[page.key];
                    return (
                      <tr key={page.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{page.label}</td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={current === "view_only" || current === "read_write"}
                            disabled={isBusy}
                            onChange={() => toggleView(page.key)}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={current === "read_write"}
                            disabled={isBusy}
                            onChange={() => toggleEdit(page.key)}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Grid3x3 className="text-brand-600" size={22} />
          Role Permission Matrix
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Every admin, their level, and what pages that level can reach.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium text-right">Page Permissions</th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : admins.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No admins found.
                  </td>
                </tr>
              ) : (
                admins.map((admin) => (
                  <tr key={admin.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{admin.name}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{admin.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={LEVEL_TONE[Number(admin.role)]}>{LEVEL_LABEL[Number(admin.role)]}</Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openAdmin(admin)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        <Eye size={13} />
                        <Pencil size={13} />
                        Manage
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {String(admin.id) !== String(user?.id) && (
                        <button
                          onClick={() => deleteAdmin(admin)}
                          disabled={deleting[admin.id]}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
