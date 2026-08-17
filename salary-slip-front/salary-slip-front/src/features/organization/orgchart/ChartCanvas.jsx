import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  applyNodeChanges, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Search, SlidersHorizontal, LayoutGrid, Undo2, Redo2, Maximize2, Download,
  ZoomIn, ZoomOut, Loader2,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import { nodeTypes, nodeKindFor } from "./nodes";
import { layoutElements, pruneCollapsed } from "./layout";
import { parseNodeId } from "./nodeId";
import { exportCsv, exportJson, exportExcel, exportPng, exportPdf, exportSvg } from "./export";

const DIRECTIONS = [
  { value: "TB", label: "Top → Bottom" },
  { value: "LR", label: "Left → Right" },
  { value: "BT", label: "Bottom → Top" },
  { value: "RL", label: "Right → Left" },
];
const SPACINGS = [
  { value: "compact", label: "Compact" },
  { value: "balanced", label: "Balanced" },
  { value: "expanded", label: "Expanded" },
];

function toFlowElements(chart, orgUnits, { collapsedIds, onQuickAdd, onToggleCollapse }) {
  const unitsById = new Map(orgUnits.map((u) => [u.id, u]));
  const reportCounts = new Map();
  (chart.edges || []).forEach((e) => reportCounts.set(e.source, (reportCounts.get(e.source) || 0) + 1));

  const nodes = (chart.nodes || []).map((apiNode) => {
    const { rawId } = parseNodeId(apiNode.id);
    const kind = nodeKindFor(apiNode.type);
    const unit = kind === "department" ? unitsById.get(rawId) : null;

    return {
      id: apiNode.id,
      type: kind,
      position: { x: 0, y: 0 },
      data: {
        ...apiNode,
        rawId,
        hasChildren: unit?.hasChildren ?? false,
        reportCount: reportCounts.get(apiNode.id) || 0,
        metadata: { ...(apiNode.metadata || {}), parentId: unit?.parentId ?? null },
        onQuickAdd,
        onToggleCollapse,
      },
    };
  });

  const edges = (chart.edges || []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: "smoothstep",
    style: { stroke: "#9ca3af", strokeWidth: 1.5 },
  }));

  // The position chart only edges position → position via reports_to_position_id,
  // so a position with no reports-to (the top of its unit's chain) has no
  // incoming edge at all. Synthesize unit → position edges for those so they
  // nest under their department instead of floating as disconnected nodes —
  // display-only, nothing is written back.
  const nodeIds = new Set(nodes.map((n) => n.id));
  const hasIncoming = new Set(edges.map((e) => e.target));
  nodes.forEach((n) => {
    if (n.type !== "position" || hasIncoming.has(n.id)) return;
    const unitId = n.data.metadata?.organizationUnitId;
    const unitNodeId = unitId ? `org_unit_${unitId}` : null;
    if (unitNodeId && nodeIds.has(unitNodeId)) {
      edges.push({
        id: `edge_synthetic_${unitNodeId}_${n.id}`,
        source: unitNodeId,
        target: n.id,
        type: "smoothstep",
        style: { stroke: "#d1d5db", strokeWidth: 1, strokeDasharray: "4 3" },
      });
    }
  });

  const pruned = pruneCollapsed(nodes, edges, collapsedIds);
  pruned.nodes.forEach((n) => { n.data.hasHiddenChildren = pruned.hiddenChildrenOf.has(n.id); });
  return pruned;
}

