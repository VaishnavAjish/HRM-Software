import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import {
  Users as UsersIcon, UserCheck, UserX, Lock, ShieldCheck, Shield, Briefcase,
  User as UserIcon, Headset, Filter, Download, Plus, RefreshCw, X,
  Unlock, KeyRound, Trash2, Eye, Pencil, ChevronDown, History, Loader2,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Badge from "../../../components/ui/Badge";
import Modal from "../../../components/ui/Modal";
import Pagination from "../../../components/ui/Pagination";
import SearchBar from "../../../components/ui/SearchBar";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { adminUserApi } from "../../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_TONE = { ACTIVE: "green", INACTIVE: "yellow", LOCKED: "red", DELETED: "gray" };

const BLANK_FILTERS = {
  name: "", empCode: "", email: "", mobile: "", department: "", designation: "",
  branch: "", roleId: "", status: "", userType: "", createdFrom: "", createdTo: "",
  includeSuperAdmins: "",
};

const BLANK_USER = {
  name: "", username: "", email: "", empCode: "", mobile: "", password: "",
  role: 3, companyCode: "", unit: "", department: "", designation: "", branch: "",
  joiningDate: "", managerName: "",
};

const USER_TYPE_LABEL = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  AGENT: "Agent",
  EMPLOYEE: "Employee",
};

const LEGACY_ROLES = [
  { value: 0, label: "Super Admin" },
  { value: 1, label: "Admin" },
  { value: 2, label: "Unit Admin" },
  { value: 3, label: "Employee" },
  { value: 4, label: "Agent" },
];

const REASON_ACTIONS = {
  lock: { title: "Lock user", verb: "Lock", required: true, danger: true },
  unlock: { title: "Unlock user", verb: "Unlock", required: true },
  deactivate: { title: "Deactivate user", verb: "Deactivate", required: true, danger: true },
  activate: { title: "Activate user", verb: "Activate", required: false },
  delete: { title: "Delete user", verb: "Delete", required: false, danger: true },
};

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return withTime ? date.toLocaleString() : date.toLocaleDateString();
}

const TILE_TONES = {
  blue: "text-brand-600 dark:text-brand-400",
  green: "text-green-600 dark:text-green-400",
  yellow: "text-amber-600 dark:text-amber-400",
  red: "text-red-600 dark:text-red-400",
  purple: "text-purple-600 dark:text-purple-400",
};

/*
 * Nine counters do not warrant nine full StatCards — at that count the shared
 * card's icon tile and padding push the table below the fold. This is the same
 * information at a density that fits one row.
 */
function SummaryTile({ title, value, icon, color }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-2 dark:border-gray-700 dark:bg-gray-800">
      <span className={`flex-shrink-0 ${TILE_TONES[color] ?? TILE_TONES.blue}`}>{icon}</span>
      <div className="min-w-0">
        <p className="truncate text-[11px] leading-tight text-gray-500 dark:text-gray-400">{title}</p>
        <p className="text-base font-semibold leading-tight text-gray-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}

function Breadcrumb() {
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-gray-500 dark:text-gray-400">
      <ol className="flex flex-wrap items-center gap-1.5">
        <li><Link to="/admin" className="hover:text-brand-600 dark:hover:text-brand-400">Dashboard</Link></li>
        <li aria-hidden="true">›</li>
        <li>
          <Link to="/admin/access-control/permission-matrix" className="hover:text-brand-600 dark:hover:text-brand-400">
            Access Control
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li aria-current="page" className="font-medium text-gray-700 dark:text-gray-200">Users</li>
      </ol>
    </nav>
  );
}

function Avatar({ user }) {
  if (user.photo) {
    return <img src={user.photo} alt="" loading="lazy" className="h-9 w-9 flex-shrink-0 rounded-full object-cover" />;
  }

  const initials = String(user.name || "?")
    .split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

  return (
    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
      {initials || "?"}
    </span>
  );
}

const MENU_WIDTH = 224;

