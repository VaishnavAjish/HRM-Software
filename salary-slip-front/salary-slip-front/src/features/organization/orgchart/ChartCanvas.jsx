import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap,
  applyNodeChanges, useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import toast from "react-hot-toast";
import {
  Search, SlidersHorizontal, LayoutGrid, Undo2, Redo2, Maximize2, Minimize2, Download,
  ZoomIn, ZoomOut, Loader2, Lock, Unlock, ArrowLeft, Focus,
} from "lucide-react";
import Button from "../../../components/ui/Button";
import { nodeTypes, nodeKindFor } from "./nodes";
import { layoutElements, pruneCollapsed, extractSubtree, positionNewChildren } from "./layout";
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

const ROOT_NODE_ID = "__root__";

function toFlowElements(chart, orgUnits, companies, { collapsedIds, onQuickAdd, onToggleCollapse, onFocus, loadingIds, includeRoot }) {
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
        // A department "has children" to expand into if it has real
        // sub-units (from orgUnits) OR a nonzero employeeCount/position
        // count — the latter two don't require having fetched the actual
        // list yet, so this stays accurate even before anyone expands it.
        hasChildren: Boolean(unit?.hasChildren) || (apiNode.employeeCount || 0) > 0 || (apiNode.metadata?.positionCount || 0) > 0,
        // hasHiddenChildren (set below by pruneCollapsed) only fires once
        // there are real edges to hide — a department that hasn't been
        // expanded yet has no employee edges at all, so it would never look
        // "collapsed". isCollapsed reads collapsedIds directly instead, so
        // the chevron points the right way even before the first fetch.
        isCollapsed: collapsedIds.has(apiNode.id),
        loadingChildren: loadingIds?.has(apiNode.id) || false,
        reportCount: reportCounts.get(apiNode.id) || 0,
        metadata: { ...(apiNode.metadata || {}), parentId: unit?.parentId ?? null },
        onQuickAdd,
        onToggleCollapse,
        onFocus: kind === "department" ? onFocus : undefined,
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

  // Every department was rendering as its own disconnected island — nothing
  // tied them together into one tree. Root-level departments (no parent
  // edge of their own) attach to their real company, and companies attach
  // to a single organization root, so the whole chart reads as one
  // structure. Display-only, like the position synthesis above; skipped
  // entirely in focus/sub-chart mode; the department's own real company_id
  // (from OrganizationChartService) decides which company it hangs from —
  // one still hangs off the root directly if it has none.
  if (includeRoot) {
    const rootLevelDepartments = nodes.filter((n) => n.data.type === "department" && !hasIncoming.has(n.id));

    if (rootLevelDepartments.length > 0) {
      const sumField = (deps, field) => deps.reduce((sum, n) => sum + (n.data[field] || 0), 0);

      nodes.push({
        id: ROOT_NODE_ID,
        type: "department",
        position: { x: 0, y: 0 },
        data: {
          id: ROOT_NODE_ID, type: "root", name: "Organization", title: "All Companies",
          employeeCount: sumField(rootLevelDepartments, "employeeCount"),
          approvedHeadcount: sumField(rootLevelDepartments, "approvedHeadcount"),
          vacancy: sumField(rootLevelDepartments, "vacancy"),
          isActive: true, metadata: {}, hasChildren: false, isCollapsed: false,
        },
      });

      const companyIdsInUse = new Set(
        rootLevelDepartments.map((n) => n.data.metadata?.companyId).filter(Boolean),
      );

      (companies || []).forEach((c) => {
        if (!companyIdsInUse.has(c.id)) return;
        const companyNodeId = `company_${c.id}`;
        const deptsUnderCompany = rootLevelDepartments.filter((n) => n.data.metadata?.companyId === c.id);
        nodes.push({
          id: companyNodeId,
          type: "department",
          position: { x: 0, y: 0 },
          data: {
            id: companyNodeId, type: "company", name: c.name, title: "Company",
            employeeCount: sumField(deptsUnderCompany, "employeeCount"),
            approvedHeadcount: sumField(deptsUnderCompany, "approvedHeadcount"),
            vacancy: sumField(deptsUnderCompany, "vacancy"),
            isActive: true, metadata: {}, hasChildren: false, isCollapsed: false,
          },
        });
        edges.push({
          id: `edge_root_${companyNodeId}`, source: ROOT_NODE_ID, target: companyNodeId,
          type: "smoothstep", style: { stroke: "#9ca3af", strokeWidth: 1.5 },
        });
      });

      rootLevelDepartments.forEach((n) => {
        const companyId = n.data.metadata?.companyId;
        const parentId = companyId ? `company_${companyId}` : ROOT_NODE_ID;
        edges.push({
          id: `edge_synthetic_root_${parentId}_${n.id}`, source: parentId, target: n.id,
          type: "smoothstep", style: { stroke: "#9ca3af", strokeWidth: 1.5 },
        });
      });
    }
  }

  const pruned = pruneCollapsed(nodes, edges, collapsedIds);
  pruned.nodes.forEach((n) => { n.data.hasHiddenChildren = pruned.hiddenChildrenOf.has(n.id); });
  return pruned;
}

