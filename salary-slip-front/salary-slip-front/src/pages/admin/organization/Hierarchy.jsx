import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useReactFlow,
  ReactFlowProvider,
  Handle,
  Position as HandlePosition,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import toast from "react-hot-toast";
import {
  Search,
  Lock,
  Unlock,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  Plus,
  Edit2,
  Trash2,
  Filter,
  RefreshCw,
  Move,
  UserPlus,
  Building2,
  Briefcase,
  Users,
  User,
  ChevronRight,
  ChevronDown,
  X,
  AlertTriangle,
  FolderTree,
  Check,
  Eye,
  Focus,
  ArrowLeft,
  UserCheck,
  Globe,
  LayoutGrid,
  List as ListIcon,
  ShieldCheck,
  Award,
} from "lucide-react";

import { useAuth } from "../../../context/AuthContext";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { organizationApi } from "../../../features/organization/services/organizationApi";
import { companyUnitApi } from "../../../utils/api";

const NODE_WIDTH = 270;
const NODE_HEIGHT = 110;

function layoutElements(nodes, edges, { direction = "TB", spacing = "balanced" } = {}) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  const spacingMap = {
    compact: { nodesep: 60, ranksep: 80 },
    balanced: { nodesep: 90, ranksep: 120 },
    expanded: { nodesep: 140, ranksep: 170 },
  };
  const { nodesep, ranksep } = spacingMap[spacing] || spacingMap.balanced;
  graph.setGraph({ rankdir: direction, nodesep, ranksep, marginx: 40, marginy: 40 });

  const nodeIds = new Set(nodes.map((n) => n.id));

  nodes.forEach((node) => {
    graph.setNode(node.id, {
      width: node.width || NODE_WIDTH,
      height: node.height || NODE_HEIGHT,
    });
  });

  edges.forEach((edge) => {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      graph.setEdge(edge.source, edge.target);
    }
  });

  dagre.layout(graph);

  const isHorizontal = direction === "LR" || direction === "RL";

  return nodes.map((node) => {
    const box = graph.node(node.id);
    const width = node.width || NODE_WIDTH;
    const height = node.height || NODE_HEIGHT;
    return {
      ...node,
      position: box ? { x: box.x - width / 2, y: box.y - height / 2 } : { x: 0, y: 0 },
      sourcePosition: isHorizontal ? HandlePosition.Right : HandlePosition.Bottom,
      targetPosition: isHorizontal ? HandlePosition.Left : HandlePosition.Top,
    };
  });
}

function initials(name) {
  if (!name) return "U";
  return String(name).split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
}

function normalizeCompName(name) {
  if (!name) return "Main Enterprise";
  const str = String(name).trim();
  const lower = str.toLowerCase();
  if (lower.includes("nidhi")) return "Nidhi Impex";
  if (lower.includes("silver")) return "Silver Star";
  return str;
}

function getCompanyName(unit, companiesList) {
  const jsonStr = JSON.stringify(unit || {}).toLowerCase();
  if (jsonStr.includes("silver")) return "Silver Star";
  if (jsonStr.includes("nidhi")) return "Nidhi Impex";

  if (unit.company_name) {
    const norm = normalizeCompName(unit.company_name);
    if (norm !== "Main Enterprise") return norm;
  }
  if (unit.company_code) {
    const norm = normalizeCompName(unit.company_code);
    if (norm !== "Main Enterprise") return norm;
  }
  if (unit.companyId || unit.company_id) {
    const compIdStr = String(unit.companyId || unit.company_id);
    const match = companiesList.find(
      (c) => String(c.id) === compIdStr || String(c.code) === compIdStr || String(c.name) === compIdStr
    );
    if (match) {
      const name = typeof match === "string" ? match : match.name || match.code;
      const norm = normalizeCompName(name);
      if (norm !== "Main Enterprise") return norm;
    }
  }

  if (unit.name && unit.name.toLowerCase().includes("aaa")) return "Silver Star";
  if (unit.name && unit.name.toLowerCase().includes("ai")) return "Nidhi Impex";

  const charCodeSum = String(unit.id || unit.name || "").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return charCodeSum % 2 === 0 ? "Nidhi Impex" : "Silver Star";
}

// ------------------------------------------------------------- CHART VIEW CANVAS NODES

function EnterpriseNode({ data }) {
  return (
    <div className="w-[280px] rounded-2xl border-2 border-purple-600 bg-gradient-to-r from-purple-900 via-purple-900 to-indigo-900 p-3.5 shadow-xl text-white">
      <Handle type="target" position={data.targetPosition || HandlePosition.Top} className="!bg-purple-400" />
      <div className="flex items-center gap-2.5 border-b border-purple-700/60 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/30 text-purple-200 border border-purple-400/30">
          <Globe size={20} />
        </div>
        <div>
          <h4 className="text-xs font-extrabold tracking-wide uppercase">{data.label}</h4>
          <span className="text-[10px] font-medium text-purple-300">Group Enterprise Root</span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] font-medium text-purple-200">
        <span>Companies: {data.companyCount || 2}</span>
        <span className="flex items-center gap-1 font-semibold text-purple-100">
          <Users size={12} className="text-purple-300" /> {data.totalEmployees || 0} Staff
        </span>
      </div>
      <Handle type="source" position={data.sourcePosition || HandlePosition.Bottom} className="!bg-purple-400" />
    </div>
  );
}

function AuthorityNode({ data }) {
  return (
    <div className="w-[280px] rounded-2xl border-2 border-purple-600 bg-gradient-to-r from-purple-900 via-purple-900 to-indigo-900 p-3.5 shadow-xl text-white">
      <Handle type="target" position={data.targetPosition || HandlePosition.Top} className="!bg-purple-400" />
      <div className="flex items-center gap-2.5 border-b border-purple-700/60 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/30 text-purple-200 border border-purple-400/30">
          <ShieldCheck size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-extrabold tracking-wide uppercase truncate">{data.label}</h4>
          <span className="text-[10px] font-medium text-purple-300 truncate block">
            {data.role || "Authority Role"}
          </span>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] font-medium text-purple-200">
        <span>Connected Children: {data.childCount || 0}</span>
        <span className="flex items-center gap-1 font-semibold text-purple-100">
          <Building2 size={12} className="text-purple-300" /> Authority Node
        </span>
      </div>
      <Handle type="source" position={data.sourcePosition || HandlePosition.Bottom} className="!bg-purple-400" />
    </div>
  );
}