function RowMenu({ user, can, onAction }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const anchorRef = useRef(null);
  const menuRef = useRef(null);

  // The menu is portalled to <body>: the table now scrolls in both axes, and a
  // dropdown rendered inside that container would be clipped by it.
  useEffect(() => {
    if (!open) return undefined;

    const close = (event) => {
      if (anchorRef.current?.contains(event.target)) return;
      if (menuRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const dismiss = () => setOpen(false);

    document.addEventListener("mousedown", close);
    window.addEventListener("resize", dismiss);
    window.addEventListener("scroll", dismiss, true);

    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("scroll", dismiss, true);
    };
  }, [open]);

  const items = [
    { key: "view", label: "View", icon: Eye, allowed: true },
    { key: "edit", label: "Edit", icon: Pencil, allowed: can("admin.user.update") },
    { key: "assign-role", label: "Assign Role", icon: ShieldCheck, allowed: can("admin.user.assign_role") },
    { key: "assign-permissions", label: "Assign Permissions", icon: Shield, allowed: can("admin.user.assign_permission") },
    { key: "reset-password", label: "Reset Password", icon: KeyRound, allowed: can("admin.user.reset_password") },
    { key: "lock", label: "Lock User", icon: Lock, allowed: can("admin.user.lock") && user.status !== "LOCKED" },
    { key: "unlock", label: "Unlock User", icon: Unlock, allowed: can("admin.user.unlock") && user.status === "LOCKED" },
    { key: "activate", label: "Activate", icon: UserCheck, allowed: can("admin.user.update") && user.status !== "ACTIVE" },
    { key: "deactivate", label: "Deactivate", icon: UserX, allowed: can("admin.user.update") && user.status === "ACTIVE" },
    { key: "audit", label: "View Audit Logs", icon: History, allowed: true },
    { key: "delete", label: "Delete", icon: Trash2, allowed: can("admin.user.delete") && user.status !== "DELETED", danger: true },
  ].filter((item) => item.allowed);

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }

    const rect = anchorRef.current.getBoundingClientRect();
    const height = Math.min(items.length * 36 + 8, 340);
    const opensUpward = rect.bottom + height > window.innerHeight;

    setCoords({
      top: opensUpward ? Math.max(8, rect.top - height - 4) : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
    });
    setOpen(true);
  };

  return (
    <span ref={anchorRef} className="inline-block text-left">
      <Button size="sm" variant="outline" onClick={toggle}>
        Actions <ChevronDown size={14} />
      </Button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ top: coords.top, left: coords.left, width: MENU_WIDTH }}
          className="fixed z-[1100] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800"
        >
          {items.map(({ key, label, icon: Icon, danger }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setOpen(false); onAction(key, user); }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 ${
                danger ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-200"
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}

function DetailSection({ title, children }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</h4>
      {children}
    </section>
  );
}

function FieldGrid({ fields }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {fields.map(([label, value]) => (
        <div key={label} className="min-w-0">
          <dt className="text-xs text-gray-500 dark:text-gray-400">{label}</dt>
          <dd className="truncate text-sm text-gray-900 dark:text-gray-100">{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function DetailDrawer({ userId, token, tokenType, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId || !token) return undefined;

    let active = true;

    adminUserApi
      .get(userId, token, tokenType)
      .then((res) => { if (active) setDetail(res?.data ?? null); })
      .catch((err) => { if (active) toast.error(err.message || "Could not load the user"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [userId, token, tokenType]);

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end bg-black/50 backdrop-blur-sm">
      <button type="button" aria-label="Close" className="flex-1" onClick={onClose} />

      <aside className="flex w-full max-w-2xl flex-col overflow-hidden bg-white shadow-xl dark:bg-gray-800">
        <header className="flex items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-white">{detail?.name || "User"}</h3>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">
              {detail?.empCode ? `${detail.empCode} · ` : ""}{detail?.email}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close panel"
            className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-4">
          {loading && <SkeletonTable rows={6} />}

          {!loading && detail && (
            <>
              <DetailSection title="Personal Information">
                <FieldGrid fields={[
                  ["Full Name", detail.name],
                  ["Username", detail.username],
                  ["Email", detail.email],
                  ["Mobile", detail.mobile],
                  ["Date of Birth", detail.personal?.dob],
                  ["Gender", detail.personal?.gender],
                  ["Blood Group", detail.personal?.bloodGroup],
                  ["Marital Status", detail.personal?.maritalStatus],
                  ["Aadhaar", detail.personal?.aadhaarMasked],
                  ["PAN", detail.personal?.panCardNo],
                  ["Address", detail.personal?.address],
                  ["City", detail.personal?.city],
                ]} />
              </DetailSection>

              <DetailSection title="Employment Information">
                <FieldGrid fields={[
                  ["Employee ID", detail.empCode],
                  ["Department", detail.employment?.department],
                  ["Designation", detail.employment?.designation],
                  ["Branch", detail.employment?.branch],
                  ["Unit", detail.employment?.unit],
                  ["Company", detail.employment?.companyCode],
                  ["Joining Date", formatDate(detail.employment?.joiningDate)],
                  ["Resignation Date", formatDate(detail.employment?.resignationDate)],
                  ["PF No", detail.employment?.pfNo],
                  ["ESI No", detail.employment?.esiNo],
                  ["User Type", detail.userTypeLabel],
                  ["Status", detail.status],
                ]} />
              </DetailSection>

              <DetailSection title="Roles">
                {detail.roles?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {detail.roles.map((role) => <Badge key={role.id} variant="blue">{role.name}</Badge>)}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No roles assigned.</p>
                )}
              </DetailSection>

              <DetailSection title="Permissions">
                {detail.permissions?.length ? (
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                    <table className="w-full text-xs">
                      <tbody>
                        {detail.permissions.map((permission) => (
                          <tr key={permission.code} className="border-b border-gray-100 last:border-0 dark:border-gray-700/60">
                            <td className="px-3 py-1.5 font-mono text-gray-800 dark:text-gray-200">{permission.code}</td>
                            <td className="px-3 py-1.5">
                              <Badge variant={permission.effect === "DENY" ? "red" : "green"}>{permission.effect}</Badge>
                            </td>
                            <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{permission.source}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No effective permissions.</p>
                )}
              </DetailSection>

              <DetailSection title="Departments">
                <div className="flex flex-wrap gap-1.5">
                  {detail.departments?.length
                    ? detail.departments.map((item) => <Badge key={item.name} variant="gray">{item.name}</Badge>)
                    : <span className="text-sm text-gray-500 dark:text-gray-400">—</span>}
                </div>
              </DetailSection>

              <DetailSection title="Branches">
                <div className="flex flex-wrap gap-1.5">
                  {detail.branches?.length
                    ? detail.branches.map((item) => <Badge key={`${item.source}-${item.name}`} variant="gray">{item.name}</Badge>)
                    : <span className="text-sm text-gray-500 dark:text-gray-400">—</span>}
                </div>
              </DetailSection>

              <DetailSection title="Reporting Manager">
                {detail.reportingManager ? (
                  <p className="text-sm text-gray-900 dark:text-gray-100">
                    {detail.reportingManager.name}
                    {detail.reportingManager.empCode ? ` · ${detail.reportingManager.empCode}` : ""}
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">Not recorded.</p>
                )}
              </DetailSection>

              <DetailSection title="Login History">
                {detail.loginHistory?.events?.length ? (
                  <ul className="space-y-1.5">
                    {detail.loginHistory.events.slice(0, 10).map((event) => (
                      <li key={event.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <Badge variant={event.result === "success" ? "green" : "red"}>{event.result}</Badge>
                        <span>{formatDate(event.createdAt, true)}</span>
                        <span className="text-gray-400">{event.ip}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No login events recorded.</p>
                )}
              </DetailSection>

              <DetailSection title="Audit History">
                {detail.auditHistory?.length ? (
                  <ul className="space-y-1.5">
                    {detail.auditHistory.slice(0, 10).map((entry) => (
                      <li key={entry.id} className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{entry.changeType}</span>
                        {" · "}{formatDate(entry.createdAt, true)}
                        {entry.actorName ? ` · by ${entry.actorName}` : ""}
                        {entry.businessReason ? ` — ${entry.businessReason}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No changes recorded against this account.</p>
                )}
              </DetailSection>

              <DetailSection title="Recent Activity">
                {detail.recentActivity?.length ? (
                  <ul className="space-y-1.5">
                    {detail.recentActivity.slice(0, 10).map((entry) => (
                      <li key={entry.id} className="text-xs text-gray-600 dark:text-gray-400">
                        <span className="font-medium text-gray-800 dark:text-gray-200">{entry.action}</span>
                        {" · "}{entry.module}{" · "}{formatDate(entry.createdAt, true)}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">No recorded activity.</p>
                )}
              </DetailSection>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

function ActionDialog({ dialog, options, token, tokenType, busy, setBusy, onDone, onCancel }) {
  const isBulk = dialog.kind.startsWith("bulk-");
  const bulkAction = isBulk ? dialog.kind.replace("bulk-", "") : null;
  const target = dialog.user;
  const prefills = ["edit", "assign-role", "assign-permissions"].includes(dialog.kind);

  const [reason, setReason] = useState("");
  const [form, setForm] = useState(BLANK_USER);
  const [roleIds, setRoleIds] = useState([]);
  const [permissionRows, setPermissionRows] = useState([]);
  const [password, setPassword] = useState("");
  const [issued, setIssued] = useState(null);
  const [loadingUser, setLoadingUser] = useState(prefills);

  useEffect(() => {
    if (!target || !prefills) return undefined;

    let active = true;

    adminUserApi
      .get(target.id, token, tokenType)
      .then((res) => {
        if (!active) return;
        const detail = res?.data;
        setForm({
          name: detail?.name ?? "",
          username: detail?.username ?? "",
          email: detail?.email ?? "",
          empCode: detail?.empCode ?? "",
          mobile: detail?.mobile ?? "",
          password: "",
          role: detail?.legacyRole ?? 3,
          companyCode: detail?.companyCode ?? "",
          unit: detail?.unit ?? "",
          department: detail?.department ?? "",
          designation: detail?.designation ?? "",
          branch: detail?.branch ?? "",
          joiningDate: detail?.joiningDate ?? "",
          managerName: detail?.managerName ?? "",
        });
        setRoleIds((detail?.roles ?? []).map((role) => role.id));
        setPermissionRows(detail?.directPermissions ?? []);
      })
      .catch((err) => toast.error(err.message || "Could not load the user"))
      .finally(() => { if (active) setLoadingUser(false); });

    return () => { active = false; };
  }, [prefills, target, token, tokenType]);

  const set = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const submit = async () => {
    setBusy(true);

    try {
      if (isBulk) {
        await adminUserApi.bulk(
          { action: bulkAction, userIds: dialog.ids, reason: reason || null, roleIds },
          token, tokenType,
        );
        toast.success("Bulk action applied");
        onDone();
        return;
      }

      if (dialog.kind === "create") {
        await adminUserApi.create({ ...form, role: Number(form.role), roleIds }, token, tokenType);
        toast.success("User created");
        onDone();
        return;
      }

      if (dialog.kind === "edit") {
        const payload = { ...form, role: Number(form.role), businessReason: reason || null };
        delete payload.password;
        await adminUserApi.update(target.id, payload, token, tokenType);
        toast.success("User updated");
        onDone();
        return;
      }

      if (dialog.kind === "assign-role") {
        await adminUserApi.action(target.id, "assign-role", { roleIds, reason: reason || null }, token, tokenType);
        toast.success("Roles assigned");
        onDone();
        return;
      }

      if (dialog.kind === "assign-permissions") {
        await adminUserApi.action(
          target.id,
          "assign-permissions",
          {
            permissions: permissionRows.map((row) => ({
              permissionId: row.permissionId,
              isDenied: Boolean(row.isDenied),
            })),
            reason: reason || null,
          },
          token, tokenType,
        );
        toast.success("Permissions assigned");
        onDone();
        return;
      }

      if (dialog.kind === "reset-password") {
        const res = await adminUserApi.action(
          target.id, "reset-password",
          { password: password || null, reason: reason || null },
          token, tokenType,
        );

        toast.success("Password reset");

        if (res?.data?.temporaryPassword) {
          setIssued(res.data.temporaryPassword);
          return;
        }

        onDone();
        return;
      }

      if (dialog.kind === "delete") {
        await adminUserApi.remove(target.id, reason || null, token, tokenType);
        toast.success("User deleted");
        onDone();
        return;
      }

      await adminUserApi.action(target.id, dialog.kind, { reason: reason || null }, token, tokenType);
      toast.success("Done");
      onDone();
    } catch (err) {
      toast.error(err.message || "The action failed");
    } finally {
      setBusy(false);
    }
  };

  const reasonMeta = REASON_ACTIONS[isBulk ? bulkAction : dialog.kind];
  const needsRoles = dialog.kind === "assign-role" || dialog.kind === "create" || bulkAction === "assign-role";
  const isForm = dialog.kind === "create" || dialog.kind === "edit";

  const title = isBulk
    ? `${bulkAction.replace("-", " ")} — ${dialog.ids.length} users`
    : dialog.kind === "create"
      ? "New user"
      : `${reasonMeta?.title ?? dialog.kind.replace("-", " ")}${target ? ` — ${target.name}` : ""}`;

  const canSubmit = !busy
    && !(reasonMeta?.required && reason.trim().length < 5)
    && !(dialog.kind === "create" && (!form.name || !form.email || !form.empCode || !form.password || !form.companyCode));

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={title}
      size={isForm ? "xl" : "lg"}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={reasonMeta?.danger ? "danger" : "primary"} disabled={!canSubmit} onClick={submit}>
            {busy && <Loader2 size={16} className="animate-spin" />}
            {reasonMeta?.verb ?? "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {loadingUser && <SkeletonTable rows={3} />}

        {isForm && !loadingUser && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Full name *</span>
              <input type="text" className={inputClass} value={form.name} onChange={set("name")} />
            </label>
            <label className="block">
              <span className={labelClass}>Username</span>
              <input type="text" className={inputClass} value={form.username} onChange={set("username")} />
            </label>
            <label className="block">
              <span className={labelClass}>Email *</span>
              <input type="email" className={inputClass} value={form.email} onChange={set("email")} />
            </label>
            <label className="block">
              <span className={labelClass}>Employee ID *</span>
              <input type="text" className={inputClass} value={form.empCode} onChange={set("empCode")} />
            </label>
            <label className="block">
              <span className={labelClass}>Mobile</span>
              <input type="text" className={inputClass} value={form.mobile} onChange={set("mobile")} />
            </label>
            {dialog.kind === "create" && (
              <label className="block">
                <span className={labelClass}>Password *</span>
                <input type="password" className={inputClass} value={form.password} onChange={set("password")} />
              </label>
            )}
            <label className="block">
              <span className={labelClass}>User type *</span>
              <select className={inputClass} value={form.role} onChange={set("role")}>
                {LEGACY_ROLES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Company *</span>
              <input type="text" className={inputClass} value={form.companyCode} onChange={set("companyCode")} />
            </label>
            <label className="block">
              <span className={labelClass}>Unit</span>
              <input type="text" className={inputClass} value={form.unit} onChange={set("unit")} />
            </label>
            <label className="block">
              <span className={labelClass}>Department</span>
              <input type="text" className={inputClass} value={form.department} onChange={set("department")} />
            </label>
            <label className="block">
              <span className={labelClass}>Designation</span>
              <input type="text" className={inputClass} value={form.designation} onChange={set("designation")} />
            </label>
            <label className="block">
              <span className={labelClass}>Branch</span>
              <input type="text" className={inputClass} value={form.branch} onChange={set("branch")} />
            </label>
            <label className="block">
              <span className={labelClass}>Joining date</span>
              <input type="date" className={inputClass} value={form.joiningDate} onChange={set("joiningDate")} />
            </label>
            <label className="block">
              <span className={labelClass}>Reporting manager</span>
              <input type="text" className={inputClass} value={form.managerName} onChange={set("managerName")} />
            </label>
          </div>
        )}

        {needsRoles && !loadingUser && (
          <fieldset className="space-y-2">
            <legend className={labelClass}>Roles</legend>
            <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2 dark:border-gray-700">
              {(options?.roles ?? []).map((role) => (
                <label key={role.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                  <input
                    type="checkbox"
                    checked={roleIds.includes(role.id)}
                    onChange={() => setRoleIds((current) =>
                      current.includes(role.id)
                        ? current.filter((value) => value !== role.id)
                        : [...current, role.id])}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {dialog.kind === "assign-permissions" && !loadingUser && (
          <div className="space-y-2">
            <p className={labelClass}>Direct permissions</p>
            {permissionRows.length === 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No direct grants. This account inherits everything from its roles.
              </p>
            )}
            {permissionRows.map((row, index) => (
              <div key={row.permissionId} className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
                <code className="flex-1 truncate text-xs text-gray-800 dark:text-gray-200">{row.code}</code>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    checked={Boolean(row.isDenied)}
                    onChange={() => setPermissionRows((current) =>
                      current.map((item, position) =>
                        position === index ? { ...item, isDenied: !item.isDenied } : item))}
                    className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                  />
                  Deny
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${row.code}`}
                  onClick={() => setPermissionRows((current) => current.filter((_, position) => position !== index))}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-700"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {dialog.kind === "reset-password" && (
          issued ? (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-800 dark:bg-green-900/20">
              <p className="text-xs text-green-800 dark:text-green-300">
                Temporary password — copy it now, it is not shown again.
              </p>
              <code className="mt-1 block break-all text-sm font-semibold text-green-900 dark:text-green-200">{issued}</code>
            </div>
          ) : (
            <label className="block">
              <span className={labelClass}>New password (leave blank to generate one)</span>
              <input type="text" className={inputClass} value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
          )
        )}

        {!issued && (reasonMeta || ["edit", "assign-role", "assign-permissions", "reset-password"].includes(dialog.kind)) && (
          <label className="block">
            <span className={labelClass}>Reason{reasonMeta?.required ? " *" : " (optional)"}</span>
            <textarea
              rows={2}
              className={inputClass}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={reasonMeta?.required ? "At least 5 characters" : ""}
            />
          </label>
        )}

        {issued && (
          <div className="flex justify-end">
            <Button onClick={onDone}>Done</Button>
          </div>
        )}
      </div>
    </Modal>
  );
}

export default function AccessControlUsers() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [meta, setMeta] = useState({ page: 1, perPage: 25, total: 0, administrationReady: true });
  const [options, setOptions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState(BLANK_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState({ by: "name", dir: "asc" });
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);

  const [selected, setSelected] = useState([]);
  const [drawerId, setDrawerId] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useMemo(() => ({
    ...filters,
    search: debouncedSearch,
    sortBy: sort.by,
    sortDir: sort.dir,
    page,
    perPage,
  }), [filters, debouncedSearch, sort, page, perPage]);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    adminUserApi
      .list(query, token, tokenType)
      .then((res) => {
        if (!active) return;
        setRows(res?.data ?? []);
        setSummary(res?.summary ?? null);
        setMeta(res?.meta ?? { page: 1, perPage, total: 0, administrationReady: true });
      })
      .catch((err) => { if (active) toast.error(err.message || "Could not load users"); })
      .finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [query, token, tokenType, refreshKey, perPage]);

  useEffect(() => {
    if (!token) return undefined;

    let active = true;

    adminUserApi
      .filterOptions(token, tokenType)
      .then((res) => { if (active) setOptions(res?.data ?? null); })
      .catch(() => { if (active) setOptions(null); });

    return () => { active = false; };
  }, [token, tokenType]);

  // The skeleton is raised from whichever handler changes the query, because a
  // setState in the fetching effect's body cascades an extra render.
  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((value) => value + 1);
  }, []);

  const setFilter = (key) => (event) => {
    setLoading(true);
    setPage(1);
    setFilters((current) => ({ ...current, [key]: event.target.value }));
  };

  const changeSearch = (value) => {
    setLoading(true);
    setPage(1);
    setSearch(value);
  };

  const goToPage = (value) => {
    setLoading(true);
    setPage(value);
  };

  const clearFilters = () => {
    setLoading(true);
    setFilters(BLANK_FILTERS);
    setSearch("");
    setPage(1);
  };

  const sortBy = (key) => {
    setLoading(true);
    setSort((current) =>
      current.by === key
        ? { by: key, dir: current.dir === "asc" ? "desc" : "asc" }
        : { by: key, dir: "asc" });
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(Boolean).length;
  const allSelected = rows.length > 0 && selected.length === rows.length;

  const toggleAll = () => setSelected(allSelected ? [] : rows.map((row) => row.id));

  const toggleOne = (id) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  const runAction = (kind, target) => {
    if (kind === "view" || kind === "audit") {
      setDrawerId(target.id);
      return;
    }
    setDialog({ kind, user: target });
  };

  const runBulk = (action) => {
    if (!selected.length) {
      toast.error("Select at least one user first.");
      return;
    }
    setDialog({ kind: `bulk-${action}`, ids: selected });
  };

  const download = async (format) => {
    try {
      const blob = await adminUserApi.export(query, format, token, tokenType);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `access-control-users.${format === "excel" ? "xls" : "csv"}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err.message || "Export failed");
    }
  };

  const cards = [
    { title: "Total Users", value: summary?.total ?? 0, icon: <UsersIcon size={16} />, color: "blue" },
    { title: "Active", value: summary?.active ?? 0, icon: <UserCheck size={16} />, color: "green" },
    { title: "Inactive", value: summary?.inactive ?? 0, icon: <UserX size={16} />, color: "yellow" },
    { title: "Locked", value: summary?.locked ?? 0, icon: <Lock size={16} />, color: "red" },
    { title: "Super Admin", value: summary?.superAdmin ?? 0, icon: <ShieldCheck size={16} />, color: "purple" },
    { title: "Admin", value: summary?.admin ?? 0, icon: <Shield size={16} />, color: "blue" },
    { title: "HR", value: summary?.hr ?? 0, icon: <Briefcase size={16} />, color: "purple" },
    { title: "Employee", value: summary?.employee ?? 0, icon: <UserIcon size={16} />, color: "green" },
    { title: "Agent", value: summary?.agent ?? 0, icon: <Headset size={16} />, color: "yellow" },
  ];

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <Breadcrumb />

      {meta.administrationReady === false && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
          <p className="text-sm text-amber-800 dark:text-amber-300">
            Lock, unlock, activate and deactivate are unavailable: this database has not yet run the
            user administration migration. Everything else on this page works.
          </p>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-9">
        {cards.map((card) => <SummaryTile key={card.title} {...card} />)}
      </div>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <SearchBar
            className="w-full lg:w-[350px] lg:flex-none"
            value={search}
            onChange={changeSearch}
            placeholder="Search name, employee ID, username, email…"
          />

          <div className="flex flex-wrap gap-2 lg:ml-auto">
            <Button variant="secondary" onClick={() => setShowFilters((value) => !value)}>
              <Filter size={16} /> Filters{activeFilterCount ? ` (${activeFilterCount})` : ""}
            </Button>
            {(activeFilterCount > 0 || search) && (
              <Button variant="ghost" onClick={clearFilters}><X size={16} /> Clear</Button>
            )}
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
            <Button variant="secondary" onClick={() => download("csv")}><Download size={16} /> CSV</Button>
            <Button variant="secondary" onClick={() => download("excel")}><Download size={16} /> Excel</Button>
            {can("admin.user.create") && (
              <Button onClick={() => setDialog({ kind: "create" })}><Plus size={16} /> New User</Button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 grid gap-3 border-t border-gray-200 pt-4 dark:border-gray-700 sm:grid-cols-2 lg:grid-cols-4">
            <label className="block">
              <span className={labelClass}>Name</span>
              <input type="text" className={inputClass} value={filters.name} onChange={setFilter("name")} />
            </label>
            <label className="block">
              <span className={labelClass}>Employee ID</span>
              <input type="text" className={inputClass} value={filters.empCode} onChange={setFilter("empCode")} />
            </label>
            <label className="block">
              <span className={labelClass}>Email</span>
              <input type="text" className={inputClass} value={filters.email} onChange={setFilter("email")} />
            </label>
            <label className="block">
              <span className={labelClass}>Mobile</span>
              <input type="text" className={inputClass} value={filters.mobile} onChange={setFilter("mobile")} />
            </label>

            <label className="block">
              <span className={labelClass}>Department</span>
              <select className={inputClass} value={filters.department} onChange={setFilter("department")}>
                <option value="">All</option>
                {(options?.departments ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Designation</span>
              <select className={inputClass} value={filters.designation} onChange={setFilter("designation")}>
                <option value="">All</option>
                {(options?.designations ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Branch</span>
              <select className={inputClass} value={filters.branch} onChange={setFilter("branch")}>
                <option value="">All</option>
                {(options?.branches ?? []).map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Role</span>
              <select className={inputClass} value={filters.roleId} onChange={setFilter("roleId")}>
                <option value="">All</option>
                {(options?.roles ?? []).map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}
              </select>
            </label>

            <label className="block">
              <span className={labelClass}>Status</span>
              <select className={inputClass} value={filters.status} onChange={setFilter("status")}>
                <option value="">All</option>
                {(options?.statuses ?? ["ACTIVE", "INACTIVE", "LOCKED", "DELETED"]).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>User Type</span>
              <select className={inputClass} value={filters.userType} onChange={setFilter("userType")}>
                <option value="">All</option>
                {(options?.userTypes ?? Object.keys(USER_TYPE_LABEL)).map((item) => (
                  <option key={item} value={item}>{USER_TYPE_LABEL[item] ?? item}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Created from</span>
              <input type="date" className={inputClass} value={filters.createdFrom} onChange={setFilter("createdFrom")} />
            </label>
            <label className="block">
              <span className={labelClass}>Created to</span>
              <input type="date" className={inputClass} value={filters.createdTo} onChange={setFilter("createdTo")} />
            </label>

            <label className="flex items-center gap-2 sm:col-span-2 lg:col-span-4">
              <input
                type="checkbox"
                checked={Boolean(filters.includeSuperAdmins)}
                onChange={(event) => {
                  setLoading(true);
                  setPage(1);
                  setFilters((current) => ({
                    ...current,
                    includeSuperAdmins: event.target.checked ? "1" : "",
                  }));
                }}
                className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-200">
                Show super admin accounts
                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                  (platform identities, hidden by default)
                </span>
              </span>
            </label>
          </div>
        )}
      </Card>

      {selected.length > 0 && (
        <Card className="border-brand-200 dark:border-brand-800">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-2 text-sm font-medium text-gray-700 dark:text-gray-200">
              {selected.length} selected
            </span>
            {can("admin.user.update") && (
              <>
                <Button size="sm" variant="secondary" onClick={() => runBulk("activate")}>Activate</Button>
                <Button size="sm" variant="secondary" onClick={() => runBulk("deactivate")}>Deactivate</Button>
              </>
            )}
            {can("admin.user.assign_role") && (
              <Button size="sm" variant="secondary" onClick={() => runBulk("assign-role")}>Assign Role</Button>
            )}
            {can("admin.user.lock") && <Button size="sm" variant="secondary" onClick={() => runBulk("lock")}>Lock</Button>}
            {can("admin.user.unlock") && <Button size="sm" variant="secondary" onClick={() => runBulk("unlock")}>Unlock</Button>}
            {can("admin.user.delete") && <Button size="sm" variant="danger" onClick={() => runBulk("delete")}>Delete</Button>}
            <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear selection</Button>
          </div>
        </Card>
      )}

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable rows={8} /></div>}

        {!loading && rows.length === 0 && (
          <p className="p-10 text-center text-sm text-gray-500 dark:text-gray-400">
            No users match these filters.
          </p>
        )}

        {!loading && rows.length > 0 && (
          <div className="w-full max-w-full overflow-auto max-h-[calc(100vh-320px)] min-h-[240px]">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="sticky top-0 z-10 bg-white dark:bg-gray-800">
                <tr className="border-b border-gray-200 text-left dark:border-gray-700">
                  <th scope="col" className="w-10 px-3 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all rows"
                      checked={allSelected}
                      onChange={toggleAll}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Photo</th>
                  {[["empCode", "Employee ID"], ["name", "Full Name"]].map(([key, label]) => (
                    <th key={key} scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">
                      <button type="button" onClick={() => sortBy(key)} className="inline-flex items-center gap-1 hover:text-brand-600">
                        {label}{sort.by === key ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Username</th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Email</th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Mobile</th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Department</th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Designation</th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Branch</th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Role</th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">Status</th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">
                    <button type="button" onClick={() => sortBy("lastLoginAt")} className="inline-flex items-center gap-1 hover:text-brand-600">
                      Last Login{sort.by === "lastLoginAt" ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold text-gray-700 dark:text-gray-200">
                    <button type="button" onClick={() => sortBy("createdAt")} className="inline-flex items-center gap-1 hover:text-brand-600">
                      Created{sort.by === "createdAt" ? (sort.dir === "asc" ? " ↑" : " ↓") : ""}
                    </button>
                  </th>
                  <th scope="col" className="px-3 py-3 text-right font-semibold text-gray-700 dark:text-gray-200">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 dark:border-gray-700/60">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${row.name}`}
                        checked={selected.includes(row.id)}
                        onChange={() => toggleOne(row.id)}
                        className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </td>
                    <td className="px-3 py-2.5"><Avatar user={row} /></td>
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700 dark:text-gray-300">{row.empCode || "—"}</td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDrawerId(row.id)}
                        className="font-medium text-gray-900 hover:text-brand-600 dark:text-gray-100 dark:hover:text-brand-400"
                      >
                        {row.name}
                      </button>
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{row.username || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{row.email || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{row.mobile || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{row.department || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{row.designation || "—"}</td>
                    <td className="px-3 py-2.5 text-gray-600 dark:text-gray-400">{row.branch || "—"}</td>
                    <td className="px-3 py-2.5"><Badge variant="blue">{row.roleLabel}</Badge></td>
                    <td className="px-3 py-2.5">
                      <Badge variant={STATUS_TONE[row.status] ?? "gray"}>{row.status}</Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">{formatDate(row.lastLoginAt, true)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-500 dark:text-gray-400">{formatDate(row.createdAt)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <RowMenu user={row} can={can} onAction={runAction} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {!loading && (
          <div className="px-4">
            <Pagination
              current={meta.page}
              total={meta.total}
              pageSize={meta.perPage}
              onChange={goToPage}
              onPageSizeChange={(size) => { setLoading(true); setPerPage(size); setPage(1); }}
            />
          </div>
        )}
      </Card>

      {drawerId && (
        <DetailDrawer
          key={drawerId}
          userId={drawerId}
          token={token}
          tokenType={tokenType}
          onClose={() => setDrawerId(null)}
        />
      )}

      {dialog && (
        <ActionDialog
          key={`${dialog.kind}-${dialog.user?.id ?? "bulk"}`}
          dialog={dialog}
          options={options}
          token={token}
          tokenType={tokenType}
          busy={busy}
          setBusy={setBusy}
          onDone={() => { setDialog(null); setSelected([]); reload(); }}
          onCancel={() => setDialog(null)}
        />
      )}
    </div>
  );
}
