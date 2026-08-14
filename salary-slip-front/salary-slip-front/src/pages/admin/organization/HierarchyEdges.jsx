import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Plus, RefreshCw, Search, Loader2, Pencil, Trash2, Shield, GitBranch } from "lucide-react";
import Badge from "../../../components/ui/Badge";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import Modal from "../../../components/ui/Modal";
import { SkeletonTable } from "../../../components/ui/Skeleton";
import { useAuth } from "../../../context/AuthContext";
import { useAuthorization } from "../../../hooks/useAuthorization";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";
const labelClass = "mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400";

const STATUS_FILTERS = [
  { value: "ALL", label: "All" },
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
];

const EDGE_TYPES = [
  { value: "parent_child", label: "Parent-Child" },
  { value: "dotted_line", label: "Dotted Line" },
  { value: "matrix", label: "Matrix" },
  { value: "cross_functional", label: "Cross-Functional" },
];

function Th({ children, className = "" }) {
  return <th scope="col" className={`px-4 py-3 whitespace-nowrap ${className}`}>{children}</th>;
}

export default function HierarchyEdgesPage() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [hierarchyId, setHierarchyId] = useState("");
  const [edges, setEdges] = useState([]);
  const [hierarchies, setHierarchies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [dialog, setDialog] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    setRefreshKey((v) => v + 1);
  }, []);

  useEffect(() => {
    if (!token || !hierarchyId) return;
    let active = true;
    Promise.all([
      organizationApi.hierarchyEdges({ hierarchyId, status, search }, token, tokenType),
      organizationApi.hierarchies({ enterpriseId: undefined }, token, tokenType).catch(() => ({ data: [] })),
    ]).then(([edgesRes, hierarchiesRes]) => {
      if (!active) return;
      setEdges(edgesRes?.data ?? []);
      setHierarchies(hierarchiesRes?.data ?? []);
    }).catch((err) => toast.error(err.message || "Could not load hierarchy edges")).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, tokenType, hierarchyId, status, search, refreshKey]);

  const changeFilter = (setter) => (value) => { setLoading(true); setter(value); };

  const run = async (work, message, after = () => {}) => {
    setBusy(true);
    try { await work(); toast.success(message); after(); reload(); } catch (err) { toast.error(err.message || "That did not work"); } finally { setBusy(false); }
  };

  const save = (payload) => run(
    () => dialog?.id
      ? organizationApi.updateHierarchyEdge(hierarchyId, dialog.id, payload, token, tokenType)
      : organizationApi.createHierarchyEdge(hierarchyId, payload, token, tokenType),
    dialog?.id ? "Edge updated" : "Edge created",
  );

  const companyOptions = useMemo(() => hierarchies.map((h) => ({ id: h.id, name: h.name })), [hierarchies]);
  const canManage = can("org.hierarchy_edge.create") || can("org.hierarchy_edge.update");

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <GitBranch size={20} /> Hierarchy Edges
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Relationships between hierarchy nodes, defining the org structure connections.
        </p>
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              aria-label="Search edges"
              className={`${inputClass} w-64 pl-8`}
              placeholder="Search parent/child IDs…"
              value={search}
              onChange={(e) => changeFilter(setSearch)(e.target.value)}
            />
          </div>

          <select
            aria-label="Select hierarchy"
            className={`${inputClass} w-48`}
            value={hierarchyId || ""}
            onChange={(e) => { setHierarchyId(e.target.value); reload(); }}
          >
            <option value="">Select hierarchy</option>
            {hierarchies.map((h) => (
              <option key={h.id} value={h.id}>{h.name} ({h.code})</option>
            ))}
          </select>

          <select
            aria-label="Filter by status"
            className={`${inputClass} w-36`}
            value={status}
            onChange={(e) => changeFilter(setStatus)(e.target.value)}
          >
            {STATUS_FILTERS.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" onClick={reload}><RefreshCw size={16} /> Refresh</Button>
            {can("org.hierarchy_edge.create") && (
              <Button onClick={() => setDialog({})}><Plus size={16} /> Add Edge</Button>
            )}
          </div>
        </div>
      </Card>

      <Card padding={false}>
        {loading && <div className="p-4"><SkeletonTable rows={5} /></div>}
        {!loading && (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-bold uppercase tracking-wider text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
                <tr>
                  <Th>Parent Node ID</Th>
                  <Th>Child Node ID</Th>
                  <Th>Edge Type</Th>
                  <Th>Active</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                {edges.length === 0 && (
                  <tr><td colSpan={5} className="p-10 text-center text-gray-500 dark:text-gray-400">
                    No edges match these filters.
                  </td></tr>
                )}

                {edges.map((edge) => (
                  <tr key={edge.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-700/40">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{edge.parentNodeId || "—"}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{edge.childNodeId || "—"}</td>
                    <td className="px-4 py-3 capitalize text-gray-600 dark:text-gray-300">{edge.edgeType || "—"}</td>
                    <td className="px-4 py-3">
                      {edge.isActive === undefined ? (
                        <span className="text-gray-500">—</span>
                      ) : edge.isActive === true ? (
                        <Badge variant="green">Active</Badge>
                      ) : (
                        <Badge variant="red">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        {can("org.hierarchy_edge.update") && (
                          <Button size="sm" variant="ghost" onClick={() => setDialog(edge)}><Pencil size={14} /></Button>
                        )}
                        {can("org.hierarchy_edge.delete") && (
                          <Button
                            size="sm" variant="ghost"
                            onClick={() => run(() => organizationApi.deleteHierarchyEdge(hierarchyId, edge.id, token, tokenType), "Edge deleted")}
                          >
                            <Trash2 size={14} className="text-red-600 dark:text-red-400" />
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

      {!canManage && !loading && (
        <p className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
          <Shield size={13} className="text-gray-400" />
          Hierarchy edge management is restricted to administrators.
        </p>
      )}

      {dialog && (
        <Modal isOpen onClose={() => setDialog(null)} title={dialog?.id ? "Edit Edge" : "Add Edge"} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <label className="block"><span className={labelClass}>Parent Node ID *</span><input type="number" className={inputClass} onChange={(e) => setDialog({...dialog, parentNodeId: Number(e.target.value)})} /></label>
              <label className="block"><span className={labelClass}>Child Node ID *</span><input type="number" className={inputClass} onChange={(e) => setDialog({...dialog, childNodeId: Number(e.target.value)})} /></label>
              <label className="block"><span className={labelClass}>Edge Type</span>
                <select className={inputClass} onChange={(e) => setDialog({...dialog, edgeType: e.target.value})}>
                  <option value="">Select type</option>
                  {EDGE_TYPES.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                </select>
              </label>
              <label className="block"><span className={labelClass}>Active</span>
                <select className={inputClass} onChange={(e) => setDialog({...dialog, isActive: e.target.value === "true"})}>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </label>
            </div>
          </div>
          <footer className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
            <Button disabled={busy} onClick={() => save({ parentNodeId: dialog?.parentNodeId, childNodeId: dialog?.childNodeId, edgeType: dialog?.edgeType, isActive: dialog?.isActive })}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              Save
            </Button>
          </footer>
        </Modal>
      )}
    </div>
  );
}