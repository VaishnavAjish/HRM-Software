import dagre from "dagre";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 92;

const SPACING_PRESETS = {
  compact: { nodesep: 36, ranksep: 56 },
  balanced: { nodesep: 64, ranksep: 96 },
  expanded: { nodesep: 100, ranksep: 140 },
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
