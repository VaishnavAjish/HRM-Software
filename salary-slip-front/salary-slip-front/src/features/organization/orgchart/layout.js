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
  collapsedIds.forEach((id) => {
    if (childrenOf.has(id)) {
      hiddenChildrenOf.add(id);
      queue.push(...childrenOf.get(id));
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

  byParent.forEach((children, parentId) => {
    const parent = existingPositionById.get(parentId);
    const baseX = parent ? parent.x : 0;
    const baseY = parent ? parent.y : 0;

    children.forEach((child, i) => {
      const offset = (i - (children.length - 1) / 2);
      if (isHorizontal) {
        positions.set(child.id, {
          x: baseX + (parent ? NODE_WIDTH + 120 : 0),
          y: baseY + offset * gapY,
        });
      } else {
        positions.set(child.id, {
          x: baseX + offset * gapX,
          y: baseY + (parent ? NODE_HEIGHT + 120 : 0),
        });
      }
    });
  });

  return positions;
}
