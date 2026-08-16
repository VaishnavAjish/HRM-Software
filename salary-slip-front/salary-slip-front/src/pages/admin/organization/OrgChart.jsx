import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import { Loader2, Network, Download, Printer } from "lucide-react";
import Button from "../../../components/ui/Button";
import Card from "../../../components/ui/Card";
import { useAuth } from "../../../context/AuthContext";
import { organizationApi } from "../../../features/organization/services/organizationApi";

const CSV_HEADERS = ["id", "title", "type", "status", "depth", "parentId"];

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function flattenChartRows(chartData) {
  const nodes = chartData?.nodes || [];
  const edges = chartData?.edges || [];
  const parentOf = new Map();
  edges.forEach((e) => {
    parentOf.set(e.childNodeId ?? e.target, e.parentNodeId ?? e.source);
  });
  const depthCache = new Map();
  const depthOf = (id, seen = new Set()) => {
    if (depthCache.has(id)) return depthCache.get(id);
    if (seen.has(id)) return 0;
    seen.add(id);
    const parent = parentOf.get(id);
    const depth = parent === undefined || parent === null ? 0 : depthOf(parent, seen) + 1;
    depthCache.set(id, depth);
    return depth;
  };
  return nodes.map((n) => ({
    id: n.id,
    title: n.title ?? n.code ?? n.name ?? n.id,
    type: n.type ?? chartData?.chartType ?? "",
    status: n.isActive === false ? "Inactive" : n.isActive === undefined ? "—" : "Active",
    depth: depthOf(n.id),
    parentId: parentOf.get(n.id) ?? "",
  }));
}

