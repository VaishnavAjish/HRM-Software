import { useEffect, useState } from "react";
import { Grid3x3, ArrowLeft, Eye, Pencil, Trash2, ShieldAlert, Building2, Search } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../components/ui/Badge";
import { roleApi, rbacApi, salaryApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";

// Canonical page keys admins can be granted access to. Kept in sync by hand
// with the routes under /admin — there's no dynamic page registry.
const ADMIN_PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "employees", label: "Employees" },
  { key: "salary", label: "Salary" },
  { key: "appointments", label: "Appointments" },
  { key: "admin_management", label: "Admin Management" },
  { key: "trial_form", label: "Trial Form" },
  { key: "attendance", label: "Attendance" },
  { key: "tds", label: "TDS Calculation" },
  { key: "form16", label: "Form 16" },
  { key: "reports", label: "Reports" },
  { key: "rbac_dashboard", label: "RBAC — Dashboard" },
  { key: "rbac_users", label: "RBAC — Users" },
  { key: "rbac_permission_matrix", label: "RBAC — Role Permission Matrix" },
  { key: "rbac_audit_logs", label: "RBAC — Audit Trails" },
];

const EMPLOYEE_PAGES = [
  { key: "employee_dashboard", label: "Dashboard" },
  { key: "employee_payslips", label: "Payslips" },
  { key: "employee_form16", label: "Form 16" },
  { key: "employee_profile", label: "Profile" },
  { key: "employee_appointment", label: "Appointment Form" },
];

const AGENT_PAGES = [
  { key: "agent_dashboard", label: "Dashboard" },
  { key: "agent_trial_form", label: "Trial Form" },
  { key: "agent_appointment_form", label: "Appointment Form" },
];

// Only the two admin levels this system has — no separate named "roles"
// (HR Manager / Viewer, etc.) are shown or used here.
const LEVEL_LABEL = { 0: "Super Admin", 1: "Admin", 3: "Employee", 4: "Agent" };
const LEVEL_TONE = { 0: "purple", 1: "yellow", 3: "gray", 4: "blue" };

/**
 * Permissions that are not page access — they unlock a specific sensitive
 * action. Listed separately so an administrator can find them by name instead
 * of having to know the internal key.
 */
const SENSITIVE_PERMISSIONS = [
  {
    key: "appointments.view_full_aadhaar",
    label: "View Full Aadhaar Number",
    module: "Appointments",
    description:
      "Temporarily reveal the complete Aadhaar number on an appointment. Every successful and denied attempt is audited.",
  },
];

const SENSITIVE_KEYS = new Set(SENSITIVE_PERMISSIONS.map((p) => p.key));

/**
 * Page access defaults to read_write when no row exists, which is the historic
 * behaviour. A sensitive permission must default the other way: no row means no
 * access, matching what the backend enforces. Without this the matrix would
 * show "granted" for a permission the server refuses.
 */
