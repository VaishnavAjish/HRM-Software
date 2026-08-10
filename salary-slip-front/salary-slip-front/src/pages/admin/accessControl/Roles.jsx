import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Plus, Loader2, Save, Pencil, Copy, Archive, ArchiveRestore,
  Power, PowerOff, Trash2, SlidersHorizontal, Search, ShieldCheck,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import Badge from "../../../components/ui/Badge";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import StatusBadge from "../../../components/authorization/StatusBadge";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { canManageRoles, isSuperAdminUser } from "../../../utils/roleAccess";
import { roleApi } from "../../../utils/api";

const inputBase =
  "rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const inputClass = `w-full ${inputBase}`;
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const BLANK = {
  name: "", code: "", description: "", roleType: "BUSINESS", defaultScopeType: "TENANT",
  isAssignable: true, isSensitive: false, requiresApproval: false, isActive: true,
};

const SCOPES = ["GLOBAL", "TENANT", "COMPANY", "BRANCH", "SELF"];
const ROLE_TYPES = ["BUSINESS", "OPERATIONAL", "SYSTEM"];

function Tile({ label, value }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
      <p className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <p className="mt-0.5 text-base font-bold leading-tight tabular-nums text-gray-900 dark:text-white">
        {value ?? "—"}
      </p>
    </div>
  );
}