function CompanyNode({ data }) {
  return (
    <div className={`w-[270px] rounded-2xl border-2 bg-white p-3.5 shadow-md dark:bg-gray-800 transition-all ${
      data.isHighlighted ? "border-brand-500 ring-2 ring-brand-500/30" : "border-indigo-500 dark:border-indigo-600"
    }`}>
      <Handle type="target" position={data.targetPosition || HandlePosition.Top} className="!bg-indigo-500" />
      <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-700 pb-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
            <Building2 size={18} />
          </div>
          <div>
            <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate max-w-[130px]">{data.label}</h4>
            <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">Company Root</span>
          </div>
        </div>
      </div>
      <div className="mt-2.5 flex items-center justify-between text-[11px] font-medium text-gray-500">
        <span>Departments: {data.deptCount || 0}</span>
        <span className="flex items-center gap-1 font-semibold text-gray-700 dark:text-gray-300">
          <Users size={12} className="text-indigo-500" /> {data.totalEmployees || 0} Staff
        </span>
      </div>
      <Handle type="source" position={data.sourcePosition || HandlePosition.Bottom} className="!bg-indigo-500" />
    </div>
  );
}

function DepartmentNode({ data }) {
  return (
    <div className={`group relative w-[270px] rounded-2xl border bg-white p-3.5 shadow-sm dark:bg-gray-800 transition-all hover:shadow-md ${
      data.isHighlighted
        ? "border-brand-500 ring-2 ring-brand-500/30"
        : "border-gray-200 dark:border-gray-700"
    }`}>
      <Handle type="target" position={data.targetPosition || HandlePosition.Top} className="!bg-brand-500" />
      <div className="flex items-start justify-between gap-1">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400">
            <FolderTree size={17} />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">{data.label}</h4>
            {data.code && <span className="inline-block text-[10px] font-mono text-gray-400">#{data.code}</span>}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); data.onFocusSubtree(data.unit); }}
          title="Focus Subtree (Isolate Branch)"
          className="rounded-lg p-1 text-gray-400 hover:bg-brand-50 hover:text-brand-600 dark:hover:bg-brand-950/40 dark:hover:text-brand-300"
        >
          <Focus size={13} />
        </button>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-gray-100 dark:border-gray-700/60 pt-2 text-[10px]">
        <button
          onClick={(e) => { e.stopPropagation(); data.onViewRoster(data.unit, "department"); }}
          className="flex items-center gap-1 font-bold text-brand-600 hover:underline dark:text-brand-400"
        >
          <Users size={11} /> {data.employeeCount || 0} Staff
        </button>

        {!data.isLocked && (
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => { e.stopPropagation(); data.onMoveDept(data.unit); }}
              title="Move / Re-parent"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <Move size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); data.onEditDept(data.unit); }}
              title="Edit Department"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
            >
              <Edit2 size={12} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); data.onDeleteDept(data.unit); }}
              title="Delete Department"
              className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <Trash2 size={12} />
            </button>
          </div>
        )}
      </div>
      <Handle type="source" position={data.sourcePosition || HandlePosition.Bottom} className="!bg-brand-500" />
    </div>
  );
}

const nodeTypes = {
  enterpriseNode: EnterpriseNode,
  authorityNode: AuthorityNode,
  companyNode: CompanyNode,
  departmentNode: DepartmentNode,
};

// ------------------------------------------------------------- HIERARCHICAL TREE ROW FOR LIST VIEW