function Toolbar({
  searchValue, onSearchChange, direction, setDirection, spacing, setSpacing,
  history, onFullscreen, onExport, activeFilterCount, onOpenFilters, zoomPct,
}) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { zoomIn, zoomOut } = useReactFlow();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          aria-label="Search in chart"
          placeholder="Search in chart…"
          className="w-52 rounded-lg border border-gray-300 bg-white py-1.5 pl-8 pr-3 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>

      <Button variant="secondary" size="sm" onClick={onOpenFilters}>
        <SlidersHorizontal size={14} /> Filter{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
      </Button>

      <div className="relative">
        <Button variant="secondary" size="sm" onClick={() => setLayoutOpen((v) => !v)}>
          <LayoutGrid size={14} /> Layout
        </Button>
        {layoutOpen && (
          <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <p className="px-1 text-[10px] font-semibold uppercase text-gray-400">Direction</p>
            {DIRECTIONS.map((d) => (
              <button key={d.value} onClick={() => { setDirection(d.value); setLayoutOpen(false); }}
                className={`block w-full rounded px-2 py-1 text-left text-xs ${direction === d.value ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                {d.label}
              </button>
            ))}
            <p className="mt-1 px-1 text-[10px] font-semibold uppercase text-gray-400">Spacing</p>
            {SPACINGS.map((s) => (
              <button key={s.value} onClick={() => { setSpacing(s.value); setLayoutOpen(false); }}
                className={`block w-full rounded px-2 py-1 text-left text-xs ${spacing === s.value ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Button variant="secondary" size="sm" title="Undo" disabled={!history.canUndo || history.pending} onClick={history.undo}>
        {history.pending ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
      </Button>
      <Button variant="secondary" size="sm" title="Redo" disabled={!history.canRedo || history.pending} onClick={history.redo}>
        <Redo2 size={14} />
      </Button>

      <div className="flex items-center gap-1 rounded-lg border border-gray-200 px-1 dark:border-gray-700">
        <button onClick={() => zoomOut()} className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><ZoomOut size={14} /></button>
        <span className="w-10 text-center text-xs text-gray-500">{zoomPct}%</span>
        <button onClick={() => zoomIn()} className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"><ZoomIn size={14} /></button>
      </div>

      <Button variant="secondary" size="sm" title="Fullscreen" onClick={onFullscreen}>
        <Maximize2 size={14} />
      </Button>

      <div className="relative ml-auto">
        <Button variant="secondary" size="sm" onClick={() => setExportOpen((v) => !v)}>
          <Download size={14} /> Export
        </Button>
        {exportOpen && (
          <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-lg border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            {["PNG", "SVG", "PDF", "CSV", "JSON", "Excel"].map((format) => (
              <button key={format} onClick={() => { onExport(format); setExportOpen(false); }}
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-gray-100 dark:hover:bg-gray-700">
                {format}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ChartCanvasInner({
  chart, orgUnits, selectedNodeId, onSelectNode, onQuickAdd, onOpenFilters, activeFilterCount,
  searchValue, onSearchChange, history, onConnectNodes, onDragMove, loading, onImportLegacy, canImportLegacy,
}) {
  const [direction, setDirection] = useState("TB");
  const [spacing, setSpacing] = useState("balanced");
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const [rfNodes, setRfNodes] = useState([]);
  const [rfEdges, setRfEdges] = useState([]);
  const [zoomPct, setZoomPct] = useState(100);
  const wrapperRef = useRef(null);
  const hasSeededCollapseRef = useRef(false);
  const { getIntersectingNodes, getViewport, fitView } = useReactFlow();

  const toggleCollapse = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // Employee nodes (one per person, via their department assignment) can
  // easily outnumber every other node combined on a real org. Rather than
  // dumping all of them on screen at once, a department with more than a
  // handful of children starts collapsed — same expand affordance either
  // way, just a sane first paint. Runs once per fresh chart load, so it
  // doesn't fight a user who deliberately re-expanded something.
  useEffect(() => {
    if (hasSeededCollapseRef.current || !chart?.nodes?.length) return undefined;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      hasSeededCollapseRef.current = true;
      const childCounts = new Map();
      (chart.edges || []).forEach((e) => childCounts.set(e.source, (childCounts.get(e.source) || 0) + 1));
      const defaults = new Set(
        chart.nodes.filter((n) => n.type === "department" && (childCounts.get(n.id) || 0) > 6).map((n) => n.id),
      );
      if (defaults.size > 0) setCollapsedIds(defaults);
    });
    return () => { active = false; };
  }, [chart]);

  const laidOut = useMemo(
    () => toFlowElements(chart, orgUnits, { collapsedIds, onQuickAdd, onToggleCollapse: toggleCollapse }),
    [chart, orgUnits, collapsedIds, onQuickAdd, toggleCollapse],
  );

  // Recomputing rfNodes/rfEdges here (rather than useMemo) is deliberate:
  // React Flow's onNodesChange needs to keep mutating this same state for
  // manual drags between layout recomputations. The setState calls are
  // deferred past a microtask so they run as an async continuation rather
  // than synchronously in the effect body, matching this codebase's other
  // data-driven effects.
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      const positioned = layoutElements(laidOut.nodes, laidOut.edges, { direction, spacing });
      setRfNodes(positioned.map((n) => ({ ...n, selected: n.id === selectedNodeId })));
      setRfEdges(laidOut.edges);
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidOut, direction, spacing]);

  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (active) setRfNodes((prev) => prev.map((n) => ({ ...n, selected: n.id === selectedNodeId })));
    });
    return () => { active = false; };
  }, [selectedNodeId]);

  const onNodesChange = useCallback((changes) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleNodeClick = useCallback((_event, node) => onSelectNode(node), [onSelectNode]);

  const handleNodeDragStop = useCallback((_event, node) => {
    const overlapping = getIntersectingNodes(node).filter((n) => n.id !== node.id);
    if (overlapping.length > 0) {
      onDragMove(node, overlapping[0]);
    }
  }, [getIntersectingNodes, onDragMove]);

  const handleConnect = useCallback((connection) => {
    onConnectNodes(connection.source, connection.target);
  }, [onConnectNodes]);

  const handleMove = useCallback(() => {
    setZoomPct(Math.round(getViewport().zoom * 100));
  }, [getViewport]);

  useEffect(() => {
    if (!searchValue) return;
    const term = searchValue.toLowerCase();
    const match = rfNodes.find((n) => (n.data.name || "").toLowerCase().includes(term));
    if (match) fitView({ nodes: [{ id: match.id }], duration: 300, maxZoom: 1.2 });
  }, [searchValue, rfNodes, fitView]);

  const requestFullscreen = () => {
    if (wrapperRef.current?.requestFullscreen) wrapperRef.current.requestFullscreen();
  };

  const runExport = async (format) => {
    const viewportEl = wrapperRef.current?.querySelector(".react-flow__viewport");
    if (format === "CSV") return exportCsv(chart);
    if (format === "JSON") return exportJson(chart);
    if (format === "Excel") return exportExcel(chart);
    if (!viewportEl) return;
    if (format === "PNG") return exportPng(viewportEl, chart);
    if (format === "PDF") return exportPdf(viewportEl, chart);
    if (format === "SVG") return exportSvg(viewportEl, chart);
    return undefined;
  };

  return (
    <div ref={wrapperRef} className="flex h-full flex-col bg-gray-50 dark:bg-gray-900">
      <Toolbar
        searchValue={searchValue} onSearchChange={onSearchChange}
        direction={direction} setDirection={setDirection}
        spacing={spacing} setSpacing={setSpacing}
        history={history} onFullscreen={requestFullscreen} onExport={runExport}
        activeFilterCount={activeFilterCount} onOpenFilters={onOpenFilters}
        zoomPct={zoomPct}
      />
      <div className="relative flex-1">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 dark:bg-gray-900/60">
            <Loader2 size={28} className="animate-spin text-brand-500" />
          </div>
        )}
        {!loading && rfNodes.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Build Your Organization</p>
            <p className="max-w-sm text-xs text-gray-500 dark:text-gray-400">
              Your organization structure has not been configured yet. Create your first department, team or position to start building your organization hierarchy.
            </p>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => onQuickAdd(null)}>Create Department</Button>
              {canImportLegacy && (
                <Button size="sm" variant="secondary" onClick={onImportLegacy}>
                  Import from Company &amp; Unit
                </Button>
              )}
            </div>
          </div>
        ) : (
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onNodeClick={handleNodeClick}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onMove={handleMove}
            fitView
            minZoom={0.1}
            maxZoom={2}
          >
            <Background gap={20} />
            <Controls showInteractive={false} />
            <MiniMap pannable zoomable className="!bottom-2 !left-2" />
          </ReactFlow>
        )}
      </div>
    </div>
  );
}

export default function ChartCanvas(props) {
  return (
    <ReactFlowProvider>
      <ChartCanvasInner {...props} />
    </ReactFlowProvider>
  );
}