function accessFor(entries, pageKey) {
  const fallback = SENSITIVE_KEYS.has(pageKey) ? "no_access" : "read_write";

  return entries[pageKey]?.value ?? fallback;
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
  const [search, setSearch] = useState("");
  // The sensitive permission awaiting confirmation, or null.
  const [pendingGrant, setPendingGrant] = useState(null);

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const res = await rbacApi.getUserRoles(user?.accessToken, user?.tokenType, 1, 100, "", "1,3,4");
      if (res.status) {
        // Also filter out any superadmin user manually just in case
        const filtered = (res.data || []).filter(u => Number(u.role) !== 0);
        setAdmins(filtered);
      }
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

  // Permissions attach to a unique role created for each individual user,
  // making the access control fully per-user instead of global role-wide.
  const resolveUserRoleId = async (userObj) => {
    const roleName = `User_${userObj.id}_Permissions`;
    const res = await roleApi.getRoles(user?.accessToken, user?.tokenType);
    if (res.status) {
      const existing = (res.data || []).find((r) => r.name === roleName);
      if (existing) return existing.id;
    }
    const created = await roleApi.storeRole({ name: roleName }, user?.accessToken, user?.tokenType);
    if (created.status) return created.data.id;
    throw new Error(created.message || `Failed to set up role for ${userObj.name}`);
  };

  const openAdmin = async (admin) => {
    setSelectedAdmin(admin);
    setEntriesLoading(true);
    try {
      const roleId = await resolveUserRoleId(admin);
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

  /**
   * Revoking is immediate; granting asks first. Handing someone the ability to
   * read identity documents should not be a single stray click, and the
   * confirmation is where the audit expectation is stated out loud.
   */
  const toggleSensitive = (permission) => {
    if (accessFor(entries, permission.key) === "no_access") {
      setPendingGrant(permission);
      return;
    }

    setAccess(permission.key, "no_access");
  };

  const confirmSensitiveGrant = async () => {
    const permission = pendingGrant;
    setPendingGrant(null);
    if (permission) await setAccess(permission.key, "view_only");
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
    const pagesToRender = Number(selectedAdmin.role) === 3 
      ? EMPLOYEE_PAGES 
      : Number(selectedAdmin.role) === 4 
        ? AGENT_PAGES 
        : ADMIN_PAGES;
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSelectedAdmin(null)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-200"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex flex-wrap items-center gap-2">
              <span className="break-words">{selectedAdmin.name}</span>
              <Badge variant={LEVEL_TONE[Number(selectedAdmin.role)]}>{LEVEL_LABEL[Number(selectedAdmin.role)]}</Badge>
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              Page access for {selectedAdmin.name} — changes apply only to this user.
            </p>
          </div>
        </div>

        {Number(selectedAdmin.role) === 4 && (
          <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-4">
            <h3 className="font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Building2 size={16} className="text-brand-500" />
              Company Access Config
            </h3>
            <p className="text-xs text-gray-500">
              Select which companies this Agent can access and submit trial forms for.
            </p>
            <div className="flex flex-wrap gap-4 sm:gap-6">
              {[
                { id: "nidhi-impex", label: "Nidhi Impex" },
                { id: "silver-star", label: "Silver Star" }
              ].map(comp => {
                const checked = selectedAdmin.company_code?.includes(comp.id) || selectedAdmin.company_code === "all-companies" || selectedAdmin.company_code === "all";
                return (
                  <label key={comp.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer font-medium">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={async (e) => {
                        let currentCodes = selectedAdmin.company_code || "";
                        if (currentCodes === "all" || currentCodes === "all-companies") {
                          currentCodes = "nidhi-impex,silver-star";
                        }
                        let codesArr = currentCodes.split(",").map(c => c.trim()).filter(Boolean);
                        if (e.target.checked) {
                          if (!codesArr.includes(comp.id)) codesArr.push(comp.id);
                        } else {
                          codesArr = codesArr.filter(c => c !== comp.id);
                        }
                        const newCodes = codesArr.join(",");
                        
                        try {
                          const res = await salaryApi.editEmployee(
                            selectedAdmin.id,
                            { company_code: newCodes },
                            user?.accessToken,
                            user?.tokenType
                          );
                          if (res.status) {
                            toast.success("Company access updated");
                            setSelectedAdmin(prev => ({ ...prev, company_code: newCodes }));
                          } else {
                            toast.error(res.message || "Failed to update company access");
                          }
                        } catch (err) {
                          toast.error(err.message || "Failed to update company access");
                        }
                      }}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    {comp.label}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-3 sm:px-4 py-3 font-medium">Page Name</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-center w-16">View</th>
                  <th className="px-3 sm:px-4 py-3 font-medium text-center w-16">Edit</th>
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
                  pagesToRender.map((page) => {
                    const current = accessFor(entries, page.key);
                    const isBusy = saving[page.key];
                    return (
                      <tr key={page.key} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <td className="px-3 sm:px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{page.label}</td>
                        <td className="px-3 sm:px-4 py-3 text-center">
                          <input
                            type="checkbox"
                            checked={current === "view_only" || current === "read_write"}
                            disabled={isBusy}
                            onChange={() => toggleView(page.key)}
                            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-center">
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

        {/* Sensitive permissions are not page access, so they get their own
            section with the internal key spelled out — an administrator should
            not have to know it in advance to grant it. */}
        {Number(selectedAdmin.role) !== 3 && Number(selectedAdmin.role) !== 4 && (
          <div className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl border border-red-200 dark:border-red-900/50 space-y-4">
            <div className="flex items-center gap-2">
              <ShieldAlert size={16} className="text-red-500" />
              <h3 className="font-bold text-gray-900 dark:text-white">Sensitive Data Permissions</h3>
              <Badge variant="red">High Risk</Badge>
            </div>

            {SENSITIVE_PERMISSIONS.map((permission) => {
              const granted = accessFor(entries, permission.key) !== "no_access";

              return (
                <div
                  key={permission.key}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      {permission.label}
                      <span className="ml-2 text-[11px] font-normal text-gray-400">
                        {permission.module}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {permission.description}
                    </p>
                    <code className="mt-1 inline-block text-[10px] text-gray-400">
                      {permission.key}
                    </code>
                  </div>

                  <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <input
                      type="checkbox"
                      checked={granted}
                      disabled={Boolean(saving[permission.key])}
                      onChange={() => toggleSensitive(permission)}
                      className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                    {granted ? "Granted" : "Not granted"}
                  </label>
                </div>
              );
            })}
          </div>
        )}

        {pendingGrant && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/60 p-4">
            <div className="w-full max-w-md rounded-2xl bg-white p-6 dark:bg-gray-800">
              <h3 className="flex items-center gap-2 text-base font-bold text-gray-900 dark:text-white">
                <ShieldAlert size={18} className="text-red-500" />
                Grant access to full Aadhaar numbers?
              </h3>
              <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
                This permission exposes highly sensitive identity data. Every reveal is audited.
                Grant it only to users with a legitimate business need.
              </p>
              <p className="mt-2 text-xs text-gray-400">
                Granting to {selectedAdmin.name} · {pendingGrant.key}
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPendingGrant(null)}
                  className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSensitiveGrant}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                >
                  Grant Permission
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Shared by the mobile card list and the desktop table below.
  const needle = search.toLowerCase();
  const visibleAdmins = admins.filter(
    (admin) =>
      (admin.name || "").toLowerCase().includes(needle) ||
      (admin.email || "").toLowerCase().includes(needle),
  );

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

      <div className="relative w-full sm:max-w-xs">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 pl-9 text-sm text-gray-900 outline-none transition focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 dark:border-white/10 dark:bg-[#0b0f1a] dark:text-white"
        />
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400 dark:text-gray-500" />
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : visibleAdmins.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No admins found.</p>
        ) : (
          <>
            {/* Mobile: stacked cards, so the Manage button and email stay on-screen. */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 md:hidden">
              {visibleAdmins.map((admin) => (
                <li key={admin.id} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white break-words">{admin.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 break-all">{admin.email}</p>
                    </div>
                    {String(admin.id) !== String(user?.id) && (
                      <button
                        onClick={() => deleteAdmin(admin)}
                        disabled={deleting[admin.id]}
                        className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                    <Badge variant={LEVEL_TONE[Number(admin.role)]}>{LEVEL_LABEL[Number(admin.role)]}</Badge>
                    <button
                      onClick={() => openAdmin(admin)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700"
                    >
                      <Eye size={13} />
                      <Pencil size={13} />
                      Manage
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto md:block">
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
              {
                visibleAdmins
                  .map((admin) => (
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
              }
            </tbody>
          </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
