export function collectKeys(nodes, out = []) {
  nodes.forEach((node) => {
    out.push(node.key);
    collectKeys(node.children ?? [], out);
  });
  return out;
}

export function collectAssignable(node, out = []) {
  if (node.assignable) out.push(node);
  (node.children ?? []).forEach((child) => collectAssignable(child, out));
  return out;
}

export function findNode(nodes, key) {
  for (const node of nodes) {
    if (node.key === key) return node;
    const found = findNode(node.children ?? [], key);
    if (found) return found;
  }
  return null;
}

function matchesSearch(node, term) {
  if (!term) return true;
  return (
    node.label.toLowerCase().includes(term) ||
    (node.permissionCode ?? "").toLowerCase().includes(term) ||
    (node.description ?? "").toLowerCase().includes(term) ||
    (node.type ?? "").toLowerCase().includes(term) ||
    (node.sensitivity ?? "").toLowerCase().includes(term)
  );
}

function matchesFacets(node, { state, type, sensitivity }, configuredOf) {
  if (type !== "ALL" && node.type !== type) return false;
  if (sensitivity !== "ALL" && node.sensitivity !== sensitivity) return false;

  if (state !== "ALL") {
    if (state === "INHERITED") return node.source === "INHERITED";
    if (!node.assignable) return false;
    return configuredOf(node) === state;
  }

  return true;
}

/**
 * Filter the tree, keeping any ancestor whose descendant matched.
 *
 * Searching "salary" has to reveal the Salary column buried three levels under
 * Employee Master as well as the Salary module — dropping the ancestors would
 * leave the match unreachable, and dropping the match would hide the one row the
 * administrator was looking for.
 */
export function filterTree(nodes, filters, configuredOf) {
  const term = (filters.search ?? "").trim().toLowerCase();

  const walk = (list) =>
    list.reduce((acc, node) => {
      const children = walk(node.children ?? []);
      const self = matchesSearch(node, term) && matchesFacets(node, filters, configuredOf);

      if (self || children.length > 0) {
        acc.push({ ...node, children, matched: self });
      }

      return acc;
    }, []);

  return walk(nodes);
}

/** Rows to render, honouring collapsed branches. */
export function flattenVisible(nodes, expanded, depth = 0, out = []) {
  nodes.forEach((node) => {
    out.push({ ...node, depth });
    if (expanded.has(node.key)) {
      flattenVisible(node.children ?? [], expanded, depth + 1, out);
    }
  });
  return out;
}

export function summariseSelection(nodes) {
  const critical = nodes.filter((node) => node.sensitivity === "CRITICAL").length;
  const sensitive = nodes.filter((node) => node.sensitivity !== "NORMAL").length;
  return { total: nodes.length, critical, sensitive };
}
