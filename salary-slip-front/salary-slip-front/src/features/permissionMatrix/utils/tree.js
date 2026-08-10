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
/**
 * Flatten the visible tree, tagging each row with the page that governs it.
 *
 * `governingPage` is the nearest page ancestor, or the row itself when it is a
 * page. It exists because reaching a page and acting inside one are different
 * permissions: an action configured Allow under a page whose view is denied
 * cannot be used, and nothing in a row of its own says so. Carrying the page
 * down the tree lets the View column show that constraint on every row.
 *
 * Attached here rather than recomputed per cell so one traversal answers it and
 * the value cannot disagree between columns.
 */
export function flattenVisible(nodes, expanded, depth = 0, out = [], governingPage = null) {
  nodes.forEach((node) => {
    const page = node.type === "page" ? node : governingPage;

    out.push({ ...node, depth, governingPage: page });

    if (expanded.has(node.key)) {
      flattenVisible(node.children ?? [], expanded, depth + 1, out, page);
    }
  });
  return out;
}

export function summariseSelection(nodes) {
  const critical = nodes.filter((node) => node.sensitivity === "CRITICAL").length;
  const sensitive = nodes.filter((node) => node.sensitivity !== "NORMAL").length;
  return { total: nodes.length, critical, sensitive };
}
