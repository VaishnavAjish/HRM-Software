import { useEffect, useState } from "react";
import { Search, Lock, Unlock, Trash2, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import { rbacApi, salaryApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";

// The only four roles this system has.
const LEVEL_LABEL = { 0: "Super Admin", 1: "Admin", 3: "Employee", 4: "Agent" };
const LEVEL_TONE = { 0: "purple", 1: "yellow", 3: "gray", 4: "blue" };

function levelOf(role) {
  const n = Number(role);
  return n in LEVEL_LABEL ? n : 3;
}

export default function RbacUsers() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  const fetchUsers = async (page = 1) => {
    setLoading(true);
    try {
      const res = await rbacApi.getUserRoles(user?.accessToken, user?.tokenType, page, 15, search);
      if (res.status) {
        setUsers(res.data || []);
        setMeta(res.meta || { page: 1, totalPages: 1 });
      }
    } catch (err) {
      toast.error(err.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Users</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Every user in the system and their role. Admin levels are set from the Role Permission Matrix.
        </p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users..."
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 pl-9 pr-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
          />
        </div>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
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
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No users found.
                  </td>
                </tr>
              ) : (
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
              )}
            </tbody>
          </table>
        </div>

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
    </div>
  );
}
