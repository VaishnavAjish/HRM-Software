import dagre from "dagre";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 92;

const SPACING_PRESETS = {
  compact: { nodesep: 56, ranksep: 80 },
  balanced: { nodesep: 90, ranksep: 120 },
  expanded: { nodesep: 130, ranksep: 170 },
};

/**
 * The backend intentionally returns flat, unpositioned {nodes, edges}
 * (see OrganizationChartService's own docblock) — layout is the client's
 * job. dagre gives each node a rank-based (x, y) center; React Flow wants
 * top-left corners, so we shift by half the node's own box.
 */
export function layoutElements(nodes, edges, { direction = "TB", spacing = "balanced" } = {}) {
  const graph = new dagre.graphlib.Graph();
  graph.setDefaultEdgeLabel(() => ({}));
  const { nodesep, ranksep } = SPACING_PRESETS[spacing] || SPACING_PRESETS.balanced;
  graph.setGraph({ rankdir: direction, nodesep, ranksep, marginx: 24, marginy: 24 });

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
      sourcePosition: isHorizontal ? "right" : "bottom",
      targetPosition: isHorizontal ? "left" : "top",
    };
  });
}

/**
 * Hides descendants of every node id in `collapsedIds` (but keeps the
 * collapsed node itself), so a branch can be folded without discarding its
 * data — expanding again just removes the id from the set.
 */
export function pruneCollapsed(nodes, edges, collapsedIds) {
  if (!collapsedIds || collapsedIds.size === 0) {
    return { nodes, edges, hiddenChildrenOf: new Set() };
  }

  const childrenOf = new Map();
  edges.forEach((edge) => {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source).push(edge.target);
  });

  const hidden = new Set();
  const hiddenChildrenOf = new Set();
  const queue = [];
  // A node's own rendered id can differ from the logical id collapsedIds is
  // keyed by (data.id) — a department duplicated across several branches
  // (one department, multiple branch parents) shares a single collapse
  // state across all of its rendered copies, so match on data.id, not just
  // a direct rendered-id lookup.
  nodes.forEach((n) => {
    const collapseKey = n.data?.id ?? n.id;
    if (!collapsedIds.has(collapseKey)) return;
    if (childrenOf.has(n.id)) {
      hiddenChildrenOf.add(n.id);
      queue.push(...childrenOf.get(n.id));
    }
  });

  while (queue.length) {
    const id = queue.shift();
    if (hidden.has(id)) continue;
    hidden.add(id);
    (childrenOf.get(id) || []).forEach((childId) => queue.push(childId));
  }

  return {
    nodes: nodes.filter((n) => !hidden.has(n.id)),
    edges: edges.filter((e) => !hidden.has(e.source) && !hidden.has(e.target)),
    hiddenChildrenOf,
  };
}

/**
 * Sub-chart / focus mode: walks downward from `rootId` and keeps only that
 * branch. This is also the real fix for "the chart gets huge with more
 * employees" — a focused branch is bounded by that one manager or
 * department's size, not the whole org's, regardless of total headcount.
 */
export function extractSubtree(nodes, edges, rootId) {
  if (!rootId) return { nodes, edges };

  const childrenOf = new Map();
  edges.forEach((edge) => {
    if (!childrenOf.has(edge.source)) childrenOf.set(edge.source, []);
    childrenOf.get(edge.source).push(edge.target);
  });

  const keep = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift();
    (childrenOf.get(id) || []).forEach((childId) => {
      if (!keep.has(childId)) {
        keep.add(childId);
        queue.push(childId);
      }
    });
  }

  return {
    nodes: nodes.filter((n) => keep.has(n.id)),
    edges: edges.filter((e) => keep.has(e.source) && keep.has(e.target)),
  };
}

/**
 * Positions for nodes that just appeared (e.g. a department's employees
 * loading in) computed relative to their already-on-screen parent, without
 * touching any existing node's position — the reason a full dagre re-layout
 * on every incremental change felt like "the view keeps breaking": every
 * node you were just looking at could jump somewhere else. Siblings that
 * arrive together are spread in a simple row under their parent.
 */
export function positionNewChildren(newNodes, edges, existingPositionById, direction = "TB") {
  const positions = new Map();
  const isHorizontal = direction === "LR" || direction === "RL";

  const parentOf = new Map();
  edges.forEach((e) => { if (!parentOf.has(e.target)) parentOf.set(e.target, e.source); });

  const byParent = new Map();
  newNodes.forEach((n) => {
    const parentId = parentOf.get(n.id) ?? "__root__";
    if (!byParent.has(parentId)) byParent.set(parentId, []);
    byParent.get(parentId).push(n);
  });

  const gapX = NODE_WIDTH + 40;
  const gapY = NODE_HEIGHT + 60;

  // Grows as each parent tier gets placed below, so a child whose own
  // *parent* is itself new in this same batch (e.g. a manager and their
  // direct report both loading in together) is anchored to that parent's
  // just-computed position instead of falling back to the canvas origin —
  // the previous behavior, which produced stray lines stretching from the
  // department across to (0, 0).
  const knownPositionById = new Map(existingPositionById);

  const placeChildren = (parentId, children) => {
    const parent = knownPositionById.get(parentId);
    const baseX = parent ? parent.x : 0;
    const baseY = parent ? parent.y : 0;

    children.forEach((child, i) => {
      const offset = (i - (children.length - 1) / 2);
      const position = isHorizontal
        ? { x: baseX + (parent ? NODE_WIDTH + 120 : 0), y: baseY + offset * gapY }
        : { x: baseX + offset * gapX, y: baseY + (parent ? NODE_HEIGHT + 120 : 0) };
      positions.set(child.id, position);
      knownPositionById.set(child.id, position);
    });
  };

  // Place any parent tier whose own position is already known, repeating
  // until nothing new resolves — this is what lets a multi-level batch
  // (department -> new manager -> new subordinate) place correctly in one
  // pass instead of only the first level. Any batch whose parent chain
  // never resolves (shouldn't normally happen) still gets placed at the
  // end, anchored to the canvas origin, rather than silently dropped.
  let progressed = true;
  while (progressed && byParent.size > 0) {
    progressed = false;
    Array.from(byParent.keys()).forEach((parentId) => {
      if (!knownPositionById.has(parentId) && parentId !== "__root__") return;
      placeChildren(parentId, byParent.get(parentId));
      byParent.delete(parentId);
      progressed = true;
    });
  }

  byParent.forEach((children, parentId) => placeChildren(parentId, children));

  return positions;
}
