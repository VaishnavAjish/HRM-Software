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
  Building2,
  Users,
  ChevronRight,
  ChevronDown,
  ChevronLeft,
  X,
  AlertTriangle,
  FolderTree,
  CornerDownRight,
  Focus,
  ArrowLeft,
  Globe,
  LayoutGrid,
  List as ListIcon,
  ShieldCheck,
  Eye,
  Table,
} from "lucide-react";

import { useAuth } from "../../../context/AuthContext";
import Card from "../../../components/ui/Card";
import Button from "../../../components/ui/Button";
import Modal from "../../../components/ui/Modal";
import { organizationApi } from "../../../features/organization/services/organizationApi";
import { companyUnitApi, adminUserApi } from "../../../utils/api";
import EmployeeDetailsModal from "../AdminModals/EmployeeDetailsModal";
import { getEmployeePhotoUrl } from "../AdminModals/employee-helpers";

const NODE_WIDTH = 270;
const NODE_HEIGHT = 110;

function layoutElements(nodes, edges, { direction = "TB", spacing = "balanced", focusedUnitId = null } = {}) {
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

  let layouted = nodes.map((node) => {
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

  // MULTI-ROW GRID WRAPPING FOR FOCUSED SUBTREE VIEW
  if (focusedUnitId && layouted.length > 0) {
    const rootNodeId = `unit_${focusedUnitId}`;
    const nodeMap = new Map(layouted.map((n) => [n.id, n]));

    const childrenByParent = new Map();
    edges.forEach((e) => {
      if (!childrenByParent.has(e.source)) childrenByParent.set(e.source, []);
      childrenByParent.get(e.source).push(e.target);
    });

    const MAX_PER_ROW = 5;
    const PITCH = NODE_WIDTH + 30; // 300px horizontal spacing

    const rootNode = nodeMap.get(rootNodeId) || layouted[0];
    if (rootNode) {
      rootNode.position = { x: -NODE_WIDTH / 2, y: 0 };

      const processNodeChildren = (parentId) => {
        const parent = nodeMap.get(parentId);
        if (!parent) return;

        const childIds = childrenByParent.get(parentId) || [];
        if (childIds.length === 0) return;

        const pX = parent.position.x + NODE_WIDTH / 2;
        const pY = parent.position.y;

        const deptChildIds = childIds.filter((id) => id.startsWith("unit_"));
        const otherChildIds = childIds.filter((id) => !id.startsWith("unit_"));

        let currentY = pY + NODE_HEIGHT + 60;

        if (deptChildIds.length > 0) {
          const deptRows = [];
          for (let i = 0; i < deptChildIds.length; i += MAX_PER_ROW) {
            deptRows.push(deptChildIds.slice(i, i + MAX_PER_ROW));
          }

          deptRows.forEach((row) => {
            const count = row.length;
            const startX = pX - ((count - 1) * PITCH) / 2;

            row.forEach((childId, colIdx) => {
              const childNode = nodeMap.get(childId);
              if (childNode) {
                childNode.position = {
                  x: startX + colIdx * PITCH - NODE_WIDTH / 2,
                  y: currentY,
                };
                processNodeChildren(childId);
              }
            });
            currentY += NODE_HEIGHT + 45;
          });
        }

        if (otherChildIds.length > 0) {
          const staffRows = [];
          for (let i = 0; i < otherChildIds.length; i += MAX_PER_ROW) {
            staffRows.push(otherChildIds.slice(i, i + MAX_PER_ROW));
          }

          staffRows.forEach((row) => {
            const count = row.length;
            const startX = pX - ((count - 1) * PITCH) / 2;

            row.forEach((childId, colIdx) => {
              const childNode = nodeMap.get(childId);
              if (childNode) {
                childNode.position = {
                  x: startX + colIdx * PITCH - NODE_WIDTH / 2,
                  y: currentY,
                };
              }
            });
            currentY += NODE_HEIGHT + 35;
          });
        }
      };

      processNodeChildren(rootNode.id);
    }
  }

  return layouted;
}


function isAuthForUnit(auth, unit) {
  if (!auth || !Array.isArray(auth.childIds) || !unit) return false;
  const uId = String(unit.id);
  const targetTag = `unit_${uId}`;

  return auth.childIds.some((cid) => {
    const sCid = String(cid).trim();
    return sCid === targetTag || sCid === uId;
  });
}



function getUnitAuthorities(unit, authorities) {
  if (!unit || !authorities || !Array.isArray(authorities)) return [];
  const uId = String(unit.id);
  const targetTag = `unit_${uId}`;

  return authorities.filter((a) => {
    if (!a) return false;
    if (isAuthForUnit(a, unit)) return true;
    if (Array.isArray(a.companyUnitIds) && a.companyUnitIds.some((id) => String(id) === uId)) return true;
    if (Array.isArray(a.childIds) && a.childIds.some((cid) => {
      const s = String(cid).trim();
      return s === targetTag || s === uId;
    })) return true;
    if (String(a.unitId || a.organizationUnitId) === uId) return true;
    return false;
  });
}

function getCompanyAuthorities(compName, authorities, orgUnits, companies) {
  if (!compName) return [];
  return (authorities || []).filter((auth) => {
    if (isAuthForCompany(auth, compName)) return true;
    const compUnits = (orgUnits || []).filter((u) => getCompanyName(u, companies) === compName);
    return compUnits.some((u) => isAuthForUnit(auth, u));
  });
}

function isAuthForCompany(auth, companyName) {
  if (!auth || !Array.isArray(auth.childIds) || !companyName) return false;
  const normCompName = normalizeCompName(companyName);
  const targetTag = `comp_${normCompName.replace(/\s+/g, "_")}`;
  const targetTagDash = `comp_${normCompName.toLowerCase().replace(/\s+/g, "-")}`;

  return auth.childIds.some((cid) => {
    const sCid = String(cid).trim();
    return (
      sCid === targetTag ||
      sCid === targetTagDash ||
      sCid === normCompName ||
      sCid.toLowerCase() === normCompName.toLowerCase()
    );
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
    <div className="w-[270px] rounded-2xl border-2 border-purple-600 bg-gradient-to-r from-purple-900 via-purple-900 to-indigo-900 p-3.5 shadow-xl text-white">
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
    <div className="w-[270px] rounded-2xl border-2 border-purple-600 bg-gradient-to-r from-purple-900 via-purple-900 to-indigo-900 p-3.5 shadow-xl text-white">
      <Handle type="target" position={data.targetPosition || HandlePosition.Top} className="!bg-purple-400" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-purple-500/30 text-purple-200 border border-purple-400/30">
            <ShieldCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-extrabold tracking-wide uppercase truncate">{data.label}</h4>
            <span className="text-[10px] font-medium text-purple-300 truncate block">
              {data.role || "Authority Role"}
            </span>
          </div>
        </div>
        {!data.isLocked && data.onEditAuthority && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); data.onEditAuthority(data.auth); }}
              title="Edit Authority"
              className="rounded p-1 text-purple-200 hover:bg-purple-800 hover:text-white cursor-pointer"
            >
              <Edit2 size={13} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); data.onDeleteAuthority(data.auth); }}
              title="Delete Authority"
              className="rounded p-1 text-red-300 hover:bg-purple-800 hover:text-red-100 cursor-pointer"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
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

