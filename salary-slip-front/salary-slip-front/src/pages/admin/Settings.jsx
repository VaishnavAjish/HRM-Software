import { useState, useMemo } from "react";
import {
  Save,
  Building2,
  Bell,
  Shield,
  Users,
  Plus,
  X,
  Trash2,
  Search,
  ChevronDown,
  UserCheck,
  UserX,
  Crown,
  Settings2,
} from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../context/AuthContext";
import { departments } from "../../data/mockData";

/* ─── shared styles ─── */
const inputCls =
  "w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition";
const selectCls =
  "w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent transition";

/* ─── Tab definitions ─── */
const TABS = [
  { id: "users", label: "User Management", icon: Users },
  { id: "company", label: "Company", icon: Building2 },
  { id: "notifs", label: "Notifications", icon: Bell },
];

/* ─── Add User Modal ─── */
function AddUserModal({ onClose, onAdd, existingCodes }) {
  const [form, setForm] = useState({
    name: "",
    empCode: "",
    email: "",
    department: "Engineering",
    role: "employee",
  });
  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim() || !form.empCode.trim() || !form.email.trim()) {
      toast.error("Name, Emp Code and Email are required");
      return;
    }
    if (existingCodes.has(form.empCode)) {
      toast.error("Emp Code already exists");
      return;
    }
    onAdd(form);
    toast.success(`${form.name} added successfully`);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-md animate-in">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Add New User
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              They can log in with Emp Code + password123
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Full Name *
            </label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Raj Kumar"
              className={inputCls}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                Emp Code *
              </label>
              <input
                value={form.empCode}
                onChange={(e) => set("empCode", e.target.value.toUpperCase())}
                placeholder="EMP031"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
                Role
              </label>
              <div className="relative">
                <select
                  value={form.role}
                  onChange={(e) => set("role", e.target.value)}
                  className={selectCls}
                >
                  <option value="employee">Employee</option>
                  <option value="admin">Admin</option>
                </select>
                <ChevronDown
                  size={14}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Email *
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="emp@nidhiimpex.com"
              className={inputCls}
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">
              Department
            </label>
            <div className="relative">
              <select
                value={form.department}
                onChange={(e) => set("department", e.target.value)}
                className={selectCls}
              >
                {departments.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
              <ChevronDown
                size={14}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 bg-brand-50 dark:bg-brand-900/20 rounded-lg">
            <Shield size={13} className="text-brand-500 flex-shrink-0" />
            <p className="text-xs text-brand-600 dark:text-brand-300">
              Default password:{" "}
              <span className="font-mono font-bold">password123</span>
            </p>
          </div>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 text-sm rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold transition-colors shadow-sm shadow-brand-600/30"
            >
              Add User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Toggle switch ─── */
function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${value ? "bg-brand-600" : "bg-gray-200 dark:bg-gray-600"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${value ? "translate-x-6" : "translate-x-1"}`}
      />
    </button>
  );
}

/* ─── Form field row ─── */
function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 py-4 border-b border-gray-50 dark:border-gray-700/60 last:border-0">
      <div className="sm:w-52 flex-shrink-0">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {label}
        </p>
        {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/* ══════════════════════════════════════════════
   Main Settings Page
══════════════════════════════════════════════ */
export default function Settings() {
  const {
    users,
    user: currentUser,
    updateUserRole,
    addUser,
    removeUser,
  } = useAuth();
  const [activeTab, setActiveTab] = useState("users");
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [roleFilter, setRoleFilter] = useState("all");

  const [company, setCompany] = useState({
    name: "Nidhi Impex",
    email: "hr@nidhiimpex.com",
    phone: "+91 11 2345 6789",
    address: "India",
    website: "www.nidhiimpex.com",
    currency: "INR",
  });
  const [notifs, setNotifs] = useState({
    salaryEmail: true,
    attendanceAlert: true,
    leaveRequest: false,
    weeklyReport: true,
  });

  const userList = useMemo(
    () =>
      Object.values(users).sort((a, b) => a.empCode.localeCompare(b.empCode)),
    [users],
  );

  const filtered = useMemo(
    () =>
      userList.filter((u) => {
        const q = search.toLowerCase();
        const matchSearch =
          !q ||
          u.name.toLowerCase().includes(q) ||
          u.empCode.toLowerCase().includes(q) ||
          (u.department || "").toLowerCase().includes(q);
        const matchRole = roleFilter === "all" || u.role === roleFilter;
        return matchSearch && matchRole;
      }),
    [userList, search, roleFilter],
  );

  const stats = useMemo(
    () => ({
      total: userList.length,
      admins: userList.filter((u) => u.role === "admin").length,
      employees: userList.filter((u) => u.role === "employee").length,
    }),
    [userList],
  );

  const existingCodes = useMemo(
    () => new Set(userList.map((u) => u.empCode)),
    [userList],
  );

  const handleRoleChange = (empCode, newRole) => {
    updateUserRole(empCode, newRole);
    toast.success(`Role updated to ${newRole}`);
  };

  const handleRemove = (empCode) => {
    if (empCode === currentUser?.empCode) {
      toast.error("Can't remove your own account");
      return;
    }
    if (empCode === "ADM001") {
      toast.error("Can't remove the main admin");
      return;
    }
    if (
      window.confirm(
        `Remove ${users[empCode]?.name}? They will lose login access.`,
      )
    ) {
      removeUser(empCode);
      toast.success("User removed");
    }
  };

  return (
    <div className="space-y-5">
      {/* ── Page header + Tab bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-brand-600 flex items-center justify-center shadow-sm shadow-brand-600/40">
            <Settings2 size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Settings
            </h1>
            <p className="text-xs text-gray-400">
              Manage users, company info and preferences
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 p-1 rounded-xl">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === id
                  ? "bg-white dark:bg-gray-700 text-brand-600 dark:text-brand-400 shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              <Icon size={15} />
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══ USER MANAGEMENT TAB ══ */}
      {activeTab === "users" && (
        <div className="space-y-4">
          {/* Stats cards */}
          <div className="grid grid-cols-3 xl:grid-cols-3 gap-3">
            {[
              {
                label: "Total Users",
                value: stats.total,
                icon: Users,
                color: "blue",
              },
              {
                label: "Admins",
                value: stats.admins,
                icon: Crown,
                color: "purple",
              },
              {
                label: "Employees",
                value: stats.employees,
                icon: UserCheck,
                color: "green",
              },
            ].map(({ label, value, icon: Icon, color }) => (
              <div
                key={label}
                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {label}
                    </p>
                    <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">
                      {value}
                    </p>
                  </div>
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center
                    ${color === "blue" ? "bg-brand-50 dark:bg-brand-900/30" : ""}
                    ${color === "purple" ? "bg-purple-50 dark:bg-purple-900/30" : ""}
                    ${color === "green" ? "bg-green-50 dark:bg-green-900/30" : ""}`}
                  >
                    <Icon
                      size={16}
                      className={
                        color === "blue"
                          ? "text-brand-600"
                          : color === "purple"
                            ? "text-purple-600"
                            : "text-green-600"
                      }
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Search + Filter + Add */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              {/* Search */}
              <div className="flex items-center gap-2 flex-1 bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2">
                <Search size={14} className="text-gray-400 flex-shrink-0" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, emp code, department…"
                  className="bg-transparent text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none w-full"
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>

              {/* Role filter */}
              <div className="relative">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-2 text-sm bg-gray-50 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                >
                  <option value="all">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="employee">Employee</option>
                </select>
                <ChevronDown
                  size={13}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                />
              </div>

              {/* Add button */}
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm shadow-brand-600/30 whitespace-nowrap"
              >
                <Plus size={15} /> Add User
              </button>
            </div>

            {/* Result count */}
            {search || roleFilter !== "all" ? (
              <div className="px-4 py-2 bg-brand-50/60 dark:bg-brand-900/10 border-b border-brand-100 dark:border-brand-900/30">
                <p className="text-xs text-brand-600 dark:text-brand-400 font-medium">
                  {filtered.length} result{filtered.length !== 1 ? "s" : ""}{" "}
                  found
                </p>
              </div>
            ) : null}

            {/* Table */}
            <div className="overflow-x-auto max-h-[calc(100vh-350px)] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700/40 sticky top-0 z-10">
                  <tr>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Employee
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Emp Code
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">
                      Department
                    </th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                      Role
                    </th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-700/50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center">
                        <UserX
                          size={32}
                          className="text-gray-300 dark:text-gray-600 mx-auto mb-2"
                        />
                        <p className="text-sm text-gray-400">
                          No users match your search
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filtered.map((u) => (
                      <tr
                        key={u.empCode}
                        className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30 transition-colors group"
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0
                            ${u.role === "admin" ? "bg-purple-600" : "bg-brand-600"}`}
                            >
                              {u.name
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white leading-tight">
                                {u.name}
                              </p>
                              <p className="text-xs text-gray-400 truncate max-w-[140px]">
                                {u.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 px-2 py-1 rounded-md">
                            {u.empCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs hidden md:table-cell">
                          {u.department}
                        </td>
                        <td className="px-4 py-3">
                          {u.empCode === "ADM001" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              <Crown size={10} /> Admin
                            </span>
                          ) : (
                            <div className="relative inline-block">
                              <select
                                value={u.role}
                                onChange={(e) =>
                                  handleRoleChange(u.empCode, e.target.value)
                                }
                                className={`appearance-none pl-2.5 pr-6 py-1 text-xs rounded-full border font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer transition-colors
                                ${
                                  u.role === "admin"
                                    ? "bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-700 text-purple-700 dark:text-purple-300"
                                    : "bg-gray-100 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300"
                                }`}
                              >
                                <option value="employee">Employee</option>
                                <option value="admin">Admin</option>
                              </select>
                              <ChevronDown
                                size={10}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-current opacity-60 pointer-events-none"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {u.empCode !== "ADM001" &&
                            u.empCode !== currentUser?.empCode && (
                              <button
                                onClick={() => handleRemove(u.empCode)}
                                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                              >
                                <Trash2 size={14} />
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
      )}

      {/* ══ COMPANY TAB ══ */}
      {activeTab === "company" && (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          {/* Left card — main fields */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <Building2 size={18} className="text-brand-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Company Information
              </h3>
            </div>
            <div className="px-5 divide-y divide-gray-50 dark:divide-gray-700/60">
              {[
                { key: "name", label: "Company Name", hint: "" },
                {
                  key: "email",
                  label: "HR Email",
                  hint: "Used for system notifications",
                },
                { key: "phone", label: "Phone", hint: "" },
                { key: "address", label: "Address", hint: "" },
                { key: "website", label: "Website", hint: "" },
              ].map(({ key, label, hint }) => (
                <Field key={key} label={label} hint={hint}>
                  <input
                    value={company[key]}
                    onChange={(e) =>
                      setCompany((p) => ({ ...p, [key]: e.target.value }))
                    }
                    className={inputCls}
                  />
                </Field>
              ))}
              <Field label="Currency" hint="Used in all salary displays">
                <div className="relative">
                  <select
                    value={company.currency}
                    onChange={(e) =>
                      setCompany((p) => ({ ...p, currency: e.target.value }))
                    }
                    className={selectCls}
                  >
                    <option value="INR">INR (₹)</option>
                    <option value="USD">USD ($)</option>
                    <option value="EUR">EUR (€)</option>
                  </select>
                  <ChevronDown
                    size={14}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
                  />
                </div>
              </Field>
            </div>
            <div className="px-5 py-4 bg-gray-50 dark:bg-gray-700/30 flex justify-end rounded-b-xl">
              <button
                onClick={() => toast.success("Company info saved")}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-brand-600/30"
              >
                <Save size={14} /> Save Changes
              </button>
            </div>
          </div>

          {/* Right card — preview */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Preview
            </p>
            <div className="flex items-center gap-4 mb-6">
              <div className="w-14 h-14 rounded-2xl bg-brand-600 flex items-center justify-center text-white text-xl font-bold shadow-sm shadow-brand-600/30">
                {company.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <p className="font-bold text-gray-900 dark:text-white text-lg leading-tight">
                  {company.name || "—"}
                </p>
                <p className="text-sm text-gray-400">
                  {company.website || "—"}
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {[
                { label: "HR Email", value: company.email },
                { label: "Phone", value: company.phone },
                { label: "Address", value: company.address },
                { label: "Currency", value: company.currency },
              ].map(({ label, value }) => (
                <div
                  key={label}
                  className="flex justify-between text-sm py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                >
                  <span className="text-gray-400">{label}</span>
                  <span className="font-medium text-gray-700 dark:text-gray-200">
                    {value || "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ NOTIFICATIONS TAB ══ */}
      {activeTab === "notifs" && (
        <div className="grid lg:grid-cols-2 gap-5 items-start">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 dark:border-gray-700">
              <Bell size={18} className="text-brand-600" />
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Notifications
              </h3>
            </div>
            <div className="px-5 divide-y divide-gray-50 dark:divide-gray-700/60">
              {[
                {
                  key: "salaryEmail",
                  label: "Salary Notifications",
                  hint: "Email alert when monthly salary is processed",
                },
                {
                  key: "attendanceAlert",
                  label: "Attendance Alerts",
                  hint: "Notify when employee attendance drops below 75%",
                },
                {
                  key: "leaveRequest",
                  label: "Leave Requests",
                  hint: "Get notified on every new leave request",
                },
                {
                  key: "weeklyReport",
                  label: "Weekly Report",
                  hint: "Receive automated weekly summary every Monday",
                },
              ].map(({ key, label, hint }) => (
                <Field key={key} label={label} hint={hint}>
                  <Toggle
                    value={notifs[key]}
                    onChange={(v) => setNotifs((p) => ({ ...p, [key]: v }))}
                  />
                </Field>
              ))}
            </div>
            <div className="px-5 py-4 bg-gray-50 dark:bg-gray-700/30 flex justify-end rounded-b-xl">
              <button
                onClick={() => toast.success("Notification preferences saved")}
                className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm shadow-brand-600/30"
              >
                <Save size={14} /> Save Changes
              </button>
            </div>
          </div>

          {/* Summary card */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">
              Active Alerts
            </p>
            <div className="space-y-3">
              {[
                { key: "salaryEmail", label: "Salary Notifications" },
                { key: "attendanceAlert", label: "Attendance Alerts" },
                { key: "leaveRequest", label: "Leave Requests" },
                { key: "weeklyReport", label: "Weekly Report" },
              ].map(({ key, label }) => (
                <div
                  key={key}
                  className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                >
                  <span className="text-sm text-gray-600 dark:text-gray-300">
                    {label}
                  </span>
                  <span
                    className={`text-xs font-semibold px-2.5 py-1 rounded-full ${notifs[key] ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400" : "bg-gray-100 dark:bg-gray-700 text-gray-400"}`}
                  >
                    {notifs[key] ? "On" : "Off"}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-4">
              {Object.values(notifs).filter(Boolean).length} of 4 notifications
              enabled
            </p>
          </div>
        </div>
      )}

      {showAdd && (
        <AddUserModal
          onClose={() => setShowAdd(false)}
          onAdd={addUser}
          existingCodes={existingCodes}
        />
      )}
    </div>
  );
}
