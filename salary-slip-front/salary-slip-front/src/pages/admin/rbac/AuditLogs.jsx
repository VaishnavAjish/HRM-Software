import { Fragment, useEffect, useState } from "react";
import { ScrollText, ChevronDown, ChevronRight, ShieldAlert } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../../components/ui/Badge";
import { rbacApi } from "../../../utils/api";
import { useAuth } from "../../../context/AuthContext";

const ACTION_TONE = { CREATE: "green", UPDATE: "yellow", DELETE: "red", ASSIGN: "blue", REVOKE: "gray" };

const LEVEL_LABEL = { 0: "Super Admin", 1: "Admin", 3: "Employee", 4: "Agent" };
function levelOf(role) {
  const n = Number(role);
  return n in LEVEL_LABEL ? n : 3;
}

// Only show RBAC modules in the filter dropdown
const MODULES = [
  "Roles",
  "Permission Matrix",
  "User Role Assignment",
  "User Access Level",
  "Page Permissions",
  "Menu Permissions",
  "Module Permissions",
  "Action Permissions",
];

function diffLines(oldValue, newValue) {
  if (!oldValue && !newValue) return [];
  const keys = new Set([...Object.keys(oldValue || {}), ...Object.keys(newValue || {})]);
  return Array.from(keys).map((key) => ({
    key,
    before: oldValue?.[key],
    after: newValue?.[key],
  }));
}

function formatVal(v) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function AuditLogs() {
  const { user } = useAuth();
  const [logs, setLogs] = useState([]);
  const [meta, setMeta] = useState({ page: 1, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [module, setModule] = useState("");
  const [action, setAction] = useState("");
  const [expanded, setExpanded] = useState(null);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
    try {
      const filters = {};
      if (module) filters.module = module;
      if (action) filters.action = action;
      const res = await rbacApi.getAuditLogs(user?.accessToken, user?.tokenType, page, 25, filters);
      if (res.status) {
        setLogs(res.data || []);
        setMeta(res.meta || { page: 1, totalPages: 1 });
      }
    } catch (err) {
      toast.error(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, action]);

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
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ScrollText className="text-brand-600" size={22} />
          Audit Trails
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          Every RBAC and settings change — who, what, from which IP, and when.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          value={module}
          onChange={(e) => setModule(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
        >
          <option value="">All modules</option>
          {MODULES.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={action}
          onChange={(e) => setAction(e.target.value)}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white"
        >
          <option value="">All actions</option>
          {Object.keys(ACTION_TONE).map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3 font-medium w-8"></th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Module</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">IP Address</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                    No audit activity recorded yet.
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const isOpen = expanded === log.id;
                  const changes = diffLines(log.old_value, log.new_value);
                  return (
                    <Fragment key={log.id}>
                      <tr
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : log.id)}
                      >
                        <td className="px-4 py-3 text-gray-400">
                          {changes.length > 0 && (isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={ACTION_TONE[log.action] || "gray"}>{log.action}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-700 dark:text-gray-200">{log.module}</td>
                        <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                          {log.user ? (
                            <div className="space-y-0.5">
                              <div><span className="font-semibold text-gray-500 dark:text-gray-400">ID:</span> {log.user.id}</div>
                              <div><span className="font-semibold text-gray-500 dark:text-gray-400">Name:</span> {log.user.name}</div>
                              <div>
                                <span className="font-semibold text-gray-500 dark:text-gray-400">Role:</span>{" "}
                                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">
                                  {LEVEL_LABEL[levelOf(log.user.role)] || "—"}
                                </span>
                              </div>
                            </div>
                          ) : (
                            <span className="italic text-gray-400">System</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                          {log.ip_address ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                      {isOpen && changes.length > 0 && (
                        <tr className="bg-gray-50 dark:bg-gray-900/40">
                          <td colSpan={6} className="px-4 py-3">
                            <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                              <table className="w-full text-xs">
                                <thead className="bg-gray-100 dark:bg-gray-800 text-left uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                  <tr>
                                    <th className="px-3 py-2 font-medium">Field</th>
                                    <th className="px-3 py-2 font-medium">Before</th>
                                    <th className="px-3 py-2 font-medium">After</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                  {changes.map((c) => (
                                    <tr key={c.key}>
                                      <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-200">{c.key}</td>
                                      <td className="px-3 py-1.5 text-red-600 dark:text-red-400 font-mono">{formatVal(c.before)}</td>
                                      <td className="px-3 py-1.5 text-green-600 dark:text-green-400 font-mono">{formatVal(c.after)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                              {log.user_agent ?? ""}
                            </p>
                          </td>
                        </tr>
                      )}
                    </Fragment>
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
                onClick={() => fetchLogs(meta.page - 1)}
                className="px-2 py-1 rounded disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                Prev
              </button>
              <button
                disabled={meta.page >= meta.totalPages}
                onClick={() => fetchLogs(meta.page + 1)}
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