export default function Roles() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const manageRoles = canManageRoles(user);
  // The super administrator owns every visible tier, so a System role is
  // not a reason to hide status and delete actions from them. The backend
  // applies the same rule; the hidden identity is never in this list.
  const systemRolesEditable = isSuperAdminUser(user);
  const navigate = useNavigate();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [roles, setRoles] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [dialog, setDialog] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(BLANK);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    if (!token) return undefined;
    let active = true;

    Promise.all([
      roleApi.list(token, tokenType, { search, status, type }),
      roleApi.summary(token, tokenType),
    ])
      .then(([listRes, summaryRes]) => {
        if (!active) return;
        setRoles(listRes?.data ?? []);
        setSummary(summaryRes?.data ?? null);
      })
      .catch((err) => { if (active) toast.error(err.message || "Could not load roles"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [token, tokenType, search, status, type]);

  useEffect(() => load(), [load]);

  const refresh = () => { setLoading(true); load(); };

  const set = (field) => (event) =>
    setForm((current) => ({
      ...current,
      [field]: event.target.type === "checkbox" ? event.target.checked : event.target.value,
    }));

  const openCreate = () => { setForm(BLANK); setEditing(null); setDialog("create"); };

  const openEdit = (role) => {
    setEditing(role);
    setForm({
      name: role.name ?? "",
      code: role.code ?? "",
      description: role.description ?? "",
      roleType: role.roleType ?? "BUSINESS",
      defaultScopeType: role.defaultScopeType ?? "TENANT",
      isAssignable: Boolean(role.isAssignable),
      isSensitive: Boolean(role.isSensitive),
      requiresApproval: Boolean(role.requiresApproval),
      isActive: Boolean(role.isActive),
    });
    setDialog("edit");
  };

  const openClone = (role) => {
    setEditing(role);
    setForm({ ...BLANK, name: `${role.name} (Copy)`, code: "" });
    setDialog("clone");
  };

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);

    try {
      if (dialog === "create") {
        await roleApi.create({
          name: form.name,
          code: form.code || undefined,
          description: form.description || null,
          roleType: form.roleType,
          defaultScopeType: form.defaultScopeType,
          isAssignable: form.isAssignable,
          isSensitive: form.isSensitive,
          requiresApproval: form.requiresApproval,
        }, token, tokenType);
        toast.success("Role created");
      } else if (dialog === "edit") {
        await roleApi.update(editing.id, {
          name: form.name,
          description: form.description || null,
          roleType: form.roleType,
          defaultScopeType: form.defaultScopeType,
          isAssignable: form.isAssignable,
          isSensitive: form.isSensitive,
          requiresApproval: form.requiresApproval,
          isActive: form.isActive,
        }, token, tokenType);
        toast.success("Role updated");
      } else {
        await roleApi.clone(editing.id, {
          name: form.name,
          code: form.code || undefined,
          description: form.description || null,
        }, token, tokenType);
        toast.success("Role cloned");
      }

      setDialog(null);
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not save the role");
    } finally {
      setSaving(false);
    }
  };

  const transition = async (role, action, label) => {
    try {
      await roleApi.transition(role.id, action, token, tokenType);
      toast.success(`Role ${label}`);
      refresh();
    } catch (err) {
      toast.error(err.message || `Could not ${label} the role`);
    }
  };

  const remove = async (role) => {
    const held = role.assignedUserCount > 0;

    // Holders are named in the prompt rather than discovered afterwards: this
    // strips their assignment, and only a super administrator may force it.
    const warning = held
      ? `Delete role "${role.name}"?\n\n${role.assignedUserCount} user${role.assignedUserCount === 1 ? "" : "s"} currently hold this role and will lose it.\n\nThis cannot be undone.`
      : `Delete role "${role.name}"? This cannot be undone.`;

    if (!window.confirm(warning)) return;

    try {
      await roleApi.remove(role.id, token, tokenType, held && systemRolesEditable);
      toast.success("Role deleted");
      refresh();
    } catch (err) {
      toast.error(err.message || "Could not delete the role");
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Roles</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Create and manage the roles your organization assigns. Edit what a role grants from the Permission Matrix.
          </p>
        </div>
        {manageRoles && can("admin.role.create") && (
          <Button onClick={openCreate}><Plus size={16} /> New Role</Button>
        )}
      </header>

      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Tile label="Total" value={summary?.total} />
        <Tile label="Active" value={summary?.active} />
        <Tile label="Inactive" value={summary?.inactive} />
        <Tile label="System" value={summary?.system} />
        <Tile label="Custom" value={summary?.custom} />
        <Tile label="Archived" value={summary?.archived} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className={`${inputClass} pl-9`}
            placeholder="Search name, code, description"
            value={search}
            onChange={(event) => { setLoading(true); setSearch(event.target.value); }}
          />
        </div>
        <select className={inputBase} value={status} onChange={(event) => { setLoading(true); setStatus(event.target.value); }}>
          <option value="">All statuses</option>
          <option value="ACTIVE">Active</option>
          <option value="INACTIVE">Inactive</option>
          <option value="ARCHIVED">Archived</option>
        </select>
        <select className={inputBase} value={type} onChange={(event) => { setLoading(true); setType(event.target.value); }}>
          <option value="">All types</option>
          <option value="System">System</option>
          <option value="Custom">Custom</option>
        </select>
      </div>

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable /></div>}

        {!loading && roles.length === 0 && (
          <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">No roles match your filters.</p>
        )}

        {!loading && roles.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  {["Role", "Code", "Type", "Scope", "Users", "Permissions", "Status", "Actions"].map((head) => (
                    <th key={head} scope="col" className={`px-4 py-3 font-semibold text-gray-700 dark:text-gray-200 ${head === "Actions" ? "text-right" : ""}`}>
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => (
                  <tr key={role.id} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">{role.name}</span>
                        {role.isSystem && (
                          <Badge variant="purple"><ShieldCheck size={11} className="mr-0.5 inline" /> System</Badge>
                        )}
                        {role.isSensitive && <Badge variant="yellow">Sensitive</Badge>}
                      </div>
                      {role.description && (
                        <p className="mt-0.5 max-w-md truncate text-xs text-gray-500 dark:text-gray-400">{role.description}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-300">{role.code}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{role.roleType || role.type}</td>
                    <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-400">{role.defaultScopeType || "—"}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{role.assignedUserCount}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{role.permissionCount}</td>
                    <td className="px-4 py-3"><StatusBadge status={role.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        {manageRoles && can("admin.role.update") && (
                          <Button size="sm" variant="outline" onClick={() => navigate("/admin/access-control/permission-matrix")}>
                            <SlidersHorizontal size={14} /> Permissions
                          </Button>
                        )}
                        {manageRoles && can("admin.role.update") && (
                          <Button size="sm" variant="outline" onClick={() => openEdit(role)}>
                            <Pencil size={14} /> Edit
                          </Button>
                        )}
                        {manageRoles && can("admin.role.clone") && (
                          <Button size="sm" variant="outline" onClick={() => openClone(role)}>
                            <Copy size={14} /> Clone
                          </Button>
                        )}
                        {manageRoles && can("admin.role.update") && (systemRolesEditable || !role.isSystem) && role.status !== "ARCHIVED" && (
                          role.isActive
                            ? <Button size="sm" variant="outline" onClick={() => transition(role, "deactivate", "deactivated")}><PowerOff size={14} /> Deactivate</Button>
                            : <Button size="sm" variant="outline" onClick={() => transition(role, "activate", "activated")}><Power size={14} /> Activate</Button>
                        )}
                        {manageRoles && can("admin.role.update") && (systemRolesEditable || !role.isSystem) && (
                          role.status === "ARCHIVED"
                            ? <Button size="sm" variant="outline" onClick={() => transition(role, "restore", "restored")}><ArchiveRestore size={14} /> Restore</Button>
                            : <Button size="sm" variant="outline" onClick={() => transition(role, "archive", "archived")}><Archive size={14} /> Archive</Button>
                        )}
                        {/*
                          Shown but disabled while the role is held, rather than
                          hidden. The button used to disappear whenever anyone
                          had the role, which reads as a missing feature — there
                          is nothing on screen to say the holders are the reason.
                          The backend refuses this delete with 409 regardless.
                        */}
                        {manageRoles && can("admin.role.delete") && (systemRolesEditable || !role.isSystem) && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={role.assignedUserCount > 0 && !systemRolesEditable}
                            title={
                              role.assignedUserCount === 0
                                ? `Delete "${role.name}"`
                                : systemRolesEditable
                                  ? `Deletes the role and removes it from ${role.assignedUserCount} user${role.assignedUserCount === 1 ? "" : "s"}.`
                                  : `Assigned to ${role.assignedUserCount} user${role.assignedUserCount === 1 ? "" : "s"}. Reassign them before deleting this role.`
                            }
                            onClick={() => remove(role)}
                          >
                            <Trash2 size={14} /> Delete
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {dialog && (
        <Modal
          isOpen
          onClose={() => setDialog(null)}
          size="lg"
          title={dialog === "create" ? "New role" : dialog === "edit" ? `Edit ${editing?.name}` : `Clone ${editing?.name}`}
        >
          <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={labelClass}>Name *</span>
              <input type="text" required className={inputClass} value={form.name} onChange={set("name")} />
            </label>

            {dialog !== "edit" && (
              <label className="block">
                <span className={labelClass}>Code</span>
                <input
                  type="text" className={inputClass} pattern="[a-z0-9._-]+"
                  placeholder="auto from name" value={form.code} onChange={set("code")}
                />
              </label>
            )}

            {dialog !== "clone" && (
              <label className="block">
                <span className={labelClass}>Role type</span>
                <select className={inputClass} value={form.roleType} onChange={set("roleType")}>
                  {ROLE_TYPES.map((rt) => <option key={rt} value={rt}>{rt}</option>)}
                </select>
              </label>
            )}

            <label className="block sm:col-span-2">
              <span className={labelClass}>Description</span>
              <textarea rows={2} className={inputClass} value={form.description} onChange={set("description")} />
            </label>

            {dialog !== "clone" && (
              <>
                <label className="block">
                  <span className={labelClass}>Default scope</span>
                  <select className={inputClass} value={form.defaultScopeType} onChange={set("defaultScopeType")}>
                    {SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>

                <div className="flex flex-col justify-end gap-2 pb-1">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={form.isAssignable} onChange={set("isAssignable")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                    Assignable to users
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={form.isSensitive} onChange={set("isSensitive")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                    Sensitive role
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                    <input type="checkbox" checked={form.requiresApproval} onChange={set("requiresApproval")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                    Assignment requires approval
                  </label>
                  {dialog === "edit" && (
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <input type="checkbox" checked={form.isActive} onChange={set("isActive")} className="rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                      Active
                    </label>
                  )}
                </div>
              </>
            )}

            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {dialog === "create" ? "Create role" : dialog === "edit" ? "Save" : "Create clone"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