function exportChartCsv(chartData) {
  const rows = flattenChartRows(chartData);
  const lines = [CSV_HEADERS.join(",")].concat(
    rows.map((row) => CSV_HEADERS.map((h) => csvEscape(row[h])).join(",")),
  );
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `org-chart-${chartData?.chartType || "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

function OrgChartCard({ chartData, loading }) {
  if (loading) {
    return (
      <Card padding={false}>
        <div className="p-4 text-center">
          <div className="flex justify-center gap-2">
            <Loader2 size={32} className="animate-spin text-gray-400" />
            <span className="text-sm text-gray-500 dark:text-gray-300">Loading chart…</span>
          </div>
        </div>
      </Card>
    );
  }

  if (!chartData?.nodes?.length) {
    return (
      <Card padding={false}>
        <div className="p-4 text-center text-gray-500 dark:text-gray-400">
          No chart data available.
        </div>
      </Card>
    );
  }

  const nodes = chartData.nodes;
  const edges = chartData.edges || [];

  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const adjacency = new Map();
  edges.forEach((e) => {
    adjacency.set(e.childNodeId ?? e.target, (adjacency.get(e.childNodeId ?? e.target) || []).concat({ parent: e.parentNodeId ?? e.source, edgeType: e.edgeType, isActive: e.isActive }));
  });

  const renderNode = (nodeId, depth = 0) => {
    const node = nodeMap.get(nodeId);
    if (!node) return null;

    const children = edges.filter((e) => (e.parentNodeId ?? e.source) === nodeId).map((e) => renderNode(e.childNodeId ?? e.target, depth + 1));

    return (
      <div
        key={nodeId}
        className={`
          p-3 bg-white dark:bg-gray-800 rounded-lg shadow-sm capitalize 
          ${node.isActive === false ? "opacity-50" : ""}
          ${node.isActive === undefined ? "opacity-70" : ""}
        `}
        style={{ marginLeft: depth * 30 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium">{node.title ?? node.code ?? node.name ?? node.id}</span>
          {node.isActive === undefined ? (
            <span className="text-xs text-gray-500">—</span>
          ) : node.isActive === false ? (
            <span className="text-xs text-red-500">Inactive</span>
          ) : (
            <span className="text-xs text-green-600">Active</span>
          )}
        </div>
        {children.length > 0 && (
          <div className="mt-1 text-xs text-gray-500">{children.length} sub-element(s)</div>
        )}
      </div>
    );
  };

  return (
    <Card>
      <div className="p-4" id="org-chart-print-area">
        <div className="flex items-center justify-between mb-3">
          <h3 className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white">
            <Network size={20} className="text-brand-600" /> {chartData.chartType ?? "Organization Chart"}
          </h3>
          {chartData.chartType === "manager_hierarchy" && (
            <span className="text-xs text-gray-500">Showing manager hierarchy</span>
          )}
        </div>
        <div className="h-64 overflow-y-auto border border-gray-200 rounded-lg bg-white dark:bg-gray-700 print:h-auto print:overflow-visible">
          {nodes.map((n) => renderNode(n.id)).filter(Boolean)}
        </div>
        <div className="p-2 text-xs text-gray-500 dark:text-gray-400">
          {nodes.length} nodes · {edges.length} edges · {chartData.asOf ? `As of ${chartData.asOf}` : "Current"} · {chartData.includeInactive ? "Include inactive" : "Active only"}
        </div>
      </div>
    </Card>
  );
}

export default function OrgChartPage() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [chartType, setChartType] = useState("enterprise");
  const [asOf, setAsOf] = useState("");
  const [rootId, setRootId] = useState("");
  const [maxDepth, setMaxDepth] = useState("5");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeVacant, setIncludeVacant] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [chartData, setChartData] = useState(null);

  const chartOptions = [
    { value: "enterprise", label: "Enterprise" },
    { value: "legal_entity", label: "Legal Entity" },
    { value: "department", label: "Department" },
    { value: "team", label: "Team" },
    { value: "position", label: "Position" },
    { value: "manager_hierarchy", label: "Manager Hierarchy" },
    { value: "employee_hierarchy", label: "Employee Hierarchy" },
  ];

  const fetchChart = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      const params = {
        chartType,
        asOf: asOf || undefined,
        rootId: rootId || undefined,
        maxDepth: Number(maxDepth),
        includeInactive,
        includeVacant,
        search: search || undefined,
        enterpriseId: undefined,
        companyIds: undefined,
      };
      const res = await organizationApi.orgChart(params, token, tokenType);
      if (res?.data) setChartData(res.data);
      else toast("No chart data returned");
    } catch (err) {
      toast.error(err.message || "Could not load org chart");
    } finally { setBusy(false); }
  }, [chartType, asOf, rootId, maxDepth, includeInactive, includeVacant, search, token, tokenType]);

  return (
    <div className="min-w-0 max-w-full space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-bold text-gray-900 dark:text-white">
          <Network size={20} /> Org Chart
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Visualize organizational structure across enterprises, departments, teams, and positions.
        </p>
      </div>

      <Card>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 dark:text-gray-300">Chart Type</label>
            <select
              className={inputClass}
              value={chartType}
              onChange={(e) => setChartType(e.target.value)}
            >
              {chartOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400">As Of Date</label>
              <input type="date" className={inputClass} value={asOf || ""} onChange={(e) => setAsOf(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400">Root ID / Name</label>
              <input type="text" className={inputClass} value={rootId || ""} onChange={(e) => setRootId(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400">Max Depth</label>
              <input type="number" className={inputClass} min={1} max={20} value={maxDepth} onChange={(e) => setMaxDepth(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400">Include Inactive</label>
              <select className={inputClass} value={includeInactive ? "true" : "false"} onChange={(e) => setIncludeInactive(e.target.value === "true")}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400">Include Vacant</label>
              <select className={inputClass} value={includeVacant ? "true" : "false"} onChange={(e) => setIncludeVacant(e.target.value === "true")}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400">Search</label>
              <input type="text" className={inputClass} value={search || ""} onChange={(e) => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={fetchChart} disabled={busy}>
              {busy && <Loader2 size={16} className="animate-spin" />}
              {busy ? "Loading…" : "Build Chart"}
            </Button>
            {chartData && (
              <>
                <Button variant="ghost" onClick={() => exportChartCsv(chartData)}>
                  <Download size={16} /> Export CSV
                </Button>
                <Button variant="ghost" onClick={() => window.print()}>
                  <Printer size={16} /> Print
                </Button>
              </>
            )}
          </div>
        </div>
      </Card>

      {chartData && (
        <style>{`
          @media print {
            body * { visibility: hidden; }
            #org-chart-print-area, #org-chart-print-area * { visibility: visible; }
            #org-chart-print-area { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
      )}
      {chartData && <OrgChartCard chartData={chartData} loading={busy} />}
    </div>
  );
}