function StaffNode({ data }) {
  const photoUrl = data.photoUrl;
  const name = data.label || "Staff Member";
  const empCode = data.empCode;

  return (
    <div className="w-[270px] rounded-2xl border border-gray-200 bg-white p-3.5 shadow-sm dark:bg-gray-800 transition-all hover:shadow-md">
      <Handle type="target" position={data.targetPosition || HandlePosition.Top} className="!bg-brand-500" />
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          {/* PHOTO IMMEDIATELY BEFORE NAME */}
          <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold flex items-center justify-center text-xs border border-brand-200 dark:border-brand-800/60">
            <span>{initials(name)}</span>
            {photoUrl && (
              <img
                src={photoUrl}
                alt={name}
                className="absolute inset-0 h-full w-full object-cover rounded-full"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate">{name}</h4>
            <span className="text-[10px] font-mono text-gray-400 truncate block">
              {empCode ? `#${empCode}` : "Staff Member"}
            </span>
          </div>
        </div>

        {/* VIEW BUTTON */}
        <button
          onClick={(e) => { e.stopPropagation(); data.onViewStaff(data.assignment); }}
          title="View Employee Profile"
          className="flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-extrabold text-brand-600 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-400 transition-all cursor-pointer shrink-0"
        >
          <Eye size={12} /> View
        </button>
      </div>
      <Handle type="source" position={data.sourcePosition || HandlePosition.Bottom} className="!bg-brand-500" />
    </div>
  );
}


// ------------------------------------------------------------- DATA TABLE PAGINATION COMPONENT
function DataTablePagination({
  currentPage,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 15, 25, 50, 100],
}) {
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  // Generate pagination page numbers
  const getPageNumbers = () => {
    const pages = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-100 dark:border-gray-800 pt-3.5 mt-3 text-xs text-gray-500 dark:text-gray-400">
      <div className="flex flex-wrap items-center gap-2">
        <span>
          Showing <strong className="font-semibold text-gray-900 dark:text-white">{startItem}-{endItem}</strong> of{" "}
          <strong className="font-semibold text-gray-900 dark:text-white">{totalItems}</strong> entries
        </span>
        <span className="ml-2 flex items-center gap-1.5">
          Show
          <select
            value={pageSize}
            onChange={(e) => {
              onPageSizeChange(Number(e.target.value));
              onPageChange(1);
            }}
            className="mx-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-2 py-1 text-xs font-bold text-gray-700 dark:text-gray-200 focus:border-brand-500 focus:outline-none cursor-pointer"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
          entries
        </span>
      </div>

      <div className="flex items-center gap-1">
        <button
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          title="Previous Page"
        >
          <ChevronLeft size={14} />
        </button>

        {getPageNumbers().map((p, idx) =>
          p === "..." ? (
            <span key={`dots-${idx}`} className="px-1 text-gray-400 select-none">
              ...
            </span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`h-7 min-w-[28px] px-2 rounded-lg text-xs font-bold transition-all ${
                currentPage === p
                  ? "bg-brand-600 text-white shadow-sm dark:bg-brand-500"
                  : "border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          title="Next Page"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

const nodeTypes = {
  enterpriseNode: EnterpriseNode,
  authorityNode: AuthorityNode,
  companyNode: CompanyNode,
  departmentNode: DepartmentNode,
  staffNode: StaffNode,
};

// ------------------------------------------------------------- HIERARCHICAL TREE ROW FOR LIST VIEW

function ListTreeUnitRow({
  unit,
  depth = 0,
  allUnits,
  assignments,
  companies,
  authorities = [],
  isLocked,
  onEditAuthority,
  onDeleteAuthority,
  search,
  setRosterTarget,
  setDeptModal,
  setMoveModal,
  handleDeleteDept,
  expandedIds,
  toggleExpand,
  isUnderAuthorityGroup = false,
  isLastInAuthorityGroup = false,
}) {
  const isExpanded = expandedIds.has(String(unit.id));
  const childUnits = allUnits.filter((child) => String(child.parentId) === String(unit.id));
  const deptAssignments = assignments.filter((a) => String(a.organizationUnitId) === String(unit.id));
  const hasChildren = childUnits.length > 0;

  return (
    <div className="border-b border-gray-100 dark:border-gray-800/60 transition-colors">
      {/* DEPARTMENT ROW */}
      <div className={`relative flex items-center justify-between py-2.5 px-4 hover:bg-gray-50/80 dark:hover:bg-gray-800/40 ${
        depth === 0 ? "bg-white font-semibold dark:bg-gray-900" : depth === 1 ? "bg-gray-50/40 dark:bg-gray-900/60" : "bg-gray-100/30 dark:bg-gray-900/40"
      }`}>
        {/* HORIZONTAL CONNECTOR TICK CONNECTING VERTICAL TREE BRANCH TO THIS DEPARTMENT */}
        {isUnderAuthorityGroup && (
          <div
            className="absolute left-0 top-1/2 w-4 border-b-2 border-purple-400 dark:border-purple-600 pointer-events-none"
            style={{ top: "50%" }}
          />
        )}

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
              authorities={authorities}
              isLocked={isLocked}
              onEditAuthority={onEditAuthority}
              onDeleteAuthority={onDeleteAuthority}
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

  const [fetching, setFetching] = useState(true);
  const loading = fetching && Boolean(token);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Core Data
  const [orgUnits, setOrgUnits] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [companies, setCompanies] = useState([]);

  // Authorities State for List View
  const [authorities, setAuthorities] = useState([]);

  // Modal State for Add / Edit Authority
  const [authorityModalOpen, setAuthorityModalOpen] = useState(false);
  const [editingAuthId, setEditingAuthId] = useState(null);
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

  // Staff Details Modal State
  // Local State for Table View Filters & Pagination
    // Interactive Drill-Down State for Table View (Company -> Authority -> Department -> Employees)
  const [drillCompany, setDrillCompany] = useState(null);
  const [drillAuthorityId, setDrillAuthorityId] = useState(null);
  const [drillDepartmentId, setDrillDepartmentId] = useState(null);

    // Recruitment-Style Drill-Down State (Company -> Authority -> Department -> Employees)
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [selectedAuthority, setSelectedAuthority] = useState(null);
  const [selectedDepartment, setSelectedDepartment] = useState(null);

  const drillLevel = useMemo(() => {
    if (selectedDepartment) return "employees";
    if (selectedAuthority === "filter_auths") return "authorities";
    if (selectedAuthority && selectedAuthority !== "filter_auths") return "departments";
    if (selectedCompany) return "departments";
    return "companies";
  }, [selectedCompany, selectedAuthority, selectedDepartment]);

  const [authSearch, setAuthSearch] = useState("");
  const [authCompanyFilter, setAuthCompanyFilter] = useState("all");
  const [authPage, setAuthPage] = useState(1);
  const [authPageSize, setAuthPageSize] = useState(10);

  const [unitSearch, setUnitSearch] = useState("");
  const [unitCompanyFilter, setUnitCompanyFilter] = useState("all");
  const [unitTypeFilter, setUnitTypeFilter] = useState("all");
  const [unitPage, setUnitPage] = useState(1);
  const [unitPageSize, setUnitPageSize] = useState(10);

  const [staffSearch, setStaffSearch] = useState("");
  const [staffCompanyFilter, setStaffCompanyFilter] = useState("all");
  const [staffDeptFilter, setStaffDeptFilter] = useState("all");
  const [staffRoleFilter, setStaffRoleFilter] = useState("all");
  const [staffPage, setStaffPage] = useState(1);
  const [staffPageSize, setStaffPageSize] = useState(15);

  const [staffModalOpen, setStaffModalOpen] = useState(false);
  const [selectedStaffUser, setSelectedStaffUser] = useState(null);
  const [staffViewLoading, setStaffViewLoading] = useState(false);

  const handleOpenStaffDetails = useCallback((assignment) => {
    if (!assignment?.userId) {
      toast.error("Employee details not found.");
      return;
    }
    setStaffModalOpen(true);
    setStaffViewLoading(true);
    setSelectedStaffUser(null);

    adminUserApi
      .get(assignment.userId, token, tokenType)
      .then((res) => {
        const userRec = res?.data || res;
        setSelectedStaffUser(userRec);
      })
      .catch(() => {
        setSelectedStaffUser({
          id: assignment.userId,
          name: assignment.userName || assignment.employeeName || "Employee",
          empCode: assignment.userEmpCode || assignment.empCode,
          department: assignment.departmentName || assignment.organizationUnitName,
          unit: assignment.unitName,
          status: "Active",
          photo: assignment.userPhoto || assignment.photo,
        });
      })
      .finally(() => {
        setStaffViewLoading(false);
      });
  }, [token, tokenType]);

  const containerRef = useRef(null);

  // Data Loader
  const loadData = useCallback(() => {
    if (!token) return;
    organizationApi.orgUnits({}, token, tokenType).catch(() => ({ data: [] }))
      .then((unitsRes) => {
        const units = unitsRes?.data ?? [];
        setError(null);
        setOrgUnits(units);
        if (units.length > 0) {
          setExpandedIds(new Set(units.map((u) => String(u.id))));
        }

        return Promise.all([
          organizationApi.orgUnitAssignments({}, token, tokenType).catch(() => ({ data: [] })),
          organizationApi.legalEntityProfileCompanies(token, tokenType).catch(() => ({ data: [] })),
          companyUnitApi.companies({}, token, tokenType).catch(() => ({ data: [] })),
          organizationApi.authorities(token, tokenType).catch(() => ({ data: [] })),
        ]);
      })
      .then(([assignRes, compRes, allCompaniesRes, authRes]) => {
        setAssignments(assignRes?.data ?? []);
        setAuthorities(authRes?.data ?? []);

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
      })
      .catch((err) => {
        setError(err.message || "Failed to load hierarchy data");
      })
      .finally(() => {
        setFetching(false);
      });
  }, [token, tokenType]);

  const reloadData = useCallback(() => {
    setFetching(true);
    setError(null);
    loadData();
  }, [loadData]);

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

  // Handle Authority Add/Edit/Delete Handlers
  const handleOpenAddAuthority = () => {
    setEditingAuthId(null);
    setNewAuthName("");
    setNewAuthRole("");
    setSelectedChildIds([]);
    setAuthorityModalOpen(true);
  };

  const handleEditAuthority = (auth) => {
    setEditingAuthId(auth.id);
    setNewAuthName(auth.name);
    setNewAuthRole(auth.role || "");
    setSelectedChildIds(auth.childIds || []);
    setAuthorityModalOpen(true);
  };

  const handleDeleteAuthority = (auth) => {
    setDeleteConfirm({
      title: `Delete Authority "${auth.name}"?`,
      message: `Are you sure you want to delete authority "${auth.name}"? This action cannot be undone.`,
      action: async () => {
        try {
          await organizationApi.deleteAuthority(auth.id, token, tokenType);
          setAuthorities((prev) => prev.filter((a) => a.id !== auth.id));
          toast.success(`Authority "${auth.name}" deleted successfully`);
        } catch (err) {
          toast.error(err.message || "Failed to delete authority");
        } finally {
          setDeleteConfirm(null);
        }
      },
    });
  };

  const handleSaveAuthority = async () => {
    if (!newAuthName.trim()) return;
    setBusy(true);
    try {
      const payload = {
        name: newAuthName.trim().toUpperCase(),
        role: newAuthRole.trim() || "Authority Parent",
        childIds: selectedChildIds,
      };

      if (editingAuthId) {
        const res = await organizationApi.updateAuthority(editingAuthId, payload, token, tokenType);
        const updated = res?.data || { ...payload, id: editingAuthId };
        setAuthorities((prev) =>
          prev.map((a) => (a.id === editingAuthId ? updated : a))
        );
        toast.success(`Authority "${newAuthName}" updated successfully`);
      } else {
        const res = await organizationApi.createAuthority(payload, token, tokenType);
        const created = res?.data;
        if (created) {
          setAuthorities((prev) => [created, ...prev]);
        } else {
          reloadData();
        }
        toast.success(`Authority "${newAuthName}" added successfully`);
      }
      setAuthorityModalOpen(false);
      setEditingAuthId(null);
      setNewAuthName("");
      setNewAuthRole("");
      setSelectedChildIds([]);
    } catch (err) {
      toast.error(err.message || "Failed to save authority");
    } finally {
      setBusy(false);
    }
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
      reloadData();
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
      reloadData();
    } catch (err) {
      toast.error(err.message || "Failed to move department");
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteDept = useCallback((unit) => {
    setDeleteConfirm({
      title: `Delete Department "${unit.name}"?`,
      message: `Are you sure you want to delete department "${unit.name}"? This action cannot be undone and will update the organization hierarchy.`,
      action: async () => {
        setBusy(true);
        try {
          await organizationApi.deleteOrgUnit(unit.id, token, tokenType);
          toast.success(`Department "${unit.name}" deleted successfully`);
          setDeleteConfirm(null);
          reloadData();
        } catch (err) {
          toast.error(err.message || "Could not delete department");
        } finally {
          setBusy(false);
        }
      },
    });
  }, [token, tokenType, reloadData]);

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
          reloadData();
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

  // Build ReactFlow Nodes & Edges FOR CHART VIEW (WITH AUTHORITIES RESTORED AS PARENT NODES)
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

    // Step 3: Create Authority Nodes
    (authorities || []).forEach((auth) => {
      const authId = `auth_${auth.id}`;

      // Calculate how many children (units or companies) this authority targets
      const matchingCompCount = !focusedUnitId ? targetCompNames.filter((cName) => isAuthForCompany(auth, cName)).length : 0;
      const matchingUnitCount = filteredUnits.filter((u) => isAuthForUnit(auth, u)).length;
      const totalChildCount = matchingCompCount + matchingUnitCount;

      // In Focused Subtree View, only include Authority nodes that target a unit in the focused subtree
      const shouldInclude = focusedUnitId ? matchingUnitCount > 0 : true;

      if (shouldInclude) {
        nodes.push({
          id: authId,
          type: "authorityNode",
          data: {
            label: auth.name,
            role: auth.role || "Authority Parent",
            auth,
            childCount: totalChildCount,
            isLocked,
            isHighlighted: searchLower && (auth.name.toLowerCase().includes(searchLower) || (auth.role && auth.role.toLowerCase().includes(searchLower))),
            onEditAuthority: handleEditAuthority,
            onDeleteAuthority: handleDeleteAuthority,
          },
        });
      }
    });

    const nodeIdSet = new Set(nodes.map((n) => n.id));

    // Step 4: Create Edges for Companies (Enterprise Root -> Authority (if present) -> Company)
    if (!focusedUnitId) {
      targetCompNames.forEach((compName) => {
        const safeCompName = normalizeCompName(compName);
        const compId = `comp_${safeCompName.replace(/\s+/g, "_")}`;

        if (!nodeIdSet.has(compId)) return;

        // Find authorities targeting this company
        const companyAuths = (authorities || []).filter((auth) => isAuthForCompany(auth, compName) && nodeIdSet.has(`auth_${auth.id}`));

        if (companyAuths.length > 0) {
          companyAuths.forEach((auth) => {
            const authId = `auth_${auth.id}`;

            // Edge from Enterprise Root to Authority
            if (companyFilter === "all" && nodeIdSet.has(enterpriseId)) {
              edges.push({
                id: `edge_${enterpriseId}_${authId}`,
                source: enterpriseId,
                target: authId,
                type: "smoothstep",
                animated: false,
                style: { stroke: "#6366f1", strokeWidth: 1.8 },
              });
            }

            // Edge from Authority to Company
            edges.push({
              id: `edge_${authId}_${compId}`,
              source: authId,
              target: compId,
              type: "smoothstep",
              animated: false,
              style: { stroke: "#6366f1", strokeWidth: 1.8 },
            });
          });
        } else if (companyFilter === "all" && nodeIdSet.has(enterpriseId)) {
          // Direct edge from Enterprise Root to Company
          edges.push({
            id: `edge_${enterpriseId}_${compId}`,
            source: enterpriseId,
            target: compId,
            type: "smoothstep",
            animated: false,
            style: { stroke: "#6366f1", strokeWidth: 1.8 },
          });
        }
      });
    }

    // Step 5: Create Edges for Departments (Parent Dept / Company -> Authority (if present) -> Department)
    filteredUnits.forEach((u) => {
      const uId = `unit_${u.id}`;
      if (!nodeIdSet.has(uId)) return;

      const compName = getCompanyName(u, companies);
      const compId = `comp_${compName.replace(/\s+/g, "_")}`;

      let defaultSourceId = null;

      if (u.parentId && String(u.parentId) !== "0" && String(u.parentId) !== "null" && String(u.parentId) !== String(u.id)) {
        const potentialParentId = `unit_${u.parentId}`;
        if (nodeIdSet.has(potentialParentId)) {
          defaultSourceId = potentialParentId;
        }
      }

      if (!defaultSourceId && nodeIdSet.has(compId) && focusedUnitId !== String(u.id)) {
        defaultSourceId = compId;
      }

      // Check if any authority targets this specific department
      const deptAuths = (authorities || []).filter((auth) => isAuthForUnit(auth, u) && nodeIdSet.has(`auth_${auth.id}`));

      if (deptAuths.length > 0) {
        deptAuths.forEach((auth) => {
          const authId = `auth_${auth.id}`;

          // Edge from default parent (Company or Parent Dept) to Authority
          if (defaultSourceId && nodeIdSet.has(defaultSourceId)) {
            edges.push({
              id: `edge_${defaultSourceId}_${authId}`,
              source: defaultSourceId,
              target: authId,
              type: "smoothstep",
              animated: false,
              style: { stroke: "#6366f1", strokeWidth: 1.8 },
            });
          }

          // Edge from Authority to Department
          edges.push({
            id: `edge_${authId}_${uId}`,
            source: authId,
            target: uId,
            type: "smoothstep",
            animated: false,
            style: { stroke: "#6366f1", strokeWidth: 1.8 },
          });
        });
      } else if (defaultSourceId && nodeIdSet.has(defaultSourceId)) {
        // Direct edge from default parent to Department
        edges.push({
          id: `edge_${defaultSourceId}_${uId}`,
          source: defaultSourceId,
          target: uId,
          type: "smoothstep",
          animated: false,
          style: { stroke: "#6366f1", strokeWidth: 1.8 },
        });
      }
    });

    // Step 6: Create Staff Connected Nodes (ONLY IN FOCUSED SUBTREE VIEW)
    if (focusedUnitId) {
      filteredUnits.forEach((u) => {
        const uId = `unit_${u.id}`;
        if (!nodeIdSet.has(uId)) return;

        const deptAssignments = assignments.filter((a) => String(a.organizationUnitId) === String(u.id));

        deptAssignments.forEach((assign) => {
          const staffNodeId = `staff_${assign.id}_${u.id}`;
          const staffName = assign.userName || assign.employeeName || `User #${assign.userId}`;
          const staffCode = assign.userEmpCode || assign.empCode;
          const photo = assign.userPhoto || assign.photo;

          nodes.push({
            id: staffNodeId,
            type: "staffNode",
            data: {
              label: staffName,
              empCode: staffCode,
              photoUrl: getEmployeePhotoUrl(photo),
              assignment: assign,
              isLocked,
              onViewStaff: (targetAssign) => handleOpenStaffDetails(targetAssign),
            },
          });

          // Connected Edge from Department to Staff Node
          edges.push({
            id: `edge_${uId}_${staffNodeId}`,
            source: uId,
            target: staffNodeId,
            type: "smoothstep",
            animated: false,
            style: { stroke: "#6366f1", strokeWidth: 1.8 },
          });
        });
      });
    }

    return { rawNodes: nodes, rawEdges: edges };
  }, [orgUnits, assignments, companies, authorities, companyFilter, focusedUnitId, isLocked, search, getSubtreeUnitIds, handleDeleteDept, handleEditAuthority, handleDeleteAuthority, handleOpenStaffDetails]);

  const layoutedNodes = useMemo(() => {
    return layoutElements(rawNodes, rawEdges, { direction: "TB", spacing, focusedUnitId });
  }, [rawNodes, rawEdges, spacing, focusedUnitId]);

  // Filtered & Paginated Data for Table View (100% Synchronized with List & Chart Views)
  const filteredCompaniesList = useMemo(() => {
    let list = companies || [];
    if (companyFilter !== "all") {
      list = list.filter((c) => c.name === companyFilter);
    }
    const q = (unitSearch || search).trim().toLowerCase();
    if (q) {
      list = list.filter((c) => (c.name || "").toLowerCase().includes(q));
    }
    return list;
  }, [companies, companyFilter, unitSearch, search]);

  const [companyPage, setCompanyPage] = useState(1);
  const [companyPageSize, setCompanyPageSize] = useState(10);

  const paginatedCompaniesList = useMemo(() => {
    const start = (companyPage - 1) * companyPageSize;
    return filteredCompaniesList.slice(start, start + companyPageSize);
  }, [filteredCompaniesList, companyPage, companyPageSize]);

  const filteredAuthorities = useMemo(() => {
    let list = authorities || [];
    if (selectedCompany) {
      list = getCompanyAuthorities(selectedCompany, authorities, orgUnits, companies);
    } else if (authCompanyFilter !== "all") {
      list = getCompanyAuthorities(authCompanyFilter, authorities, orgUnits, companies);
    } else if (companyFilter !== "all") {
      list = getCompanyAuthorities(companyFilter, authorities, orgUnits, companies);
    }
    const q = (authSearch || search).trim().toLowerCase();
    if (q) {
      list = list.filter(
        (auth) =>
          (auth.name || auth.authorityName || "").toLowerCase().includes(q) ||
          (auth.role || auth.authorityRole || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [authorities, orgUnits, companies, selectedCompany, authCompanyFilter, companyFilter, authSearch, search]);

  const paginatedAuthorities = useMemo(() => {
    const start = (authPage - 1) * authPageSize;
    return filteredAuthorities.slice(start, start + authPageSize);
  }, [filteredAuthorities, authPage, authPageSize]);

  const filteredOrgUnits = useMemo(() => {
    let list = orgUnits || [];
    const activeCompany = selectedCompany || (unitCompanyFilter !== "all" ? unitCompanyFilter : companyFilter);
    if (activeCompany !== "all" && activeCompany !== null) {
      list = list.filter((u) => getCompanyName(u, companies) === activeCompany);
    }

    if (selectedAuthority) {
      if (selectedAuthority === "unallocated") {
        list = list.filter((u) => {
          const hasDirectAuth = (authorities || []).some((a) => isAuthForUnit(a, u));
          const compName = getCompanyName(u, companies);
          const hasCompAuth = (authorities || []).some((a) => isAuthForCompany(a, compName));
          return !hasDirectAuth && !hasCompAuth;
        });
      } else {
        const targetAuthObj = typeof selectedAuthority === "object"
          ? selectedAuthority
          : (authorities || []).find((a) => String(a.id) === String(selectedAuthority));

        if (targetAuthObj) {
          list = list.filter((u) => {
            if (isAuthForUnit(targetAuthObj, u)) return true;
            const compName = getCompanyName(u, companies);
            return isAuthForCompany(targetAuthObj, compName);
          });
        }
      }
    }

    if (unitTypeFilter === "root") {
      list = list.filter((u) => !u.parentId);
    } else if (unitTypeFilter === "sub") {
      list = list.filter((u) => !!u.parentId);
    }

    const q = (unitSearch || search).trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          (u.name || "").toLowerCase().includes(q) ||
          (u.code || "").toLowerCase().includes(q) ||
          (u.managerName || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [orgUnits, companies, authorities, selectedCompany, selectedAuthority, unitCompanyFilter, companyFilter, unitTypeFilter, unitSearch, search]);

  const paginatedOrgUnits = useMemo(() => {
    const start = (unitPage - 1) * unitPageSize;
    return filteredOrgUnits.slice(start, start + unitPageSize);
  }, [filteredOrgUnits, unitPage, unitPageSize]);

  const filteredAssignments = useMemo(() => {
    let list = assignments || [];
    if (selectedDepartment) {
      const deptId = typeof selectedDepartment === "object" ? selectedDepartment.id : selectedDepartment;
      list = list.filter((a) => String(a.organizationUnitId) === String(deptId));
    } else if (selectedAuthority) {
      const allowedUnitIds = new Set(filteredOrgUnits.map((u) => String(u.id)));
      list = list.filter((a) => allowedUnitIds.has(String(a.organizationUnitId)));
    } else if (selectedCompany) {
      const companyUnitIds = new Set(
        (orgUnits || [])
          .filter((u) => getCompanyName(u, companies) === selectedCompany)
          .map((u) => String(u.id))
      );
      list = list.filter((a) => companyUnitIds.has(String(a.organizationUnitId)));
    }
    if (staffDeptFilter !== "all" && !selectedDepartment) {
      list = list.filter((a) => String(a.organizationUnitId) === String(staffDeptFilter));
    }
    if (staffRoleFilter !== "all") {
      list = list.filter((a) => (a.role || a.designation || "").toLowerCase() === staffRoleFilter.toLowerCase());
    }
    const q = (staffSearch || search).trim().toLowerCase();
    if (q) {
      list = list.filter((a) => {
        const name = (a.userName || a.employeeName || a.name || "").toLowerCase();
        const code = (a.userEmpCode || a.empCode || "").toLowerCase();
        const dept = (a.organizationUnitName || a.departmentName || "").toLowerCase();
        return name.includes(q) || code.includes(q) || dept.includes(q);
      });
    }
    return list;
  }, [assignments, orgUnits, companies, filteredOrgUnits, selectedDepartment, selectedAuthority, selectedCompany, staffCompanyFilter, companyFilter, staffDeptFilter, staffRoleFilter, staffSearch, search]);

    // Authority matching memos for headers
  const companyMatchingAuths = useMemo(() => {
    if (!selectedCompany) return [];
    return (authorities || []).filter((a) => isAuthForCompany(a, selectedCompany));
  }, [authorities, selectedCompany]);

  const targetDepartmentUnit = useMemo(() => {
    if (!selectedDepartment) return null;
    return typeof selectedDepartment === "object"
      ? selectedDepartment
      : (orgUnits || []).find((u) => String(u.id) === String(selectedDepartment));
  }, [orgUnits, selectedDepartment]);

  const deptMatchingAuths = useMemo(() => {
    if (!targetDepartmentUnit) return [];
    return getUnitAuthorities(targetDepartmentUnit, authorities);
  }, [authorities, targetDepartmentUnit]);

  const paginatedAssignments = useMemo(() => {
    const start = (staffPage - 1) * staffPageSize;
    return filteredAssignments.slice(start, start + staffPageSize);
  }, [filteredAssignments, staffPage, staffPageSize]);

  // Set Default Zoom to 100% (zoom: 1.0)
  const fitKey = activeTab === "chart" && !loading && layoutedNodes.length > 0 ? layoutedNodes.length : null;
  const [prevFitKey, setPrevFitKey] = useState(fitKey);
  if (prevFitKey !== fitKey) {
    setPrevFitKey(fitKey);
    if (fitKey !== null) setZoomPct(100);
  }

  useEffect(() => {
    if (activeTab === "chart" && !loading && layoutedNodes.length > 0) {
      if (focusedUnitId) {
        fitView({ padding: 0.25, duration: 400 });
      } else {
        fitView({ minZoom: 1.0, maxZoom: 1.0, duration: 300 });
      }
    }
  }, [activeTab, loading, layoutedNodes.length, focusedUnitId, fitView]);

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
          onClick={() => setActiveTab("table")}
          className={`flex items-center gap-2 px-5 py-3 text-xs font-bold transition-all relative border-b-2 ${
            activeTab === "table"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          }`}
        >
          <Table size={15} />
          <span>Table View</span>
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
                onClick={handleOpenAddAuthority}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-extrabold bg-[#5850ec] hover:bg-[#4f46e5] text-white shadow-md transition-all duration-200 cursor-pointer active:scale-95"
              >
                <Plus size={15} className="text-white" /> Add Authority
              </button>
            )}

            <Button variant="secondary" size="sm" onClick={reloadData} title="Refresh Hierarchy" className="py-1.5">
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
              {/* LIST OF COMPANY TREES WITH INLINE AUTHORITIES */}
              {listCompaniesGroup.map((group) => {
                const companyAuths = (authorities || []).filter((auth) => isAuthForCompany(auth, group.companyName));

                return (
                  <div key={group.companyName} className="space-y-2">
                    {/* COMPANY AUTHORITIES - NO DROPDOWN TOGGLE */}
                    {companyAuths.map((auth) => (
                      <div key={`auth_comp_${auth.id}_${group.companyName}`} className="rounded-2xl border-2 border-purple-500 bg-purple-50/90 dark:border-purple-600 dark:bg-purple-950/70 p-3 shadow-md mb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {/* NO DROPDOWN CHEVRON FOR COMPANY AUTHORITY */}
                            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
                              <Globe size={18} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-xs font-extrabold tracking-wide uppercase text-purple-950 dark:text-purple-100">{auth.name}</h3>
                                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 dark:bg-purple-950 dark:text-purple-300">Authority</span>
                              </div>
                              <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-300">{auth.role || "Authority Parent"}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 text-xs font-bold text-purple-700 dark:text-purple-300">
                            <span className="flex items-center gap-1"><Users size={13} /> {group.totalStaff} Staff</span>
                            {!isLocked && (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleEditAuthority(auth)}
                                  title="Edit Authority"
                                  className="rounded p-1 text-purple-600 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-900/60"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleDeleteAuthority(auth)}
                                  title="Delete Authority"
                                  className="rounded p-1 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    {/* COMPANY CARD INDENTED UNDER COMPANY AUTHORITY WITH L-CONNECTOR |_ LINE */}
                    <div className={companyAuths.length > 0 ? "relative ml-6" : ""}>
                      {companyAuths.length > 0 && (
                        <div className="absolute -left-4 -top-3 h-8 w-4 border-l-2 border-b-2 border-purple-400 dark:border-purple-600 rounded-bl-lg pointer-events-none" />
                      )}
                      <Card
                        key={group.companyName}
                        padding={false}
                        className="overflow-hidden border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900 shadow-sm"
                      >
                      
                  {/* COMPANY HEADER */}
                  <div className="flex items-center justify-between border-b border-indigo-100 bg-indigo-50/60 px-4 py-3 dark:border-indigo-900/40 dark:bg-indigo-950/40">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
                        <Building2 size={17} />
                      </div>
                      <div>
                        <h3 className="text-sm font-extrabold text-gray-900 dark:text-white">{group.companyName}</h3>
                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                          
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

                  {/* HIERARCHICAL TREE ROWS FOR THIS COMPANY WITH PURE AUTHORITY GROUPING */}
                  {(() => {
                    if (group.rootUnits.length === 0) {
                      return (
                        <div className="py-6 text-center text-xs text-gray-400">
                          No departments found for {group.companyName}.
                        </div>
                      );
                    }

                    // Pure Functional Grouping of Root Units by Authority
                    const authGroupMap = new Map(); // authId -> { auth, units: [] }
                    const unassignedRootUnits = [];

                    group.rootUnits.forEach((rootUnit) => {
                      const matchingAuths = (authorities || []).filter((a) => isAuthForUnit(a, rootUnit));
                      if (matchingAuths.length > 0) {
                        const primaryAuth = matchingAuths[0];
                        if (!authGroupMap.has(primaryAuth.id)) {
                          authGroupMap.set(primaryAuth.id, { auth: primaryAuth, units: [] });
                        }
                        authGroupMap.get(primaryAuth.id).units.push(rootUnit);
                      } else {
                        unassignedRootUnits.push(rootUnit);
                      }
                    });

                    const authGroups = Array.from(authGroupMap.values());

                    return (
                      <div className="divide-y divide-gray-100 dark:divide-gray-800/60">
                        {/* 1. RENDER AUTHORITY GROUPS (ONE AUTHORITY CARD -> MULTIPLE DEPARTMENTS) */}
                        {authGroups.map(({ auth, units }) => {
                          const totalStaffForAuth = units.reduce((acc, u) => {
                            return acc + assignments.filter((a) => String(a.organizationUnitId) === String(u.id)).length;
                          }, 0);

                          return (
                            <div key={`auth_group_${auth.id}`} className="mb-3">
                              {/* SINGLE AUTHORITY CARD MATCHING SOHIL HR AUTHORITY CARD DESIGN */}
                              <div className="rounded-2xl border-2 border-purple-500 bg-purple-50/90 dark:border-purple-600 dark:bg-purple-950/70 p-3 shadow-md mb-2">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
                                      <Globe size={18} />
                                    </div>
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <h3 className="text-xs font-extrabold tracking-wide uppercase text-purple-950 dark:text-purple-100">{auth.name}</h3>
                                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-extrabold text-purple-700 dark:bg-purple-950 dark:text-purple-300">Authority</span>
                                      </div>
                                      <span className="text-[10px] font-semibold text-purple-600 dark:text-purple-300">{auth.role || "Authority Parent"}</span>
                                    </div>
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0 text-xs font-bold text-purple-700 dark:text-purple-300">
                                    <span className="flex items-center gap-1"><Users size={13} /> {totalStaffForAuth} Staff</span>
                                    {!isLocked && (
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={() => handleEditAuthority(auth)}
                                          title="Edit Authority"
                                          className="rounded p-1 text-purple-600 hover:bg-purple-100 dark:text-purple-300 dark:hover:bg-purple-900/60"
                                        >
                                          <Edit2 size={13} />
                                        </button>
                                        <button
                                          onClick={() => handleDeleteAuthority(auth)}
                                          title="Delete Authority"
                                          className="rounded p-1 text-red-500 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/60"
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* DEPARTMENTS INDENTED UNDER AUTHORITY WITH SOHIL-MATCHING CONNECTORS */}
                              <div className="relative ml-6 space-y-2">
                                {units.map((unit, idx) => {
                                  const isFirst = idx === 0;
                                  const isLast = idx === units.length - 1;

                                  return (
                                    <div key={unit.id} className="relative">
                                      {/* SINGLE UNIT CONNECTOR MATCHING SOHIL -> NIDHI IMPEX EXACT DESIGN */}
                                      {units.length === 1 && (
                                        <div className="absolute -left-4 -top-3.5 h-8 w-4 border-l-2 border-b-2 border-purple-400 dark:border-purple-600 rounded-bl-lg pointer-events-none" />
                                      )}

                                      {/* MULTI-UNIT CONTINUOUS CONNECTOR MATCHING SOHIL -> NIDHI IMPEX EXACT DESIGN */}
                                      {units.length > 1 && (
                                        <>
                                          <div
                                            className={`absolute -left-4 border-l-2 border-purple-400 dark:border-purple-600 pointer-events-none ${
                                              isFirst ? "-top-3.5" : "top-0"
                                            } ${isLast ? "h-6.5 rounded-bl-lg border-b-2" : "bottom-0"}`}
                                            style={{ width: isLast ? "16px" : "0px" }}
                                          />
                                          {!isLast && (
                                            <div className="absolute -left-4 top-4.5 w-4 border-b-2 border-purple-400 dark:border-purple-600 pointer-events-none" />
                                          )}
                                        </>
                                      )}

                                      <ListTreeUnitRow
                                        unit={unit}
                                        depth={0}
                                        allUnits={group.units}
                                        assignments={assignments}
                                        companies={companies}
                                        authorities={authorities}
                                        isLocked={isLocked}
                                        onEditAuthority={handleEditAuthority}
                                        onDeleteAuthority={handleDeleteAuthority}
                                        search={search}
                                        setRosterTarget={setRosterTarget}
                                        setDeptModal={setDeptModal}
                                        setMoveModal={setMoveModal}
                                        handleDeleteDept={handleDeleteDept}
                                        expandedIds={expandedIds}
                                        toggleExpand={toggleExpand}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}

                        {/* 2. RENDER UNASSIGNED ROOT UNITS */}
                        {unassignedRootUnits.map((rootUnit) => (
                          <ListTreeUnitRow
                            key={rootUnit.id}
                            unit={rootUnit}
                            depth={0}
                            allUnits={group.units}
                            assignments={assignments}
                            companies={companies}
                            authorities={authorities}
                            isLocked={isLocked}
                            onEditAuthority={handleEditAuthority}
                            onDeleteAuthority={handleDeleteAuthority}
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
                    );
                  })()}
                </Card>
                    </div>
                  </div>
                );
              })}
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

                                    {/* TAB 2: TABLE VIEW (RECRUITMENT-STYLE DRILL-DOWN: COMPANY -> AUTHORITY -> DEPARTMENT -> EMPLOYEES) */}
      {activeTab === "table" && (
        <div className="space-y-5">
          {loading ? (
            <Card className="flex h-64 flex-col items-center justify-center gap-2 text-gray-500">
              <RefreshCw size={24} className="animate-spin text-brand-600" />
              <p className="text-xs font-semibold">Loading hierarchy table data...</p>
            </Card>
          ) : (
            <>
              {/* LEVEL 1: COMPANIES TABLE */}
              {drillLevel === "companies" && (
                <Card className="p-5 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-2xl flex flex-col">
                  {/* STICKY SECTION HEADER */}
                  <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pb-3 mb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400">
                          <Building2 size={18} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white">Organization Companies</h3>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Select any company below to view its authorities and department pipeline
                          </p>
                        </div>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-brand-50 dark:bg-brand-950/80 text-brand-700 dark:text-brand-300">
                        {filteredCompaniesList.length} Companies
                      </span>
                    </div>

                    {/* SEARCH ROW */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search company name..."
                          value={unitSearch}
                          onChange={(e) => {
                            setUnitSearch(e.target.value);
                            setCompanyPage(1);
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-1.5 pl-9 pr-3 text-xs focus:border-brand-500 focus:bg-white focus:outline-none dark:border-gray-800 dark:bg-gray-800/50 dark:text-white dark:focus:border-brand-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SCROLLABLE TABLE CONTAINER */}
                  <div className="max-h-[380px] overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-800/60 rounded-xl">
                    {filteredCompaniesList.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-6 text-center">No companies matching criteria</p>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 shadow-sm">
                          <tr className="text-gray-400 uppercase text-[10px] tracking-wider">
                            <th className="py-3 px-4 font-bold">Company Name</th>
                            <th className="py-3 px-4 font-bold">Code</th>
                            <th className="py-3 px-4 font-bold text-center">Authorities</th>
                            <th className="py-3 px-4 font-bold text-center">Departments</th>
                            <th className="py-3 px-4 font-bold text-center">Employees</th>
                            <th className="py-3 px-4 font-bold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                          {paginatedCompaniesList.map((comp) => {
                            const compAuths = getCompanyAuthorities(comp.name, authorities, orgUnits, companies);
                            const compDepts = (orgUnits || []).filter((u) => getCompanyName(u, companies) === comp.name);
                            const compStaff = (assignments || []).filter((a) => {
                              const u = (orgUnits || []).find((unit) => String(unit.id) === String(a.organizationUnitId));
                              return u && getCompanyName(u, companies) === comp.name;
                            });

                            return (
                              <tr key={comp.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all">
                                <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                  <div className="p-1.5 rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-950 dark:text-brand-400">
                                    <Building2 size={14} />
                                  </div>
                                  <span className="text-xs font-bold">{comp.name}</span>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-gray-500 dark:text-gray-400">
                                  {comp.code || comp.id}
                                </td>
                                <td className="py-3.5 px-4 text-center font-bold text-purple-600 dark:text-purple-400">
                                  {compAuths.length} Authorities
                                </td>
                                <td className="py-3.5 px-4 text-center font-bold text-gray-600 dark:text-gray-400">
                                  {compDepts.length} Departments
                                </td>
                                <td className="py-3.5 px-4 text-center font-bold text-brand-600 dark:text-brand-400">
                                  {compStaff.length} Employees
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    onClick={() => {
                                      setSelectedCompany(comp.name);
                                      setSelectedAuthority(null);
                                      setSelectedDepartment(null);
                                      setUnitPage(1);
                                      setStaffPage(1);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/60 transition-all cursor-pointer shadow-2xs"
                                  >
                                    View Departments <ChevronRight size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* PAGINATION FOOTER */}
                  <DataTablePagination
                    currentPage={companyPage}
                    pageSize={companyPageSize}
                    totalItems={filteredCompaniesList.length}
                    onPageChange={setCompanyPage}
                    onPageSizeChange={setCompanyPageSize}
                  />
                </Card>
              )}

              {/* LEVEL 2: AUTHORITIES TABLE (DRILLED INTO COMPANY) */}
              {drillLevel === "authorities" && (
                <Card className="p-5 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-2xl flex flex-col">
                  {/* RECRUITMENT-STYLE HEADER BAR WITH BACK BUTTON */}
                  <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pb-3 mb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => {
                            setSelectedCompany(null);
                            setAuthPage(1);
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer"
                        >
                          <ArrowLeft size={14} /> Back to Companies
                        </button>
                        <div>
                          <h3 className="text-base font-bold text-gray-900 dark:text-white">{selectedCompany}</h3>
                          <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">
                            {filteredAuthorities.length} authorities in this company
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SEARCH ROW */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search authority name or role..."
                          value={authSearch}
                          onChange={(e) => {
                            setAuthSearch(e.target.value);
                            setAuthPage(1);
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-1.5 pl-9 pr-3 text-xs focus:border-brand-500 focus:bg-white focus:outline-none dark:border-gray-800 dark:bg-gray-800/50 dark:text-white dark:focus:border-brand-400"
                        />
                      </div>
                    </div>
                  </div>

                  {/* SCROLLABLE TABLE CONTAINER */}
                  <div className="max-h-[380px] overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-800/60 rounded-xl">
                    {filteredAuthorities.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-6 text-center">No authorities found for {selectedCompany}</p>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 shadow-sm">
                          <tr className="text-gray-400 uppercase text-[10px] tracking-wider">
                            <th className="py-3 px-4 font-bold">Authority Name</th>
                            <th className="py-3 px-4 font-bold">Designation / Role</th>
                            <th className="py-3 px-4 font-bold">Assigned Scope</th>
                            <th className="py-3 px-4 font-bold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                          {paginatedAuthorities.map((auth) => {
                            return (
                              <tr key={auth.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all">
                                <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                  <ShieldCheck size={14} className="text-purple-500 shrink-0" />
                                  <span>{auth.name || auth.authorityName || "Authority"}</span>
                                </td>
                                <td className="py-3.5 px-4 text-purple-600 dark:text-purple-400 font-medium">
                                  {auth.role || auth.authorityRole || "Authority"}
                                </td>
                                <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300 font-medium">
                                  {(() => {
                                    const matchingComps = (companies || []).filter((c) => isAuthForCompany(auth, c.name)).map((c) => `${c.name} (Company)`);
                                    const matchingUnits = (orgUnits || []).filter((u) => isAuthForUnit(auth, u)).map((u) => `${u.name} (Dept)`);
                                    const allMatched = [...matchingComps, ...matchingUnits];
                                    return allMatched.length > 0 ? allMatched.join(", ") : (selectedCompany || "All Companies");
                                  })()}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <button
                                      onClick={() => handleEditAuthority(auth)}
                                      className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-brand-600 dark:hover:bg-gray-800 transition-all cursor-pointer"
                                      title="Edit Authority"
                                    >
                                      <Edit2 size={13} />
                                    </button>
                                    <button
                                      onClick={() => setDeleteConfirm({ type: "authority", id: auth.id, name: auth.name })}
                                      className="p-1.5 rounded-lg text-gray-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 transition-all cursor-pointer"
                                      title="Delete Authority"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                    <button
                                      onClick={() => {
                                        setSelectedAuthority(auth);
                                        setUnitPage(1);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 text-[11px] font-bold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/60 transition-all cursor-pointer shadow-2xs"
                                    >
                                      View Departments <ChevronRight size={13} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* PAGINATION FOOTER */}
                  <DataTablePagination
                    currentPage={authPage}
                    pageSize={authPageSize}
                    totalItems={filteredAuthorities.length}
                    onPageChange={setAuthPage}
                    onPageSizeChange={setAuthPageSize}
                  />
                </Card>
              )}

              {/* LEVEL 3: DEPARTMENTS TABLE (DRILLED INTO COMPANY / AUTHORITY) */}
              {drillLevel === "departments" && (
                <Card className="p-5 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-2xl flex flex-col">
                  {/* STICKY SECTION HEADER WITH BACK BUTTON AND COMPANY AUTHORITY BADGE */}
                  <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pb-3 mb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => {
                            if (selectedAuthority) {
                              setSelectedAuthority(null);
                            } else {
                              setSelectedCompany(null);
                            }
                            setUnitPage(1);
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer shadow-2xs"
                        >
                          <ArrowLeft size={14} /> {selectedAuthority ? "Back to Authorities" : "Back to Companies"}
                        </button>
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">
                              {selectedAuthority
                                ? typeof selectedAuthority === "object"
                                  ? selectedAuthority.name || selectedAuthority.authorityName
                                  : "Authority"
                                : selectedCompany}
                            </h3>
                            {!selectedAuthority && companyMatchingAuths.length > 0 && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold shadow-2xs">
                                <ShieldCheck size={14} className="text-purple-600 dark:text-purple-400" />
                                <span>
                                  Authority: {companyMatchingAuths.map((a) => `${a.name || a.authorityName || "Authority"}${a.role || a.authorityRole ? ` (${a.role || a.authorityRole})` : ""}`).join(", ")}
                                </span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-brand-600 dark:text-brand-400 font-medium mt-0.5">
                            {filteredOrgUnits.length} departments {selectedAuthority ? "under this authority" : "in this company"}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SEARCH & FILTERS ROW */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search department name, code, manager..."
                          value={unitSearch}
                          onChange={(e) => {
                            setUnitSearch(e.target.value);
                            setUnitPage(1);
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-1.5 pl-9 pr-3 text-xs focus:border-brand-500 focus:bg-white focus:outline-none dark:border-gray-800 dark:bg-gray-800/50 dark:text-white dark:focus:border-brand-400"
                        />
                      </div>

                      <select
                        value={unitTypeFilter}
                        onChange={(e) => {
                          setUnitTypeFilter(e.target.value);
                          setUnitPage(1);
                        }}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200 focus:border-brand-500 focus:outline-none cursor-pointer"
                      >
                        <option value="all">All Unit Types</option>
                        <option value="root">Company Root Units</option>
                        <option value="sub">Sub-Departments</option>
                      </select>
                    </div>
                  </div>

                  {/* SCROLLABLE TABLE CONTAINER */}
                  <div className="max-h-[380px] overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-800/60 rounded-xl">
                    {filteredOrgUnits.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-6 text-center">No departments found</p>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 shadow-sm">
                          <tr className="text-gray-400 uppercase text-[10px] tracking-wider">
                            <th className="py-3 px-4 font-bold">Unit / Department Name</th>
                            <th className="py-3 px-4 font-bold">Code</th>
                            <th className="py-3 px-4 font-bold">Company</th>
                            <th className="py-3 px-4 font-bold">Authority</th>
                            <th className="py-3 px-4 font-bold">Parent Unit</th>
                            <th className="py-3 px-4 font-bold text-center">Staff</th>
                            <th className="py-3 px-4 font-bold text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                          {paginatedOrgUnits.map((unit) => {
                            const compName = getCompanyName(unit, companies);
                            const parentUnit = orgUnits.find((u) => String(u.id) === String(unit.parentId));
                            const unitStaff = assignments.filter((a) => String(a.organizationUnitId) === String(unit.id));

                            const directAuths = getUnitAuthorities(unit, authorities);
                            const authDisplay = directAuths.length > 0
                              ? directAuths.map((a) => a.name || a.authorityName || "Authority").join(", ")
                              : "Unallocated";

                            return (
                              <tr key={unit.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all">
                                <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                  <Building2 size={14} className="text-brand-500 shrink-0" />
                                  <span>{unit.name}</span>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-gray-500 dark:text-gray-400">
                                  {unit.code || `#${unit.id}`}
                                </td>
                                <td className="py-3.5 px-4 font-semibold text-brand-600 dark:text-brand-400">
                                  {compName}
                                </td>
                                <td className="py-3.5 px-4 font-medium">
                                  {directAuths.length > 0 ? (
                                    <span className="text-purple-600 dark:text-purple-400 font-bold">{authDisplay}</span>
                                  ) : (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                                      Unallocated
                                    </span>
                                  )}
                                </td>
                                <td className="py-3.5 px-4 text-gray-600 dark:text-gray-300">
                                  {parentUnit ? parentUnit.name : "—"}
                                </td>
                                <td className="py-3.5 px-4 text-center font-bold text-brand-600 dark:text-brand-400">
                                  {unitStaff.length} Employees
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    onClick={() => {
                                      setSelectedDepartment(unit);
                                      setStaffPage(1);
                                    }}
                                    className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-800 px-3 py-1.5 text-[11px] font-bold text-brand-600 dark:text-brand-400 hover:bg-brand-50 dark:hover:bg-brand-950/60 transition-all cursor-pointer shadow-2xs"
                                  >
                                    View Employees <ChevronRight size={13} />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* PAGINATION FOOTER */}
                  <DataTablePagination
                    currentPage={unitPage}
                    pageSize={unitPageSize}
                    totalItems={filteredOrgUnits.length}
                    onPageChange={setUnitPage}
                    onPageSizeChange={setUnitPageSize}
                  />
                </Card>
              )}

              {/* LEVEL 4: EMPLOYEES TABLE (DRILLED INTO DEPARTMENT) */}
              {drillLevel === "employees" && (
                <Card className="p-5 border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm rounded-2xl flex flex-col">
                  {/* STICKY SECTION HEADER WITH DYNAMIC AUTHORITY BADGE */}
                  <div className="sticky top-0 z-20 bg-white dark:bg-gray-900 pb-3 mb-3 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedDepartment(null);
                            setStaffPage(1);
                          }}
                          className="flex items-center gap-1.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all cursor-pointer shadow-2xs"
                        >
                          <ArrowLeft size={14} /> Back to Departments
                        </button>
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h3 className="text-base font-bold text-gray-900 dark:text-white">
                              {targetDepartmentUnit ? targetDepartmentUnit.name : "Department"}
                            </h3>
                            {deptMatchingAuths.length > 0 && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-200 dark:border-purple-800 text-xs font-bold shadow-2xs">
                                <ShieldCheck size={14} className="text-purple-600 dark:text-purple-400" />
                                <span>
                                  Authority: {deptMatchingAuths.map((a) => `${a.name || a.authorityName || "Authority"}${a.role || a.authorityRole ? ` (${a.role || a.authorityRole})` : ""}`).join(", ")}
                                </span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mt-0.5">
                            {filteredAssignments.length} employees in this department pipeline
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* SEARCH & FILTERS ROW */}
                    <div className="flex flex-wrap items-center gap-2.5">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search employee name, code, role..."
                          value={staffSearch}
                          onChange={(e) => {
                            setStaffSearch(e.target.value);
                            setStaffPage(1);
                          }}
                          className="w-full rounded-xl border border-gray-200 bg-gray-50/50 py-1.5 pl-9 pr-3 text-xs focus:border-brand-500 focus:bg-white focus:outline-none dark:border-gray-800 dark:bg-gray-800/50 dark:text-white dark:focus:border-brand-400"
                        />
                      </div>

                      <select
                        value={staffRoleFilter}
                        onChange={(e) => {
                          setStaffRoleFilter(e.target.value);
                          setStaffPage(1);
                        }}
                        className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-700 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-200 focus:border-brand-500 focus:outline-none cursor-pointer"
                      >
                        <option value="all">All Roles</option>
                        <option value="Manager">Manager</option>
                        <option value="Employee">Employee</option>
                        <option value="Staff Member">Staff Member</option>
                      </select>
                    </div>
                  </div>

                  {/* SCROLLABLE TABLE CONTAINER */}
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar border border-gray-100 dark:border-gray-800/60 rounded-xl">
                    {filteredAssignments.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-6 text-center">No staff members in this department</p>
                    ) : (
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm border-b border-gray-200 dark:border-gray-800 shadow-sm">
                          <tr className="text-gray-400 uppercase text-[10px] tracking-wider">
                            <th className="py-3 px-4 font-bold">Employee</th>
                            <th className="py-3 px-4 font-bold">Emp Code</th>
                            <th className="py-3 px-4 font-bold">Role / Designation</th>
                            <th className="py-3 px-4 font-bold">Department / Unit</th>
                            <th className="py-3 px-4 font-bold">Company</th>
                            <th className="py-3 px-4 font-bold text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-gray-900">
                          {paginatedAssignments.map((a) => {
                            const empName = a.userName || a.employeeName || a.name || "Staff Member";
                            const empCode = a.userEmpCode || a.empCode || "—";
                            const photoUrl = getEmployeePhotoUrl(a.userPhoto || a.photo || a.userAvatar);
                            const unit = (orgUnits || []).find((u) => String(u.id) === String(a.organizationUnitId));
                            const compName = unit ? getCompanyName(unit, companies) : (a.companyName || "—");

                            return (
                              <tr key={a.id || `${a.userId}-${a.organizationUnitId}`} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-all">
                                <td className="py-3.5 px-4 font-bold text-gray-900 dark:text-white flex items-center gap-2.5">
                                  <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-full bg-brand-50 dark:bg-brand-900/40 text-brand-600 dark:text-brand-400 font-bold flex items-center justify-center text-[10px] border border-brand-200 dark:border-brand-800/60">
                                    <span>{initials(empName)}</span>
                                    {photoUrl && (
                                      <img
                                        src={photoUrl}
                                        alt={empName}
                                        className="absolute inset-0 h-full w-full object-cover rounded-full"
                                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                                      />
                                    )}
                                  </div>
                                  <span className="truncate font-bold">{empName}</span>
                                </td>
                                <td className="py-3.5 px-4 font-mono text-gray-500 dark:text-gray-400">
                                  {empCode}
                                </td>
                                <td className="py-3.5 px-4 text-gray-700 dark:text-gray-300 font-medium">
                                  {a.role || a.designation || "Staff Member"}
                                </td>
                                <td className="py-3.5 px-4 font-medium text-gray-700 dark:text-gray-300">
                                  {unit ? unit.name : (a.organizationUnitName || "—")}
                                </td>
                                <td className="py-3.5 px-4 font-semibold text-brand-600 dark:text-brand-400">
                                  {compName}
                                </td>
                                <td className="py-3.5 px-4 text-right">
                                  <button
                                    onClick={() => handleOpenStaffDetails(a)}
                                    className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2.5 py-1 text-[11px] font-extrabold text-brand-600 hover:bg-brand-100 dark:bg-brand-950/60 dark:text-brand-400 transition-all cursor-pointer shadow-2xs"
                                  >
                                    <Eye size={12} /> View
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* PAGINATION FOOTER */}
                  <DataTablePagination
                    currentPage={staffPage}
                    pageSize={staffPageSize}
                    totalItems={filteredAssignments.length}
                    onPageChange={setStaffPage}
                    onPageSizeChange={setStaffPageSize}
                  />
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* TAB 3: CHART VIEW */}
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
              <Button size="sm" onClick={reloadData}>Retry</Button>
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
            setEditingAuthId(null);
            setNewAuthName("");
            setNewAuthRole("");
            setSelectedChildIds([]);
          }}
          title={editingAuthId ? "Edit Organizational Authority" : "Add Organizational Authority"}
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

              <div className="max-h-[280px] overflow-y-auto space-y-3 rounded-xl border border-gray-200 bg-gray-50/50 p-3 dark:border-gray-800 dark:bg-gray-800/50">
                {["Nidhi Impex", "Silver Star"].map((cName) => {
                  const compId = `comp_${cName.replace(/\s+/g, "_")}`;
                  const isCompChecked = selectedChildIds.includes(compId);
                  const compDepts = orgUnits.filter(
                    (u) => getCompanyName(u, companies).toLowerCase() === cName.toLowerCase()
                  );

                  return (
                    <div key={cName} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900 shadow-sm space-y-2">
                      {/* COMPANY HEADER WITH CHECKBOX */}
                      <label className="flex items-center gap-2 text-xs font-extrabold text-indigo-900 dark:text-indigo-200 cursor-pointer border-b border-indigo-100 dark:border-indigo-900/50 pb-2">
                        <input
                          type="checkbox"
                          checked={isCompChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedChildIds((prev) => [...prev, compId]);
                            } else {
                              setSelectedChildIds((prev) => prev.filter((id) => id !== compId));
                            }
                          }}
                          className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        />
                        <Building2 size={16} className="text-indigo-600 dark:text-indigo-400" />
                        <span>{cName}</span>
                        <span className="text-[10px] font-medium text-gray-500 ml-auto">({compDepts.length} Departments)</span>
                      </label>

                      {/* GROUPED DEPARTMENTS FOR THIS COMPANY */}
                      {compDepts.length === 0 ? (
                        <p className="text-[11px] text-gray-400 italic pl-6 py-1">No departments found for {cName}</p>
                      ) : (
                        <div className="pl-4 pt-1 space-y-1.5 border-l-2 border-indigo-100 dark:border-indigo-950 ml-2">
                          {compDepts.map((u) => {
                            const uId = `unit_${u.id}`;
                            const isDeptChecked = selectedChildIds.includes(uId);

                            return (
                              <label key={uId} className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                                <input
                                  type="checkbox"
                                  checked={isDeptChecked}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedChildIds((prev) => [...prev, uId]);
                                    } else {
                                      setSelectedChildIds((prev) => prev.filter((id) => id !== uId));
                                    }
                                  }}
                                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                />
                                <FolderTree size={13} className="text-purple-500" />
                                <span className="font-medium">{u.name}</span>
                                {u.code && <span className="font-mono text-[10px] text-gray-400">#{u.code}</span>}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <footer className="mt-6 flex justify-end gap-2 border-t pt-4 dark:border-gray-800">
              <button
                type="button"
                onClick={() => setAuthorityModalOpen(false)}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-gray-700 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveAuthority}
                disabled={!newAuthName.trim()}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-xs font-extrabold bg-[#5850ec] hover:bg-[#4f46e5] disabled:bg-purple-300 disabled:cursor-not-allowed text-white shadow-md transition-all duration-200 cursor-pointer active:scale-95"
              >
                {editingAuthId ? "Update Authority" : "Save Authority"}
              </button>
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

      {/* EMPLOYEE DETAILS MODAL FOR CONNECTED STAFF NODES */}
      {staffModalOpen && (
        <EmployeeDetailsModal
          isOpen={staffModalOpen}
          onClose={() => setStaffModalOpen(false)}
          selected={selectedStaffUser}
          viewLoading={staffViewLoading}
          hideEdit={true}
          allowedTabs={["profile", "employment", "address"]}
        />
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