function Toolbar({
  searchValue, onSearchChange, direction, onChangeDirection, spacing, onChangeSpacing,
  history, onFullscreen, isFullscreen, onExport, activeFilterCount, onOpenFilters, zoomPct,
  locked, onToggleLock, canUnlock,
}) {
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const { zoomIn, zoomOut } = useReactFlow();

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white p-2 dark:border-gray-700 dark:bg-gray-800">
      {canUnlock && (
        <Button
          variant={locked ? "secondary" : "success"}
          size="sm"
          title={locked ? "Chart is locked — click to unlock editing" : "Chart is unlocked — click to lock again"}
          onClick={onToggleLock}
        >
          {locked ? <Lock size={14} /> : <Unlock size={14} />}
          {locked ? "Locked" : "Unlocked"}
        </Button>
      )}

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
              <button key={d.value} onClick={() => { onChangeDirection(d.value); setLayoutOpen(false); }}
                className={`block w-full rounded px-2 py-1 text-left text-xs ${direction === d.value ? "bg-brand-50 text-brand-700 dark:bg-brand-900/30" : "hover:bg-gray-100 dark:hover:bg-gray-700"}`}>
                {d.label}
              </button>
            ))}
            <p className="mt-1 px-1 text-[10px] font-semibold uppercase text-gray-400">Spacing</p>
            {SPACINGS.map((s) => (
              <button key={s.value} onClick={() => { onChangeSpacing(s.value); setLayoutOpen(false); }}
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

      <Button variant="secondary" size="sm" title={isFullscreen ? "Exit fullscreen" : "Fullscreen"} onClick={onFullscreen}>
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
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
  chart, orgUnits, companies, selectedNodeId, onSelectNode, onQuickAdd, onOpenFilters, activeFilterCount,
  searchValue, onSearchChange, history, onConnectNodes, onDragMove, loading, onImportLegacy, canImportLegacy,
  locked, onToggleLock, canUnlock, onLoadDepartmentEmployees,
}) {
  const [direction, setDirection] = useState("TB");
  const [spacing, setSpacing] = useState("balanced");
  // Every department with anything to show starts collapsed (seeded below,
  // once per fresh chart) — nothing under it has even been fetched yet.
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  // Per-department employee nodes/edges, fetched lazily and cached here once
  // loaded so re-collapsing/re-expanding the same department is instant and
  // doesn't refetch. Keyed by the department's chart node id (`org_unit_N`).
  const [loadedEmployees, setLoadedEmployees] = useState(() => new Map());
  const [loadingIds, setLoadingIds] = useState(() => new Set());
  // Sub-chart / focus mode: when set, only this node and its descendants
  // render — bounded by that one branch's size regardless of total org
  // headcount, and the fix for "the chart is huge with more employees".
  const [focusNodeId, setFocusNodeId] = useState(null);
  const [rfNodes, setRfNodes] = useState([]);
  const [rfEdges, setRfEdges] = useState([]);
  const [zoomPct, setZoomPct] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef(null);
  const hasSeededCollapseRef = useRef(false);
  // Forces the next position-sync pass to run a full dagre layout instead
  // of the incremental one — set by the Layout menu, entering/exiting
  // focus, and expand/collapse (all deliberate structural actions, see the
  // effects below). A background data refresh that doesn't touch any of
  // those never sets it, which is what keeps a manual drag from being
  // silently discarded by an unrelated poll tick.
  const forceRelayoutRef = useRef(true);
  // Separate from the above on purpose: recomputing positions and moving
  // the camera are different things. Expand/collapse needs a fresh dagre
  // pass (so nothing overlaps) but must NOT also yank the viewport back to
  // "fit everything" every time — that's what made zoom feel like it
  // "didn't work": zoom in, expand any department, and the camera would
  // snap back out. Only focus mode, the Layout menu, and the first paint
  // actually warrant moving the camera.
  const forceFitViewRef = useRef(true);
  const { getIntersectingNodes, getViewport, fitView } = useReactFlow();

  // Real headcount here runs into the thousands, so a department's
  // employees are fetched only the moment someone actually expands (or
  // focuses into) it — never all at once.
  const ensureEmployeesLoaded = useCallback((id) => {
    if (loadedEmployees.has(id) || !onLoadDepartmentEmployees) return;
    const { rawId } = parseNodeId(id);
    setLoadingIds((ids) => new Set(ids).add(id));
    onLoadDepartmentEmployees(rawId)
      .then((result) => {
        setLoadedEmployees((prevLoaded) => new Map(prevLoaded).set(id, result || { nodes: [], edges: [] }));
      })
      .catch(() => {
        setLoadedEmployees((prevLoaded) => new Map(prevLoaded).set(id, { nodes: [], edges: [] }));
      })
      .finally(() => {
        setLoadingIds((ids) => { const next = new Set(ids); next.delete(id); return next; });
      });
  }, [loadedEmployees, onLoadDepartmentEmployees]);

  // Collapsing again just hides the (now-cached) nodes; it doesn't refetch
  // or discard them.
  const toggleCollapse = useCallback((id) => {
    const wasCollapsed = collapsedIds.has(id);
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    if (wasCollapsed) ensureEmployeesLoaded(id);
  }, [collapsedIds, ensureEmployeesLoaded]);

  const enterFocus = useCallback((id) => {
    setCollapsedIds((prev) => { if (!prev.has(id)) return prev; const next = new Set(prev); next.delete(id); return next; });
    ensureEmployeesLoaded(id);
    setFocusNodeId(id);
  }, [ensureEmployeesLoaded]);

  const exitFocus = useCallback(() => {
    setFocusNodeId(null);
  }, []);

  // Ref writes belong in an effect, not in the callbacks above (those get
  // passed into toFlowElements/rendered JSX) — this is what actually forces
  // a full relayout (and, for focus, a camera move) the moment focus mode
  // changes.
  useEffect(() => {
    forceRelayoutRef.current = true;
    forceFitViewRef.current = true;
  }, [focusNodeId]);

  // Expanding or collapsing a department is a deliberate structural change,
  // not an incidental background refresh — it needs a real dagre pass every
  // time. Without this, expanding two departments independently positioned
  // each one's new employees under its own parent with no idea the other
  // department's new row existed too, so they could land on top of each
  // other; collapsing could leave stale edge/handle remnants behind instead
  // of a clean redraw. Background polling doesn't touch collapsedIds, so
  // this doesn't affect the "don't discard a manual drag on refresh" fix.
  // Deliberately NOT touching forceFitViewRef here — recomputing positions
  // shouldn't also yank the camera away from wherever you're looking.
  useEffect(() => {
    forceRelayoutRef.current = true;
  }, [collapsedIds]);

  // Seeds the initial collapsed set once per fresh chart load — anything
  // with real children (per hasChildren below) starts folded so a first
  // paint never depends on how many employees exist.
  useEffect(() => {
    if (hasSeededCollapseRef.current || !chart?.nodes?.length) return undefined;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      hasSeededCollapseRef.current = true;
      const defaults = new Set(
        chart.nodes
          .filter((n) => n.type === "department" && ((n.employeeCount || 0) > 0 || (n.metadata?.positionCount || 0) > 0))
          .map((n) => n.id),
      );
      if (defaults.size > 0) setCollapsedIds(defaults);
    });
    return () => { active = false; };
  }, [chart]);

  const mergedChart = useMemo(() => {
    if (loadedEmployees.size === 0) return chart;
    const extraNodes = [];
    const extraEdges = [];
    loadedEmployees.forEach((result) => {
      extraNodes.push(...(result.nodes || []));
      extraEdges.push(...(result.edges || []));
    });
    return {
      ...chart,
      nodes: [...(chart.nodes || []), ...extraNodes],
      edges: [...(chart.edges || []), ...extraEdges],
    };
  }, [chart, loadedEmployees]);

  const focusedNode = focusNodeId ? mergedChart.nodes.find((n) => n.id === focusNodeId) : null;

  const focusedChart = useMemo(() => {
    if (!focusNodeId) return mergedChart;
    const { nodes, edges } = extractSubtree(mergedChart.nodes, mergedChart.edges, focusNodeId);
    return { ...mergedChart, nodes, edges };
  }, [mergedChart, focusNodeId]);

  const laidOut = useMemo(
    () => toFlowElements(focusedChart, orgUnits, companies, {
      collapsedIds, onToggleCollapse: toggleCollapse, onQuickAdd: locked ? undefined : onQuickAdd,
      onFocus: enterFocus, loadingIds, includeRoot: !focusNodeId,
    }),
    [focusedChart, orgUnits, companies, collapsedIds, onQuickAdd, toggleCollapse, enterFocus, locked, loadingIds, focusNodeId],
  );

  // A full dagre layout recomputes every node's position from scratch, so
  // running it on every single change (even an unrelated background
  // refresh or selecting a node) meant a manual drag could be silently
  // discarded. A full layout now runs for deliberate structural actions
  // (Layout menu, focus, expand/collapse — anything that sets
  // forceRelayoutRef, plus a genuinely new non-employee node appearing) so
  // the tree is always laid out correctly and nothing overlaps; a plain
  // background refresh with nothing structurally new stays incremental and
  // keeps existing nodes — including anything dragged — exactly where they are.
  useEffect(() => {
    let active = true;

    // Root/company nodes are pure UI synthesis, recomputed fresh every time
    // toFlowElements runs rather than persisting like real chart data — so
    // the first moment they (or any other structural node) appear, they
    // have no established position to anchor incremental placement to, and
    // end up scattered wherever the fallback math puts them. Only a newly
    // loaded department's *employees* should stay lightweight/incremental;
    // any other new node forces a real dagre pass so it lands correctly
    // relative to everything else.
    const isFirstPaint = rfNodes.length === 0;
    const prevIds = new Set(rfNodes.map((n) => n.id));
    const hasNewStructuralNode = laidOut.nodes.some((n) => !prevIds.has(n.id) && n.type !== "employee");
    const willFullyRelayout = forceRelayoutRef.current || isFirstPaint || hasNewStructuralNode;
    // Deliberately narrower than willFullyRelayout — expand/collapse (and a
    // structural node quietly appearing) still gets a correct dagre pass
    // above, but must not also move the camera; see forceFitViewRef.
    const willFitView = forceFitViewRef.current || isFirstPaint;

    Promise.resolve().then(() => {
      if (!active) return;
      const isHorizontal = direction === "LR" || direction === "RL";

      setRfNodes((prev) => {
        if (willFullyRelayout) {
          forceRelayoutRef.current = false;
          const positioned = layoutElements(laidOut.nodes, laidOut.edges, { direction, spacing });
          return positioned.map((n) => ({ ...n, selected: n.id === selectedNodeId }));
        }

        const prevById = new Map(prev.map((n) => [n.id, n]));
        const newNodes = laidOut.nodes.filter((n) => !prevById.has(n.id));
        const existingPositionById = new Map(prev.map((n) => [n.id, n.position]));
        const newPositions = positionNewChildren(newNodes, laidOut.edges, existingPositionById, direction);

        return laidOut.nodes.map((n) => {
          const prior = prevById.get(n.id);
          if (prior) {
            return {
              ...n, position: prior.position,
              sourcePosition: prior.sourcePosition, targetPosition: prior.targetPosition,
              selected: n.id === selectedNodeId,
            };
          }
          return {
            ...n,
            position: newPositions.get(n.id) || { x: 0, y: 0 },
            sourcePosition: isHorizontal ? "right" : "bottom",
            targetPosition: isHorizontal ? "left" : "top",
            selected: n.id === selectedNodeId,
          };
        });
      });

      setRfEdges(laidOut.edges);

      // React Flow's `fitView` prop only auto-fits on the canvas's very
      // first mount, not on later updates — without this, entering/exiting
      // focus mode or picking a new layout direction would recompute
      // positions but leave the viewport looking at the old, now-wrong area.
      if (willFitView) {
        forceFitViewRef.current = false;
        requestAnimationFrame(() => fitView({ duration: 300, padding: 0.2 }));
      }
    });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [laidOut, direction, spacing, selectedNodeId, fitView]);

  const relayout = useCallback((patch) => {
    forceRelayoutRef.current = true;
    forceFitViewRef.current = true;
    if (patch.direction !== undefined) setDirection(patch.direction);
    if (patch.spacing !== undefined) setSpacing(patch.spacing);
  }, []);

  const onNodesChange = useCallback((changes) => {
    setRfNodes((nds) => applyNodeChanges(changes, nds));
  }, []);

  const handleNodeClick = useCallback((_event, node) => onSelectNode(node), [onSelectNode]);

  const handleNodeDoubleClick = useCallback((_event, node) => {
    // node.type is the *rendering* kind (department/position/employee) — the
    // synthetic root/company nodes render with that same kind but don't
    // exist in the underlying chart data, so focusing into one would find
    // nothing to extract a subtree from. node.data.type is the real
    // backend-sourced type, which those synthetic nodes deliberately don't
    // have ("root"/"company" instead of "department").
    if (node.data?.type === "department" && node.id !== focusNodeId) enterFocus(node.id);
  }, [enterFocus, focusNodeId]);

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

  // Was a bare, unconditional requestFullscreen() call with no fallback,
  // no error handling, and no way to exit — so on any browser needing a
  // vendor-prefixed method, or any rejection (blocked by an embedding
  // frame's Permission Policy, denied because the click didn't register as
  // a direct user gesture, etc.), the button did nothing and gave no signal
  // why. Now a real toggle, with prefixed fallbacks and a visible error
  // instead of silence.
  const toggleFullscreen = useCallback(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const currentFullscreenEl =
      document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;

    if (currentFullscreenEl === el) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
      if (!exit) return;
      Promise.resolve(exit.call(document)).catch(() => {});
      return;
    }

    const request = el.requestFullscreen || el.webkitRequestFullscreen || el.msRequestFullscreen;
    if (!request) {
      toast.error("Fullscreen isn't supported in this browser");
      return;
    }

    Promise.resolve(request.call(el)).catch(() => {
      toast.error("Couldn't enter fullscreen — this page may be blocked from doing so here");
    });
  }, []);

  useEffect(() => {
    const onChange = () => {
      const current = document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement;
      setIsFullscreen(current === wrapperRef.current);
    };
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    document.addEventListener("MSFullscreenChange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
      document.removeEventListener("MSFullscreenChange", onChange);
    };
  }, []);

  const runExport = async (format) => {
    // Exports whatever is actually loaded (structural nodes plus any
    // department someone has expanded) rather than forcing a fetch of
    // everyone just to export — same reasoning as the lazy-load itself.
    const viewportEl = wrapperRef.current?.querySelector(".react-flow__viewport");
    if (format === "CSV") return exportCsv(mergedChart);
    if (format === "JSON") return exportJson(mergedChart);
    if (format === "Excel") return exportExcel(mergedChart);
    if (!viewportEl) return;
    if (format === "PNG") return exportPng(viewportEl, mergedChart);
    if (format === "PDF") return exportPdf(viewportEl, mergedChart);
    if (format === "SVG") return exportSvg(viewportEl, mergedChart);
    return undefined;
  };

  return (
    <div
      ref={wrapperRef}
      className={`flex h-full flex-col bg-gray-50 dark:bg-gray-900 ${isFullscreen ? "!fixed !inset-0 !z-[999] !h-screen !w-screen" : ""}`}
    >
      <Toolbar
        searchValue={searchValue} onSearchChange={onSearchChange}
        direction={direction} onChangeDirection={(d) => relayout({ direction: d })}
        spacing={spacing} onChangeSpacing={(s) => relayout({ spacing: s })}
        history={history} onFullscreen={toggleFullscreen} isFullscreen={isFullscreen} onExport={runExport}
        activeFilterCount={activeFilterCount} onOpenFilters={onOpenFilters}
        zoomPct={zoomPct}
        locked={locked} onToggleLock={onToggleLock} canUnlock={canUnlock}
      />
      {focusedNode && (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-brand-50/60 px-3 py-1.5 text-xs dark:border-gray-700 dark:bg-brand-900/10">
          <Button size="sm" variant="ghost" onClick={exitFocus}>
            <ArrowLeft size={13} /> All Departments
          </Button>
          <span className="text-gray-400">/</span>
          <span className="flex items-center gap-1 font-medium text-gray-700 dark:text-gray-200">
            <Focus size={12} /> {focusedNode.name}
          </span>
          <span className="text-gray-400">— sub-chart view</span>
        </div>
      )}
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
              {!locked && <Button size="sm" onClick={() => onQuickAdd(null)}>Create Department</Button>}
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
            onNodeDoubleClick={handleNodeDoubleClick}
            onNodeDragStop={handleNodeDragStop}
            onConnect={handleConnect}
            onMove={handleMove}
            fitView
            minZoom={0.1}
            maxZoom={2}
            nodesDraggable={!locked}
            nodesConnectable={!locked}
          >
            <Background gap={20} />
            <Controls showInteractive={false} position="bottom-right" />
            <MiniMap
              pannable
              zoomable
              position="bottom-left"
              style={{ width: 180, height: 130 }}
              nodeStrokeWidth={0}
              nodeColor={(n) => {
                if (n.type === "employee") return "#a5b4fc";
                if (n.type === "position") return "#fcd34d";
                if (n.data?.type === "company" || n.data?.type === "root") return "#6366f1";
                return "#818cf8";
              }}
            />
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
