import { Search, Lock, Unlock, Trash2, ShieldAlert, Plus } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { rbacApi, salaryApi, authApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";

// The only four roles this system has.
const LEVEL_LABEL = { 0: "Super Admin", 1: "Admin", 3: "Employee", 4: "Agent" };
const LEVEL_TONE = { 0: "purple", 1: "yellow", 3: "gray", 4: "blue" };

function levelOf(role) {
  const n = Number(role);
  return n in LEVEL_LABEL ? n : 3;
}

import { useEffect, useState } from "react";

export default function RbacUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("1,3,4"); // Default to All Accounts
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "1",
    company: "nidhi-impex",
    agentCompanies: { "nidhi-impex": true, "silver-star": false }
  });
  const [addLoading, setAddLoading] = useState(false);

  const fetchUsers = async (page = 1, currentRoleFilter = roleFilter) => {
    setLoading(true);
    try {
      const res = await rbacApi.getUserRoles(user?.accessToken, user?.tokenType, page, 15, search, currentRoleFilter);
      if (res.status) {
        const filtered = (res.data || []).filter((u) => Number(u.role) !== 0);
        setUsers(filtered);
        setMeta(res.meta || { page: 1, totalPages: 1 });
      }
    } catch (err) {
      toast.error(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1, roleFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchUsers(1);
  };

  const toggleStatus = async (targetUser) => {
    const nextStatus = targetUser.status === "0" || targetUser.status === 0 ? 1 : 0;
    try {
      const res = await salaryApi.editEmployee(targetUser.id, { status: nextStatus }, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success(nextStatus === 0 ? "User unlocked" : "User locked");
        fetchUsers(meta.page);
      } else {
        toast.error(res.message || "Failed to update status");
      }
    } catch (err) {
      toast.error(err.message || "Failed to update status");
    }
  };

  const deleteUser = async (targetUser) => {
    if (targetUser.id === user?.id) {
      toast.error("You can't delete your own account");
      return;
    }
    if (!window.confirm(`Delete ${targetUser.name}? They will lose login access.`)) return;
    try {
      const res = await salaryApi.deleteEmployee(targetUser.id, user?.accessToken, user?.tokenType);
      if (res.status) {
        toast.success(`${targetUser.name} deleted`);
        fetchUsers(meta.page);
      } else {
        toast.error(res.message || "Failed to delete user");
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete user");
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!addForm.name.trim() || !addForm.email.trim() || !addForm.password.trim()) {
      toast.error("All fields are required");
      return;
    }

    let selectedCompany = "";
    if (Number(addForm.role) === 1) {
      selectedCompany = addForm.company;
    } else if (Number(addForm.role) === 4) {
      const selected = [];
      if (addForm.agentCompanies["nidhi-impex"]) selected.push("nidhi-impex");
      if (addForm.agentCompanies["silver-star"]) selected.push("silver-star");
      
      if (selected.length === 0) {
        toast.error("Please select at least one company for the Agent");
        return;
      }
      selectedCompany = selected.join(",");
    }

    setAddLoading(true);
    try {
      const res = await authApi.register(
        {
          name: addForm.name,
          email: addForm.email,
          password: addForm.password,
          role: Number(addForm.role),
          company_code: selectedCompany,
        },
        user?.accessToken,
        user?.tokenType
      );
      if (res.status) {
        toast.success("User created successfully");
        setShowAddModal(false);
        setAddForm({
          name: "",
          email: "",
          password: "",
          role: "1",
          company: "nidhi-impex",
          agentCompanies: { "nidhi-impex": true, "silver-star": false }
        });
        fetchUsers(1);
      } else {
        toast.error(res.message || "Failed to create user");
      }
    } catch (err) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setAddLoading(false);
    }
  };

  if (user?.rawRole !== 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <ShieldAlert size={32} className="text-gray-300 dark:text-gray-600 mb-3" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Only a Super Admin can access RBAC.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Every user in the system and their role. Admin levels are set from the Role Permission Matrix.
          </p>
        </div>
        <Button onClick={() => setShowAddModal(true)} icon={<Plus size={16} />}>
          Add User
        </Button>
      </div>

      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 max-w-xs min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 outline-none focus:border-indigo-500"
        >
          <option value="1,4">Admins & Agents (RBAC)</option>
          <option value="1,3,4">All Accounts (Inc. Employees)</option>
          <option value="1">Admins Only</option>
          <option value="4">Agents Only</option>
          <option value="3">Employees Only</option>
        </select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">Loading...</p>
        ) : users.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">No users found.</p>
        ) : (
          <>
            {/* Mobile: stacked cards. Six columns (including two badges and an
                action pair) can't fit a phone width without clipping. */}
            <ul className="divide-y divide-gray-100 dark:divide-gray-700 md:hidden">
              {users.map((u) => {
                const isActive = u.status === "0" || u.status === 0;
                const isPending = u.status === "2" || u.status === 2;
                return (
                  <li key={u.id} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-white break-words">{u.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 break-all">{u.email}</p>
                      </div>
                      <div className="flex flex-shrink-0 gap-1">
                        <button
                          onClick={() => toggleStatus(u)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                          title={isActive ? "Lock user" : "Unlock user"}
                        >
                          {isActive ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                        <button
                          onClick={() => deleteUser(u)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant={LEVEL_TONE[levelOf(u.role)]}>{LEVEL_LABEL[levelOf(u.role)]}</Badge>
                      <Badge variant={isActive ? "green" : isPending ? "yellow" : "red"}>
                        {isActive ? "Active" : isPending ? "Pending" : "Inactive"}
                      </Badge>
                    </div>

                    <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">Emp Code</dt>
                        <dd className="text-gray-700 dark:text-gray-200">{u.emp_code || "—"}</dd>
                      </div>
                      <div>
                        <dt className="font-semibold text-gray-500 dark:text-gray-400">Department</dt>
                        <dd className="text-gray-700 dark:text-gray-200 break-words">{u.department || "—"}</dd>
                      </div>
                    </dl>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Emp Code</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {
                users.map((u) => {
                  const isActive = u.status === "0" || u.status === 0;
                  const isPending = u.status === "2" || u.status === 2;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{u.name}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.emp_code || "—"}</td>
                      <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{u.department || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge variant={LEVEL_TONE[levelOf(u.role)]}>{LEVEL_LABEL[levelOf(u.role)]}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={isActive ? "green" : isPending ? "yellow" : "red"}>
                          {isActive ? "Active" : isPending ? "Pending" : "Inactive"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => toggleStatus(u)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-900/20 transition-colors"
                            title={isActive ? "Lock user" : "Unlock user"}
                          >
                            {isActive ? <Lock size={16} /> : <Unlock size={16} />}
                          </button>
                          <button
                            onClick={() => deleteUser(u)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              }
            </tbody>
          </table>
            </div>
          </>
        )}

        {meta.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400">
            <span>
              Page {meta.page} of {meta.totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={meta.page <= 1}
                onClick={() => fetchUsers(meta.page - 1)}
                className="px-2 py-1 rounded disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Prev
              </button>
              <button
                disabled={meta.page >= meta.totalPages}
                onClick={() => fetchUsers(meta.page + 1)}
                className="px-2 py-1 rounded disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add New Admin/Agent User"
        size="md"
      >
        <form onSubmit={handleAddUser} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Full Name
            </label>
            <input
              type="text"
              required
              value={addForm.name}
              onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white outline-none focus:border-brand-500"
              placeholder="e.g. John Doe"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email ID (Login ID)
            </label>
            <input
              type="email"
              required
              value={addForm.email}
              onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white outline-none focus:border-brand-500"
              placeholder="e.g. john@company.com"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <input
              type="password"
              required
              value={addForm.password}
              onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white outline-none focus:border-brand-500"
              placeholder="Min 6 characters"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Role Type
            </label>
            <select
              value={addForm.role}
              onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white outline-none focus:border-brand-500"
            >
              <option value="1">Admin</option>
              <option value="4">Agent</option>
            </select>
          </div>

          {Number(addForm.role) === 1 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Company Access
              </label>
              <select
                value={addForm.company}
                onChange={(e) => setAddForm({ ...addForm, company: e.target.value })}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white outline-none focus:border-brand-500"
              >
                <option value="nidhi-impex">Nidhi Impex</option>
                <option value="silver-star">Silver Star</option>
              </select>
            </div>
          )}

          {Number(addForm.role) === 4 && (
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Company Access (Select one or both)
              </label>
              <div className="flex gap-6 mt-1">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.agentCompanies["nidhi-impex"]}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        agentCompanies: {
                          ...addForm.agentCompanies,
                          "nidhi-impex": e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  Nidhi Impex
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={addForm.agentCompanies["silver-star"]}
                    onChange={(e) =>
                      setAddForm({
                        ...addForm,
                        agentCompanies: {
                          ...addForm.agentCompanies,
                          "silver-star": e.target.checked,
                        },
                      })
                    }
                    className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  Silver Star
                </label>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-6">
            <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={addLoading}>
              {addLoading ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