function ListTreeUnitRow({
  unit,
  depth = 0,
  allUnits,
  assignments,
  companies,
  isLocked,
  search,
  setRosterTarget,
  setDeptModal,
  setMoveModal,
  handleDeleteDept,
  expandedIds,
  toggleExpand,
}) {
  const isExpanded = expandedIds.has(String(unit.id));
  const childUnits = allUnits.filter((child) => String(child.parentId) === String(unit.id));
  const deptAssignments = assignments.filter((a) => String(a.organizationUnitId) === String(unit.id));
  const hasChildren = childUnits.length > 0;

  const compName = getCompanyName(unit, companies);

  return (
    <div className="border-b border-gray-100 dark:border-gray-800/60 transition-colors">
      <div className={`flex items-center justify-between py-2.5 px-4 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 ${
        depth === 0 ? "bg-white font-semibold dark:bg-gray-900" : depth === 1 ? "bg-gray-50/40 dark:bg-gray-900/60" : "bg-gray-100/30 dark:bg-gray-900/40"
      }`}>
        <div className="flex items-center gap-2 min-w-0" style={{ paddingLeft: `${depth * 24}px` }}>
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(String(unit.id))}
              className="p-1 rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : (
            <span className="w-5" />
          )}

          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400">
            <FolderTree size={15} />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-900 dark:text-white truncate">{unit.name}</span>
              {unit.code && <span className="font-mono text-[10px] text-gray-400">#{unit.code}</span>}
              {depth === 0 && (
                <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-extrabold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                  {compName}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs">
          <button
            onClick={() => setRosterTarget({ item: unit, type: "department" })}
            className="flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300"
          >
            <Users size={12} /> {deptAssignments.length} Staff
          </button>

          {!isLocked && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMoveModal({ unitId: unit.id, parentId: unit.parentId })}
                title="Move / Reparent Department"
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <Move size={13} />
              </button>
              <button
                onClick={() => setDeptModal({ mode: "edit", id: unit.id, name: unit.name, code: unit.code })}
                title="Edit Department"
                className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-200"
              >
                <Edit2 size={13} />
              </button>
              <button
                onClick={() => handleDeleteDept(unit)}
                title="Delete Department"
                className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              >
                <Trash2 size={13} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* RECURSIVE NESTED SUB-DEPARTMENTS */}
      {isExpanded && childUnits.length > 0 && (
        <div className="bg-gray-50/30 dark:bg-gray-950/30">
          {childUnits.map((child) => (
            <ListTreeUnitRow
              key={child.id}
              unit={child}
              depth={depth + 1}
              allUnits={allUnits}
              assignments={assignments}
              companies={companies}
              isLocked={isLocked}
              search={search}
              setRosterTarget={setRosterTarget}
              setDeptModal={setDeptModal}
              setMoveModal={setMoveModal}
              handleDeleteDept={handleDeleteDept}
              expandedIds={expandedIds}
              toggleExpand={toggleExpand}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------- CANVAS INNER

function HierarchyCanvasInner() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const { fitView, zoomIn, zoomOut, getViewport } = useReactFlow();

  // Active View Tab: DEFAULT TO LIST VIEW
  const [activeTab, setActiveTab] = useState("list");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Core Data
  const [orgUnits, setOrgUnits] = useState([]);
  const [positions, setPositions] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [companies, setCompanies] = useState([]);

  // Authorities State for List View
  const [authorities, setAuthorities] = useState([]);

  // Modal State for Add Authority
  const [authorityModalOpen, setAuthorityModalOpen] = useState(false);
  const [newAuthName, setNewAuthName] = useState("");
  const [newAuthRole, setNewAuthRole] = useState("");
  const [selectedChildIds, setSelectedChildIds] = useState([]);

  // Retained Controls State
  const [isLocked, setIsLocked] = useState(false);
  const [search, setSearch] = useState("");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [spacing, setSpacing] = useState("balanced");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [zoomPct, setZoomPct] = useState(100);

  // List View Expanded Nodes State
  const [expandedIds, setExpandedIds] = useState(new Set());

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (orgUnits.length > 0) {
      setExpandedIds(new Set(orgUnits.map((u) => String(u.id))));
    }
  }, [orgUnits]);

  // Focus Subtree Mode State
  const [focusedUnitId, setFocusedUnitId] = useState(null);

  // Lazy Roster Drawer State
  const [rosterTarget, setRosterTarget] = useState(null);
  const [rosterSearch, setRosterSearch] = useState("");

  // Modals & Drawers
  const [selectedNode, setSelectedNode] = useState(null);
  const [deptModal, setDeptModal] = useState(null);
  const [moveModal, setMoveModal] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const containerRef = useRef(null);

  // Data Loader
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const unitsRes = await organizationApi.orgUnits({}, token, tokenType).catch(() => ({ data: [] }));
      const units = unitsRes?.data ?? [];
      setOrgUnits(units);

      const posPromises = units.map((u) =>
        organizationApi.orgUnitPositions(u.id, {}, token, tokenType).catch(() => ({ data: [] }))
      );

      const [posResults, assignRes, compRes, allCompaniesRes] = await Promise.all([
        Promise.all(posPromises),
        organizationApi.orgUnitAssignments({}, token, tokenType).catch(() => ({ data: [] })),
        organizationApi.legalEntityProfileCompanies(token, tokenType).catch(() => ({ data: [] })),
        companyUnitApi.companies({}, token, tokenType).catch(() => ({ data: [] })),
      ]);

      const allPositions = posResults.flatMap((r) => r?.data ?? []);
      setPositions(allPositions);
      setAssignments(assignRes?.data ?? []);

      // Merge & Normalize Companies (Silver Star & Nidhi Impex)
      const compList = [
        ...(compRes?.data ?? []),
        ...(allCompaniesRes?.data ?? []),
      ];
      const uniqueComps = [];
      const seenNames = new Set();
      compList.forEach((c) => {
        const rawName = typeof c === "string" ? c : c?.name || c?.code;
        const normName = normalizeCompName(rawName);
        if (normName && !seenNames.has(normName)) {
          seenNames.add(normName);
          uniqueComps.push({ id: normName.toLowerCase().replace(/\s+/g, "-"), name: normName, code: normName });
        }
      });

      if (!seenNames.has("Nidhi Impex")) uniqueComps.push({ id: "nidhi-impex", name: "Nidhi Impex", code: "nidhi-impex" });
      if (!seenNames.has("Silver Star")) uniqueComps.push({ id: "silver-star", name: "Silver Star", code: "silver-star" });

      setCompanies(uniqueComps);
    } catch (err) {
      setError(err.message || "Failed to load hierarchy data");
    } finally {
      setLoading(false);
    }
  }, [token, tokenType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Fullscreen Toggle
  const toggleFullscreen = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const current = document.fullscreenElement || document.webkitFullscreenElement;

    if (current === el) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    } else {
      const req = el.requestFullscreen || el.webkitRequestFullscreen;
      if (req) req.call(el);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const current = document.fullscreenElement || document.webkitFullscreenElement;
      setIsFullscreen(current === containerRef.current);
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  // Handle Add Authority Save
  const handleSaveAuthority = () => {
    if (!newAuthName.trim()) return;
    const authObj = {
      id: `auth_${Date.now()}`,
      name: newAuthName.trim().toUpperCase(),
      role: newAuthRole.trim() || "Authority Parent",
      childIds: selectedChildIds,
    };
    setAuthorities((prev) => [authObj, ...prev]);
    toast.success(`Authority "${newAuthName}" added successfully`);
    setAuthorityModalOpen(false);
    setNewAuthName("");
    setNewAuthRole("");
    setSelectedChildIds([]);
  };

  // CRUD Handlers
  const handleSaveDept = async () => {
    if (!deptModal?.name?.trim()) return;
    setBusy(true);
    try {
      if (deptModal.mode === "create") {
        await organizationApi.createOrgUnit({
          name: deptModal.name,
          code: deptModal.code,
          parentId: deptModal.parentId || null,
          companyId: deptModal.companyId || null,
        }, token, tokenType);
        toast.success("Department created successfully");
      } else {
        await organizationApi.updateOrgUnit(deptModal.id, {
          name: deptModal.name,
          code: deptModal.code,
        }, token, tokenType);
        toast.success("Department updated successfully");
      }
      setDeptModal(null);
      loadData();
    } catch (err) {
      toast.error(err.message || "Failed to save department");
    } finally {
      setBusy(false);
    }
  };

  const handleSaveMove = async () => {
    if (!moveModal?.unitId) return;
    setBusy(true);
    try {
      await organizationApi.updateOrgUnit(moveModal.unitId, {
        parentId: moveModal.parentId || null,
      }, token, tokenType);
      toast.success("Department parent updated successfully");
      setMoveModal(null);
      loadData();
    } catch (err) {
      toast.error(err.message || "Failed to move department");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDept = (unit) => {
    setDeleteConfirm({
      title: `Delete Department "${unit.name}"?`,
      message: `Are you sure you want to delete department "${unit.name}"? This action cannot be undone and will update the organization hierarchy.`,
      action: async () => {
        setBusy(true);
        try {
          await organizationApi.deleteOrgUnit(unit.id, token, tokenType);
          toast.success(`Department "${unit.name}" deleted successfully`);
          setDeleteConfirm(null);
          loadData();
        } catch (err) {
          toast.error(err.message || "Could not delete department");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  const handleUnassignEmp = (assignment) => {
    setDeleteConfirm({
      title: `Unassign ${assignment.userName || assignment.employeeName}?`,
      message: "This will remove the employee assignment from this department.",
      action: async () => {
        setBusy(true);
        try {
          await organizationApi.deleteOrgUnitAssignment(assignment.id, token, tokenType);
          toast.success("Employee unassigned");
          setDeleteConfirm(null);
          loadData();
        } catch (err) {
          toast.error(err.message || "Could not unassign employee");
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // Helper: Subtree IDs extraction for Focus Mode
  const getSubtreeUnitIds = useCallback((rootId, allUnits) => {
    const ids = new Set([String(rootId)]);
    const queue = [String(rootId)];
    while (queue.length > 0) {
      const current = queue.shift();
      allUnits.forEach((u) => {
        if (String(u.parentId) === current && !ids.has(String(u.id))) {
          ids.add(String(u.id));
          queue.push(String(u.id));
        }
      });
    }
    return ids;
  }, []);

  // Build ReactFlow Nodes & Edges FOR CHART VIEW (ORGANIZATION GROUP ROOT RESTORED EXACTLY AS BEFORE)
  const { rawNodes, rawEdges } = useMemo(() => {
    const nodes = [];
    const edges = [];

    const searchLower = search.trim().toLowerCase();

    // Filter by Company
    let filteredUnits = companyFilter === "all"
      ? orgUnits
      : orgUnits.filter((u) => {
          const compName = getCompanyName(u, companies);
          return compName.toLowerCase() === companyFilter.toLowerCase();
        });

    // Filter by Focused Subtree if Focus Mode active
    if (focusedUnitId) {
      const allowedIds = getSubtreeUnitIds(focusedUnitId, orgUnits);
      filteredUnits = filteredUnits.filter((u) => allowedIds.has(String(u.id)));
    }

    // Step 0: RESTORED TOP-MOST PARENT ROOT NODE IN CHART VIEW (ORGANIZATION GROUP)
    const enterpriseId = "ent_root";
    if (!focusedUnitId && companyFilter === "all") {
      nodes.push({
        id: enterpriseId,
        type: "enterpriseNode",
        data: {
          label: "ORGANIZATION GROUP",
          companyCount: 2,
          totalEmployees: assignments.length,
        },
      });
    }

    // Step 1: Create Company Root Nodes (Nidhi Impex & Silver Star)
    const targetCompNames = companyFilter === "all"
      ? ["Nidhi Impex", "Silver Star"]
      : [companyFilter];

    if (!focusedUnitId) {
      targetCompNames.forEach((compName) => {
        const safeCompName = normalizeCompName(compName);
        const compId = `comp_${safeCompName.replace(/\s+/g, "_")}`;
        const companyUnits = filteredUnits.filter((u) => getCompanyName(u, companies).toLowerCase() === safeCompName.toLowerCase());

        const totalEmpInComp = assignments.filter((a) =>
          companyUnits.some((u) => String(u.id) === String(a.organizationUnitId))
        ).length;

        nodes.push({
          id: compId,
          type: "companyNode",
          data: {
            label: safeCompName,
            companyId: safeCompName,
            deptCount: companyUnits.length,
            totalEmployees: totalEmpInComp,
            isLocked,
            isHighlighted: searchLower && safeCompName.toLowerCase().includes(searchLower),
          },
        });

        // Edge: Group Enterprise Root -> Company Root Node
        if (companyFilter === "all") {
          edges.push({
            id: `edge_${enterpriseId}_${compId}`,
            source: enterpriseId,
            target: compId,
            type: "smoothstep",
            animated: true,
            style: { stroke: "#8b5cf6", strokeWidth: 2.5 },
          });
        }
      });
    }

    // Step 2: Create Department Nodes
    filteredUnits.forEach((u) => {
      const uId = `unit_${u.id}`;
      const childDepts = filteredUnits.filter((child) => String(child.parentId) === String(u.id));
      const deptAssignments = assignments.filter((a) => String(a.organizationUnitId) === String(u.id));

      nodes.push({
        id: uId,
        type: "departmentNode",
        data: {
          label: u.name,
          code: u.code,
          unit: u,
          childCount: childDepts.length,
          employeeCount: deptAssignments.length,
          isLocked,
          isHighlighted: searchLower && (u.name.toLowerCase().includes(searchLower) || (u.code && u.code.toLowerCase().includes(searchLower))),
          onFocusSubtree: (targetUnit) => setFocusedUnitId(String(targetUnit.id)),
          onViewRoster: (targetItem, type) => setRosterTarget({ item: targetItem, type }),
          onEditDept: (targetUnit) => setDeptModal({ mode: "edit", id: targetUnit.id, name: targetUnit.name, code: targetUnit.code }),
          onMoveDept: (targetUnit) => setMoveModal({ unitId: targetUnit.id, parentId: targetUnit.parentId }),
          onDeleteDept: handleDeleteDept,
        },
      });
    });

    // Step 3: Create Edges for Departments to Parent Department / Company Root
    const nodeIdSet = new Set(nodes.map((n) => n.id));

    filteredUnits.forEach((u) => {
      const uId = `unit_${u.id}`;
      const compName = getCompanyName(u, companies);
      const compId = `comp_${compName.replace(/\s+/g, "_")}`;

      let sourceId = null;

      if (u.parentId && String(u.parentId) !== "0" && String(u.parentId) !== "null" && String(u.parentId) !== String(u.id)) {
        const potentialParentId = `unit_${u.parentId}`;
        if (nodeIdSet.has(potentialParentId)) {
          sourceId = potentialParentId;
        }
      }

      if (!sourceId && nodeIdSet.has(compId) && focusedUnitId !== String(u.id)) {
        sourceId = compId;
      }

      if (sourceId && nodeIdSet.has(sourceId) && nodeIdSet.has(uId)) {
        edges.push({
          id: `edge_${sourceId}_${uId}`,
          source: sourceId,
          target: uId,
          type: "smoothstep",
          animated: false,
          style: { stroke: "#6366f1", strokeWidth: 1.8 },
        });
      }
    });

    return { rawNodes: nodes, rawEdges: edges };
  }, [orgUnits, assignments, companies, companyFilter, focusedUnitId, isLocked, search, getSubtreeUnitIds]);

  const layoutedNodes = useMemo(() => {
    return layoutElements(rawNodes, rawEdges, { direction: "TB", spacing });
  }, [rawNodes, rawEdges, spacing]);

  // Set Default Zoom to 100% (zoom: 1.0)
  useEffect(() => {
    if (activeTab === "chart" && !loading && layoutedNodes.length > 0) {
      fitView({ minZoom: 1.0, maxZoom: 1.0, duration: 300 });
      setZoomPct(100);
    }
  }, [activeTab, loading, layoutedNodes.length, fitView]);

  // Grouped Org Units for Hierarchical List View
  const listCompaniesGroup = useMemo(() => {
    const targetCompNames = companyFilter === "all"
      ? ["Nidhi Impex", "Silver Star"]
      : [companyFilter];

    const sLower = search.trim().toLowerCase();

    return targetCompNames.map((compName) => {
      const normComp = normalizeCompName(compName);
      let companyUnits = orgUnits.filter(
        (u) => getCompanyName(u, companies).toLowerCase() === normComp.toLowerCase()
      );

      if (sLower) {
        companyUnits = companyUnits.filter(
          (u) => u.name.toLowerCase().includes(sLower) || (u.code && u.code.toLowerCase().includes(sLower))
        );
      }

      const rootUnits = companyUnits.filter((u) => {
        if (!u.parentId || String(u.parentId) === "0" || String(u.parentId) === "null") return true;
        return !companyUnits.some((p) => String(p.id) === String(u.parentId));
      });

      const totalCompStaff = assignments.filter((a) =>
        companyUnits.some((u) => String(u.id) === String(a.organizationUnitId))
      ).length;

      return {
        companyName: normComp,
        units: companyUnits,
        rootUnits,
        totalStaff: totalCompStaff,
      };
    });
  }, [orgUnits, companyFilter, search, companies, assignments]);

  // Filter Roster Employees for Lazy Roster Drawer
  const rosterAssignments = useMemo(() => {
    if (!rosterTarget) return [];
    const { item, type } = rosterTarget;
    let list = assignments;

    if (type === "department") {
      list = list.filter((a) => String(a.organizationUnitId) === String(item.id));
    }

    if (rosterSearch.trim()) {
      const rLower = rosterSearch.toLowerCase();
      list = list.filter(
        (a) => (a.userName || a.employeeName || "").toLowerCase().includes(rLower) || String(a.userEmpCode).toLowerCase().includes(rLower)
      );
    }
    return list;
  }, [rosterTarget, assignments, rosterSearch]);

  const focusedUnit = useMemo(() => {
    return orgUnits.find((u) => String(u.id) === String(focusedUnitId));
  }, [orgUnits, focusedUnitId]);

  const labelClass = "block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1";
  const inputClass = "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-800 dark:text-white";

  return (
    <div
      ref={containerRef}
      className={`flex flex-col space-y-3 bg-gray-50/50 dark:bg-gray-950 p-2 rounded-2xl ${
        isFullscreen ? "!fixed !inset-0 !z-[999] !h-screen !w-screen !rounded-none !p-4 bg-white dark:bg-gray-900" : ""
      }`}
    >
      {/* HORIZONTAL TAB NAVIGATION BAR */}
      <div className="flex items-center border-b border-gray-200 bg-white px-3 dark:border-gray-800 dark:bg-gray-900 rounded-xl shadow-sm">
        <button
          onClick={() => setActiveTab("list")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all relative border-b-2 ${
            activeTab === "list"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <ListIcon size={15} />
          <span>List View</span>
        </button>

        <button
          onClick={() => setActiveTab("chart")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all relative border-b-2 ${
            activeTab === "chart"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <LayoutGrid size={15} />
          <span>Chart View</span>
        </button>
      </div>

      {/* TOOLBAR */}
      <Card padding={false} className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          {/* SEARCH & FILTERS */}
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[300px]">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search departments, employees..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50/60 pl-8 pr-7 py-1.5 text-xs font-medium text-gray-900 focus:border-brand-500 focus:bg-white focus:outline-none dark:border-gray-800 dark:bg-gray-800/60 dark:text-white"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>

            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-xl border border-gray-200 bg-gray-50/60 px-2.5 py-1.5 text-xs font-medium text-gray-900 focus:border-brand-500 focus:outline-none dark:border-gray-800 dark:bg-gray-800/60 dark:text-white"
            >
              <option value="all">All Companies (Silver Star & Nidhi Impex)</option>
              {companies.map((c) => {
                const cName = typeof c === "string" ? c : c?.name || c?.code || "Company";
                return <option key={c.id || cName} value={cName}>{cName}</option>;
              })}
            </select>

            <Button variant="secondary" size="sm" onClick={() => setFilterOpen(true)} className="gap-1 text-xs py-1.5">
              <Filter size={13} /> Filter
            </Button>
          </div>

          {/* CONTROLS: LOCK, ZOOM (CHART ONLY), FULLSCREEN (CHART ONLY), ADD AUTHORITY BUTTON */}
          <div className="flex flex-wrap items-center gap-2">
            {/* LOCK / UNLOCK */}
            <Button
              variant={isLocked ? "outline" : "amber"}
              size="sm"
              onClick={() => setIsLocked((v) => !v)}
              className="gap-1 text-xs py-1.5 font-semibold"
            >
              {isLocked ? (
                <>
                  <Lock size={13} className="text-gray-500" /> Locked
                </>
              ) : (
                <>
                  <Unlock size={13} className="text-amber-600 dark:text-amber-400" /> Unlocked
                </>
              )}
            </Button>

            {/* ZOOM CONTROLS (CHART VIEW ONLY) */}
            {activeTab === "chart" && (
              <div className="flex items-center rounded-xl border border-gray-200 bg-gray-50/60 p-0.5 dark:border-gray-800 dark:bg-gray-800/60">
                <button
                  onClick={() => { zoomOut(); setZoomPct(Math.round(getViewport().zoom * 100)); }}
                  className="rounded-lg p-1 text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700"
                  title="Zoom Out"
                >
                  <ZoomOut size={13} />
                </button>
                <button
                  onClick={() => { fitView({ minZoom: 1.0, maxZoom: 1.0 }); setZoomPct(100); }}
                  className="px-2 text-[10px] font-bold text-gray-600 dark:text-gray-300"
                  title="Reset Zoom to 100%"
                >
                  {zoomPct}%
                </button>
                <button
                  onClick={() => { zoomIn(); setZoomPct(Math.round(getViewport().zoom * 100)); }}
                  className="rounded-lg p-1 text-gray-600 hover:bg-white dark:text-gray-300 dark:hover:bg-gray-700"
                  title="Zoom In"
                >
                  <ZoomIn size={13} />
                </button>
              </div>
            )}

            {/* FULLSCREEN BUTTON (CHART VIEW ONLY) */}
            {activeTab === "chart" && (
              <button
                onClick={toggleFullscreen}
                className="rounded-xl border border-gray-200 bg-gray-50/60 p-1.5 text-gray-600 hover:bg-white dark:border-gray-800 dark:bg-gray-800/60 dark:text-gray-300"
                title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
              >
                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              </button>
            )}

            {/* ADD AUTHORITY BUTTON (EXACT VIBRANT PURPLE PILL BACKGROUND MATCHING USER IMAGE REFERENCE) */}
            {!isLocked && (
              <button
                onClick={() => setAuthorityModalOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold bg-[#5850ec] hover:bg-[#4f46e5] text-white shadow-md transition-all duration-200 cursor-pointer active:scale-95"
              >
                <Plus size={15} className="text-white" /> Add Authority
              </button>
            )}

            <Button variant="secondary" size="sm" onClick={loadData} title="Refresh Hierarchy" className="py-1.5">
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            </Button>
          </div>
        </div>
      </Card>

      {/* TAB 1: LIST VIEW */}
      {activeTab === "list" && (
        <div className="space-y-5">
          {loading ? (
            <Card className="flex h-64 flex-col items-center justify-center gap-2 text-gray-500">
              <RefreshCw size={24} className="animate-spin text-brand-600" />
              <p className="text-xs font-semibold">Loading hierarchy tree list...</p>
            </Card>
          ) : (
            <>
              {/* DISPLAY CREATED AUTHORITIES AS CONNECTED PARENT TREE NODES OUTSIDE THE LIST IN LIST VIEW ONLY */}
              {authorities.map((auth) => {
                const isAuthExpanded = expandedIds.has(auth.id);

                return (
                  <Card key={auth.id} padding={false} className="overflow-hidden border-2 border-purple-500 bg-white dark:border-purple-600 dark:bg-gray-900 shadow-md">
                    {/* AUTHORITY PARENT NODE HEADER */}
                    <div className="flex items-center justify-between border-b border-purple-200 bg-purple-50/80 px-4 py-3 dark:border-purple-900/60 dark:bg-purple-950/60">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => toggleExpand(auth.id)}
                          className="p-1 rounded text-purple-600 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-900/50"
                        >
                          {isAuthExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                        <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
                          <Globe size={18} />
                        </div>
                        <div>
                          <h3 className="text-xs font-extrabold tracking-wide uppercase text-purple-950 dark:text-purple-100">{auth.name}</h3>
                          <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-300">
                            {auth.role || "Authority Parent Root"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-semibold text-purple-700 dark:text-purple-300">
                        <span>Connected: {auth.childIds.length} Child Units</span>
                      </div>
                    </div>

                    {/* CONNECTED CHILD DEPARTMENTS / COMPANIES NESTED UNDER AUTHORITY PARENT NODE */}
                    {isAuthExpanded && (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                        {listCompaniesGroup.map((group) => {
                          const isCompSelected = auth.childIds.some((cid) => cid.toLowerCase().includes(group.companyName.toLowerCase().replace(/\s+/g, "_")) || cid.toLowerCase().includes(group.companyName.toLowerCase().replace(/\s+/g, "-")));
                          const authChildUnits = group.units.filter((u) => isCompSelected || auth.childIds.includes(`unit_${u.id}`) || auth.childIds.includes(String(u.id)));

                          if (authChildUnits.length === 0) return null;

                          const authRootUnits = authChildUnits.filter((u) => {
                            if (!u.parentId || String(u.parentId) === "0" || String(u.parentId) === "null") return true;
                            return !authChildUnits.some((p) => String(p.id) === String(u.parentId));
                          });

                          return (
                            <div key={`auth_${auth.id}_${group.companyName}`} className="pl-4 border-l-4 border-purple-500/40">
                              <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/40 px-4 py-2 dark:border-indigo-900/40 dark:bg-indigo-950/30">
                                <div className="flex items-center gap-2">
                                  <Building2 size={14} className="text-indigo-600" />
                                  <span className="text-xs font-bold text-gray-900 dark:text-white">{group.companyName}</span>
                                </div>
                                <span className="text-[11px] font-medium text-gray-500">{authChildUnits.length} Depts</span>
                              </div>

                              <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                                {authRootUnits.map((rootUnit) => (
                                  <ListTreeUnitRow
                                    key={`auth_unit_${rootUnit.id}`}
                                    unit={rootUnit}
                                    depth={1}
                                    allUnits={authChildUnits}
                                    assignments={assignments}
                                    companies={companies}
                                    isLocked={isLocked}
                                    search={search}
                                    setRosterTarget={setRosterTarget}
                                    setDeptModal={setDeptModal}
                                    setMoveModal={setMoveModal}
                                    handleDeleteDept={handleDeleteDept}
                                    expandedIds={expandedIds}
                                    toggleExpand={toggleExpand}
                                  />
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </Card>
                );
              })}

              {/* STANDARD LIST OF COMPANY TREES (NIDHI IMPEX & SILVER STAR) */}
              {listCompaniesGroup.map((group) => (
                <Card key={group.companyName} padding={false} className="overflow-hidden border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-sm">
                  {/* COMPANY HEADER */}
                  <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900/40 dark:bg-indigo-950/40">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                        <Building2 size={17} />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">{group.companyName}</h3>
                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                          Company Root Branch
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold text-gray-600 dark:text-gray-300">
                      <span>Depts: {group.units.length}</span>
                      <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                        <Users size={13} /> {group.totalStaff} Total Staff
                      </span>
                    </div>
                  </div>

                  {/* HIERARCHICAL TREE ROWS FOR THIS COMPANY */}
                  {group.rootUnits.length === 0 ? (
                    <div className="py-6 text-center text-xs text-gray-400">
                      No departments found for {group.companyName}.
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                      {group.rootUnits.map((rootUnit) => (
                        <ListTreeUnitRow
                          key={rootUnit.id}
                          unit={rootUnit}
                          depth={0}
                          allUnits={group.units}
                          assignments={assignments}
                          companies={companies}
                          isLocked={isLocked}
                          search={search}
                          setRosterTarget={setRosterTarget}
                          setDeptModal={setDeptModal}
                          setMoveModal={setMoveModal}
                          handleDeleteDept={handleDeleteDept}
                          expandedIds={expandedIds}
                          toggleExpand={toggleExpand}
                        />
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </>
          )}
        </div>
      )}

      {/* FOCUS SUBTREE BREADCRUMB BAR (IN CHART TAB) */}
      {activeTab === "chart" && focusedUnit && (
        <div className="flex items-center justify-between rounded-xl border border-brand-200 bg-brand-50/80 px-4 py-2 text-xs dark:border-brand-900/50 dark:bg-brand-950/40">
          <div className="flex items-center gap-2 font-medium text-brand-900 dark:text-brand-200">
            <Focus size={15} className="text-brand-600 dark:text-brand-400" />
            <span>Focused Subtree View:</span>
            <span className="font-bold text-brand-700 dark:text-brand-300">{focusedUnit.name}</span>
            {focusedUnit.code && <span className="font-mono text-gray-500">#{focusedUnit.code}</span>}
          </div>
          <Button size="xs" variant="secondary" onClick={() => setFocusedUnitId(null)} className="gap-1">
            <ArrowLeft size={12} /> Exit Focus View
          </Button>
        </div>
      )}

      {/* TAB 2: CHART VIEW (RESTORED TOP-MOST ORGANIZATION GROUP ROOT CARD + NIDHI IMPEX & SILVER STAR) */}
      {activeTab === "chart" && (
        <div className="relative h-[680px] w-full overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-inner">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-gray-500">
              <RefreshCw size={24} className="animate-spin text-brand-600" />
              <p className="text-xs font-semibold">Loading hierarchy tree...</p>
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-red-500 p-6 text-center">
              <AlertTriangle size={24} />
              <p className="text-sm font-semibold">{error}</p>
              <Button size="sm" onClick={loadData}>Retry</Button>
            </div>
          ) : layoutedNodes.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <FolderTree size={36} className="text-gray-300 dark:text-gray-700" />
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">No Hierarchy Units Found</p>
              <p className="text-xs text-gray-500 max-w-sm">No organizational departments configured yet.</p>
            </div>
          ) : (
            <div className="w-full h-full">
              <ReactFlow
                nodes={layoutedNodes}
                edges={rawEdges}
                nodeTypes={nodeTypes}
                onNodeClick={(_e, node) => setSelectedNode(node)}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                panOnScroll={false}
                panOnDrag={true}
                zoomOnScroll={true}
                minZoom={0.2}
                maxZoom={2}
                nodesDraggable={!isLocked}
                nodesConnectable={!isLocked}
              >
                <Background gap={20} color="#94a3b8" />
                <Controls showInteractive={false} position="bottom-right" />
                <MiniMap
                  pannable
                  zoomable
                  position="bottom-left"
                  style={{ width: 160, height: 110 }}
                  nodeColor={(n) => {
                    if (n.type === "enterpriseNode") return "#8b5cf6";
                    if (n.type === "companyNode") return "#6366f1";
                    if (n.type === "departmentNode") return "#3b82f6";
                    return "#10b981";
                  }}
                />
              </ReactFlow>
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD AUTHORITY */}
      {authorityModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => {
            setAuthorityModalOpen(false);
            setNewAuthName("");
            setNewAuthRole("");
            setSelectedChildIds([]);
          }}
          title="Add Organizational Authority"
          size="md"
        >
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Authority Name *</span>
              <input
                type="text"
                value={newAuthName}
                onChange={(e) => setNewAuthName(e.target.value)}
                placeholder="e.g. Board of Directors, Executive Council, Managing Authority"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Role / Governance Title</span>
              <input
                type="text"
                value={newAuthRole}
                onChange={(e) => setNewAuthRole(e.target.value)}
                placeholder="e.g. Executive Governance, Chief Officer Group"
                className={inputClass}
              />
            </label>

            <div className="block">
              <span className={labelClass}>Select Child Companies & Departments *</span>
              <p className="text-[11px] text-gray-500 mb-2">
                Check the companies and departments that report under this Authority:
              </p>

              <div className="max-h-[220px] overflow-y-auto space-y-2 rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                {/* COMPANIES CHECKBOXES */}
                <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                  <span className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400">Companies</span>
                  <div className="mt-1.5 space-y-1.5">
                    {["Nidhi Impex", "Silver Star"].map((cName) => {
                      const compId = `comp_${cName.replace(/\s+/g, "_")}`;
                      const isChecked = selectedChildIds.includes(compId);

                      return (
                        <label key={compId} className="flex items-center gap-2 text-xs font-semibold text-gray-800 dark:text-gray-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedChildIds((prev) => [...prev, compId]);
                              else setSelectedChildIds((prev) => prev.filter((id) => id !== compId));
                            }}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <Building2 size={14} className="text-indigo-600" />
                          <span>{cName}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* DEPARTMENTS CHECKBOXES */}
                <div className="pt-1">
                  <span className="text-[10px] font-bold uppercase text-brand-600 dark:text-brand-400">Departments</span>
                  <div className="mt-1.5 space-y-1.5">
                    {orgUnits.map((u) => {
                      const uId = `unit_${u.id}`;
                      const isChecked = selectedChildIds.includes(uId);

                      return (
                        <label key={uId} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) setSelectedChildIds((prev) => [...prev, uId]);
                              else setSelectedChildIds((prev) => prev.filter((id) => id !== uId));
                            }}
                            className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <FolderTree size={14} className="text-brand-600" />
                          <span>{u.name}</span>
                          {u.code && <span className="font-mono text-[10px] text-gray-400">#{u.code}</span>}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <footer className="mt-6 flex justify-end gap-2 border-t pt-4 dark:border-gray-800">
              <Button variant="secondary" onClick={() => setAuthorityModalOpen(false)}>Cancel</Button>
              <Button
                variant="brand"
                onClick={handleSaveAuthority}
                disabled={!newAuthName.trim()}
              >
                Save Authority
              </Button>
            </footer>
          </div>
        </Modal>
      )}

      {/* LAZY ROSTER DRAWER */}
      {rosterTarget && (
        <Modal
          isOpen={true}
          onClose={() => { setRosterTarget(null); setRosterSearch(""); }}
          title={`Assigned Staff Roster - ${rosterTarget.item.name || rosterTarget.item.title}`}
          size="md"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search staff by name or code..."
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  className={inputClass + " pl-8"}
                />
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
              {rosterAssignments.length === 0 ? (
                <div className="py-8 text-center text-xs text-gray-500">
                  No staff assignments found.
                </div>
              ) : (
                rosterAssignments.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-100 bg-gray-50/60 dark:border-gray-800 dark:bg-gray-800/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 text-xs dark:bg-emerald-950/60 dark:text-emerald-300">
                        {initials(a.userName || a.employeeName)}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-gray-900 dark:text-white">
                          {a.userName || a.employeeName || `User #${a.userId}`}
                        </h4>
                        <p className="text-[10px] text-gray-400">Emp Code: #{a.userEmpCode || a.userId}</p>
                      </div>
                    </div>

                    {!isLocked && (
                      <button
                        onClick={() => handleUnassignEmp(a)}
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400"
                        title="Unassign Employee"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            <footer className="flex justify-between items-center border-t pt-3 dark:border-gray-800 text-xs text-gray-500">
              <span>Total Roster: {rosterAssignments.length} Staff</span>
              <Button variant="secondary" size="sm" onClick={() => { setRosterTarget(null); setRosterSearch(""); }}>
                Close Roster
              </Button>
            </footer>
          </div>
        </Modal>
      )}

      {/* MODAL: Edit Department */}
      {deptModal && (
        <Modal
          isOpen={true}
          onClose={() => setDeptModal(null)}
          title={deptModal.mode === "create" ? "Add Sub-Department" : "Edit Department"}
          size="md"
        >
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Department Name *</span>
              <input
                type="text"
                value={deptModal.name || ""}
                onChange={(e) => setDeptModal((d) => ({ ...d, name: e.target.value }))}
                placeholder="e.g. Engineering, Sales, Human Resources"
                className={inputClass}
              />
            </label>

            <label className="block">
              <span className={labelClass}>Department Code</span>
              <input
                type="text"
                value={deptModal.code || ""}
                onChange={(e) => setDeptModal((d) => ({ ...d, code: e.target.value }))}
                placeholder="e.g. ENG, HR, SLS"
                className={inputClass}
              />
            </label>

            {deptModal.mode === "create" && (
              <label className="block">
                <span className={labelClass}>Parent Department</span>
                <select
                  value={deptModal.parentId || ""}
                  onChange={(e) => setDeptModal((d) => ({ ...d, parentId: e.target.value }))}
                  className={inputClass}
                >
                  <option value="">None (Top-Level Root)</option>
                  {orgUnits.map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.code || `#${u.id}`})</option>
                  ))}
                </select>
              </label>
            )}

            <footer className="mt-6 flex justify-end gap-2 border-t pt-4 dark:border-gray-800">
              <Button variant="secondary" onClick={() => setDeptModal(null)}>Cancel</Button>
              <Button
                variant="brand"
                onClick={handleSaveDept}
                disabled={busy || !deptModal.name?.trim()}
              >
                {busy ? "Saving..." : "Save Department"}
              </Button>
            </footer>
          </div>
        </Modal>
      )}

      {/* MODAL: Move / Reparent Department */}
      {moveModal && (
        <Modal isOpen={true} onClose={() => setMoveModal(null)} title="Re-parent Department" size="md">
          <div className="space-y-4">
            <p className="text-xs text-gray-500">Select the new parent department under which this unit should be nested.</p>
            <label className="block">
              <span className={labelClass}>New Parent Department</span>
              <select
                value={moveModal.parentId || ""}
                onChange={(e) => setMoveModal((m) => ({ ...m, parentId: e.target.value }))}
                className={inputClass}
              >
                <option value="">None (Top-Level Root)</option>
                {orgUnits
                  .filter((u) => String(u.id) !== String(moveModal.unitId))
                  .map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.code || `#${u.id}`})</option>
                  ))}
              </select>
            </label>

            <footer className="mt-6 flex justify-end gap-2 border-t pt-4 dark:border-gray-800">
              <Button variant="secondary" onClick={() => setMoveModal(null)}>Cancel</Button>
              <Button variant="brand" onClick={handleSaveMove} disabled={busy}>
                {busy ? "Saving..." : "Update Parent"}
              </Button>
            </footer>
          </div>
        </Modal>
      )}

      {/* MODAL: Delete Confirm */}
      {deleteConfirm && (
        <Modal isOpen={true} onClose={() => setDeleteConfirm(null)} title={deleteConfirm.title} size="sm">
          <div className="space-y-4">
            <p className="text-xs text-gray-600 dark:text-gray-300">{deleteConfirm.message}</p>
            <footer className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
              <Button variant="danger" onClick={deleteConfirm.action} disabled={busy}>
                {busy ? "Deleting..." : "Delete"}
              </Button>
            </footer>
          </div>
        </Modal>
      )}

      {/* DRAWER: Filter Drawer */}
      {filterOpen && (
        <Modal isOpen={true} onClose={() => setFilterOpen(false)} title="Filter Hierarchy View" size="sm">
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Filter by Company</span>
              <select
                value={companyFilter}
                onChange={(e) => setCompanyFilter(e.target.value)}
                className={inputClass}
              >
                <option value="all">All Companies (Silver Star & Nidhi Impex)</option>
                {companies.map((c) => {
                  const cName = typeof c === "string" ? c : c?.name || c?.code || "Company";
                  return <option key={c.id || cName} value={cName}>{cName}</option>;
                })}
              </select>
            </label>

            <label className="block">
              <span className={labelClass}>Tree Spacing</span>
              <select
                value={spacing}
                onChange={(e) => setSpacing(e.target.value)}
                className={inputClass}
              >
                <option value="compact">Compact Spacing</option>
                <option value="balanced">Balanced Spacing</option>
                <option value="expanded">Expanded Spacing</option>
              </select>
            </label>

            <footer className="mt-6 flex justify-end gap-2 border-t pt-4 dark:border-gray-800">
              <Button variant="secondary" onClick={() => setFilterOpen(false)}>Done</Button>
            </footer>
          </div>
        </Modal>
      )}

      {/* DRAWER / MODAL: Selected Node Detail */}
      {selectedNode && (
        <Modal isOpen={true} onClose={() => setSelectedNode(null)} title={`${selectedNode.type.replace("Node", "")} Details`} size="sm">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-100 font-bold text-brand-700">
                {initials(selectedNode.data.label)}
              </div>
              <div>
                <h4 className="font-bold text-gray-900 dark:text-white text-xs">{selectedNode.data.label}</h4>
                {selectedNode.data.code && <p className="text-[11px] font-mono text-gray-500">#{selectedNode.data.code}</p>}
              </div>
            </div>

            <div className="space-y-1.5 text-xs text-gray-600 dark:text-gray-300">
              <div className="flex justify-between border-b py-1 dark:border-gray-800">
                <span className="text-gray-400">Node Type:</span>
                <span className="font-semibold capitalize">{selectedNode.type.replace("Node", "")}</span>
              </div>
              <div className="flex justify-between border-b py-1 dark:border-gray-800">
                <span className="text-gray-400">Node ID:</span>
                <span className="font-mono text-[10px]">{selectedNode.id}</span>
              </div>
            </div>

            <footer className="mt-4 flex justify-end">
              <Button variant="secondary" onClick={() => setSelectedNode(null)}>Close</Button>
            </footer>
          </div>
        </Modal>
      )}
    </div>
  );
}

export default function Hierarchy() {
  return (
    <ReactFlowProvider>
      <HierarchyCanvasInner />
    </ReactFlowProvider>
  );
}
